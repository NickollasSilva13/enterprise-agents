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
} from './types';

/** A message in the shape Ollama's chat API expects. */
function toOllamaMessage(message: ChatMessage): Record<string, unknown> {
  if (message.role === 'tool') {
    return { role: 'tool', content: message.content, tool_name: message.name };
  }
  if (message.role === 'assistant' && message.toolCalls?.length) {
    return {
      role: 'assistant',
      content: message.content,
      tool_calls: message.toolCalls.map((call) => ({
        function: { name: call.name, arguments: call.arguments },
      })),
    };
  }
  return { role: message.role, content: message.content };
}

const QUICK_TIMEOUT_MS = 10_000;
/** A local model may need to be loaded into memory before the first token. */
const FIRST_BYTE_TIMEOUT_MS = 180_000;

const versionSchema = z.object({ version: z.string() });
const tagsSchema = z.object({ models: z.array(z.object({ name: z.string() })) });
const showSchema = z.object({ capabilities: z.array(z.string()).optional() });
const chatChunkSchema = z.object({
  message: z
    .object({
      content: z.string().optional(),
      tool_calls: z
        .array(z.object({ function: z.object({ name: z.string(), arguments: z.unknown() }) }))
        .optional(),
    })
    .optional(),
  done: z.boolean().optional(),
  done_reason: z.string().optional(),
  prompt_eval_count: z.number().optional(),
  eval_count: z.number().optional(),
  error: z.string().optional(),
});

/** Adapter for a local or remote Ollama server (native API). */
export class OllamaProvider implements ModelProvider {
  constructor(private readonly settings: ProviderSettings) {}

  private url(path: string): string {
    return joinUrl(this.settings.baseUrl, path);
  }

  async testConnection(signal?: AbortSignal): Promise<ConnectionResult> {
    const { version } = await requestJson(this.url('/api/version'), versionSchema, {
      signal,
      timeoutMs: QUICK_TIMEOUT_MS,
    });
    return { detail: `Ollama ${version}` };
  }

  async listModels(signal?: AbortSignal): Promise<ModelInfo[]> {
    const { models } = await requestJson(this.url('/api/tags'), tagsSchema, {
      signal,
      timeoutMs: QUICK_TIMEOUT_MS,
    });

    const result: ModelInfo[] = [];
    for (const { name } of models) {
      const capabilities = await this.capabilities(name, signal);
      // Embedding-only models cannot hold a conversation.
      if (capabilities && !capabilities.includes('completion')) continue;
      result.push({
        name,
        displayName: name,
        supportsTools: capabilities?.includes('tools') ?? false,
      });
    }
    return result;
  }

  /** Null when the server is too old to report capabilities. */
  private async capabilities(model: string, signal?: AbortSignal): Promise<string[] | null> {
    try {
      const shown = await requestJson(this.url('/api/show'), showSchema, {
        method: 'POST',
        body: { model },
        signal,
        timeoutMs: QUICK_TIMEOUT_MS,
      });
      return shown.capabilities ?? null;
    } catch (error) {
      if (error instanceof ProviderError && error.kind === 'cancelled') throw error;
      return null;
    }
  }

  async *chat(chat: ChatRequest, signal?: AbortSignal): AsyncGenerator<ChatEvent> {
    const response = await request(this.url('/api/chat'), {
      method: 'POST',
      body: {
        model: chat.model,
        stream: true,
        messages: [
          ...(chat.system ? [{ role: 'system', content: chat.system }] : []),
          ...chat.messages.map(toOllamaMessage),
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
        options: { temperature: chat.temperature, num_predict: chat.maxOutputTokens },
      },
      signal,
      timeoutMs: FIRST_BYTE_TIMEOUT_MS,
    });

    let toolCalls = 0;
    for await (const line of readLines(response, signal)) {
      const chunk = parseChunk(line, chatChunkSchema);
      if (chunk.error) throw new ProviderError('rejected', undefined, chunk.error);
      if (chunk.message?.content) yield { type: 'text_delta', text: chunk.message.content };
      for (const call of chunk.message?.tool_calls ?? []) {
        toolCalls += 1;
        // Ollama gives calls no id; one is made up to pair each call with its result.
        yield {
          type: 'tool_call',
          id: `call_${toolCalls}`,
          name: call.function.name,
          arguments: call.function.arguments,
        };
      }
      if (chunk.done) {
        yield {
          type: 'usage',
          inputTokens: chunk.prompt_eval_count ?? 0,
          outputTokens: chunk.eval_count ?? 0,
        };
        const stopReason =
          chunk.done_reason === 'length' ? 'max_tokens' : toolCalls > 0 ? 'tool_use' : 'end';
        yield { type: 'done', stopReason };
        return;
      }
    }
    throw new ProviderError('invalid_response', undefined, 'stream ended without "done"');
  }
}
