// TEMPORARY: one-time seeding of the Railway volume from a database file
// shipped in the repo. Remove this file, the call in db/index.js, the seed
// file under data/, and the .gitignore exception once the data is live.
//
// Behaviour:
//   SEED_DATABASE unset  -> do nothing, log that the existing file is kept.
//   SEED_DATABASE=1      -> remove any -wal/-shm sidecars at DATABASE_PATH,
//                           overwrite DATABASE_PATH with the seed file, verify
//                           the copy, log the resulting size and row counts.
//   Any failure          -> throw. The bot must not start against an empty
//                           or half-copied database during the cutover.

const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const SEED_FILE = path.join(__dirname, "..", "data", "bowlbot.sqlite");

function seedIfRequested(destPath) {
  const flag = process.env.SEED_DATABASE;
  if (flag !== "1") {
    console.log(
      `[seed] SEED_DATABASE is ${flag === undefined ? "not set" : JSON.stringify(flag)}; keeping existing database at ${destPath}` +
        (fs.existsSync(destPath) ? ` (${fs.statSync(destPath).size} bytes)` : " (does not exist yet)"),
    );
    return false;
  }

  if (!fs.existsSync(SEED_FILE)) {
    throw new Error(`[seed] SEED_DATABASE=1 but seed file is missing: ${SEED_FILE}`);
  }
  const seedSize = fs.statSync(SEED_FILE).size;
  console.log(`[seed] SEED_DATABASE=1: overwriting ${destPath} with ${SEED_FILE} (${seedSize} bytes)`);

  fs.mkdirSync(path.dirname(path.resolve(destPath)), { recursive: true });

  // A stale WAL or shared-memory file from the previous database would be
  // applied on top of the new one and corrupt reads. Remove them first.
  for (const suffix of ["-wal", "-shm", "-journal"]) {
    const sidecar = destPath + suffix;
    if (fs.existsSync(sidecar)) {
      fs.rmSync(sidecar, { force: true });
      console.log(`[seed] removed stale sidecar ${sidecar}`);
    }
  }

  fs.copyFileSync(SEED_FILE, destPath);

  const copiedSize = fs.statSync(destPath).size;
  if (copiedSize !== seedSize) {
    throw new Error(`[seed] size mismatch after copy: seed ${seedSize} bytes, destination ${copiedSize} bytes`);
  }

  // Open the copy read-only and prove it is a sane database before the bot
  // opens it for real.
  const check = new DatabaseSync(destPath, { readOnly: true });
  try {
    const quick = check.prepare("PRAGMA quick_check").get().quick_check;
    if (quick !== "ok") throw new Error(`[seed] quick_check on copied database returned: ${quick}`);
    const servers = check.prepare("SELECT COUNT(*) AS n FROM servers").get().n;
    const bowls = check.prepare("SELECT COUNT(*) AS n FROM bowls").get().n;
    console.log(`[seed] done: ${destPath} is ${copiedSize} bytes, quick_check ok, ${servers} servers, ${bowls} bowls`);
  } finally {
    check.close();
  }
  return true;
}

module.exports = { seedIfRequested, SEED_FILE };
