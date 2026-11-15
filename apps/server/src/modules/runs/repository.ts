import {
  ACTIVE_RUN_STATUSES,
  RUN_LIST_LIMITS,
  type RunList,
  type RunListQuery,
  type RunStep,
  type RunSummary,
  type RunTreeNode,
} from '@ea/shared';
import { and, asc, desc, eq, gt, gte, inArray, lt, lte, max, type SQL } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { newId } from '../../db/ids';
import {
  agents,
  approvals,
  conversations,
  messages,
  runs,
  runSteps,
  toolCalls,
} from '../../db/schema';
import { recordAudit } from '../audit/service';
import type { StepRecord, StepWriter } from '../../runtime/event-bus';
import type { RunOutcome, RunStore } from '../../runtime/types';

export type RunRow = typeof runs.$inferSelect;

const nowIso = () => new Date().toISOString();

/** Appends a step with the next sequence number of its run. */
export function createStepWriter(db: Db): StepWriter {
  return (runId, type, payload): StepRecord => {
    const last = db
      .select({ seq: max(runSteps.seq) })
      .from(runSteps)
      .where(eq(runSteps.runId, runId))
      .get();
    const step = { runId, seq: (last?.seq ?? 0) + 1, type, payload, createdAt: nowIso() };
    db.insert(runSteps)
      .values({ id: newId(), ...step })
      .run();
    return step;
  };
}

function recordEnd(db: Db, runId: string, outcome: RunOutcome): void {
  const finishedAt = nowIso();
  db.transaction((tx) => {
    const run = tx
      .select({ conversationId: runs.conversationId })
      .from(runs)
      .where(eq(runs.id, runId))
      .get();
    tx.update(runs)
      .set({
        status: outcome.status,
        endReason: outcome.endReason,
        errorMessage: outcome.errorMessage,
        inputTokens: outcome.inputTokens,
        outputTokens: outcome.outputTokens,
        finishedAt,
      })
      .where(eq(runs.id, runId))
      .run();
    if (!run?.conversationId) return;
    // Partial output of an interrupted run is kept too (UC-04).
    if (outcome.text.trim() !== '') {
      tx.insert(messages)
        .values({
          id: newId(),
          conversationId: run.conversationId,
          runId,
          role: 'assistant',
          content: { text: outcome.text },
        })
        .run();
    }
    tx.update(conversations)
      .set({ updatedAt: finishedAt })
      .where(eq(conversations.id, run.conversationId))
      .run();
  });
}

/** The runtime's window onto the database. */
export function createRunStore(db: Db): RunStore {
  return {
    begin(runId) {
      db.update(runs)
        .set({ status: 'running', startedAt: nowIso() })
        .where(eq(runs.id, runId))
        .run();
    },
    finish(runId, outcome) {
      recordEnd(db, runId, outcome);
    },
    setStatus(runId, status) {
      db.update(runs).set({ status }).where(eq(runs.id, runId)).run();
    },
    createToolCall(runId, call) {
      const id = newId();
      db.insert(toolCalls)
        .values({
          id,
          runId,
          toolName: call.toolName,
          arguments: call.arguments,
          permissionDecision: call.permission,
          status: call.status,
        })
        .run();
      return id;
    },
    updateToolCall(toolCallId, update) {
      const finished = update.status !== 'running' && update.status !== 'waiting_approval';
      db.update(toolCalls)
        .set({
          status: update.status,
          ...(update.result === undefined ? {} : { result: { content: update.result } }),
          ...(update.errorMessage === undefined ? {} : { errorMessage: update.errorMessage }),
          ...(update.status === 'running' ? { startedAt: nowIso() } : {}),
          ...(finished ? { finishedAt: nowIso() } : {}),
        })
        .where(eq(toolCalls.id, toolCallId))
        .run();
    },
    createApproval(runId, toolCallId) {
      const id = newId();
      db.insert(approvals).values({ id, runId, toolCallId }).run();
      return id;
    },
    resolveApproval(approvalId, status, reason) {
      db.update(approvals)
        .set({ status, reason, decidedAt: nowIso() })
        .where(eq(approvals.id, approvalId))
        .run();
    },
    auditToolCall(entry) {
      recordAudit(db, {
        actor: 'agent',
        action: entry.failed ? 'tool.failed' : 'tool.executed',
        target: entry.toolName,
        agentId: entry.agentId,
        runId: entry.runId,
        details: {
          toolCallId: entry.toolCallId,
          approvedByUser: entry.approved,
          arguments: entry.arguments,
        },
      });
    },
  };
}

/**
 * Runs left active by a server that stopped can never continue: mark them
 * (RN-12) and withdraw the approvals they were waiting for. Returns how many.
 */
export function interruptStaleRuns(db: Db, writeStep: StepWriter): number {
  const stale = db
    .select({ id: runs.id })
    .from(runs)
    .where(inArray(runs.status, ACTIVE_RUN_STATUSES))
    .all();
  for (const { id } of stale) {
    db.transaction((tx) => {
      tx.update(runs)
        .set({
          status: 'interrupted',
          endReason: 'server_restart',
          errorMessage: 'O servidor foi reiniciado durante a execução.',
          finishedAt: nowIso(),
        })
        .where(eq(runs.id, id))
        .run();
      tx.update(approvals)
        .set({ status: 'cancelled', decidedAt: nowIso() })
        .where(and(eq(approvals.runId, id), eq(approvals.status, 'pending')))
        .run();
      tx.update(toolCalls)
        .set({ status: 'cancelled', finishedAt: nowIso() })
        .where(
          and(
            eq(toolCalls.runId, id),
            inArray(toolCalls.status, ['pending', 'waiting_approval', 'running']),
          ),
        )
        .run();
    });
    writeStep(id, 'run_finished', { status: 'interrupted', endReason: 'server_restart' });
  }
  return stale.length;
}

export function findRun(db: Db, id: string): RunRow | undefined {
  return db.select().from(runs).where(eq(runs.id, id)).get();
}

export function findActiveRunOfConversation(db: Db, conversationId: string): RunRow | undefined {
  return db
    .select()
    .from(runs)
    .where(and(eq(runs.conversationId, conversationId), inArray(runs.status, ACTIVE_RUN_STATUSES)))
    .get();
}

function durationMs(run: Pick<RunRow, 'startedAt' | 'finishedAt'>): number | null {
  if (!run.startedAt || !run.finishedAt) return null;
  return Math.max(0, Date.parse(run.finishedAt) - Date.parse(run.startedAt));
}

function selectSummaries(db: Db, where: SQL | undefined, limit: number): RunSummary[] {
  return db
    .select({ run: runs, agentName: agents.name, agentDeletedAt: agents.deletedAt })
    .from(runs)
    .innerJoin(agents, eq(runs.agentId, agents.id))
    .where(where)
    .orderBy(desc(runs.id))
    .limit(limit)
    .all()
    .map(({ run, agentName, agentDeletedAt }) => ({
      id: run.id,
      agentId: run.agentId,
      agentName,
      agentDeleted: agentDeletedAt !== null,
      conversationId: run.conversationId,
      parentRunId: run.parentRunId,
      trigger: run.trigger,
      status: run.status,
      endReason: run.endReason,
      errorMessage: run.errorMessage,
      inputTokens: run.inputTokens,
      outputTokens: run.outputTokens,
      createdAt: run.createdAt,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      durationMs: durationMs(run),
    }));
}

export function getRunSummary(db: Db, id: string): RunSummary | undefined {
  return selectSummaries(db, eq(runs.id, id), 1)[0];
}

/** Newest first. */
export function listRunsOfConversation(db: Db, conversationId: string): RunSummary[] {
  return selectSummaries(db, eq(runs.conversationId, conversationId), 1000);
}

export function listRuns(db: Db, query: RunListQuery): RunList {
  const limit = query.limit ?? RUN_LIST_LIMITS.default;
  const conditions: SQL[] = [];
  if (query.agentId) conditions.push(eq(runs.agentId, query.agentId));
  if (query.status) conditions.push(eq(runs.status, query.status));
  if (query.from) conditions.push(gte(runs.createdAt, query.from));
  if (query.to) conditions.push(lte(runs.createdAt, query.to));
  if (query.before) conditions.push(lt(runs.id, query.before));

  // One extra row tells whether there is a next page.
  const rows = selectSummaries(db, and(...conditions), limit + 1);
  const page = rows.slice(0, limit);
  return {
    runs: page,
    nextBefore: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
  };
}

/** The run and the runs above it in the delegation chain, nearest first. */
export function ancestry(db: Db, runId: string): RunRow[] {
  const chain: RunRow[] = [];
  const seen = new Set<string>();
  let current = findRun(db, runId);
  while (current && !seen.has(current.id)) {
    chain.push(current);
    seen.add(current.id);
    current = current.parentRunId ? findRun(db, current.parentRunId) : undefined;
  }
  return chain;
}

/** The whole delegation tree a run belongs to, parents before their children (RF-62). */
export function runTree(db: Db, runId: string): RunTreeNode[] {
  const root = ancestry(db, runId).at(-1);
  const rootSummary = root && getRunSummary(db, root.id);
  if (!rootSummary) return [];

  const nodes: RunTreeNode[] = [];
  const visit = (run: RunSummary, depth: number) => {
    nodes.push({ run, depth });
    // Bounded on purpose: the depth limit keeps real trees far smaller.
    if (nodes.length >= 200) return;
    const children = selectSummaries(db, eq(runs.parentRunId, run.id), 200).reverse();
    for (const child of children) visit(child, depth + 1);
  };
  visit(rootSummary, 0);
  return nodes;
}

export function listSteps(db: Db, runId: string, afterSeq = 0): RunStep[] {
  return db
    .select({
      seq: runSteps.seq,
      type: runSteps.type,
      payload: runSteps.payload,
      createdAt: runSteps.createdAt,
    })
    .from(runSteps)
    .where(and(eq(runSteps.runId, runId), gt(runSteps.seq, afterSeq)))
    .orderBy(asc(runSteps.seq))
    .all()
    .map((step) => ({ ...step, payload: toRecord(step.payload) }));
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
