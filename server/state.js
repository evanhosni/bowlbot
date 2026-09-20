const sesh = new Map(); // serverId -> { timer, minutes, startedAt, channel, ukMode, announce }

function stopSesh(serverId) {
  const running = sesh.get(serverId);
  if (!running) return false;
  clearInterval(running.timer);
  sesh.delete(serverId);
  return true;
}

module.exports = {
  sesh,
  stopSesh,
  status: { online: false },
};
