import type { ApiError } from '@ea/shared';
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { z, type ZodType } from 'zod';
import { AppError, ValidationError } from '../core/errors';
import { redactSecrets } from '../security/redact';

/** Validates untrusted input at the HTTP boundary (SECURITY C-06). */
export function parseInput<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ValidationError(
      result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }
  return result.data;
}

/** Route parameter `:id`. */
export const idParamSchema = z.object({ id: z.string().min(1).max(40) });

const CLIENT_ERRORS: Record<number, ApiError> = {
  413: { code: 'payload_too_large', message: 'O conteúdo enviado é grande demais.' },
  415: { code: 'unsupported_media_type', message: 'Tipo de conteúdo não suportado.' },
};
const BAD_REQUEST: ApiError = { code: 'bad_request', message: 'Requisição inválida.' };
const INTERNAL_ERROR: ApiError = { code: 'internal_error', message: 'Erro interno do servidor.' };

/**
 * Single place where errors become HTTP responses (RNF-08).
 * Anything that is not an AppError is logged and replaced by a generic
 * message, so stack traces and upstream error text never reach the client.
 */
export function errorHandler(
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  if (error instanceof AppError) {
    const body: ApiError = { code: error.code, message: error.message };
    if (error.details !== undefined) body.details = error.details;
    void reply.status(error.statusCode).send(body);
    return;
  }

  const statusCode = 'statusCode' in error ? error.statusCode : undefined;
  if (typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500) {
    void reply.status(statusCode).send(CLIENT_ERRORS[statusCode] ?? BAD_REQUEST);
    return;
  }

  // The text of an unexpected error is not ours: anything shaped like a
  // credential is removed before it reaches the log (C-10).
  request.log.error(
    {
      err: {
        type: error.name,
        message: redactSecrets(error.message),
        stack: error.stack ? redactSecrets(error.stack) : undefined,
      },
    },
    'unhandled error',
  );
  void reply.status(500).send(INTERNAL_ERROR);
}
