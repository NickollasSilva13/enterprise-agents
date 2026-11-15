import type { Office } from '@ea/shared';
import type { FastifyInstance } from 'fastify';
import type { Database } from '../../db/client';
import type { ToolRegistry } from '../../tools/registry';
import { getOffice } from './service';

export function registerOfficeRoutes(
  app: FastifyInstance,
  deps: { database: Database; registry: ToolRegistry },
): void {
  app.get('/api/office', async (): Promise<Office> => getOffice(deps.database.db, deps.registry));
}
