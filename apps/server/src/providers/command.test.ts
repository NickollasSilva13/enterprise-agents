import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { childEnv, createCommandRunner } from './command';
import { ProviderError } from './types';

// The harness is a program, so these tests run a real one: Node itself, with a
// script in `-e`. Nothing about the Claude Code CLI is assumed here.
const node = createCommandRunner(process.execPath);

const temps: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ea-command-'));
  temps.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

async function collectLines(
  args: string[],
  options: { timeoutMs?: number; cwd?: string; signal?: AbortSignal } = {},
): Promise<string[]> {
  const lines: string[] = [];
  for await (const line of node.lines(
    { args, cwd: options.cwd, timeoutMs: options.timeoutMs ?? 10_000 },
    options.signal,
  )) {
    lines.push(line);
  }
  return lines;
}

async function failure(run: Promise<unknown>): Promise<ProviderError> {
  try {
    await run;
  } catch (error) {
    if (error instanceof ProviderError) return error;
    throw new Error(`esperava ProviderError, veio ${String(error)}`, { cause: error });
  }
  throw new Error('esperava uma falha');
}

describe('childEnv', () => {
  it('keeps only what the harness needs', () => {
    const env = childEnv({
      PATH: '/usr/bin',
      HOME: '/home/user',
      APPDATA: 'C:\\Users\\u\\AppData\\Roaming',
      HTTPS_PROXY: 'http://proxy:3128',
      SOMETHING_ELSE: 'x',
    });
    expect(env).toEqual({
      PATH: '/usr/bin',
      HOME: '/home/user',
      APPDATA: 'C:\\Users\\u\\AppData\\Roaming',
      HTTPS_PROXY: 'http://proxy:3128',
    });
  });

  it('drops credentials and endpoints of this server (C-25)', () => {
    const env = childEnv({
      PATH: '/usr/bin',
      ANTHROPIC_API_KEY: 'sk-ant-secret',
      ANTHROPIC_BASE_URL: 'http://attacker.invalid',
      OPENAI_API_KEY: 'sk-secret',
      CLAUDE_CODE_SOMETHING: '1',
      EA_SESSION_SECRET: 'segredo',
    });
    expect(Object.keys(env)).toEqual(['PATH']);
  });
});

describe('command runner', () => {
  it('collects what the program printed', async () => {
    const result = await node.collect({
      args: ['-e', 'console.log("oi"); console.error("aviso")'],
      timeoutMs: 10_000,
    });
    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe('oi');
    expect(result.stderr.trim()).toBe('aviso');
  });

  it('passes arguments as a list, with no shell expanding them', async () => {
    const result = await node.collect({
      args: ['-e', 'console.log(process.argv[1])', '$HOME & echo oi > arquivo.txt'],
      timeoutMs: 10_000,
    });
    expect(result.stdout.trim()).toBe('$HOME & echo oi > arquivo.txt');
  });

  it('gives the program its prompt on stdin', async () => {
    const result = await node.collect({
      args: [
        '-e',
        'let i = ""; process.stdin.on("data", (c) => (i += c)).on("end", () => console.log(i.length + ":" + i))',
      ],
      stdin: 'pergunta do usuário',
      timeoutMs: 10_000,
    });
    expect(result.stdout.trim()).toBe('19:pergunta do usuário');
  });

  it('keeps this server variables out of the program', async () => {
    process.env.EA_TEST_LEAK_KEY = 'sk-not-for-the-harness';
    try {
      const result = await node.collect({
        args: ['-e', 'console.log(process.env.EA_TEST_LEAK_KEY ?? "ausente")'],
        timeoutMs: 10_000,
      });
      expect(result.stdout.trim()).toBe('ausente');
    } finally {
      delete process.env.EA_TEST_LEAK_KEY;
    }
  });

  it('runs in the folder it is given, creating it when needed', async () => {
    const workspace = join(tempDir(), 'agente-novo');
    expect(existsSync(workspace)).toBe(false);
    const result = await node.collect({
      args: ['-e', 'console.log(process.cwd())'],
      cwd: workspace,
      timeoutMs: 10_000,
    });
    expect(existsSync(workspace)).toBe(true);
    expect(result.stdout.trim().toLowerCase()).toContain('agente-novo');
  });

  it('yields one line at a time', async () => {
    const lines = await collectLines(['-e', 'console.log("um"); console.log("dois")']);
    expect(lines).toEqual(['um', 'dois']);
  });

  it('yields the last line even without a line break', async () => {
    const lines = await collectLines(['-e', 'process.stdout.write("sem quebra")']);
    expect(lines).toEqual(['sem quebra']);
  });

  it('reports a program that does not exist', async () => {
    const missing = createCommandRunner('ea-programa-que-nao-existe');
    const error = await failure(missing.collect({ args: ['--version'], timeoutMs: 10_000 }));
    expect(error.kind).toBe('program_missing');
    expect(error.message).toContain('Verifique o comando informado');
  });

  it('gives up on a program that goes quiet', async () => {
    const error = await failure(
      node.collect({ args: ['-e', 'setTimeout(() => {}, 30000)'], timeoutMs: 300 }),
    );
    expect(error.kind).toBe('timeout');
  });

  it('gives up when the stream goes quiet for too long', async () => {
    const error = await failure(
      collectLines(['-e', 'console.log("um"); setTimeout(() => {}, 30000)'], { timeoutMs: 300 }),
    );
    expect(error.kind).toBe('timeout');
  });

  it('stops the program when the run is cancelled', async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 100);
    const error = await failure(
      collectLines(['-e', 'console.log("um"); setTimeout(() => {}, 30000)'], {
        signal: controller.signal,
      }),
    );
    expect(error.kind).toBe('cancelled');
  });

  it('refuses a run that was already cancelled', async () => {
    const error = await failure(
      node.collect({ args: ['-e', ''], timeoutMs: 10_000 }, AbortSignal.abort()),
    );
    expect(error.kind).toBe('cancelled');
  });

  it('fails the stream when the program exits badly', async () => {
    const error = await failure(
      collectLines(['-e', 'console.log("um"); console.error("quebrou"); process.exit(3)']),
    );
    expect(error.kind).toBe('rejected');
    expect(error.upstreamDetail).toContain('exit 3');
  });
});
