import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { type AppConfig, loadConfig } from '../src/config/env';
import { type Database, openDatabase, runMigrations } from '../src/db/client';
import { buildApp } from '../src/http/app';
import type { ProviderFactory } from '../src/providers/factory';
import { MemorySecretStore } from '../src/security/secret-store';
import type { ToolRegistry } from '../src/tools/registry';

export const TEST_PORT = 4317;
export const TEST_HOST = `127.0.0.1:${TEST_PORT}`;
export const TEST_ORIGIN = `http://127.0.0.1:${TEST_PORT}`;
export const TEST_SESSION_TOKEN = 'test-session-token';

export function makeConfig(env: Record<string, string> = {}): AppConfig {
  return loadConfig({ NODE_ENV: 'test', APP_PORT: String(TEST_PORT), ...env });
}

/** In-memory database with all migrations applied. */
export function makeDatabase(): Database {
  const database = openDatabase(':memory:');
  runMigrations(database);
  return database;
}

export function makeTempDir(): { path: string; remove: () => void } {
  const path = mkdtempSync(join(tmpdir(), 'ea-test-'));
  return { path, remove: () => rmSync(path, { recursive: true, force: true }) };
}

export interface TestApp {
  readonly app: FastifyInstance;
  readonly database: Database;
  readonly secrets: MemorySecretStore;
  /** Temporary DATA_DIR of this app: the agents' workspaces are under it. */
  readonly dataDir: string;
  /** Headers of a legitimate same-origin request carrying a valid session. */
  readonly trusted: Record<string, string>;
  close(): Promise<void>;
}

export async function makeApp(
  options: {
    env?: Record<string, string>;
    configure?: (app: FastifyInstance) => void;
    createProvider?: ProviderFactory;
    /** A database prepared beforehand, to test what the server does on start. */
    database?: Database;
    toolRegistry?: ToolRegistry;
  } = {},
): Promise<TestApp> {
  const database = options.database ?? makeDatabase();
  const secrets = new MemorySecretStore();
  // Never the real data folder: tools write files under DATA_DIR.
  const data = makeTempDir();
  const app = await buildApp({
    secrets,
    ...(options.createProvider ? { createProvider: options.createProvider } : {}),
    ...(options.toolRegistry ? { toolRegistry: options.toolRegistry } : {}),
    config: makeConfig({ DATA_DIR: data.path, ...options.env }),
    database,
    version: '0.0.0-test',
    sessionToken: TEST_SESSION_TOKEN,
  });
  options.configure?.(app);
  await app.ready();

  return {
    app,
    database,
    secrets,
    dataDir: data.path,
    trusted: {
      host: TEST_HOST,
      origin: TEST_ORIGIN,
      'sec-fetch-site': 'same-origin',
      cookie: `ea_session=${TEST_SESSION_TOKEN}`,
    },
    close: async () => {
      await app.close();
      database.close();
      data.remove();
    },
  };
}
