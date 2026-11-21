import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

// A clean installation must not need a C++ compiler (Phase 37). From its
// version 13, better-sqlite3 no longer ships ready-made binaries: on a
// machine without Visual Studio Build Tools `npm ci` failed while compiling
// it. Version 12 downloads the binary for the platform (`prebuild-install`).

const require = createRequire(import.meta.url);

interface PackageJson {
  readonly version: string;
  readonly scripts?: Readonly<Record<string, string>>;
}

const read = (path: string): PackageJson => JSON.parse(readFileSync(path, 'utf8')) as PackageJson;

describe('installing from a clean copy', () => {
  it('uses a better-sqlite3 that downloads its binary instead of compiling it', () => {
    const installed = read(require.resolve('better-sqlite3/package.json'));
    expect(installed.scripts?.install ?? '').toContain('prebuild-install');
    expect(installed.version.split('.')[0]).toBe('12');
  });

  it('pins that version exactly, so an update never brings back the compiler', () => {
    const own = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(own.dependencies['better-sqlite3']).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
