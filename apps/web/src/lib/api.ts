import { apiErrorSchema } from '@ea/shared';
import type { ZodType } from 'zod';

export interface FieldIssue {
  readonly path: string;
  readonly message: string;
}

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }

  /** Per-field problems of a validation error, if the server sent them. */
  get fieldIssues(): FieldIssue[] {
    if (!Array.isArray(this.details)) return [];
    return this.details.filter(
      (detail): detail is FieldIssue =>
        typeof detail === 'object' &&
        detail !== null &&
        typeof (detail as FieldIssue).path === 'string' &&
        typeof (detail as FieldIssue).message === 'string',
    );
  }
}

let session: Promise<void> | null = null;

async function openSession(): Promise<void> {
  const response = await fetch('/api/session', { method: 'POST', credentials: 'same-origin' });
  if (!response.ok) throw await toError(response);
}

/** The server issues an HttpOnly session cookie; every other API call needs it. */
export function ensureSession(renew = false): Promise<void> {
  if (!session || renew) {
    session = openSession().catch((error: unknown) => {
      session = null;
      throw error;
    });
  }
  return session;
}

async function toError(response: Response): Promise<ApiRequestError> {
  const body: unknown = await response.json().catch(() => null);
  const parsed = apiErrorSchema.safeParse(body);
  if (parsed.success) {
    const { code, message, details } = parsed.data;
    return new ApiRequestError(response.status, code, message, details);
  }
  return new ApiRequestError(response.status, 'unknown_error', 'Erro inesperado do servidor.');
}

/** The session token changes when the server restarts, so a 401 is retried once. */
async function request(path: string, init?: RequestInit): Promise<Response> {
  const send = () => fetch(path, { ...init, credentials: 'same-origin' });

  await ensureSession();
  let response = await send();
  if (response.status === 401) {
    await ensureSession(true);
    response = await send();
  }
  if (!response.ok) throw await toError(response);
  return response;
}

/** Reads from the local API and validates the response against the shared contract. */
export async function apiFetch<T>(
  path: string,
  schema: ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  const response = await request(path, init);
  return schema.parse(await response.json());
}

/** Sends a JSON body (or none) and validates the JSON answer. */
export function apiSend<T>(
  method: 'POST' | 'PATCH' | 'PUT',
  path: string,
  schema: ZodType<T>,
  body?: unknown,
): Promise<T> {
  return apiFetch(
    path,
    schema,
    body === undefined
      ? { method }
      : { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
  );
}

export async function apiDelete(path: string): Promise<void> {
  await request(path, { method: 'DELETE' });
}

/** Test helper: forget the cached session. */
export function resetSessionForTests(): void {
  session = null;
}
