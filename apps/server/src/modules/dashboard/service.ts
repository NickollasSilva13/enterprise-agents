import {
  ACTIVE_RUN_STATUSES,
  type DashboardAlert,
  type DashboardSummary,
  type RecentRun,
} from '@ea/shared';
import { and, count, desc, eq, gte, inArray, notInArray, sql, sum } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { agents, approvals, providers, runs } from '../../db/schema';
import { listAgentsWithState } from '../agents/repository';

const RECENT_RUNS_LIMIT = 10;
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
    alerts,
    generatedAt: now.toISOString(),
  };
}
