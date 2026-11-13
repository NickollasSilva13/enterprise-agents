import { ApiRequestError } from './api';

/** A sentence the user can act on, for any failure of an API call. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) return error.message;
  if (error instanceof TypeError) {
    return 'O servidor local não respondeu. Verifique se ele está em execução.';
  }
  return 'A resposta do servidor veio em um formato inesperado.';
}

/** Field name -> first message, from a validation error; empty for other errors. */
export function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiRequestError)) return {};
  const result: Record<string, string> = {};
  for (const issue of error.fieldIssues) result[issue.path] ??= issue.message;
  // A name clash is a problem with the name field, wherever it came from.
  if (error.code === 'name_taken') result.name = error.message;
  return result;
}
