import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeTempDir } from '../../test/helpers';
import { createRunScriptTool } from './builtin/run-script';
import type { ToolContext } from './types';
import { ensureWorkspace, WorkspacePathError } from './workspace';

let temp: ReturnType<typeof makeTempDir>;
let workspace: string;

beforeEach(() => {
  temp = makeTempDir();
  workspace = join(temp.path, 'workspaces', 'agent-1');
  ensureWorkspace(workspace);
});
afterEach(() => temp.remove());

const context = (signal = new AbortController().signal): ToolContext => ({
  agentId: 'agent-1',
  runId: 'run-1',
  workspaceDir: workspace,
  signal,
  delegate: async () => ({ content: '' }),
});

const script = (name: string, source: string) => writeFileSync(join(workspace, name), source);

describe('run_script (C-20)', () => {
  const tool = createRunScriptTool({ timeoutMs: 1500 });

  it('is high risk and off by default', () => {
    expect(tool.risk).toBe('high');
    expect(tool.offByDefault).toBe(true);
  });

  it('runs a script of the workspace and returns what it prints', async () => {
    script('soma.mjs', 'console.log(Number(process.argv[2]) + Number(process.argv[3]));');
    expect(await tool.execute({ path: 'soma.mjs', args: ['2', '40'] }, context())).toEqual({
      content: '42',
    });
  });

  it('passes arguments as a list: nothing in them is interpreted by a shell', async () => {
    script('eco.js', 'console.log(JSON.stringify(process.argv.slice(2)));');
    const hostile = ['& echo invadido > invadido.txt', '$(whoami)', '"; rm -rf . #', '%PATH%'];
    const result = await tool.execute({ path: 'eco.js', args: hostile }, context());
    expect(JSON.parse(result.content)).toEqual(hostile);
    expect(existsSync(join(workspace, 'invadido.txt'))).toBe(false);
  });

  it('gives the script a minimal environment, with nothing from the server (C-11)', async () => {
    process.env.EA_TEST_SECRET = 'sk-test-do-not-leak';
    try {
      script('env.js', 'console.log(JSON.stringify(process.env));');
      const result = await tool.execute({ path: 'env.js' }, context());
      const env = JSON.parse(result.content) as Record<string, string>;
      expect(result.content).not.toContain('sk-test-do-not-leak');
      expect(env.NO_COLOR).toBe('1');
      // Besides what the tool sets, only what Windows needs to start a process.
      const fromSystem = new Set([
        'HOMEDRIVE',
        'HOMEPATH',
        'LOGONSERVER',
        'PATH',
        'SYSTEMDRIVE',
        'SYSTEMROOT',
        'TEMP',
        'USERDOMAIN',
        'USERNAME',
        'USERPROFILE',
        'WINDIR',
      ]);
      const unexpected = Object.keys(env).filter(
        (key) => key !== 'NO_COLOR' && !fromSystem.has(key.toUpperCase()),
      );
      expect(unexpected).toEqual([]);
    } finally {
      delete process.env.EA_TEST_SECRET;
    }
  });

  it('runs in the workspace folder', async () => {
    script('cwd.js', 'console.log(process.cwd());');
    const result = await tool.execute({ path: 'cwd.js' }, context());
    expect(result.content.toLowerCase()).toBe(ensureWorkspace(workspace).toLowerCase());
  });

  it('keeps the script inside the workspace and without child processes', async () => {
    const secret = join(temp.path, 'secret.txt');
    writeFileSync(secret, 'segredo');
    script(
      'fuga.js',
      `const fs = require('node:fs');
       try { console.log(fs.readFileSync(${JSON.stringify(secret)}, 'utf8')); } catch (e) { console.log('leitura: ' + e.code); }
       try { fs.writeFileSync(${JSON.stringify(join(temp.path, 'novo.txt'))}, 'x'); console.log('escreveu'); } catch (e) { console.log('escrita: ' + e.code); }
       try { require('node:child_process').execSync('whoami'); console.log('executou'); } catch (e) { console.log('processo: ' + e.code); }`,
    );
    const result = await tool.execute({ path: 'fuga.js' }, context());
    expect(result.content).toBe(
      'leitura: ERR_ACCESS_DENIED\nescrita: ERR_ACCESS_DENIED\nprocesso: ERR_ACCESS_DENIED',
    );
    expect(existsSync(join(temp.path, 'novo.txt'))).toBe(false);
  });

  it('stops a script that passes the time limit', async () => {
    script('lento.js', 'setInterval(() => {}, 1000);');
    const result = await tool.execute({ path: 'lento.js' }, context());
    expect(result).toMatchObject({ isError: true });
    expect(result.content).toContain('tempo máximo');
  });

  it('stops the script when the run is cancelled (C-14)', async () => {
    script('lento.js', 'setInterval(() => {}, 1000);');
    const controller = new AbortController();
    const pending = tool.execute({ path: 'lento.js' }, context(controller.signal));
    setTimeout(() => controller.abort(), 200);
    expect(await pending).toEqual({ content: 'O script foi interrompido.', isError: true });
  });

  it('reports a failing script with its output', async () => {
    script('erro.js', 'console.error("deu ruim"); process.exit(3);');
    const result = await tool.execute({ path: 'erro.js' }, context());
    expect(result).toMatchObject({ isError: true });
    expect(result.content).toContain('código 3');
    expect(result.content).toContain('deu ruim');
  });

  it('cuts very long output', async () => {
    script('muito.js', 'console.log("a".repeat(200000));');
    const result = await tool.execute({ path: 'muito.js' }, context());
    expect(result.content.length).toBeLessThan(33_000);
    expect(result.content).toContain('[Saída cortada por tamanho.]');
  });

  it('only runs Node scripts that exist inside the workspace', async () => {
    mkdirSync(join(workspace, 'pasta.js'));
    script('notas.txt', 'x');
    expect(await tool.execute({ path: 'notas.txt' }, context())).toMatchObject({ isError: true });
    expect(await tool.execute({ path: 'falta.js' }, context())).toMatchObject({ isError: true });
    expect(await tool.execute({ path: 'pasta.js' }, context())).toMatchObject({ isError: true });
    await expect(tool.execute({ path: '../fora.js' }, context())).rejects.toThrow(
      WorkspacePathError,
    );
    await expect(
      tool.execute({ path: 'C:\\Windows\\System32\\cmd.exe' }, context()),
    ).rejects.toThrow(WorkspacePathError);
  });
});
