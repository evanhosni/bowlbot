# bowlbot

https://bowlbot.io

A Discord bot for cannabis patients and adults. Mention it with a number of
minutes and it joins your voice channel and plays a reminder on that interval,
recording each one so servers can see their stats and, if they opt in, appear
on the leaderboards at bowlbot.io.

## How it runs

One Node process (`node server`) does everything: the Discord client, and an
Express + socket.io server that serves the website from `client/` and pushes
live stats to it.

## Layout

```
server/            everything that runs on Railway
  index.js         entry point: env, web server, then the bot
  log.js           guild-scoped error logging + process crash guards
  text.js          long user-facing strings (disclaimer, help, welcome)
  leaderboards.js  per-server stats, the sorted boards, and the cumulative chart series the site asks for
  web/             Express static server + socket.io events
  bot/
    client.js      the discord.js Client
    commands.js    THE command table: one object per command, both interfaces read it
    sesh.js        sesh lifecycle: join voice, tick, stop, resume after a restart
    channels.js    which channel keef can actually post in
    dispatch.js    text -> command lookup, shared by mentions and slash
    mentions.js    @keef message handling
    slash.js       slash command definitions, registration, handling
    dms.js         DMs: owner announcements, "ayyyy" for everyone else
    events.js      ready / guildCreate / error / disconnect
    context.js     the reply/announce abstraction over message vs interaction
  db/              SQLite access and migrations
client/            the website, served as-is
  index.html
  css/ js/ images/
  js/smoke.js      GPU fluid simulation drawing the smoke behind the modals;
                   images/smoke.png is the fallback when WebGL2 is unavailable
  vendor/counter/  third-party odometer widget
audio/             the reminder clips the bot plays
scripts/backup.js  online SQLite backup
```

To add a bot command, add one object to `server/bot/commands.js`. It shows up
as both `@keef <name>` and `/<name>` with no other changes.

- **Hosting:** [Railway](https://railway.com), single replica. Pushing to
  `main` deploys. Build and start settings live in `railway.json`, not the
  dashboard. Node version is pinned by `.node-version` and `engines`.
- **Database:** SQLite via `node:sqlite`, one file on a Railway volume at
  `/data/bowlbot.sqlite`. Opened once at startup in WAL mode. All SQL is in
  `server/db/index.js`; the schema and its migration runner are in
  `server/db/schema.js`.
  Migrations are an append-only array applied automatically at boot using
  `PRAGMA user_version`, each in its own transaction. Three tables:
  `servers`, `bowls`, and `seshes`, which holds one row per sesh running
  right now so a redeploy can rejoin them.
- **DNS:** Cloudflare, proxied. `bowlbot.io` points at the Railway service.
  `bowlbot.app` (the old domain) is not on Cloudflare yet and currently
  resolves to a stale GitHub Pages site; a redirect to `bowlbot.io` is
  planned once it is moved.

## Configuration

Copy `.env.example` to `.env` for local development. Every variable is
documented there. In short:

| Variable        | Purpose                                                  |
| --------------- | -------------------------------------------------------- |
| `DISCORD_TOKEN` | Discord bot token.                                       |
| `DATABASE_PATH` | Path to the SQLite file. `/data/bowlbot.sqlite` on Railway, `./data/bowlbot.sqlite` locally. |
| `PORT`          | HTTP port. Injected by Railway; defaults to 3000 locally. |

## Running locally

```
npm install
cp .env.example .env   # fill in DISCORD_TOKEN
npm start
```

The database file and its directory are created on first start. `data/` is
gitignored.

To work on the website against the live numbers without starting the bot:

```
npm run web
```

This serves `client/` on port 3000 with no Discord login. The page loads
`/config.js`, which in this mode points the socket at `https://bowlbot.io`,
so leaderboards, the counter, and the chart show production data. In a
normal run and on Railway that route is empty and the socket stays on the
same origin. This relies on the production socket.io server accepting any
origin. The database itself never leaves the Railway volume; it is SQLite on
a mounted disk, so nothing can open it from outside the container.

## Adding a schema change

Append a function to `MIGRATIONS` in `server/db/schema.js`. Never edit or reorder an
existing entry. The new migration runs on the next deploy against the volume
database; no data shuffling is needed for `CREATE INDEX` or
`ALTER TABLE ADD COLUMN`.

## Backups

The volume is a single point of failure. `scripts/backup.js` copies the live
database using `node:sqlite`'s online backup API, which is safe while the bot
is running and writing. A plain `cp` is not, because of the WAL.

```
DATABASE_PATH=/data/bowlbot.sqlite node scripts/backup.js [dest]
```

or `npm run backup`. Without `dest` it writes a timestamped
`bowlbot.<UTC time>.bak.sqlite` next to the source.

## Operations

- **Cloudflare Browser Cache TTL must stay on "Respect Existing Headers".**
  The site's asset filenames are not hashed (`css/style.css`, `js/client.js`, ...),
  and Express serves them with `max-age=0` plus an ETag so browsers revalidate
  on every visit and get a cheap 304. Cloudflare's default of a fixed TTL
  (four hours) overrides that header, and returning visitors then get fresh
  HTML with stale JS and CSS for up to four hours after a deploy. Cloudflare
  still edge-caches the assets either way; this setting only affects what the
  browser is told.
- **Single replica only.** `railway.json` pins `numReplicas` to 1. Two
  containers writing one SQLite file on the same volume would corrupt it.
- **The `SEED_DATABASE` mechanism used for the initial cutover is gone.** To
  restore the database from a backup, stop the service, replace
  `/data/bowlbot.sqlite` (and delete any `-wal` / `-shm` files next to it),
  and start it again.
