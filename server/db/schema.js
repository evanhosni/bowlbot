// Append-only. Never edit or reorder an entry: PRAGMA user_version records how
// many have run, and each runs exactly once in its own transaction.

const MIGRATIONS = [
  // 0: initial schema, mirroring what Sequelize 4 created on Heroku Postgres.
  //   servers.id     BIGINT -> TEXT (Discord snowflakes exceed 2^53; pg returned them as strings)
  //   servers.rank   BOOLEAN -> INTEGER 0/1
  //   bowls.id       SERIAL -> INTEGER PRIMARY KEY AUTOINCREMENT
  //   bowls.schmokedAt TIMESTAMPTZ -> INTEGER epoch milliseconds
  //   bowls.serverId BIGINT FK -> TEXT FK, same ON DELETE / ON UPDATE rules
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
];

/**
 * Bring the database at `db` up to the latest schema version.
 * Each pending migration runs in its own BEGIN/COMMIT with the user_version
 * bump inside the transaction, so a crash mid-migration leaves the version
 * untouched and the migration re-runs cleanly next boot.
 */
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
