// Scheduled tasks (Phase 19) through the API and the real clock: rules and
// limits (D2, D4), a task created when due with its origin in the history
// (D1), one task for times missed while the server was off (D3), skipping
// while the last one is open (D4), pause, "criar agora" and deletion.
import {
  SCHEDULE_LIMITS,
  type Schedule,
  scheduleSchema,
  schedulesSchema,
  taskDetailSchema,
} from '@ea/shared';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import type { Database } from '../src/db/client';
import { newId } from '../src/db/ids';
import { auditLog, projects, schedules, tasks, workflowStages } from '../src/db/schema';
import { waitFor } from './fake-provider';
import { makeApp, makeDatabase, type TestApp } from './helpers';

let current: TestApp | undefined;
afterEach(async () => {
  await current?.close();
  current = undefined;
});

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

/** An area whose flow starts at a stage of the user, so no model runs. */
function seedArea(database: Database, name = 'Dados'): string {
  const areaId = newId();
  database.db.insert(projects).values({ id: areaId, name }).run();
  database.db
    .insert(workflowStages)
    .values([
      { id: newId(), projectId: areaId, position: 0, name: 'Fila', kind: 'human' },
      { id: newId(), projectId: areaId, position: 1, name: 'Fim', kind: 'done' },
    ])
    .run();
  return areaId;
}

/** A schedule stored as if made earlier, due at `due`. */
function seedSchedule(database: Database, areaId: string, due: Date): string {
  const id = newId();
  database.db
    .insert(schedules)
    .values({
      id,
      projectId: areaId,
      title: 'Relatório de vendas',
      acceptance: '- Total por dia.',
      rule: { kind: 'daily', time: '09:00' },
      nextRunAt: due.toISOString(),
    })
    .run();
  return id;
}

async function setup(database?: Database) {
  const test = await makeApp(database ? { database } : {});
  current = test;
  const call = async (method: Method, url: string, payload?: unknown) => {
    const response = await test.app.inject({
      method,
      url,
      headers: test.trusted,
      ...(payload === undefined ? {} : { payload: payload as object }),
    });
    return { status: response.statusCode, body: response.body ? response.json<unknown>() : null };
  };
  const list = async () =>
    schedulesSchema.parse((await call('GET', '/api/schedules')).body).schedules;
  const one = async (id: string): Promise<Schedule> => {
    const found = (await list()).find((schedule) => schedule.id === id);
    if (!found) throw new Error('sem o agendamento');
    return found;
  };
  const tasksOf = (scheduleId: string) =>
    test.database.db.select().from(tasks).where(eq(tasks.scheduleId, scheduleId)).all();
  const detail = async (taskId: string) =>
    taskDetailSchema.parse((await call('GET', `/api/tasks/${taskId}`)).body);
  return { ...test, call, list, one, tasksOf, detail };
}

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);

describe('schedules (Phase 19)', () => {
  it('creates a schedule with its next time, and refuses what cannot run', async () => {
    const s = await setup();
    const areaId = seedArea(s.database);
    const created = await s.call('POST', '/api/schedules', {
      areaId,
      title: 'Relatório semanal',
      rule: { kind: 'weekly', days: [1], time: '09:00' },
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const schedule = scheduleSchema.parse(created.body);
    expect(schedule).toMatchObject({ areaName: 'Dados', enabled: true, lastOutcome: null });
    const next = new Date(schedule.nextRunAt ?? '');
    expect(next.getDay()).toBe(1);
    expect([next.getHours(), next.getMinutes()]).toEqual([9, 0]);
    expect(next.getTime()).toBeGreaterThan(Date.now());

    const post = (body: object) => s.call('POST', '/api/schedules', body);
    const past = await post({ areaId, title: 'x', rule: { kind: 'once', at: '2020-01-01T09:00' } });
    expect(past.status).toBe(400);
    expect(JSON.stringify(past.body)).toContain('Escolha um horário no futuro.');
    expect(
      (await post({ areaId: 'nao-existe', title: 'x', rule: { kind: 'daily', time: '09:00' } }))
        .status,
    ).toBe(400);
    expect(
      (await post({ areaId, title: 'x', rule: { kind: 'daily', time: '09:00' }, stageId: 's' }))
        .status,
    ).toBe(400);
    // Paused, a single time in the past is fine: it never runs.
    expect(
      (
        await post({
          areaId,
          title: 'x',
          rule: { kind: 'once', at: '2020-01-01T09:00' },
          enabled: false,
        })
      ).status,
    ).toBe(201);
  });

  it('stops at the limit of schedules', async () => {
    const s = await setup();
    const areaId = seedArea(s.database);
    for (
      let n = s.database.db.select().from(schedules).all().length;
      n < SCHEDULE_LIMITS.max;
      n++
    ) {
      seedSchedule(s.database, areaId, new Date(Date.now() + 86_400_000));
    }
    const refused = await s.call('POST', '/api/schedules', {
      areaId,
      title: 'Mais um',
      rule: { kind: 'daily', time: '09:00' },
    });
    expect(refused.status).toBe(409);
  });

  it('creates what came due while the server was off, once, when it starts (D3)', async () => {
    const database = makeDatabase();
    const areaId = seedArea(database);
    // Due three days ago: three times were missed, one task is made.
    const scheduleId = seedSchedule(database, areaId, minutesAgo(3 * 24 * 60));
    const s = await setup(database);

    const made = await waitFor(async () => (s.tasksOf(scheduleId).length > 0 ? true : null));
    expect(made).toBe(true);
    expect(s.tasksOf(scheduleId)).toHaveLength(1);
    const task = s.tasksOf(scheduleId)[0]!;
    expect(task).toMatchObject({ title: 'Relatório de vendas', acceptance: '- Total por dia.' });

    const found = await s.detail(task.id);
    expect(found.task.stageName).toBe('Fila');
    expect(found.schedule).toEqual({ id: scheduleId, title: 'Relatório de vendas' });
    expect(found.events[0]).toMatchObject({ kind: 'created', actor: 'system' });
    expect(found.events[0]?.text).toMatch(
      /^Criada pelo agendamento "Relatório de vendas", marcado para .+\. A plataforma estava desligada nesse horário; criada às .+\.$/,
    );

    const schedule = await s.one(scheduleId);
    expect(schedule).toMatchObject({
      lastOutcome: 'created',
      lastTaskId: task.id,
      lastTaskTitle: 'Relatório de vendas',
    });
    // The next time counts from now, at 09:00.
    const next = new Date(schedule.nextRunAt ?? '');
    expect(next.getTime()).toBeGreaterThan(Date.now());
    expect(next.getTime() - Date.now()).toBeLessThanOrEqual(24 * 3_600_000);
    expect(
      s.database.db.select().from(auditLog).where(eq(auditLog.action, 'schedule.fired')).all(),
    ).toHaveLength(1);
  });

  it('skips a time while the last task is still open, and goes on after it ends (D4)', async () => {
    const s = await setup();
    const areaId = seedArea(s.database);
    const scheduleId = seedSchedule(s.database, areaId, new Date(Date.now() + 86_400_000));

    const first = scheduleSchema.parse(
      (await s.call('POST', `/api/schedules/${scheduleId}/run`)).body,
    );
    expect(first.lastOutcome).toBe('created');
    const taskId = first.lastTaskId ?? '';
    const asked = await s.detail(taskId);
    expect(asked.events[0]).toMatchObject({
      actor: 'user',
      text: 'Criada pelo agendamento "Relatório de vendas", a seu pedido.',
    });
    // Asking now does not move the next time.
    const before = (await s.one(scheduleId)).nextRunAt;

    // Due again by the clock while that task is open: skipped.
    s.database.db
      .update(schedules)
      .set({ nextRunAt: minutesAgo(1).toISOString() })
      .where(eq(schedules.id, scheduleId))
      .run();
    await s.call('PATCH', `/api/schedules/${scheduleId}`, { priority: 'high' });
    const skipped = await waitFor(async () => {
      const found = await s.one(scheduleId);
      return found.nextRunAt !== null && new Date(found.nextRunAt).getTime() > Date.now()
        ? found
        : null;
    });
    expect(skipped).toMatchObject({ lastOutcome: 'skipped', lastTaskId: taskId });
    expect(s.tasksOf(scheduleId)).toHaveLength(1);
    expect(before).not.toBeNull();

    // The task is finished: the next time makes a new one, with the new priority.
    expect((await s.call('POST', `/api/tasks/${taskId}/cancel`)).status).toBe(200);
    const again = scheduleSchema.parse(
      (await s.call('POST', `/api/schedules/${scheduleId}/run`)).body,
    );
    expect(again.lastOutcome).toBe('created');
    expect(
      s
        .tasksOf(scheduleId)
        .map((task) => task.priority)
        .sort(),
    ).toEqual(['high', 'normal']);
  });

  it('pauses and resumes from now, and recomputes when the rule changes', async () => {
    const s = await setup();
    const areaId = seedArea(s.database);
    const scheduleId = seedSchedule(s.database, areaId, new Date(Date.now() + 86_400_000));

    const paused = scheduleSchema.parse(
      (await s.call('PATCH', `/api/schedules/${scheduleId}`, { enabled: false })).body,
    );
    expect(paused).toMatchObject({ enabled: false, nextRunAt: null });

    const monthly = scheduleSchema.parse(
      (
        await s.call('PATCH', `/api/schedules/${scheduleId}`, {
          enabled: true,
          rule: { kind: 'monthly', day: 1, time: '06:30' },
        })
      ).body,
    );
    const next = new Date(monthly.nextRunAt ?? '');
    expect([next.getDate(), next.getHours(), next.getMinutes()]).toEqual([1, 6, 30]);
    expect((await s.call('PATCH', `/api/schedules/${scheduleId}`, {})).status).toBe(400);
    expect((await s.call('PATCH', `/api/schedules/${scheduleId}`, { areaId })).status).toBe(400);
    expect((await s.call('PATCH', '/api/schedules/nao-existe', { enabled: false })).status).toBe(
      404,
    );
  });

  it('records a failure when the area lost its flow, and keeps going', async () => {
    const s = await setup();
    const areaId = newId();
    s.database.db.insert(projects).values({ id: areaId, name: 'Sem fluxo' }).run();
    const scheduleId = seedSchedule(s.database, areaId, new Date(Date.now() + 86_400_000));
    const result = scheduleSchema.parse(
      (await s.call('POST', `/api/schedules/${scheduleId}/run`)).body,
    );
    expect(result).toMatchObject({ lastOutcome: 'failed', lastTaskId: null });
    expect(s.tasksOf(scheduleId)).toHaveLength(0);
  });

  it('deletes a schedule and leaves the tasks it made', async () => {
    const s = await setup();
    const areaId = seedArea(s.database);
    const scheduleId = seedSchedule(s.database, areaId, new Date(Date.now() + 86_400_000));
    const made = scheduleSchema.parse(
      (await s.call('POST', `/api/schedules/${scheduleId}/run`)).body,
    );

    expect((await s.call('DELETE', `/api/schedules/${scheduleId}`)).status).toBe(204);
    expect(await s.list()).toEqual([]);
    const task = await s.detail(made.lastTaskId ?? '');
    expect(task.schedule).toBeNull();
    expect(task.events[0]?.text).toContain('Relatório de vendas');
    expect((await s.call('DELETE', `/api/schedules/${scheduleId}`)).status).toBe(404);
    expect(
      s.database.db
        .select({ action: auditLog.action })
        .from(auditLog)
        .all()
        .map((entry) => entry.action)
        .filter((action) => action.startsWith('schedule.')),
    ).toEqual(['schedule.run_now', 'schedule.deleted']);
  });

  it('is gone with its area', async () => {
    const s = await setup();
    const areaId = seedArea(s.database, 'Temporária');
    seedSchedule(s.database, areaId, new Date(Date.now() + 86_400_000));
    s.database.db.delete(workflowStages).where(eq(workflowStages.projectId, areaId)).run();
    expect((await s.call('DELETE', `/api/projects/${areaId}`)).status).toBe(204);
    expect(await s.list()).toEqual([]);
  });
});
