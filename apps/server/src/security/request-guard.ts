import type { AppConfig } from '../config/env';
import { ForbiddenError } from '../core/errors';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const SAME_ORIGIN_FETCH_SITES = new Set(['same-origin', 'none']);

export interface RequestFacts {
  readonly method: string;
  readonly path: string;
  readonly host: string | undefined;
  readonly origin: string | undefined;
  readonly secFetchSite: string | undefined;
}

export function isApiPath(path: string): boolean {
  return path === '/api' || path.startsWith('/api/');
}

/**
 * Rejects requests that did not come from this application's own page.
 *
 * - Host allowlist stops DNS rebinding: a hostile domain resolving to
 *   127.0.0.1 still sends its own name in the Host header (C-02).
 * - Sec-Fetch-Site stops other sites, including other local ports, from
 *   calling the API. A SameSite cookie alone would not: every localhost
 *   port is the same "site".
 * - Origin allowlist on state-changing requests stops CSRF (C-03). Browsers
 *   always send Origin on those, so a missing header is refused too.
 */
export function assertTrustedRequest(
  request: RequestFacts,
  config: Pick<AppConfig, 'allowedHosts' | 'allowedOrigins'>,
): void {
  const host = request.host?.toLowerCase();
  if (!host || !config.allowedHosts.includes(host)) {
    throw new ForbiddenError('host_not_allowed', 'Cabeçalho Host não permitido.');
  }

  if (!isApiPath(request.path)) return;

  if (request.secFetchSite !== undefined && !SAME_ORIGIN_FETCH_SITES.has(request.secFetchSite)) {
    throw new ForbiddenError('cross_site_request', 'Requisição de outra origem não permitida.');
  }

  if (!SAFE_METHODS.has(request.method.toUpperCase())) {
    if (!request.origin || !config.allowedOrigins.includes(request.origin.toLowerCase())) {
      throw new ForbiddenError('origin_not_allowed', 'Origem da requisição não permitida.');
    }
  }
}
