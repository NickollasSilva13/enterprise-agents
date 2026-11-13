import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface StubRequest {
  readonly method: string;
  readonly path: string;
  readonly headers: IncomingMessage['headers'];
  /** Parsed JSON body, or undefined. */
  readonly body: unknown;
}

export type StubHandler = (request: StubRequest, response: ServerResponse) => void | Promise<void>;

export interface StubServer {
  readonly url: string;
  readonly requests: StubRequest[];
  close(): Promise<void>;
}

/** A real HTTP server on a free loopback port, standing in for a provider. */
export async function startStub(handler: StubHandler): Promise<StubServer> {
  const requests: StubRequest[] = [];
  const server = createServer((incoming, response) => {
    const chunks: Buffer[] = [];
    incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
    incoming.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      const request: StubRequest = {
        method: incoming.method ?? 'GET',
        path: incoming.url ?? '/',
        headers: incoming.headers,
        body: text ? (JSON.parse(text) as unknown) : undefined,
      };
      requests.push(request);
      Promise.resolve(handler(request, response)).catch(() => response.destroy());
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

export const sendJson = (response: ServerResponse, status: number, body: unknown) => {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
};

/** An address where nothing listens. */
export async function unusedUrl(): Promise<string> {
  const stub = await startStub(() => {});
  await stub.close();
  return stub.url;
}

// ---- Ollama ---------------------------------------------------------------

export interface OllamaStubOptions {
  /** Model name -> capabilities; `null` makes /api/show fail for that model. */
  models?: Record<string, string[] | null>;
  /** Text pieces streamed by /api/chat. */
  reply?: string[];
  doneReason?: string;
  /** Replaces the whole /api/chat behaviour. */
  chat?: StubHandler;
}

export function ollamaStub(options: OllamaStubOptions = {}): Promise<StubServer> {
  const models = options.models ?? { 'llama3.2:3b': ['completion', 'tools'] };
  return startStub((request, response) => {
    if (request.path === '/api/version') return sendJson(response, 200, { version: '0.40.16' });
    if (request.path === '/api/tags') {
      return sendJson(response, 200, { models: Object.keys(models).map((name) => ({ name })) });
    }
    if (request.path === '/api/show') {
      const name = (request.body as { model: string }).model;
      const capabilities = models[name];
      return capabilities
        ? sendJson(response, 200, { capabilities })
        : sendJson(response, 404, { error: 'not found' });
    }
    if (request.path === '/api/chat') {
      if (options.chat) return options.chat(request, response);
      response.writeHead(200, { 'content-type': 'application/x-ndjson' });
      for (const piece of options.reply ?? ['Olá', ', mundo']) {
        response.write(`${JSON.stringify({ message: { role: 'assistant', content: piece } })}\n`);
      }
      response.end(
        `${JSON.stringify({
          message: { role: 'assistant', content: '' },
          done: true,
          done_reason: options.doneReason ?? 'stop',
          prompt_eval_count: 11,
          eval_count: 5,
        })}\n`,
      );
      return;
    }
    return sendJson(response, 404, { error: 'unknown path' });
  });
}

// ---- OpenAI-compatible ----------------------------------------------------

export interface OpenAiStubOptions {
  /** When set, requests without this bearer token get a 401. */
  requireKey?: string;
  models?: string[];
  reply?: string[];
  finishReason?: string;
}

export function openAiStub(options: OpenAiStubOptions = {}): Promise<StubServer> {
  return startStub((request, response) => {
    const authorization = request.headers.authorization ?? '';
    if (options.requireKey && authorization !== `Bearer ${options.requireKey}`) {
      // Echoes what it received, as some servers do: the adapter must not leak it.
      return sendJson(response, 401, {
        error: { message: `Incorrect API key provided: ${authorization}` },
      });
    }
    if (request.path === '/v1/models') {
      return sendJson(response, 200, {
        data: (options.models ?? ['gpt-b', 'gpt-a']).map((id) => ({ id, object: 'model' })),
      });
    }
    if (request.path === '/v1/chat/completions') {
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      const send = (data: unknown) => response.write(`data: ${JSON.stringify(data)}\n\n`);
      for (const piece of options.reply ?? ['Olá', ', mundo']) {
        send({ choices: [{ delta: { content: piece }, finish_reason: null }] });
      }
      send({ choices: [{ delta: {}, finish_reason: options.finishReason ?? 'stop' }] });
      send({ choices: [], usage: { prompt_tokens: 9, completion_tokens: 4 } });
      response.end('data: [DONE]\n\n');
      return;
    }
    return sendJson(response, 404, { error: { message: 'unknown path' } });
  });
}

// ---- Anthropic ------------------------------------------------------------

export interface AnthropicStubOptions {
  requireKey?: string;
  reply?: string[];
  stopReason?: string;
}

export function anthropicStub(options: AnthropicStubOptions = {}): Promise<StubServer> {
  return startStub((request, response) => {
    // The SDK sends an API key as a bearer token; older releases used x-api-key.
    const presented = [request.headers.authorization, request.headers['x-api-key']];
    const accepted = [`Bearer ${options.requireKey}`, options.requireKey];
    if (options.requireKey && !presented.some((value) => accepted.includes(String(value)))) {
      return sendJson(response, 401, {
        type: 'error',
        error: { type: 'authentication_error', message: 'invalid x-api-key' },
      });
    }
    if (request.path.startsWith('/v1/models')) {
      return sendJson(response, 200, {
        data: [
          {
            type: 'model',
            id: 'claude-haiku-5-5',
            display_name: 'Claude Haiku 5.5',
            created_at: '2026-01-01T00:00:00Z',
          },
          {
            type: 'model',
            id: 'claude-opus-5-5',
            display_name: 'Claude Opus 5.5',
            created_at: '2026-01-01T00:00:00Z',
          },
        ],
        has_more: false,
        first_id: 'claude-haiku-5-5',
        last_id: 'claude-opus-5-5',
      });
    }
    if (request.path === '/v1/messages') {
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      const send = (data: { type: string }) =>
        response.write(`event: ${data.type}\ndata: ${JSON.stringify(data)}\n\n`);
      send({
        type: 'message_start',
        message: {
          id: 'msg_1',
          type: 'message',
          role: 'assistant',
          model: 'claude-haiku-5-5',
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 12, output_tokens: 1 },
        },
      } as { type: string });
      send({
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      } as { type: string });
      for (const piece of options.reply ?? ['Olá', ', mundo']) {
        send({
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: piece },
        } as { type: string });
      }
      send({ type: 'content_block_stop', index: 0 } as { type: string });
      send({
        type: 'message_delta',
        delta: { stop_reason: options.stopReason ?? 'end_turn', stop_sequence: null },
        usage: { output_tokens: 7 },
      } as { type: string });
      send({ type: 'message_stop' });
      response.end();
      return;
    }
    return sendJson(response, 404, {
      type: 'error',
      error: { type: 'not_found_error', message: 'unknown path' },
    });
  });
}
