// All SQL lives here. node:sqlite is synchronous; every export returns a plain value.

const { DatabaseSync } = require("node:sqlite");
const path = require("node:path");
const fs = require("node:fs");
const { migrate } = require("./schema");

const DATABASE_PATH = process.env.DATABASE_PATH;
if (!DATABASE_PATH) {
  throw new Error("DATABASE_PATH is not set. Point it at the SQLite file, e.g. DATABASE_PATH=./data/bowlbot.sqlite");
}

fs.mkdirSync(path.dirname(path.resolve(DATABASE_PATH)), { recursive: true });

const db = new DatabaseSync(DATABASE_PATH);
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");
db.exec("PRAGMA busy_timeout = 5000");
migrate(db);


const stmt = {
  selectServer: db.prepare("SELECT id, name, rank FROM servers WHERE id = ?"),
  insertServer: db.prepare("INSERT INTO servers (id, name, rank) VALUES (?, ?, 0)"),
  updateServerName: db.prepare("UPDATE servers SET name = ? WHERE id = ?"),
  updateServerRank: db.prepare("UPDATE servers SET rank = ? WHERE id = ?"),
  selectRankedServers: db.prepare("SELECT id, name, rank FROM servers WHERE rank = 1"),

  insertBowl: db.prepare("INSERT INTO bowls (schmokedAt, serverId) VALUES (?, ?)"),
  countAllBowls: db.prepare("SELECT COUNT(*) AS n FROM bowls"),
  countServerBowls: db.prepare("SELECT COUNT(*) AS n FROM bowls WHERE serverId = ?"),
  countServerBowlsSince: db.prepare("SELECT COUNT(*) AS n FROM bowls WHERE serverId = ? AND schmokedAt >= ?"),
  countServerBowlsByWindow: db.prepare(
    "SELECT CAST((? - schmokedAt) / ? AS INTEGER) AS w, COUNT(*) AS n FROM bowls WHERE serverId = ? AND schmokedAt > ? AND schmokedAt <= ? GROUP BY w",
  ),
  countServerBowlsByPeriod: db.prepare(
    "SELECT strftime(?, schmokedAt / 1000, 'unixepoch') AS p, COUNT(*) AS n FROM bowls WHERE serverId = ? GROUP BY p",
  ),
  firstBowlAt: db.prepare("SELECT MIN(schmokedAt) AS t FROM bowls WHERE serverId = ?"),
};

function toServer(row) {
  if (!row) return null;
  return { id: row.id, name: row.name, rank: row.rank === 1 };
}


/** @returns {{id: string, name: string, rank: boolean} | null} */
function findServer(id) {
  return toServer(stmt.selectServer.get(String(id)));
}

/**
 * Equivalent of Sequelize findOrCreate: returns the existing row, or inserts
 * a new one with rank = false and returns it.
 * @returns {{id: string, name: string, rank: boolean}}
 */
function findOrCreateServer(id, name) {
  const existing = findServer(id);
  if (existing) return existing;
  stmt.insertServer.run(String(id), name);
  return findServer(id);
}

function updateServerName(id, name) {
  stmt.updateServerName.run(name, String(id));
}

function setServerRank(id, rank) {
  stmt.updateServerRank.run(rank ? 1 : 0, String(id));
}

/** @returns {{id: string, name: string, rank: boolean}[]} */
function findRankedServers() {
  return stmt.selectRankedServers.all().map(toServer);
}


/** Records a bowl for the server right now. Returns the new bowl id. */
function insertBowl(serverId) {
  return Number(stmt.insertBowl.run(Date.now(), String(serverId)).lastInsertRowid);
}

function countAllBowls() {
  return stmt.countAllBowls.get().n;
}

/**
 * Count bowls for a server, optionally only those at or after `sinceMs`
 * (epoch milliseconds).
 */
function countServerBowls(serverId, sinceMs) {
  if (sinceMs === undefined || sinceMs === null) {
    return stmt.countServerBowls.get(String(serverId)).n;
  }
  return stmt.countServerBowlsSince.get(String(serverId), sinceMs).n;
}

/**
 * Bowls per fixed-size window counted back from `anchorMs`: window 0 is the
 * `windowMs` ending at the anchor, window 1 the one before it, and so on for
 * `count` windows. Map of window index -> count; empty windows are absent.
 * @returns {Map<number, number>}
 */
function countServerBowlsByWindow(serverId, windowMs, count, anchorMs) {
  const rows = stmt.countServerBowlsByWindow.all(anchorMs, windowMs, String(serverId), anchorMs - count * windowMs, anchorMs);
  return new Map(rows.map((r) => [Number(r.w), r.n]));
}

/**
 * Bowls per UTC calendar period over all time, keyed by an SQLite strftime
 * format applied to schmokedAt, e.g. "%Y-%m" -> Map of "2026-09" -> count.
 * @returns {Map<string, number>}
 */
function countServerBowlsByPeriod(serverId, format) {
  const rows = stmt.countServerBowlsByPeriod.all(format, String(serverId));
  return new Map(rows.map((r) => [r.p, r.n]));
}

/** Epoch ms of the server's first bowl, or null if it has none. */
function firstBowlAt(serverId) {
  const t = stmt.firstBowlAt.get(String(serverId)).t;
  return t === null ? null : Number(t);
}

module.exports = {
  db,
  findServer,
  findOrCreateServer,
  updateServerName,
  setServerRank,
  findRankedServers,
  insertBowl,
  countAllBowls,
  countServerBowls,
  countServerBowlsByWindow,
  countServerBowlsByPeriod,
  firstBowlAt,
};
