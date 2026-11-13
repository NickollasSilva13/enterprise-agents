import { modelUpdateSchema, providerCreateSchema, providerUpdateSchema } from '@ea/shared';
import type { FastifyInstance } from 'fastify';
import { idParamSchema, parseInput } from '../../http/error-handler';
import {
  createProviderRecord,
  deleteProviderRecord,
  listProviderModels,
  listProviders,
  type ProviderDeps,
  syncProviderModels,
  testProviderConnection,
  updateModel,
  updateProviderRecord,
} from './service';

export function registerProviderRoutes(app: FastifyInstance, deps: ProviderDeps): void {
  const idOf = (params: unknown) => parseInput(idParamSchema, params).id;

  app.get('/api/providers', async () => ({ providers: listProviders(deps) }));

  app.post('/api/providers', async (request, reply) => {
    const provider = createProviderRecord(deps, parseInput(providerCreateSchema, request.body));
    return reply.status(201).send(provider);
  });

  app.patch('/api/providers/:id', async (request) =>
    updateProviderRecord(
      deps,
      idOf(request.params),
      parseInput(providerUpdateSchema, request.body),
    ),
  );

  app.delete('/api/providers/:id', async (request, reply) => {
    deleteProviderRecord(deps, idOf(request.params));
    return reply.status(204).send();
  });

  app.post('/api/providers/:id/test', async (request) =>
    testProviderConnection(deps, idOf(request.params)),
  );

  app.get('/api/providers/:id/models', async (request) => ({
    models: listProviderModels(deps, idOf(request.params)),
  }));

  app.post('/api/providers/:id/models/sync', async (request) =>
    syncProviderModels(deps, idOf(request.params)),
  );

  app.patch('/api/models/:id', async (request) =>
    updateModel(deps, idOf(request.params), parseInput(modelUpdateSchema, request.body)),
  );
}
