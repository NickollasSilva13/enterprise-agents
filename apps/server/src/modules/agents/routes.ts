import {
  type AgentExport,
  agentCreateSchema,
  agentExportQuerySchema,
  agentExportSchema,
  type AgentImportResult,
  agentUpdateSchema,
} from '@ea/shared';
import type { FastifyInstance } from 'fastify';
import type { Database } from '../../db/client';
import { idParamSchema, parseInput } from '../../http/error-handler';
import type { ToolRegistry } from '../../tools/registry';
import {
  createAgent,
  deleteAgent,
  duplicateAgent,
  getAgent,
  listAgents,
  updateAgent,
} from './service';
import { exportAgents, importAgents } from './transfer';

export function registerAgentRoutes(
  app: FastifyInstance,
  deps: { database: Database; registry: ToolRegistry },
): void {
  const { db } = deps.database;
  const idOf = (params: unknown) => parseInput(idParamSchema, params).id;

  app.get('/api/agents', async () => ({ agents: listAgents(db) }));

  // Agents as a JSON document, with nothing secret in it (RF-20, RN-11).
  app.get('/api/agents/export', async (request): Promise<AgentExport> => {
    const { ids } = parseInput(agentExportQuerySchema, request.query);
    return exportAgents(db, ids === undefined ? undefined : ids.split(',').filter(Boolean));
  });

  app.post('/api/agents/import', async (request, reply): Promise<AgentImportResult> => {
    const result = importAgents(db, deps.registry, parseInput(agentExportSchema, request.body));
    return reply.status(201).send(result);
  });

  app.get('/api/agents/:id', async (request) => getAgent(db, idOf(request.params)));

  app.post('/api/agents', async (request, reply) => {
    const agent = createAgent(db, parseInput(agentCreateSchema, request.body));
    return reply.status(201).send(agent);
  });

  // Also how an agent is activated or deactivated: { "enabled": false }.
  app.patch('/api/agents/:id', async (request) =>
    updateAgent(db, idOf(request.params), parseInput(agentUpdateSchema, request.body)),
  );

  app.post('/api/agents/:id/duplicate', async (request, reply) => {
    const copy = duplicateAgent(db, idOf(request.params));
    return reply.status(201).send(copy);
  });

  app.delete('/api/agents/:id', async (request, reply) => {
    deleteAgent(db, idOf(request.params));
    return reply.status(204).send();
  });
}
