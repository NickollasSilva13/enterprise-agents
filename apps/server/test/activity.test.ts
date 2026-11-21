// The office's recent activity (Phase 29, D5) through the API: finished
// tasks, deliveries between areas, tasks created by a schedule, tool
// requests with their answer, and failed runs, newest first.
import { ACTIVITY_LIMIT, activityFeedSchema, type TaskEventKind } from '@ea/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { newId } from '../src/db/ids';
import { approvals, schedules, taskEvents, tasks, workflowStages } from '../src/db/schema';
import { addAgent, addPendingApproval, addProject, addRun } from './fixtures';
import { makeApp, type TestApp } from './helpers';

/** Any string, typed: the ids and times the server makes. */
const someText = expect.any(String) as unknown as string;

let current: TestApp | undefined;
afterEach(async () => {
  await current?.close();
  current = undefined;
});

async function setup() {
  const test = await makeApp();
  current = test;
  const feed = async () => {
    const response = await test.app.inject({
      method: 'GET',
      url: '/api/activity',
      headers: test.trusted,
    });
    expect(response.statusCode).toBe(200);
    return activityFeedSchema.parse(response.json()).entries;
  };
  return { ...test, feed };
}

/** Ids and times far apart enough to sort, oldest first: every clock reads the same second. */
let tick = 0;
const time = () => new Date(Date.UTC(2026, 10, 19, 12, 0, tick++)).toISOString();

function addStages(test: TestApp, areaId: string) {
  const work = newId();
  const done = newId();
  test.database.db
    .insert(workflowStages)
    .values([
      { id: work, projectId: areaId, position: 0, name: 'Fazer', kind: 'human' },
      { id: done, projectId: areaId, position: 1, name: 'Pronto', kind: 'done' },
    ])
    .run();
  return { work, done };
}

function addTask(
  test: TestApp,
  areaId: string,
  stageId: string,
  title: string,
  extra: Partial<typeof tasks.$inferInsert> = {},
) {
  const id = newId();
  test.database.db
    .insert(tasks)
    .values({ id, projectId: areaId, stageId, title, ...extra })
    .run();
  return id;
}

function addEvent(
  test: TestApp,
  taskId: string,
  kind: TaskEventKind,
  extra: Partial<typeof taskEvents.$inferInsert> = {},
) {
  test.database.db
    .insert(taskEvents)
    .values({ id: newId(), taskId, kind, actor: 'system', createdAt: time(), ...extra })
    .run();
}

describe('recent activity (Phase 29)', () => {
  it('is empty on a new installation', async () => {
    const s = await setup();
    expect(await s.feed()).toEqual([]);
  });

  it('tells what happened, from every source, newest first', async () => {
    const s = await setup();
    const sales = addProject(s.database, 'Vendas');
    const site = addProject(s.database, 'Site');
    const salesStages = addStages(s, sales);
    const siteStages = addStages(s, site);
    const writer = addAgent(s.database, { name: 'Redatora' });

    // Moved into a "done" stage by an agent; a move into another stage is not news.
    const report = addTask(s, sales, salesStages.done, 'Relatório do mês');
    addEvent(s, report, 'moved', { toStage: 'Fazer', agentId: writer, actor: 'agent' });
    addEvent(s, report, 'moved', { toStage: 'Pronto', agentId: writer, actor: 'agent' });

    // A request from Vendas to Site, delivered: written on both tasks, said once.
    const ask = addTask(s, sales, salesStages.work, 'Página de preços');
    const request = addTask(s, site, siteStages.done, 'Página de preços', {
      parentTaskId: ask,
      state: 'done',
    });
    addEvent(s, request, 'delivered', { relatedTaskId: ask });
    addEvent(s, ask, 'delivered', { relatedTaskId: request });

    // A task a schedule created; a task the user created is not news.
    const scheduleId = newId();
    s.database.db
      .insert(schedules)
      .values({
        id: scheduleId,
        projectId: sales,
        title: 'Fechamento',
        rule: { kind: 'daily', time: '09:00' },
      })
      .run();
    addEvent(s, addTask(s, sales, salesStages.work, 'Feita à mão'), 'created');
    addEvent(s, addTask(s, sales, salesStages.work, 'Fechamento', { scheduleId }), 'created');

    // A tool request answered, and a failed run.
    const run = addRun(s.database, writer, { status: 'completed', finishedAt: time() });
    const approvalId = addPendingApproval(s.database, run);
    s.database.db.update(approvals).set({ status: 'approved', decidedAt: time() }).run();
    addRun(s.database, writer, { status: 'completed', finishedAt: time() });
    const failed = addRun(s.database, writer, { status: 'failed', finishedAt: time() });

    expect(await s.feed()).toEqual([
      {
        kind: 'failure',
        id: failed,
        at: someText,
        runId: failed,
        agentName: 'Redatora',
        taskTitle: null,
      },
      {
        kind: 'approval',
        id: approvalId,
        at: someText,
        agentName: 'Redatora',
        toolTitle: someText,
        status: 'approved',
      },
      {
        kind: 'scheduled',
        id: someText,
        at: someText,
        taskId: someText,
        title: 'Fechamento',
        areaName: 'Vendas',
      },
      {
        kind: 'delivery',
        id: someText,
        at: someText,
        taskId: request,
        title: 'Página de preços',
        fromArea: 'Site',
        toArea: 'Vendas',
      },
      {
        kind: 'task_done',
        id: someText,
        at: someText,
        taskId: report,
        title: 'Relatório do mês',
        areaName: 'Vendas',
        agentName: 'Redatora',
      },
    ]);
  });

  it(`brings at most ${ACTIVITY_LIMIT}, the newest`, async () => {
    const s = await setup();
    const agent = addAgent(s.database, { name: 'Testador' });
    const ids: string[] = [];
    for (let index = 0; index < ACTIVITY_LIMIT + 5; index += 1)
      ids.push(addRun(s.database, agent, { status: 'timed_out', finishedAt: time() }));
    const entries = await s.feed();
    expect(entries.map((entry) => entry.id)).toEqual(ids.reverse().slice(0, ACTIVITY_LIMIT));
  });
});
