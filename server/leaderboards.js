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
  let from = now;
  for (const row of db.rankedServerBowlsByDay(DAY)) {
    let server = servers.get(row.id);
    if (!server) {
      server = { name: row.name, total: 0, points: [] };
      servers.set(row.id, server);
    }
    if (row.day === null) continue;
    const dayStart = row.day * DAY;
    if (dayStart < from) from = dayStart;
    server.total += row.n;
    server.points.push({ x: Math.min(dayStart + DAY, now), y: server.total });
  }
  const list = [...servers.values()]
    .sort((a, b) => b.total - a.total)
    .map((s) => {
      const points = [{ x: from, y: 0 }, ...s.points];
      if (points[points.length - 1].x < now) points.push({ x: now, y: s.total });
      return { name: s.name, points };
    });
  return { from, to: now, servers: list };
}

module.exports = { RANGES, serverStats, vibeCheck, allBoards, chartSeries };
