import {
  AGENT_EXPORT_FORMAT,
  AGENT_EXPORT_VERSION,
  AGENT_LIMITS,
  type AgentExport,
  type AgentImportResult,
  type ExportedAgent,
  type ToolPermission,
} from '@ea/shared';
import { eq, isNull } from 'drizzle-orm';
import { NotFoundError } from '../../core/errors';
import type { Db } from '../../db/client';
import { newId } from '../../db/ids';
import { agents, agentTools, models, projects, providers } from '../../db/schema';
import type { ToolRegistry } from '../../tools/registry';
import { maxPermission } from '../../tools/types';
import { recordAudit } from '../audit/service';
import { storedAppearance } from './repository';

// Export and import of agents as JSON (RF-20). A file names things instead
// of pointing at them: ids mean nothing in another installation. Nothing
// secret is ever written (RN-11): of a provider, only its name.

const sameText = (a: string, b: string) =>
  a.trim().toLocaleLowerCase('pt-BR') === b.trim().toLocaleLowerCase('pt-BR');

/** The agents with these ids, or every agent when `ids` is undefined. */
export function exportAgents(db: Db, ids: readonly string[] | undefined): AgentExport {
  const rows = db
    .select()
    .from(agents)
    .where(isNull(agents.deletedAt))
    .orderBy(agents.name)
    .all()
    .filter((agent) => ids === undefined || ids.includes(agent.id));
  if (ids !== undefined && rows.length !== new Set(ids).size) {
    throw new NotFoundError('Agente não encontrado.');
  }

  const projectNames = new Map(
    db
      .select()
      .from(projects)
      .all()
      .map((row) => [row.id, row.name]),
  );
  const modelsById = new Map(
    db
      .select({ id: models.id, name: models.name, provider: providers.name })
      .from(models)
      .innerJoin(providers, eq(models.providerId, providers.id))
      .all()
      .map((row) => [row.id, { name: row.name, provider: row.provider }]),
  );
  const grants = db.select().from(agentTools).all();

  return {
    format: AGENT_EXPORT_FORMAT,
    version: AGENT_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    agents: rows.map((agent) => ({
      name: agent.name,
      description: agent.description,
      objective: agent.objective,
      systemPrompt: agent.systemPrompt,
      temperature: agent.temperature,
      maxOutputTokens: agent.maxOutputTokens,
      maxSteps: agent.maxSteps,
      maxDurationSeconds: agent.maxDurationSeconds,
      maxTotalTokens: agent.maxTotalTokens,
      enabled: agent.enabled,
      appearance: storedAppearance(agent.appearance),
      areaAccess: agent.areaAccess,
      project: agent.projectId ? (projectNames.get(agent.projectId) ?? null) : null,
      model: agent.modelId ? (modelsById.get(agent.modelId) ?? null) : null,
      tools: grants
        .filter((grant) => grant.agentId === agent.id)
        .map(({ toolName, permission }) => ({ toolName, permission }))
        .sort((a, b) => a.toolName.localeCompare(b.toolName)),
    })),
  };
}

/** "Nome (importado)", then "Nome (importado 2)", …, shortened to fit the name limit. */
function freeName(wanted: string, taken: readonly string[]): string {
  if (!taken.some((name) => sameText(name, wanted))) return wanted;
  for (let n = 1; ; n += 1) {
    const suffix = n === 1 ? ' (importado)' : ` (importado ${n})`;
    const candidate = wanted.slice(0, AGENT_LIMITS.name - suffix.length).trimEnd() + suffix;
    if (!taken.some((name) => sameText(name, candidate))) return candidate;
  }
}

/**
 * Creates the agents of a file. Always adds, never replaces: a name already
 * in use gets a suffix. What the file names and this installation does not
 * have is not invented, except projects, which are plain labels:
 * - a model that is not here, or is disabled, leaves the agent without one;
 * - a tool that does not exist here is left out;
 * - no tool arrives able to act on its own: "allow" in the file becomes
 *   "ask", so a file from someone else cannot hand out permissions the user
 *   did not look at (SECURITY C-15, C-16).
 * Every difference is reported, per agent, in words for the user.
 */
export function importAgents(
  db: Db,
  registry: ToolRegistry,
  document: AgentExport,
): AgentImportResult {
  const imported: AgentImportResult['imported'] = [];

  db.transaction((tx) => {
    const taken = tx
      .select({ name: agents.name })
      .from(agents)
      .where(isNull(agents.deletedAt))
      .all()
      .map((row) => row.name);
    const knownProjects = tx.select().from(projects).all();
    const knownModels = tx
      .select({
        id: models.id,
        name: models.name,
        enabled: models.enabled,
        provider: providers.name,
      })
      .from(models)
      .innerJoin(providers, eq(models.providerId, providers.id))
      .all();

    const projectIdFor = (name: string): string => {
      const found = knownProjects.find((project) => sameText(project.name, name));
      if (found) return found.id;
      const created = { id: newId(), name: name.trim(), description: '' };
      tx.insert(projects).values(created).run();
      knownProjects.push({ ...created, createdAt: '', updatedAt: '' });
      return created.id;
    };

    for (const entry of document.agents) {
      const warnings: string[] = [];
      const name = freeName(entry.name, taken);
      taken.push(name);
      if (name !== entry.name) {
        warnings.push(`Já existia um agente chamado "${entry.name}"; este entrou como "${name}".`);
      }

      const { modelId, modelWarning } = resolveModel(entry, knownModels);
      if (modelWarning) warnings.push(modelWarning);
      const grants = resolveTools(entry, registry, warnings);
      // Like tools, access to the area's shared folder is never handed out by a
      // file: the user grants it after looking (SECURITY C-15).
      if (entry.areaAccess !== 'none') {
        warnings.push(
          `O acesso à pasta da área (${entry.areaAccess === 'write' ? 'leitura e escrita' : 'leitura'}) não foi trazido: libere na configuração do agente, se quiser.`,
        );
      }

      const id = newId();
      tx.insert(agents)
        .values({
          id,
          name,
          description: entry.description,
          objective: entry.objective,
          systemPrompt: entry.systemPrompt,
          projectId: entry.project === null ? null : projectIdFor(entry.project),
          modelId,
          temperature: entry.temperature,
          maxOutputTokens: entry.maxOutputTokens,
          maxSteps: entry.maxSteps,
          maxDurationSeconds: entry.maxDurationSeconds,
          maxTotalTokens: entry.maxTotalTokens,
          enabled: entry.enabled,
          appearance: entry.appearance,
        })
        .run();
      if (grants.length > 0) {
        tx.insert(agentTools)
          .values(grants.map((grant) => ({ agentId: id, ...grant })))
          .run();
      }
      imported.push({ id, name, nameInFile: entry.name, warnings });
    }
  });

  for (const agent of imported) {
    recordAudit(db, {
      actor: 'user',
      action: 'agent.imported',
      target: agent.id,
      agentId: agent.id,
      details: { name: agent.name, warnings: agent.warnings.length },
    });
  }
  return { imported };
}

function resolveModel(
  entry: ExportedAgent,
  known: readonly { id: string; name: string; enabled: boolean; provider: string }[],
): { modelId: string | null; modelWarning: string | null } {
  if (entry.model === null) return { modelId: null, modelWarning: null };
  const { name, provider } = entry.model;
  const found = known.find((model) => model.name === name && sameText(model.provider, provider));
  if (!found) {
    return {
      modelId: null,
      modelWarning: `O modelo "${name}" do provedor "${provider}" não existe nesta instalação; o agente ficou sem modelo.`,
    };
  }
  if (!found.enabled) {
    return {
      modelId: null,
      modelWarning: `O modelo "${name}" está desabilitado nesta instalação; o agente ficou sem modelo.`,
    };
  }
  return { modelId: found.id, modelWarning: null };
}

function resolveTools(
  entry: ExportedAgent,
  registry: ToolRegistry,
  warnings: string[],
): { toolName: string; permission: Exclude<ToolPermission, 'deny'> }[] {
  const grants = new Map<string, Exclude<ToolPermission, 'deny'>>();
  for (const grant of entry.tools) {
    const tool = registry.get(grant.toolName);
    if (!tool) {
      warnings.push(`A ferramenta "${grant.toolName}" não existe nesta instalação e foi ignorada.`);
      continue;
    }
    if (grant.permission === 'deny' || grants.has(tool.name)) continue;
    if (grant.permission === 'allow') {
      warnings.push(
        maxPermission(tool.risk) === 'allow'
          ? `"${tool.title}" estava permitida no arquivo e entrou como "pede aprovação". Libere-a na tela Ferramentas, se quiser.`
          : `"${tool.title}" é de risco alto e entrou como "pede aprovação".`,
      );
    }
    grants.set(tool.name, 'ask');
  }
  return [...grants].map(([toolName, permission]) => ({ toolName, permission }));
}
