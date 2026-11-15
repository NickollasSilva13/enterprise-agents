import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadEnvFile } from './load-env-file';

const NEW = 'EA_TEST_FROM_FILE';
const SET = 'EA_TEST_ALREADY_SET';
let dir: string | undefined;

afterEach(() => {
  delete process.env[NEW];
  delete process.env[SET];
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

describe('loadEnvFile', () => {
  it('reads the file, and a variable already in the environment wins', () => {
    dir = mkdtempSync(join(tmpdir(), 'ea-env-'));
    const file = join(dir, '.env');
    writeFileSync(file, `${NEW}=do arquivo\n${SET}=do arquivo\n`);
    process.env[SET] = 'do ambiente';

    loadEnvFile(file);
    expect(process.env[NEW]).toBe('do arquivo');
    expect(process.env[SET]).toBe('do ambiente');
  });

  it('does nothing when there is no file', () => {
    dir = mkdtempSync(join(tmpdir(), 'ea-env-'));
    expect(() => loadEnvFile(join(dir ?? '', 'ausente.env'))).not.toThrow();
    expect(process.env[NEW]).toBeUndefined();
  });
});
