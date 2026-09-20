const path = require("path");
const discordVoice = require("@discordjs/voice");
const bot = require("./client");
const db = require("../db");
const { io } = require("../web");
const { describeGuild, logGuildError, ownerLog, ownerWarn } = require("../log");

const sesh = new Map(); // serverId -> { timer, minutes, startedAt, channel, ukMode, textChannelId }
const AUDIO_DIR = path.join(__dirname, "..", "..", "audio");
const TRANSIENT_VOICE = ["Unexpected server response", "ECONNRESET", "ETIMEDOUT"];
const REJOIN_GRACE_MS = 5000;

let shuttingDown = false;

function bruh(ukMode) {
  return "bru" + (ukMode ? "v" : "h");
}

function announce(guild, textChannelId, content) {
  const channel = guild.channels.cache.get(textChannelId);
  if (!channel) {
    ownerWarn(`[announce] ${describeGuild(guild)}: text channel ${textChannelId} is gone, dropping message`);
    return Promise.resolve();
  }
  return channel.send({ content }).catch((err) => logGuildError("announce", guild, err));
}

function logVoiceError(guild, err) {
  const text = err && err.message ? err.message : String(err);
  if (!TRANSIENT_VOICE.some((s) => text.includes(s))) return logGuildError("voice connection", guild, err);
  ownerWarn(`[voice connection] ${describeGuild(guild)}: ${text} (discord voice hiccup, reconnecting)`);
}

function watchVoiceConnection(connection, guild) {
  const { VoiceConnectionStatus, entersState } = discordVoice;
  connection.on("error", (err) => logVoiceError(guild, err));
  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, REJOIN_GRACE_MS),
        entersState(connection, VoiceConnectionStatus.Connecting, REJOIN_GRACE_MS),
      ]);
    } catch {
      if (connection.state.status !== VoiceConnectionStatus.Destroyed) connection.destroy();
    }
  });
  connection.on(VoiceConnectionStatus.Destroyed, () => {
    if (shuttingDown) return;
    const running = sesh.get(guild.id);
    if (!stopSesh(guild.id)) return;
    setImmediate(() => {
      if (!bot.guilds.cache.has(guild.id)) {
        return ownerLog(`[voice connection] ${describeGuild(guild)}: removed from the server mid-sesh`);
      }
      ownerLog(`[voice connection] ${describeGuild(guild)}: dropped from the call`);
      announce(guild, running.textChannelId, bruh(running.ukMode) + " who kicked me");
    });
  });
}

function stopSesh(serverId) {
  if (!shuttingDown) db.deleteSesh(serverId);
  const running = sesh.get(serverId);
  if (!running) return false;
  clearTimeout(running.timer);
  sesh.delete(serverId);
  return true;
}

function startSesh(guild, voiceChannel, textChannelId, minutes, ukMode, startedAt = Date.now()) {
  const serverId = guild.id;
  stopSesh(serverId);

  const interval = minutes * 60 * 1000;
  const player = discordVoice.createAudioPlayer();
  const connection = discordVoice.joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: serverId,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: false,
  });
  player.on("error", (err) => logGuildError("audio player", guild, err));
  if (connection.listenerCount("error") === 0) watchVoiceConnection(connection, guild);
  connection.subscribe(player);

  const tick = () => {
    try {
      if (voiceChannel.members.size <= 1) {
        announce(guild, textChannelId, bruh(ukMode) + " where'd everyone go");
        stopSesh(serverId);
        const current = discordVoice.getVoiceConnection(serverId);
        if (current) current.destroy();
      } else {
        player.play(
          discordVoice.createAudioResource(path.join(AUDIO_DIR, ukMode ? "schmoke_a_spliff.mp3" : "schmoke_a_bowl.mp3")),
        );
        db.insertBowl(serverId);
        io.emit("bowlcount", db.countAllBowls());
      }
    } catch (err) {
      logGuildError("session tick", guild, err);
    }
  };

  const untilFirst = interval - ((Date.now() - startedAt) % interval);
  const entry = { timer: null, minutes, startedAt, channel: voiceChannel.name, ukMode, textChannelId };
  entry.timer = setTimeout(() => {
    tick();
    entry.timer = setInterval(tick, interval);
  }, untilFirst);
  sesh.set(serverId, entry);
  db.upsertSesh({ serverId, voiceChannelId: voiceChannel.id, textChannelId, minutes, startedAt, ukMode });
  return untilFirst;
}

function resumeSeshes() {
  const rows = db.findSeshes();
  if (rows.length === 0) return;
  let resumed = 0;
  const dropped = [];
  for (const row of rows) {
    const guild = bot.guilds.cache.get(row.serverId);
    try {
      if (!guild) {
        db.deleteSesh(row.serverId);
        dropped.push(`guild ${row.serverId}: not in this server anymore`);
        continue;
      }
      const voiceChannel = guild.channels.cache.get(row.voiceChannelId);
      const humans = voiceChannel && voiceChannel.isVoiceBased() ? voiceChannel.members.filter((m) => !m.user.bot).size : 0;
      if (humans === 0) {
        db.deleteSesh(row.serverId);
        dropped.push(`${describeGuild(guild)}: call is empty or gone`);
        announce(guild, row.textChannelId, bruh(row.ukMode) + " where'd everyone go");
        continue;
      }
      startSesh(guild, voiceChannel, row.textChannelId, row.minutes, row.ukMode, row.startedAt);
      announce(guild, row.textChannelId, "ok i'm back" + (row.ukMode ? " bruv" : ""));
      resumed++;
    } catch (err) {
      db.deleteSesh(row.serverId);
      dropped.push(`${describeGuild(guild)}: ${err && err.message ? err.message : err}`);
    }
  }
  const summary = `[resume] resuming ${resumed} of ${rows.length} sesh(es)`;
  if (dropped.length === 0) return ownerLog(summary);
  ownerWarn(summary + "\n  dropped: " + dropped.join("\n  dropped: "));
}

function beginShutdown() {
  shuttingDown = true;
}

module.exports = { sesh, announce, startSesh, stopSesh, resumeSeshes, beginShutdown };
