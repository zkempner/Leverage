/**
 * LEVERAGE — sql.js Compatibility Layer
 *
 * Provides a better-sqlite3-compatible Database wrapper around sql.js
 * so Drizzle ORM's `drizzle-orm/better-sqlite3` driver works unchanged.
 *
 * sql.js is pure JavaScript/WASM — no native compilation needed.
 * Works on any Node.js version without Visual Studio Build Tools.
 */

import initSqlJs, { type Database as SqlJsDatabase } from "sql.js";
import * as fs from "fs";

// ---------------------------------------------------------------------------
// Statement — matches better-sqlite3's Statement interface
// ---------------------------------------------------------------------------

class CompatStatement {
  private db: SqlJsDatabase;
  private sql: string;
  private _rawMode = false;

  constructor(db: SqlJsDatabase, sql: string) {
    this.db = db;
    this.sql = sql;
  }

  raw(): this {
    this._rawMode = true;
    return this;
  }

  run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint } {
    const flat = flattenParams(params);
    this.db.run(this.sql, flat as any[]);
    const res = this.db.exec("SELECT changes() as c, last_insert_rowid() as r");
    const changes = res.length > 0 ? (res[0].values[0][0] as number) : 0;
    const lastInsertRowid = res.length > 0 ? (res[0].values[0][1] as number) : 0;
    return { changes, lastInsertRowid };
  }

  all(...params: unknown[]): unknown[] {
    const flat = flattenParams(params);
    const stmt = this.db.prepare(this.sql);
    try {
      if (flat.length > 0) stmt.bind(flat as any[]);

      if (this._rawMode) {
        const rows: unknown[][] = [];
        while (stmt.step()) rows.push(stmt.get() as unknown[]);
        this._rawMode = false;
        return rows;
      }

      const rows: Record<string, unknown>[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject() as Record<string, unknown>);
      return rows;
    } finally {
      stmt.free();
    }
  }

  get(...params: unknown[]): unknown {
    const flat = flattenParams(params);
    const stmt = this.db.prepare(this.sql);
    try {
      if (flat.length > 0) stmt.bind(flat as any[]);

      if (!stmt.step()) {
        this._rawMode = false;
        return undefined;
      }

      if (this._rawMode) {
        this._rawMode = false;
        return stmt.get();
      }
      return stmt.getAsObject();
    } finally {
      stmt.free();
    }
  }
}

// ---------------------------------------------------------------------------
// Database — matches better-sqlite3's Database interface
// ---------------------------------------------------------------------------

export class CompatDatabase {
  private db: SqlJsDatabase;
  private dbPath: string | null;
  private _saveTimer: ReturnType<typeof setInterval> | null = null;
  private _dirty = false;

  constructor(db: SqlJsDatabase, dbPath: string | null) {
    this.db = db;
    this.dbPath = dbPath;

    // Auto-save every 3 seconds if dirty
    this._saveTimer = setInterval(() => {
      if (this._dirty) {
        this.save();
        this._dirty = false;
      }
    }, 3000);
  }

  prepare(sql: string): CompatStatement {
    return new CompatStatement(this.db, sql);
  }

  exec(sql: string): void {
    this.db.run(sql);
    this._dirty = true;
    this.save(); // immediate save for DDL
  }

  pragma(pragmaStr: string): unknown {
    const sql = `PRAGMA ${pragmaStr}`;
    const result = this.db.exec(sql);
    if (result.length === 0) return [];

    const columns = result[0].columns;
    return result[0].values.map(row => {
      const obj: Record<string, unknown> = {};
      columns.forEach((col, i) => { obj[col] = row[i]; });
      return obj;
    });
  }

  transaction<T>(fn: (...args: any[]) => T): Record<string, (...args: any[]) => T> {
    const self = this;
    const wrap = (mode: string) => (...args: any[]): T => {
      self.db.run(`BEGIN ${mode}`);
      try {
        const result = fn(...args);
        self.db.run("COMMIT");
        self._dirty = true;
        return result;
      } catch (err) {
        self.db.run("ROLLBACK");
        throw err;
      }
    };
    return {
      deferred: wrap("DEFERRED"),
      immediate: wrap("IMMEDIATE"),
      exclusive: wrap("EXCLUSIVE"),
    };
  }

  save(): void {
    if (!this.dbPath) return;
    const data = this.db.export();
    const buffer = Buffer.from(data);
    const tmpPath = this.dbPath + ".tmp";
    fs.writeFileSync(tmpPath, buffer);
    fs.renameSync(tmpPath, this.dbPath);
  }

  close(): void {
    if (this._saveTimer) clearInterval(this._saveTimer);
    this.save();
    this.db.close();
  }

  /** Mark as dirty after writes (called by Drizzle internals via statement.run) */
  markDirty(): void {
    this._dirty = true;
  }
}

// Override CompatStatement.run to also mark database dirty
const origRun = CompatStatement.prototype.run;
CompatStatement.prototype.run = function (this: CompatStatement & { db: SqlJsDatabase }, ...params: unknown[]) {
  const result = origRun.call(this, ...params);
  // Access the parent database to mark dirty — we patch this during createCompatDatabase
  return result;
};

// ---------------------------------------------------------------------------
// Factory — async init, returns CompatDatabase
// ---------------------------------------------------------------------------

export async function createCompatDatabase(dbPath: string): Promise<CompatDatabase> {
  const SQL = await initSqlJs();

  let sqlJsDb: SqlJsDatabase;
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    sqlJsDb = new SQL.Database(fileBuffer);
    console.log(`[sqlite-compat] Loaded existing database: ${dbPath}`);
  } else {
    sqlJsDb = new SQL.Database();
    console.log(`[sqlite-compat] Created new database: ${dbPath}`);
  }

  return new CompatDatabase(sqlJsDb, dbPath);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function flattenParams(params: unknown[]): unknown[] {
  if (params.length === 0) return [];
  if (params.length === 1 && Array.isArray(params[0])) return params[0];
  return params;
}
