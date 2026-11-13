import { afterEach, describe, expect, it } from 'vitest';
import { AnthropicProvider } from '../src/providers/anthropic';
import { createProvider } from '../src/providers/factory';
import { OllamaProvider } from '../src/providers/ollama';
import { maxTokensField, OpenAiCompatibleProvider } from '../src/providers/openai-compatible';
import {
  type ChatEvent,
  type ChatRequest,
  type ModelProvider,
  ProviderError,
} from '../src/providers/types';
import {
  anthropicStub,
  ollamaStub,
  openAiStub,
  sendJson,
  startStub,
  type StubServer,
  unusedUrl,
} from './stub-servers';

const stubs: StubServer[] = [];
const track = async (stub: Promise<StubServer>) => {
  const started = await stub;
  stubs.push(started);
  return started;
};
afterEach(async () => {
  await Promise.all(stubs.splice(0).map((stub) => stub.close()));
});

const chatRequest: ChatRequest = {
  model: 'the-model',
  system: 'Seja breve.',
  messages: [
    { role: 'user', content: 'Oi' },
    { role: 'assistant', content: 'Olá!' },
    { role: 'user', content: 'Tudo bem?' },
  ],
  temperature: 0.3,
  maxOutputTokens: 256,
};

async function collect(provider: ModelProvider, signal?: AbortSignal): Promise<ChatEvent[]> {
  const events: ChatEvent[] = [];
  for await (const event of provider.chat(chatRequest, signal)) events.push(event);
  return events;
}

const textOf = (events: ChatEvent[]) =>
  events.flatMap((event) => (event.type === 'text_delta' ? [event.text] : [])).join('');

/** The ProviderError a promise rejects with. */
async function failure(promise: Promise<unknown>): Promise<ProviderError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ProviderError) return error;
    throw new Error(`expected a ProviderError, got ${String(error)}`, { cause: error });
  }
  throw new Error('expected a failure');
}

describe('Ollama adapter', () => {
  const provider = (baseUrl: string) =>
    new OllamaProvider({ kind: 'ollama', baseUrl, apiKey: null });

  it('reports the server version', async () => {
    const stub = await track(ollamaStub());
    expect(await provider(stub.url).testConnection()).toEqual({ detail: 'Ollama 0.40.16' });
  });

  it('lists chat models with their tool support and skips embedding models', async () => {
    const stub = await track(
      ollamaStub({
        models: {
          'llama3.2:3b': ['completion', 'tools'],
          'phi:latest': ['completion'],
          'embed:latest': ['embedding'],
          'old:latest': null,
        },
      }),
    );
    expect(await provider(`${stub.url}/`).listModels()).toEqual([
      { name: 'llama3.2:3b', displayName: 'llama3.2:3b', supportsTools: true },
      { name: 'phi:latest', displayName: 'phi:latest', supportsTools: false },
      // The server could not describe it: listed, tools not assumed.
      { name: 'old:latest', displayName: 'old:latest', supportsTools: false },
    ]);
  });

  it('streams a reply, then usage, then done', async () => {
    const stub = await track(ollamaStub({ reply: ['A', 'B', 'C'] }));
    const events = await collect(provider(stub.url));
    expect(events).toEqual([
      { type: 'text_delta', text: 'A' },
      { type: 'text_delta', text: 'B' },
      { type: 'text_delta', text: 'C' },
      { type: 'usage', inputTokens: 11, outputTokens: 5 },
      { type: 'done', stopReason: 'end' },
    ]);
    expect(stub.requests.at(-1)?.body).toEqual({
      model: 'the-model',
      stream: true,
      messages: [{ role: 'system', content: 'Seja breve.' }, ...chatRequest.messages],
      options: { temperature: 0.3, num_predict: 256 },
    });
  });

  it('reports a reply cut by the token limit', async () => {
    const stub = await track(ollamaStub({ doneReason: 'length' }));
    expect((await collect(provider(stub.url))).at(-1)).toEqual({
      type: 'done',
      stopReason: 'max_tokens',
    });
  });

  it('fails when the stream carries an error or ends early', async () => {
    const withError = await track(
      ollamaStub({
        chat: (_request, response) => {
          response.writeHead(200);
          response.end(`${JSON.stringify({ error: 'model requires more memory' })}\n`);
        },
      }),
    );
    const rejected = await failure(collect(provider(withError.url)));
    expect(rejected.kind).toBe('rejected');
    expect(rejected.message).not.toContain('memory');
    expect(rejected.upstreamDetail).toContain('memory');

    const truncated = await track(
      ollamaStub({
        chat: (_request, response) => {
          response.writeHead(200);
          response.end(`${JSON.stringify({ message: { content: 'par' } })}\n`);
        },
      }),
    );
    expect((await failure(collect(provider(truncated.url)))).kind).toBe('invalid_response');
  });

  it('maps failures to kinds with fixed, safe messages', async () => {
    expect((await failure(provider(await unusedUrl()).testConnection())).kind).toBe('unreachable');

    const notFound = await track(startStub((_request, response) => sendJson(response, 404, {})));
    expect((await failure(provider(notFound.url).listModels())).kind).toBe('not_found');

    const broken = await track(startStub((_request, response) => sendJson(response, 500, {})));
    expect((await failure(provider(broken.url).listModels())).kind).toBe('server_error');

    const notJson = await track(
      startStub((_request, response) => {
        response.writeHead(200);
        response.end('<html>not json</html>');
      }),
    );
    expect((await failure(provider(notJson.url).testConnection())).kind).toBe('invalid_response');

    const wrongShape = await track(
      startStub((_request, response) => sendJson(response, 200, { models: 'nope' })),
    );
    expect((await failure(provider(wrongShape.url).listModels())).kind).toBe('invalid_response');
  });

  it('refuses to follow a redirect', async () => {
    const redirecting = await track(
      startStub((_request, response) => {
        response.writeHead(302, { location: 'http://127.0.0.1:1/elsewhere' });
        response.end();
      }),
    );
    expect((await failure(provider(redirecting.url).testConnection())).kind).toBe('unreachable');
  });

  it('stops when the caller cancels', async () => {
    const stub = await track(
      ollamaStub({
        chat: (_request, response) => {
          response.writeHead(200);
          response.write(`${JSON.stringify({ message: { content: 'primeiro' } })}\n`);
          // Never finishes: only cancellation ends it.
        },
      }),
    );
    const controller = new AbortController();
    const events: ChatEvent[] = [];
    const run = (async () => {
      for await (const event of provider(stub.url).chat(chatRequest, controller.signal)) {
        events.push(event);
        controller.abort();
      }
    })();
    expect((await failure(run)).kind).toBe('cancelled');
    expect(events).toEqual([{ type: 'text_delta', text: 'primeiro' }]);
  });
});

describe('OpenAI-compatible adapter', () => {
  const provider = (baseUrl: string, apiKey: string | null = 'sk-test-key-123456') =>
    new OpenAiCompatibleProvider({ kind: 'openai_compatible', baseUrl, apiKey });

  it('sends the key as a bearer token and lists models by name', async () => {
    const stub = await track(openAiStub({ requireKey: 'sk-test-key-123456' }));
    expect(await provider(`${stub.url}/v1`).listModels()).toEqual([
      { name: 'gpt-a', displayName: 'gpt-a', supportsTools: false },
      { name: 'gpt-b', displayName: 'gpt-b', supportsTools: false },
    ]);
    expect(await provider(`${stub.url}/v1`).testConnection()).toEqual({
      detail: '2 modelos disponíveis',
    });
  });

  it('works without a key for servers that need none', async () => {
    const stub = await track(openAiStub());
    await provider(`${stub.url}/v1`, null).listModels();
    expect(stub.requests[0]?.headers.authorization).toBeUndefined();
  });

  it('streams a reply with usage', async () => {
    const stub = await track(openAiStub({ reply: ['Tudo', ' bem'] }));
    const events = await collect(provider(`${stub.url}/v1`));
    expect(textOf(events)).toBe('Tudo bem');
    expect(events.slice(-2)).toEqual([
      { type: 'usage', inputTokens: 9, outputTokens: 4 },
      { type: 'done', stopReason: 'end' },
    ]);
    expect(stub.requests.at(-1)?.body).toMatchObject({
      model: 'the-model',
      stream: true,
      temperature: 0.3,
      max_tokens: 256,
      messages: [{ role: 'system', content: 'Seja breve.' }, ...chatRequest.messages],
    });
  });

  it.each([
    ['length', 'max_tokens'],
    ['content_filter', 'refusal'],
    ['stop', 'end'],
  ] as const)('maps finish reason %s to %s', async (finishReason, stopReason) => {
    const stub = await track(openAiStub({ finishReason }));
    expect((await collect(provider(`${stub.url}/v1`))).at(-1)).toEqual({
      type: 'done',
      stopReason,
    });
  });

  it('uses the token-limit field each server understands', () => {
    expect(maxTokensField('https://api.openai.com/v1')).toBe('max_completion_tokens');
    expect(maxTokensField('http://127.0.0.1:1234/v1')).toBe('max_tokens');
    expect(maxTokensField('https://openrouter.ai/api/v1')).toBe('max_tokens');
  });

  it('never puts the key in the error message, even when the server echoes it (C-10)', async () => {
    const stub = await track(openAiStub({ requireKey: 'the-right-key' }));
    const error = await failure(provider(`${stub.url}/v1`).listModels());
    expect(error.kind).toBe('unauthorized');
    expect(error.status).toBe(401);
    expect(error.message).toBe('O provedor recusou a credencial. Verifique a chave de API.');
    expect(error.message).not.toContain('sk-test-key-123456');
    // The raw text is kept apart, for the caller to redact before logging.
    expect(error.upstreamDetail).toContain('sk-test-key-123456');
  });
});

describe('Anthropic adapter', () => {
  const provider = (baseUrl: string, apiKey: string | null = 'sk-ant-test-key') =>
    new AnthropicProvider({ kind: 'anthropic', baseUrl, apiKey });

  it('authenticates with the key and lists models with their display names', async () => {
    const stub = await track(anthropicStub({ requireKey: 'sk-ant-test-key' }));
    expect(await provider(stub.url).listModels()).toEqual([
      { name: 'claude-haiku-5-5', displayName: 'Claude Haiku 5.5', supportsTools: true },
      { name: 'claude-opus-5-5', displayName: 'Claude Opus 5.5', supportsTools: true },
    ]);
  });

  it('streams a reply with usage and sends no sampling parameters', async () => {
    const stub = await track(anthropicStub({ reply: ['Tudo', ' bem'] }));
    const events = await collect(provider(stub.url));
    expect(textOf(events)).toBe('Tudo bem');
    expect(events.slice(-2)).toEqual([
      { type: 'usage', inputTokens: 12, outputTokens: 7 },
      { type: 'done', stopReason: 'end' },
    ]);

    const body = stub.requests.at(-1)?.body as Record<string, unknown>;
    expect(body).toMatchObject({
      model: 'the-model',
      max_tokens: 256,
      system: 'Seja breve.',
      messages: chatRequest.messages,
      stream: true,
    });
    expect(body).not.toHaveProperty('temperature');
    expect(body).not.toHaveProperty('top_p');
  });

  it.each([
    ['max_tokens', 'max_tokens'],
    ['refusal', 'refusal'],
    ['end_turn', 'end'],
  ] as const)('maps stop reason %s to %s', async (stopReason, expected) => {
    const stub = await track(anthropicStub({ stopReason }));
    expect((await collect(provider(stub.url))).at(-1)).toEqual({
      type: 'done',
      stopReason: expected,
    });
  });

  it('never falls back to credentials of its own when it has no key', async () => {
    const stub = await track(anthropicStub());
    const keyless = provider(stub.url, null);
    expect((await failure(keyless.listModels())).kind).toBe('unauthorized');
    expect((await failure(collect(keyless))).kind).toBe('unauthorized');
    // Nothing was sent at all, so nothing could be leaked.
    expect(stub.requests).toEqual([]);
  });

  it('sends only the configured key', async () => {
    const stub = await track(anthropicStub());
    await provider(stub.url).listModels();
    const headers = stub.requests[0]?.headers ?? {};
    expect([headers.authorization, headers['x-api-key']]).toContain('Bearer sk-ant-test-key');
  });

  it('maps a rejected key and an unreachable server', async () => {
    const stub = await track(anthropicStub({ requireKey: 'another-key' }));
    const unauthorized = await failure(provider(stub.url).listModels());
    expect(unauthorized.kind).toBe('unauthorized');
    expect(unauthorized.message).not.toContain('sk-ant-test-key');

    expect((await failure(provider(await unusedUrl()).testConnection())).kind).toBe('unreachable');
  });
});

describe('createProvider', () => {
  it('builds the adapter for each kind', () => {
    const settings = { baseUrl: 'http://127.0.0.1:1', apiKey: 'k' };
    expect(createProvider({ ...settings, kind: 'ollama' })).toBeInstanceOf(OllamaProvider);
    expect(createProvider({ ...settings, kind: 'openai_compatible' })).toBeInstanceOf(
      OpenAiCompatibleProvider,
    );
    expect(createProvider({ ...settings, kind: 'anthropic' })).toBeInstanceOf(AnthropicProvider);
  });
});
