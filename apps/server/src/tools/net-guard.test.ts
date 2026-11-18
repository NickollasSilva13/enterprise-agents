import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFetchUrlTool } from './builtin/fetch-url';
import {
  fetchPublicUrl,
  htmlToText,
  isBlockedAddress,
  NetGuardError,
  type NetGuardOptions,
} from './net-guard';
import type { ToolContext } from './types';

const signal = () => new AbortController().signal;

describe('isBlockedAddress (C-19)', () => {
  it.each([
    '127.0.0.1',
    '127.255.255.254',
    '0.0.0.0',
    '10.0.0.1',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '224.0.0.1',
    '255.255.255.255',
    '::1',
    '::',
    'fe80::1',
    'fc00::1',
    'fd12:3456::1',
    'ff02::1',
    '::ffff:127.0.0.1',
    '::ffff:10.0.0.1',
    '64:ff9b::7f00:1',
    'not-an-address',
    '',
  ])('blocks %s', (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each(['8.8.8.8', '1.1.1.1', '172.32.0.1', '192.167.1.1', '2606:4700:4700::1111'])(
    'accepts %s',
    (address) => {
      expect(isBlockedAddress(address)).toBe(false);
    },
  );
});

describe('fetchPublicUrl (C-19)', () => {
  let server: Server;
  let port: number;
  const hits: string[] = [];

  beforeAll(async () => {
    server = createServer((request, response) => {
      hits.push(request.url ?? '');
      const url = request.url ?? '';
      if (url === '/page') {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end(
          '<html><head><title>T</title><script>alert(1)</script></head><body><h1>Olá</h1><p>Mundo &amp; cia</p></body></html>',
        );
      } else if (url === '/json') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end('{"ok":true}');
      } else if (url === '/big') {
        response.writeHead(200, { 'content-type': 'text/plain' });
        response.end('a'.repeat(50_000));
      } else if (url === '/image') {
        response.writeHead(200, { 'content-type': 'image/png' });
        response.end('PNG');
      } else if (url === '/slow') {
        // Never answers.
      } else if (url === '/to-internal') {
        response.writeHead(302, { location: 'http://internal.test/admin' });
        response.end();
      } else if (url === '/to-loopback') {
        response.writeHead(302, { location: 'http://127.0.0.2:1/' });
        response.end();
      } else if (url === '/to-file') {
        response.writeHead(302, { location: 'file:///C:/Windows/win.ini' });
        response.end();
      } else if (url === '/to-page') {
        response.writeHead(301, { location: '/page' });
        response.end();
      } else if (url === '/loop') {
        response.writeHead(302, { location: '/loop' });
        response.end();
      } else {
        response.writeHead(404, { 'content-type': 'text/plain' });
        response.end('nada aqui');
      }
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => {
    server.closeAllConnections();
    server.close();
  });

  /**
   * The stub listens on loopback, which the guard blocks. Tests reach it by
   * a made-up public name, and only 127.0.0.1 is let through: every other
   * rule stays as in production.
   */
  const options = (): NetGuardOptions => ({
    resolve: async (hostname) => {
      if (hostname === 'public.test') return [{ address: '127.0.0.1', family: 4 }];
      if (hostname === 'internal.test') return [{ address: '10.0.0.5', family: 4 }];
      if (hostname === 'mixed.test') {
        return [
          { address: '8.8.8.8', family: 4 },
          { address: '192.168.0.10', family: 4 },
        ];
      }
      throw new Error('ENOTFOUND');
    },
    isBlocked: (address) => address !== '127.0.0.1' && isBlockedAddress(address),
    timeoutMs: 400,
    maxBytes: 10_000,
  });
  const fetchIt = (path: string) =>
    fetchPublicUrl(`http://public.test:${port}${path}`, signal(), options());

  it('fetches a public page', async () => {
    const page = await fetchIt('/page');
    expect(page.status).toBe(200);
    expect(htmlToText(page.body)).toBe('Olá\nMundo & cia');
    expect((await fetchIt('/json')).body).toBe('{"ok":true}');
  });

  it('follows a redirect to another public address', async () => {
    const page = await fetchIt('/to-page');
    expect(page.url).toBe(`http://public.test:${port}/page`);
  });

  it.each([
    ['http://127.0.0.1/', 'rede local'],
    ['http://localhost/', 'resolver'], // the test resolver does not know it; see below
    ['http://[::1]/', 'rede local'],
    ['http://2130706433/', 'rede local'], // 127.0.0.1 written as a number
    ['http://0x7f.1/', 'rede local'],
    ['http://169.254.169.254/latest/meta-data/', 'rede local'],
    ['http://192.168.0.1/', 'rede local'],
    ['http://internal.test/', 'rede local'],
    ['http://mixed.test/', 'rede local'],
    ['http://[::ffff:127.0.0.1]/', 'rede local'],
    ['ftp://public.test/arquivo', 'http e https'],
    ['file:///C:/Windows/win.ini', 'http e https'],
    ['javascript:alert(1)', 'http e https'],
    ['http://user:pass@public.test/', 'usuário ou senha'],
    ['não é uma url', 'URL válida'],
  ])('refuses %s', async (url, message) => {
    const before = hits.length;
    // No override of isBlocked here: the production rules, loopback included.
    const { resolve, timeoutMs } = options();
    await expect(
      fetchPublicUrl(url, signal(), {
        ...(resolve ? { resolve } : {}),
        timeoutMs: timeoutMs ?? 400,
      }),
    ).rejects.toThrow(message);
    expect(hits.length).toBe(before);
  });

  it('refuses names that resolve to this machine with the system resolver', async () => {
    await expect(fetchPublicUrl('http://localhost:1/', signal())).rejects.toThrow(NetGuardError);
  });

  it('checks every redirect again', async () => {
    await expect(fetchIt('/to-internal')).rejects.toThrow('rede local');
    await expect(fetchIt('/to-loopback')).rejects.toThrow('rede local');
    await expect(fetchIt('/to-file')).rejects.toThrow('http e https');
    await expect(fetchIt('/loop')).rejects.toThrow('Redirecionamentos demais');
  });

  it('bounds size, time and content type', async () => {
    const big = await fetchIt('/big');
    expect(big.truncated).toBe(true);
    expect(big.body.length).toBe(10_000);

    await expect(fetchIt('/slow')).rejects.toThrow('não respondeu');
    await expect(fetchIt('/image')).rejects.toThrow('não é texto');
  });

  it('stops when the run is cancelled', async () => {
    const controller = new AbortController();
    const pending = fetchPublicUrl(`http://public.test:${port}/slow`, controller.signal, {
      ...options(),
      timeoutMs: 5000,
    });
    setTimeout(() => controller.abort(), 30);
    await expect(pending).rejects.toThrow('interrompida');
  });

  it('as a tool: returns text, or an error the model can read', async () => {
    const tool = createFetchUrlTool(options());
    const context: ToolContext = {
      agentId: 'a',
      runId: 'r',
      workspaceDir: 'unused',
      area: null,
      task: null,
      signal: signal(),
      delegate: async () => ({ content: '' }),
    };
    expect(await tool.execute({ url: `http://public.test:${port}/page` }, context)).toEqual({
      content: 'Olá\nMundo & cia',
    });
    expect(await tool.execute({ url: 'http://192.168.0.1/' }, context)).toMatchObject({
      isError: true,
    });
    const missing = await tool.execute({ url: `http://public.test:${port}/nope` }, context);
    expect(missing).toMatchObject({ isError: true });
    expect(missing.content).toContain('404');
  });
});

describe('htmlToText', () => {
  it('drops scripts, styles and tags, and decodes entities', () => {
    expect(
      htmlToText(
        '<style>p{}</style><p>a &lt;b&gt; &#65;&#x42; &nbsp;c</p><!-- x --><script>evil()</script><div>fim</div>',
      ),
    ).toBe('a <b> AB c\nfim');
  });
});
