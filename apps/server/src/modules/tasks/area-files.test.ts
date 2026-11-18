import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REQUEST_LIMITS } from '@ea/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AreaCopyError, copyFolderContents, copyIntoFolder } from './area-files';

// Copies between areas (Phase 17, D3): what crosses is copied by the server,
// never reached, and a link inside a folder is never followed out of it.

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ea-area-files-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const file = (path: string, content = 'x') => {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
};

describe('copies between areas', () => {
  it('copies files and folders under their own names', () => {
    file(join(root, 'from', 'nota.md'));
    file(join(root, 'from', 'pasta', 'a.txt'));
    file(join(root, 'from', 'pasta', 'sub', 'b.txt'));
    const result = copyIntoFolder(
      [join(root, 'from', 'nota.md'), join(root, 'from', 'pasta')],
      join(root, 'to'),
    );
    expect(result.files).toBe(3);
    expect(existsSync(join(root, 'to', 'nota.md'))).toBe(true);
    expect(existsSync(join(root, 'to', 'pasta', 'sub', 'b.txt'))).toBe(true);
  });

  it('refuses a source that does not exist', () => {
    expect(() => copyIntoFolder([join(root, 'nada.md')], join(root, 'to'))).toThrow(AreaCopyError);
  });

  it('copies nothing at all when the limits are passed', () => {
    for (let n = 0; n <= REQUEST_LIMITS.files; n += 1) file(join(root, 'many', `${n}.txt`));
    expect(() => copyFolderContents(join(root, 'many'), join(root, 'to'))).toThrow(
      /mais de 200 arquivos/,
    );
    expect(existsSync(join(root, 'to'))).toBe(false);
  });

  it('does not follow a link out of the folder', () => {
    file(join(root, 'secret', 'chave.txt'), 'segredo');
    file(join(root, 'entregas', 'ok.txt'));
    symlinkSync(join(root, 'secret'), join(root, 'entregas', 'atalho'), 'junction');
    const result = copyFolderContents(join(root, 'entregas'), join(root, 'to'));
    expect(result.files).toBe(1);
    expect(existsSync(join(root, 'to', 'atalho'))).toBe(false);
  });

  it('copies nothing from a delivery folder that is missing or is itself a link', () => {
    expect(copyFolderContents(join(root, 'nada'), join(root, 'to')).files).toBe(0);
    file(join(root, 'secret', 'chave.txt'));
    symlinkSync(join(root, 'secret'), join(root, 'link'), 'junction');
    expect(copyFolderContents(join(root, 'link'), join(root, 'to')).files).toBe(0);
  });
});
