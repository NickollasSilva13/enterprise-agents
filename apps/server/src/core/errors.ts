// Errors that are safe to show to the client. Any layer may throw them;
// only the HTTP layer knows how to turn them into responses.

export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(details: unknown, message = 'Os dados enviados são inválidos.') {
    super(400, 'validation_error', message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Sessão ausente ou inválida.') {
    super(401, 'unauthorized', message);
  }
}

export class ForbiddenError extends AppError {
  constructor(code: string, message: string) {
    super(403, code, message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Recurso não encontrado.') {
    super(404, 'not_found', message);
  }
}

/** A provider (model service) failed. The message must already be safe to show. */
export class UpstreamError extends AppError {
  constructor(message: string) {
    super(502, 'provider_error', message);
  }
}

export class ConflictError extends AppError {
  constructor(code: string, message: string, details?: unknown) {
    super(409, code, message, details);
  }
}
