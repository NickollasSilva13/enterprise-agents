import { and, asc, eq, gte, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { runs, taskEvents, tasks, workflowStages } from '../../db/schema';

// The history behind the indicators (Phase 30). Only what the counts need,
// from `since` on; the service buckets it by day.

/** Moves of a task into a "done" stage of its area, oldest first, with when the task was created. */
export function completionsSince(db: Db, since: string) {
  return (
    db
      .select({ taskId: tasks.id, createdAt: tasks.createdAt, doneAt: taskEvents.createdAt })
      .from(taskEvents)
      .innerJoin(tasks, eq(taskEvents.taskId, tasks.id))
      // The event keeps the stage's name as it was; the stage is found by that name.
      .innerJoin(
        workflowStages,
        and(
          eq(workflowStages.projectId, tasks.projectId),
          eq(workflowStages.name, taskEvents.toStage),
          eq(workflowStages.kind, 'done'),
        ),
      )
      .where(and(eq(taskEvents.kind, 'moved'), gte(taskEvents.createdAt, since)))
      .orderBy(asc(taskEvents.id))
      .all()
  );
}

/** Runs that ended on their own, well or not: the user's stop and a server stop are left out. */
export function runsEndedSince(db: Db, since: string) {
  return db
    .select({ status: runs.status, finishedAt: runs.finishedAt })
    .from(runs)
    .where(
      and(inArray(runs.status, ['completed', 'failed', 'timed_out']), gte(runs.finishedAt, since)),
    )
    .all();
}
