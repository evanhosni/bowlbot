const bot = require("./client");
const db = require("../db");
const { io } = require("../web");
const { status } = require("../state");
const { vibeCheck } = require("../leaderboards");
const { describeGuild, logGuildError } = require("../log");
const { disclaimer, welcome } = require("../text");
const announcement = require("./announcement");
const { registerSlashCommands, syncGuildCommands } = require("./slash");

bot.on("clientReady", () => {
  console.log(`ayyooo it's ${bot.user.tag}`);
  console.log(bot.guilds.cache.map((g) => g.name).join("\n"));
  status.online = true;
  io.emit("bot_status", status.online);
  vibeCheck(bot.guilds.cache.map((g) => g.id));
  announcement.fetchOwner();
  registerSlashCommands();
});

bot.on("guildCreate", (guild) => {
  console.log(db.findOrCreateServer(guild.id, guild.name));
  syncGuildCommands(guild);
  const channel = guild.systemChannel;
  if (!channel) {
    console.log(`[guildCreate] ${describeGuild(guild)}: no system channel, skipping welcome message`);
    return;
  }
  channel
    .send(welcome)
    .then(() => channel.send("@everyone\n\n" + disclaimer))
    .catch((err) => logGuildError("guildCreate", guild, err));
});

bot.on("error", (error) => {
  console.log("bot error:", error);
  status.online = false;
  io.emit("bot_status", status.online);
});

bot.on("disconnect", () => {
  console.log("bot disconnected");
  status.online = false;
  io.emit("bot_status", status.online);
});
