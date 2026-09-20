const util = require("node:util");

const MAX_DM = 1900; // Discord rejects a message over 2000
const FLUSH_MS = 2000; // batch a burst into one DM instead of racing the DM rate limit
const MAX_QUEUED = 40;

// Discord colours an ```ansi block by escape code; the emoji survives where colour doesn't.
const STYLE = {
  log: { emoji: "", color: "" },
  warn: { emoji: "⚠️ ", color: "\u001b[33m" },
  error: { emoji: "🛑 ", color: "\u001b[31m" },
};
const RESET = "\u001b[0m";

let deliver = null;
let queue = [];
let dropped = 0;
let timer = null;
let flushing = false;

function format(args) {
  return args
    .map((a) => (typeof a === "string" ? a : a instanceof Error ? a.stack : util.inspect(a, { depth: 3 })))
    .join(" ");
}

function logAndDmOwner(level, args) {
  const text = format(args);
  console[level](text);
  if (queue.length >= MAX_QUEUED) {
    dropped++;
    return;
  }
  const { emoji, color } = STYLE[level];
  queue.push(color + emoji + new Date().toISOString().slice(11, 19) + " " + text + (color && RESET));
  if (!timer && deliver) timer = setTimeout(flush, FLUSH_MS);
}

async function flush() {
  timer = null;
  if (flushing || !deliver || queue.length === 0) return;
  flushing = true;

  const room = MAX_DM - 12; // the ```ansi fences
  let body = "";
  while (queue.length && body.length + queue[0].length + 1 <= room) {
    body += (body ? "\n" : "") + queue.shift();
  }
  if (!body) body = queue.shift().slice(0, room);
  if (dropped) {
    body += `\n... ${dropped} more line(s) dropped`;
    dropped = 0;
  }

  try {
    await deliver("```ansi\n" + body.replace(/```/g, "'''") + "\n```");
  } catch (err) {
    console.error("[log] could not DM the owner:", err && err.message ? err.message : err);
  } finally {
    flushing = false;
    if (queue.length && !timer) timer = setTimeout(flush, FLUSH_MS);
  }
}

function sendLogsTo(fn) {
  deliver = fn;
  if (queue.length && !timer) timer = setTimeout(flush, 0);
}

function ownerLog(...args) {
  logAndDmOwner("log", args);
}

function ownerWarn(...args) {
  logAndDmOwner("warn", args);
}

function ownerError(...args) {
  logAndDmOwner("error", args);
}

function describeGuild(guild) {
  return guild ? `guild ${guild.id} "${guild.name}"` : "no guild";
}

function logGuildError(where, guild, err) {
  const code = err && err.code !== undefined ? ` [${err.code}]` : "";
  const detail = err && err.stack ? err.stack : String(err);
  ownerError(`[${where}] ${describeGuild(guild)}${code}: ${detail}`);
}

process.on("unhandledRejection", (reason) => {
  ownerError("[unhandledRejection]", reason && reason.stack ? reason.stack : reason);
});

process.on("uncaughtException", (err) => {
  // Not exiting on purpose: a restart would kill every guild's active session.
  ownerError("[uncaughtException]", err && err.stack ? err.stack : err);
});

module.exports = { describeGuild, logGuildError, ownerLog, ownerWarn, ownerError, sendLogsTo, flushLogs: flush };
