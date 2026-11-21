import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import type { Db } from '../../db/client';
import {
  agents,
  approvals,
  projects,
  runs,
  taskEvents,
  tasks,
  toolCalls,
  workflowStages,
} from '../../db/schema';

// The history behind the office's recent activity (Phase 29, D5). Each
// source is read newest first and cut at `limit`; the service merges them.
// It is history: an agent removed later keeps its name here, as in the
// activity of the dashboard.

/** Moves into a stage of kind "done" of the task's area. */
export function tasksDone(db: Db, limit: number) {
  return (
    db
      .select({
        id: taskEvents.id,
        at: taskEvents.createdAt,
        taskId: tasks.id,
        title: tasks.title,
        areaName: projects.name,
        agentName: agents.name,
      })
      .from(taskEvents)
      .innerJoin(tasks, eq(taskEvents.taskId, tasks.id))
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      // The event keeps the stage's name as it was; the stage is found by that name.
      .innerJoin(
        workflowStages,
        and(
          eq(workflowStages.projectId, tasks.projectId),
          eq(workflowStages.name, taskEvents.toStage),
          eq(workflowStages.kind, 'done'),
        ),
      )
      .leftJoin(agents, eq(taskEvents.agentId, agents.id))
      .where(eq(taskEvents.kind, 'moved'))
      .orderBy(desc(taskEvents.id))
      .limit(limit)
      .all()
  );
}

const parents = alias(tasks, 'parent_tasks');
const parentAreas = alias(projects, 'parent_areas');

/** Deliveries, as recorded on the task that was asked for. */
export function deliveries(db: Db, limit: number) {
  return (
    db
      .select({
        id: taskEvents.id,
        at: taskEvents.createdAt,
        taskId: tasks.id,
        title: tasks.title,
        fromArea: projects.name,
        toArea: parentAreas.name,
      })
      .from(taskEvents)
      .innerJoin(tasks, eq(taskEvents.taskId, tasks.id))
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      // Each delivery is written on both tasks; the one on the request is kept.
      .innerJoin(
        parents,
        and(eq(parents.id, tasks.parentTaskId), eq(parents.id, taskEvents.relatedTaskId)),
      )
      .innerJoin(parentAreas, eq(parents.projectId, parentAreas.id))
      .where(eq(taskEvents.kind, 'delivered'))
      .orderBy(desc(taskEvents.id))
      .limit(limit)
      .all()
  );
}

/** Tasks a schedule created. */
export function scheduledTasks(db: Db, limit: number) {
  return db
    .select({
      id: taskEvents.id,
      at: taskEvents.createdAt,
      taskId: tasks.id,
      title: tasks.title,
      areaName: projects.name,
    })
    .from(taskEvents)
    .innerJoin(tasks, eq(taskEvents.taskId, tasks.id))
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .where(and(eq(taskEvents.kind, 'created'), isNotNull(tasks.scheduleId)))
    .orderBy(desc(taskEvents.id))
    .limit(limit)
    .all();
}

/** Requests to use a tool, with the answer when there is one; dated by the latest of the two. */
export function approvalsMade(db: Db, limit: number) {
  const at = sql<string>`coalesce(${approvals.decidedAt}, ${approvals.createdAt})`;
  return db
    .select({
      id: approvals.id,
      at,
      status: approvals.status,
      agentName: agents.name,
      toolName: toolCalls.toolName,
    })
    .from(approvals)
    .innerJoin(runs, eq(approvals.runId, runs.id))
    .innerJoin(agents, eq(runs.agentId, agents.id))
    .innerJoin(toolCalls, eq(approvals.toolCallId, toolCalls.id))
    .orderBy(desc(at))
    .limit(limit)
    .all();
}

/** Runs that failed or ran out of time. */
export function failedRuns(db: Db, limit: number) {
  return db
    .select({
      id: runs.id,
      at: runs.finishedAt,
      agentName: agents.name,
      taskTitle: tasks.title,
    })
    .from(runs)
    .innerJoin(agents, eq(runs.agentId, agents.id))
    .leftJoin(tasks, eq(runs.taskId, tasks.id))
    .where(and(inArray(runs.status, ['failed', 'timed_out']), isNotNull(runs.finishedAt)))
    .orderBy(desc(runs.finishedAt))
    .limit(limit)
    .all();
}
