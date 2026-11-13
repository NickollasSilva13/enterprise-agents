import type { HealthResponse } from '@ea/shared';
import type { FastifyInstance } from 'fastify';
import type { Database } from '../../db/client';

export interface HealthDeps {
  readonly database: Database;
  readonly version: string;
}

function databaseIsReachable(database: Database): boolean {
  try {
    database.sqlite.prepare('SELECT 1').get();
    return true;
  } catch {
    return false;
  }
}

export function registerHealthRoutes(app: FastifyInstance, deps: HealthDeps): void {
  app.get('/api/health', async (): Promise<HealthResponse> => {
    const databaseOk = databaseIsReachable(deps.database);
    return {
      status: databaseOk ? 'ok' : 'degraded',
      version: deps.version,
      uptimeSeconds: Math.round(process.uptime()),
      database: databaseOk ? 'ok' : 'error',
    };
  });
}
