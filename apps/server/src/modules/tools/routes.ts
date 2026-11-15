import { agentToolsUpdateSchema, type ToolCatalogue, toolSettingSchema } from '@ea/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { idParamSchema, parseInput } from '../../http/error-handler';
import { getAgentTools, listTools, setAgentTools, setToolEnabled, type ToolsDeps } from './service';

const nameParamSchema = z.object({ name: z.string().min(1).max(41) });

export function registerToolRoutes(app: FastifyInstance, deps: ToolsDeps): void {
  const idOf = (params: unknown) => parseInput(idParamSchema, params).id;

  app.get('/api/tools', async (): Promise<ToolCatalogue> => ({ tools: listTools(deps) }));

  // Only for tools that are off by default (today, running scripts).
  app.patch('/api/tools/:name', async (request) =>
    setToolEnabled(
      deps,
      parseInput(nameParamSchema, request.params).name,
      parseInput(toolSettingSchema, request.body).enabled,
    ),
  );

  app.get('/api/agents/:id/tools', async (request) => getAgentTools(deps, idOf(request.params)));

  app.put('/api/agents/:id/tools', async (request) =>
    setAgentTools(deps, idOf(request.params), parseInput(agentToolsUpdateSchema, request.body)),
  );
}
