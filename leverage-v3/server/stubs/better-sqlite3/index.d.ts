// Stub type declarations for better-sqlite3 (real impl replaced by sql.js)
declare class Database {
  constructor(filename?: string, options?: any);
  prepare(sql: string): Statement;
  exec(sql: string): void;
  pragma(pragma: string, options?: any): any;
  transaction<T>(fn: (...args: any[]) => T): (...args: any[]) => T;
  close(): void;
}

declare class Statement {
  run(...params: any[]): RunResult;
  get(...params: any[]): any;
  all(...params: any[]): any[];
  raw(toggle?: boolean): this;
  bind(...params: any[]): this;
}

interface RunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

interface Options {
  readonly?: boolean;
  fileMustExist?: boolean;
  timeout?: number;
  verbose?: (message?: any, ...additionalArgs: any[]) => void;
  nativeBinding?: string;
}

export default Database;
export { Database, Statement, RunResult, Options };
