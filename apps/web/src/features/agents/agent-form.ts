import {
  type Agent,
  AGENT_DEFAULTS,
  type AgentCreate,
  agentCreateSchema,
  type Appearance,
  randomAppearance,
} from '@ea/shared';

/**
 * What the form holds while the user types. Numbers stay as text so a field
 * can be empty or half-typed without the value jumping around.
 */
export interface AgentFormValues {
  name: string;
  description: string;
  objective: string;
  systemPrompt: string;
  projectId: string;
  modelId: string;
  temperature: string;
  maxOutputTokens: string;
  maxSteps: string;
  maxDurationSeconds: string;
  maxTotalTokens: string;
  enabled: boolean;
  /** Null: the robot drawn from the agent's id. */
  appearance: Appearance | null;
}

export type AgentFormErrors = Partial<Record<keyof AgentFormValues, string>>;

/** A new agent starts as a person drawn at random (`random` gives 0 to 1). */
export function toFormValues(agent?: Agent, random: () => number = Math.random): AgentFormValues {
  const source = agent ?? { name: '', ...AGENT_DEFAULTS };
  return {
    name: source.name,
    description: source.description,
    objective: source.objective,
    systemPrompt: source.systemPrompt,
    projectId: source.projectId ?? '',
    modelId: source.modelId ?? '',
    temperature: String(source.temperature).replace('.', ','),
    maxOutputTokens: String(source.maxOutputTokens),
    maxSteps: String(source.maxSteps),
    maxDurationSeconds: String(source.maxDurationSeconds),
    maxTotalTokens: source.maxTotalTokens === null ? '' : String(source.maxTotalTokens),
    enabled: source.enabled,
    appearance: agent ? agent.appearance : randomAppearance(random),
  };
}

/** Accepts "0,7" as well as "0.7". Empty or unreadable text becomes NaN. */
const toNumber = (text: string) => {
  const trimmed = text.trim().replace(',', '.');
  return trimmed === '' ? Number.NaN : Number(trimmed);
};

export type ParsedForm = { ok: true; agent: AgentCreate } | { ok: false; errors: AgentFormErrors };

/** Validates with the same schema the server uses, so both always agree. */
export function parseForm(values: AgentFormValues): ParsedForm {
  const result = agentCreateSchema.safeParse({
    name: values.name,
    description: values.description,
    objective: values.objective,
    systemPrompt: values.systemPrompt,
    projectId: values.projectId === '' ? null : values.projectId,
    modelId: values.modelId === '' ? null : values.modelId,
    temperature: toNumber(values.temperature),
    maxOutputTokens: toNumber(values.maxOutputTokens),
    maxSteps: toNumber(values.maxSteps),
    maxDurationSeconds: toNumber(values.maxDurationSeconds),
    maxTotalTokens: values.maxTotalTokens.trim() === '' ? null : toNumber(values.maxTotalTokens),
    enabled: values.enabled,
    appearance: values.appearance,
  });
  if (result.success) return { ok: true, agent: result.data };

  const errors: AgentFormErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as keyof AgentFormValues;
    errors[field] ??= issue.message;
  }
  return { ok: false, errors };
}
