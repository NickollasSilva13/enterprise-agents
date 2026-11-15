import type { Agent, DashboardSummary, RunSummary } from '@ea/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi } from 'vitest';
import { routes } from '../app/router';
import { resetSessionForTests } from '../lib/api';

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

export const noContent = () => new Response(null, { status: 204 });

export const emptySummary: DashboardSummary = {
  agents: { total: 0, active: 0, inactive: 0, failed: 0, working: 0, waiting: 0 },
  runs: {
    active: 0,
    waitingApproval: 0,
    last24h: {
      finished: 0,
      completed: 0,
      failed: 0,
      successRate: null,
      averageDurationMs: null,
      inputTokens: 0,
      outputTokens: 0,
    },
  },
  pendingApprovals: 0,
  providers: 0,
  recentRuns: [],
  activity: [],
  alerts: [],
  generatedAt: '2026-11-12T12:00:00.000Z',
};

export function makeAgent(overrides: Partial<Agent> & { id: string; name: string }): Agent {
  return {
    description: '',
    objective: '',
    systemPrompt: '',
    projectId: null,
    projectName: null,
    modelId: null,
    modelName: null,
    temperature: 0.7,
    maxOutputTokens: 4096,
    maxSteps: 20,
    maxDurationSeconds: 300,
    maxTotalTokens: null,
    enabled: true,
    state: 'idle',
    createdAt: '2026-11-12T12:00:00.000Z',
    updatedAt: '2026-11-12T12:00:00.000Z',
    ...overrides,
  };
}

export function makeRun(overrides: Partial<RunSummary> & { id: string }): RunSummary {
  return {
    agentId: 'a1',
    agentName: 'Triagem',
    agentDeleted: false,
    conversationId: 'c1',
    parentRunId: null,
    trigger: 'chat',
    status: 'completed',
    endReason: 'completed',
    errorMessage: null,
    inputTokens: 100,
    outputTokens: 20,
    createdAt: '2026-11-12T12:00:00.000Z',
    startedAt: '2026-11-12T12:00:00.000Z',
    finishedAt: '2026-11-12T12:00:03.000Z',
    durationMs: 3000,
    ...overrides,
  };
}

export interface RecordedRequest {
  readonly method: string;
  readonly url: string;
  /** Parsed JSON body, when one was sent. */
  readonly body: unknown;
}

type Handler = (request: RecordedRequest) => Response | Promise<Response>;

/**
 * Renders the real route tree at `path` against a scripted API.
 *
 * `api` maps "METHOD /path" (or just "/path", for any method) to a JSON body
 * or to a function returning a Response. A request with a query string also
 * matches the entry for its path alone. The session handshake the dashboard
 * summary used by the status strip and an empty approval queue are answered
 * for you.
 */
export function renderApp(path: string, api: Record<string, unknown>) {
  resetSessionForTests();
  const requests: RecordedRequest[] = [];
  const routesByKey: Record<string, unknown> = {
    '/api/dashboard/summary': emptySummary,
    '/api/approvals': { approvals: [] },
    ...api,
  };

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (url === '/api/session') return json(200, { ok: true });

      const request: RecordedRequest = {
        method,
        url,
        body: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
      };
      requests.push(request);

      const path = url.split('?', 1)[0] ?? url;
      const entry =
        routesByKey[`${method} ${url}`] ??
        routesByKey[`${method} ${path}`] ??
        (method === 'GET' ? (routesByKey[url] ?? routesByKey[path]) : undefined);
      if (entry === undefined) {
        return json(404, { code: 'not_found', message: `Sem resposta para ${method} ${url}.` });
      }
      return typeof entry === 'function' ? (entry as Handler)(request) : json(200, entry);
    }),
  );

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  /** Requests that changed something, in order. */
  const writes = () => requests.filter((request) => request.method !== 'GET');
  return { ...view, requests, writes, router };
}
