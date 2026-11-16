import { type Office, type OfficeLayout, officeLayoutInputSchema } from '@ea/shared';
import type { FastifyInstance } from 'fastify';
import type { Database } from '../../db/client';
import { parseInput } from '../../http/error-handler';
import type { ToolRegistry } from '../../tools/registry';
import { currentLayout, getOffice, resetLayout, saveLayout } from './service';

export function registerOfficeRoutes(
  app: FastifyInstance,
  deps: { database: Database; registry: ToolRegistry },
): void {
  const { db } = deps.database;

  app.get('/api/office', async (): Promise<Office> => getOffice(db, deps.registry));

  // The whole layout at once: the editor saves everything or nothing.
  app.put('/api/office/layout', async (request): Promise<OfficeLayout> => {
    saveLayout(db, parseInput(officeLayoutInputSchema, request.body));
    return currentLayout(db).layout;
  });

  // Back to the automatic layout, rebuilt from the projects.
  app.delete('/api/office/layout', async (_request, reply) => {
    resetLayout(db);
    return reply.status(204).send();
  });
}
