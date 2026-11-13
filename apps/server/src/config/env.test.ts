import { isAbsolute, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig, LOOPBACK_HOST } from './env';
import { REPO_ROOT } from './paths';

describe('loadConfig', () => {
  it('applies defaults when nothing is set', () => {
    const config = loadConfig({});
    expect(config.env).toBe('production');
    expect(config.port).toBe(4317);
    expect(config.logLevel).toBe('info');
    expect(config.maxConcurrentRuns).toBe(4);
    expect(config.dataDir).toBe(join(REPO_ROOT, 'data'));
    expect(config.databasePath).toBe(join(REPO_ROOT, 'data', 'app.db'));
  });

  it('treats empty values as unset', () => {
    const config = loadConfig({ APP_PORT: '', LOG_LEVEL: '  ', DATA_DIR: '' });
    expect(config.port).toBe(4317);
    expect(config.logLevel).toBe('info');
    expect(isAbsolute(config.dataDir)).toBe(true);
  });

  it('always uses the loopback host, whatever the environment says (C-01)', () => {
    const config = loadConfig({ APP_HOST: '0.0.0.0', HOST: '0.0.0.0' });
    expect(config.host).toBe(LOOPBACK_HOST);
    expect(config.host).toBe('127.0.0.1');
  });

  it('derives the host and origin allowlists from the port', () => {
    const config = loadConfig({ APP_PORT: '5000' });
    expect(config.allowedHosts).toEqual(['127.0.0.1:5000', 'localhost:5000']);
    expect(config.allowedOrigins).toEqual(['http://127.0.0.1:5000', 'http://localhost:5000']);
  });

  it('accepts the dev UI origin only in development', () => {
    const dev = loadConfig({ NODE_ENV: 'development', WEB_DEV_PORT: '5173' });
    expect(dev.allowedOrigins).toContain('http://127.0.0.1:5173');
    expect(dev.allowedHosts).not.toContain('127.0.0.1:5173');

    const prod = loadConfig({ NODE_ENV: 'production', WEB_DEV_PORT: '5173' });
    expect(prod.allowedOrigins).not.toContain('http://127.0.0.1:5173');
  });

  it('keeps an absolute DATA_DIR as is', () => {
    const absolute = join(REPO_ROOT, 'somewhere-else');
    expect(loadConfig({ DATA_DIR: absolute }).dataDir).toBe(absolute);
  });

  it.each([
    ['APP_PORT', 'abc'],
    ['APP_PORT', '80'],
    ['APP_PORT', '70000'],
    ['LOG_LEVEL', 'verbose'],
    ['NODE_ENV', 'staging'],
    ['MAX_CONCURRENT_RUNS', '0'],
    ['MAX_CONCURRENT_RUNS', '1.5'],
  ])('rejects %s=%s naming the variable', (name, value) => {
    expect(() => loadConfig({ [name]: value })).toThrow(ConfigError);
    expect(() => loadConfig({ [name]: value })).toThrow(name);
  });
});
