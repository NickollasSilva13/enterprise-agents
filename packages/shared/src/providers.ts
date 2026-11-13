import { z } from 'zod';
import { PROVIDER_KINDS, type ProviderKind } from './enums';

const id = z.string().min(1).max(40);
const count = z.number().int().nonnegative();

export const PROVIDER_LIMITS = { name: 60, baseUrl: 300, apiKey: 500 } as const;

export interface ProviderKindInfo {
  readonly label: string;
  readonly defaultName: string;
  readonly defaultBaseUrl: string;
  /** Whether this kind of provider takes an API key. */
  readonly apiKey: 'none' | 'optional' | 'required';
  readonly description: string;
}

/** What the UI and the server know about each kind of provider. */
export const PROVIDER_KIND_INFO: Record<ProviderKind, ProviderKindInfo> = {
  ollama: {
    label: 'Ollama',
    defaultName: 'Ollama local',
    defaultBaseUrl: 'http://127.0.0.1:11434',
    apiKey: 'none',
    description: 'Modelos que rodam neste computador. Gratuito e sem enviar dados para fora.',
  },
  openai_compatible: {
    label: 'Compatível com OpenAI',
    defaultName: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com/v1',
    apiKey: 'optional',
    description: 'OpenAI, LM Studio, OpenRouter e outros serviços com o mesmo protocolo.',
  },
  anthropic: {
    label: 'Anthropic',
    defaultName: 'Anthropic',
    defaultBaseUrl: 'https://api.anthropic.com',
    apiKey: 'required',
    description: 'Modelos Claude, pela API da Anthropic. Cobrado por uso.',
  },
};

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * True when requests to this address leave the computer. Anything that is not
 * loopback counts, including other machines on the local network.
 */
export function isExternalUrl(baseUrl: string): boolean {
  try {
    const host = new URL(baseUrl).hostname.toLowerCase();
    return !(
      LOOPBACK_HOSTS.has(host) ||
      host.endsWith('.localhost') ||
      /^127(\.\d+){3}$/.test(host)
    );
  } catch {
    return true;
  }
}

function baseUrlProblem(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return 'Informe um endereço completo, como http://127.0.0.1:11434.';
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return 'O endereço precisa começar com http:// ou https://.';
  }
  if (url.username || url.password) {
    return 'Não coloque usuário ou senha no endereço. Use o campo de chave de API.';
  }
  if (url.search || url.hash) return 'O endereço não pode ter "?" nem "#".';
  return null;
}

const name = z
  .string()
  .trim()
  .min(1, 'Informe o nome do provedor.')
  .max(PROVIDER_LIMITS.name, `O nome pode ter até ${PROVIDER_LIMITS.name} caracteres.`);

const baseUrl = z
  .string()
  .trim()
  .min(1, 'Informe o endereço do provedor.')
  .max(PROVIDER_LIMITS.baseUrl, 'Endereço longo demais.')
  .superRefine((value, context) => {
    const problem = baseUrlProblem(value);
    if (problem) context.addIssue({ code: 'custom', message: problem });
  })
  .transform((value) => value.replace(/\/+$/, ''));

const apiKey = z
  .string()
  .trim()
  .min(1, 'Informe a chave de API.')
  .max(PROVIDER_LIMITS.apiKey, 'Chave de API longa demais.');

export const providerCreateSchema = z.strictObject({
  name,
  kind: z.enum(PROVIDER_KINDS),
  baseUrl,
  apiKey: apiKey.optional(),
});
export type ProviderCreate = z.infer<typeof providerCreateSchema>;

export const providerUpdateSchema = z.strictObject({
  name: name.optional(),
  baseUrl: baseUrl.optional(),
  /** A string replaces the stored key; null removes it; absent keeps it. */
  apiKey: apiKey.nullable().optional(),
});
export type ProviderUpdate = z.infer<typeof providerUpdateSchema>;

/** A provider as the API returns it. The key itself is never included (C-09). */
export const providerSchema = z.object({
  id,
  name: z.string(),
  kind: z.enum(PROVIDER_KINDS),
  baseUrl: z.string(),
  isExternal: z.boolean(),
  hasApiKey: z.boolean(),
  /** How the stored key ends, e.g. "…a1b2"; null without a key. */
  apiKeyHint: z.string().nullable(),
  modelCount: count,
  enabledModelCount: count,
  /** Agents using a model of this provider. */
  agentCount: count,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Provider = z.infer<typeof providerSchema>;

export const providerListSchema = z.object({ providers: z.array(providerSchema) });

export const providerModelSchema = z.object({
  id,
  providerId: id,
  name: z.string(),
  displayName: z.string(),
  supportsTools: z.boolean(),
  enabled: z.boolean(),
  agentCount: count,
});
export type ProviderModel = z.infer<typeof providerModelSchema>;

export const providerModelListSchema = z.object({ models: z.array(providerModelSchema) });

export const modelSyncResultSchema = z.object({
  models: z.array(providerModelSchema),
  added: count,
  removed: count,
});
export type ModelSyncResult = z.infer<typeof modelSyncResultSchema>;

export const modelUpdateSchema = z.strictObject({ enabled: z.boolean() });
export type ModelUpdate = z.infer<typeof modelUpdateSchema>;

export const connectionTestSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
  latencyMs: z.number().nonnegative(),
});
export type ConnectionTest = z.infer<typeof connectionTestSchema>;
