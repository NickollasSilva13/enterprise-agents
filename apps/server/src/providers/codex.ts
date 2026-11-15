import { z } from 'zod';
import { type CommandRunner, createCommandRunner } from './command';
import { errorFromHarness, promptOf, safeJson, systemWithTools, ToolCallReader } from './harness';
import {
  type ChatEvent,
  type ChatRequest,
  type CommandProviderSettings,
  type ConnectionResult,
  type ModelInfo,
  type ModelProvider,
  ProviderError,
} from './types';

const VERSION_TIMEOUT_MS = 20_000;
const CHAT_IDLE_TIMEOUT_MS = 180_000;

/**
 * Only the account's own model. Codex names its models by itself and this
 * adapter has not been validated against the real program, so inventing a
 * list here would put names in the interface that may not exist.
 */
const MODELS: readonly ModelInfo[] = [
  { name: 'default', displayName: 'Padrão da conta', supportsTools: true },
];

/**
 * NOT VALIDATED (Fase 12). The Codex CLI is not installed on the machine this
 * was written on, so these arguments and the event names below come from its
 * documented non-interactive mode and were only exercised against a simulated
 * program. Everything is parsed leniently and an unknown line is ignored, so a
 * mismatch shows up as "o provedor respondeu em um formato inesperado", never
 * as wrong text in a conversation. Validating this is the first task of the
 * next phase that touches Codex.
 *
 * `exec` is the non-interactive mode, `--json` makes it print one event per
 * line, and the sandbox is pinned to read-only because a harness agent has no
 * tools in this phase: nothing it decides may touch the computer.
 */
const ISOLATION_ARGS: readonly string[] = [
  'exec',
  '--json',
  '--sandbox',
  'read-only',
  '--skip-git-repo-check',
];

const usageSchema = z.object({
  input_tokens: z.number().optional(),
  output_tokens: z.number().optional(),
});

/** Codex wraps each event in `msg`; older builds print it at the root. */
const envelopeSchema = z.object({
  type: z.string().optional(),
  msg: z
    .object({
      type: z.string().optional(),
      delta: z.string().optional(),
      message: z.string().optional(),
      text: z.string().optional(),
      error: z.string().optional(),
      info: z.object({ usage: usageSchema.optional() }).optional(),
      usage: usageSchema.optional(),
    })
    .optional(),
  delta: z.string().optional(),
  message: z.string().optional(),
  text: z.string().optional(),
  error: z.string().optional(),
  usage: usageSchema.optional(),
});

/**
 * Adapter for the Codex CLI installed on this computer, answering through the
 * user's own session. Same contract as every other provider; the platform's
 * tools go through the same text protocol as the Claude Code adapter.
 */
export class CodexProvider implements ModelProvider {
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
    return { detail: version ? `Codex ${version}` : `Codex (${printed || 'sem versão'})` };
  }

  async listModels(): Promise<ModelInfo[]> {
    return MODELS.map((model) => ({ ...model }));
  }

  async *chat(chat: ChatRequest, signal?: AbortSignal): AsyncGenerator<ChatEvent> {
    // Codex has no flag for a system prompt, so the agent's instruction (and
    // the tools, if any) lead the prompt itself.
    const system = systemWithTools(chat.system, chat.tools);
    const prompt = [system, promptOf(chat.messages)].filter(Boolean).join('\n\n');
    if (!prompt.trim()) throw new ProviderError('rejected', undefined, 'empty prompt');

    const args = [
      ...ISOLATION_ARGS,
      ...(chat.model && chat.model !== 'default' ? ['--model', chat.model] : []),
      // Read the prompt from stdin instead of the command line.
      '-',
    ];

    const reader = new ToolCallReader();
    let text = '';
    let usage = { input: 0, output: 0 };

    for await (const line of this.runner.lines(
      { args, stdin: prompt, cwd: chat.workspaceDir, timeoutMs: CHAT_IDLE_TIMEOUT_MS },
      signal,
    )) {
      const parsed = envelopeSchema.safeParse(safeJson(line));
      if (!parsed.success) continue;
      const event = parsed.data.msg ?? parsed.data;
      const kind = event.type ?? '';

      if (kind === 'error' || event.error) {
        throw errorFromHarness(event.error ?? event.message ?? line);
      }
      if (kind.endsWith('message_delta') && event.delta) {
        text += event.delta;
        yield* reader.push(event.delta);
        continue;
      }
      // The finished message arrives whole when no delta was printed.
      if (kind.endsWith('agent_message')) {
        const whole = event.message ?? event.text ?? '';
        if (whole && !text) {
          text = whole;
          yield* reader.push(whole);
        }
        continue;
      }
      const counted = ('info' in event ? event.info?.usage : undefined) ?? event.usage;
      if (counted) {
        usage = {
          input: counted.input_tokens ?? usage.input,
          output: counted.output_tokens ?? usage.output,
        };
      }
    }

    // `codex exec` prints its events and exits; there is no closing event to
    // wait for, so the end of the output is the end of the turn.
    if (!text) {
      throw new ProviderError('invalid_response', undefined, 'no agent message in the output');
    }
    yield* reader.end();
    yield { type: 'usage', inputTokens: usage.input, outputTokens: usage.output };
    yield { type: 'done', stopReason: reader.askedForTools ? 'tool_use' : 'end' };
  }
}
