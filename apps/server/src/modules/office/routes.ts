import type { Office } from '@ea/shared';
import type { FastifyInstance } from 'fastify';
import type { Database } from '../../db/client';
import { getOffice } from './service';

export function registerOfficeRoutes(app: FastifyInstance, deps: { database: Database }): void {
  app.get('/api/office', async (): Promise<Office> => getOffice(deps.database.db));
}
