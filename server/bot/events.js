const bot = require("./client");
const db = require("../db");
const { io } = require("../web");
const { status } = require("../state");
const { vibeCheck } = require("../leaderboards");
const { describeGuild, logGuildError, ownerLog, ownerError } = require("../log");
const { disclaimer, welcome } = require("../text");
const { registerSlashCommands } = require("./slash");
const { postableSystemChannel } = require("./channels");

bot.on("clientReady", () => {
  ownerLog(`[bot] ayyooo it's ${bot.user.tag}! live in ${bot.guilds.cache.size} servers`);
  status.online = true;
  io.emit("bot_status", status.online);
  vibeCheck(bot.guilds.cache.map((g) => g.id));
  registerSlashCommands();
});

bot.on("guildCreate", (guild) => {
  db.findOrCreateServer(guild.id, guild.name);
  ownerLog(`[guild create] bowlbot added to: ${describeGuild(guild)}`);
  const { channel, reason, canMentionEveryone } = postableSystemChannel(guild);
  if (!channel) {
    ownerLog(`[guild create] ${describeGuild(guild)}: ${reason}, skipping welcome message`);
    return;
  }
  const ping = canMentionEveryone ? "@everyone\n\n" : "";
  channel.send(welcome).then(
    () => channel.send(ping + disclaimer).catch((err) => logGuildError("disclaimer", guild, err)),
    (err) => logGuildError("welcome", guild, err),
  );
});

bot.on("error", (error) => {
  ownerError("[bot] error:", error);
  status.online = false;
  io.emit("bot_status", status.online);
});

bot.on("disconnect", () => {
  ownerLog("[bot] disconnected");
  status.online = false;
  io.emit("bot_status", status.online);
});
