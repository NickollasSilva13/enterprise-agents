import { INDICATOR_DAYS, type Indicators } from '@ea/shared';
import type { Db } from '../../db/client';
import { completionsSince, runsEndedSince } from './repository';

// The indicators of the office (Phase 30, D1): counted on every read from the
// history, in the days of this machine's clock (D2). The counting is a pure
// function of the rows and of `now`, so the tests set the clock.

const DAY_MS = 24 * 60 * 60 * 1000;

const startOfDay = (time: Date) =>
  new Date(time.getFullYear(), time.getMonth(), time.getDate()).getTime();

/** How many days before today `iso` is: 0 today, 1 yesterday, and so on. */
function daysAgo(iso: string, today: number): number {
  // Rounded: a day of a daylight saving change is an hour longer or shorter.
  return Math.round((today - startOfDay(new Date(iso))) / DAY_MS);
}

export interface Completion {
  readonly taskId: string;
  readonly createdAt: string;
  readonly doneAt: string;
}

export interface EndedRun {
  readonly status: string;
  readonly finishedAt: string | null;
}

/** One value per day of the last `INDICATOR_DAYS`, oldest first. */
function perDay<T>(
  items: readonly T[],
  dayOf: (item: T) => number,
  value: (day: T[]) => number | null,
) {
  const days = Array.from({ length: INDICATOR_DAYS }, () => [] as T[]);
  for (const item of items) {
    const ago = dayOf(item);
    if (ago >= 0 && ago < INDICATOR_DAYS) days[INDICATOR_DAYS - 1 - ago]?.push(item);
  }
  return days.map(value);
}

const mean = (values: readonly number[]) =>
  values.length === 0 ? null : values.reduce((sum, each) => sum + each, 0) / values.length;

export function countIndicators(
  completions: readonly Completion[],
  ended: readonly EndedRun[],
  now: Date,
): Indicators {
  const today = startOfDay(now);
  // A task counts once, on the first day it was done: going between two done stages is not news.
  const firsts = new Map<string, Completion>();
  for (const completion of completions)
    if (!firsts.has(completion.taskId)) firsts.set(completion.taskId, completion);
  const done = [...firsts.values()];
  const doneAgo = (completion: Completion) => daysAgo(completion.doneAt, today);
  const duration = (completion: Completion) =>
    Math.max(0, Date.parse(completion.doneAt) - Date.parse(completion.createdAt));
  const recent = done.filter((completion) => doneAgo(completion) < INDICATOR_DAYS);
  const counts = perDay(done, doneAgo, (day) => day.length);

  const runs = ended.flatMap((run) =>
    run.finishedAt === null ? [] : [{ ...run, at: run.finishedAt }],
  );
  const runAgo = (run: { at: string }) => daysAgo(run.at, today);
  const recentRuns = runs.filter((run) => runAgo(run) < INDICATOR_DAYS);
  const rate = (list: readonly { status: string }[]) =>
    list.length === 0
      ? null
      : list.filter((run) => run.status === 'completed').length / list.length;

  return {
    doneToday: {
      today: done.filter((completion) => doneAgo(completion) === 0).length,
      yesterday: done.filter((completion) => doneAgo(completion) === 1).length,
      series: counts,
    },
    meanTaskTime: {
      ms: mean(recent.map(duration)),
      tasks: recent.length,
      series: perDay(done, doneAgo, (day) => mean(day.map(duration))),
    },
    runsWithoutFailure: {
      rate: rate(recentRuns),
      runs: recentRuns.length,
      series: perDay(runs, runAgo, rate),
    },
    doneThisWeek: {
      week: recent.length,
      previousWeek: done.filter((completion) => {
        const ago = doneAgo(completion);
        return ago >= INDICATOR_DAYS && ago < 2 * INDICATOR_DAYS;
      }).length,
      series: counts,
    },
    generatedAt: now.toISOString(),
  };
}

export function getIndicators(db: Db, now = new Date()): Indicators {
  // Two weeks back, from the start of a day: this week and the one before it.
  const since = new Date(startOfDay(now) - (2 * INDICATOR_DAYS - 1) * DAY_MS).toISOString();
  return countIndicators(completionsSince(db, since), runsEndedSince(db, since), now);
}
