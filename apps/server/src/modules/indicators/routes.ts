import type { Indicators } from '@ea/shared';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db/client';
import { getIndicators } from './service';

// The indicators of the office (Phase 30).
export function registerIndicatorRoutes(app: FastifyInstance, deps: { db: Db }): void {
  app.get('/api/indicators', async (): Promise<Indicators> => getIndicators(deps.db));
}
