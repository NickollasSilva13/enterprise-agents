import { mkdirSync } from 'node:fs';
import { loadConfig } from '../config/env';
import { loadEnvFile } from '../config/load-env-file';
import { openDatabase, runMigrations } from './client';

// Applies migrations without starting the server: `npm run db:migrate`.
loadEnvFile();
const config = loadConfig(process.env);
mkdirSync(config.dataDir, { recursive: true });
const database = openDatabase(config.databasePath);
try {
  runMigrations(database);
  console.log(`Migrações aplicadas em ${config.databasePath}`);
} finally {
  database.close();
}
