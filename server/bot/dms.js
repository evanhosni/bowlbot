// Owner-only DM commands. DMs are the channel because, without the Message Content
// intent, Discord only shows keef the text of messages that mention it or are DMs to it.

const bot = require("./client");
const db = require("../db");
const { sesh } = require("../state");
const { say } = require("./context");
const { logGuildError, ownerLog, ownerError, sendLogsTo } = require("../log");

// Discord rejects a message over 2000.
const MAX_MESSAGE = 1900;

let ownerId = null;
let pending = null;

// Team-owned apps put a Team here rather than a user; the human to DM is the team's owner.
function ownerIdOf(application) {
  const owner = application.owner;
  if (!owner) return null;
  if (owner.owner && owner.owner.user) return owner.owner.user.id;
  return owner.id;
}

function fetchOwner() {
  return bot.application
    .fetch()
    .then((application) => {
      ownerId = ownerIdOf(application);
      if (!ownerId) {
        ownerError("[owner] application has no owner; owner DMs are disabled");
        return;
      }
      sendLogsTo((text) => bot.users.send(ownerId, text));
    })
    .catch((err) => ownerError("[owner] could not fetch the application owner:", err));
}

function isOwner(message) {
  return Boolean(ownerId) && message.author.id === ownerId;
}

function paginate(title, lines, separator) {
  const messages = [];
  let current = title;
  for (const line of lines) {
    if (current.length + line.length + separator.length > MAX_MESSAGE) {
      messages.push(current);
      current = "";
    }
    current += (current ? separator : "") + line;
  }
  if (current) messages.push(current);
  return messages;
}

function serverList() {
  const guilds = [...bot.guilds.cache.values()].sort((a, b) => a.name.localeCompare(b.name));
  if (guilds.length === 0) return "not in any servers";
  const lines = guilds.map((guild) => {
    const serv = db.findServer(guild.id);
    const bits = [`${db.countServerBowls(guild.id).toLocaleString()} bowls`, serv && serv.rank ? "ranked" : "unranked"];
    if (sesh.has(guild.id)) bits.push("**sesh running**");
    return `**${guild.name}** · \`${guild.id}\` · ${bits.join(" · ")}`;
  });
  return paginate(`**servers (${guilds.length})**`, lines, "\n");
}

function seshList() {
  if (sesh.size === 0) return "**seshes (0)**\nnobody's schmokin' right now";
  const lines = [...sesh.entries()].map(([serverId, running]) => {
    const guild = bot.guilds.cache.get(serverId);
    const going = Math.round((Date.now() - running.startedAt) / 60000);
    const name = guild ? guild.name : `unknown server ${serverId}`;
    return `**${name}** · every ${running.minutes} min · in ${running.channel} · going ${going} min`;
  });
  return paginate(`**seshes (${sesh.size})**`, lines, "\n");
}

function broadcast(text) {
  let sent = 0;
  const skipped = [];
  bot.guilds.cache.forEach((guild) => {
    if (!guild.systemChannel) {
      skipped.push(guild.name);
      return;
    }
    sent++;
    guild.systemChannel.send({ content: text }).catch((err) => logGuildError("announcement", guild, err));
  });
  return `announced to ${sent} servers` + (skipped.length ? `\nno system channel, skipped: ${skipped.join(", ")}` : "");
}

const ANSWERS = ["/yes", "/no", "/cancel"];

function ayy(message) {
  return say(message, { content: "a" + "y".repeat(1 + Math.floor(Math.random() * 24)) });
}

const dms = [
  {
    name: "servers",
    description: "logs every server keef is in",
    run: serverList,
  },
  {
    name: "seshes",
    description: "logs every sesh running right now",
    run: seshList,
  },
  {
    name: "announcement",
    description: "sends an announcement to all servers",
    run() {
      pending = { step: "text" };
      return "type in your announcement (or type `/cancel`)";
    },
  },
  {
    name: "help",
    description: "opens the admin DMs list",
    run: () => helpText(),
  },
];

function helpText() {
  return dms.map((d) => `\`/${d.name}\` - ${d.description}`).join("\n");
}

function reply(message, payload) {
  const messages = Array.isArray(payload) ? payload : [payload];
  // Sequential so multi-page output can't arrive out of order.
  return messages.reduce((prev, content) => prev.then(() => say(message, { content })), Promise.resolve());
}

function handleDm(message) {
  if (!isOwner(message)) {
    ayy(message);
    return;
  }

  const content = message.content.trim();
  if (content === "") return;
  const word = content.toLowerCase();

  if (!pending && ANSWERS.includes(word)) {
    ayy(message);
    return;
  }

  if (pending) {
    if (pending.step === "text") {
      // checked first so it cancels instead of becoming the announcement text
      if (word === "/cancel") {
        pending = null;
        reply(message, "kk, nevermind");
        return;
      }
      pending = { step: "confirm", text: content };
      const quoted = content
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
      reply(
        message,
        `send this to all ${bot.guilds.cache.size} servers?\n\n${quoted}\n\n\`/yes\` / \`/no\``,
      );
      return;
    }
    if (word === "/yes") {
      const { text } = pending;
      pending = null;
      reply(message, broadcast(text));
      return;
    }
    if (word === "/no") {
      pending = null;
      reply(message, "kk, not sending it");
      return;
    }
    reply(message, "`/yes` or `/no`");
    return;
  }

  const dm = word.startsWith("/") ? dms.find((d) => d.name === word.slice(1)) : null;
  if (!dm) {
    ayy(message);
    return;
  }
  reply(message, dm.run());
}

bot.once("clientReady", fetchOwner);

bot.on("messageCreate", (message) => {
  if (message.author.bot || message.guild) return;
  try {
    handleDm(message);
  } catch (err) {
    logGuildError("owner dm", null, err);
  }
});

module.exports = { dms, handleDm };
