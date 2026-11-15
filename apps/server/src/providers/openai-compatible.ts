import { z } from 'zod';
import { joinUrl, parseChunk, readLines, request, requestJson } from './http';
import {
  type ChatEvent,
  type ChatMessage,
  type ChatRequest,
  type ConnectionResult,
  type ModelInfo,
  type ModelProvider,
  ProviderError,
  type ProviderSettings,
  type StopReason,
} from './types';

const QUICK_TIMEOUT_MS = 15_000;
const FIRST_BYTE_TIMEOUT_MS = 180_000;

const modelsSchema = z.object({ data: z.array(z.object({ id: z.string() })) });
const chunkSchema = z.object({
  choices: z
    .array(
      z.object({
        delta: z
          .object({
            content: z.string().nullish(),
            tool_calls: z
              .array(
                z.object({
                  index: z.number().int().nonnegative().optional(),
                  id: z.string().nullish(),
                  function: z
                    .object({ name: z.string().nullish(), arguments: z.string().nullish() })
                    .optional(),
                }),
              )
              .nullish(),
          })
          .optional(),
        finish_reason: z.string().nullish(),
      }),
    )
    .optional(),
  usage: z
    .object({ prompt_tokens: z.number().optional(), completion_tokens: z.number().optional() })
    .nullish(),
});

const STOP_REASONS: Record<string, StopReason> = {
  length: 'max_tokens',
  content_filter: 'refusal',
  tool_calls: 'tool_use',
};

/** A message in the shape the chat-completions protocol expects. */
function toOpenAiMessage(message: ChatMessage): Record<string, unknown> {
  if (message.role === 'tool') {
    return { role: 'tool', tool_call_id: message.toolCallId, content: message.content };
  }
  if (message.role === 'assistant' && message.toolCalls?.length) {
    return {
      role: 'assistant',
      content: message.content === '' ? null : message.content,
      tool_calls: message.toolCalls.map((call) => ({
        id: call.id,
        type: 'function',
        // The protocol carries arguments as a JSON string.
        function: { name: call.name, arguments: JSON.stringify(call.arguments ?? {}) },
      })),
    };
  }
  return { role: message.role, content: message.content };
}

/** Arguments arrive as pieces of a JSON string; what does not parse is kept as text. */
function parseArguments(text: string): unknown {
  if (text.trim() === '') return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

/**
 * OpenAI's own API replaced `max_tokens` with `max_completion_tokens` and
 * rejects the old name on its newer models; most compatible servers only know
 * the old one. The host is the only reliable way to tell them apart.
 */
export function maxTokensField(baseUrl: string): 'max_completion_tokens' | 'max_tokens' {
  try {
    return new URL(baseUrl).hostname === 'api.openai.com' ? 'max_completion_tokens' : 'max_tokens';
  } catch {
    return 'max_tokens';
  }
}

/**
 * Adapter for servers that speak the OpenAI chat-completions protocol:
 * OpenAI itself, LM Studio, OpenRouter, vLLM and similar. `baseUrl` includes
 * the version prefix, e.g. "https://api.openai.com/v1".
 */
export class OpenAiCompatibleProvider implements ModelProvider {
  constructor(private readonly settings: ProviderSettings) {}

  private url(path: string): string {
    return joinUrl(this.settings.baseUrl, path);
  }

  private headers(): Record<string, string> {
    return this.settings.apiKey ? { authorization: `Bearer ${this.settings.apiKey}` } : {};
  }

  async testConnection(signal?: AbortSignal): Promise<ConnectionResult> {
    const models = await this.listModels(signal);
    return { detail: `${models.length} modelos disponíveis` };
  }

  async listModels(signal?: AbortSignal): Promise<ModelInfo[]> {
    const { data } = await requestJson(this.url('/models'), modelsSchema, {
      headers: this.headers(),
      signal,
      timeoutMs: QUICK_TIMEOUT_MS,
    });
    // The protocol does not say which models accept tools, so none is assumed.
    return data
      .map(({ id }) => ({ name: id, displayName: id, supportsTools: false }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async *chat(chat: ChatRequest, signal?: AbortSignal): AsyncGenerator<ChatEvent> {
    const response = await request(this.url('/chat/completions'), {
      method: 'POST',
      headers: this.headers(),
      body: {
        model: chat.model,
        stream: true,
        stream_options: { include_usage: true },
        messages: [
          ...(chat.system ? [{ role: 'system', content: chat.system }] : []),
          ...chat.messages.map(toOpenAiMessage),
        ],
        ...(chat.tools?.length
          ? {
              tools: chat.tools.map((tool) => ({
                type: 'function',
                function: {
                  name: tool.name,
                  description: tool.description,
                  parameters: tool.parameters,
                },
              })),
            }
          : {}),
        temperature: chat.temperature,
        [maxTokensField(this.settings.baseUrl)]: chat.maxOutputTokens,
      },
      signal,
      timeoutMs: FIRST_BYTE_TIMEOUT_MS,
    });

    let stopReason: StopReason = 'end';
    let usage = { inputTokens: 0, outputTokens: 0 };
    let finished = false;
    // Tool calls are streamed in fragments, keyed by their position.
    const calls = new Map<number, { id: string; name: string; arguments: string }>();

    for await (const line of readLines(response, signal)) {
      // Server-sent events: only "data:" lines carry payload.
      if (!line.startsWith('data:')) continue;
      const data = line.slice('data:'.length).trim();
      if (data === '[DONE]') {
        finished = true;
        break;
      }
      const chunk = parseChunk(data, chunkSchema);
      const choice = chunk.choices?.[0];
      if (choice?.delta?.content) yield { type: 'text_delta', text: choice.delta.content };
      for (const fragment of choice?.delta?.tool_calls ?? []) {
        const index = fragment.index ?? 0;
        const call = calls.get(index) ?? { id: '', name: '', arguments: '' };
        if (fragment.id) call.id = fragment.id;
        if (fragment.function?.name) call.name += fragment.function.name;
        if (fragment.function?.arguments) call.arguments += fragment.function.arguments;
        calls.set(index, call);
      }
      if (choice?.finish_reason) {
        finished = true;
        stopReason = STOP_REASONS[choice.finish_reason] ?? 'end';
      }
      if (chunk.usage) {
        usage = {
          inputTokens: chunk.usage.prompt_tokens ?? 0,
          outputTokens: chunk.usage.completion_tokens ?? 0,
        };
      }
    }

    if (!finished) {
      throw new ProviderError('invalid_response', undefined, 'stream ended without a finish');
    }
    const ordered = [...calls.entries()].sort(([a], [b]) => a - b);
    for (const [index, call] of ordered) {
      yield {
        type: 'tool_call',
        id: call.id || `call_${index + 1}`,
        name: call.name,
        arguments: parseArguments(call.arguments),
      };
    }
    yield { type: 'usage', ...usage };
    // Some servers finish with "stop" even when they asked for tools.
    yield {
      type: 'done',
      stopReason: ordered.length > 0 && stopReason === 'end' ? 'tool_use' : stopReason,
    };
  }
}
