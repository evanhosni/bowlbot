const Discord = require("discord.js");
const discordVoice = require("@discordjs/voice");
const db = require("../db");
const { serverStats } = require("../leaderboards");
const { startSesh, stopSesh } = require("./sesh");
const { disclaimer } = require("../text");
const charts = require("../charts");

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
      startSesh(ctx.guild, userVoiceChannel, ctx.channelId, Number(msg), ukMode);
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
    response: "no not like that silly goose. actually specify a number... like `keef 15`",
  },
];

module.exports = commands;
