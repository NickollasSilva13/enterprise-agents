import { isAbsolute, join, resolve } from 'node:path';
import { z } from 'zod';
import { REPO_ROOT, WEB_DIST_DIR } from './paths';

/**
 * The server only ever listens on loopback (SECURITY C-01).
 * This is a constant on purpose: there is no setting to change it.
 */
export const LOOPBACK_HOST = '127.0.0.1';

const emptyToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const port = (fallback: number) =>
  z.preprocess(emptyToUndefined, z.coerce.number().int().min(1024).max(65535).default(fallback));

const envSchema = z.object({
  NODE_ENV: z.preprocess(
    emptyToUndefined,
    z.enum(['development', 'production', 'test']).default('production'),
  ),
  APP_PORT: port(4317),
  WEB_DEV_PORT: port(5173),
  DATA_DIR: z.preprocess(emptyToUndefined, z.string().default('./data')),
  LOG_LEVEL: z.preprocess(
    emptyToUndefined,
    z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  ),
  SECRET_STORE: z.preprocess(emptyToUndefined, z.enum(['os', 'memory']).default('os')),
  MAX_CONCURRENT_RUNS: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(1).max(32).default(4),
  ),
  MAX_DELEGATION_DEPTH: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(1).max(10).default(3),
  ),
});

export interface AppConfig {
  readonly env: 'development' | 'production' | 'test';
  readonly host: typeof LOOPBACK_HOST;
  readonly port: number;
  readonly dataDir: string;
  readonly databasePath: string;
  readonly webDistDir: string;
  readonly logLevel: string;
  readonly maxConcurrentRuns: number;
  /** How many agents deep a delegation chain may go (RN-10). */
  readonly maxDelegationDepth: number;
  /** Parent of every agent's working folder (SECURITY C-17). */
  readonly workspacesDir: string;
  /** 'os': the system credential vault. 'memory': lost on exit; for tests only. */
  readonly secretStore: 'os' | 'memory';
  /** Accepted values of the Host header (SECURITY C-02). */
  readonly allowedHosts: readonly string[];
  /** Accepted values of the Origin header on state-changing requests (SECURITY C-03). */
  readonly allowedOrigins: readonly string[];
}

export class ConfigError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Configuração inválida:\n${issues.map((issue) => `  - ${issue}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

const LOOPBACK_NAMES = [LOOPBACK_HOST, 'localhost'] as const;

export function loadConfig(env: Record<string, string | undefined>): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new ConfigError(
      parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }
  const values = parsed.data;

  const dataDir = isAbsolute(values.DATA_DIR)
    ? values.DATA_DIR
    : resolve(REPO_ROOT, values.DATA_DIR);

  const allowedHosts = LOOPBACK_NAMES.map((name) => `${name}:${values.APP_PORT}`);
  const allowedOrigins = LOOPBACK_NAMES.map((name) => `http://${name}:${values.APP_PORT}`);
  if (values.NODE_ENV === 'development') {
    // In development the UI is served by Vite on another port and proxies /api here.
    allowedOrigins.push(...LOOPBACK_NAMES.map((name) => `http://${name}:${values.WEB_DEV_PORT}`));
  }

  return {
    env: values.NODE_ENV,
    host: LOOPBACK_HOST,
    port: values.APP_PORT,
    dataDir,
    databasePath: join(dataDir, 'app.db'),
    webDistDir: WEB_DIST_DIR,
    logLevel: values.LOG_LEVEL,
    maxConcurrentRuns: values.MAX_CONCURRENT_RUNS,
    maxDelegationDepth: values.MAX_DELEGATION_DEPTH,
    workspacesDir: join(dataDir, 'workspaces'),
    secretStore: values.SECRET_STORE,
    allowedHosts,
    allowedOrigins,
  };
}
