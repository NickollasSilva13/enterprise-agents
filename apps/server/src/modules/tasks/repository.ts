import {
  ACTIVE_RUN_STATUSES,
  type AuditActor,
  type TaskEvent,
  type TaskEventKind,
  type TaskSummary,
  type Workflow,
  type WorkflowStage,
} from '@ea/shared';
import { and, asc, desc, eq, inArray, isNull, ne } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { newId } from '../../db/ids';
import {
  agents,
  projects,
  runs,
  taskEvents,
  tasks,
  workflowStages,
  workflowTransitions,
} from '../../db/schema';

export type TaskRow = typeof tasks.$inferSelect;
export type StageRow = typeof workflowStages.$inferSelect;
export type TransitionRow = typeof workflowTransitions.$inferSelect;
export type AreaRow = typeof projects.$inferSelect;

/** Drizzle's transaction handle exposes the same query builder as the database. */
type Tx = Pick<Db, 'select' | 'insert' | 'update' | 'delete'>;

export function findArea(db: Tx, areaId: string): AreaRow | undefined {
  return db.select().from(projects).where(eq(projects.id, areaId)).get();
}

export function findTask(db: Tx, taskId: string): TaskRow | undefined {
  return db.select().from(tasks).where(eq(tasks.id, taskId)).get();
}

export function stagesOf(db: Tx, areaId: string): StageRow[] {
  return db
    .select()
    .from(workflowStages)
    .where(eq(workflowStages.projectId, areaId))
    .orderBy(asc(workflowStages.position))
    .all();
}

export function findStage(db: Tx, stageId: string): StageRow | undefined {
  return db.select().from(workflowStages).where(eq(workflowStages.id, stageId)).get();
}

export function transitionsOf(db: Tx, areaId: string): TransitionRow[] {
  return db
    .select()
    .from(workflowTransitions)
    .where(eq(workflowTransitions.projectId, areaId))
    .all();
}

export function transitionsFrom(db: Tx, stageId: string): TransitionRow[] {
  return db
    .select()
    .from(workflowTransitions)
    .where(eq(workflowTransitions.fromStageId, stageId))
    .all();
}

/** Active agents of an area, by id. */
export function agentsOfArea(db: Tx, areaId: string) {
  return db
    .select()
    .from(agents)
    .where(and(eq(agents.projectId, areaId), isNull(agents.deletedAt)))
    .all();
}

export function agentById(db: Tx, agentId: string) {
  return db
    .select()
    .from(agents)
    .where(and(eq(agents.id, agentId), isNull(agents.deletedAt)))
    .get();
}

/** Tasks with a run that is queued, running or waiting for the user. */
export function workingTaskIds(db: Tx): Set<string> {
  return new Set(
    db
      .select({ taskId: runs.taskId })
      .from(runs)
      .where(inArray(runs.status, ACTIVE_RUN_STATUSES))
      .all()
      .flatMap((row) => (row.taskId ? [row.taskId] : [])),
  );
}

/** Agents busy with a task right now (one task at a time, D5). */
export function busyAgentIds(db: Tx): Set<string> {
  return new Set(
    db
      .select({ agentId: runs.agentId })
      .from(runs)
      .where(and(inArray(runs.status, ACTIVE_RUN_STATUSES), eq(runs.trigger, 'task')))
      .all()
      .map((row) => row.agentId),
  );
}

export function findRunOfTask(db: Tx, runId: string) {
  return db
    .select({
      id: runs.id,
      taskId: runs.taskId,
      agentId: runs.agentId,
      status: runs.status,
      errorMessage: runs.errorMessage,
    })
    .from(runs)
    .where(eq(runs.id, runId))
    .get();
}

/** The latest run of each task given, by task id. */
export function latestRuns(db: Tx, taskIds: readonly string[]) {
  if (taskIds.length === 0) return new Map<string, { id: string; status: string }>();
  const rows = db
    .select({ id: runs.id, taskId: runs.taskId, status: runs.status })
    .from(runs)
    .where(inArray(runs.taskId, [...taskIds]))
    .orderBy(asc(runs.id))
    .all();
  const latest = new Map<string, { id: string; status: string }>();
  for (const row of rows)
    if (row.taskId) latest.set(row.taskId, { id: row.id, status: row.status });
  return latest;
}

/** True if the run moved the task (the run only moves it once). */
export function runMovedTask(db: Tx, taskId: string, runId: string): boolean {
  return (
    db
      .select({ id: taskEvents.id })
      .from(taskEvents)
      .where(
        and(
          eq(taskEvents.taskId, taskId),
          eq(taskEvents.runId, runId),
          eq(taskEvents.kind, 'moved'),
        ),
      )
      .get() !== undefined
  );
}

/** Open tasks that may need a run: in an agent stage, flowing, not finished. */
export function openTasks(db: Tx): TaskRow[] {
  return db
    .select()
    .from(tasks)
    .where(and(eq(tasks.state, 'open'), isNull(tasks.attention)))
    .orderBy(asc(tasks.id))
    .all();
}

export function tasksOfArea(db: Tx, areaId: string, limit: number): TaskRow[] {
  return db
    .select()
    .from(tasks)
    .where(and(eq(tasks.projectId, areaId), ne(tasks.state, 'cancelled')))
    .orderBy(desc(tasks.id))
    .limit(limit)
    .all();
}

export function insertEvent(
  db: Tx,
  event: {
    taskId: string;
    kind: TaskEventKind;
    actor: AuditActor;
    agentId?: string | null;
    runId?: string | null;
    fromStage?: string | null;
    toStage?: string | null;
    text?: string;
  },
): void {
  db.insert(taskEvents)
    .values({
      id: newId(),
      taskId: event.taskId,
      kind: event.kind,
      actor: event.actor,
      agentId: event.agentId ?? null,
      runId: event.runId ?? null,
      fromStage: event.fromStage ?? null,
      toStage: event.toStage ?? null,
      text: event.text ?? '',
    })
    .run();
}

export function eventsOf(db: Tx, taskId: string): TaskEvent[] {
  return db
    .select({
      id: taskEvents.id,
      kind: taskEvents.kind,
      actor: taskEvents.actor,
      agentId: taskEvents.agentId,
      agentName: agents.name,
      runId: taskEvents.runId,
      fromStageName: taskEvents.fromStage,
      toStageName: taskEvents.toStage,
      text: taskEvents.text,
      createdAt: taskEvents.createdAt,
    })
    .from(taskEvents)
    .leftJoin(agents, eq(taskEvents.agentId, agents.id))
    .where(eq(taskEvents.taskId, taskId))
    .orderBy(asc(taskEvents.id))
    .all();
}

export function updateTask(db: Tx, taskId: string, patch: Partial<TaskRow>): void {
  db.update(tasks)
    .set({ ...patch, updatedAt: new Date().toISOString() })
    .where(eq(tasks.id, taskId))
    .run();
}

export function insertTask(db: Tx, row: typeof tasks.$inferInsert): void {
  db.insert(tasks).values(row).run();
}

/** The workflow of an area, with the agent names and how many tasks wait in each stage. */
export function readWorkflow(db: Tx, areaId: string): Workflow {
  const stageRows = stagesOf(db, areaId);
  const names = new Map(agentsOfArea(db, areaId).map((agent) => [agent.id, agent.name] as const));
  const open = db
    .select({ stageId: tasks.stageId })
    .from(tasks)
    .where(and(eq(tasks.projectId, areaId), eq(tasks.state, 'open')))
    .all();
  const stages: WorkflowStage[] = stageRows.map((stage) => ({
    id: stage.id,
    name: stage.name,
    kind: stage.kind,
    position: stage.position,
    agentId: stage.agentId,
    agentName: stage.agentId ? (names.get(stage.agentId) ?? null) : null,
    openTasks: open.filter((task) => task.stageId === stage.id).length,
  }));
  return {
    areaId,
    stages,
    transitions: transitionsOf(db, areaId).map((transition) => ({
      id: transition.id,
      fromStageId: transition.fromStageId,
      toStageId: transition.toStageId,
      actor: transition.actor,
    })),
  };
}

/** Builds the summary of tasks as the board shows them. */
export function summarize(db: Tx, rows: readonly TaskRow[]): TaskSummary[] {
  if (rows.length === 0) return [];
  const stageIds = [...new Set(rows.map((row) => row.stageId))];
  const stages = new Map(
    db
      .select()
      .from(workflowStages)
      .where(inArray(workflowStages.id, stageIds))
      .all()
      .map((stage) => [stage.id, stage] as const),
  );
  const agentNames = new Map(
    db
      .select({ id: agents.id, name: agents.name })
      .from(agents)
      .where(isNull(agents.deletedAt))
      .all()
      .map((agent) => [agent.id, agent.name] as const),
  );
  const working = workingTaskIds(db);
  const busy = busyAgentIds(db);
  return rows.map((row) => {
    const stage = stages.get(row.stageId);
    const agentId = stage?.kind === 'agent' ? (stage.agentId ?? null) : null;
    const isWorking = working.has(row.id);
    return {
      id: row.id,
      areaId: row.projectId,
      title: row.title,
      priority: row.priority,
      state: row.state,
      stageId: row.stageId,
      stageName: stage?.name ?? '',
      stageKind: stage?.kind ?? 'human',
      agentId,
      agentName: agentId ? (agentNames.get(agentId) ?? null) : null,
      attention: row.attention,
      working: isWorking,
      queued:
        !isWorking &&
        row.state === 'open' &&
        row.attention === null &&
        agentId !== null &&
        busy.has(agentId),
      returns: row.returns,
      runCount: row.runCount,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  });
}

/** Replaces the stages and transitions of an area, keeping the ids of stages that stay. */
export function replaceWorkflow(
  db: Tx,
  areaId: string,
  stages: readonly {
    id: string;
    isNew: boolean;
    position: number;
    name: string;
    kind: StageRow['kind'];
    agentId: string | null;
  }[],
  removedStageIds: readonly string[],
  transitions: readonly { fromStageId: string; toStageId: string; actor: TransitionRow['actor'] }[],
): void {
  db.delete(workflowTransitions).where(eq(workflowTransitions.projectId, areaId)).run();
  for (const stage of stages) {
    if (stage.isNew) {
      db.insert(workflowStages)
        .values({
          id: stage.id,
          projectId: areaId,
          position: stage.position,
          name: stage.name,
          kind: stage.kind,
          agentId: stage.agentId,
        })
        .run();
    } else {
      db.update(workflowStages)
        .set({
          position: stage.position,
          name: stage.name,
          kind: stage.kind,
          agentId: stage.agentId,
        })
        .where(eq(workflowStages.id, stage.id))
        .run();
    }
  }
  if (removedStageIds.length > 0) {
    db.delete(workflowStages)
      .where(inArray(workflowStages.id, [...removedStageIds]))
      .run();
  }
  if (transitions.length > 0) {
    db.insert(workflowTransitions)
      .values(transitions.map((transition) => ({ id: newId(), projectId: areaId, ...transition })))
      .run();
  }
}

/** Open tasks sitting in any of these stages. */
export function tasksInStages(db: Tx, stageIds: readonly string[]): number {
  if (stageIds.length === 0) return 0;
  return db
    .select({ id: tasks.id })
    .from(tasks)
    .where(inArray(tasks.stageId, [...stageIds]))
    .all().length;
}

/** Tasks that wait for the user: in a stage of theirs, or stopped with a reason. */
export function waitingTasks(db: Tx): (TaskRow & { areaName: string })[] {
  const rows = db
    .select({ task: tasks, areaName: projects.name, kind: workflowStages.kind })
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .innerJoin(workflowStages, eq(tasks.stageId, workflowStages.id))
    .where(eq(tasks.state, 'open'))
    .orderBy(asc(tasks.id))
    .all();
  return rows
    .filter((row) => row.kind === 'human' || row.task.attention !== null)
    .map((row) => ({ ...row.task, areaName: row.areaName }));
}
