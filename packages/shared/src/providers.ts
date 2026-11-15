import { z } from 'zod';
import { PROVIDER_KINDS, type ProviderKind } from './enums';

const id = z.string().min(1).max(40);
const count = z.number().int().nonnegative();

export const PROVIDER_LIMITS = { name: 60, baseUrl: 300, apiKey: 500, command: 300 } as const;

/**
 * How the server reaches the provider: over HTTP at `baseUrl`, or by running
 * the program in `command` (a harness already installed on this computer).
 */
export type ProviderTransport = 'http' | 'command';

export interface ProviderKindInfo {
  readonly label: string;
  readonly defaultName: string;
  readonly transport: ProviderTransport;
  /** Suggested address for `http` kinds; empty for `command` kinds. */
  readonly defaultBaseUrl: string;
  /** Suggested program for `command` kinds; empty for `http` kinds. */
  readonly defaultCommand: string;
  /** Whether this kind of provider takes an API key. */
  readonly apiKey: 'none' | 'optional' | 'required';
  readonly description: string;
}

/** What the UI and the server know about each kind of provider. */
export const PROVIDER_KIND_INFO: Record<ProviderKind, ProviderKindInfo> = {
  ollama: {
    label: 'Ollama',
    defaultName: 'Ollama local',
    transport: 'http',
    defaultBaseUrl: 'http://127.0.0.1:11434',
    defaultCommand: '',
    apiKey: 'none',
    description: 'Modelos que rodam neste computador. Gratuito e sem enviar dados para fora.',
  },
  openai_compatible: {
    label: 'Compatível com OpenAI',
    defaultName: 'OpenAI',
    transport: 'http',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultCommand: '',
    apiKey: 'optional',
    description: 'OpenAI, LM Studio, OpenRouter e outros serviços com o mesmo protocolo.',
  },
  anthropic: {
    label: 'Anthropic',
    defaultName: 'Anthropic',
    transport: 'http',
    defaultBaseUrl: 'https://api.anthropic.com',
    defaultCommand: '',
    apiKey: 'required',
    description: 'Modelos Claude, pela API da Anthropic. Cobrado por uso.',
  },
  claude_code: {
    label: 'Claude Code (harness)',
    defaultName: 'Claude Code',
    transport: 'command',
    defaultBaseUrl: '',
    defaultCommand: 'claude',
    apiKey: 'none',
    description:
      'Usa o Claude Code já instalado e conectado neste computador, pela sua assinatura, sem chave de API.',
  },
  codex: {
    label: 'Codex (harness)',
    defaultName: 'Codex',
    transport: 'command',
    defaultBaseUrl: '',
    defaultCommand: 'codex',
    apiKey: 'none',
    description:
      'Usa o Codex já instalado e conectado neste computador, pela sua assinatura, sem chave de API.',
  },
};

/** Kinds reached by running a program, not by HTTP. */
export function isCommandProvider(kind: ProviderKind): boolean {
  return PROVIDER_KIND_INFO[kind].transport === 'command';
}

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

/**
 * Whether using this provider sends data off the computer. A harness runs
 * locally but talks to its vendor's service, so it always counts (RF-44).
 */
export function providerIsExternal(kind: ProviderKind, baseUrl: string | null): boolean {
  if (isCommandProvider(kind)) return true;
  return isExternalUrl(baseUrl ?? '');
}

/**
 * The command is run without a shell, with its arguments in a list, so the
 * only thing accepted here is a program name or path: no arguments, no
 * redirection, nothing a shell would expand.
 */
function commandProblem(value: string): string | null {
  if (/[\r\n\t]/.test(value)) return 'O comando não pode ter quebras de linha.';
  if (!/^[A-Za-z0-9 ._:\\/+-]+$/.test(value)) {
    return 'Informe apenas o programa, sem argumentos: letras, números e . _ - : / \\ são aceitos.';
  }
  if (/^-/.test(value)) return 'O comando não pode começar com "-".';
  // Spaces are allowed because of paths like C:\Program Files\…, so an
  // argument would otherwise pass as part of the program name.
  if (
    value
      .split(' ')
      .slice(1)
      .some((part) => part.startsWith('-'))
  ) {
    return 'Informe apenas o programa, sem argumentos.';
  }
  return null;
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

const command = z
  .string()
  .trim()
  .min(1, 'Informe o comando do harness.')
  .max(PROVIDER_LIMITS.command, 'Comando longo demais.')
  .superRefine((value, context) => {
    const problem = commandProblem(value);
    if (problem) context.addIssue({ code: 'custom', message: problem });
  });

/** Each kind takes the address or the command, never both and never neither. */
function checkTransportFields(
  value: { kind: ProviderKind; baseUrl?: string; command?: string },
  context: z.RefinementCtx,
): void {
  const addIssue = (path: 'baseUrl' | 'command', message: string) =>
    context.addIssue({ code: 'custom', path: [path], message });

  if (isCommandProvider(value.kind)) {
    if (value.baseUrl !== undefined) {
      addIssue('baseUrl', `${PROVIDER_KIND_INFO[value.kind].label} não usa endereço.`);
    }
    if (value.command === undefined) addIssue('command', 'Informe o comando do harness.');
    return;
  }
  if (value.command !== undefined) {
    addIssue('command', `${PROVIDER_KIND_INFO[value.kind].label} não usa comando.`);
  }
  if (value.baseUrl === undefined) addIssue('baseUrl', 'Informe o endereço do provedor.');
}

export const providerCreateSchema = z
  .strictObject({
    name,
    kind: z.enum(PROVIDER_KINDS),
    baseUrl: baseUrl.optional(),
    command: command.optional(),
    apiKey: apiKey.optional(),
  })
  .superRefine(checkTransportFields);
export type ProviderCreate = z.infer<typeof providerCreateSchema>;

export const providerUpdateSchema = z.strictObject({
  name: name.optional(),
  baseUrl: baseUrl.optional(),
  command: command.optional(),
  /** A string replaces the stored key; null removes it; absent keeps it. */
  apiKey: apiKey.nullable().optional(),
});
export type ProviderUpdate = z.infer<typeof providerUpdateSchema>;

/** A provider as the API returns it. The key itself is never included (C-09). */
export const providerSchema = z.object({
  id,
  name: z.string(),
  kind: z.enum(PROVIDER_KINDS),
  /** Null for harness providers, which are reached by command. */
  baseUrl: z.string().nullable(),
  /** The program run for harness providers; null for the HTTP ones. */
  command: z.string().nullable(),
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

export const modelUpdateSchema = z
  .strictObject({
    enabled: z.boolean().optional(),
    /**
     * Whether the model can call tools. Only for providers that do not say so
     * themselves (OpenAI-compatible services); the others are detected.
     */
    supportsTools: z.boolean().optional(),
  })
  .refine((value) => value.enabled !== undefined || value.supportsTools !== undefined, {
    message: 'Informe o que alterar.',
  });
export type ModelUpdate = z.infer<typeof modelUpdateSchema>;

export const connectionTestSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
  latencyMs: z.number().nonnegative(),
});
export type ConnectionTest = z.infer<typeof connectionTestSchema>;
