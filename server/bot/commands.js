const path = require("path");
const Discord = require("discord.js");
const discordVoice = require("@discordjs/voice");
const db = require("../db");
const { io } = require("../web");
const { sesh, stopSesh } = require("../state");
const { serverStats } = require("../leaderboards");
const { describeGuild, logGuildError, ownerLog, ownerWarn } = require("../log");
const { disclaimer } = require("../text");
const charts = require("../charts");

const AUDIO_DIR = path.join(__dirname, "..", "..", "audio");

const TRANSIENT_VOICE = /Unexpected server response: \d+|ECONNRESET|ETIMEDOUT/;

function logVoiceError(guild, err) {
  const text = err && err.message ? err.message : String(err);
  if (!TRANSIENT_VOICE.test(text)) return logGuildError("voice connection", guild, err);
  ownerWarn(`[voice connection] ${describeGuild(guild)}: ${text} (discord voice hiccup, reconnecting)`);
}

function watchVoiceConnection(connection, guild, serverId) {
  const { VoiceConnectionStatus, entersState } = discordVoice;
  connection.on("error", (err) => logVoiceError(guild, err));
  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5000),
      ]);
    } catch {
      if (connection.state.status !== VoiceConnectionStatus.Destroyed) connection.destroy();
    }
  });
  connection.on(VoiceConnectionStatus.Destroyed, () => {
    const running = sesh.get(serverId);
    if (!stopSesh(serverId)) return;
    setImmediate(() => {
      if (!guild.client.guilds.cache.has(guild.id)) {
        return ownerLog(`[voice connection] ${describeGuild(guild)}: removed from the server mid-sesh`);
      }
      ownerLog(`[voice connection] ${describeGuild(guild)}: dropped from the call`);
      running.announce({ content: "bru" + (running.ukMode ? "v" : "h") + " who kicked me" });
    });
  });
}

const commands = [
  {
    name: "keef",
    match: (text) => !isNaN(text),
    usage: "[minutes]",
    description: "joins call and sets a schmoke interval for [number] minutes",
    option: { name: "minutes", description: "how many minutes between schmokes", standalone: true },
    run(ctx, { text: msg, ukMode, serverId }) {
      const userVoiceChannel = ctx.member && ctx.member.voice ? ctx.member.voice.channel : null;
      if (!userVoiceChannel) {
        ctx.reply({
          content: "it's no sesh without u, " + (ukMode ? "bruv" : ctx.user.toString()) + " <3",
        });
        return;
      }

      if (msg < 1) {
        ctx.reply({ content: "woah slow down " + (ukMode ? "bruv" : "buddy") });
        return;
      }
      if (msg > 1440) {
        ctx.reply({ content: "sorry " + (ukMode ? "bruv" : "bud") + " i have work in the morning" });
        return;
      }
      if (msg == 420) {
        ctx.reply({ content: "ayyy lmao" });
      }
      ctx.reply({ content: `schmoke a ` + (ukMode ? "spliff" : "bowl") + ` every ${msg} min` });
      stopSesh(serverId);

      const player = discordVoice.createAudioPlayer();
      const connection = discordVoice.joinVoiceChannel({
        channelId: userVoiceChannel.id,
        guildId: ctx.guild.id,
        adapterCreator: ctx.guild.voiceAdapterCreator,
        selfDeaf: false,
      });

      player.on("error", (err) => logGuildError("audio player", ctx.guild, err));
      if (connection.listenerCount("error") === 0) {
        watchVoiceConnection(connection, ctx.guild, serverId);
      }

      connection.subscribe(player);

      const botVoiceChannel = discordVoice.getVoiceConnection(ctx.guild.id);
      const timer = setInterval(
        () => {
          try {
            if (botVoiceChannel && userVoiceChannel.members.size <= 1) {
              ctx.announce({ content: "bru" + (ukMode ? "v" : "h") + " where'd everyone go" });
              stopSesh(serverId);
              botVoiceChannel.destroy();
            } else {
              player.play(
                discordVoice.createAudioResource(
                  path.join(AUDIO_DIR, ukMode ? "schmoke_a_spliff.mp3" : "schmoke_a_bowl.mp3"),
                ),
              );
              db.insertBowl(serverId);
              io.emit("bowlcount", db.countAllBowls());
            }
          } catch (err) {
            logGuildError("session tick", ctx.guild, err);
          }
        },
        msg * 1000 * 60,
      );
      sesh.set(serverId, {
        timer,
        minutes: Number(msg),
        startedAt: Date.now(),
        channel: userVoiceChannel.name,
        ukMode,
        announce: ctx.announce,
      });
    },
  },

  //TODO: "keef when" - tells users time remaining until next rip
  //TODO: "keef freestyle" - random intervals between 0 and 10 min (maybe users can set range) (maybe reggae playing quietly in background)
  //TODO: coughing + reggae music upon entry? Optional feature that can be turned on/off per server settings
  //TODO: monthly awards (like The Platinum Lung). "keef awards" shows all your awards. permanent on leaderboards history

  {
    name: "stop",
    description: "stops the interval and kicks keef from the call",
    run(ctx, { serverId }) {
      //TODO: do you want to be able to stop keef if other people are in the call but you are not?
      const botVoiceChannel = discordVoice.getVoiceConnection(ctx.guild.id);
      if (botVoiceChannel) {
        ctx.reply({ content: "okay :3" });
        stopSesh(serverId);
        botVoiceChannel.destroy();
      } else {
        ctx.reply({ content: "i wasn't doing anything!" });
      }
    },
  },

  {
    name: "stats",
    description: "displays your server's schmokin' stats in a lil chart",
    async run(ctx, { serverId }) {
      await ctx.defer();
      const [total, ...windows] = serverStats(serverId);
      const png = await charts.bowlsChartPng(serverId, ctx.guild);
      const breakdown = png
        ? ""
        : "\n\n" +
          ["year", "month", "week", "day", "hour"].map((range, i) => `${range}: ${windows[i]}`).join(" · ") +
          "\n";
      ctx.reply({
        //TODO: emojis based on amount of bowls
        content: `you've schmoked a total of ${total} bowls${breakdown}\nkeep up the great work!`,
        files: png ? [{ attachment: png, name: "stats.png" }] : undefined,
      });
    },
  },

  {
    name: "website",
    mention: ["website", "leaderboards", "leaderboard"],
    description: "displays website url in a fancy clickable link",
    response: "https://bowlbot.io",
  },

  {
    name: "support",
    description: "displays an invite link to keef's support server",
    response: "https://discord.gg/CzmtRZa9Zd",
  },

  {
    name: "disclaimer",
    mention: ["disclaimer", "waiver"],
    description: "displays the bowlbot disclaimer/waiver",
    quiet: true,
    response: disclaimer,
  },

  {
    name: "enable",
    mention: ["enable rank", "enable ranked", "enable ranking"],
    description: "enables showing your server's name on website leaderboards (admins only)",
    sub: { name: "rank", description: "your server's name and stats will appear on the leaderboards" },
    adminOnly: true,
    run(ctx, { serverId }) {
      const serv = db.findServer(serverId);
      if (!serv.rank) {
        if (ctx.member.permissions.has(Discord.PermissionFlagsBits.Administrator)) {
          db.setServerRank(serverId, true);
          ctx.reply({
            content:
              "ranking enabled. your server's name and schmokin' stats will now appear on the leaderboards at https://bowlbot.io",
          });
        } else {
          ctx.reply({ content: "you don't have this permission. get your server admin to do it." });
        }
      } else {
        ctx.reply({ content: "ranking is already enabled." });
      }
    },
  },

  {
    name: "disable",
    mention: ["disable rank", "disable ranked", "disable ranking"],
    description: "disables showing your server's name on website leaderboards (admins only)",
    sub: { name: "rank", description: "your server's name and stats will no longer appear on the leaderboards" },
    adminOnly: true,
    run(ctx, { serverId }) {
      const serv = db.findServer(serverId);
      if (serv.rank) {
        if (ctx.member.permissions.has(Discord.PermissionFlagsBits.Administrator)) {
          db.setServerRank(serverId, false);
          ctx.reply({
            content:
              "ranking disabled. your server's name and schmokin' stats will no longer appear on the leaderboards at https://bowlbot.io",
          });
        } else {
          ctx.reply({ content: "you don't have this permission. get your server admin to do it." });
        }
      } else {
        ctx.reply({ content: "ranking is already disabled." });
      }
    },
  },

  {
    name: "help",
    mention: ["help", "commands"],
    description: "opens the command list",
    quiet: true,
    run(ctx) {
      const slashUsage = (c) => c.name + (c.sub ? ` ${c.sub.name}` : "") + (c.option ? ` [${c.option.name}]` : "");
      const mentionUsage = (c) => c.usage || (c.mention ? c.mention[0] : c.name);
      const lines = commands
        .filter((c) => !c.hidden)
        .map((c) => `\`/${slashUsage(c)}\` or \`@keef ${mentionUsage(c)}\` - ${c.description}`);
      ctx.reply({ quiet: true, content: "here are my commands:\n" + lines.join("\n") });
    },
  },

  {
    name: "number",
    mention: ["number", "(number)", "[number]"],
    slash: false,
    hidden: true,
    response: "no not like that silly goose. actually specify a number... like `keef 15`", //TODO: rephrase?
  },
];

module.exports = commands;
