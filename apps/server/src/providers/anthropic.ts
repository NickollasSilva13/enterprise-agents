import Anthropic from '@anthropic-ai/sdk';
import {
  type ChatEvent,
  type ChatMessage,
  type ChatRequest,
  type ConnectionResult,
  errorKindForStatus,
  type ModelInfo,
  type ModelProvider,
  ProviderError,
  type ProviderSettings,
  type StopReason,
} from './types';

const QUICK_TIMEOUT_MS = 15_000;
const CHAT_TIMEOUT_MS = 10 * 60_000;
const DETAIL_LIMIT = 500;

const STOP_REASONS: Record<string, StopReason> = {
  max_tokens: 'max_tokens',
  refusal: 'refusal',
  tool_use: 'tool_use',
};

/**
 * Messages in the shape of the Messages API: tool calls are blocks of the
 * assistant turn, and tool results are blocks of the user turn that follows,
 * all results of one round in the same turn.
 */
export function toAnthropicMessages(messages: readonly ChatMessage[]): Anthropic.MessageParam[] {
  const result: Anthropic.MessageParam[] = [];
  for (const message of messages) {
    if (message.role === 'tool') {
      const block: Anthropic.ToolResultBlockParam = {
        type: 'tool_result',
        tool_use_id: message.toolCallId,
        content: message.content,
        ...(message.isError ? { is_error: true } : {}),
      };
      const last = result.at(-1);
      if (last?.role === 'user' && Array.isArray(last.content)) last.content.push(block);
      else result.push({ role: 'user', content: [block] });
    } else if (message.role === 'assistant' && message.toolCalls?.length) {
      result.push({
        role: 'assistant',
        content: [
          ...(message.content ? [{ type: 'text' as const, text: message.content }] : []),
          ...message.toolCalls.map((call) => ({
            type: 'tool_use' as const,
            id: call.id,
            name: call.name,
            input: call.arguments ?? {},
          })),
        ],
      });
    } else {
      result.push({ role: message.role, content: message.content });
    }
  }
  return result;
}

function toProviderError(error: unknown, signal?: AbortSignal): ProviderError {
  if (error instanceof ProviderError) return error;
  // Most specific first: the SDK's typed errors, never message matching.
  if (error instanceof Anthropic.APIUserAbortError || signal?.aborted) {
    return new ProviderError('cancelled');
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) return new ProviderError('timeout');
  if (error instanceof Anthropic.APIConnectionError) {
    return new ProviderError('unreachable', undefined, error.message.slice(0, DETAIL_LIMIT));
  }
  if (error instanceof Anthropic.APIError) {
    const status = typeof error.status === 'number' ? error.status : undefined;
    return new ProviderError(
      status === undefined ? 'invalid_response' : errorKindForStatus(status),
      status,
      error.message.slice(0, DETAIL_LIMIT),
    );
  }
  const detail = error instanceof Error ? error.message : String(error);
  return new ProviderError('invalid_response', undefined, detail.slice(0, DETAIL_LIMIT));
}

/** Adapter for the Anthropic API, through the official SDK. */
export class AnthropicProvider implements ModelProvider {
  private readonly settings: ProviderSettings;

  constructor(settings: ProviderSettings) {
    this.settings = settings;
  }

  /**
   * The key is always passed explicitly. Without one the SDK would look for
   * credentials of its own (environment, a logged-in profile) and send them to
   * whatever address this provider points at, so that case stops here.
   */
  private get client(): Anthropic {
    if (!this.settings.apiKey) throw new ProviderError('unauthorized');
    return new Anthropic({
      apiKey: this.settings.apiKey,
      baseURL: this.settings.baseUrl,
      maxRetries: 1,
    });
  }

  async testConnection(signal?: AbortSignal): Promise<ConnectionResult> {
    const models = await this.listModels(signal);
    return { detail: `${models.length} modelos disponíveis` };
  }

  async listModels(signal?: AbortSignal): Promise<ModelInfo[]> {
    try {
      const models: ModelInfo[] = [];
      const page = this.client.models.list(
        { limit: 100 },
        { timeout: QUICK_TIMEOUT_MS, ...(signal ? { signal } : {}) },
      );
      for await (const model of page) {
        // Every Claude model on the API accepts tool definitions.
        models.push({ name: model.id, displayName: model.display_name, supportsTools: true });
      }
      return models;
    } catch (error) {
      throw toProviderError(error, signal);
    }
  }

  async *chat(chat: ChatRequest, signal?: AbortSignal): AsyncGenerator<ChatEvent> {
    try {
      // No sampling parameters: current Claude models reject `temperature`,
      // so the agent's temperature setting does not apply to this provider.
      const stream = this.client.messages.stream(
        {
          model: chat.model,
          max_tokens: chat.maxOutputTokens,
          ...(chat.system ? { system: chat.system } : {}),
          messages: toAnthropicMessages(chat.messages),
          ...(chat.tools?.length
            ? {
                tools: chat.tools.map((tool) => ({
                  name: tool.name,
                  description: tool.description,
                  input_schema: { type: 'object' as const, ...tool.parameters },
                })),
              }
            : {}),
        },
        { timeout: CHAT_TIMEOUT_MS, ...(signal ? { signal } : {}) },
      );

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield { type: 'text_delta', text: event.delta.text };
        }
      }

      const message = await stream.finalMessage();
      for (const block of message.content) {
        if (block.type === 'tool_use') {
          yield { type: 'tool_call', id: block.id, name: block.name, arguments: block.input };
        }
      }
      yield {
        type: 'usage',
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
      };
      yield { type: 'done', stopReason: STOP_REASONS[message.stop_reason ?? ''] ?? 'end' };
    } catch (error) {
      throw toProviderError(error, signal);
    }
  }
}
