import {
  ACTIVE_RUN_STATUSES,
  type ActivityItem,
  type DashboardAlert,
  type DashboardSummary,
  type RecentRun,
  RUN_STATUSES,
} from '@ea/shared';
import { and, count, desc, eq, gte, inArray, isNull, max, notInArray, sql, sum } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { agents, approvals, providers, runs, runSteps } from '../../db/schema';
import { listAgentsWithState } from '../agents/repository';

const RECENT_RUNS_LIMIT = 10;
const ACTIVITY_LIMIT = 15;
const UNREACHABLE_REASONS = ['provider_unreachable', 'provider_timeout'];
const DAY_MS = 24 * 60 * 60 * 1000;

const durationMs = sql<
  number | null
>`(julianday(${runs.finishedAt}) - julianday(${runs.startedAt})) * 86400000`;

function recentRuns(db: Db): RecentRun[] {
  return db
    .select({
      id: runs.id,
      agentId: runs.agentId,
      agentName: agents.name,
      status: runs.status,
      trigger: runs.trigger,
      createdAt: runs.createdAt,
      durationMs,
    })
    .from(runs)
    .innerJoin(agents, eq(runs.agentId, agents.id))
    .orderBy(desc(runs.id))
    .limit(RECENT_RUNS_LIMIT)
    .all()
    .map((run) => ({
      ...run,
      durationMs: run.durationMs === null ? null : Math.max(0, Math.round(run.durationMs)),
    }));
}

/** What agents started and finished lately, newest first (RF-04). */
function recentActivity(db: Db): ActivityItem[] {
  return db
    .select({
      runId: runSteps.runId,
      seq: runSteps.seq,
      type: runSteps.type,
      payload: runSteps.payload,
      at: runSteps.createdAt,
      agentId: runs.agentId,
      agentName: agents.name,
    })
    .from(runSteps)
    .innerJoin(runs, eq(runSteps.runId, runs.id))
    .innerJoin(agents, eq(runs.agentId, agents.id))
    .where(inArray(runSteps.type, ['run_started', 'run_finished']))
    .orderBy(desc(runSteps.id))
    .limit(ACTIVITY_LIMIT)
    .all()
    .map((step) => {
      const status = (step.payload as { status?: unknown } | null)?.status;
      const known = RUN_STATUSES.find((candidate) => candidate === status) ?? null;
      return {
        id: `${step.runId}:${step.seq}`,
        runId: step.runId,
        agentId: step.agentId,
        agentName: step.agentName,
        kind: step.type === 'run_started' ? ('started' as const) : ('finished' as const),
        status: step.type === 'run_finished' ? known : null,
        at: step.at,
      };
    });
}

/** Live agents whose most recent finished run could not reach its provider (RF-06). */
function agentsWithUnreachableProvider(db: Db): number {
  // Ids are ULIDs: the greatest id per agent is its latest finished run, and
  // SQLite returns the other columns from that same row.
  return db
    .select({ endReason: runs.endReason, lastId: max(runs.id) })
    .from(runs)
    .innerJoin(agents, eq(runs.agentId, agents.id))
    .where(and(notInArray(runs.status, ACTIVE_RUN_STATUSES), isNull(agents.deletedAt)))
    .groupBy(runs.agentId)
    .all()
    .filter((row) => row.endReason !== null && UNREACHABLE_REASONS.includes(row.endReason)).length;
}

function last24h(db: Db, now: Date): DashboardSummary['runs']['last24h'] {
  const since = new Date(now.getTime() - DAY_MS).toISOString();
  const row = db
    .select({
      finished: count(),
      completed: sql<number>`coalesce(sum(${runs.status} = 'completed'), 0)`,
      failed: sql<number>`coalesce(sum(${runs.status} in ('failed', 'timed_out')), 0)`,
      averageDurationMs: sql<number | null>`avg(${durationMs})`,
      inputTokens: sum(runs.inputTokens).mapWith(Number),
      outputTokens: sum(runs.outputTokens).mapWith(Number),
    })
    .from(runs)
    .where(and(notInArray(runs.status, ACTIVE_RUN_STATUSES), gte(runs.createdAt, since)))
    .get();

  const finished = row?.finished ?? 0;
  const completed = row?.completed ?? 0;
  const average = row?.averageDurationMs ?? null;
  return {
    finished,
    completed,
    failed: row?.failed ?? 0,
    successRate: finished === 0 ? null : completed / finished,
    averageDurationMs: average === null ? null : Math.max(0, Math.round(average)),
    inputTokens: row?.inputTokens ?? 0,
    outputTokens: row?.outputTokens ?? 0,
  };
}

function countActiveRuns(db: Db) {
  const rows = db
    .select({ status: runs.status, total: count() })
    .from(runs)
    .where(inArray(runs.status, ACTIVE_RUN_STATUSES))
    .groupBy(runs.status)
    .all();
  const waitingApproval = rows.find((row) => row.status === 'waiting_approval')?.total ?? 0;
  const active = rows.reduce((total, row) => total + row.total, 0);
  return { active, waitingApproval };
}

/** Everything the dashboard and the status strip need, in one read. */
export function getDashboardSummary(db: Db, now = new Date()): DashboardSummary {
  const agentList = listAgentsWithState(db);
  const byState = (state: string) => agentList.filter((entry) => entry.state === state).length;

  const agentCounts = {
    total: agentList.length,
    active: agentList.filter((entry) => entry.agent.enabled).length,
    inactive: byState('inactive'),
    failed: byState('failed'),
    working: byState('working'),
    waiting: byState('waiting'),
  };

  const pendingApprovals =
    db.select({ total: count() }).from(approvals).where(eq(approvals.status, 'pending')).get()
      ?.total ?? 0;
  const providerCount = db.select({ total: count() }).from(providers).get()?.total ?? 0;
  const withoutModel = agentList.filter(
    (entry) => entry.agent.enabled && entry.agent.modelId === null,
  ).length;

  const alerts: DashboardAlert[] = [];
  if (agentCounts.failed > 0) {
    alerts.push({ kind: 'failed_agents', severity: 'error', count: agentCounts.failed });
  }
  const unreachable = agentsWithUnreachableProvider(db);
  if (unreachable > 0) {
    alerts.push({ kind: 'provider_unreachable', severity: 'error', count: unreachable });
  }
  if (pendingApprovals > 0) {
    alerts.push({ kind: 'pending_approvals', severity: 'warning', count: pendingApprovals });
  }
  if (withoutModel > 0) {
    alerts.push({ kind: 'agents_without_model', severity: 'warning', count: withoutModel });
  }
  if (providerCount === 0) {
    alerts.push({ kind: 'no_provider', severity: 'info', count: 0 });
  }

  return {
    agents: agentCounts,
    runs: { ...countActiveRuns(db), last24h: last24h(db, now) },
    pendingApprovals,
    providers: providerCount,
    recentRuns: recentRuns(db),
    activity: recentActivity(db),
    alerts,
    generatedAt: now.toISOString(),
  };
}
