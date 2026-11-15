import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP } from 'node:net';

/** A URL the agent may not fetch. The message is shown to the model. */
export class NetGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetGuardError';
  }
}

export interface ResolvedAddress {
  readonly address: string;
  readonly family: 4 | 6;
}

export interface NetGuardOptions {
  /** Overridable for tests; defaults to the system resolver. */
  readonly resolve?: (hostname: string) => Promise<ResolvedAddress[]>;
  /** Overridable for tests; defaults to `isBlockedAddress`. */
  readonly isBlocked?: (address: string) => boolean;
  readonly timeoutMs?: number;
  readonly maxBytes?: number;
  readonly maxRedirects?: number;
}

export interface FetchedPage {
  readonly url: string;
  readonly status: number;
  readonly contentType: string;
  readonly body: string;
  readonly truncated: boolean;
}

// Everything that is not the public internet: this machine, the local
// network, link-local (which includes cloud metadata at 169.254.169.254),
// carrier NAT, documentation and multicast ranges.
const blocked = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blocked.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [
  ['::', 127], // unspecified and loopback
  ['64:ff9b::', 96], // NAT64
  ['2001::', 32], // Teredo
  ['2002::', 16], // 6to4
  ['fc00::', 7], // unique local
  ['fe80::', 10], // link-local
  ['ff00::', 8], // multicast
] as const) {
  blocked.addSubnet(network, prefix, 'ipv6');
}

/** True for any address that is not on the public internet (SECURITY C-19). */
export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return true;
  if (family === 4) return blocked.check(address, 'ipv4');
  // An IPv4 address dressed as IPv6 has no business in a public URL, and
  // would otherwise reach the IPv4 ranges above by another spelling.
  if (/^(::ffff:|0{1,4}(:0{1,4}){4}:ffff:)/i.test(address)) return true;
  return blocked.check(address, 'ipv6');
}

async function systemResolve(hostname: string): Promise<ResolvedAddress[]> {
  const found = await dnsLookup(hostname, { all: true });
  return found.map(({ address, family }) => ({ address, family: family === 6 ? 6 : 4 }));
}

const TEXT_TYPES = /^(text\/|application\/(json|xml|xhtml\+xml|[a-z0-9.+-]+\+(json|xml))\b)/i;

/**
 * Checks one URL and returns the address the request must connect to. Every
 * address the name resolves to has to be public: a name that answers with one
 * public and one private address is refused.
 */
async function vet(url: URL, options: NetGuardOptions): Promise<ResolvedAddress> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new NetGuardError('Só são aceitos endereços http e https.');
  }
  if (url.username !== '' || url.password !== '') {
    throw new NetGuardError('O endereço não pode conter usuário ou senha.');
  }
  const isBlocked = options.isBlocked ?? isBlockedAddress;
  // WHATWG URL keeps IPv6 literals in brackets.
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const literal = isIP(hostname);

  let addresses: ResolvedAddress[];
  if (literal !== 0) {
    addresses = [{ address: hostname, family: literal === 6 ? 6 : 4 }];
  } else {
    try {
      addresses = await (options.resolve ?? systemResolve)(hostname);
    } catch {
      throw new NetGuardError('Não foi possível resolver o nome do servidor.');
    }
  }
  const first = addresses[0];
  if (!first) throw new NetGuardError('Não foi possível resolver o nome do servidor.');
  if (addresses.some(({ address }) => isBlocked(address))) {
    throw new NetGuardError(
      'Este endereço aponta para esta máquina ou para a rede local, e não pode ser acessado.',
    );
  }
  return first;
}

interface RawResponse {
  readonly status: number;
  readonly headers: IncomingMessage['headers'];
  readonly body: Buffer;
  readonly truncated: boolean;
}

/** One request, with no redirect following, connected to `target` and nowhere else. */
function requestOnce(
  url: URL,
  target: ResolvedAddress,
  maxBytes: number,
  signal: AbortSignal,
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const request = send(
      url,
      {
        method: 'GET',
        signal,
        agent: false,
        headers: {
          accept: 'text/html, text/plain, application/json, application/xml;q=0.9, text/*;q=0.8',
          'user-agent': 'EnterpriseAgents/1.0',
        },
        // The name is not resolved again: the connection goes to the address
        // that was checked, so a second DNS answer cannot redirect it (rebinding).
        lookup: (_hostname, lookupOptions, callback) => {
          if (typeof lookupOptions === 'object' && lookupOptions.all) {
            callback(null, [{ address: target.address, family: target.family }]);
          } else {
            callback(null, target.address, target.family);
          }
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          response.resume();
          resolve({ status, headers: response.headers, body: Buffer.alloc(0), truncated: false });
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        let truncated = false;
        response.on('data', (chunk: Buffer) => {
          if (truncated) return;
          const room = maxBytes - size;
          if (chunk.length > room) {
            chunks.push(chunk.subarray(0, room));
            truncated = true;
            // Enough was read: stop the download instead of draining it.
            response.destroy();
            resolve({ status, headers: response.headers, body: Buffer.concat(chunks), truncated });
            return;
          }
          chunks.push(chunk);
          size += chunk.length;
        });
        response.on('end', () => {
          if (!truncated) {
            resolve({ status, headers: response.headers, body: Buffer.concat(chunks), truncated });
          }
        });
        response.on('error', (error) => {
          if (!truncated) reject(error);
        });
      },
    );
    request.on('error', reject);
    request.end();
  });
}

/**
 * Fetches a public web address as text (SECURITY C-19). Refuses anything
 * that is not http/https or that leads to this machine or the local network,
 * checks every redirect the same way, and bounds time and size.
 */
export async function fetchPublicUrl(
  rawUrl: string,
  signal: AbortSignal,
  options: NetGuardOptions = {},
): Promise<FetchedPage> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const maxBytes = options.maxBytes ?? 512 * 1024;
  const maxRedirects = options.maxRedirects ?? 5;
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]);

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new NetGuardError('O endereço não é uma URL válida.');
  }

  for (let hop = 0; ; hop += 1) {
    const target = await vet(url, options);
    let response: RawResponse;
    try {
      response = await requestOnce(url, target, maxBytes, deadline);
    } catch {
      if (signal.aborted) throw new NetGuardError('A busca foi interrompida.');
      if (deadline.aborted) {
        throw new NetGuardError(`O servidor não respondeu em ${Math.round(timeoutMs / 1000)} s.`);
      }
      throw new NetGuardError('Não foi possível conectar ao servidor.');
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.location;
      if (!location) throw new NetGuardError('O servidor redirecionou sem informar o destino.');
      if (hop >= maxRedirects) throw new NetGuardError('Redirecionamentos demais.');
      try {
        url = new URL(location, url);
      } catch {
        throw new NetGuardError('O servidor redirecionou para um endereço inválido.');
      }
      continue;
    }

    const contentType = String(response.headers['content-type'] ?? '');
    if (!TEXT_TYPES.test(contentType.trim())) {
      throw new NetGuardError('O conteúdo deste endereço não é texto e não pode ser lido.');
    }
    return {
      url: url.href,
      status: response.status,
      contentType,
      body: response.body.toString('utf8'),
      truncated: response.truncated,
    };
  }
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** Reduces an HTML page to its readable text. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|template|svg|head)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article|br)\s*>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, name: string) => {
      if (name.startsWith('#')) {
        const code =
          name[1]?.toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : Number(name.slice(1));
        return Number.isInteger(code) && code > 0 && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : ' ';
      }
      return ENTITIES[name.toLowerCase()] ?? whole;
    })
    .replace(/[ \t\f\v\r]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
