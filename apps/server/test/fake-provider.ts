import {
  type ChatEvent,
  type ChatRequest,
  type ConnectionResult,
  type ModelInfo,
  type ModelProvider,
  ProviderError,
  type StopReason,
  type ToolCallRequest,
} from '../src/providers/types';

/** One scripted model answer. */
export interface FakeTurn {
  /** Text pieces, sent in order. */
  readonly chunks?: readonly string[];
  /** Tools the model asks for after the text. The id defaults to `call_<n>`. */
  readonly toolCalls?: readonly (Omit<ToolCallRequest, 'id'> & { id?: string })[];
  readonly usage?: { readonly inputTokens: number; readonly outputTokens: number };
  readonly stopReason?: StopReason;
  /** Thrown after the chunks, instead of finishing. */
  readonly error?: Error;
  /** The answer stays open, after the chunks, until this resolves. */
  readonly gate?: Promise<void>;
  /** The answer never ends by itself: only an abort stops it. */
  readonly hang?: boolean;
  /** Keeps producing text and never looks at the abort signal. */
  readonly ignoreAbort?: boolean;
}

const aborted = (signal?: AbortSignal) =>
  new Promise<never>((_, reject) => {
    const fail = () => reject(new ProviderError('cancelled'));
    if (signal?.aborted) fail();
    else signal?.addEventListener('abort', fail, { once: true });
  });

/**
 * An in-process model provider for runtime tests: no network, fully
 * scripted. Turns are consumed one per call; the last one repeats.
 */
export class FakeProvider implements ModelProvider {
  /** Every request received, in order. */
  readonly requests: ChatRequest[] = [];
  /** Signals of the calls, to check that a cancellation reached the provider. */
  readonly signals: (AbortSignal | undefined)[] = [];
  private readonly turns: FakeTurn[];

  constructor(...turns: FakeTurn[]) {
    this.turns = turns.length > 0 ? turns : [{ chunks: ['Olá!'] }];
  }

  async testConnection(): Promise<ConnectionResult> {
    return { detail: 'Fake' };
  }

  async listModels(): Promise<ModelInfo[]> {
    return [{ name: 'fake-model', displayName: 'Fake', supportsTools: true }];
  }

  async *chat(request: ChatRequest, signal?: AbortSignal): AsyncIterable<ChatEvent> {
    this.requests.push(request);
    this.signals.push(signal);
    const turn = this.turns[Math.min(this.requests.length - 1, this.turns.length - 1)] ?? {};

    for (const text of turn.chunks ?? []) {
      if (signal?.aborted && !turn.ignoreAbort) throw new ProviderError('cancelled');
      yield { type: 'text_delta', text };
    }
    if (turn.ignoreAbort) {
      for (;;) {
        await new Promise((resolve) => setTimeout(resolve, 1));
        yield { type: 'text_delta', text: '.' };
      }
    }
    if (turn.gate) await Promise.race([turn.gate, aborted(signal)]);
    if (turn.hang) await aborted(signal);
    if (turn.error) throw turn.error;

    const toolCalls = turn.toolCalls ?? [];
    for (const [index, call] of toolCalls.entries()) {
      yield {
        type: 'tool_call',
        id: call.id ?? `call_${this.requests.length}_${index}`,
        name: call.name,
        arguments: call.arguments,
      };
    }
    yield { type: 'usage', ...(turn.usage ?? { inputTokens: 10, outputTokens: 5 }) };
    yield {
      type: 'done',
      stopReason: turn.stopReason ?? (toolCalls.length > 0 ? 'tool_use' : 'end'),
    };
  }
}

/** A promise and the function that resolves it. */
export function gate(): { promise: Promise<void>; open: () => void } {
  let open = () => {};
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}

/** Polls until `check` returns something truthy; fails after `timeoutMs`. */
export async function waitFor<T>(
  check: () => T | Promise<T>,
  timeoutMs = 3000,
): Promise<NonNullable<T>> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > deadline) throw new Error('waitFor: condition not met in time');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
