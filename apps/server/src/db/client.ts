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

/**
 * Applies pending migrations. Safe to call on every start.
 *
 * Foreign keys are off while they run. SQLite rebuilds a table by dropping it,
 * and a drop does an implicit DELETE first: with the keys on, that cascades
 * (dropping `providers` would delete every model). Drizzle puts
 * `PRAGMA foreign_keys=OFF` in such migrations, but the pragma does nothing
 * inside a transaction, and the migrator runs them all in one. So it is done
 * here, on the connection, and the keys are checked once the work is done.
 */
export function runMigrations(database: Database, migrationsFolder = MIGRATIONS_DIR): void {
  const { sqlite } = database;
  sqlite.pragma('foreign_keys = OFF');
  try {
    migrate(database.db, { migrationsFolder });
    const broken = sqlite.pragma('foreign_key_check') as unknown[];
    if (broken.length > 0) {
      throw new Error(
        `A migração deixou ${broken.length} referência(s) quebrada(s) entre tabelas. ` +
          'O servidor não inicia sobre um banco nesse estado.',
      );
    }
  } finally {
    sqlite.pragma('foreign_keys = ON');
  }
}
