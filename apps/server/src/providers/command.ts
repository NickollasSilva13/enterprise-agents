// Runs a harness already installed on this computer. Every process is created
// without a shell, with its arguments in a list, and with a minimal
// environment: the harness must authenticate with the user's own session and
// must never inherit a credential or an endpoint from this server (C-25).
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { ProviderError } from './types';

/**
 * The only variables a child harness receives. Everything else is dropped,
 * including `ANTHROPIC_*`, `OPENAI_*` and `CLAUDE_*`: a key or a base URL in
 * this server's environment must not reach, or redirect, the harness.
 */
const ENV_ALLOWLIST = new Set([
  // Finding the program and the user's own configuration and credentials.
  'PATH',
  'PATHEXT',
  'HOME',
  'USERPROFILE',
  'HOMEDRIVE',
  'HOMEPATH',
  'APPDATA',
  'LOCALAPPDATA',
  'PROGRAMDATA',
  'PROGRAMFILES',
  'PROGRAMFILES(X86)',
  'SYSTEMDRIVE',
  'SYSTEMROOT',
  'WINDIR',
  'TEMP',
  'TMP',
  'TMPDIR',
  // Locale and time, so dates in the answer make sense.
  'LANG',
  'LC_ALL',
  'TZ',
  // Networks that only work through a proxy or a private certificate.
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'NO_PROXY',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'NODE_EXTRA_CA_CERTS',
]);

/** The environment a harness process is given: an allowlist, nothing else. */
export function childEnv(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && ENV_ALLOWLIST.has(key.toUpperCase())) env[key] = value;
  }
  return env;
}

export interface CommandRun {
  /** Arguments, already split. Never a command line for a shell to parse. */
  readonly args: readonly string[];
  /** Written to stdin and closed. The prompt goes here, never in `args`. */
  readonly stdin?: string;
  /** Working directory of the process; the agent's workspace folder. */
  readonly cwd?: string;
  /**
   * For `collect`, the whole run; for `lines`, the longest silence allowed
   * between two chunks of output.
   */
  readonly timeoutMs: number;
}

export interface CommandResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** What the harness adapters use to run their program. Swappable in tests. */
export interface CommandRunner {
  /** Runs to completion and returns everything it printed. */
  collect(run: CommandRun, signal?: AbortSignal): Promise<CommandResult>;
  /** Yields stdout line by line, as it arrives. */
  lines(run: CommandRun, signal?: AbortSignal): AsyncIterable<string>;
}

/** Enough to notice a hung process without truncating a long answer. */
const STDERR_LIMIT = 4_000;
const LINE_LIMIT = 1_000_000;

interface Started {
  readonly stdout: AsyncIterable<string>;
  stderr(): string;
  /** Resolves with the exit code, or -1 when the process was signalled. */
  exit(): Promise<number>;
  stop(): void;
}

function start(command: string, run: CommandRun): Started {
  // Without this a missing folder would fail the spawn and look like a missing
  // program. The folder is the agent's own, created the same way the tools do.
  if (run.cwd !== undefined) mkdirSync(run.cwd, { recursive: true });

  const child = spawn(command, [...run.args], {
    shell: false,
    windowsHide: true,
    cwd: run.cwd,
    env: childEnv(),
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => {
    if (stderr.length < STDERR_LIMIT) stderr += chunk;
  });
  child.stdout.setEncoding('utf8');

  // A spawn failure (no such program) surfaces on 'error', which would be an
  // unhandled event once the streams are gone; it is kept for whoever waits.
  let failure: NodeJS.ErrnoException | null = null;
  const exited = new Promise<number>((resolve, reject) => {
    child.on('error', (error: NodeJS.ErrnoException) => {
      failure = error;
      reject(describeSpawnFailure(error));
    });
    child.on('close', (code) => resolve(code ?? -1));
  });
  // Nothing may reject before someone awaits it.
  exited.catch(() => undefined);

  // Writing to a process that never started fails on its own stream.
  child.stdin.on('error', () => undefined);
  if (run.stdin !== undefined) child.stdin.end(run.stdin);
  else child.stdin.end();

  return {
    stdout: child.stdout,
    stderr: () => stderr,
    exit: async () => {
      const code = await exited;
      if (failure) throw describeSpawnFailure(failure);
      return code;
    },
    stop: () => {
      if (child.exitCode === null && child.signalCode === null) child.kill();
    },
  };
}

function describeSpawnFailure(error: NodeJS.ErrnoException): ProviderError {
  if (error.code === 'ENOENT' || error.code === 'EACCES' || error.code === 'EPERM') {
    return new ProviderError('program_missing', undefined, `${error.code}: ${error.message}`);
  }
  return new ProviderError('unreachable', undefined, error.message);
}

/** Rejects once `signal` aborts; never resolves otherwise. */
function abortion(signal: AbortSignal | undefined): Promise<never> | null {
  if (!signal) return null;
  if (signal.aborted) return Promise.reject(new ProviderError('cancelled'));
  const promise = new Promise<never>((_, reject) => {
    signal.addEventListener('abort', () => reject(new ProviderError('cancelled')), { once: true });
  });
  promise.catch(() => undefined);
  return promise;
}

function timeout(ms: number): { promise: Promise<never>; clear: () => void } {
  let timer: NodeJS.Timeout | undefined;
  const promise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ProviderError('timeout')), ms);
  });
  promise.catch(() => undefined);
  return { promise, clear: () => clearTimeout(timer) };
}

/** Builds the runner for one program. */
export function createCommandRunner(command: string): CommandRunner {
  return {
    async collect(run, signal) {
      const proc = start(command, run);
      const limit = timeout(run.timeoutMs);
      const aborted = abortion(signal);
      try {
        const collecting = (async () => {
          let stdout = '';
          for await (const chunk of proc.stdout) stdout += chunk;
          return { code: await proc.exit(), stdout, stderr: proc.stderr() };
        })();
        const race = [collecting, limit.promise, ...(aborted ? [aborted] : [])];
        return await Promise.race(race);
      } finally {
        limit.clear();
        proc.stop();
      }
    },

    async *lines(run, signal) {
      const proc = start(command, run);
      const aborted = abortion(signal);
      try {
        const chunks = proc.stdout[Symbol.asyncIterator]();
        let buffer = '';
        for (;;) {
          const limit = timeout(run.timeoutMs);
          let next;
          try {
            const race = [chunks.next(), limit.promise, ...(aborted ? [aborted] : [])];
            next = await Promise.race(race);
          } finally {
            limit.clear();
          }
          if (next.done) break;
          buffer += next.value;
          if (buffer.length > LINE_LIMIT) {
            throw new ProviderError('invalid_response', undefined, 'output line too long');
          }
          let breakAt = buffer.indexOf('\n');
          while (breakAt >= 0) {
            const line = buffer.slice(0, breakAt).trim();
            buffer = buffer.slice(breakAt + 1);
            if (line) yield line;
            breakAt = buffer.indexOf('\n');
          }
        }
        const last = buffer.trim();
        if (last) yield last;

        const code = await proc.exit();
        if (code !== 0) {
          throw new ProviderError(
            'rejected',
            undefined,
            `exit ${code}: ${proc.stderr().slice(0, 500)}`,
          );
        }
      } finally {
        proc.stop();
      }
    },
  };
}
