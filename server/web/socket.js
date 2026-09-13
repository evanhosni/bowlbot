const db = require("../db");
const { status } = require("../state");
const { allBoards } = require("../leaderboards");

function attach(io) {
  io.on("connection", (socket) => {
    console.log("we're one, brother");
    socket.emit("bot_status", status.online);
    io.emit("init", db.countAllBowls());
    socket.on("leaderboards", () => {
      socket.emit("leaderboards", allBoards());
    });
  });
}

module.exports = { attach };
