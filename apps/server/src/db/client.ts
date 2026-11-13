import BetterSqlite3 from 'better-sqlite3';
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { MIGRATIONS_DIR } from '../config/paths';
import * as schema from './schema';

export type Db = BetterSQLite3Database<typeof schema>;

export interface Database {
  readonly db: Db;
  readonly sqlite: BetterSqlite3.Database;
  close(): void;
}

/** Opens (creating if needed) the SQLite file. Use ":memory:" for throwaway databases. */
export function openDatabase(path: string): Database {
  const sqlite = new BetterSqlite3(path);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');

  return {
    db: drizzle(sqlite, { schema }),
    sqlite,
    close: () => {
      if (sqlite.open) sqlite.close();
    },
  };
}

/** Applies pending migrations. Safe to call on every start. */
export function runMigrations(database: Database, migrationsFolder = MIGRATIONS_DIR): void {
  migrate(database.db, { migrationsFolder });
}
