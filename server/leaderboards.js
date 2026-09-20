const moment = require("moment");
const db = require("./db");

const RANGES = ["total", "year", "month", "week", "day", "hour"];
const DAY = 86400000;

function cutoffs() {
  return RANGES.slice(1).map((range) => moment().subtract(1, range).valueOf());
}

function serverStats(serverId) {
  return RANGES.map((range) =>
    range === "total"
      ? db.countServerBowls(serverId)
      : db.countServerBowls(serverId, moment().subtract(1, range).valueOf()),
  );
}

function vibeCheck(guildIds) {
  const present = new Set(guildIds);
  for (const server of db.findRankedServers()) {
    if (!present.has(server.id)) db.setServerRank(server.id, false);
  }
}

function sortedBoard(rows, column) {
  return rows
    .slice()
    .sort((a, b) => {
      for (let i = column; i >= 1; i--) {
        const diff = b[i] - a[i];
        if (diff) return diff;
      }
      return 0;
    })
    .map((data) => ({ name: data[0], bowls: data[column] }));
}

function allBoards() {
  const rows = db.rankedServerStats(cutoffs()).map((s) => [s.name, ...s.stats]);
  return RANGES.map((_, i) => sortedBoard(rows, i + 1));
}

function chartSeries() {
  const now = Date.now();
  const servers = new Map();
  let firstDay = Math.floor(now / DAY);
  for (const row of db.rankedServerBowlsByDay(DAY)) {
    let server = servers.get(row.id);
    if (!server) {
      server = { name: row.name, total: 0, days: [] };
      servers.set(row.id, server);
    }
    if (row.day === null) continue;
    if (row.day < firstDay) firstDay = row.day;
    server.total += row.n;
    server.days.push([row.day, server.total]);
  }
  const list = [...servers.values()]
    .sort((a, b) => b.total - a.total)
    .map((s) => ({ name: s.name, days: s.days }));
  return { from: firstDay * DAY, to: now, servers: list };
}

module.exports = { RANGES, serverStats, vibeCheck, allBoards, chartSeries };
