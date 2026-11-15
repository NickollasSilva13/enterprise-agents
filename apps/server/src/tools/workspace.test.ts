import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeTempDir } from '../../test/helpers';
import { listDirTool, readFileTool, writeFileTool, FILE_LIMITS } from './builtin/files';
import type { ToolContext } from './types';
import {
  ensureWorkspace,
  resolveInWorkspace,
  toWorkspacePath,
  WorkspacePathError,
} from './workspace';

let temp: ReturnType<typeof makeTempDir>;
let workspace: string;
let outside: string;

beforeEach(() => {
  temp = makeTempDir();
  workspace = join(temp.path, 'workspaces', 'agent-1');
  outside = join(temp.path, 'outside');
  mkdirSync(outside, { recursive: true });
  writeFileSync(join(outside, 'secret.txt'), 'segredo');
  ensureWorkspace(workspace);
});
afterEach(() => temp.remove());

const context = (): ToolContext => ({
  agentId: 'agent-1',
  runId: 'run-1',
  workspaceDir: workspace,
  signal: new AbortController().signal,
  delegate: async () => ({ content: '' }),
});

describe('resolveInWorkspace (C-17)', () => {
  it('resolves relative paths inside the workspace', () => {
    const root = ensureWorkspace(workspace);
    expect(resolveInWorkspace(workspace, 'notas.txt')).toBe(join(root, 'notas.txt'));
    expect(resolveInWorkspace(workspace, 'a/b/../c.txt'.replace('/../', '/'))).toBe(
      join(root, 'a', 'b', 'c.txt'),
    );
    expect(resolveInWorkspace(workspace, './docs\\guia.md')).toBe(join(root, 'docs', 'guia.md'));
    expect(resolveInWorkspace(workspace, '.')).toBe(root);
    expect(toWorkspacePath(workspace, join(root, 'docs', 'guia.md'))).toBe('docs/guia.md');
  });

  it.each([
    ['..'],
    ['../outside/secret.txt'],
    ['a/../../outside/secret.txt'],
    ['a\\..\\..\\outside\\secret.txt'],
    ['/etc/passwd'],
    ['\\Windows\\win.ini'],
    ['C:\\Windows\\win.ini'],
    ['c:/Windows/win.ini'],
    ['C:secret.txt'],
    ['\\\\server\\share\\file.txt'],
    ['//server/share/file.txt'],
    ['\\\\?\\C:\\Windows\\win.ini'],
    ['notas.txt:oculto'],
    ['notas.txt::$DATA'],
    ['nul'],
    ['NUL.txt'],
    ['pasta/con'],
    ['COM1'],
    ['lpt9.log'],
    ['aux.'],
    ['nome. '],
    ['pasta./arquivo'],
    ['a<b'],
    ['a|b'],
    ['a*b'],
    ['a?b'],
    ['a"b'],
    ['arquivo\0.txt'],
    ['x'.repeat(401)],
  ])('refuses %j', (requested) => {
    expect(() => resolveInWorkspace(workspace, requested)).toThrow(WorkspacePathError);
  });

  it('refuses a path that goes through a link leading out of the workspace', () => {
    // A junction needs no special privilege on Windows; elsewhere it is a symlink.
    symlinkSync(outside, join(workspace, 'atalho'), 'junction');

    expect(() => resolveInWorkspace(workspace, 'atalho/secret.txt')).toThrow(
      'passa por um link que sai da pasta de trabalho',
    );
    expect(() => resolveInWorkspace(workspace, 'atalho')).toThrow(WorkspacePathError);
    // Also for a file that does not exist yet: nothing may be created outside.
    expect(() => resolveInWorkspace(workspace, 'atalho/novo/arquivo.txt')).toThrow(
      WorkspacePathError,
    );
  });

  it('accepts a link that stays inside the workspace', () => {
    mkdirSync(join(workspace, 'real'));
    symlinkSync(join(workspace, 'real'), join(workspace, 'apelido'), 'junction');
    expect(resolveInWorkspace(workspace, 'apelido/x.txt')).toBe(
      join(ensureWorkspace(workspace), 'real', 'x.txt'),
    );
  });
});

describe('file tools', () => {
  it('writes, lists and reads inside the workspace', async () => {
    const written = await writeFileTool.execute(
      { path: 'docs/resumo.md', content: '# Olá' },
      context(),
    );
    expect(written).toEqual({ content: 'Arquivo "docs/resumo.md" criado (6 bytes).' });
    expect(readFileSync(join(workspace, 'docs', 'resumo.md'), 'utf8')).toBe('# Olá');

    expect(await listDirTool.execute({}, context())).toEqual({ content: 'docs/' });
    expect(await listDirTool.execute({ path: 'docs' }, context())).toEqual({
      content: 'resumo.md (6 bytes)',
    });
    expect(await readFileTool.execute({ path: 'docs/resumo.md' }, context())).toEqual({
      content: '# Olá',
    });

    const replaced = await writeFileTool.execute(
      { path: 'docs/resumo.md', content: 'x' },
      context(),
    );
    expect(replaced.content).toContain('substituído');
  });

  it('never reads, lists or writes outside the workspace (C-17)', async () => {
    symlinkSync(outside, join(workspace, 'atalho'), 'junction');
    const attempts = ['../outside/secret.txt', 'atalho/secret.txt', join(outside, 'secret.txt')];
    for (const path of attempts) {
      await expect(readFileTool.execute({ path }, context())).rejects.toThrow(WorkspacePathError);
      await expect(writeFileTool.execute({ path, content: 'invadido' }, context())).rejects.toThrow(
        WorkspacePathError,
      );
    }
    await expect(listDirTool.execute({ path: 'atalho' }, context())).rejects.toThrow(
      WorkspacePathError,
    );
    await expect(listDirTool.execute({ path: '..' }, context())).rejects.toThrow(
      WorkspacePathError,
    );
    expect(readFileSync(join(outside, 'secret.txt'), 'utf8')).toBe('segredo');
    expect(existsSync(join(outside, 'novo.txt'))).toBe(false);
    // The link is named in a listing, but not followed.
    expect((await listDirTool.execute({}, context())).content).toContain('atalho');
  });

  it('reports missing files and wrong kinds as tool errors', async () => {
    mkdirSync(join(workspace, 'pasta'));
    expect(await readFileTool.execute({ path: 'nada.txt' }, context())).toMatchObject({
      isError: true,
    });
    expect(await readFileTool.execute({ path: 'pasta' }, context())).toMatchObject({
      isError: true,
    });
    expect(await listDirTool.execute({ path: 'nada' }, context())).toMatchObject({ isError: true });
    expect(await writeFileTool.execute({ path: 'pasta', content: 'x' }, context())).toMatchObject({
      isError: true,
    });
  });

  it('limits how much is read and written (C-18)', async () => {
    writeFileSync(join(workspace, 'grande.txt'), 'a'.repeat(FILE_LIMITS.readBytes + 1000));
    const read = await readFileTool.execute({ path: 'grande.txt' }, context());
    expect(read.content.length).toBeLessThan(FILE_LIMITS.readBytes + 200);
    expect(read.content).toContain('[Arquivo cortado');

    writeFileSync(join(workspace, 'binario.bin'), Buffer.from([1, 2, 0, 3]));
    expect(await readFileTool.execute({ path: 'binario.bin' }, context())).toMatchObject({
      isError: true,
    });

    const tooBig = writeFileTool.inputSchema.safeParse({
      path: 'x.txt',
      content: 'a'.repeat(FILE_LIMITS.writeChars + 1),
    });
    expect(tooBig.success).toBe(false);
    expect(
      writeFileTool.inputSchema.safeParse({ path: 'x.txt', content: '', mode: 'append' }).success,
    ).toBe(false);
  });
});
