import type { AgentTools, AgentToolsUpdate, ToolGrant, ToolInfo, ToolPermission } from '@ea/shared';
import { and, eq, isNull } from 'drizzle-orm';
import { join } from 'node:path';
import { ConflictError, NotFoundError, ValidationError } from '../../core/errors';
import type { Db } from '../../db/client';
import { agents, agentTools, models, settings } from '../../db/schema';
import type { ToolRegistry } from '../../tools/registry';
import { maxPermission, type ToolDefinition } from '../../tools/types';
import { recordAudit } from '../audit/service';

export interface ToolsDeps {
  readonly db: Db;
  readonly registry: ToolRegistry;
  readonly workspacesDir: string;
}

const ENABLED_TOOLS_KEY = 'tools.enabled';

/** An agent's own folder. Agent ids are generated here, never typed by anyone. */
export function workspaceDirOf(workspacesDir: string, agentId: string): string {
  return join(workspacesDir, agentId);
}

/** Off-by-default tools the user has switched on for the installation (C-20). */
export function enabledToolNames(db: Db): Set<string> {
  const row = db.select().from(settings).where(eq(settings.key, ENABLED_TOOLS_KEY)).get();
  const value: unknown = row?.value;
  return new Set(
    Array.isArray(value) ? value.filter((name): name is string => typeof name === 'string') : [],
  );
}

function toInfo(tool: ToolDefinition, enabled: ReadonlySet<string>): ToolInfo {
  const offByDefault = tool.offByDefault === true;
  return {
    name: tool.name,
    title: tool.title,
    summary: tool.summary,
    risk: tool.risk,
    maxPermission: maxPermission(tool.risk),
    offByDefault,
    enabled: !offByDefault || enabled.has(tool.name),
  };
}

/** Tools granted per agent. Task-board tools are not: they exist only in task runs. */
function grantableTools(registry: ToolRegistry): ToolDefinition[] {
  return registry.list().filter((tool) => tool.scope !== 'task');
}

export function listTools(deps: ToolsDeps): ToolInfo[] {
  const enabled = enabledToolNames(deps.db);
  return grantableTools(deps.registry).map((tool) => toInfo(tool, enabled));
}

/** Switches an off-by-default tool on or off for the whole installation. */
export function setToolEnabled(deps: ToolsDeps, name: string, enabled: boolean): ToolInfo {
  const tool = deps.registry.get(name);
  if (!tool) throw new NotFoundError('Ferramenta não encontrada.');
  if (!tool.offByDefault) {
    throw new ConflictError(
      'tool_always_available',
      'Esta ferramenta não pode ser desligada. Para impedir o uso, bloqueie-a em cada agente.',
    );
  }
  const names = enabledToolNames(deps.db);
  if (names.has(name) !== enabled) {
    if (enabled) names.add(name);
    else names.delete(name);
    const value = [...names].sort();
    const updatedAt = new Date().toISOString();
    deps.db
      .insert(settings)
      .values({ key: ENABLED_TOOLS_KEY, value, updatedAt })
      .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt } })
      .run();
    recordAudit(deps.db, {
      actor: 'user',
      action: enabled ? 'tool.enabled' : 'tool.disabled',
      target: name,
    });
  }
  return toInfo(tool, names);
}

/** What the agent was granted. Anything absent is blocked (RN-03). */
export function grantsOf(db: Db, agentId: string): Map<string, ToolPermission> {
  const rows = db.select().from(agentTools).where(eq(agentTools.agentId, agentId)).all();
  return new Map(rows.map((row) => [row.toolName, row.permission]));
}

function findAgent(db: Db, agentId: string) {
  const agent = db
    .select()
    .from(agents)
    .where(and(eq(agents.id, agentId), isNull(agents.deletedAt)))
    .get();
  if (!agent) throw new NotFoundError('Agente não encontrado.');
  return agent;
}

export function getAgentTools(deps: ToolsDeps, agentId: string): AgentTools {
  const agent = findAgent(deps.db, agentId);
  const model = agent.modelId
    ? deps.db
        .select({ supportsTools: models.supportsTools })
        .from(models)
        .where(eq(models.id, agent.modelId))
        .get()
    : undefined;
  const known = new Set(grantableTools(deps.registry).map((tool) => tool.name));
  const grants: ToolGrant[] = [...grantsOf(deps.db, agentId)]
    .filter(([toolName]) => known.has(toolName))
    .map(([toolName, permission]) => ({ toolName, permission }))
    .sort((a, b) => a.toolName.localeCompare(b.toolName));
  return {
    agentId,
    workspacePath: workspaceDirOf(deps.workspacesDir, agentId),
    modelSupportsTools: model ? model.supportsTools : null,
    grants,
  };
}

/** Replaces the agent's permissions. A tool left out becomes blocked. */
export function setAgentTools(
  deps: ToolsDeps,
  agentId: string,
  update: AgentToolsUpdate,
): AgentTools {
  findAgent(deps.db, agentId);
  const wanted = new Map<string, ToolPermission>();
  const problems: { path: string; message: string }[] = [];
  update.grants.forEach((grant, index) => {
    const tool = deps.registry.get(grant.toolName);
    if (!tool) {
      problems.push({ path: `grants.${index}.toolName`, message: 'Ferramenta desconhecida.' });
    } else if (tool.scope === 'task') {
      problems.push({
        path: `grants.${index}.toolName`,
        message: `"${tool.title}" faz parte do quadro de tarefas e não é liberada por agente.`,
      });
    } else if (wanted.has(grant.toolName)) {
      problems.push({ path: `grants.${index}.toolName`, message: 'Ferramenta repetida.' });
    } else if (grant.permission === 'allow' && maxPermission(tool.risk) !== 'allow') {
      problems.push({
        path: `grants.${index}.permission`,
        message: `"${tool.title}" é de risco alto: só pode ser bloqueada ou exigir aprovação.`,
      });
    } else {
      wanted.set(grant.toolName, grant.permission);
    }
  });
  if (problems.length > 0) throw new ValidationError(problems);

  const before = grantsOf(deps.db, agentId);
  deps.db.transaction((tx) => {
    tx.delete(agentTools).where(eq(agentTools.agentId, agentId)).run();
    // "deny" is the absence of a grant: nothing is stored for it.
    const rows = [...wanted]
      .filter(([, permission]) => permission !== 'deny')
      .map(([toolName, permission]) => ({ agentId, toolName, permission }));
    if (rows.length > 0) tx.insert(agentTools).values(rows).run();
  });

  const changes: Record<string, { from: ToolPermission; to: ToolPermission }> = {};
  for (const tool of grantableTools(deps.registry)) {
    const from = before.get(tool.name) ?? 'deny';
    const to = wanted.get(tool.name) ?? 'deny';
    if (from !== to) changes[tool.name] = { from, to };
  }
  if (Object.keys(changes).length > 0) {
    recordAudit(deps.db, {
      actor: 'user',
      action: 'agent.tools_changed',
      target: agentId,
      agentId,
      details: { changes },
    });
  }
  return getAgentTools(deps, agentId);
}
