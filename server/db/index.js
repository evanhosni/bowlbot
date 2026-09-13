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
  selectServerBowlTimes: db.prepare("SELECT schmokedAt FROM bowls WHERE serverId = ? ORDER BY schmokedAt"),
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

function serverBowlTimes(serverId) {
  return stmt.selectServerBowlTimes.all(String(serverId)).map((r) => Number(r.schmokedAt));
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
  serverBowlTimes,
};
