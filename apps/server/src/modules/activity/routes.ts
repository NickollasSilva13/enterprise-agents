import type { ActivityFeed } from '@ea/shared';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db/client';
import type { ToolRegistry } from '../../tools/registry';
import { recentActivity } from './service';

// The office's recent activity (Phase 29).
export function registerActivityRoutes(
  app: FastifyInstance,
  deps: { db: Db; registry: ToolRegistry },
): void {
  app.get('/api/activity', async (): Promise<ActivityFeed> =>
    recentActivity(deps.db, deps.registry),
  );
}
