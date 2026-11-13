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

export interface ChatMessage {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}

/** A provider-neutral chat request. Tool definitions join it in Phase 8. */
export interface ChatRequest {
  readonly model: string;
  readonly system: string;
  readonly messages: readonly ChatMessage[];
  readonly temperature: number;
  readonly maxOutputTokens: number;
}

export type StopReason = 'end' | 'max_tokens' | 'refusal';

export type ChatEvent =
  | { readonly type: 'text_delta'; readonly text: string }
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
  readonly baseUrl: string;
  /** From the SecretStore; never logged, never sent anywhere but the provider. */
  readonly apiKey: string | null;
}

export type ProviderErrorKind =
  | 'unreachable'
  | 'timeout'
  | 'unauthorized'
  | 'not_found'
  | 'rate_limited'
  | 'rejected'
  | 'server_error'
  | 'invalid_response'
  | 'cancelled';

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
