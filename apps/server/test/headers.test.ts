import { afterEach, describe, expect, it } from 'vitest';
import { CONTENT_SECURITY_POLICY } from '../src/security/headers';
import { makeApp, type TestApp } from './helpers';

let current: TestApp | undefined;
afterEach(async () => {
  await current?.close();
  current = undefined;
});

describe('security headers (C-05)', () => {
  it('allows only same-origin resources and forbids inline code and framing', () => {
    const directives: Record<string, string> = Object.fromEntries(
      CONTENT_SECURITY_POLICY.split('; ').map((directive) => {
        const [name, ...values] = directive.split(' ');
        return [name ?? '', values.join(' ')] as const;
      }),
    );
    expect(directives).toMatchObject({
      'default-src': "'self'",
      'script-src': "'self'",
      'style-src': "'self'",
      'connect-src': "'self'",
      'object-src': "'none'",
      'base-uri': "'none'",
      'frame-ancestors': "'none'",
    });
    expect(CONTENT_SECURITY_POLICY).not.toContain('unsafe-inline');
    expect(CONTENT_SECURITY_POLICY).not.toContain('unsafe-eval');
    expect(CONTENT_SECURITY_POLICY).not.toMatch(/https?:|\*/);
  });

  it('are sent on successful responses, errors and refusals alike', async () => {
    current = await makeApp();
    const { app, trusted } = current;
    const responses = await Promise.all([
      app.inject({ url: '/api/health', headers: trusted }),
      app.inject({ url: '/api/missing', headers: trusted }),
      app.inject({ url: '/api/health', headers: { host: trusted.host! } }),
      app.inject({ url: '/api/health', headers: { ...trusted, host: 'evil.example' } }),
    ]);
    expect(responses.map((response) => response.statusCode)).toEqual([200, 404, 401, 403]);

    for (const response of responses) {
      expect(response.headers['content-security-policy']).toBe(CONTENT_SECURITY_POLICY);
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['referrer-policy']).toBe('no-referrer');
    }
  });

  it('tell the browser not to cache API responses', async () => {
    current = await makeApp();
    const { app, trusted } = current;
    const response = await app.inject({ url: '/api/dashboard/summary', headers: trusted });
    expect(response.headers['cache-control']).toBe('no-store');
  });
});
