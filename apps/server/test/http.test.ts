import { createServer } from 'node:net';
import { networkInterfaces } from 'node:os';
import { apiErrorSchema, healthResponseSchema } from '@ea/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { loadConfig } from '../src/config/env';
import { parseInput } from '../src/http/error-handler';
import { MemorySecretStore } from '../src/security/secret-store';
import { buildApp } from '../src/http/app';
import {
  makeApp,
  makeDatabase,
  TEST_HOST,
  TEST_ORIGIN,
  TEST_SESSION_TOKEN,
  type TestApp,
} from './helpers';

let current: TestApp | undefined;

async function start(options?: Parameters<typeof makeApp>[0]): Promise<TestApp> {
  current = await makeApp(options);
  return current;
}

afterEach(async () => {
  await current?.close();
  current = undefined;
});

const errorOf = (body: string) => apiErrorSchema.parse(JSON.parse(body));

describe('session (C-04)', () => {
  it('refuses API routes without a session cookie', async () => {
    const { app } = await start();
    const response = await app.inject({ url: '/api/health', headers: { host: TEST_HOST } });
    expect(response.statusCode).toBe(401);
    expect(errorOf(response.body).code).toBe('unauthorized');
  });

  it('refuses a wrong session cookie', async () => {
    const { app } = await start();
    const response = await app.inject({
      url: '/api/health',
      headers: { host: TEST_HOST, cookie: 'ea_session=not-the-token' },
    });
    expect(response.statusCode).toBe(401);
  });

  it('issues an HttpOnly, SameSite=Strict cookie that then grants access', async () => {
    const { app } = await start();
    const session = await app.inject({
      method: 'POST',
      url: '/api/session',
      headers: { host: TEST_HOST, origin: TEST_ORIGIN, 'sec-fetch-site': 'same-origin' },
    });
    expect(session.statusCode).toBe(200);
    expect(session.json()).toEqual({ ok: true });

    const setCookie = String(session.headers['set-cookie']);
    expect(setCookie).toContain(`ea_session=${TEST_SESSION_TOKEN}`);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Strict');
    expect(setCookie).toContain('Path=/');
    // The token must never be readable by page scripts or returned in a body.
    expect(session.body).not.toContain(TEST_SESSION_TOKEN);

    const cookie = setCookie.split(';')[0]!;
    const health = await app.inject({ url: '/api/health', headers: { host: TEST_HOST, cookie } });
    expect(health.statusCode).toBe(200);
  });

  it('does not issue a session to another origin', async () => {
    const { app } = await start();
    for (const headers of [
      { host: TEST_HOST },
      { host: TEST_HOST, origin: 'https://evil.example' },
      { host: TEST_HOST, origin: 'http://127.0.0.1:3000' },
      { host: TEST_HOST, origin: TEST_ORIGIN, 'sec-fetch-site': 'cross-site' },
      { host: 'evil.example', origin: TEST_ORIGIN },
    ]) {
      const response = await app.inject({ method: 'POST', url: '/api/session', headers });
      expect(response.statusCode).toBe(403);
      expect(response.headers['set-cookie']).toBeUndefined();
    }
  });

  it('uses a different token on every server start', async () => {
    const database = makeDatabase();
    const config = loadConfig({ NODE_ENV: 'test' });
    const tokens: string[] = [];
    for (let i = 0; i < 2; i += 1) {
      const app = await buildApp({
        config,
        database,
        version: 'x',
        secrets: new MemorySecretStore(),
      });
      const response = await app.inject({
        method: 'POST',
        url: '/api/session',
        headers: { host: TEST_HOST, origin: TEST_ORIGIN },
      });
      tokens.push(String(response.headers['set-cookie']).split(';')[0]!);
      await app.close();
    }
    database.close();
    expect(tokens[0]).not.toBe(tokens[1]);
  });
});

describe('request origin (C-02, C-03)', () => {
  it('refuses an unexpected Host header even with a valid session', async () => {
    const { app, trusted } = await start();
    const response = await app.inject({
      url: '/api/health',
      headers: { ...trusted, host: 'evil.example' },
    });
    expect(response.statusCode).toBe(403);
    expect(errorOf(response.body).code).toBe('host_not_allowed');
  });

  it('refuses a cross-site read even with a valid session', async () => {
    const { app, trusted } = await start();
    const response = await app.inject({
      url: '/api/health',
      headers: { ...trusted, 'sec-fetch-site': 'cross-site' },
    });
    expect(response.statusCode).toBe(403);
    expect(errorOf(response.body).code).toBe('cross_site_request');
  });

  it('refuses a write from another origin even with a valid session', async () => {
    let handlerRan = false;
    const { app, trusted } = await start({
      configure: (instance) => {
        instance.post('/api/_test/write', async () => {
          handlerRan = true;
          return { ok: true };
        });
      },
    });

    const foreign = await app.inject({
      method: 'POST',
      url: '/api/_test/write',
      headers: { ...trusted, origin: 'https://evil.example' },
    });
    expect(foreign.statusCode).toBe(403);
    expect(errorOf(foreign.body).code).toBe('origin_not_allowed');
    expect(handlerRan).toBe(false);

    const own = await app.inject({ method: 'POST', url: '/api/_test/write', headers: trusted });
    expect(own.statusCode).toBe(200);
    expect(handlerRan).toBe(true);
  });

  it('accepts the dev UI origin in development only', async () => {
    const devOrigin = 'http://127.0.0.1:5173';
    const dev = await makeApp({ env: { NODE_ENV: 'development', LOG_LEVEL: 'silent' } });
    const allowed = await dev.app.inject({
      method: 'POST',
      url: '/api/session',
      headers: { host: TEST_HOST, origin: devOrigin },
    });
    await dev.close();
    expect(allowed.statusCode).toBe(200);

    const { app } = await start();
    const refused = await app.inject({
      method: 'POST',
      url: '/api/session',
      headers: { host: TEST_HOST, origin: devOrigin },
    });
    expect(refused.statusCode).toBe(403);
  });

  it('sends no CORS headers', async () => {
    const { app, trusted } = await start();
    const response = await app.inject({ url: '/api/health', headers: trusted });
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('health', () => {
  it('reports server and database status in the shared contract', async () => {
    const { app, trusted } = await start();
    const response = await app.inject({ url: '/api/health', headers: trusted });
    expect(response.statusCode).toBe(200);
    const health = healthResponseSchema.parse(response.json());
    expect(health).toMatchObject({ status: 'ok', database: 'ok', version: '0.0.0-test' });
  });

  it('reports a degraded status when the database is unavailable', async () => {
    const { app, trusted, database } = await start();
    database.sqlite.close();
    const response = await app.inject({ url: '/api/health', headers: trusted });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'degraded', database: 'error' });
  });
});

describe('error format (RNF-08, C-06)', () => {
  const bodySchema = z.object({ name: z.string().min(1).max(20), count: z.number().int() });

  const withRoutes = () =>
    start({
      configure: (instance) => {
        instance.post('/api/_test/echo', async (request) => parseInput(bodySchema, request.body));
        instance.get('/api/_test/boom', async () => {
          throw new Error('upstream said: api key sk-secret-123 is invalid');
        });
      },
    });

  it('returns validation errors with the offending fields', async () => {
    const { app, trusted } = await withRoutes();
    const response = await app.inject({
      method: 'POST',
      url: '/api/_test/echo',
      headers: trusted,
      payload: { name: '', count: 1.5 },
    });
    expect(response.statusCode).toBe(400);
    const error = errorOf(response.body);
    expect(error.code).toBe('validation_error');
    const paths = (error.details as { path: string }[]).map((detail) => detail.path);
    expect(paths.sort()).toEqual(['count', 'name']);
  });

  it('accepts valid input', async () => {
    const { app, trusted } = await withRoutes();
    const response = await app.inject({
      method: 'POST',
      url: '/api/_test/echo',
      headers: trusted,
      payload: { name: 'ok', count: 2 },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ name: 'ok', count: 2 });
  });

  it('returns a client error, not a server error, for malformed JSON', async () => {
    const { app, trusted } = await withRoutes();
    const response = await app.inject({
      method: 'POST',
      url: '/api/_test/echo',
      headers: { ...trusted, 'content-type': 'application/json' },
      payload: '{"name": ',
    });
    expect(response.statusCode).toBe(400);
    expect(errorOf(response.body).code).toBe('bad_request');
  });

  it('refuses bodies over the size limit', async () => {
    const { app, trusted } = await withRoutes();
    const response = await app.inject({
      method: 'POST',
      url: '/api/_test/echo',
      headers: trusted,
      payload: { name: 'x'.repeat(1024 * 1024 + 1), count: 1 },
    });
    expect(response.statusCode).toBe(413);
    expect(errorOf(response.body).code).toBe('payload_too_large');
  });

  it('hides the cause of unexpected errors', async () => {
    const { app, trusted } = await withRoutes();
    const response = await app.inject({ url: '/api/_test/boom', headers: trusted });
    expect(response.statusCode).toBe(500);
    expect(errorOf(response.body)).toEqual({
      code: 'internal_error',
      message: 'Erro interno do servidor.',
    });
    expect(response.body).not.toContain('sk-secret-123');
    expect(response.body).not.toContain('upstream');
  });

  it('returns the same format for unknown API routes', async () => {
    const { app, trusted } = await start();
    const response = await app.inject({ url: '/api/does-not-exist', headers: trusted });
    expect(response.statusCode).toBe(404);
    expect(errorOf(response.body).code).toBe('not_found');
  });
});

describe('network binding (C-01)', () => {
  const freePort = () =>
    new Promise<number>((resolve, reject) => {
      const probe = createServer();
      probe.once('error', reject);
      probe.listen(0, '127.0.0.1', () => {
        const address = probe.address();
        const port = typeof address === 'object' && address ? address.port : 0;
        probe.close(() => resolve(port));
      });
    });

  const lanAddress = () =>
    Object.values(networkInterfaces())
      .flat()
      .find((entry) => entry && entry.family === 'IPv4' && !entry.internal)?.address;

  it('listens on loopback only and is unreachable through the LAN address', async () => {
    const port = await freePort();
    const config = loadConfig({ NODE_ENV: 'test', APP_PORT: String(port) });
    const database = makeDatabase();
    const app = await buildApp({
      config,
      database,
      version: 'x',
      secrets: new MemorySecretStore(),
    });
    try {
      await app.listen({ host: config.host, port: config.port });
      expect(app.server.address()).toMatchObject({ address: '127.0.0.1', port });

      const loopback = await fetch(`http://127.0.0.1:${port}/api/health`);
      expect(loopback.status).toBe(401); // reachable, but no session

      const lan = lanAddress();
      if (lan) {
        await expect(
          fetch(`http://${lan}:${port}/api/health`, { signal: AbortSignal.timeout(3000) }),
        ).rejects.toThrow();
      }
    } finally {
      await app.close();
      database.close();
    }
  });
});
