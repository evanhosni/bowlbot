const db = require("../db");
const { status } = require("../state");
const { allBoards } = require("../leaderboards");

function attach(io) {
  io.on("connection", (socket) => {
    console.log("we're one, brother");
    socket.emit("bot_status", status.online);
    io.emit("init", db.countAllBowls());
    socket.on("leaderboards", () => {
      //TODO: to prevent leaderboards not showing up glitch, await leaderboardsMap before grabbing below data from it...?
      socket.emit("leaderboards", allBoards());
    });
  });
}

module.exports = { attach };
