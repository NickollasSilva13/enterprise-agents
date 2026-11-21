import {
  ACTIVE_RUN_STATUSES,
  buildPresetLayout,
  type Office,
  type OfficeAgent,
  type OfficeLayout,
  type OfficeLayoutInput,
  type PresetRoom,
  validateLayout,
} from '@ea/shared';
import { and, asc, count, desc, eq, inArray, max, notInArray } from 'drizzle-orm';
import { ValidationError } from '../../core/errors';
import type { Db } from '../../db/client';
import {
  agents,
  approvals,
  messages,
  projects,
  runs,
  runSteps,
  tasks,
  toolCalls,
} from '../../db/schema';
import type { ToolRegistry } from '../../tools/registry';
import { listAgentsWithState, storedAppearance } from '../agents/repository';
import { messageText } from '../runs/service';
import { requestsMadeSince } from '../tasks/repository';
import { clearLayout, readStoredLayout, writeLayout } from './repository';

const PROMPT_PREVIEW_LENGTH = 120;

/** How long an agent spends taking a request to the other area's room (Phase 17). */
export const VISIT_MS = 20_000;

type CurrentRun = NonNullable<OfficeAgent['currentRun']>;

/** The message a run is answering, shortened for the activity balloon. */
function promptOf(db: Db, runId: string): string | null {
  const message = db
    .select({ content: messages.content })
    .from(messages)
    .where(and(eq(messages.runId, runId), eq(messages.role, 'user')))
    .get();
  const text = message ? messageText(message.content).replace(/\s+/g, ' ').trim() : '';
  if (text === '') return null;
  return text.length > PROMPT_PREVIEW_LENGTH
    ? `${text.slice(0, PROMPT_PREVIEW_LENGTH - 1)}…`
    : text;
}

/** "Tarefa: <title>", shortened like a prompt, for a run working on a board task (Phase 16). */
function taskTitleOf(db: Db, taskId: string): string | null {
  const task = db.select({ title: tasks.title }).from(tasks).where(eq(tasks.id, taskId)).get();
  if (!task) return null;
  const text = `Tarefa: ${task.title}`;
  return text.length > PROMPT_PREVIEW_LENGTH
    ? `${text.slice(0, PROMPT_PREVIEW_LENGTH - 1)}…`
    : text;
}

/** How many model calls a run has made: each one is a step of its limit (Phase 29, D4). */
function stepsOf(db: Db, runId: string): number {
  return (
    db
      .select({ value: count() })
      .from(runSteps)
      .where(and(eq(runSteps.runId, runId), eq(runSteps.type, 'model_call_started')))
      .get()?.value ?? 0
  );
}

/** Per agent, its most recent run in progress. */
function currentRuns(db: Db): Map<string, CurrentRun> {
  const result = new Map<string, CurrentRun>();
  const active = db
    .select({ run: runs, maxSteps: agents.maxSteps })
    .from(runs)
    .innerJoin(agents, eq(runs.agentId, agents.id))
    .where(inArray(runs.status, ACTIVE_RUN_STATUSES))
    .orderBy(desc(runs.id))
    .all();
  for (const { run, maxSteps } of active) {
    if (result.has(run.agentId)) continue;
    const task = run.taskId
      ? (db
          .select({ id: tasks.id, title: tasks.title })
          .from(tasks)
          .where(eq(tasks.id, run.taskId))
          .get() ?? null)
      : null;
    result.set(run.agentId, {
      id: run.id,
      conversationId: run.conversationId,
      status: run.status,
      // A run on a board task opens with the whole brief: the task's title says more.
      prompt: run.taskId ? taskTitleOf(db, run.taskId) : promptOf(db, run.id),
      startedAt: run.startedAt,
      steps: stepsOf(db, run.id),
      maxSteps,
      task,
    });
  }
  return result;
}

interface LastFinishedRun {
  readonly errorMessage: string | null;
  readonly finishedAt: string | null;
}

/** Per agent, how its latest finished run ended and when. */
function lastFinishedRuns(db: Db): Map<string, LastFinishedRun> {
  const rows = db
    .select({
      agentId: runs.agentId,
      errorMessage: runs.errorMessage,
      finishedAt: runs.finishedAt,
      lastId: max(runs.id),
    })
    .from(runs)
    .where(notInArray(runs.status, ACTIVE_RUN_STATUSES))
    .groupBy(runs.agentId)
    .all();
  return new Map(rows.map((row) => [row.agentId, row]));
}

/**
 * Since when an idle agent has had nothing to do: the end of its last run or
 * the last change to the agent itself (created, switched on, edited),
 * whichever is later. Nothing is stored for this (RF-80).
 */
function idleSinceOf(agentUpdatedAt: string, lastFinishedAt: string | null): string {
  if (lastFinishedAt === null) return agentUpdatedAt;
  return Date.parse(lastFinishedAt) > Date.parse(agentUpdatedAt) ? lastFinishedAt : agentUpdatedAt;
}

/** Per agent, the oldest decision it is waiting for. */
function pendingApprovals(
  db: Db,
  registry: ToolRegistry,
): Map<string, NonNullable<OfficeAgent['pendingApproval']>> {
  const result = new Map<string, NonNullable<OfficeAgent['pendingApproval']>>();
  const rows = db
    .select({ id: approvals.id, agentId: runs.agentId, toolName: toolCalls.toolName })
    .from(approvals)
    .innerJoin(runs, eq(approvals.runId, runs.id))
    .innerJoin(toolCalls, eq(approvals.toolCallId, toolCalls.id))
    .where(eq(approvals.status, 'pending'))
    .orderBy(asc(approvals.id))
    .all();
  for (const row of rows) {
    if (result.has(row.agentId)) continue;
    result.set(row.agentId, {
      id: row.id,
      toolTitle: registry.get(row.toolName)?.title ?? row.toolName,
    });
  }
  return result;
}

/** Per agent, the agents working now on tasks it delegated. */
function delegations(db: Db): Map<string, string[]> {
  const result = new Map<string, string[]>();
  const active = db
    .select({ id: runs.id, agentId: runs.agentId, parentRunId: runs.parentRunId })
    .from(runs)
    .where(inArray(runs.status, ACTIVE_RUN_STATUSES))
    .all();
  const agentOfRun = new Map(active.map((run) => [run.id, run.agentId]));
  for (const run of active) {
    const delegator = run.parentRunId ? agentOfRun.get(run.parentRunId) : undefined;
    if (!delegator) continue;
    const targets = result.get(delegator) ?? [];
    if (!targets.includes(run.agentId)) targets.push(run.agentId);
    result.set(delegator, targets);
  }
  return result;
}

/** Desks of agents that no longer exist go back to being free desks. */
function withoutDeletedOwners(layout: OfficeLayout, present: ReadonlySet<string>): OfficeLayout {
  return {
    ...layout,
    items: layout.items.map((item) =>
      item.agentId !== null && !present.has(item.agentId) ? { ...item, agentId: null } : item,
    ),
  };
}

/** The automatic layout: the "complete" preset with a room per project and one for agents without a project. */
function automaticLayout(db: Db, agentProjects: readonly (string | null)[]): OfficeLayout {
  const counts = new Map<string | null, number>();
  for (const projectId of agentProjects) counts.set(projectId, (counts.get(projectId) ?? 0) + 1);
  const rooms: PresetRoom[] = db
    .select({ id: projects.id })
    .from(projects)
    .orderBy(asc(projects.name))
    .all()
    .map((project) => ({ projectId: project.id, agents: counts.get(project.id) ?? 0 }));
  const homeless = counts.get(null) ?? 0;
  if (homeless > 0) rooms.push({ projectId: null, agents: homeless });
  return buildPresetLayout('complete', rooms);
}

/** The layout in use: the saved one, or the automatic one. */
export function currentLayout(db: Db): { layout: OfficeLayout; customized: boolean } {
  const agents = listAgentsWithState(db).map(({ agent }) => agent);
  const stored = readStoredLayout(db);
  if (stored) {
    return {
      layout: withoutDeletedOwners(stored, new Set(agents.map((agent) => agent.id))),
      customized: true,
    };
  }
  return {
    layout: automaticLayout(
      db,
      agents.map((agent) => agent.projectId),
    ),
    customized: false,
  };
}

/** Saves a layout made by the user, refusing it whole when anything is wrong. */
export function saveLayout(db: Db, input: OfficeLayoutInput): void {
  const problems: { path: string; message: string }[] = validateLayout(input).map((issue) => ({
    path:
      issue.area !== undefined
        ? `areas.${issue.area}`
        : issue.item !== undefined
          ? `items.${issue.item}`
          : '',
    message: issue.message,
  }));
  const projectIds = new Set(
    db
      .select({ id: projects.id })
      .from(projects)
      .all()
      .map((row) => row.id),
  );
  input.areas.forEach((area, index) => {
    if (area.projectId !== null && !projectIds.has(area.projectId)) {
      problems.push({ path: `areas.${index}.projectId`, message: 'Projeto não encontrado.' });
    }
  });
  const agentIds = new Set(listAgentsWithState(db).map(({ agent }) => agent.id));
  input.items.forEach((item, index) => {
    if (item.agentId !== null && !agentIds.has(item.agentId)) {
      problems.push({ path: `items.${index}.agentId`, message: 'Agente não encontrado.' });
    }
  });
  if (problems.length > 0) {
    throw new ValidationError(problems, 'O layout tem problemas e não foi salvo.');
  }
  writeLayout(db, input);
}

export function resetLayout(db: Db): void {
  clearLayout(db);
}

/** The latest request each agent took to another area, while it is still on its way. */
function visits(db: Db, now: number): Map<string, NonNullable<OfficeAgent['visit']>> {
  const found = new Map<string, NonNullable<OfficeAgent['visit']>>();
  for (const made of requestsMadeSince(db, new Date(now - VISIT_MS).toISOString())) {
    const until = new Date(Date.parse(made.createdAt) + VISIT_MS).toISOString();
    found.set(made.agentId, { areaId: made.areaId, until });
  }
  return found;
}

/** The office: its layout, its projects and every agent with what it is doing. */
export function getOffice(db: Db, registry: ToolRegistry, now = Date.now()): Office {
  const running = currentRuns(db);
  const finished = lastFinishedRuns(db);
  const waiting = pendingApprovals(db, registry);
  const delegating = delegations(db);
  const visiting = visits(db, now);
  const agents: OfficeAgent[] = listAgentsWithState(db).map(({ agent, state }) => ({
    id: agent.id,
    name: agent.name,
    objective: agent.objective,
    projectId: agent.projectId,
    appearance: storedAppearance(agent.appearance),
    state,
    currentRun: running.get(agent.id) ?? null,
    lastError: state === 'failed' ? (finished.get(agent.id)?.errorMessage ?? null) : null,
    pendingApproval: waiting.get(agent.id) ?? null,
    delegatingTo: delegating.get(agent.id) ?? [],
    idleSince:
      state === 'idle'
        ? idleSinceOf(agent.updatedAt, finished.get(agent.id)?.finishedAt ?? null)
        : null,
    visit: visiting.get(agent.id) ?? null,
  }));
  const { layout, customized } = currentLayout(db);
  return {
    layout,
    customized,
    projects: db
      .select({ id: projects.id, name: projects.name, description: projects.description })
      .from(projects)
      .orderBy(asc(projects.name))
      .all(),
    agents,
  };
}
