import type { ZodType } from 'zod';
import { errorKindForStatus, ProviderError } from './types';

const DETAIL_LIMIT = 500;

export interface RequestOptions {
  readonly method?: 'GET' | 'POST';
  readonly headers?: Record<string, string>;
  readonly body?: unknown;
  readonly signal?: AbortSignal | undefined;
  /** Time allowed for the response headers to arrive. */
  readonly timeoutMs: number;
}

/** Joins a base URL and a path without doubling or dropping the slash. */
export function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

function toProviderError(error: unknown, callerSignal?: AbortSignal): ProviderError {
  if (error instanceof ProviderError) return error;
  if (callerSignal?.aborted) return new ProviderError('cancelled');
  const name = error instanceof Error ? error.name : '';
  if (name === 'TimeoutError' || name === 'AbortError') return new ProviderError('timeout');
  const detail = error instanceof Error ? error.message : String(error);
  return new ProviderError('unreachable', undefined, detail.slice(0, DETAIL_LIMIT));
}

/**
 * Sends a request and returns the response once the status is known to be
 * successful. Network failures, timeouts and error statuses all become
 * `ProviderError`.
 */
export async function request(url: string, options: RequestOptions): Promise<Response> {
  const timeout = AbortSignal.timeout(options.timeoutMs);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? 'GET',
      headers: {
        ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...options.headers,
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      signal,
      // A provider must not bounce the request, and its credential, elsewhere.
      redirect: 'error',
    });
  } catch (error) {
    throw toProviderError(error, options.signal);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new ProviderError(
      errorKindForStatus(response.status),
      response.status,
      detail.slice(0, DETAIL_LIMIT),
    );
  }
  return response;
}

/** Requests JSON and validates it: provider responses are untrusted input. */
export async function requestJson<T>(
  url: string,
  schema: ZodType<T>,
  options: RequestOptions,
): Promise<T> {
  const response = await request(url, options);
  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    throw options.signal?.aborted
      ? new ProviderError('cancelled')
      : new ProviderError('invalid_response', response.status, String(error));
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ProviderError('invalid_response', response.status, parsed.error.message);
  }
  return parsed.data;
}

/** Yields the lines of a streamed response body, without the line breaks. */
export async function* readLines(response: Response, signal?: AbortSignal): AsyncGenerator<string> {
  if (!response.body) throw new ProviderError('invalid_response', response.status, 'empty body');
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      let newline = buffer.indexOf('\n');
      while (newline >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/, '');
        buffer = buffer.slice(newline + 1);
        if (line !== '') yield line;
        newline = buffer.indexOf('\n');
      }
    }
    if (buffer.trim() !== '') yield buffer;
  } catch (error) {
    throw toProviderError(error, signal);
  } finally {
    await reader.cancel().catch(() => {});
  }
}

/** Parses one streamed JSON line against a schema. */
export function parseChunk<T>(line: string, schema: ZodType<T>): T {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    throw new ProviderError('invalid_response', undefined, line.slice(0, DETAIL_LIMIT));
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ProviderError('invalid_response', undefined, parsed.error.message);
  }
  return parsed.data;
}
