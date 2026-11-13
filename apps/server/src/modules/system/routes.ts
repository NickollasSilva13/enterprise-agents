import type { SystemInfo } from '@ea/shared';
import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../../config/env';

export interface SystemDeps {
  readonly config: AppConfig;
  readonly version: string;
  readonly startedAt: Date;
}

export function registerSystemRoutes(app: FastifyInstance, deps: SystemDeps): void {
  const { config } = deps;
  app.get('/api/system/info', async (): Promise<SystemInfo> => ({
    version: deps.version,
    nodeVersion: process.version,
    platform: process.platform,
    environment: config.env,
    address: `http://${config.host}:${config.port}`,
    dataDir: config.dataDir,
    databasePath: config.databasePath,
    maxConcurrentRuns: config.maxConcurrentRuns,
    secretStore: config.secretStore,
    startedAt: deps.startedAt.toISOString(),
  }));
}
