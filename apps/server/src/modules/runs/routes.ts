import {
  ACTIVE_RUN_STATUSES,
  type RunChangedEvent,
  runListQuerySchema,
  type RunSnapshotEvent,
} from '@ea/shared';
import type { FastifyInstance } from 'fastify';
import { NotFoundError } from '../../core/errors';
import { idParamSchema, parseInput } from '../../http/error-handler';
import { lastEventId, type SseHub } from '../../http/sse';
import { findRun, listSteps } from './repository';
import { cancelRun, getRunDetail, type RunsContext, searchRuns } from './service';

export function registerRunRoutes(
  app: FastifyInstance,
  deps: { runs: RunsContext; sse: SseHub },
): void {
  const { db, bus, manager } = deps.runs;
  const idOf = (params: unknown) => parseInput(idParamSchema, params).id;

  app.get('/api/runs', async (request) =>
    searchRuns(db, parseInput(runListQuerySchema, request.query)),
  );

  app.get('/api/runs/:id', async (request) => getRunDetail(db, idOf(request.params)));

  app.post('/api/runs/:id/cancel', async (request, reply) =>
    reply.status(202).send(cancelRun(deps.runs, idOf(request.params))),
  );

  /**
   * Live events of one run. Always opens with a snapshot, then the steps the
   * client has not seen (after its Last-Event-ID), then whatever happens
   * next. Ends by itself when the run ends.
   */
  app.get('/api/runs/:id/events', async (request, reply) => {
    const runId = idOf(request.params);
    const run = findRun(db, runId);
    if (!run) throw new NotFoundError('Execução não encontrada.');

    const stream = deps.sse.open(request, reply);
    // Everything from here to `subscribe` is synchronous, so no event can
    // slip between what is read from the database and what arrives live.
    const snapshot: RunSnapshotEvent = { status: run.status, text: manager.partialText(runId) };
    stream.send('snapshot', snapshot);
    for (const step of listSteps(db, runId, lastEventId(request))) {
      stream.send('step', step, step.seq);
    }
    if (!ACTIVE_RUN_STATUSES.includes(run.status)) {
      stream.send('end', { status: run.status });
      stream.close();
      return;
    }

    const unsubscribe = bus.subscribe((event) => {
      if (event.runId !== runId) return;
      if (event.kind === 'delta') {
        stream.send('delta', { text: event.text });
      } else if (event.kind === 'step') {
        const { seq, type, payload, createdAt } = event.step;
        stream.send('step', { seq, type, payload, createdAt }, seq);
      } else if (!ACTIVE_RUN_STATUSES.includes(event.status)) {
        stream.send('end', { status: event.status });
        stream.close();
      } else {
        stream.send('status', { status: event.status });
      }
    });
    stream.onClose(unsubscribe);
  });

  /**
   * One line per change of any run, so every screen knows when to refresh.
   * It carries no history: a client that reconnects simply reloads its data.
   */
  app.get('/api/events', async (request, reply) => {
    const stream = deps.sse.open(request, reply);
    stream.send('hello', {});
    const unsubscribe = bus.subscribe((event) => {
      if (event.kind !== 'run_changed') return;
      const changed: RunChangedEvent = {
        runId: event.runId,
        agentId: event.agentId,
        conversationId: event.conversationId,
        status: event.status,
      };
      stream.send('run', changed);
    });
    stream.onClose(unsubscribe);
  });
}
