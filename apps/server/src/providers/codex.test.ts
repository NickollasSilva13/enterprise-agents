// The Codex CLI is not installed on the machine this adapter was written on,
// so everything here runs against a simulated program: these tests prove the
// shape of the contract, not that the real Codex answers this way (Fase 12).
import { describe, expect, it } from 'vitest';
import { CodexProvider } from './codex';
import type { CommandResult, CommandRun, CommandRunner } from './command';
import {
  type ChatEvent,
  type ChatRequest,
  type CommandProviderSettings,
  ProviderError,
} from './types';

const settings: CommandProviderSettings = {
  kind: 'codex',
  baseUrl: null,
  command: 'codex',
  apiKey: null,
};

function fake(script: { lines?: string[]; result?: Partial<CommandResult> }) {
  const runs: CommandRun[] = [];
  const runner: CommandRunner = {
    collect: async (run) => {
      runs.push(run);
      return { code: 0, stdout: '', stderr: '', ...script.result };
    },

    lines: async function* (run) {
      runs.push(run);
      for (const line of script.lines ?? []) yield line;
    },
  };
  return { runs, provider: new CodexProvider(settings, runner) };
}

const request = (patch: Partial<ChatRequest> = {}): ChatRequest => ({
  model: 'default',
  system: 'Você é a Ana.',
  messages: [{ role: 'user', content: 'Oi' }],
  temperature: 0.7,
  maxOutputTokens: 1000,
  ...patch,
});

async function collect(provider: CodexProvider, chat = request()): Promise<ChatEvent[]> {
  const events: ChatEvent[] = [];
  for await (const event of provider.chat(chat)) events.push(event);
  return events;
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

const event = (msg: Record<string, unknown>) => JSON.stringify({ msg });

describe('Codex adapter', () => {
  it('reports the installed version', async () => {
    const { provider, runs } = fake({ result: { stdout: 'codex-cli 0.9.3\n' } });
    expect(await provider.testConnection()).toEqual({ detail: 'Codex 0.9.3' });
    expect(runs[0]?.args).toEqual(['--version']);
  });

  it('offers only the account model, able to use the platform tools', async () => {
    const { provider } = fake({});
    expect(await provider.listModels()).toEqual([
      { name: 'default', displayName: 'Padrão da conta', supportsTools: true },
    ]);
  });

  it('runs the harness read-only, with the prompt on stdin', async () => {
    const { provider, runs } = fake({ lines: [event({ type: 'agent_message', message: 'Olá!' })] });
    await collect(provider, request({ workspaceDir: 'C:\\dados\\workspaces\\a1' }));

    expect(runs[0]?.args).toEqual([
      'exec',
      '--json',
      '--sandbox',
      'read-only',
      '--skip-git-repo-check',
      '-',
    ]);
    // Codex has no flag for a system prompt, so it leads the prompt.
    expect(runs[0]?.stdin).toBe('Você é a Ana.\n\nOi');
    expect(runs[0]?.cwd).toBe('C:\\dados\\workspaces\\a1');
  });

  it('asks for a model only when it is not the account default', async () => {
    const chosen = fake({ lines: [event({ type: 'agent_message', message: 'oi' })] });
    await collect(chosen.provider, request({ model: 'gpt-5-codex' }));
    expect(chosen.runs[0]?.args).toContain('--model');

    const byDefault = fake({ lines: [event({ type: 'agent_message', message: 'oi' })] });
    await collect(byDefault.provider);
    expect(byDefault.runs[0]?.args).not.toContain('--model');
  });

  it('streams the answer as it arrives', async () => {
    const { provider } = fake({
      lines: [
        event({ type: 'task_started' }),
        event({ type: 'agent_message_delta', delta: 'Olá' }),
        event({ type: 'agent_message_delta', delta: ', tudo bem?' }),
        event({ type: 'token_count', info: { usage: { input_tokens: 10, output_tokens: 3 } } }),
      ],
    });
    expect(await collect(provider)).toEqual([
      { type: 'text_delta', text: 'Olá' },
      { type: 'text_delta', text: ', tudo bem?' },
      { type: 'usage', inputTokens: 10, outputTokens: 3 },
      { type: 'done', stopReason: 'end' },
    ]);
  });

  it('delivers the finished message when no delta came', async () => {
    const { provider } = fake({
      lines: [event({ type: 'agent_message', message: 'Resposta inteira.' })],
    });
    expect((await collect(provider))[0]).toEqual({
      type: 'text_delta',
      text: 'Resposta inteira.',
    });
  });

  it('says the harness is not signed in', async () => {
    const { provider } = fake({
      lines: [event({ type: 'error', message: 'You must log in with your account first' })],
    });
    const error = await failure(collect(provider));
    expect(error.kind).toBe('not_signed_in');
    expect(error.message).not.toContain('log in');
  });

  it('reports output with no answer in it', async () => {
    const { provider } = fake({ lines: [event({ type: 'task_started' })] });
    expect((await failure(collect(provider))).kind).toBe('invalid_response');
  });

  it('offers the tools in the prompt and reads a tool block from the answer (Fase 13)', async () => {
    const { provider, runs } = fake({
      lines: [
        event({ type: 'agent_message_delta', delta: 'Lendo. <tool_call>{"name":"read_file",' }),
        event({ type: 'agent_message_delta', delta: '"arguments":{"path":"a.txt"}}</tool_call>' }),
      ],
    });
    const events = await collect(
      provider,
      request({ tools: [{ name: 'read_file', description: 'Lê.', parameters: {} }] }),
    );

    expect(runs[0]?.stdin).toContain('## read_file');
    expect(runs[0]?.stdin?.endsWith('Oi')).toBe(true);
    expect(events[0]).toEqual({ type: 'text_delta', text: 'Lendo. ' });
    expect(events[1]).toMatchObject({
      type: 'tool_call',
      name: 'read_file',
      arguments: { path: 'a.txt' },
    });
    expect(events.at(-1)).toEqual({ type: 'done', stopReason: 'tool_use' });
  });
});
