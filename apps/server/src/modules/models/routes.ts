import type { ModelOption } from '@ea/shared';
import { asc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Database, Db } from '../../db/client';
import { models, providers } from '../../db/schema';

/** Models an agent can be given: enabled ones, with their provider. */
export function listModelOptions(db: Db): ModelOption[] {
  return db
    .select({
      id: models.id,
      name: models.name,
      displayName: models.displayName,
      providerName: providers.name,
      isExternal: providers.isExternal,
      supportsTools: models.supportsTools,
    })
    .from(models)
    .innerJoin(providers, eq(models.providerId, providers.id))
    .where(eq(models.enabled, true))
    .orderBy(asc(providers.name), asc(models.displayName))
    .all();
}

// Read-only for now; providers and models are managed from Phase 6.
export function registerModelRoutes(app: FastifyInstance, deps: { database: Database }): void {
  app.get('/api/models', async () => ({ models: listModelOptions(deps.database.db) }));
}
