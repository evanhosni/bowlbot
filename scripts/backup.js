#!/usr/bin/env node
// Online backup of the live SQLite file. Safe while the bot is writing, unlike cp.

const { DatabaseSync, backup } = require("node:sqlite");
const path = require("node:path");
const fs = require("node:fs");
require("dotenv").config();

async function main() {
  const src = process.env.DATABASE_PATH;
  if (!src) {
    console.error("DATABASE_PATH is not set");
    process.exit(1);
  }
  if (!fs.existsSync(src)) {
    console.error(`source database not found: ${src}`);
    process.exit(1);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const ext = path.extname(src);
  const base = path.basename(src, ext);
  const dest = process.argv[2] || path.join(path.dirname(src), `${base}.${stamp}.bak${ext || ".sqlite"}`);

  fs.mkdirSync(path.dirname(path.resolve(dest)), { recursive: true });

  const db = new DatabaseSync(src, { readOnly: true });
  try {
    const pages = await backup(db, dest, { rate: 256 });
    const bytes = fs.statSync(dest).size;
    console.log(`backed up ${src} -> ${dest} (${pages} pages, ${bytes} bytes)`);
  } finally {
    db.close();
  }
}

main().catch((err) => {
  console.error("backup failed:", err);
  process.exit(1);
});
