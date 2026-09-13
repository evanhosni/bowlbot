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
//   anything live. If the run fails partway, the file it created is removed.
// - Reads Postgres in keyset pages (ORDER BY id ... LIMIT n) and inserts row
//   by row inside a single SQLite transaction, so memory stays flat no matter
//   how many bowls there are. Prints a progress line every few thousand rows.
// - Creates the SQLite schema through db/schema.js, the same code path the
//   bot uses at boot, so the result is exactly what the bot expects.
// - Verifies counts and aggregates on both sides, computed by each database
//   engine in SQL, and exits non-zero if anything differs.
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

const EPOCH_MS = `round(EXTRACT(EPOCH FROM "schmokedAt") * 1000)::bigint`;

const SQL = {
  columns: `
    SELECT table_name, column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name IN ('servers', 'bowls')
    ORDER BY table_name, ordinal_position`,

  serversPage: `
    SELECT id::text AS id, name, rank
    FROM servers
    WHERE id > $1::bigint
    ORDER BY id
    LIMIT $2`,

  bowlsPage: `
    SELECT id,
           CASE WHEN "schmokedAt" IS NULL THEN NULL ELSE ${EPOCH_MS}::text END AS "schmokedAtMs",
           "serverId"::text AS "serverId"
    FROM bowls
    WHERE id > $1
    ORDER BY id
    LIMIT $2`,

  // Aggregates computed by Postgres over the same snapshot, for verification.
  serversAgg: `
    SELECT count(*)::int AS n,
           count(*) FILTER (WHERE rank)::int AS ranked
    FROM servers`,
  bowlsAgg: `
    SELECT count(*)::int AS n,
           max(id) AS "maxId",
           min(${EPOCH_MS})::text AS "minTs",
           max(${EPOCH_MS})::text AS "maxTs",
           count(*) FILTER (WHERE "serverId" IS NULL)::int AS "nullServer",
           count(*) FILTER (WHERE "schmokedAt" IS NULL)::int AS "nullTs"
    FROM bowls`,
};

function assertString(value, what) {
  if (value !== null && typeof value !== "string") {
    throw new Error(`${what} arrived as ${typeof value}, expected string. Refusing to continue.`);
  }
}

/**
 * @param {{ query(sql: string, params?: any[]): Promise<{rows: any[]}> }} client  connected pg client
 * @param {string} destPath  SQLite file to create (must not exist)
 * @param {{ pageSize?: number, progressEvery?: number, log?: (s: string) => void }} [opts]
 */
async function convert(client, destPath, opts = {}) {
  const pageSize = opts.pageSize ?? 5000;
  const progressEvery = opts.progressEvery ?? 5000;
  const log = opts.log ?? console.log;

  if (fs.existsSync(destPath)) {
    throw new Error(`destination already exists: ${destPath}. This script only writes a brand-new file.`);
  }
  fs.mkdirSync(path.dirname(path.resolve(destPath)), { recursive: true });

  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  let db;
  try {
    const columns = (await client.query(SQL.columns)).rows;
    log("Postgres columns:");
    for (const c of columns) {
      log(
        `  ${c.table_name}.${c.column_name}  ${c.data_type}  ${c.is_nullable === "YES" ? "NULL" : "NOT NULL"}` +
          (c.column_default ? `  default ${c.column_default}` : ""),
      );
    }

    // Aggregates first: cheap, and lets us refuse NULL timestamps before
    // creating any file.
    const pgServers = (await client.query(SQL.serversAgg)).rows[0];
    const pgBowls = (await client.query(SQL.bowlsAgg)).rows[0];
    log(`\nPostgres reports ${pgServers.n} servers, ${pgBowls.n} bowls.`);
    if (pgBowls.nullTs > 0) {
      throw new Error(
        `${pgBowls.nullTs} bowls have NULL schmokedAt; SQLite schema requires NOT NULL. Decide how to handle these first.`,
      );
    }

    db = new DatabaseSync(destPath);
    db.exec("PRAGMA foreign_keys = ON");
    db.exec("PRAGMA synchronous = OFF"); // bulk load into a brand-new file; nothing to lose on crash
    migrate(db);

    const insServer = db.prepare("INSERT INTO servers (id, name, rank) VALUES (?, ?, ?)");
    const insBowl = db.prepare("INSERT INTO bowls (id, schmokedAt, serverId) VALUES (?, ?, ?)");

    db.exec("BEGIN");
    try {
      // --- servers: keyset pagination on bigint id ------------------------------
      let copied = 0;
      let lastId = "0";
      for (;;) {
        const { rows } = await client.query(SQL.serversPage, [lastId, pageSize]);
        if (rows.length === 0) break;
        for (const s of rows) {
          assertString(s.id, `servers.id ${JSON.stringify(s.id)}`);
          if (!/^\d+$/.test(s.id)) throw new Error(`servers.id is not a digit string: ${s.id}`);
          if (typeof s.rank !== "boolean") throw new Error(`servers.rank arrived as ${typeof s.rank}, expected boolean`);
          insServer.run(s.id, s.name, s.rank ? 1 : 0);
          copied++;
        }
        lastId = rows[rows.length - 1].id;
        if (rows.length < pageSize) break;
      }
      log(`servers: ${copied} rows copied`);

      // --- bowls: keyset pagination on integer id -------------------------------
      copied = 0;
      let lastBowlId = 0;
      let nextProgress = progressEvery;
      for (;;) {
        const { rows } = await client.query(SQL.bowlsPage, [lastBowlId, pageSize]);
        if (rows.length === 0) break;
        for (const b of rows) {
          assertString(b.serverId, `bowls.serverId for bowl ${b.id}`);
          assertString(b.schmokedAtMs, `bowls.schmokedAt for bowl ${b.id}`);
          if (b.schmokedAtMs === null) throw new Error(`bowl ${b.id} has NULL schmokedAt`);
          const ms = Number(b.schmokedAtMs);
          if (!Number.isSafeInteger(ms)) throw new Error(`epoch ms out of range for bowl ${b.id}: ${b.schmokedAtMs}`);
          insBowl.run(b.id, ms, b.serverId);
          copied++;
          if (copied >= nextProgress) {
            log(`bowls: ${copied} / ${pgBowls.n} rows copied (id ${b.id})`);
            nextProgress += progressEvery;
          }
        }
        lastBowlId = rows[rows.length - 1].id;
        if (rows.length < pageSize) break;
      }
      log(`bowls: ${copied} rows copied`);

      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }

    // --- verification: aggregates computed by each engine in SQL ---------------
    const sqServers = db.prepare("SELECT COUNT(*) AS n, SUM(rank) AS ranked FROM servers").get();
    const sqBowls = db
      .prepare(
        `SELECT COUNT(*) AS n, MAX(id) AS maxId, MIN(schmokedAt) AS minTs, MAX(schmokedAt) AS maxTs,
                SUM(serverId IS NULL) AS nullServer
         FROM bowls`,
      )
      .get();
    const seq = db.prepare("SELECT seq FROM sqlite_sequence WHERE name = 'bowls'").get()?.seq ?? null;

    const pg = {
      servers: pgServers.n,
      ranked: pgServers.ranked,
      bowls: pgBowls.n,
      maxBowlId: pgBowls.maxId,
      minTs: pgBowls.minTs === null ? null : Number(pgBowls.minTs),
      maxTs: pgBowls.maxTs === null ? null : Number(pgBowls.maxTs),
      nullServer: pgBowls.nullServer,
    };
    const sq = {
      servers: sqServers.n,
      ranked: sqServers.ranked ?? 0,
      bowls: sqBowls.n,
      maxBowlId: sqBowls.maxId,
      minTs: sqBowls.minTs,
      maxTs: sqBowls.maxTs,
      nullServer: sqBowls.nullServer ?? 0,
    };

    const fmt = (ms) => (ms === null ? "null" : `${ms} (${new Date(ms).toISOString()})`);
    log("\nRow counts and checks (Postgres -> SQLite):");
    log(`  servers            ${pg.servers} -> ${sq.servers}`);
    log(`  bowls              ${pg.bowls} -> ${sq.bowls}`);
    log(`  servers.rank=true  ${pg.ranked} -> ${sq.ranked}`);
    log(`  max bowl id        ${pg.maxBowlId} -> ${sq.maxBowlId}  (sqlite_sequence: ${seq})`);
    log(`  bowls w/ null srv  ${pg.nullServer} -> ${sq.nullServer}`);
    log(`  earliest bowl      ${fmt(pg.minTs)} -> ${fmt(sq.minTs)}`);
    log(`  latest bowl        ${fmt(pg.maxTs)} -> ${fmt(sq.maxTs)}`);

    const mismatches = Object.keys(pg).filter((k) => pg[k] !== sq[k]);
    if (sq.maxBowlId !== null && seq !== sq.maxBowlId) mismatches.push("sqlite_sequence");
    if (mismatches.length) {
      throw new Error(`verification failed on: ${mismatches.join(", ")}`);
    }

    db.exec("PRAGMA synchronous = FULL");
    db.close();
    db = null;
    log(`\nOK. Wrote ${destPath} (${fs.statSync(destPath).size} bytes).`);
    return { pg, sq };
  } catch (err) {
    // We only ever create brand-new files, so on failure remove what we made.
    if (db) {
      try {
        db.close();
      } catch {}
    }
    for (const suffix of ["", "-journal", "-wal", "-shm"]) {
      fs.rmSync(destPath + suffix, { force: true });
    }
    throw err;
  } finally {
    await client.query("ROLLBACK");
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
