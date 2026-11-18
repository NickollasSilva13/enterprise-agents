import type { ScheduleOutcome, ScheduleRule, TaskPriority } from '@ea/shared';
import { and, asc, eq, isNotNull, lte } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { projects, schedules, tasks } from '../../db/schema';

// Scheduled tasks (Phase 19).

export type ScheduleRow = typeof schedules.$inferSelect;

export function scheduleRows(db: Db) {
  return db
    .select({ schedule: schedules, areaName: projects.name })
    .from(schedules)
    .innerJoin(projects, eq(schedules.projectId, projects.id))
    .orderBy(asc(schedules.title))
    .all();
}

export function findSchedule(db: Db, scheduleId: string): ScheduleRow | undefined {
  return db.select().from(schedules).where(eq(schedules.id, scheduleId)).get();
}

export function countSchedules(db: Db): number {
  return db.select({ id: schedules.id }).from(schedules).all().length;
}

export function insertSchedule(
  db: Db,
  row: {
    id: string;
    projectId: string;
    title: string;
    description: string;
    acceptance: string;
    priority: TaskPriority;
    rule: ScheduleRule;
    enabled: boolean;
    nextRunAt: string | null;
  },
): void {
  db.insert(schedules).values(row).run();
}

export function updateSchedule(
  db: Db,
  scheduleId: string,
  patch: Partial<{
    title: string;
    description: string;
    acceptance: string;
    priority: TaskPriority;
    rule: ScheduleRule;
    enabled: boolean;
    nextRunAt: string | null;
    lastRunAt: string;
    lastOutcome: ScheduleOutcome;
    lastTaskId: string | null;
  }>,
): void {
  db.update(schedules)
    .set({ ...patch, updatedAt: new Date().toISOString() })
    .where(eq(schedules.id, scheduleId))
    .run();
}

/**
 * Tasks keep their history when their schedule goes: the link is cleared
 * first, in the same transaction (the column cannot cascade, see the schema).
 */
export function deleteScheduleRow(db: Db, scheduleId: string): void {
  db.transaction((tx) => {
    tx.update(tasks).set({ scheduleId: null }).where(eq(tasks.scheduleId, scheduleId)).run();
    tx.delete(schedules).where(eq(schedules.id, scheduleId)).run();
  });
}

/** Enabled schedules whose time has come, oldest first. */
export function dueSchedules(db: Db, nowIso: string): ScheduleRow[] {
  return db
    .select()
    .from(schedules)
    .where(
      and(
        eq(schedules.enabled, true),
        isNotNull(schedules.nextRunAt),
        lte(schedules.nextRunAt, nowIso),
      ),
    )
    .orderBy(asc(schedules.nextRunAt))
    .all();
}

/** When the next enabled schedule is due, as stored (ISO, UTC). */
export function nextDueAt(db: Db): string | null {
  return (
    db
      .select({ nextRunAt: schedules.nextRunAt })
      .from(schedules)
      .where(and(eq(schedules.enabled, true), isNotNull(schedules.nextRunAt)))
      .orderBy(asc(schedules.nextRunAt))
      .limit(1)
      .get()?.nextRunAt ?? null
  );
}

export function taskBrief(db: Db, taskId: string) {
  return db
    .select({ id: tasks.id, title: tasks.title, state: tasks.state })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .get();
}
