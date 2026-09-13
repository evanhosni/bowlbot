const bot = require("./client");
const { ownerError } = require("../log");
require("./events");
require("./mentions");
require("./slash");
require("./dms");

function start() {
  return bot.login(process.env.DISCORD_TOKEN).catch((err) => {
    ownerError("[login] failed, exiting:", err && err.stack ? err.stack : err);
    process.exit(1);
  });
}

module.exports = { bot, start };
