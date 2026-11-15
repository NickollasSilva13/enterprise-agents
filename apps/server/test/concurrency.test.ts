import { approvalListSchema, runAcceptedSchema, runDetailSchema } from '@ea/shared';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { auditLog, runs } from '../src/db/schema';
import type {
  ChatEvent,
  ChatRequest,
  ConnectionResult,
  ModelInfo,
  ModelProvider,
} from '../src/providers/types';
import { FakeProvider, waitFor } from './fake-provider';
import { addAgent, addModel, addProvider, grantTools } from './fixtures';
import { makeApp, type TestApp } from './helpers';

// What happens when many things are asked of the server at the same moment
// (Phase 10): the limits of C-13 hold, nothing runs twice, nothing is lost.

/** A model that takes a moment to answer and counts how many calls are open at once. */
class CountingProvider implements ModelProvider {
  open = 0;
  peak = 0;
  calls = 0;

  constructor(private readonly delayMs: number) {}

  async testConnection(): Promise<ConnectionResult> {
    return { detail: 'Counting' };
  }

  async listModels(): Promise<ModelInfo[]> {
    return [];
  }

  async *chat(request: ChatRequest): AsyncIterable<ChatEvent> {
    this.calls += 1;
    this.open += 1;
    this.peak = Math.max(this.peak, this.open);
    try {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
      const last = request.messages.at(-1);
      yield { type: 'text_delta', text: `Eco: ${last?.content ?? ''}` };
      yield { type: 'usage', inputTokens: 3, outputTokens: 2 };
      yield { type: 'done', stopReason: 'end' };
    } finally {
      this.open -= 1;
    }
  }
}

let current: TestApp | undefined;
afterEach(async () => {
  await current?.close();
  current = undefined;
});

async function start(provider: ModelProvider, env: Record<string, string> = {}) {
  const test = await makeApp({ createProvider: () => provider, env });
  current = test;
  const modelId = addModel(test.database, addProvider(test.database), 'fake-model', {
    supportsTools: true,
  });
  const call = async (method: 'GET' | 'POST', url: string, payload?: unknown) => {
    const response = await test.app.inject({
      method,
      url,
      headers: test.trusted,
      ...(payload === undefined ? {} : { payload: payload as object }),
    });
    return { status: response.statusCode, body: response.body ? response.json<unknown>() : null };
  };
  const finished = (runId: string) =>
    waitFor(async () => {
      const { run } = runDetailSchema.parse((await call('GET', `/api/runs/${runId}`)).body);
      return run.finishedAt ? run : null;
    }, 10_000);
  return { ...test, modelId, call, finished };
}

describe('many runs at once (C-13)', () => {
  it('never runs more than the limit, queues the rest and finishes them all', async () => {
    const provider = new CountingProvider(15);
    const s = await start(provider, { MAX_CONCURRENT_RUNS: '3' });
    const agentIds = Array.from({ length: 8 }, (_, index) =>
      addAgent(s.database, { name: `Agente ${index}`, modelId: s.modelId }),
    );

    // Forty messages sent in the same instant, five to each agent.
    const accepted = await Promise.all(
      Array.from({ length: 40 }, (_, index) =>
        s.call('POST', '/api/conversations', {
          agentId: agentIds[index % agentIds.length],
          content: `mensagem ${index}`,
        }),
      ),
    );
    expect(accepted.map((response) => response.status)).toEqual(Array(40).fill(202));
    const runIds = accepted.map((response) => runAcceptedSchema.parse(response.body).runId);
    expect(new Set(runIds).size).toBe(40);

    const done = await Promise.all(runIds.map((id) => s.finished(id)));
    expect(done.map((run) => run.status)).toEqual(Array(40).fill('completed'));
    expect(provider.peak).toBe(3);
    expect(provider.calls).toBe(40);

    // Each conversation got the answer to its own message, and only one.
    expect(s.database.db.select().from(runs).all()).toHaveLength(40);
    const answers = s.database.sqlite
      .prepare("select content from messages where role = 'assistant'")
      .all() as { content: string }[];
    expect(answers.map((row) => (JSON.parse(row.content) as { text: string }).text).sort()).toEqual(
      Array.from({ length: 40 }, (_, index) => `Eco: mensagem ${index}`).sort(),
    );
  });

  it('accepts only one of several messages sent at once to the same conversation (RN-06)', async () => {
    const provider = new CountingProvider(40);
    const s = await start(provider);
    const agentId = addAgent(s.database, { name: 'Um', modelId: s.modelId });
    const first = runAcceptedSchema.parse(
      (await s.call('POST', '/api/conversations', { agentId, content: 'primeira' })).body,
    );
    await s.finished(first.runId);

    const burst = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        s.call('POST', `/api/conversations/${first.conversationId}/messages`, {
          content: `rajada ${index}`,
        }),
      ),
    );
    const statuses = burst.map((response) => response.status).sort();
    expect(statuses).toEqual([202, ...Array<number>(9).fill(409)]);

    await waitFor(() => provider.open === 0 && provider.calls === 2, 10_000);
    const stored = s.database.db.select().from(runs).all();
    expect(stored).toHaveLength(2);
  });

  it('stops every run when all are cancelled twice at once, each ending exactly once', async () => {
    const provider = new FakeProvider({ chunks: ['parcial'], hang: true });
    const s = await start(provider, { MAX_CONCURRENT_RUNS: '4' });
    const agentId = addAgent(s.database, { name: 'Um', modelId: s.modelId });
    const runIds: string[] = [];
    for (let index = 0; index < 10; index += 1) {
      const response = await s.call('POST', '/api/conversations', {
        agentId,
        content: `m${index}`,
      });
      runIds.push(runAcceptedSchema.parse(response.body).runId);
    }
    await waitFor(() => provider.requests.length === 4);

    const cancels = await Promise.all(
      runIds.flatMap((id) => [
        s.call('POST', `/api/runs/${id}/cancel`),
        s.call('POST', `/api/runs/${id}/cancel`),
      ]),
    );
    // The first cancel is always taken. The repeated one is harmless: it is
    // taken again while the run is still stopping, or refused once it has stopped.
    for (let index = 0; index < runIds.length; index += 1) {
      expect(cancels[index * 2]?.status).toBe(202);
      expect([202, 409]).toContain(cancels[index * 2 + 1]?.status);
    }
    const done = await Promise.all(runIds.map((id) => s.finished(id)));
    expect(done.map((run) => run.status)).toEqual(Array(10).fill('cancelled'));
    // Only the four that had a slot ever reached the model.
    expect(provider.requests).toHaveLength(4);
    expect(provider.signals.every((signal) => signal?.aborted)).toBe(true);
    // Whatever the number of cancels, each run ended exactly once.
    const endings = s.database.sqlite
      .prepare(
        "select run_id, count(*) as n from run_steps where type = 'run_finished' group by run_id",
      )
      .all() as { run_id: string; n: number }[];
    expect(endings).toHaveLength(10);
    expect(endings.every((row) => row.n === 1)).toBe(true);
  });
});

describe('one approval answered many times at once (C-16)', () => {
  it('runs the tool once: one answer is taken, the others are refused', async () => {
    const provider = new FakeProvider(
      { toolCalls: [{ name: 'write_file', arguments: { path: 'nota.txt', content: 'uma vez' } }] },
      { chunks: ['Pronto.'] },
    );
    const s = await start(provider);
    const agentId = addAgent(s.database, { name: 'Escritor', modelId: s.modelId });
    grantTools(s.database, agentId, { write_file: 'ask' });
    const { runId } = runAcceptedSchema.parse(
      (await s.call('POST', '/api/conversations', { agentId, content: 'anote' })).body,
    );
    const approval = await waitFor(async () => {
      const { approvals } = approvalListSchema.parse((await s.call('GET', '/api/approvals')).body);
      return approvals[0];
    });

    // Approvals and denials racing each other.
    const answers = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        s.call('POST', `/api/approvals/${approval.id}/decision`, {
          decision: index % 2 === 0 ? 'approve' : 'deny',
        }),
      ),
    );
    const statuses = answers.map((response) => response.status);
    expect(statuses.filter((status) => status === 200)).toHaveLength(1);
    expect(statuses.filter((status) => status === 409)).toHaveLength(11);
    // The first to arrive was an approval, and that is the one that counted.
    expect(statuses[0]).toBe(200);

    expect((await s.finished(runId)).status).toBe('completed');
    expect(readFileSync(join(s.dataDir, 'workspaces', agentId, 'nota.txt'), 'utf8')).toBe(
      'uma vez',
    );
    const decisions = s.database.db
      .select()
      .from(auditLog)
      .all()
      .filter((entry) => entry.action.startsWith('approval.'));
    expect(decisions.map((entry) => entry.action)).toEqual(['approval.approved']);
    // The model was called twice: once to ask for the tool, once with its result.
    expect(provider.requests).toHaveLength(2);
  });
});
