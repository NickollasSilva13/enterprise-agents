import { spawn } from 'node:child_process';
import { statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { z } from 'zod';
import { type ToolDefinition, toolError, type ToolResult } from '../types';
import { ensureWorkspace, PATH_LIMIT, resolveInWorkspace } from '../workspace';

export const SCRIPT_LIMITS = {
  timeoutMs: 30_000,
  outputChars: 32_000,
  args: 20,
  argChars: 1000,
} as const;

const SCRIPT_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);

/**
 * Node's permission model, when this Node has it: the script may read and
 * write only the workspace and cannot start processes or workers. It is a
 * reinforcement, not isolation (see SECURITY, "Sobre isolamento").
 */
function permissionFlags(workspace: string): string[] {
  const flags = process.allowedNodeEnvironmentFlags;
  const flag = flags.has('--permission')
    ? '--permission'
    : flags.has('--experimental-permission')
      ? '--experimental-permission'
      : null;
  if (!flag) return [];
  const scope = join(workspace, '*');
  return [flag, `--allow-fs-read=${scope}`, `--allow-fs-write=${scope}`, '--no-warnings'];
}

/**
 * Nothing of the server's environment is handed to the script (C-11, C-20).
 * On Windows the system itself still adds the few variables a process needs
 * to start (SystemRoot, TEMP, the user's profile folder and the like).
 */
function minimalEnv(): NodeJS.ProcessEnv {
  return { NO_COLOR: '1' };
}

function run(
  workspace: string,
  script: string,
  args: readonly string[],
  signal: AbortSignal,
  timeoutMs: number,
): Promise<ToolResult> {
  return new Promise((resolve) => {
    // No shell and arguments as a list: nothing in them is ever interpreted.
    const child = spawn(process.execPath, [...permissionFlags(workspace), script, ...args], {
      cwd: workspace,
      env: minimalEnv(),
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      signal,
      timeout: timeoutMs,
      killSignal: 'SIGKILL',
    });

    let output = '';
    let dropped = false;
    const collect = (chunk: Buffer) => {
      if (output.length >= SCRIPT_LIMITS.outputChars) {
        dropped = true;
        return;
      }
      output += chunk.toString('utf8');
      if (output.length > SCRIPT_LIMITS.outputChars) {
        output = output.slice(0, SCRIPT_LIMITS.outputChars);
        dropped = true;
      }
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);

    const started = performance.now();
    child.on('error', () => {
      // After a successful start, "close" follows and answers: answering here
      // would hand control back while the process is still dying.
      if (child.pid === undefined) resolve(toolError('Não foi possível iniciar o script.'));
    });
    child.on('close', (code, killedBy) => {
      const text = `${output}${dropped ? '\n[Saída cortada por tamanho.]' : ''}`.trim();
      if (signal.aborted) {
        resolve(toolError('O script foi interrompido.'));
      } else if (killedBy && performance.now() - started >= timeoutMs - 50) {
        resolve(
          toolError(
            `O script passou do tempo máximo de ${Math.round(timeoutMs / 1000)} s e foi encerrado.\n${text}`,
          ),
        );
      } else if (code === 0) {
        resolve({ content: text === '' ? '(o script terminou sem saída)' : text });
      } else {
        resolve(toolError(`O script terminou com erro (código ${code ?? '?'}).\n${text}`));
      }
    });
  });
}

/**
 * Runs a Node script that is already inside the agent's workspace (SECURITY
 * C-20). High risk: every call needs the user's approval, and the tool does
 * nothing until it is switched on for the installation.
 */
export function createRunScriptTool(
  options: { timeoutMs?: number } = {},
): ToolDefinition<{ path: string; args?: string[] | undefined }> {
  return {
    name: 'run_script',
    title: 'Executar script',
    summary:
      'Executa um script Node.js (.js, .mjs) que esteja na pasta de trabalho do agente. Roda com o seu usuário do sistema: aprove só o que você leu.',
    description:
      'Executa com Node.js um script .js ou .mjs da sua pasta de trabalho e devolve o que ele imprimir. Cada execução precisa ser aprovada pelo usuário.',
    risk: 'high',
    offByDefault: true,
    inputSchema: z.strictObject({
      path: z.string().min(1).max(PATH_LIMIT),
      args: z.array(z.string().max(SCRIPT_LIMITS.argChars)).max(SCRIPT_LIMITS.args).optional(),
    }),
    async execute(input, context) {
      const script = resolveInWorkspace(context.workspaceDir, input.path);
      if (!SCRIPT_EXTENSIONS.has(extname(script).toLowerCase())) {
        return toolError('Só scripts Node.js (.js, .mjs ou .cjs) podem ser executados.');
      }
      let isFile = false;
      try {
        isFile = statSync(script).isFile();
      } catch {
        // Reported below.
      }
      if (!isFile) return toolError(`O script "${input.path}" não existe.`);
      return run(
        ensureWorkspace(context.workspaceDir),
        script,
        input.args ?? [],
        context.signal,
        options.timeoutMs ?? SCRIPT_LIMITS.timeoutMs,
      );
    },
  };
}
