const bot = require("./client");
require("./events");
require("./mentions");
require("./slash");

function start() {
  return bot.login(process.env.DISCORD_TOKEN).catch((err) => {
    console.error("[login] failed, exiting:", err && err.stack ? err.stack : err);
    process.exit(1);
  });
}

module.exports = { bot, start };
