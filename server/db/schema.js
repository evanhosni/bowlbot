const MIGRATIONS = [
  // ids are TEXT: Discord snowflakes exceed 2^53.
  (db) => {
    db.exec(`
      CREATE TABLE servers (
        id   TEXT    NOT NULL PRIMARY KEY,
        name TEXT    NOT NULL,
        rank INTEGER NOT NULL DEFAULT 0 CHECK (rank IN (0, 1))
      ) STRICT;

      CREATE TABLE bowls (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        schmokedAt INTEGER NOT NULL,
        serverId   TEXT REFERENCES servers(id) ON DELETE SET NULL ON UPDATE CASCADE
      ) STRICT;

      CREATE INDEX bowls_serverId_schmokedAt ON bowls (serverId, schmokedAt);
    `);
  },
  (db) => {
    db.exec(`
      CREATE TABLE seshes (
        serverId       TEXT    NOT NULL PRIMARY KEY REFERENCES servers(id) ON DELETE CASCADE ON UPDATE CASCADE,
        voiceChannelId TEXT    NOT NULL,
        textChannelId  TEXT    NOT NULL,
        minutes        INTEGER NOT NULL,
        startedAt      INTEGER NOT NULL,
        ukMode         INTEGER NOT NULL DEFAULT 0 CHECK (ukMode IN (0, 1))
      ) STRICT;
    `);
  },
];

function migrate(db) {
  const current = db.prepare("PRAGMA user_version").get().user_version;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.exec("BEGIN");
    try {
      MIGRATIONS[v](db);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }
  return MIGRATIONS.length;
}

module.exports = { migrate, MIGRATIONS };
