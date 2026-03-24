// Stub — sql.js is used instead of the native better-sqlite3.
// This stub exists only to satisfy drizzle-orm's import resolution.
class Database {
  constructor() {
    throw new Error("better-sqlite3 stub: use sql.js via sqlite-compat.ts instead");
  }
}
module.exports = Database;
module.exports.default = Database;
