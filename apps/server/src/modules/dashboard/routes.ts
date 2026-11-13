import type { DashboardSummary } from '@ea/shared';
import type { FastifyInstance } from 'fastify';
import type { Database } from '../../db/client';
import { getDashboardSummary } from './service';

export function registerDashboardRoutes(app: FastifyInstance, deps: { database: Database }): void {
  app.get('/api/dashboard/summary', async (): Promise<DashboardSummary> =>
    getDashboardSummary(deps.database.db),
  );
}
