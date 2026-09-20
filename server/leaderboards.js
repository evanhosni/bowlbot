const moment = require("moment");
const db = require("./db");

const RANGES = ["total", "year", "month", "week", "day", "hour"];

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

module.exports = { RANGES, serverStats, vibeCheck, allBoards };
