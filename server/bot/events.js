const bot = require("./client");
const db = require("../db");
const { io } = require("../web");
const { status } = require("../state");
const { vibeCheck } = require("../leaderboards");
const { describeGuild, logGuildError, ownerLog, ownerError } = require("../log");
const { disclaimer, welcome } = require("../text");
const { registerSlashCommands } = require("./slash");

bot.on("clientReady", () => {
  ownerLog(`ayyooo it's ${bot.user.tag}! live in ${bot.guilds.cache.size} servers`);
  status.online = true;
  io.emit("bot_status", status.online);
  vibeCheck(bot.guilds.cache.map((g) => g.id));
  registerSlashCommands();
});

bot.on("guildCreate", (guild) => {
  db.findOrCreateServer(guild.id, guild.name);
  ownerLog(`bowlbot added to: ${describeGuild(guild)}`);
  const channel = guild.systemChannel;
  if (!channel) {
    ownerLog(`${describeGuild(guild)}: no system channel, skipping welcome message`);
    return;
  }
  channel
    .send(welcome)
    .then(() => channel.send("@everyone\n\n" + disclaimer))
    .catch((err) => logGuildError("guildCreate", guild, err));
});

bot.on("error", (error) => {
  ownerError("bot error:", error);
  status.online = false;
  io.emit("bot_status", status.online);
});

bot.on("disconnect", () => {
  ownerLog("bot disconnected");
  status.online = false;
  io.emit("bot_status", status.online);
});
