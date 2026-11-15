import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { type CommandRunner, createCommandRunner } from './command';
import {
  errorFromHarness,
  promptOf,
  safeJson,
  stopReasonOf,
  systemWithTools,
  ToolCallReader,
} from './harness';
import {
  type ChatEvent,
  type ChatRequest,
  type CommandProviderSettings,
  type ConnectionResult,
  type ModelInfo,
  type ModelProvider,
  ProviderError,
} from './types';

/** Reading `--version` is cheap and does not spend anything from the account. */
const VERSION_TIMEOUT_MS = 20_000;
/** Longest silence tolerated while the harness is answering. */
const CHAT_IDLE_TIMEOUT_MS = 180_000;

/**
 * Model aliases, which the CLI resolves to whatever is current for the
 * account. Dated names would go stale here; the alias does not. They take the
 * platform's tools through the text protocol of `harness.ts` (Fase 13).
 */
const MODELS: readonly ModelInfo[] = [
  { name: 'default', displayName: 'Padrão da conta', supportsTools: true },
  { name: 'opus', displayName: 'Opus', supportsTools: true },
  { name: 'sonnet', displayName: 'Sonnet', supportsTools: true },
  { name: 'haiku', displayName: 'Haiku', supportsTools: true },
];

/**
 * How the harness is pinned down. Without these the child process would pick
 * up the user's own Claude Code setup — CLAUDE.md files, skills, plugins,
 * hooks, MCP servers, custom agents, permission rules — and could run tools
 * on this computer outside the PermissionEngine (SECURITY C-25).
 */
const ISOLATION_ARGS: readonly string[] = [
  '--print',
  '--output-format',
  'stream-json',
  // The CLI refuses stream-json without it.
  '--verbose',
  '--include-partial-messages',
  // Every customization off: no CLAUDE.md, skills, plugins, hooks, MCP servers.
  '--safe-mode',
  '--strict-mcp-config',
  // No built-in tool at all, so there is no tool call to permit or deny.
  '--tools',
  '',
  // Nothing may ask for permission: whatever would prompt is denied.
  '--permission-prompts',
  'none',
  '--disable-slash-commands',
  // The conversation lives in this platform's database, not in the harness.
  '--no-session-persistence',
];

const eventSchema = z.object({ type: z.string() });

const streamEventSchema = z.object({
  event: z.object({
    type: z.string(),
    delta: z.object({ type: z.string().optional(), text: z.string().optional() }).optional(),
  }),
});

/**
 * The CLI caches the prompt on its own, and `input_tokens` leaves out what was
 * written to or read from the cache: on a real call it said 2 while 681 went
 * in. All three count, or the run's token limit would barely move (C-13).
 */
const usageSchema = z
  .object({
    input_tokens: z.number().optional(),
    cache_creation_input_tokens: z.number().nullish(),
    cache_read_input_tokens: z.number().nullish(),
    output_tokens: z.number().optional(),
  })
  .transform((usage) => ({
    input:
      (usage.input_tokens ?? 0) +
      (usage.cache_creation_input_tokens ?? 0) +
      (usage.cache_read_input_tokens ?? 0),
    output: usage.output_tokens ?? 0,
  }));

const assistantSchema = z.object({
  message: z.object({
    content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional(),
    stop_reason: z.string().nullish(),
    usage: usageSchema.optional(),
  }),
});

const resultSchema = z.object({
  is_error: z.boolean().optional(),
  result: z.string().optional(),
  stop_reason: z.string().nullish(),
  usage: usageSchema.optional(),
  api_error_status: z.number().nullish(),
});

/**
 * Adapter for the Claude Code CLI installed on this computer. It answers
 * through the user's own session, so it costs nothing in API tokens. The
 * harness's own tools stay off; the platform's tools are described in the
 * prompt and asked for in the text (`ToolCallReader`), so each tool round is
 * one more run of the program, driven by the RunManager as with any provider.
 */
export class ClaudeCodeProvider implements ModelProvider {
  private readonly runner: CommandRunner;

  constructor(settings: CommandProviderSettings, runner?: CommandRunner) {
    this.runner = runner ?? createCommandRunner(settings.command);
  }

  async testConnection(signal?: AbortSignal): Promise<ConnectionResult> {
    const { code, stdout, stderr } = await this.runner.collect(
      { args: ['--version'], timeoutMs: VERSION_TIMEOUT_MS },
      signal,
    );
    if (code !== 0) {
      throw new ProviderError(
        'program_missing',
        undefined,
        `exit ${code}: ${stderr.slice(0, 500)}`,
      );
    }
    const printed = stdout.trim().split('\n')[0]?.trim() ?? '';
    const version = /(\d+\.\d+\.\d+)/.exec(printed)?.[1];
    // Running the program says nothing about the account being signed in:
    // that only shows up on the first real message.
    return {
      detail: version ? `Claude Code ${version}` : `Claude Code (${printed || 'sem versão'})`,
    };
  }

  async listModels(): Promise<ModelInfo[]> {
    return MODELS.map((model) => ({ ...model }));
  }

  async *chat(chat: ChatRequest, signal?: AbortSignal): AsyncGenerator<ChatEvent> {
    const prompt = promptOf(chat.messages);
    if (!prompt.trim()) {
      throw new ProviderError('rejected', undefined, 'empty prompt');
    }

    const system = systemWithTools(chat.system, chat.tools);
    // A Windows command line holds at most 32,767 characters, and an agent's
    // instructions alone may be longer, so the system prompt goes in a file
    // that lives only while the program runs.
    const folder = system ? mkdtempSync(join(tmpdir(), 'ea-harness-')) : null;
    try {
      yield* this.run(chat, prompt, folder ? writeSystemPrompt(folder, system) : null, signal);
    } finally {
      if (folder) rmSync(folder, { recursive: true, force: true });
    }
  }

  private async *run(
    chat: ChatRequest,
    prompt: string,
    systemFile: string | null,
    signal?: AbortSignal,
  ): AsyncGenerator<ChatEvent> {
    const args = [
      ...ISOLATION_ARGS,
      ...(systemFile ? ['--system-prompt-file', systemFile] : []),
      ...(chat.model && chat.model !== 'default' ? ['--model', chat.model] : []),
    ];

    const reader = new ToolCallReader();
    let streamed = false;
    let fallbackText = '';
    let stopReason: string | null | undefined;
    let usage = { input: 0, output: 0 };

    for await (const line of this.runner.lines(
      {
        args,
        stdin: prompt,
        cwd: chat.workspaceDir,
        timeoutMs: CHAT_IDLE_TIMEOUT_MS,
      },
      signal,
    )) {
      // Anything unexpected on the stream is ignored, never interpreted: the
      // harness prints its own notices, and new event types are not errors.
      const parsed = safeJson(line);
      const head = eventSchema.safeParse(parsed);
      if (!head.success) continue;

      if (head.data.type === 'stream_event') {
        const event = streamEventSchema.safeParse(parsed);
        if (!event.success) continue;
        const { type, delta } = event.data.event;
        if (type === 'content_block_delta' && delta?.type === 'text_delta' && delta.text) {
          streamed = true;
          yield* reader.push(delta.text);
        }
        continue;
      }

      if (head.data.type === 'assistant') {
        const message = assistantSchema.safeParse(parsed);
        if (!message.success) continue;
        stopReason = message.data.message.stop_reason ?? stopReason;
        const text = (message.data.message.content ?? [])
          .filter((block) => block.type === 'text')
          .map((block) => block.text ?? '')
          .join('');
        if (text) fallbackText += text;
        const counted = message.data.message.usage;
        if (counted) {
          usage = {
            input: usage.input + counted.input,
            output: usage.output + counted.output,
          };
        }
        continue;
      }

      if (head.data.type === 'result') {
        const result = resultSchema.safeParse(parsed);
        if (!result.success) {
          throw new ProviderError('invalid_response', undefined, 'unreadable result event');
        }
        const { is_error, result: text, api_error_status } = result.data;
        if (is_error) throw errorFromHarness(text ?? '', api_error_status);

        // Without partial messages there is still the finished text to deliver.
        if (!streamed) yield* reader.push(fallbackText || (text ?? ''));
        yield* reader.end();
        const counted = result.data.usage;
        yield {
          type: 'usage',
          inputTokens: counted?.input ?? usage.input,
          outputTokens: counted?.output ?? usage.output,
        };
        yield {
          type: 'done',
          stopReason: reader.askedForTools
            ? 'tool_use'
            : stopReasonOf(result.data.stop_reason ?? stopReason),
        };
        return;
      }
    }

    throw new ProviderError('invalid_response', undefined, 'stream ended without a result event');
  }
}

function writeSystemPrompt(folder: string, system: string): string {
  const file = join(folder, 'system-prompt.txt');
  // Readable only by this user, where the file system honors the mode.
  writeFileSync(file, system, { encoding: 'utf8', mode: 0o600 });
  return file;
}
