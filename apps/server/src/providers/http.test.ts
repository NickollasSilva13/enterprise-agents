import { describe, expect, it } from 'vitest';
import { readLines, STREAM_LINE_LIMIT } from './http';
import { ProviderError } from './types';

/** A response whose body is produced piece by piece, like a streamed answer. */
function streamed(pieces: () => Generator<string>): Response {
  const encoder = new TextEncoder();
  const source = pieces();
  return new Response(
    new ReadableStream<Uint8Array>({
      pull(controller) {
        const next = source.next();
        if (next.done) controller.close();
        else controller.enqueue(encoder.encode(next.value));
      },
    }),
  );
}

async function collect(response: Response): Promise<string[]> {
  const lines: string[] = [];
  for await (const line of readLines(response)) lines.push(line);
  return lines;
}

describe('readLines', () => {
  it('yields each line, whatever way the pieces were cut', async () => {
    const response = streamed(function* () {
      yield 'um\ndo';
      yield 'is\r\n\ntr';
      yield 'ês';
    });
    expect(await collect(response)).toEqual(['um', 'dois', 'três']);
  });

  it('gives up on a server that never ends a line, instead of filling the memory (A8)', async () => {
    let sent = 0;
    const response = streamed(function* () {
      const piece = 'x'.repeat(64 * 1024);
      // Far more than the limit would ever be offered; the reader must stop early.
      while (sent < STREAM_LINE_LIMIT * 4) {
        sent += piece.length;
        yield piece;
      }
    });
    const failure = await collect(response).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ProviderError);
    expect((failure as ProviderError).kind).toBe('invalid_response');
    expect(sent).toBeLessThan(STREAM_LINE_LIMIT * 2);
  });

  it('accepts many long lines, as long as each one ends', async () => {
    const line = 'y'.repeat(1024 * 1024);
    const response = streamed(function* () {
      for (let index = 0; index < 6; index += 1) yield `${line}\n`;
    });
    const lines = await collect(response);
    expect(lines).toHaveLength(6);
    expect(lines[5]).toHaveLength(line.length);
  });
});
