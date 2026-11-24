import { z } from 'zod';
import { agentStateSchema } from './api';
import { appearanceSchema } from './appearance';
import { AREA_ACCESS, TOOL_PERMISSIONS } from './enums';

const id = z.string().min(1).max(40);
const count = z.number().int().nonnegative();

// ---- Projects -------------------------------------------------------------

export const PROJECT_LIMITS = { name: 60, description: 300 } as const;

const projectName = z
  .string()
  .trim()
  .min(1, 'Informe o nome do projeto.')
  .max(PROJECT_LIMITS.name, `O nome pode ter até ${PROJECT_LIMITS.name} caracteres.`);
const projectDescription = z
  .string()
  .trim()
  .max(
    PROJECT_LIMITS.description,
    `A descrição pode ter até ${PROJECT_LIMITS.description} caracteres.`,
  );

export const projectCreateSchema = z.strictObject({
  name: projectName,
  description: projectDescription.default(''),
});
export type ProjectCreate = z.infer<typeof projectCreateSchema>;

export const projectUpdateSchema = z.strictObject({
  name: projectName.optional(),
  description: projectDescription.optional(),
});
export type ProjectUpdate = z.infer<typeof projectUpdateSchema>;

export const projectSchema = z.object({
  id,
  name: z.string(),
  description: z.string(),
  /** Agents in the project, not counting deleted ones. */
  agentCount: count,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Project = z.infer<typeof projectSchema>;

export const projectListSchema = z.object({ projects: z.array(projectSchema) });

// ---- Agents ---------------------------------------------------------------

export const AGENT_LIMITS = {
  name: 80,
  description: 500,
  objective: 2000,
  systemPrompt: 50_000,
  temperature: { min: 0, max: 2 },
  maxOutputTokens: { min: 1, max: 100_000 },
  maxSteps: { min: 1, max: 200 },
  maxDurationSeconds: { min: 5, max: 3600 },
  maxTotalTokens: { min: 1, max: 10_000_000 },
} as const;

export const AGENT_DEFAULTS = {
  description: '',
  objective: '',
  systemPrompt: '',
  projectId: null,
  modelId: null,
  temperature: 0.7,
  maxOutputTokens: 4096,
  maxSteps: 20,
  maxDurationSeconds: 300,
  maxTotalTokens: null,
  enabled: true,
  appearance: null,
  areaAccess: 'none',
  roleId: null,
} as const;

const between = (label: string, range: { min: number; max: number }) =>
  z
    .number(`${label}: informe um número.`)
    .min(range.min, `${label}: o mínimo é ${range.min}.`)
    .max(range.max, `${label}: o máximo é ${range.max}.`);

const wholeBetween = (label: string, range: { min: number; max: number }) =>
  between(label, range).int(`${label}: use um número inteiro.`);

const text = (label: string, max: number) =>
  z.string().max(max, `${label}: o máximo é de ${max} caracteres.`);

const agentFields = {
  name: z
    .string()
    .trim()
    .min(1, 'Informe o nome do agente.')
    .max(AGENT_LIMITS.name, `O nome pode ter até ${AGENT_LIMITS.name} caracteres.`),
  description: text('Descrição', AGENT_LIMITS.description).trim(),
  objective: text('Objetivo', AGENT_LIMITS.objective).trim(),
  systemPrompt: text('Instruções', AGENT_LIMITS.systemPrompt),
  projectId: id.nullable(),
  modelId: id.nullable(),
  temperature: between('Temperatura', AGENT_LIMITS.temperature),
  maxOutputTokens: wholeBetween('Tokens por resposta', AGENT_LIMITS.maxOutputTokens),
  maxSteps: wholeBetween('Passos por execução', AGENT_LIMITS.maxSteps),
  maxDurationSeconds: wholeBetween('Tempo por execução', AGENT_LIMITS.maxDurationSeconds),
  maxTotalTokens: wholeBetween('Tokens por execução', AGENT_LIMITS.maxTotalTokens).nullable(),
  enabled: z.boolean(),
  /** Null: the look drawn from the agent's id. */
  appearance: appearanceSchema.nullable(),
  /** What the agent may do in its area's shared folder (Phase 16). */
  areaAccess: z.enum(AREA_ACCESS),
  /** Its role in the area (team), which says which stages it works (Phase 39). */
  roleId: id.nullable(),
};

export const agentCreateSchema = z.strictObject({
  name: agentFields.name,
  description: agentFields.description.default(AGENT_DEFAULTS.description),
  objective: agentFields.objective.default(AGENT_DEFAULTS.objective),
  systemPrompt: agentFields.systemPrompt.default(AGENT_DEFAULTS.systemPrompt),
  projectId: agentFields.projectId.default(AGENT_DEFAULTS.projectId),
  modelId: agentFields.modelId.default(AGENT_DEFAULTS.modelId),
  temperature: agentFields.temperature.default(AGENT_DEFAULTS.temperature),
  maxOutputTokens: agentFields.maxOutputTokens.default(AGENT_DEFAULTS.maxOutputTokens),
  maxSteps: agentFields.maxSteps.default(AGENT_DEFAULTS.maxSteps),
  maxDurationSeconds: agentFields.maxDurationSeconds.default(AGENT_DEFAULTS.maxDurationSeconds),
  maxTotalTokens: agentFields.maxTotalTokens.default(AGENT_DEFAULTS.maxTotalTokens),
  enabled: agentFields.enabled.default(AGENT_DEFAULTS.enabled),
  appearance: agentFields.appearance.default(AGENT_DEFAULTS.appearance),
  areaAccess: agentFields.areaAccess.default(AGENT_DEFAULTS.areaAccess),
  roleId: agentFields.roleId.default(AGENT_DEFAULTS.roleId),
});
export type AgentCreate = z.infer<typeof agentCreateSchema>;
/** What a client may send: everything but the name is optional. */
export type AgentCreateInput = z.input<typeof agentCreateSchema>;

export const agentUpdateSchema = z.strictObject(agentFields).partial();
export type AgentUpdate = z.infer<typeof agentUpdateSchema>;

export const agentSchema = z.object({
  id,
  name: z.string(),
  description: z.string(),
  objective: z.string(),
  systemPrompt: z.string(),
  projectId: id.nullable(),
  projectName: z.string().nullable(),
  modelId: id.nullable(),
  modelName: z.string().nullable(),
  temperature: z.number(),
  maxOutputTokens: z.number().int(),
  maxSteps: z.number().int(),
  maxDurationSeconds: z.number().int(),
  maxTotalTokens: z.number().int().nullable(),
  enabled: z.boolean(),
  appearance: appearanceSchema.nullable(),
  areaAccess: z.enum(AREA_ACCESS),
  roleId: id.nullable(),
  roleName: z.string().nullable(),
  state: agentStateSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Agent = z.infer<typeof agentSchema>;

export const agentListSchema = z.object({ agents: z.array(agentSchema) });

// ---- Models (read-only until Phase 6) -------------------------------------

export const modelOptionSchema = z.object({
  id,
  name: z.string(),
  displayName: z.string(),
  providerName: z.string(),
  /** True when using this model sends data outside this machine. */
  isExternal: z.boolean(),
  supportsTools: z.boolean(),
});
export type ModelOption = z.infer<typeof modelOptionSchema>;

export const modelListSchema = z.object({ models: z.array(modelOptionSchema) });

// ---- Export and import (RF-20) --------------------------------------------

export const AGENT_EXPORT_FORMAT = 'enterprise-agents/agents';
export const AGENT_EXPORT_VERSION = 1;
export const AGENT_IMPORT_LIMITS = { agents: 100, tools: 50, ids: 200 } as const;

/**
 * An agent as written to a file. It carries no ids, no history and nothing
 * secret: the project and the model go by name, and of the provider only the
 * name is kept, never its address or key (RN-11).
 */
export const exportedAgentSchema = z.strictObject({
  name: agentFields.name,
  description: agentFields.description.default(AGENT_DEFAULTS.description),
  objective: agentFields.objective.default(AGENT_DEFAULTS.objective),
  systemPrompt: agentFields.systemPrompt.default(AGENT_DEFAULTS.systemPrompt),
  temperature: agentFields.temperature.default(AGENT_DEFAULTS.temperature),
  maxOutputTokens: agentFields.maxOutputTokens.default(AGENT_DEFAULTS.maxOutputTokens),
  maxSteps: agentFields.maxSteps.default(AGENT_DEFAULTS.maxSteps),
  maxDurationSeconds: agentFields.maxDurationSeconds.default(AGENT_DEFAULTS.maxDurationSeconds),
  maxTotalTokens: agentFields.maxTotalTokens.default(AGENT_DEFAULTS.maxTotalTokens),
  enabled: agentFields.enabled.default(AGENT_DEFAULTS.enabled),
  appearance: agentFields.appearance.default(AGENT_DEFAULTS.appearance),
  areaAccess: agentFields.areaAccess.default(AGENT_DEFAULTS.areaAccess),
  /** Name of the project, or null for none. */
  project: z.string().trim().min(1).max(PROJECT_LIMITS.name).nullable().default(null),
  /** Name of its role in that project (Phase 39), or null for none. */
  role: z.string().trim().min(1).max(40).nullable().default(null),
  model: z
    .strictObject({
      name: z.string().min(1).max(200),
      provider: z.string().min(1).max(200),
    })
    .nullable()
    .default(null),
  tools: z
    .array(
      z.strictObject({
        toolName: z.string().min(1).max(41),
        permission: z.enum(TOOL_PERMISSIONS),
      }),
    )
    .max(AGENT_IMPORT_LIMITS.tools)
    .default([]),
});
export type ExportedAgent = z.infer<typeof exportedAgentSchema>;

export const agentExportSchema = z.strictObject({
  format: z.literal(AGENT_EXPORT_FORMAT, 'Este não é um arquivo de agentes do Enterprise Agents.'),
  version: z.literal(
    AGENT_EXPORT_VERSION,
    'Este arquivo é de uma versão que esta instalação não sabe ler.',
  ),
  exportedAt: z.string().max(40).optional(),
  agents: z
    .array(exportedAgentSchema)
    .min(1, 'O arquivo não tem nenhum agente.')
    .max(
      AGENT_IMPORT_LIMITS.agents,
      `Um arquivo pode ter até ${AGENT_IMPORT_LIMITS.agents} agentes.`,
    ),
});
export type AgentExport = z.infer<typeof agentExportSchema>;

/** `ids`: comma-separated agent ids; absent means every agent. */
export const agentExportQuerySchema = z.strictObject({
  ids: z
    .string()
    .max(AGENT_IMPORT_LIMITS.ids * 41)
    .optional(),
});

export const agentImportResultSchema = z.object({
  imported: z.array(
    z.object({
      id,
      /** The name the agent has now; differs from the file when it was taken. */
      name: z.string(),
      nameInFile: z.string(),
      /** What could not be brought over as it was, in words for the user. */
      warnings: z.array(z.string()),
    }),
  ),
});
export type AgentImportResult = z.infer<typeof agentImportResultSchema>;
