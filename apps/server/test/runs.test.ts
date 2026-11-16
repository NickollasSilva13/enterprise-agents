import { request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import {
  conversationDetailSchema,
  conversationListSchema,
  dashboardSummarySchema,
  officeSchema,
  type RunAccepted,
  runAcceptedSchema,
  runDetailSchema,
  runListSchema,
  type RunSummary,
} from '@ea/shared';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { agents, approvals, runs, runSteps } from '../src/db/schema';
import { ProviderError } from '../src/providers/types';
import { FakeProvider, type FakeTurn, gate, waitFor } from './fake-provider';
import { addAgent, addModel, addPendingApproval, addProvider, addRun } from './fixtures';
import { makeApp, makeDatabase, type TestApp, TEST_HOST } from './helpers';

interface Setup extends TestApp {
  readonly provider: FakeProvider;
  readonly agentId: string;
  post(url: string, payload?: unknown): Promise<{ status: number; body: unknown }>;
  get(url: string): Promise<{ status: number; body: unknown }>;
  /** Sends a first message and returns the accepted run. */
  start(content?: string): Promise<RunAccepted>;
  run(id: string): Promise<RunSummary>;
  finished(id: string): Promise<RunSummary>;
}

let current: TestApp | undefined;
afterEach(async () => {
  await current?.close();
  current = undefined;
});

async function setup(
  options: {
    turns?: FakeTurn[];
    agent?: Partial<typeof agents.$inferInsert>;
    env?: Record<string, string>;
  } = {},
): Promise<Setup> {
  const provider = new FakeProvider(...(options.turns ?? []));
  const test = await makeApp({ createProvider: () => provider, env: options.env ?? {} });
  current = test;
  const modelId = addModel(test.database, addProvider(test.database), 'fake-model');
  const agentId = addAgent(test.database, {
    name: 'Triagem',
    modelId,
    systemPrompt: 'Responda em uma linha.',
    objective: 'Classificar pedidos',
    ...options.agent,
  });

  const call = async (method: 'GET' | 'POST' | 'DELETE', url: string, payload?: unknown) => {
    const response = await test.app.inject({
      method,
      url,
      headers: test.trusted,
      ...(payload === undefined ? {} : { payload: payload as object }),
    });
    return { status: response.statusCode, body: response.body ? response.json<unknown>() : null };
  };
  const run = async (id: string) =>
    runDetailSchema.parse((await call('GET', `/api/runs/${id}`)).body).run;

  return {
    ...test,
    provider,
    agentId,
    post: (url, payload) => call('POST', url, payload),
    get: (url) => call('GET', url),
    start: async (content = 'Olá') => {
      const { status, body } = await call('POST', '/api/conversations', { agentId, content });
      expect(status).toBe(202);
      return runAcceptedSchema.parse(body);
    },
    run,
    finished: (id) =>
      waitFor(async () => {
        const summary = await run(id);
        return summary.finishedAt ? summary : null;
      }),
  };
}

const conversation = async (s: Setup, id: string) =>
  conversationDetailSchema.parse((await s.get(`/api/conversations/${id}`)).body);

/** Parses a text/event-stream body into its events. */
function parseEvents(body: string): { event: string; id?: string; data: unknown }[] {
  return body
    .split('\n\n')
    .filter((block) => block.includes('data: '))
    .map((block) => {
      const field = (name: string) =>
        block
          .split('\n')
          .find((line) => line.startsWith(`${name}: `))
          ?.slice(name.length + 2);
      const id = field('id');
      return {
        event: field('event') ?? '',
        ...(id === undefined ? {} : { id }),
        data: JSON.parse(field('data') ?? 'null') as unknown,
      };
    });
}

describe('chat', () => {
  it('answers a first message: conversation, run, steps and reply are stored (RF-30)', async () => {
    const s = await setup({
      turns: [{ chunks: ['Bom ', 'dia!'], usage: { inputTokens: 20, outputTokens: 3 } }],
    });
    const { conversationId, runId } = await s.start('Bom dia\ncomo vai?');
    const run = await s.finished(runId);

    expect(run).toMatchObject({
      agentName: 'Triagem',
      agentDeleted: false,
      conversationId,
      trigger: 'chat',
      status: 'completed',
      endReason: 'completed',
      errorMessage: null,
      inputTokens: 20,
      outputTokens: 3,
    });
    expect(run.durationMs).not.toBeNull();

    const detail = await conversation(s, conversationId);
    expect(detail.conversation).toMatchObject({ title: 'Bom dia', messageCount: 2 });
    expect(detail.messages.map((message) => [message.role, message.text])).toEqual([
      ['user', 'Bom dia\ncomo vai?'],
      ['assistant', 'Bom dia!'],
    ]);
    expect(detail.messages.every((message) => message.runId === runId)).toBe(true);
    expect(detail.activeRunId).toBeNull();
    expect(detail.runs.map((entry) => entry.id)).toEqual([runId]);

    const { steps } = runDetailSchema.parse((await s.get(`/api/runs/${runId}`)).body);
    expect(steps.map((step) => [step.seq, step.type])).toEqual([
      [1, 'run_started'],
      [2, 'model_call_started'],
      [3, 'model_call_finished'],
      [4, 'run_finished'],
    ]);
    expect(steps[2]?.payload).toMatchObject({
      stopReason: 'end',
      inputTokens: 20,
      outputTokens: 3,
    });
  });

  it('sends the agent configuration and nothing else to the model', async () => {
    const s = await setup({ agent: { temperature: 0.2, maxOutputTokens: 512 } });
    await s.finished((await s.start('Qual a capital da França?')).runId);

    expect(s.provider.requests).toEqual([
      {
        model: 'fake-model',
        system: 'Responda em uma linha.\n\nObjetivo: Classificar pedidos',
        messages: [{ role: 'user', content: 'Qual a capital da França?' }],
        temperature: 0.2,
        maxOutputTokens: 512,
        // Only a harness provider uses it; it is the agent own folder.
        workspaceDir: join(s.dataDir, 'workspaces', s.agentId),
      },
    ]);
  });

  it('continues the same conversation with its history (RF-32, RF-36)', async () => {
    const s = await setup({ turns: [{ chunks: ['Paris.'] }, { chunks: ['Cerca de 2 milhões.'] }] });
    const first = await s.start('Capital da França?');
    await s.finished(first.runId);

    const second = await s.post(`/api/conversations/${first.conversationId}/messages`, {
      content: 'E a população?',
    });
    expect(second.status).toBe(202);
    const accepted = runAcceptedSchema.parse(second.body);
    expect(accepted.conversationId).toBe(first.conversationId);
    await s.finished(accepted.runId);

    expect(s.provider.requests[1]?.messages).toEqual([
      { role: 'user', content: 'Capital da França?' },
      { role: 'assistant', content: 'Paris.' },
      { role: 'user', content: 'E a população?' },
    ]);
    const detail = await conversation(s, first.conversationId);
    expect(detail.messages).toHaveLength(4);
    expect(detail.runs).toHaveLength(2);

    const list = conversationListSchema.parse(
      (await s.get(`/api/agents/${s.agentId}/conversations`)).body,
    );
    expect(list.conversations).toHaveLength(1);
    expect(list.conversations[0]).toMatchObject({ title: 'Capital da França?', messageCount: 4 });
  });

  it('refuses a message for an inactive agent (RN-01)', async () => {
    const s = await setup({ agent: { enabled: false } });
    const { status, body } = await s.post('/api/conversations', {
      agentId: s.agentId,
      content: 'Oi',
    });
    expect(status).toBe(409);
    expect(body).toMatchObject({ code: 'agent_inactive' });
    expect(s.provider.requests).toHaveLength(0);
    expect(s.database.db.select().from(runs).all()).toEqual([]);
  });

  it('refuses a message for an agent without an enabled model (RN-02)', async () => {
    const s = await setup({ agent: { modelId: null } });
    const { status, body } = await s.post('/api/conversations', {
      agentId: s.agentId,
      content: 'Oi',
    });
    expect(status).toBe(409);
    expect(body).toMatchObject({ code: 'agent_without_model' });
  });

  it('does not run a queued run whose agent was deactivated meanwhile (RN-01)', async () => {
    const s = await setup({ turns: [{ hang: true }], env: { MAX_CONCURRENT_RUNS: '1' } });
    const first = await s.start('ocupa a única vaga');
    const second = await s.start('fica na fila');
    expect((await s.run(second.runId)).status).toBe('queued');

    s.database.db.update(agents).set({ enabled: false }).where(eq(agents.id, s.agentId)).run();
    await s.post(`/api/runs/${first.runId}/cancel`);

    const run = await s.finished(second.runId);
    expect(run).toMatchObject({ status: 'failed', endReason: 'not_runnable' });
    expect(run.startedAt).toBeNull();
    expect(s.provider.requests).toHaveLength(1);
  });

  it('allows one active run per conversation (RN-06)', async () => {
    const s = await setup({ turns: [{ hang: true }] });
    const { conversationId, runId } = await s.start();

    const { status, body } = await s.post(`/api/conversations/${conversationId}/messages`, {
      content: 'outra',
    });
    expect(status).toBe(409);
    expect(body).toMatchObject({ code: 'conversation_busy' });
    expect((await conversation(s, conversationId)).activeRunId).toBe(runId);
  });

  it('validates the message and the targets', async () => {
    const s = await setup();
    expect(
      (await s.post('/api/conversations', { agentId: s.agentId, content: '   ' })).status,
    ).toBe(400);
    expect(
      (await s.post('/api/conversations', { agentId: s.agentId, content: 'x'.repeat(20_001) }))
        .status,
    ).toBe(400);
    expect(
      (await s.post('/api/conversations', { agentId: s.agentId, content: 'Oi', extra: 1 })).status,
    ).toBe(400);
    expect((await s.post('/api/conversations', { agentId: 'nope', content: 'Oi' })).status).toBe(
      404,
    );
    expect((await s.post('/api/conversations/nope/messages', { content: 'Oi' })).status).toBe(404);
    expect((await s.get('/api/conversations/nope')).status).toBe(404);
    expect((await s.get('/api/runs/nope')).status).toBe(404);
    expect((await s.get('/api/agents/nope/conversations')).status).toBe(404);
  });

  it('requires a session on every new route', async () => {
    const s = await setup();
    const headers = { ...s.trusted, cookie: '' };
    for (const url of ['/api/runs', '/api/events', `/api/agents/${s.agentId}/conversations`]) {
      expect((await s.app.inject({ url, headers })).statusCode).toBe(401);
    }
    const post = await s.app.inject({
      method: 'POST',
      url: '/api/conversations',
      headers,
      payload: { agentId: s.agentId, content: 'Oi' },
    });
    expect(post.statusCode).toBe(401);
  });

  it('deletes a conversation but keeps its runs in the logs', async () => {
    const s = await setup();
    const { conversationId, runId } = await s.start();
    await s.finished(runId);

    const response = await s.app.inject({
      method: 'DELETE',
      url: `/api/conversations/${conversationId}`,
      headers: s.trusted,
    });
    expect(response.statusCode).toBe(204);
    expect((await s.get(`/api/conversations/${conversationId}`)).status).toBe(404);
    expect(await s.run(runId)).toMatchObject({ status: 'completed', conversationId: null });
  });

  it('does not delete a conversation with a run in progress', async () => {
    const s = await setup({ turns: [{ hang: true }] });
    const { conversationId } = await s.start();
    const response = await s.app.inject({
      method: 'DELETE',
      url: `/api/conversations/${conversationId}`,
      headers: s.trusted,
    });
    expect(response.statusCode).toBe(409);
  });

  it('keeps the conversation of a deleted agent readable but closed (RN-07)', async () => {
    const s = await setup();
    const { conversationId, runId } = await s.start();
    await s.finished(runId);
    await s.app.inject({ method: 'DELETE', url: `/api/agents/${s.agentId}`, headers: s.trusted });

    expect((await conversation(s, conversationId)).messages).toHaveLength(2);
    expect(await s.run(runId)).toMatchObject({ agentName: 'Triagem', agentDeleted: true });
    const { status, body } = await s.post(`/api/conversations/${conversationId}/messages`, {
      content: 'ainda aí?',
    });
    expect(status).toBe(409);
    expect(body).toMatchObject({ code: 'agent_deleted' });
  });
});

describe('interrupting and failing', () => {
  it('cancels a run in progress and keeps what was written (RF-35, UC-04)', async () => {
    const s = await setup({
      turns: [{ chunks: ['Era uma vez'], hang: true }, { chunks: ['Fim.'] }],
    });
    const { conversationId, runId } = await s.start('Conte uma história');
    await waitFor(async () => (await s.run(runId)).status === 'running');

    const cancel = await s.post(`/api/runs/${runId}/cancel`);
    expect(cancel.status).toBe(202);
    const run = await s.finished(runId);
    expect(run).toMatchObject({ status: 'cancelled', endReason: 'cancelled_by_user' });
    expect(s.provider.signals[0]?.aborted).toBe(true);

    const detail = await conversation(s, conversationId);
    expect(detail.messages.at(-1)).toMatchObject({ role: 'assistant', text: 'Era uma vez' });

    // The conversation is free again (RF-36).
    const next = await s.post(`/api/conversations/${conversationId}/messages`, {
      content: 'Termine',
    });
    expect(next.status).toBe(202);
    await s.finished(runAcceptedSchema.parse(next.body).runId);

    const again = await s.post(`/api/runs/${runId}/cancel`);
    expect(again.status).toBe(409);
    expect(again.body).toMatchObject({ code: 'run_not_active' });
  });

  it('records a provider failure with a safe message (RF-34)', async () => {
    const s = await setup({
      turns: [
        { error: new ProviderError('unreachable', undefined, 'ECONNREFUSED sk-secret-000111') },
      ],
    });
    const { conversationId, runId } = await s.start();
    const run = await s.finished(runId);

    expect(run).toMatchObject({
      status: 'failed',
      endReason: 'provider_unreachable',
      errorMessage: new ProviderError('unreachable').message,
    });
    const { steps } = runDetailSchema.parse((await s.get(`/api/runs/${runId}`)).body);
    expect(steps.map((step) => step.type)).toEqual([
      'run_started',
      'model_call_started',
      'error',
      'run_finished',
    ]);
    expect(JSON.stringify(steps)).not.toContain('sk-secret');
    expect((await conversation(s, conversationId)).messages).toHaveLength(1);

    const summary = dashboardSummarySchema.parse((await s.get('/api/dashboard/summary')).body);
    expect(summary.alerts.map((alert) => alert.kind)).toEqual([
      'failed_agents',
      'provider_unreachable',
    ]);
    const office = officeSchema.parse((await s.get('/api/office')).body);
    expect(office.agents[0]).toMatchObject({
      state: 'failed',
      currentRun: null,
      lastError: run.errorMessage,
    });
  });

  it('applies the time limit of the agent (RN-05)', async () => {
    const s = await setup({ turns: [{ hang: true }], agent: { maxDurationSeconds: 1 } });
    const { runId } = await s.start();
    const run = await waitFor(async () => {
      const summary = await s.run(runId);
      return summary.finishedAt ? summary : null;
    }, 4000);
    expect(run).toMatchObject({ status: 'timed_out', endReason: 'time_limit' });
    expect(run.errorMessage).toMatch(/1 s/);
  });

  it('marks runs left active by a previous server as interrupted (RN-12)', async () => {
    const database = makeDatabase();
    const agentId = addAgent(database, { name: 'Antigo' });
    const running = addRun(database, agentId, { status: 'running' });
    const waiting = addRun(database, agentId, { status: 'waiting_approval' });
    const approvalId = addPendingApproval(database, waiting);
    const done = addRun(database, agentId, { status: 'completed' });

    const s = await makeApp({ database });
    current = s;
    const status = (id: string) =>
      database.db.select().from(runs).where(eq(runs.id, id)).get()?.status;

    expect(status(running)).toBe('interrupted');
    expect(status(waiting)).toBe('interrupted');
    expect(status(done)).toBe('completed');
    expect(
      database.db.select().from(approvals).where(eq(approvals.id, approvalId)).get()?.status,
    ).toBe('cancelled');
    const steps = database.db.select().from(runSteps).where(eq(runSteps.runId, running)).all();
    expect(steps.map((step) => step.type)).toEqual(['run_finished']);
  });

  it('interrupts active runs when the server closes', async () => {
    const s = await setup({ turns: [{ chunks: ['pela metade'], hang: true }] });
    const { runId } = await s.start();
    await waitFor(async () => (await s.run(runId)).status === 'running');

    await s.app.close();

    const row = s.database.db.select().from(runs).where(eq(runs.id, runId)).get();
    expect(row).toMatchObject({ status: 'interrupted', endReason: 'shutdown' });
    expect(s.provider.signals[0]?.aborted).toBe(true);
  });
});

describe('logs', () => {
  it('lists runs newest first and filters by agent, status and period (RF-71)', async () => {
    const s = await setup();
    const other = addAgent(s.database, { name: 'Outro' });
    const old = addRun(s.database, other, {
      status: 'failed',
      createdAt: '2026-01-10T10:00:00.000Z',
    });
    const mid = addRun(s.database, other, {
      status: 'completed',
      createdAt: '2026-03-10T10:00:00.000Z',
      startedAt: '2026-03-10T10:00:00.000Z',
      finishedAt: '2026-03-10T10:00:02.500Z',
    });
    const recent = (await s.start()).runId;
    await s.finished(recent);

    const list = async (query = '') =>
      runListSchema.parse((await s.get(`/api/runs${query}`)).body).runs.map((run) => run.id);

    expect(await list()).toEqual([recent, mid, old]);
    expect(await list(`?agentId=${other}`)).toEqual([mid, old]);
    expect(await list('?status=failed')).toEqual([old]);
    expect(await list('?from=2026-02-01T00:00:00.000Z&to=2026-04-01T00:00:00.000Z')).toEqual([mid]);
    expect(await list(`?agentId=${other}&status=completed`)).toEqual([mid]);

    const page = runListSchema.parse((await s.get('/api/runs?limit=2')).body);
    expect(page.runs.map((run) => run.id)).toEqual([recent, mid]);
    expect(page.nextBefore).toBe(mid);
    const rest = runListSchema.parse((await s.get(`/api/runs?limit=2&before=${mid}`)).body);
    expect(rest.runs.map((run) => run.id)).toEqual([old]);
    expect(rest.nextBefore).toBeNull();

    expect(page.runs[1]?.durationMs).toBe(2500);
    for (const bad of ['?status=nope', '?limit=0', '?limit=999', '?from=ontem', '?unknown=1']) {
      expect((await s.get(`/api/runs${bad}`)).status).toBe(400);
    }
  });

  it('feeds the dashboard and the office with live run data (RF-02 a RF-05, RF-07)', async () => {
    const hold = gate();
    const s = await setup({
      turns: [
        { chunks: ['um momento'], gate: hold.promise, usage: { inputTokens: 7, outputTokens: 2 } },
      ],
    });
    const { conversationId, runId } = await s.start('Preciso de ajuda com o pedido 42');
    await waitFor(async () => (await s.run(runId)).status === 'running');

    let summary = dashboardSummarySchema.parse((await s.get('/api/dashboard/summary')).body);
    expect(summary.agents.working).toBe(1);
    expect(summary.runs.active).toBe(1);
    expect(summary.activity.map((item) => [item.kind, item.agentName])).toEqual([
      ['started', 'Triagem'],
    ]);
    let office = officeSchema.parse((await s.get('/api/office')).body);
    expect(office.agents[0]).toMatchObject({
      state: 'working',
      currentRun: {
        id: runId,
        conversationId,
        status: 'running',
        prompt: 'Preciso de ajuda com o pedido 42',
      },
      lastError: null,
    });

    hold.open();
    await s.finished(runId);

    summary = dashboardSummarySchema.parse((await s.get('/api/dashboard/summary')).body);
    expect(summary.agents.working).toBe(0);
    expect(summary.runs.last24h).toMatchObject({
      finished: 1,
      completed: 1,
      successRate: 1,
      inputTokens: 7,
      outputTokens: 2,
    });
    expect(summary.recentRuns[0]).toMatchObject({ id: runId, status: 'completed' });
    expect(summary.activity.map((item) => [item.kind, item.status])).toEqual([
      ['finished', 'completed'],
      ['started', null],
    ]);
    office = officeSchema.parse((await s.get('/api/office')).body);
    expect(office.agents[0]).toMatchObject({ state: 'idle', currentRun: null });
  });
});

describe('run events (SSE)', () => {
  const stream = (s: Setup, runId: string, headers: Record<string, string> = {}) =>
    s.app.inject({ url: `/api/runs/${runId}/events`, headers: { ...s.trusted, ...headers } });

  it('replays a finished run and closes', async () => {
    const s = await setup({ turns: [{ chunks: ['pronto'] }] });
    const { runId } = await s.start();
    await s.finished(runId);

    const response = await stream(s, runId);
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('text/event-stream; charset=utf-8');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['content-security-policy']).toContain("default-src 'self'");
    expect(response.headers['x-content-type-options']).toBe('nosniff');

    const events = parseEvents(response.body);
    expect(events.map((event) => [event.event, event.id])).toEqual([
      ['snapshot', undefined],
      ['step', '1'],
      ['step', '2'],
      ['step', '3'],
      ['step', '4'],
      ['end', undefined],
    ]);
    expect(events[0]?.data).toEqual({ status: 'completed', text: '' });
    expect(events.at(-1)?.data).toEqual({ status: 'completed' });
  });

  it('resumes after the last event the client saw', async () => {
    const s = await setup();
    const { runId } = await s.start();
    await s.finished(runId);

    const events = parseEvents((await stream(s, runId, { 'last-event-id': '2' })).body);
    expect(events.map((event) => [event.event, event.id])).toEqual([
      ['snapshot', undefined],
      ['step', '3'],
      ['step', '4'],
      ['end', undefined],
    ]);
    // A garbage id is ignored rather than trusted.
    const all = parseEvents((await stream(s, runId, { 'last-event-id': 'abc' })).body);
    expect(all.filter((event) => event.event === 'step')).toHaveLength(4);
  });

  it('streams text as it is produced, starting from what already exists (RF-31)', async () => {
    const hold = gate();
    const s = await setup({ turns: [{ chunks: ['Olá'], gate: hold.promise }] });
    const { runId } = await s.start();
    await waitFor(async () => (await s.run(runId)).status === 'running');
    await waitFor(() => s.provider.requests.length === 1);

    const pending = stream(s, runId);
    // Give the stream time to attach, then let the run finish.
    await new Promise((resolve) => setTimeout(resolve, 30));
    hold.open();
    const events = parseEvents((await pending).body);

    expect(events[0]).toEqual({ event: 'snapshot', data: { status: 'running', text: 'Olá' } });
    const types = events.map((event) => event.event);
    expect(types.filter((type) => type === 'step')).toHaveLength(4);
    expect(types.at(-1)).toBe('end');
    expect(events.at(-1)?.data).toEqual({ status: 'completed' });
  });

  it('delivers deltas to a stream opened before the model starts writing', async () => {
    const hold = gate();
    const s = await setup({ turns: [{ gate: hold.promise }], env: { MAX_CONCURRENT_RUNS: '1' } });
    const blocker = await s.start('ocupa a vaga');
    const { runId } = await s.start('fica na fila');

    const pending = stream(s, runId);
    await new Promise((resolve) => setTimeout(resolve, 30));
    await s.post(`/api/runs/${blocker.runId}/cancel`);
    await waitFor(() => s.provider.requests.length === 2);
    hold.open();
    const events = parseEvents((await pending).body);

    expect(events[0]?.data).toEqual({ status: 'queued', text: '' });
    expect(events.map((event) => event.event)).toEqual([
      'snapshot',
      'step',
      'status',
      'step',
      'step',
      'step',
      'end',
    ]);
  });

  it('answers 404 for an unknown run', async () => {
    const s = await setup();
    expect((await stream(s, 'nope')).statusCode).toBe(404);
  });

  it('announces every run change on the global stream and ends it on close', async () => {
    const s = await setup();
    await s.app.listen({ host: '127.0.0.1', port: 0 });
    const { port } = s.app.server.address() as AddressInfo;

    let received = '';
    let ended = false;
    const request = httpRequest({
      host: '127.0.0.1',
      port,
      path: '/api/events',
      headers: { host: TEST_HOST, cookie: s.trusted.cookie },
    });
    request.on('response', (response) => {
      response.setEncoding('utf8');
      response.on('data', (chunk: string) => (received += chunk));
      response.on('end', () => (ended = true));
    });
    request.end();
    await waitFor(() => received.includes('event: hello'));

    const { runId, conversationId } = await s.start();
    await s.finished(runId);
    await waitFor(() => received.includes('"completed"'));

    const changes = parseEvents(received).filter((event) => event.event === 'run');
    expect(changes.map((event) => event.data)).toEqual(
      ['queued', 'running', 'completed'].map((status) => ({
        runId,
        agentId: s.agentId,
        conversationId,
        status,
      })),
    );

    await s.app.close();
    await waitFor(() => ended);
  });
});
