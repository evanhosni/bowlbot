function describeGuild(guild) {
  return guild ? `guild ${guild.id} "${guild.name}"` : "no guild";
}

function logGuildError(where, guild, err) {
  const code = err && err.code !== undefined ? ` [${err.code}]` : "";
  const detail = err && err.stack ? err.stack : String(err);
  console.error(`[${where}] ${describeGuild(guild)}${code}: ${detail}`);
}

process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason && reason.stack ? reason.stack : reason);
});

process.on("uncaughtException", (err) => {
  // Not exiting on purpose: a restart would kill every guild's active session.
  console.error("[uncaughtException]", err && err.stack ? err.stack : err);
});

module.exports = { describeGuild, logGuildError };
