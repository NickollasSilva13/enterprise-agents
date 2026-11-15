import type { ProviderKind } from '@ea/shared';

/** A model offered by a provider. */
export interface ModelInfo {
  /** Identifier sent back to the provider. */
  readonly name: string;
  readonly displayName: string;
  readonly supportsTools: boolean;
}

export interface ConnectionResult {
  /** Short description of what answered, e.g. "Ollama 0.40.16". */
  readonly detail: string;
}

/** A tool invocation asked for by the model. */
export interface ToolCallRequest {
  /** Pairs the call with its result. Generated here when the provider gives none. */
  readonly id: string;
  readonly name: string;
  /** As sent by the model: unvalidated, and not necessarily an object. */
  readonly arguments: unknown;
}

export type ChatMessage =
  | { readonly role: 'user'; readonly content: string }
  | {
      readonly role: 'assistant';
      readonly content: string;
      readonly toolCalls?: readonly ToolCallRequest[];
    }
  | {
      readonly role: 'tool';
      readonly toolCallId: string;
      readonly name: string;
      readonly content: string;
      readonly isError?: boolean;
    };

/** A tool as described to the model. */
export interface ToolSpec {
  readonly name: string;
  readonly description: string;
  /** JSON Schema of the arguments (an object schema). */
  readonly parameters: Record<string, unknown>;
}

/** A provider-neutral chat request. */
export interface ChatRequest {
  readonly model: string;
  readonly system: string;
  readonly messages: readonly ChatMessage[];
  readonly temperature: number;
  readonly maxOutputTokens: number;
  /** Tools the model may ask for. Omitted or empty: plain conversation. */
  readonly tools?: readonly ToolSpec[];
  /**
   * The agent's working folder. Only harness providers use it, as the working
   * directory of the process they run; HTTP providers ignore it.
   */
  readonly workspaceDir?: string;
}

export type StopReason = 'end' | 'max_tokens' | 'refusal' | 'tool_use';

export type ChatEvent =
  | { readonly type: 'text_delta'; readonly text: string }
  | ({ readonly type: 'tool_call' } & ToolCallRequest)
  | { readonly type: 'usage'; readonly inputTokens: number; readonly outputTokens: number }
  | { readonly type: 'done'; readonly stopReason: StopReason };

/**
 * What every provider adapter implements. Adapters translate to and from the
 * provider's own protocol and throw only `ProviderError`.
 */
export interface ModelProvider {
  testConnection(signal?: AbortSignal): Promise<ConnectionResult>;
  listModels(signal?: AbortSignal): Promise<ModelInfo[]>;
  /** Streams one model response. Ends with a `done` event unless it throws. */
  chat(request: ChatRequest, signal?: AbortSignal): AsyncIterable<ChatEvent>;
}

export interface ProviderSettings {
  readonly kind: ProviderKind;
  /** Address of an HTTP provider; null for a harness. */
  readonly baseUrl: string | null;
  /** Program of a harness provider; null for an HTTP one. */
  readonly command: string | null;
  /** From the SecretStore; never logged, never sent anywhere but the provider. */
  readonly apiKey: string | null;
}

/** Settings of a provider reached over HTTP, with the address known present. */
export type HttpProviderSettings = Omit<ProviderSettings, 'baseUrl'> & { readonly baseUrl: string };

/** Settings of a harness provider, with the program known present. */
export type CommandProviderSettings = Omit<ProviderSettings, 'command'> & {
  readonly command: string;
};

export type ProviderErrorKind =
  | 'unreachable'
  | 'timeout'
  | 'unauthorized'
  | 'not_found'
  | 'rate_limited'
  | 'rejected'
  | 'server_error'
  | 'invalid_response'
  | 'cancelled'
  | 'program_missing'
  | 'not_signed_in';

const MESSAGES: Record<ProviderErrorKind, string> = {
  unreachable:
    'Não foi possível conectar ao provedor. Verifique o endereço e se o serviço está em execução.',
  timeout: 'O provedor não respondeu a tempo.',
  unauthorized: 'O provedor recusou a credencial. Verifique a chave de API.',
  not_found: 'O provedor não reconhece o endereço ou o modelo informado.',
  rate_limited: 'O provedor está limitando as requisições. Tente de novo em instantes.',
  rejected: 'O provedor recusou a requisição.',
  server_error: 'O provedor respondeu com um erro interno.',
  invalid_response: 'O provedor respondeu em um formato inesperado.',
  cancelled: 'A requisição ao provedor foi cancelada.',
  program_missing:
    'Não foi possível executar o programa do harness. Verifique o comando informado e se ele está instalado neste computador.',
  not_signed_in:
    'O harness não está conectado a uma conta. Abra um terminal, execute o programa dele e entre na sua conta.',
};

/**
 * The only error adapters throw. Its message is a fixed sentence chosen by
 * `kind`, so it is always safe to show: text coming from the provider (which
 * could echo a credential) is kept apart in `upstreamDetail`, for logs only
 * and only after redaction.
 */
export class ProviderError extends Error {
  constructor(
    readonly kind: ProviderErrorKind,
    readonly status?: number,
    readonly upstreamDetail?: string,
  ) {
    super(MESSAGES[kind]);
    this.name = 'ProviderError';
  }
}

export function errorKindForStatus(status: number): ProviderErrorKind {
  if (status === 401 || status === 403) return 'unauthorized';
  if (status === 404) return 'not_found';
  if (status === 408) return 'timeout';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'server_error';
  return 'rejected';
}
