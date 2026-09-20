const bot = require("./client");
const db = require("../db");
const { setBotStatus } = require("../web/socket");
const { vibeCheck } = require("../leaderboards");
const { describeGuild, logGuildError, ownerLog, ownerError, flushLogs } = require("../log");
const { disclaimer, welcome } = require("../text");
const { registerSlashCommands } = require("./slash");
const { postableSystemChannel } = require("./channels");
const { sesh, announce, resumeSeshes, beginShutdown } = require("./sesh");

bot.on("clientReady", () => {
  ownerLog(`[bot] ayyooo it's ${bot.user.tag}! live in ${bot.guilds.cache.size} servers`);
  setBotStatus(true);
  vibeCheck(bot.guilds.cache.map((g) => g.id));
  registerSlashCommands();
  resumeSeshes();
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
  setBotStatus(false);
});

bot.on("disconnect", () => {
  ownerLog("[bot] disconnected");
  setBotStatus(false);
});

const SHUTDOWN_GRACE_MS = 5000;

async function shutdown(signal) {
  beginShutdown();
  const running = [...sesh.entries()];
  ownerLog(`[bot] ${signal}, telling ${running.length} seshes brb`);
  const notices = running.map(([serverId, s]) => {
    const guild = bot.guilds.cache.get(serverId);
    return guild ? announce(guild, s.textChannelId, "brb, i need to go get some water") : Promise.resolve();
  });
  const work = Promise.allSettled(notices).then(flushLogs);
  await Promise.race([work, new Promise((r) => setTimeout(r, SHUTDOWN_GRACE_MS))]);
  process.exit(0);
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
