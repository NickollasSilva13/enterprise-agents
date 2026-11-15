import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../core/errors';

const HEARTBEAT_MS = 20_000;
/** Far above what one user's tabs need; stops a runaway page from piling up sockets. */
const MAX_STREAMS = 64;

export interface SseStream {
  /** `id` becomes the Last-Event-ID a reconnecting browser sends back. */
  send(event: string, data: unknown, id?: number): void;
  /** Ends the response. Safe to call more than once. */
  close(): void;
  /** Runs once, when the stream ends for any reason. */
  onClose(callback: () => void): void;
}

/**
 * Server-Sent Events over a Fastify reply. Streams are tracked so the server
 * can end them when it shuts down; otherwise open sockets would hold it up.
 */
export class SseHub {
  private readonly streams = new Set<SseStream>();

  get openCount(): number {
    return this.streams.size;
  }

  open(request: FastifyRequest, reply: FastifyReply): SseStream {
    if (this.streams.size >= MAX_STREAMS) {
      throw new AppError(503, 'too_many_streams', 'Há conexões de eventos demais abertas.');
    }
    // From here on the response is ours: Fastify will not write to it.
    reply.hijack();
    const { raw } = reply;
    // Security headers were set by the first request hook; keep them.
    for (const [name, value] of Object.entries(reply.getHeaders())) {
      if (value !== undefined) raw.setHeader(name, value);
    }
    raw.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      connection: 'keep-alive',
    });

    const closeCallbacks: (() => void)[] = [];
    let closed = false;

    const finish = () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      this.streams.delete(stream);
      for (const callback of closeCallbacks) callback();
    };

    const stream: SseStream = {
      send(event, data, id) {
        if (closed) return;
        const lines = id === undefined ? '' : `id: ${id}\n`;
        // JSON never contains a raw newline, so one data line is always enough.
        raw.write(`${lines}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      },
      close() {
        if (closed) return;
        finish();
        raw.end();
      },
      onClose(callback) {
        closeCallbacks.push(callback);
      },
    };

    // A comment line keeps idle connections from being dropped.
    const heartbeat = setInterval(() => raw.write(': ping\n\n'), HEARTBEAT_MS);
    heartbeat.unref();
    request.raw.on('close', finish);
    raw.on('error', finish);

    this.streams.add(stream);
    return stream;
  }

  closeAll(): void {
    for (const stream of [...this.streams]) stream.close();
  }
}

/** Sequence number a reconnecting client already has; 0 when it has none. */
export function lastEventId(request: FastifyRequest): number {
  const header = request.headers['last-event-id'];
  const value = Number(Array.isArray(header) ? header[0] : header);
  return Number.isInteger(value) && value > 0 ? value : 0;
}
