// The indicators of the office (Phase 30, D1, D2): each figure with known
// data, on a fixed clock, and the route over a real database.
import { INDICATOR_DAYS, indicatorsSchema } from '@ea/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { newId } from '../src/db/ids';
import { taskEvents, tasks, workflowStages } from '../src/db/schema';
import { countIndicators, type Completion, type EndedRun } from '../src/modules/indicators/service';
import { addAgent, addProject, addRun } from './fixtures';
import { makeApp, type TestApp } from './helpers';

/** 15:00 on 19 November, on this machine's clock. */
const NOW = new Date(2026, 10, 19, 15, 0);
/** A local time `days` days before NOW's day, at `hour`. */
const at = (days: number, hour = 10, minutes = 0) =>
  new Date(2026, 10, 19 - days, hour, minutes).toISOString();
const MINUTE = 60_000;

const done = (taskId: string, days: number, tookMinutes: number, hour = 10): Completion => {
  const doneAt = at(days, hour);
  return {
    taskId,
    doneAt,
    createdAt: new Date(Date.parse(doneAt) - tookMinutes * MINUTE).toISOString(),
  };
};
const ended = (status: string, days: number, hour = 10): EndedRun => ({
  status,
  finishedAt: at(days, hour),
});

describe('countIndicators', () => {
  it('says nothing was measured on a new installation', () => {
    const empty = countIndicators([], [], NOW);
    expect(empty.doneToday).toEqual({ today: 0, yesterday: 0, series: Array(7).fill(0) });
    expect(empty.meanTaskTime).toEqual({ ms: null, tasks: 0, series: Array(7).fill(null) });
    expect(empty.runsWithoutFailure).toEqual({ rate: null, runs: 0, series: Array(7).fill(null) });
    expect(empty.doneThisWeek).toEqual({ week: 0, previousWeek: 0, series: Array(7).fill(0) });
    expect(indicatorsSchema.parse(empty)).toEqual(empty);
  });

  it('counts the tasks done today against yesterday, by the days of this clock', () => {
    const result = countIndicators(
      [
        done('t1', 0, 30),
        // Just after midnight is today; just before it, yesterday.
        done('t2', 0, 30, 0),
        { ...done('t3', 1, 30), doneAt: new Date(2026, 10, 18, 23, 59).toISOString() },
        done('t4', 6, 30),
        // A week ago is out of the series, and in the previous week.
        done('t5', 7, 30),
        // The same task again, in another done stage: counted on its first day only.
        done('t1', 0, 90, 14),
      ],
      [],
      NOW,
    );
    expect(result.doneToday).toEqual({ today: 2, yesterday: 1, series: [1, 0, 0, 0, 0, 1, 2] });
    expect(result.doneThisWeek).toEqual({
      week: 4,
      previousWeek: 1,
      series: [1, 0, 0, 0, 0, 1, 2],
    });
  });

  it('averages the time from creation to completion over the last days, and per day', () => {
    const result = countIndicators(
      [done('t1', 0, 10), done('t2', 0, 30), done('t3', 2, 60), done('t4', 9, 600)],
      [],
      NOW,
    );
    expect(result.meanTaskTime.tasks).toBe(3);
    expect(result.meanTaskTime.ms).toBeCloseTo((100 / 3) * MINUTE, 3);
    expect(result.meanTaskTime.series).toEqual([
      null,
      null,
      null,
      null,
      60 * MINUTE,
      null,
      20 * MINUTE,
    ]);
  });

  it('counts runs without failure among those that ended on their own', () => {
    const result = countIndicators(
      [],
      [
        ended('completed', 0),
        ended('completed', 0),
        ended('failed', 0),
        ended('timed_out', 3),
        ended('completed', 3),
        // Older than the last days: out of the rate.
        ended('failed', 8),
        { status: 'completed', finishedAt: null },
      ],
      NOW,
    );
    expect(result.runsWithoutFailure.runs).toBe(5);
    expect(result.runsWithoutFailure.rate).toBe(0.6);
    expect(result.runsWithoutFailure.series).toEqual([null, null, null, 0.5, null, null, 2 / 3]);
    expect(result.runsWithoutFailure.series).toHaveLength(INDICATOR_DAYS);
  });
});

let current: TestApp | undefined;
afterEach(async () => {
  await current?.close();
  current = undefined;
});

describe('GET /api/indicators', () => {
  it('counts from the history: done stages only, runs that ended on their own', async () => {
    const s = await makeApp();
    current = s;
    const area = addProject(s.database, 'Vendas');
    const work = newId();
    const finished = newId();
    s.database.db
      .insert(workflowStages)
      .values([
        { id: work, projectId: area, position: 0, name: 'Fazer', kind: 'agent' },
        { id: finished, projectId: area, position: 1, name: 'Pronto', kind: 'done' },
      ])
      .run();
    const taskId = newId();
    s.database.db
      .insert(tasks)
      .values({ id: taskId, projectId: area, stageId: finished, title: 'Relatório', state: 'done' })
      .run();
    // Into a working stage is not done; into the done stage is.
    for (const toStage of ['Fazer', 'Pronto'])
      s.database.db
        .insert(taskEvents)
        .values({ id: newId(), taskId, kind: 'moved', actor: 'agent', toStage })
        .run();
    const agent = addAgent(s.database, { name: 'Testador' });
    const now = new Date().toISOString();
    addRun(s.database, agent, { status: 'completed', finishedAt: now });
    addRun(s.database, agent, { status: 'failed', finishedAt: now });
    // Stopped by the user or by the server: not the agent's failure.
    addRun(s.database, agent, { status: 'cancelled', finishedAt: now });
    addRun(s.database, agent, { status: 'interrupted', finishedAt: now });

    const response = await s.app.inject({
      method: 'GET',
      url: '/api/indicators',
      headers: s.trusted,
    });
    expect(response.statusCode).toBe(200);
    const indicators = indicatorsSchema.parse(response.json());
    expect(indicators.doneToday.today).toBe(1);
    expect(indicators.doneThisWeek.week).toBe(1);
    expect(indicators.meanTaskTime.tasks).toBe(1);
    expect(indicators.runsWithoutFailure).toMatchObject({ rate: 0.5, runs: 2 });
  });
});
