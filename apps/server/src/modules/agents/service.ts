import {
  ACTIVE_RUN_STATUSES,
  AGENT_LIMITS,
  type Agent,
  type AgentCreate,
  type AgentUpdate,
} from '@ea/shared';
import { and, count, eq, inArray, isNull } from 'drizzle-orm';
import { ConflictError, NotFoundError, ValidationError } from '../../core/errors';
import type { Db } from '../../db/client';
import { newId } from '../../db/ids';
import { agents, agentTools, models, projects, runs } from '../../db/schema';
import {
  findAreaRole,
  listAgentsWithState,
  rolesByAgent,
  setAgentRole,
  storedAppearance,
} from './repository';

const sameName = (a: string, b: string) =>
  a.toLocaleLowerCase('pt-BR') === b.toLocaleLowerCase('pt-BR');

const fieldError = (path: string, message: string) => new ValidationError([{ path, message }]);

function activeAgentNames(db: Db, exceptId?: string): string[] {
  return db
    .select({ id: agents.id, name: agents.name })
    .from(agents)
    .where(isNull(agents.deletedAt))
    .all()
    .filter((agent) => agent.id !== exceptId)
    .map((agent) => agent.name);
}

function assertNameIsFree(db: Db, name: string, exceptId?: string): void {
  if (activeAgentNames(db, exceptId).some((taken) => sameName(taken, name))) {
    throw new ConflictError('name_taken', 'Já existe um agente com esse nome.');
  }
}

/** A referenced project must exist; a referenced model must exist and be enabled. */
function assertReferences(db: Db, input: { projectId?: string | null; modelId?: string | null }) {
  if (input.projectId) {
    const found = db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, input.projectId))
      .get();
    if (!found) throw fieldError('projectId', 'Projeto não encontrado.');
  }
  if (input.modelId) {
    const model = db
      .select({ enabled: models.enabled })
      .from(models)
      .where(eq(models.id, input.modelId))
      .get();
    if (!model) throw fieldError('modelId', 'Modelo não encontrado.');
    if (!model.enabled) throw fieldError('modelId', 'Este modelo está desabilitado.');
  }
}

/**
 * A role must be one of the roles of the agent's area (Phase 39): an agent
 * without an area has no role.
 */
function assertRole(db: Db, roleId: string | null, projectId: string | null): void {
  if (roleId === null) return;
  const role = findAreaRole(db, roleId);
  if (!role) throw fieldError('roleId', 'Papel não encontrado.');
  if (role.projectId !== projectId) {
    throw fieldError('roleId', 'O papel precisa ser da equipe (área) do agente.');
  }
}

export function listAgents(db: Db): Agent[] {
  const projectNames = new Map(
    db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .all()
      .map((row) => [row.id, row.name]),
  );
  const modelNames = new Map(
    db
      .select({ id: models.id, name: models.displayName })
      .from(models)
      .all()
      .map((row) => [row.id, row.name]),
  );

  const roles = rolesByAgent(db);

  return listAgentsWithState(db).map(({ agent, state }) => ({
    id: agent.id,
    name: agent.name,
    description: agent.description,
    objective: agent.objective,
    systemPrompt: agent.systemPrompt,
    projectId: agent.projectId,
    projectName: agent.projectId ? (projectNames.get(agent.projectId) ?? null) : null,
    modelId: agent.modelId,
    modelName: agent.modelId ? (modelNames.get(agent.modelId) ?? null) : null,
    temperature: agent.temperature,
    maxOutputTokens: agent.maxOutputTokens,
    maxSteps: agent.maxSteps,
    maxDurationSeconds: agent.maxDurationSeconds,
    maxTotalTokens: agent.maxTotalTokens,
    enabled: agent.enabled,
    appearance: storedAppearance(agent.appearance),
    areaAccess: agent.areaAccess,
    roleId: roles.get(agent.id)?.id ?? null,
    roleName: roles.get(agent.id)?.name ?? null,
    state,
    createdAt: agent.createdAt,
    updatedAt: agent.updatedAt,
  }));
}

/** Deleted agents are not found: for the API they no longer exist (RN-07). */
export function getAgent(db: Db, id: string): Agent {
  const agent = listAgents(db).find((entry) => entry.id === id);
  if (!agent) throw new NotFoundError('Agente não encontrado.');
  return agent;
}

export function createAgent(db: Db, input: AgentCreate): Agent {
  assertNameIsFree(db, input.name);
  assertReferences(db, input);
  const { roleId, ...fields } = input;
  assertRole(db, roleId, fields.projectId);
  const id = newId();
  db.transaction((tx) => {
    tx.insert(agents)
      .values({ id, ...fields })
      .run();
    setAgentRole(tx, id, roleId);
  });
  return getAgent(db, id);
}

export function updateAgent(db: Db, id: string, patch: AgentUpdate): Agent {
  const current = getAgent(db, id);
  if (patch.name !== undefined) assertNameIsFree(db, patch.name, id);
  assertReferences(db, patch);
  const { roleId, ...fields } = patch;
  const projectId = fields.projectId === undefined ? current.projectId : fields.projectId;
  // Moving to another area leaves the role behind unless a new one comes along.
  const role =
    roleId !== undefined ? roleId : projectId === current.projectId ? current.roleId : null;
  assertRole(db, role, projectId);
  // A new look is not a change of work: it must not reset how long the agent
  // has been idle, which is counted from `updatedAt` (RF-80).
  const keys = Object.keys(patch);
  const lookOnly = keys.length > 0 && keys.every((key) => key === 'appearance');
  db.transaction((tx) => {
    if (Object.keys(fields).length > 0) {
      tx.update(agents)
        .set(lookOnly ? fields : { ...fields, updatedAt: new Date().toISOString() })
        .where(eq(agents.id, id))
        .run();
    }
    if (role !== current.roleId) setAgentRole(tx, id, role);
  });
  return getAgent(db, id);
}

/** "Nome (cópia)", then "Nome (cópia 2)", …, shortened to fit the name limit. */
export function copyName(original: string, taken: readonly string[]): string {
  for (let n = 1; ; n += 1) {
    const suffix = n === 1 ? ' (cópia)' : ` (cópia ${n})`;
    const candidate = original.slice(0, AGENT_LIMITS.name - suffix.length).trimEnd() + suffix;
    if (!taken.some((name) => sameName(name, candidate))) return candidate;
  }
}

/** Copies the configuration and the granted tools; history is not copied. */
export function duplicateAgent(db: Db, id: string): Agent {
  const source = getAgent(db, id);
  const copyId = newId();
  db.transaction((tx) => {
    tx.insert(agents)
      .values({
        id: copyId,
        name: copyName(source.name, activeAgentNames(db)),
        description: source.description,
        objective: source.objective,
        systemPrompt: source.systemPrompt,
        projectId: source.projectId,
        modelId: source.modelId,
        temperature: source.temperature,
        maxOutputTokens: source.maxOutputTokens,
        maxSteps: source.maxSteps,
        maxDurationSeconds: source.maxDurationSeconds,
        maxTotalTokens: source.maxTotalTokens,
        enabled: source.enabled,
        appearance: source.appearance,
        areaAccess: source.areaAccess,
      })
      .run();
    // A copy works the same stages: another agent in the same role (Phase 39).
    setAgentRole(tx, copyId, source.roleId);
    const tools = tx.select().from(agentTools).where(eq(agentTools.agentId, id)).all();
    if (tools.length > 0) {
      tx.insert(agentTools)
        .values(tools.map((tool) => ({ ...tool, agentId: copyId })))
        .run();
    }
  });
  return getAgent(db, copyId);
}

/**
 * Soft delete: the row stays so run history keeps its agent (RN-07), but the
 * agent disappears from every listing and can no longer run.
 */
export function deleteAgent(db: Db, id: string): void {
  getAgent(db, id);
  const active =
    db
      .select({ total: count() })
      .from(runs)
      .where(and(eq(runs.agentId, id), inArray(runs.status, ACTIVE_RUN_STATUSES)))
      .get()?.total ?? 0;
  if (active > 0) {
    throw new ConflictError(
      'agent_has_active_run',
      'Este agente tem uma execução em andamento. Interrompa a execução antes de excluir.',
    );
  }
  const now = new Date().toISOString();
  db.update(agents)
    // The model link is dropped: a deleted agent must not keep a provider in use (RN-08).
    .set({ deletedAt: now, updatedAt: now, enabled: false, modelId: null })
    .where(eq(agents.id, id))
    .run();
}
