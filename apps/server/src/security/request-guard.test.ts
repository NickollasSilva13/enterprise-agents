import { describe, expect, it } from 'vitest';
import { ForbiddenError } from '../core/errors';
import { assertTrustedRequest, type RequestFacts } from './request-guard';

const config = {
  allowedHosts: ['127.0.0.1:4317', 'localhost:4317'],
  allowedOrigins: ['http://127.0.0.1:4317', 'http://localhost:4317'],
};

const request = (overrides: Partial<RequestFacts> = {}): RequestFacts => ({
  method: 'GET',
  path: '/api/health',
  host: '127.0.0.1:4317',
  origin: undefined,
  secFetchSite: 'same-origin',
  ...overrides,
});

const codeOf = (facts: RequestFacts): string | null => {
  try {
    assertTrustedRequest(facts, config);
    return null;
  } catch (error) {
    if (error instanceof ForbiddenError) return error.code;
    throw error;
  }
};

describe('assertTrustedRequest', () => {
  it('accepts a same-origin read', () => {
    expect(codeOf(request())).toBeNull();
  });

  it('accepts a same-origin write with an allowed Origin', () => {
    expect(codeOf(request({ method: 'POST', origin: 'http://127.0.0.1:4317' }))).toBeNull();
  });

  it('accepts requests without Sec-Fetch-Site (non-browser clients, old browsers)', () => {
    expect(codeOf(request({ secFetchSite: undefined }))).toBeNull();
  });

  it('accepts a direct navigation (Sec-Fetch-Site: none)', () => {
    expect(codeOf(request({ secFetchSite: 'none' }))).toBeNull();
  });

  it('compares the Host header case-insensitively', () => {
    expect(codeOf(request({ host: 'LOCALHOST:4317' }))).toBeNull();
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['a foreign domain (DNS rebinding)', 'evil.example'],
    ['a foreign domain on the same port', 'evil.example:4317'],
    ['loopback on another port', '127.0.0.1:9999'],
    ['loopback without a port', '127.0.0.1'],
    ['a LAN address', '192.168.0.10:4317'],
    ['a lookalike suffix', '127.0.0.1:4317.evil.example'],
  ])('rejects a Host header that is %s (C-02)', (_label, host) => {
    expect(codeOf(request({ host }))).toBe('host_not_allowed');
  });

  it('checks the Host header on static paths too', () => {
    expect(codeOf(request({ path: '/', host: 'evil.example' }))).toBe('host_not_allowed');
  });

  it.each(['cross-site', 'same-site'])('rejects API calls with Sec-Fetch-Site: %s', (site) => {
    expect(codeOf(request({ secFetchSite: site }))).toBe('cross_site_request');
  });

  it('does not apply API rules to static paths', () => {
    expect(codeOf(request({ path: '/assets/app.js', secFetchSite: 'cross-site' }))).toBeNull();
    expect(codeOf(request({ path: '/apiary', secFetchSite: 'cross-site' }))).toBeNull();
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'post'])(
    'rejects %s without an Origin header (C-03)',
    (method) => {
      expect(codeOf(request({ method }))).toBe('origin_not_allowed');
    },
  );

  it.each([
    'https://evil.example',
    'http://127.0.0.1:3000',
    'http://localhost:5173',
    'https://127.0.0.1:4317',
    'null',
  ])('rejects a write from Origin %s (C-03)', (origin) => {
    expect(codeOf(request({ method: 'POST', origin }))).toBe('origin_not_allowed');
  });
});
