import { dashboardSummarySchema, officeSchema, systemInfoSchema } from '@ea/shared';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { agents } from '../src/db/schema';
import { getDashboardSummary } from '../src/modules/dashboard/service';
import { getOffice } from '../src/modules/office/service';
import {
  addAgent,
  addModel,
  addPendingApproval,
  addProject,
  addProvider,
  addRun,
} from './fixtures';
import { makeApp, type TestApp } from './helpers';

let current: TestApp | undefined;
async function start(): Promise<TestApp> {
  current = await makeApp();
  return current;
}
afterEach(async () => {
  await current?.close();
  current = undefined;
});

const NOW = new Date('2026-11-12T12:00:00.000Z');
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString();

describe('GET /api/dashboard/summary', () => {
  it('returns zeros and the "no provider" notice on an empty database', async () => {
    const { app, trusted } = await start();
    const response = await app.inject({ url: '/api/dashboard/summary', headers: trusted });
    expect(response.statusCode).toBe(200);

    const summary = dashboardSummarySchema.parse(response.json());
    expect(summary.agents).toEqual({
      total: 0,
      active: 0,
      inactive: 0,
      failed: 0,
      working: 0,
      waiting: 0,
    });
    expect(summary.runs).toEqual({
      active: 0,
      waitingApproval: 0,
      last24h: {
        finished: 0,
        completed: 0,
        failed: 0,
        successRate: null,
        averageDurationMs: null,
        inputTokens: 0,
        outputTokens: 0,
      },
    });
    expect(summary.recentRuns).toEqual([]);
    expect(summary.alerts).toEqual([{ kind: 'no_provider', severity: 'info', count: 0 }]);
  });

  it('requires a session', async () => {
    const { app, trusted } = await start();
    const response = await app.inject({
      url: '/api/dashboard/summary',
      headers: { host: trusted.host! },
    });
    expect(response.statusCode).toBe(401);
  });
});

describe('getDashboardSummary', () => {
  it('counts agents by state and ignores deleted ones (RF-01)', async () => {
    const { database } = await start();
    const model = addModel(database, addProvider(database));

    const working = addAgent(database, { name: 'Working', modelId: model });
    addRun(database, working, { status: 'running' });

    const waiting = addAgent(database, { name: 'Waiting', modelId: model });
    addPendingApproval(database, addRun(database, waiting, { status: 'waiting_approval' }));

    const failed = addAgent(database, { name: 'Failed', modelId: model });
    addRun(database, failed, { status: 'completed' });
    addRun(database, failed, { status: 'failed' });

    const recovered = addAgent(database, { name: 'Recovered', modelId: model });
    addRun(database, recovered, { status: 'failed' });
    addRun(database, recovered, { status: 'completed' });

    addAgent(database, { name: 'Idle', modelId: model });
    addAgent(database, { name: 'Inactive', modelId: model, enabled: false });
    addAgent(database, { name: 'Deleted', modelId: model, deletedAt: hoursAgo(1) });

    const summary = getDashboardSummary(database.db, NOW);
    expect(summary.agents).toEqual({
      total: 6,
      active: 5,
      inactive: 1,
      failed: 1,
      working: 1,
      waiting: 1,
    });
    expect(summary.runs.active).toBe(2);
    expect(summary.runs.waitingApproval).toBe(1);
    expect(summary.pendingApprovals).toBe(1);
    expect(summary.providers).toBe(1);
  });

  it('raises alerts for what needs attention, most severe first', async () => {
    const { database } = await start();
    const failed = addAgent(database, { name: 'No model' });
    addRun(database, failed, { status: 'timed_out' });
    const waiting = addAgent(database, { name: 'No model either' });
    addPendingApproval(database, addRun(database, waiting, { status: 'waiting_approval' }));
    addAgent(database, { name: 'Disabled without model', enabled: false });

    expect(getDashboardSummary(database.db, NOW).alerts).toEqual([
      { kind: 'failed_agents', severity: 'error', count: 1 },
      { kind: 'pending_approvals', severity: 'warning', count: 1 },
      { kind: 'agents_without_model', severity: 'warning', count: 2 },
      { kind: 'no_provider', severity: 'info', count: 0 },
    ]);
  });

  it('has no alerts when everything is in order', async () => {
    const { database } = await start();
    addAgent(database, { name: 'Fine', modelId: addModel(database, addProvider(database)) });
    expect(getDashboardSummary(database.db, NOW).alerts).toEqual([]);
  });

  it('computes the last 24 hours from finished runs only (RF-05)', async () => {
    const { database } = await start();
    const agent = addAgent(database, { name: 'Agent' });
    const finished = (status: 'completed' | 'failed' | 'timed_out', seconds: number, age = 2) =>
      addRun(database, agent, {
        status,
        createdAt: hoursAgo(age),
        startedAt: hoursAgo(age),
        finishedAt: new Date(new Date(hoursAgo(age)).getTime() + seconds * 1000).toISOString(),
        inputTokens: 100,
        outputTokens: 50,
      });

    finished('completed', 10);
    finished('completed', 20);
    finished('completed', 30);
    finished('failed', 4);
    finished('completed', 999, 30); // older than a day: ignored
    addRun(database, agent, { status: 'running', createdAt: hoursAgo(1), inputTokens: 999 });

    const day = getDashboardSummary(database.db, NOW).runs.last24h;
    expect(day).toEqual({
      finished: 4,
      completed: 3,
      failed: 1,
      successRate: 0.75,
      averageDurationMs: 16000,
      inputTokens: 400,
      outputTokens: 200,
    });
  });

  it('lists the ten most recent runs, newest first, with agent name and duration', async () => {
    const { database } = await start();
    const agent = addAgent(database, { name: 'Runner' });
    for (let index = 0; index < 12; index += 1) {
      addRun(database, agent, { status: 'completed', createdAt: hoursAgo(12 - index) });
    }
    const last = addRun(database, agent, {
      status: 'completed',
      trigger: 'chat',
      startedAt: '2026-11-12T11:00:00.000Z',
      finishedAt: '2026-11-12T11:00:02.500Z',
    });
    // History stays visible after the agent is removed (RN-07).
    database.db
      .update(agents)
      .set({ deletedAt: hoursAgo(0) })
      .where(eq(agents.id, agent))
      .run();

    const { recentRuns } = getDashboardSummary(database.db, NOW);
    expect(recentRuns).toHaveLength(10);
    expect(recentRuns[0]).toMatchObject({
      id: last,
      agentName: 'Runner',
      status: 'completed',
      trigger: 'chat',
      durationMs: 2500,
    });
    expect(recentRuns[1]?.durationMs).toBeNull();
    const ids = recentRuns.map((run) => run.id);
    expect(ids).toEqual([...ids].sort().reverse());
  });
});

describe('office', () => {
  it('is empty when there are no projects or agents', async () => {
    const { app, trusted } = await start();
    const response = await app.inject({ url: '/api/office', headers: trusted });
    expect(officeSchema.parse(response.json())).toEqual({ rooms: [] });
  });

  it('puts each agent in the room of its project (RF-07)', async () => {
    const { database } = await start();
    const support = addProject(database, 'Suporte', 'Atende clientes');
    addProject(database, 'Arquivo');
    const busy = addAgent(database, { name: 'Zeca', projectId: support, objective: 'Responder' });
    addRun(database, busy, { status: 'running' });
    addAgent(database, { name: 'Ana', projectId: support });
    addAgent(database, { name: 'Solto', enabled: false });
    addAgent(database, { name: 'Removido', projectId: support, deletedAt: hoursAgo(1) });

    const { rooms } = getOffice(database.db);
    expect(rooms.map((room) => room.name)).toEqual(['Arquivo', 'Suporte', 'Sem projeto']);
    expect(rooms[0]?.agents).toEqual([]);
    expect(rooms[1]).toMatchObject({ id: support, description: 'Atende clientes' });
    expect(rooms[1]?.agents.map((agent) => [agent.name, agent.state])).toEqual([
      ['Ana', 'idle'],
      ['Zeca', 'working'],
    ]);
    expect(rooms[1]?.agents[1]?.objective).toBe('Responder');
    expect(rooms[2]).toMatchObject({ id: null });
    expect(rooms[2]?.agents.map((agent) => [agent.name, agent.state])).toEqual([
      ['Solto', 'inactive'],
    ]);
  });

  it('has no "Sem projeto" room when every agent has a project', async () => {
    const { database } = await start();
    addAgent(database, { name: 'Ana', projectId: addProject(database, 'Suporte') });
    expect(getOffice(database.db).rooms.map((room) => room.name)).toEqual(['Suporte']);
  });
});

describe('GET /api/system/info', () => {
  it('describes the running installation', async () => {
    const { app, trusted } = await start();
    const response = await app.inject({ url: '/api/system/info', headers: trusted });
    expect(response.statusCode).toBe(200);
    const info = systemInfoSchema.parse(response.json());
    expect(info).toMatchObject({
      version: '0.0.0-test',
      environment: 'test',
      address: 'http://127.0.0.1:4317',
      maxConcurrentRuns: 4,
    });
    expect(info.databasePath.startsWith(info.dataDir)).toBe(true);
  });
});
