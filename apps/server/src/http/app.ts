import { existsSync } from 'node:fs';
import { join } from 'node:path';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import type { SessionResponse } from '@ea/shared';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import type { AppConfig } from '../config/env';
import type { Database } from '../db/client';
import { registerAgentRoutes } from '../modules/agents/routes';
import { registerApprovalRoutes } from '../modules/approvals/routes';
import { registerConversationRoutes } from '../modules/conversations/routes';
import { registerDashboardRoutes } from '../modules/dashboard/routes';
import { registerModelRoutes } from '../modules/models/routes';
import { registerProjectRoutes } from '../modules/projects/routes';
import { registerProviderRoutes } from '../modules/providers/routes';
import { registerRunRoutes } from '../modules/runs/routes';
import { createRunsContext } from '../modules/runs/service';
import { registerHealthRoutes } from '../modules/health/routes';
import { registerOfficeRoutes } from '../modules/office/routes';
import { registerSystemRoutes } from '../modules/system/routes';
import { registerTaskRoutes } from '../modules/tasks/routes';
import { createTasksContext } from '../modules/tasks/service';
import { registerToolRoutes } from '../modules/tools/routes';
import { createBuiltinRegistry } from '../tools/builtin';
import type { ToolRegistry } from '../tools/registry';
import { createProvider, type ProviderFactory } from '../providers/factory';
import { SECURITY_HEADERS } from '../security/headers';
import { assertTrustedRequest, isApiPath } from '../security/request-guard';
import {
  createSessionToken,
  isValidSession,
  SESSION_COOKIE,
  SESSION_PATH,
} from '../security/session';
import type { SecretStore } from '../security/secret-store';
import { NotFoundError, UnauthorizedError } from '../core/errors';
import { errorHandler } from './error-handler';
import { SseHub } from './sse';

export interface AppDeps {
  readonly config: AppConfig;
  readonly database: Database;
  readonly version: string;
  readonly secrets: SecretStore;
  /** Overridable for tests; defaults to the real adapters. */
  readonly createProvider?: ProviderFactory;
  /** Overridable for tests; defaults to the built-in tools. */
  readonly toolRegistry?: ToolRegistry;
  /** Overridable for tests; defaults to a fresh random token. */
  readonly sessionToken?: string;
}

const BODY_LIMIT_BYTES = 1024 * 1024;

const pathOf = (url: string) => url.split('?', 1)[0] ?? url;

/**
 * The path the request guards must judge. The router decodes percent-escapes
 * before matching, so "/%61pi/agents" reaches the route "/api/agents": the
 * address as written would not look like an API path and every guard would
 * be skipped. The route that was matched is what counts; the written and the
 * decoded spellings are checked too, so that anything that could be an API
 * call is treated as one.
 */
function guardedPath(request: FastifyRequest): string {
  const route = request.routeOptions.url;
  if (route !== undefined && isApiPath(route)) return route;
  const written = pathOf(request.url);
  if (isApiPath(written)) return written;
  try {
    const decoded = decodeURIComponent(written);
    return isApiPath(decoded) ? decoded : written;
  } catch {
    return written;
  }
}

/**
 * Builds the HTTP application without listening, so tests can drive it with
 * `app.inject()` and add their own routes before `app.ready()`.
 */
export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { config } = deps;
  const sessionToken = deps.sessionToken ?? createSessionToken();

  const app = Fastify({
    logger: config.env === 'test' ? false : { level: config.logLevel },
    bodyLimit: BODY_LIMIT_BYTES,
  });

  app.setErrorHandler(errorHandler);
  await app.register(cookie);

  // First hook, so the headers are present on every response, refusals included.
  app.addHook('onRequest', async (request, reply) => {
    void reply.headers(SECURITY_HEADERS);
    if (isApiPath(guardedPath(request))) void reply.header('cache-control', 'no-store');
  });

  app.addHook('onRequest', async (request) => {
    assertTrustedRequest(
      {
        method: request.method,
        path: guardedPath(request),
        host: request.headers.host,
        origin: request.headers.origin,
        secFetchSite: request.headers['sec-fetch-site']?.toString(),
      },
      config,
    );
  });

  // Every API route except the one that issues the cookie requires it (C-04).
  app.addHook('onRequest', async (request) => {
    const path = guardedPath(request);
    if (!isApiPath(path) || path === SESSION_PATH) return;
    if (!isValidSession(request.cookies[SESSION_COOKIE], sessionToken)) {
      throw new UnauthorizedError();
    }
  });

  // POST, so the Origin allowlist applies before a cookie is handed out.
  app.post(SESSION_PATH, async (_request, reply): Promise<SessionResponse> => {
    void reply.setCookie(SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      sameSite: 'strict',
      path: '/',
    });
    return { ok: true };
  });

  registerHealthRoutes(app, { database: deps.database, version: deps.version });
  registerSystemRoutes(app, { config, version: deps.version, startedAt: new Date() });
  registerDashboardRoutes(app, { database: deps.database });
  registerProjectRoutes(app, { database: deps.database });
  const registry = deps.toolRegistry ?? createBuiltinRegistry();
  registerAgentRoutes(app, { database: deps.database, registry });
  registerModelRoutes(app, { database: deps.database });
  const providerFactory = deps.createProvider ?? createProvider;
  const logWarning = (context: Record<string, unknown>, message: string) =>
    app.log.warn(context, message);
  registerProviderRoutes(app, {
    db: deps.database.db,
    secrets: deps.secrets,
    createProvider: providerFactory,
    logWarning,
  });

  registerOfficeRoutes(app, { database: deps.database, registry });
  const runs = createRunsContext({
    db: deps.database.db,
    secrets: deps.secrets,
    createProvider: providerFactory,
    registry,
    workspacesDir: config.workspacesDir,
    areasDir: config.areasDir,
    tasks: { port: null },
    maxConcurrentRuns: config.maxConcurrentRuns,
    maxDelegationDepth: config.maxDelegationDepth,
    logWarning,
  });
  const sse = new SseHub();
  registerConversationRoutes(app, { runs });
  registerRunRoutes(app, { runs, sse });
  registerToolRoutes(app, { db: deps.database.db, registry, workspacesDir: config.workspacesDir });
  registerApprovalRoutes(app, { runs });
  const tasks = createTasksContext(runs, registry);
  registerTaskRoutes(app, { tasks });

  // Before the server stops accepting connections: interrupt what is running
  // (the runs are recorded as such) and end the event streams, which would
  // otherwise keep their sockets open for ever.
  app.addHook('preClose', async () => {
    await runs.manager.shutdown();
    sse.closeAll();
  });

  const webIndex = join(config.webDistDir, 'index.html');
  const serveWeb = config.env !== 'development' && existsSync(webIndex);
  if (serveWeb) {
    await app.register(fastifyStatic, { root: config.webDistDir });
  }

  app.setNotFoundHandler(async (request, reply) => {
    // Client-side routes of the single-page app fall back to index.html.
    if (serveWeb && request.method === 'GET' && !isApiPath(guardedPath(request))) {
      return reply.sendFile('index.html');
    }
    throw new NotFoundError();
  });

  return app;
}
