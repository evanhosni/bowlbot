const moment = require("moment");
const db = require("./db");
const { leaderboardsMap } = require("./state");

const RANGES = ["total", "year", "month", "week", "day", "hour"];

// Same order as RANGES: sortedBoard() and leaderboardsMap index these by position.
function serverStats(serverId) {
  return RANGES.map((range) =>
    range === "total"
      ? db.countServerBowls(serverId)
      : db.countServerBowls(serverId, moment().subtract(1, range).valueOf()),
  );
}

function vibeCheck(guildIds) {
  const servers = db.findRankedServers();
  for (let i = 0; i < servers.length; i++) {
    if (!guildIds.includes(servers[i].id)) {
      db.setServerRank(servers[i].id, false);
    }

    leaderboardsMap.set(servers[i].id, [servers[i].name, ...serverStats(servers[i].id)]);
  }
}

// Ties break on each wider range in turn, down to total.
function sortedBoard(column) {
  return Array.from(leaderboardsMap.values())
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
  return RANGES.map((_, i) => sortedBoard(i + 1));
}

module.exports = { RANGES, serverStats, vibeCheck, allBoards };
