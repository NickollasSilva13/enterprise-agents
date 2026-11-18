import {
  TEMPLATE_EXPORT_FORMAT,
  TEMPLATE_EXPORT_VERSION,
  TEMPLATE_LIMITS,
  type TemplateContent,
  templateContentSchema,
  type TemplateExport,
  type TemplateFromArea,
  type TemplateImportResult,
  type TemplateRole,
  templateSummary,
  type TemplateUpdate,
  WORKFLOW_TEMPLATES,
  type WorkflowTemplate,
  type WorkflowTemplateSummary,
} from '@ea/shared';
import { ConflictError, NotFoundError, ValidationError } from '../../core/errors';
import type { Db } from '../../db/client';
import { newId } from '../../db/ids';
import type { ToolRegistry } from '../../tools/registry';
import { recordAudit } from '../audit/service';
import { agentsOfArea, findArea, stagesOf, transitionsOf } from './repository';
import {
  deleteTemplateRow,
  findSavedTemplate,
  grantedTools,
  insertTemplate,
  savedTemplates,
  type TemplateRow,
  updateTemplateRow,
} from './template-repository';

// The catalogue of workflow templates (Phase 18): the ready-made ones, in
// code and never changed, and the user's own, saved from an area (D3) or
// imported from a file (D4). What a template carries is decided by
// `templateContentSchema`: stages, transitions, roles and instructions,
// never keys, addresses, models, ids or permissions (D2).

const sameText = (a: string, b: string) =>
  a.trim().toLocaleLowerCase('pt-BR') === b.trim().toLocaleLowerCase('pt-BR');

/** A copy of what a template is made of, without its id and name. */
function contentOf(template: WorkflowTemplate): TemplateContent {
  return {
    description: template.description,
    practices: [...template.practices],
    roles: template.roles.map((role) => ({ ...role, tools: [...role.tools] })),
    stages: template.stages.map((stage) => ({ ...stage })),
    transitions: template.transitions.map((transition) => ({ ...transition })),
  };
}

/** A saved row, read back through the schema: what is stored is never trusted blindly. */
function fromRow(row: TemplateRow): WorkflowTemplate {
  const parsed = templateContentSchema.safeParse(row.content);
  if (!parsed.success) throw new ConflictError('broken_template', 'Este modelo está danificado.');
  return { id: row.id, name: row.name, ...parsed.data };
}

export function listTemplates(db: Db): WorkflowTemplateSummary[] {
  const saved = savedTemplates(db).flatMap((row) => {
    const parsed = templateContentSchema.safeParse(row.content);
    return parsed.success ? [{ id: row.id, name: row.name, ...parsed.data }] : [];
  });
  return [
    ...WORKFLOW_TEMPLATES.map((template) => templateSummary(template, 'builtin')),
    ...saved.map((template) => templateSummary(template, 'user')),
  ];
}

/** A ready-made template or one of the user's. */
export function findTemplate(db: Db, templateId: string): WorkflowTemplate {
  const builtin = WORKFLOW_TEMPLATES.find((entry) => entry.id === templateId);
  if (builtin) return builtin;
  const row = findSavedTemplate(db, templateId);
  if (!row) throw new NotFoundError('Modelo de fluxo não encontrado.');
  return fromRow(row);
}

function savedRow(db: Db, templateId: string): TemplateRow {
  if (WORKFLOW_TEMPLATES.some((entry) => entry.id === templateId)) {
    throw new ConflictError('builtin_template', 'Os modelos prontos não podem ser alterados.');
  }
  const row = findSavedTemplate(db, templateId);
  if (!row) throw new NotFoundError('Modelo de fluxo não encontrado.');
  return row;
}

function nameTaken(db: Db, name: string, exceptId?: string): boolean {
  return (
    WORKFLOW_TEMPLATES.some((entry) => sameText(entry.name, name)) ||
    savedTemplates(db).some((row) => row.id !== exceptId && sameText(row.name, name))
  );
}

function ensureRoom(db: Db): void {
  if (savedTemplates(db).length >= TEMPLATE_LIMITS.saved) {
    throw new ConflictError(
      'too_many_templates',
      `Você já tem ${TEMPLATE_LIMITS.saved} modelos salvos. Exclua algum antes.`,
    );
  }
}

/** The content, checked again: a broken area or file never becomes a template. */
function checked(content: TemplateContent): TemplateContent {
  const parsed = templateContentSchema.safeParse(content);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
      'Este fluxo não pode virar modelo.',
    );
  }
  return parsed.data;
}

/** "Produto (Site)" made from a template in the area Site goes back to "Produto". */
function roleName(agentName: string, areaName: string): string {
  const suffix = ` (${areaName})`;
  return agentName.endsWith(suffix) && agentName.length > suffix.length
    ? agentName.slice(0, -suffix.length)
    : agentName;
}

/**
 * Saves the workflow of an area as a template (D3). The agents that work its
 * stages become the roles, with their instructions, their area access and the
 * names of the tools they have (never the permission: applying makes every
 * one "ask"). Tools that only exist in tasks are not granted per agent, so
 * they never show up here.
 */
export function saveTemplateFromArea(
  db: Db,
  registry: ToolRegistry,
  input: TemplateFromArea,
): WorkflowTemplateSummary {
  const area = findArea(db, input.areaId);
  if (!area) throw new NotFoundError('Área não encontrada.');
  if (nameTaken(db, input.name)) {
    throw new ConflictError('name_taken', 'Já existe um modelo com esse nome.');
  }
  ensureRoom(db);

  const stages = stagesOf(db, area.id);
  const transitions = transitionsOf(db, area.id);
  const onStages = new Set(stages.flatMap((stage) => (stage.agentId ? [stage.agentId] : [])));
  const workers = agentsOfArea(db, area.id).filter((agent) => onStages.has(agent.id));
  const tools = grantedTools(
    db,
    workers.map((agent) => agent.id),
  );

  const roleKeyOf = new Map<string, string>();
  const roles: TemplateRole[] = [];
  for (const agent of workers) {
    const key = `papel-${roles.length + 1}`;
    roleKeyOf.set(agent.id, key);
    let name = roleName(agent.name, area.name);
    if (roles.some((role) => sameText(role.name, name))) name = agent.name;
    roles.push({
      key,
      name,
      objective: agent.objective,
      systemPrompt: agent.systemPrompt,
      tools: tools
        .filter((grant) => grant.agentId === agent.id)
        .map((grant) => grant.toolName)
        .filter((tool) => registry.get(tool) !== undefined),
      areaAccess: agent.areaAccess,
    });
  }
  const stageKeyOf = new Map(stages.map((stage, index) => [stage.id, `etapa-${index + 1}`]));
  const content = checked({
    description: (input.description ?? area.description).slice(0, TEMPLATE_LIMITS.description),
    practices: input.practices,
    roles,
    stages: stages.map((stage) => ({
      key: stageKeyOf.get(stage.id) ?? '',
      name: stage.name,
      kind: stage.kind,
      role: stage.agentId ? (roleKeyOf.get(stage.agentId) ?? null) : null,
    })),
    transitions: transitions.map((transition) => ({
      from: stageKeyOf.get(transition.fromStageId) ?? '',
      to: stageKeyOf.get(transition.toStageId) ?? '',
      actor: transition.actor,
    })),
  });

  const id = newId();
  insertTemplate(db, { id, name: input.name, content });
  recordAudit(db, {
    actor: 'user',
    action: 'workflow_template.created',
    target: id,
    details: { name: input.name, area: area.id, roles: roles.length },
  });
  return templateSummary({ id, name: input.name, ...content }, 'user');
}

export function updateTemplate(
  db: Db,
  templateId: string,
  patch: TemplateUpdate,
): WorkflowTemplateSummary {
  const row = savedRow(db, templateId);
  const current = fromRow(row);
  if (patch.name !== undefined && nameTaken(db, patch.name, row.id)) {
    throw new ConflictError('name_taken', 'Já existe um modelo com esse nome.');
  }
  const next: TemplateContent = {
    ...contentOf(current),
    ...(patch.description === undefined ? {} : { description: patch.description }),
    ...(patch.practices === undefined ? {} : { practices: patch.practices }),
  };
  const name = patch.name ?? row.name;
  updateTemplateRow(db, row.id, { name, content: next });
  recordAudit(db, {
    actor: 'user',
    action: 'workflow_template.updated',
    target: row.id,
    details: { fields: Object.keys(patch) },
  });
  return templateSummary({ id: row.id, name, ...next }, 'user');
}

/** Areas made from the template keep their copy: deleting it touches nothing else. */
export function deleteTemplate(db: Db, templateId: string): void {
  const row = savedRow(db, templateId);
  deleteTemplateRow(db, row.id);
  recordAudit(db, {
    actor: 'user',
    action: 'workflow_template.deleted',
    target: row.id,
    details: { name: row.name },
  });
}

export function exportTemplate(db: Db, templateId: string): TemplateExport {
  const template = findTemplate(db, templateId);
  const content = contentOf(template);
  return {
    format: TEMPLATE_EXPORT_FORMAT,
    version: TEMPLATE_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    template: {
      name: template.name,
      content: {
        description: content.description,
        practices: [...content.practices],
        roles: content.roles.map((role) => ({ ...role, tools: [...role.tools] })),
        stages: content.stages.map((stage) => ({ ...stage })),
        transitions: content.transitions.map((transition) => ({ ...transition })),
      },
    },
  };
}

/** "Nome (importado)", then "Nome (importado 2)", …, shortened to fit. */
function freeName(db: Db, wanted: string): string {
  if (!nameTaken(db, wanted)) return wanted;
  for (let n = 1; ; n += 1) {
    const suffix = n === 1 ? ' (importado)' : ` (importado ${n})`;
    const candidate = wanted.slice(0, TEMPLATE_LIMITS.name - suffix.length).trimEnd() + suffix;
    if (!nameTaken(db, candidate)) return candidate;
  }
}

/**
 * Adds the template of a file (D4). A file from someone else never hands out
 * more than the user can see before applying: tools this installation does
 * not have, tools of high risk and tools that only exist inside tasks are
 * left out, each with a warning; the rest are only suggestions, made "ask"
 * when the template is applied. Area access is kept: the area is created new
 * and empty, and the screen shows it before applying.
 */
export function importTemplate(
  db: Db,
  registry: ToolRegistry,
  document: TemplateExport,
): TemplateImportResult {
  ensureRoom(db);
  const warnings: string[] = [];
  const name = freeName(db, document.template.name);
  if (name !== document.template.name) {
    warnings.push(
      `Já existia um modelo chamado "${document.template.name}"; este entrou como "${name}".`,
    );
  }
  const roles = document.template.content.roles.map((role) => ({
    ...role,
    tools: [...new Set(role.tools)].filter((toolName) => {
      const tool = registry.get(toolName);
      if (!tool) {
        warnings.push(
          `A ferramenta "${toolName}" do papel "${role.name}" não existe nesta instalação e foi ignorada.`,
        );
        return false;
      }
      if (tool.scope === 'task') {
        warnings.push(
          `"${tool.title}" não é dada a agentes: só existe dentro das tarefas. Foi ignorada no papel "${role.name}".`,
        );
        return false;
      }
      if (tool.risk === 'high') {
        warnings.push(
          `"${tool.title}" é de risco alto e não vem de um arquivo: libere no agente do papel "${role.name}", se quiser.`,
        );
        return false;
      }
      return true;
    }),
  }));
  const content = checked({ ...document.template.content, roles });

  const id = newId();
  insertTemplate(db, { id, name, content });
  recordAudit(db, {
    actor: 'user',
    action: 'workflow_template.imported',
    target: id,
    details: { name, warnings: warnings.length },
  });
  return { template: templateSummary({ id, name, ...content }, 'user'), warnings };
}
