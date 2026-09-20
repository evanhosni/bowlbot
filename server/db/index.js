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
  rankedServerStats: db.prepare(`
    SELECT s.id AS id, s.name AS name,
           COUNT(b.id) AS total,
           COALESCE(SUM(b.schmokedAt >= ?), 0) AS year,
           COALESCE(SUM(b.schmokedAt >= ?), 0) AS month,
           COALESCE(SUM(b.schmokedAt >= ?), 0) AS week,
           COALESCE(SUM(b.schmokedAt >= ?), 0) AS day,
           COALESCE(SUM(b.schmokedAt >= ?), 0) AS hour
    FROM servers s
    LEFT JOIN bowls b ON b.serverId = s.id
    WHERE s.rank = 1
    GROUP BY s.id, s.name
  `),
  countServerBowlsByWindow: db.prepare(
    "SELECT CAST((? - schmokedAt) / ? AS INTEGER) AS w, COUNT(*) AS n FROM bowls WHERE serverId = ? AND schmokedAt > ? AND schmokedAt <= ? GROUP BY w",
  ),
  countServerBowlsByPeriod: db.prepare(
    "SELECT strftime(?, schmokedAt / 1000, 'unixepoch') AS p, COUNT(*) AS n FROM bowls WHERE serverId = ? GROUP BY p",
  ),
  firstBowlAt: db.prepare("SELECT MIN(schmokedAt) AS t FROM bowls WHERE serverId = ?"),
  rankedServerBowlsByDay: db.prepare(`
    SELECT s.id AS id, s.name AS name, CAST(b.schmokedAt / ? AS INTEGER) AS day, COUNT(b.id) AS n
    FROM servers s
    LEFT JOIN bowls b ON b.serverId = s.id
    WHERE s.rank = 1
    GROUP BY s.id, day
    ORDER BY day
  `),

  upsertSesh: db.prepare(
    "INSERT OR REPLACE INTO seshes (serverId, voiceChannelId, textChannelId, minutes, startedAt, ukMode) VALUES (?, ?, ?, ?, ?, ?)",
  ),
  deleteSesh: db.prepare("DELETE FROM seshes WHERE serverId = ?"),
  selectSeshes: db.prepare("SELECT serverId, voiceChannelId, textChannelId, minutes, startedAt, ukMode FROM seshes"),
};

function toServer(row) {
  if (!row) return null;
  return { id: row.id, name: row.name, rank: row.rank === 1 };
}

function findServer(id) {
  return toServer(stmt.selectServer.get(String(id)));
}

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

function findRankedServers() {
  return stmt.selectRankedServers.all().map(toServer);
}

function insertBowl(serverId) {
  return Number(stmt.insertBowl.run(Date.now(), String(serverId)).lastInsertRowid);
}

function countAllBowls() {
  return stmt.countAllBowls.get().n;
}

function countServerBowls(serverId, sinceMs) {
  if (sinceMs === undefined || sinceMs === null) {
    return stmt.countServerBowls.get(String(serverId)).n;
  }
  return stmt.countServerBowlsSince.get(String(serverId), sinceMs).n;
}

function rankedServerStats(cutoffs) {
  return stmt.rankedServerStats.all(...cutoffs).map((r) => ({
    id: r.id,
    name: r.name,
    stats: [r.total, r.year, r.month, r.week, r.day, r.hour].map(Number),
  }));
}

function countServerBowlsByWindow(serverId, windowMs, count, anchorMs) {
  const rows = stmt.countServerBowlsByWindow.all(anchorMs, windowMs, String(serverId), anchorMs - count * windowMs, anchorMs);
  return new Map(rows.map((r) => [Number(r.w), r.n]));
}

function countServerBowlsByPeriod(serverId, format) {
  const rows = stmt.countServerBowlsByPeriod.all(format, String(serverId));
  return new Map(rows.map((r) => [r.p, r.n]));
}

function firstBowlAt(serverId) {
  const t = stmt.firstBowlAt.get(String(serverId)).t;
  return t === null ? null : Number(t);
}

function rankedServerBowlsByDay(dayMs) {
  return stmt.rankedServerBowlsByDay
    .all(dayMs)
    .map((r) => ({ id: r.id, name: r.name, day: r.day === null ? null : Number(r.day), n: Number(r.n) }));
}

function upsertSesh({ serverId, voiceChannelId, textChannelId, minutes, startedAt, ukMode }) {
  stmt.upsertSesh.run(String(serverId), String(voiceChannelId), String(textChannelId), minutes, startedAt, ukMode ? 1 : 0);
}

function deleteSesh(serverId) {
  stmt.deleteSesh.run(String(serverId));
}

function findSeshes() {
  return stmt.selectSeshes.all().map((row) => ({ ...row, ukMode: row.ukMode === 1 }));
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
  rankedServerStats,
  countServerBowlsByWindow,
  countServerBowlsByPeriod,
  firstBowlAt,
  rankedServerBowlsByDay,
  upsertSesh,
  deleteSesh,
  findSeshes,
};
