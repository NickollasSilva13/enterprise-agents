import { ACTIVE_RUN_STATUSES, type Office, type OfficeAgent, type OfficeRoom } from '@ea/shared';
import { and, asc, desc, eq, inArray, max, notInArray } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { approvals, messages, projects, runs, toolCalls } from '../../db/schema';
import type { ToolRegistry } from '../../tools/registry';
import { listAgentsWithState } from '../agents/repository';
import { messageText } from '../runs/service';

const PROMPT_PREVIEW_LENGTH = 120;

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

/** Per agent, its most recent run in progress. */
function currentRuns(db: Db): Map<string, CurrentRun> {
  const result = new Map<string, CurrentRun>();
  const active = db
    .select()
    .from(runs)
    .where(inArray(runs.status, ACTIVE_RUN_STATUSES))
    .orderBy(desc(runs.id))
    .all();
  for (const run of active) {
    if (result.has(run.agentId)) continue;
    result.set(run.agentId, {
      id: run.id,
      conversationId: run.conversationId,
      status: run.status,
      prompt: promptOf(db, run.id),
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

export const UNASSIGNED_ROOM_NAME = 'Sem projeto';

/**
 * The office view: one room per project, with its agents. Agents that belong
 * to no project share a last room, which only exists when it is occupied.
 */
export function getOffice(db: Db, registry: ToolRegistry): Office {
  const rooms = new Map<string | null, OfficeRoom>();
  for (const project of db.select().from(projects).orderBy(asc(projects.name)).all()) {
    rooms.set(project.id, {
      id: project.id,
      name: project.name,
      description: project.description,
      agents: [],
    });
  }

  const running = currentRuns(db);
  const finished = lastFinishedRuns(db);
  const waiting = pendingApprovals(db, registry);
  const delegating = delegations(db);
  const unassigned: OfficeAgent[] = [];
  for (const { agent, state } of listAgentsWithState(db)) {
    const occupant: OfficeAgent = {
      id: agent.id,
      name: agent.name,
      objective: agent.objective,
      state,
      currentRun: running.get(agent.id) ?? null,
      lastError: state === 'failed' ? (finished.get(agent.id)?.errorMessage ?? null) : null,
      pendingApproval: waiting.get(agent.id) ?? null,
      delegatingTo: delegating.get(agent.id) ?? [],
      idleSince:
        state === 'idle'
          ? idleSinceOf(agent.updatedAt, finished.get(agent.id)?.finishedAt ?? null)
          : null,
    };
    const room = agent.projectId === null ? undefined : rooms.get(agent.projectId);
    (room ? room.agents : unassigned).push(occupant);
  }

  const result = [...rooms.values()];
  if (unassigned.length > 0) {
    result.push({ id: null, name: UNASSIGNED_ROOM_NAME, description: '', agents: unassigned });
  }
  return { rooms: result };
}
