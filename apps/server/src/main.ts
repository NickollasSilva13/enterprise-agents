import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConfigError, loadConfig } from './config/env';
import { loadEnvFile } from './config/load-env-file';
import { SERVER_ROOT } from './config/paths';
import { openDatabase, runMigrations } from './db/client';
import { buildApp } from './http/app';
import { KeyringSecretStore, MemorySecretStore } from './security/secret-store';

function readVersion(): string {
  const manifest = JSON.parse(readFileSync(join(SERVER_ROOT, 'package.json'), 'utf8')) as {
    version?: string;
  };
  return manifest.version ?? '0.0.0';
}

async function main(): Promise<void> {
  loadEnvFile();
  const config = loadConfig(process.env);

  mkdirSync(config.dataDir, { recursive: true });
  const database = openDatabase(config.databasePath);
  runMigrations(database);

  const secrets =
    config.secretStore === 'memory' ? new MemorySecretStore() : new KeyringSecretStore();
  const app = await buildApp({ config, database, version: readVersion(), secrets });
  if (config.secretStore === 'memory') {
    app.log.warn('SECRET_STORE=memory: API keys are kept in memory and lost on exit');
  }

  let closing = false;
  const shutdown = (signal: string) => {
    if (closing) return;
    closing = true;
    app.log.info({ signal }, 'shutting down');
    app
      .close()
      .catch((error: unknown) => app.log.error({ err: error }, 'error while closing'))
      .finally(() => {
        database.close();
        process.exit(0);
      });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  try {
    await app.listen({ host: config.host, port: config.port });
  } catch (error) {
    database.close();
    if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') {
      console.error(
        `A porta ${config.port} já está em uso. Encerre o outro processo ou defina APP_PORT no arquivo .env.`,
      );
      process.exit(1);
    }
    throw error;
  }

  if (config.env !== 'development') {
    console.log(`\nEnterprise Agents em http://${config.host}:${config.port}\n`);
  }
}

main().catch((error: unknown) => {
  if (error instanceof ConfigError) {
    console.error(error.message);
  } else {
    console.error(error);
  }
  process.exit(1);
});
