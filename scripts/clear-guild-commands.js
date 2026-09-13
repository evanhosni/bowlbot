#!/usr/bin/env node
// One-off: remove per-server slash commands from every server keef is in.
// Keef used to register /stop and /enable|disable rank per server and swap them
// as state changed; those are now global, and any leftovers would show up as
// duplicates in the picker. Safe to re-run. Servers that never granted the
// applications.commands scope are skipped.
//
// Usage: DISCORD_TOKEN=... node scripts/clear-guild-commands.js

require("dotenv").config();

const API = "https://discord.com/api/v10";
const headers = { Authorization: `Bot ${process.env.DISCORD_TOKEN}`, "content-type": "application/json" };
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

async function api(path, init) {
  for (;;) {
    const res = await fetch(API + path, { headers, ...init });
    if (res.status !== 429) return res;
    const { retry_after: retryAfter = 1 } = await res.json();
    await sleep(retryAfter * 1000 + 100);
  }
}

async function allGuilds() {
  const guilds = [];
  let after = "0";
  for (;;) {
    const page = await (await api(`/users/@me/guilds?limit=200&after=${after}`)).json();
    guilds.push(...page);
    if (page.length < 200) return guilds;
    after = page[page.length - 1].id;
  }
}

async function main() {
  if (!process.env.DISCORD_TOKEN) {
    console.error("DISCORD_TOKEN is not set");
    process.exit(1);
  }
  const app = await (await api("/applications/@me")).json();
  const guilds = await allGuilds();
  let cleared = 0;
  let skipped = 0;
  for (const guild of guilds) {
    const res = await api(`/applications/${app.id}/guilds/${guild.id}/commands`, { method: "PUT", body: "[]" });
    if (res.ok) cleared++;
    else if (res.status === 403) skipped++;
    else console.error(`${guild.name} (${guild.id}): ${res.status} ${await res.text()}`);
    await sleep(50);
  }
  console.log(`cleared per-server commands in ${cleared} server(s), skipped ${skipped} without the applications.commands scope`);
}

main().catch((err) => {
  console.error("failed:", err);
  process.exit(1);
});
