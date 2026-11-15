import type { FastifyReply, FastifyRequest } from 'fastify';
import { describe, expect, it } from 'vitest';
import { errorHandler } from './error-handler';

function handle(error: Error) {
  const logged: unknown[] = [];
  const sent: { status?: number; body?: unknown } = {};
  const request = {
    log: { error: (context: unknown) => logged.push(context) },
  } as unknown as FastifyRequest;
  const reply = {
    status(code: number) {
      sent.status = code;
      return this;
    },
    send(body: unknown) {
      sent.body = body;
      return this;
    },
  } as unknown as FastifyReply;
  errorHandler(error, request, reply);
  return { logged: JSON.stringify(logged), sent };
}

describe('errorHandler', () => {
  it('logs an unexpected error without any credential that was in its text (C-10)', () => {
    const error = new Error(
      'upstream refused: Authorization: Bearer abcdef1234567890 and key sk-secret-1234567890',
    );
    const { logged, sent } = handle(error);

    expect(sent).toEqual({
      status: 500,
      body: { code: 'internal_error', message: 'Erro interno do servidor.' },
    });
    expect(logged).toContain('upstream refused');
    expect(logged).toContain('[redacted]');
    expect(logged).not.toContain('abcdef1234567890');
    expect(logged).not.toContain('sk-secret-1234567890');
  });
});
