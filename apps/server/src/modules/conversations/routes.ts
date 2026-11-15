import { conversationStartSchema, messageSendSchema } from '@ea/shared';
import type { FastifyInstance } from 'fastify';
import { idParamSchema, parseInput } from '../../http/error-handler';
import { type RunsContext, sendMessage, startConversation } from '../runs/service';
import { deleteConversation, getConversation, listConversations } from './service';

export function registerConversationRoutes(
  app: FastifyInstance,
  deps: { runs: RunsContext },
): void {
  const { db } = deps.runs;
  const idOf = (params: unknown) => parseInput(idParamSchema, params).id;

  app.get('/api/agents/:id/conversations', async (request) => ({
    conversations: listConversations(db, idOf(request.params)),
  }));

  // 202: the message was accepted; the answer arrives through the run's events.
  app.post('/api/conversations', async (request, reply) => {
    const input = parseInput(conversationStartSchema, request.body);
    return reply.status(202).send(startConversation(deps.runs, input.agentId, input.content));
  });

  app.get('/api/conversations/:id', async (request) => getConversation(db, idOf(request.params)));

  app.post('/api/conversations/:id/messages', async (request, reply) => {
    const { content } = parseInput(messageSendSchema, request.body);
    return reply.status(202).send(sendMessage(deps.runs, idOf(request.params), content));
  });

  app.delete('/api/conversations/:id', async (request, reply) => {
    deleteConversation(db, idOf(request.params));
    return reply.status(204).send();
  });
}
