# CLAUDE.md

Working conventions for bowlbot. `README.md` covers what the bot is, the file
layout, hosting, configuration, backups, and operations. Read it first and do
not repeat it here. The bot calls itself keef; "bowlbot" is the project.

## Working agreements

- Evan commits and pushes. Do not commit unless asked. Pushing `main` deploys.
- Never install, update, or remove a package without asking first.
- There is no test suite. Verify with `node --check <file>` on every touched
  file, and a local run (`npm start`, needs `DISCORD_TOKEN` and
  `DATABASE_PATH`) when the change touches Discord behaviour.
- Node 24 built-ins are fine and preferred: `node:sqlite`, `fetch`,
  `AbortSignal.timeout`.

## Logging

Everything the bot process logs goes through `server/log.js`. The four
functions print to the Railway console **and** batch into DMs to the
application owner, so every line is read by a person on a phone.

| Function | Emoji | Use for |
| --- | --- | --- |
| `ownerError` | 🛑 | Something unexpected in bowlbot's own code, or something that stopped the bot working. Include the stack. |
| `ownerWarn` | ⚠️ | An outside service (Discord, QuickChart) let a user down but the bot behaved and recovered. One line, no stack. |
| `ownerLog` | none | Facts and lifecycle: startup, shutdown, joins, a server's permission setup. Never a user action such as a kick. |
| `logGuildError(where, guild, err)` | 🛑 | The error path when a guild is in scope. Builds the standard format below with the error code and stack. |

**Format.** Every line starts with a bracketed category, then the guild if
one is in scope, then what happened and what the consequence was:

```
[chart] guild 123 "Server Name": rate limited by quickchart, stats sent without the chart
[guild create] guild 123 "Server Name": can't post in system channel #general, skipping welcome message
[voice connection] guild 123 "Server Name": dropped in a gateway blip, rejoining
```

- The category is lowercase words naming the part of keef that is speaking,
  optionally plus the action: `bot`, `web`, `login`, `guild create`,
  `welcome`, `disclaimer`, `mention`, `slash`,
  `command <name>`, `send message`, `announcement`, `owner dm`, `voice connection`,
  `audio player`, `session tick`, `chart`, `unhandled rejection`,
  `uncaught exception`. Never a Discord event name in camelCase. Reuse an
  existing one before inventing a new one. `send message` is any failed message to a
  server channel; `announcement` is the owner's broadcast feature.
- Use `describeGuild(guild)` for the guild part, never format it by hand.
- Say the consequence in words. "Stats sent without the chart" tells the
  reader whether a user was affected; a bare status code does not.

**Level rules that have been decided.**

- A permission fact about a server (no system channel, keef cannot post
  there) is `ownerLog`, not a warning. Nothing on our side can change it.
  Check with `postableSystemChannel(guild)` from `server/bot/channels.js`
  before sending to a system channel; a non-null `guild.systemChannel` proves
  nothing, because the guild payload lists channels keef cannot see.
- A known-transient external failure is `ownerWarn` with the reason in words:
  Discord voice handshake 5xx, connection reset, timeout (see
  `TRANSIENT_VOICE` in `server/bot/sesh.js`), QuickChart 429 or timeout.
  Extend those classifiers rather than adding a new mechanism. Anything not
  matched stays a full `ownerError` with the stack.
- **Every occurrence is sent.** Do not dedupe, rate-limit, or "warn once then
  console-only". Evan wants each one, even several in a row. The batcher in
  `server/log.js` already folds a burst into one DM.

**Where `console.*` is still allowed.** Only these, each with a reason:

- `server/log.js`: the DM delivery failure itself cannot be DMed.
- `server/web/socket.js`: one line per website visitor connection; too
  frequent and too unimportant for DMs.
- `scripts/`: standalone CLIs run by hand, not in the bot process.

Anything else that uses `console.*` in `server/` is a mistake to fix.

## Bot commands

One object in `server/bot/commands.js` serves both `@keef <name>` and
`/<name>`. First match wins. Fields:

| Field | Meaning |
| --- | --- |
| `name` | Slash name and the default @mention word. |
| `mention` | @mention phrases, exact match. Defaults to `[name]`. |
| `match(text)` | Predicate used instead of `mention`. |
| `slash: false` | @mention only. |
| `option` | `{ name, description, required?, choices?, standalone? }`, a free-text slash option. Its value is appended to the mention phrase, or is the whole text when `standalone`. |
| `sub` | `{ name, description }`, rendered as `/name sub`. |
| `adminOnly` | Hidden from non-admins in the slash picker. |
| `quiet` | Ephemeral where supported. |
| `usage` | How the command is written after `@keef` in the help list. Defaults to `name`. |
| `hidden: true` | Left out of the help list. |
| `response` | A fixed reply. Otherwise `run(ctx, { text, ukMode, serverId })`. |

- `ctx.reply` answers the command. `ctx.announce` posts later, after an
  interaction token would have expired (15 minutes); use it from timers.
- When joining voice, do not wait for the Ready state. If keef is already in
  the call the connection is already Ready and the listener never fires.
- The stats chart goes out as a file attachment, not an embed image, because
  attachments render inline and wider.
- A trailing `bruv` sets `ukMode`; wording should branch on it where the
  existing commands do.
- `serverId` is the `servers` table primary key, which is the Discord guild
  id stored as TEXT. The sesh map and the db are both keyed by it.
- Sesh lifecycle lives in `server/bot/sesh.js`: `startSesh`, `stopSesh`,
  `resumeSeshes`, `announce`. The `sesh` map exported from there is the
  in-memory view and documents the entry shape; the `seshes` table mirrors
  it so a restart can rebuild it. Every start upserts a row and every stop
  deletes it, so the table is empty whenever nobody is mid-sesh.
- Call `stopSesh` before destroying a voice connection; the Destroyed
  handler treats a missing sesh as "already ended on purpose".
- Voice connection listeners belong in `watchVoiceConnection`, behind the
  once-per-connection guard. `joinVoiceChannel` returns the existing
  connection when keef is already in the call, so listeners added elsewhere
  stack.
- The next bowl is arithmetic from `startedAt` and `minutes`, never stored.
  A resumed sesh fires its first bowl at the original due time, then falls
  into the normal interval.
- Owner-only DM commands live in `server/bot/dms.js`: `/servers`, `/seshes`,
  `/announcement`, `/help`.
- Seshes survive a redeploy silently. The `shutdown` handler in
  `server/bot/events.js` marks the process as shutting down (so nothing
  deletes rows or announces a kick while the old container dies), flushes
  the owner log, and exits. On the next `clientReady`, `resumeSeshes`
  rejoins each row's call and drops rows whose call is empty or gone. Users
  are told nothing: the restart is fast enough that keef never visibly
  leaves the call. Keep the shutdown grace short; Railway force-kills a
  container that lingers after SIGTERM.
- Railway runs the old and new containers together for a few seconds. The
  new one rejoining while the old is still in the call relies on Discord
  handing the voice state to the most recent gateway session. Unverified on
  this bot as of 2026-09-19; the first redeploy with a live sesh is the test.

## Discord facts that have bitten us

- Error 50001 (Missing Access) is what Discord returns when keef cannot see
  a channel; 50013 (Missing Permissions) when it can see it but cannot act.
  Discord is not always consistent between the two.
- Voice close code 4014 means keef was disconnected, moved somewhere it
  cannot join, the channel was deleted, **or the main gateway session was
  dropped by Discord**. `@discordjs/voice` parks the connection in
  Disconnected and never recovers on its own. Our handler gives it five
  seconds to re-signal, then decides: if the gateway is not Ready, the
  adapter was unavailable, or a shard disconnect/reconnect/resume happened
  in the last minute, it is a blip and we rejoin with retries; otherwise a
  person did it and keef leaves silently. Nothing is posted to the server on
  a kick or a failed rejoin; only "where'd everyone go" when a call is empty.
- Shard events (`shardDisconnect`, `shardReconnecting`, `shardResume`) only
  record a timestamp for that check. They are routine, several times a day,
  and are not logged.
- Any other voice close makes the library re-send the join with no retry
  cap. "Unexpected server response: 521/522" is Cloudflare in front of
  Discord's voice edge, not us.
- Being removed from a server destroys the voice connection before the guild
  leaves the cache. Defer one tick and check `guilds.cache` before posting.
- The bot has no Message Content intent, so it only sees the text of
  messages that mention it or are DMs to it. That is why owner commands are
  DMs. The `Partials.Channel` partial is required or DM messages are dropped
  before the channel is cached.
- Slash commands only appear in servers that granted the
  `applications.commands` OAuth scope.
- A team-owned application reports a Team as its owner. The human to DM is
  the team's owner, which `ownerIdOf` in `server/bot/dms.js` unwraps.
- Interaction replies past about three seconds fail with 10062 or 40060.
  Either the token expired before we saw it, or another instance of the bot
  answered first, which happens briefly during every deploy.
- `server/index.js` loads dotenv before requiring anything else, because the
  db module opens `DATABASE_PATH` at require time.

## Code style

- **No comments**, with one exception: a magic number or string whose value
  cannot be worked out from the code, such as `MAX_DM = 1900` or the error
  codes in `UNANSWERABLE`. Everything else a comment might say belongs in
  this file (a Discord fact, an ordering constraint, a convention) or in
  `README.md` (layout, operations), or in git history (what changed and why).
  When a change makes a kept comment stale, fix it in the same change.
- `//TODO:` comments are Evan's backlog. Leave them unless asked.
- Match the existing voice: lowercase, casual, keef's messages are in
  character.

## Keeping this file current

Update this file in the same change whenever you add a log category, a
level rule, a command convention, a DM command, or learn a Discord fact the
hard way. Update `README.md` instead when the layout, hosting, configuration,
or operations change.
