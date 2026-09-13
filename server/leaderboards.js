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

/** Drop servers the bot is no longer in off the leaderboards. */
function vibeCheck(guildIds) {
  const present = new Set(guildIds);
  for (const server of db.findRankedServers()) {
    if (!present.has(server.id)) db.setServerRank(server.id, false);
  }
}

// Ties break on each wider range in turn, down to total.
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

// Counted at read time off one query, so windowed ranges age out on their own.
function allBoards() {
  const rows = db.rankedServerStats(cutoffs()).map((s) => [s.name, ...s.stats]);
  return RANGES.map((_, i) => sortedBoard(rows, i + 1));
}

module.exports = { RANGES, serverStats, vibeCheck, allBoards };
