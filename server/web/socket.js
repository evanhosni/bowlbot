const db = require("../db");
const { allBoards } = require("../leaderboards");

const status = { online: false };
let io = null;

function attach(server) {
  io = server;
  io.on("connection", (socket) => {
    console.log("[web] we're one, brother");
    socket.emit("bot_status", status.online);
    io.emit("init", db.countAllBowls());
    socket.on("leaderboards", () => {
      socket.emit("leaderboards", allBoards());
    });
  });
}

function setBotStatus(online) {
  status.online = online;
  if (io) io.emit("bot_status", online);
}

module.exports = { attach, setBotStatus };
