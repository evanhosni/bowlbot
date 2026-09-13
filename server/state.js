module.exports = {
  sesh: new Map(), // serverId -> interval handle
  leaderboardsMap: new Map(), // serverId -> [name, total, year, month, week, day, hour], ranked servers only
  status: { online: false },
};
