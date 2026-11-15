import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ClaudeCodeProvider } from './claude-code';
import type { CommandResult, CommandRun, CommandRunner } from './command';
import {
  type ChatEvent,
  type ChatRequest,
  type CommandProviderSettings,
  ProviderError,
  type ToolSpec,
} from './types';

const settings: CommandProviderSettings = {
  kind: 'claude_code',
  baseUrl: null,
  command: 'claude',
  apiKey: null,
};

/** The file named after `--system-prompt-file`, if the run had one. */
function systemFileOf(run: CommandRun | undefined): string | null {
  const at = run?.args.indexOf('--system-prompt-file') ?? -1;
  return at === -1 ? null : (run?.args[at + 1] ?? null);
}

/**
 * A simulated CLI: it records how it was called, reads the system prompt file
 * while it "runs" (the file is gone afterwards), and prints a script.
 */
function fake(script: { lines?: string[]; result?: Partial<CommandResult>; fail?: Error }) {
  const runs: CommandRun[] = [];
  const systems: string[] = [];
  const runner: CommandRunner = {
    collect: async (run) => {
      runs.push(run);
      return { code: 0, stdout: '', stderr: '', ...script.result };
    },

    lines: async function* (run) {
      runs.push(run);
      const file = systemFileOf(run);
      if (file) systems.push(readFileSync(file, 'utf8'));
      for (const line of script.lines ?? []) yield line;
      if (script.fail) throw script.fail;
    },
  };
  return { runner, runs, systems, provider: new ClaudeCodeProvider(settings, runner) };
}

const request = (patch: Partial<ChatRequest> = {}): ChatRequest => ({
  model: 'default',
  system: 'Você é a Ana.',
  messages: [{ role: 'user', content: 'Oi' }],
  temperature: 0.7,
  maxOutputTokens: 1000,
  ...patch,
});

async function collect(provider: ClaudeCodeProvider, chat = request()): Promise<ChatEvent[]> {
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

const delta = (text: string) =>
  JSON.stringify({
    type: 'stream_event',
    event: { type: 'content_block_delta', delta: { type: 'text_delta', text } },
  });

const assistant = (text: string) =>
  JSON.stringify({
    type: 'assistant',
    message: {
      content: [{ type: 'text', text }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 12, output_tokens: 5 },
    },
  });

const result = (patch: Record<string, unknown> = {}) =>
  JSON.stringify({
    type: 'result',
    subtype: 'success',
    is_error: false,
    result: 'Olá!',
    stop_reason: 'end_turn',
    usage: { input_tokens: 12, output_tokens: 5 },
    ...patch,
  });

const readFile: ToolSpec = {
  name: 'read_file',
  description: 'Lê um arquivo da pasta de trabalho.',
  parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
};

describe('Claude Code adapter', () => {
  it('reports the installed version without spending anything', async () => {
    const { provider, runs } = fake({ result: { stdout: '2.1.301 (Claude Code)\n' } });
    expect(await provider.testConnection()).toEqual({ detail: 'Claude Code 2.1.301' });
    expect(runs[0]?.args).toEqual(['--version']);
  });

  it('says the program failed when it cannot run', async () => {
    const { provider } = fake({ result: { code: 1, stderr: 'no such thing' } });
    const error = await failure(provider.testConnection());
    expect(error.kind).toBe('program_missing');
  });

  it('offers only aliases, each able to use the platform tools', async () => {
    const { provider } = fake({});
    const models = await provider.listModels();
    expect(models.map((model) => model.name)).toEqual(['default', 'opus', 'sonnet', 'haiku']);
    expect(models.every((model) => model.supportsTools)).toBe(true);
  });

  it('runs the harness with every customization and tool of its own switched off', async () => {
    const { provider, runs, systems } = fake({ lines: [result()] });
    await collect(provider, request({ workspaceDir: 'C:\\dados\\workspaces\\a1' }));

    const args = runs[0]?.args ?? [];
    expect(args.slice(0, 13)).toEqual([
      '--print',
      '--output-format',
      'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--safe-mode',
      '--strict-mcp-config',
      '--tools',
      '',
      '--permission-prompts',
      'none',
      '--disable-slash-commands',
      '--no-session-persistence',
    ]);
    expect(args.slice(13, 14)).toEqual(['--system-prompt-file']);
    expect(args).toHaveLength(15);
    expect(systems).toEqual(['Você é a Ana.']);
    expect(runs[0]?.stdin).toBe('Oi');
    expect(runs[0]?.cwd).toBe('C:\\dados\\workspaces\\a1');
  });

  it('keeps a long system prompt off the command line, and the file only while it runs', async () => {
    // Longer than a whole Windows command line may be.
    const long = 'Instrução. '.repeat(4000);
    const { provider, runs, systems } = fake({ lines: [result()] });
    await collect(provider, request({ system: long }));

    expect(runs[0]?.args.join(' ').length).toBeLessThan(1000);
    expect(systems).toEqual([long]);
    expect(existsSync(systemFileOf(runs[0])!)).toBe(false);
  });

  it('removes the system prompt file when the run fails too', async () => {
    const { provider, runs } = fake({ fail: new ProviderError('timeout') });
    expect((await failure(collect(provider))).kind).toBe('timeout');
    expect(existsSync(systemFileOf(runs[0])!)).toBe(false);
  });

  it('asks for a model only when it is not the account default', async () => {
    const chosen = fake({ lines: [result()] });
    await collect(chosen.provider, request({ model: 'sonnet' }));
    expect(chosen.runs[0]?.args.slice(-2)).toEqual(['--model', 'sonnet']);

    const byDefault = fake({ lines: [result()] });
    await collect(byDefault.provider);
    expect(byDefault.runs[0]?.args).not.toContain('--model');
  });

  it('streams the answer as it arrives', async () => {
    const { provider } = fake({
      lines: [
        JSON.stringify({ type: 'system', subtype: 'init' }),
        delta('Olá'),
        delta(', tudo bem?'),
        assistant('Olá, tudo bem?'),
        result({ result: 'Olá, tudo bem?' }),
      ],
    });
    expect(await collect(provider)).toEqual([
      { type: 'text_delta', text: 'Olá' },
      { type: 'text_delta', text: ', tudo bem?' },
      { type: 'usage', inputTokens: 12, outputTokens: 5 },
      { type: 'done', stopReason: 'end' },
    ]);
  });

  it('delivers the finished text when no partial message came', async () => {
    const { provider } = fake({ lines: [assistant('Resposta inteira.'), result()] });
    expect(await collect(provider)).toEqual([
      { type: 'text_delta', text: 'Resposta inteira.' },
      { type: 'usage', inputTokens: 12, outputTokens: 5 },
      { type: 'done', stopReason: 'end' },
    ]);
  });

  it('falls back to the result text when nothing else carried it', async () => {
    const { provider } = fake({ lines: [result({ result: 'Só no resultado.' })] });
    expect((await collect(provider))[0]).toEqual({
      type: 'text_delta',
      text: 'Só no resultado.',
    });
  });

  it('ignores lines it does not understand', async () => {
    const { provider } = fake({
      lines: ['isto não é json', JSON.stringify({ type: 'novidade', o: 1 }), result()],
    });
    expect(await collect(provider)).toHaveLength(3);
  });

  it('says the harness is not signed in', async () => {
    const { provider } = fake({
      lines: [
        result({
          is_error: true,
          result: 'Failed to authenticate: OAuth session expired and could not be refreshed',
        }),
      ],
    });
    const error = await failure(collect(provider));
    expect(error.kind).toBe('not_signed_in');
    expect(error.message).toContain('não está conectado');
    // The harness text goes to the log, never to the message.
    expect(error.message).not.toContain('OAuth');
  });

  it('recognizes the account limit', async () => {
    const { provider } = fake({
      lines: [result({ is_error: true, result: 'Claude usage limit reached' })],
    });
    expect((await failure(collect(provider))).kind).toBe('rate_limited');
  });

  it('reports a stream that ended with no result', async () => {
    const { provider } = fake({ lines: [delta('metade')] });
    expect((await failure(collect(provider))).kind).toBe('invalid_response');
  });

  it('counts the cached part of the prompt as input, as the real CLI reports it', async () => {
    // The usage of a real call to Claude Code 2.1.325 (Fase 13 validation).
    const { provider } = fake({
      lines: [
        delta('ok'),
        result({
          usage: {
            input_tokens: 2,
            cache_creation_input_tokens: 681,
            cache_read_input_tokens: 0,
            output_tokens: 4,
          },
        }),
      ],
    });
    expect(await collect(provider)).toContainEqual({
      type: 'usage',
      inputTokens: 683,
      outputTokens: 4,
    });
  });

  it('marks a cut-off answer', async () => {
    const { provider } = fake({ lines: [delta('oi'), result({ stop_reason: 'max_tokens' })] });
    expect((await collect(provider)).at(-1)).toEqual({ type: 'done', stopReason: 'max_tokens' });
  });
});

describe('Claude Code adapter with tools (Fase 13)', () => {
  it('describes the tools in the system prompt', async () => {
    const { provider, systems } = fake({ lines: [result()] });
    await collect(provider, request({ tools: [readFile] }));
    const system = systems[0] ?? '';
    expect(system.startsWith('Você é a Ana.')).toBe(true);
    expect(system).toContain('<tool_call>');
    expect(system).toContain('## read_file');
    expect(system).toContain('"required":["path"]');
  });

  it('turns a tool block into a tool call, even split across deltas', async () => {
    const { provider } = fake({
      lines: [
        delta('Vou ler o arquivo. <tool'),
        delta('_call>\n{"name": "read_file", "argu'),
        delta('ments": {"path": "notas.txt"}}\n</tool_call>'),
        // What a model might invent after the block is never shown.
        delta('\nO arquivo diz: tudo certo.'),
        result(),
      ],
    });
    const events = await collect(provider, request({ tools: [readFile] }));
    expect(events.filter((event) => event.type === 'text_delta')).toEqual([
      { type: 'text_delta', text: 'Vou ler o arquivo. ' },
    ]);
    const calls = events.filter((event) => event.type === 'tool_call');
    expect(calls).toMatchObject([{ name: 'read_file', arguments: { path: 'notas.txt' } }]);
    expect(calls[0]?.type === 'tool_call' && calls[0].id).toMatch(/^call_/);
    expect(events.at(-1)).toEqual({ type: 'done', stopReason: 'tool_use' });
  });

  it('reads tool blocks from the finished text when nothing streamed', async () => {
    const { provider } = fake({
      lines: [
        assistant('<tool_call>{"name":"read_file","arguments":{"path":"a.txt"}}</tool_call>'),
        result(),
      ],
    });
    const events = await collect(provider, request({ tools: [readFile] }));
    expect(events[0]).toMatchObject({ type: 'tool_call', name: 'read_file' });
    expect(events.at(-1)).toEqual({ type: 'done', stopReason: 'tool_use' });
  });

  it('shows a malformed block as text and runs nothing', async () => {
    const { provider } = fake({
      lines: [delta('<tool_call>{"name": read_file}</tool_call>'), result()],
    });
    const events = await collect(provider, request({ tools: [readFile] }));
    expect(events.some((event) => event.type === 'tool_call')).toBe(false);
    expect(events[0]).toEqual({
      type: 'text_delta',
      text: '<tool_call>{"name": read_file}</tool_call>',
    });
    expect(events.at(-1)).toEqual({ type: 'done', stopReason: 'end' });
  });
});
