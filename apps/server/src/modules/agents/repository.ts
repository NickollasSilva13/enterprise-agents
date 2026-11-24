import {
  ACTIVE_RUN_STATUSES,
  type AgentState,
  type Appearance,
  appearanceSchema,
  type RunStatus,
} from '@ea/shared';
import { asc, eq, inArray, isNull, max, notInArray } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { agents, areaRoles, roleMembers, runs } from '../../db/schema';
import { deriveAgentState } from './agent-state';

export type AgentRow = typeof agents.$inferSelect;

export interface AgentWithState {
  readonly agent: AgentRow;
  readonly state: AgentState;
}

/** Non-deleted agents, by name, each with its display state. */
export function listAgentsWithState(db: Db): AgentWithState[] {
  const rows = db
    .select()
    .from(agents)
    .where(isNull(agents.deletedAt))
    .orderBy(asc(agents.name))
    .all();

  const activeByAgent = new Map<string, RunStatus[]>();
  const activeRuns = db
    .select({ agentId: runs.agentId, status: runs.status })
    .from(runs)
    .where(inArray(runs.status, ACTIVE_RUN_STATUSES))
    .all();
  for (const run of activeRuns) {
    const statuses = activeByAgent.get(run.agentId) ?? [];
    statuses.push(run.status);
    activeByAgent.set(run.agentId, statuses);
  }

  // Ids are ULIDs, so the greatest id is the most recent run. SQLite returns
  // the other selected columns from the row that holds that maximum.
  const lastFinished = db
    .select({ agentId: runs.agentId, status: runs.status, lastId: max(runs.id) })
    .from(runs)
    .where(notInArray(runs.status, ACTIVE_RUN_STATUSES))
    .groupBy(runs.agentId)
    .all();
  const lastFinishedByAgent = new Map(lastFinished.map((run) => [run.agentId, run.status]));

  return rows.map((agent) => ({
    agent,
    state: deriveAgentState({
      enabled: agent.enabled,
      activeRunStatuses: activeByAgent.get(agent.id) ?? [],
      lastFinishedStatus: lastFinishedByAgent.get(agent.id) ?? null,
    }),
  }));
}

/**
 * The appearance stored for an agent, if it is still a valid one. A column
 * that no longer matches the schema (an option removed in a later version)
 * reads as "none chosen", and the agent is drawn from its id.
 */
export const storedAppearance = (value: unknown): Appearance | null =>
  appearanceSchema.safeParse(value).data ?? null;

type Tx = Pick<Db, 'select' | 'insert' | 'update' | 'delete'>;

/** The role of every agent that has one, by agent id (Phase 39). */
export function rolesByAgent(db: Tx): Map<string, { id: string; name: string }> {
  return new Map(
    db
      .select({ agentId: roleMembers.agentId, id: areaRoles.id, name: areaRoles.name })
      .from(roleMembers)
      .innerJoin(areaRoles, eq(roleMembers.roleId, areaRoles.id))
      .all()
      .map((row) => [row.agentId, { id: row.id, name: row.name }] as const),
  );
}

export function findAreaRole(db: Tx, roleId: string) {
  return db.select().from(areaRoles).where(eq(areaRoles.id, roleId)).get();
}

/** The roles of an area, for import by name. */
export function areaRolesOf(db: Tx, areaId: string) {
  return db.select().from(areaRoles).where(eq(areaRoles.projectId, areaId)).all();
}

/** Gives the agent a role, or takes its role away with null. */
export function setAgentRole(db: Tx, agentId: string, roleId: string | null): void {
  db.delete(roleMembers).where(eq(roleMembers.agentId, agentId)).run();
  if (roleId !== null) db.insert(roleMembers).values({ agentId, roleId }).run();
}
