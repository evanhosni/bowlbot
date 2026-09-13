#!/usr/bin/env node
// One-shot conversion: live Heroku Postgres -> new SQLite file.
//
// Usage:
//   DATABASE_URL='postgres://...' node scripts/convert-from-postgres.js ./data/bowlbot.sqlite
//
// - Read-only against Postgres: everything runs inside one
//   REPEATABLE READ, READ ONLY transaction, so it sees a consistent snapshot
//   and cannot write even by accident.
// - Refuses to run if the destination file already exists. Never point it at
//   anything live.
// - Creates the SQLite schema through db/schema.js, the same code path the
//   bot uses at boot, so the result is exactly what the bot expects.
// - Prints row counts per table on both sides and exits non-zero if they
//   differ.
//
// Type handling:
//   servers.id / bowls.serverId (BIGINT) are selected with ::text so they
//   arrive as strings. node-postgres also returns int8 as text by default;
//   the script asserts the JS type anyway because Discord snowflakes exceed
//   2^53 and a Number would silently corrupt them.
//   bowls.schmokedAt (TIMESTAMPTZ) is converted to epoch milliseconds by
//   Postgres itself via EXTRACT(EPOCH FROM ...), which is timezone-independent
//   for timestamptz, so nothing depends on the local clock or session TimeZone.
//   servers.rank (BOOLEAN) becomes 0/1.

const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { migrate } = require("../db/schema");

const SERVERS_SQL = `
  SELECT id::text AS id, name, rank
  FROM servers
  ORDER BY id`;

const BOWLS_SQL = `
  SELECT id,
         CASE WHEN "schmokedAt" IS NULL THEN NULL
              ELSE round(EXTRACT(EPOCH FROM "schmokedAt") * 1000)::bigint::text
         END AS "schmokedAtMs",
         "serverId"::text AS "serverId"
  FROM bowls
  ORDER BY id`;

const COLUMNS_SQL = `
  SELECT table_name, column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name IN ('servers', 'bowls')
  ORDER BY table_name, ordinal_position`;

function assertString(value, what) {
  if (value !== null && typeof value !== "string") {
    throw new Error(`${what} arrived as ${typeof value}, expected string. Refusing to continue.`);
  }
}

/**
 * @param {{ query(sql: string): Promise<{rows: any[]}> }} client  connected pg client
 * @param {string} destPath  SQLite file to create (must not exist)
 */
async function convert(client, destPath) {
  if (fs.existsSync(destPath)) {
    throw new Error(`destination already exists: ${destPath}. This script only writes a brand-new file.`);
  }
  fs.mkdirSync(path.dirname(path.resolve(destPath)), { recursive: true });

  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  let servers, bowls, columns;
  try {
    columns = (await client.query(COLUMNS_SQL)).rows;
    servers = (await client.query(SERVERS_SQL)).rows;
    bowls = (await client.query(BOWLS_SQL)).rows;
  } finally {
    await client.query("ROLLBACK");
  }

  console.log("Postgres columns:");
  for (const c of columns) {
    console.log(
      `  ${c.table_name}.${c.column_name}  ${c.data_type}  ${c.is_nullable === "YES" ? "NULL" : "NOT NULL"}` +
        (c.column_default ? `  default ${c.column_default}` : ""),
    );
  }

  // Validate before touching disk.
  const nullTimestamps = bowls.filter((b) => b.schmokedAtMs === null).length;
  if (nullTimestamps > 0) {
    throw new Error(`${nullTimestamps} bowls have NULL schmokedAt; SQLite schema requires NOT NULL. Decide how to handle these first.`);
  }
  for (const s of servers) {
    assertString(s.id, `servers.id ${JSON.stringify(s.id)}`);
    if (!/^\d+$/.test(s.id)) throw new Error(`servers.id is not a digit string: ${s.id}`);
    if (typeof s.rank !== "boolean") throw new Error(`servers.rank arrived as ${typeof s.rank}, expected boolean`);
  }
  for (const b of bowls) {
    assertString(b.serverId, `bowls.serverId for bowl ${b.id}`);
    assertString(b.schmokedAtMs, `bowls.schmokedAt for bowl ${b.id}`);
    if (!Number.isSafeInteger(Number(b.schmokedAtMs))) throw new Error(`epoch ms out of range for bowl ${b.id}: ${b.schmokedAtMs}`);
  }

  const db = new DatabaseSync(destPath);
  try {
    db.exec("PRAGMA foreign_keys = ON");
    migrate(db);

    const insServer = db.prepare("INSERT INTO servers (id, name, rank) VALUES (?, ?, ?)");
    const insBowl = db.prepare("INSERT INTO bowls (id, schmokedAt, serverId) VALUES (?, ?, ?)");

    db.exec("BEGIN");
    try {
      for (const s of servers) insServer.run(s.id, s.name, s.rank ? 1 : 0);
      for (const b of bowls) insBowl.run(b.id, Number(b.schmokedAtMs), b.serverId);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }

    // --- verification ---------------------------------------------------------
    const sq = {
      servers: db.prepare("SELECT COUNT(*) n FROM servers").get().n,
      bowls: db.prepare("SELECT COUNT(*) n FROM bowls").get().n,
      ranked: db.prepare("SELECT COUNT(*) n FROM servers WHERE rank = 1").get().n,
      maxBowlId: db.prepare("SELECT MAX(id) m FROM bowls").get().m,
      seq: db.prepare("SELECT seq FROM sqlite_sequence WHERE name = 'bowls'").get()?.seq ?? null,
      minTs: db.prepare("SELECT MIN(schmokedAt) m FROM bowls").get().m,
      maxTs: db.prepare("SELECT MAX(schmokedAt) m FROM bowls").get().m,
      nullServer: db.prepare("SELECT COUNT(*) n FROM bowls WHERE serverId IS NULL").get().n,
    };
    const pg = {
      servers: servers.length,
      bowls: bowls.length,
      ranked: servers.filter((s) => s.rank).length,
      maxBowlId: bowls.length ? Math.max(...bowls.map((b) => b.id)) : null,
      minTs: bowls.length ? Math.min(...bowls.map((b) => Number(b.schmokedAtMs))) : null,
      maxTs: bowls.length ? Math.max(...bowls.map((b) => Number(b.schmokedAtMs))) : null,
      nullServer: bowls.filter((b) => b.serverId === null).length,
    };

    const fmt = (ms) => (ms === null ? "null" : `${ms} (${new Date(ms).toISOString()})`);
    console.log("\nRow counts and checks (Postgres -> SQLite):");
    console.log(`  servers            ${pg.servers} -> ${sq.servers}`);
    console.log(`  bowls              ${pg.bowls} -> ${sq.bowls}`);
    console.log(`  servers.rank=true  ${pg.ranked} -> ${sq.ranked}`);
    console.log(`  max bowl id        ${pg.maxBowlId} -> ${sq.maxBowlId}  (sqlite_sequence: ${sq.seq})`);
    console.log(`  bowls w/ null srv  ${pg.nullServer} -> ${sq.nullServer}`);
    console.log(`  earliest bowl      ${fmt(pg.minTs)} -> ${fmt(sq.minTs)}`);
    console.log(`  latest bowl        ${fmt(pg.maxTs)} -> ${fmt(sq.maxTs)}`);

    const mismatches = ["servers", "bowls", "ranked", "maxBowlId", "minTs", "maxTs", "nullServer"].filter(
      (k) => pg[k] !== sq[k],
    );
    if (sq.maxBowlId !== null && sq.seq !== sq.maxBowlId) mismatches.push("sqlite_sequence");
    if (mismatches.length) {
      throw new Error(`verification failed on: ${mismatches.join(", ")}`);
    }
    console.log(`\nOK. Wrote ${destPath} (${fs.statSync(destPath).size} bytes).`);
    return { pg, sq };
  } finally {
    db.close();
  }
}

async function main() {
  require("dotenv").config();
  const url = process.env.DATABASE_URL;
  const dest = process.argv[2];
  if (!url || !dest) {
    console.error("usage: DATABASE_URL='postgres://...' node scripts/convert-from-postgres.js <dest.sqlite>");
    process.exit(2);
  }
  const { Client } = require("pg");
  // Heroku Postgres requires TLS and presents a certificate that does not
  // verify against public roots. Set PGSSLMODE=disable for a local Postgres.
  const ssl = process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false };
  const client = new Client({ connectionString: url, ssl });
  await client.connect();
  try {
    await convert(client, dest);
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error("\nconversion failed:", err.message);
    process.exit(1);
  });
}

module.exports = { convert };
