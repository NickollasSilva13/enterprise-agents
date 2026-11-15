// What the harness adapters share: how a conversation becomes one prompt, how
// the platform's tools are offered to a harness that only writes text, and how
// a harness failure becomes one of the fixed provider messages.
import { randomUUID } from 'node:crypto';
import {
  type ChatEvent,
  type ChatMessage,
  errorKindForStatus,
  ProviderError,
  type StopReason,
  type ToolCallRequest,
  type ToolSpec,
} from './types';

export function stopReasonOf(raw: string | null | undefined): StopReason {
  if (raw === 'max_tokens') return 'max_tokens';
  if (raw === 'refusal') return 'refusal';
  return 'end';
}

/**
 * Turns the harness's own failure text into one of the fixed messages. The
 * text itself never becomes the message: it only picks the kind, and goes to
 * the log, where it is redacted.
 */
export function errorFromHarness(text: string, status?: number | null): ProviderError {
  const lower = text.toLowerCase();
  if (/authenticat|oauth|credential|log ?in|logged in|unauthorized|sign ?in/.test(lower)) {
    return new ProviderError('not_signed_in', undefined, text);
  }
  if (/rate limit|usage limit|quota|too many requests/.test(lower)) {
    return new ProviderError('rate_limited', undefined, text);
  }
  if (typeof status === 'number') {
    return new ProviderError(errorKindForStatus(status), status, text);
  }
  return new ProviderError('rejected', undefined, text);
}

// ---- Tools ------------------------------------------------------------------
//
// The harness runs with every tool of its own switched off, so it cannot call
// the platform's tools natively. Instead the tools are described in its system
// prompt, and a request comes back as a tagged block in the answer. The block
// becomes an ordinary `tool_call` event, so the request takes the same single
// path as with any other provider: PermissionEngine, validation, approval,
// execution (C-15). Only the model's own output is read for blocks, never the
// prompt, so text inside a tool result cannot become a call by itself.

const OPEN = '<tool_call>';
const CLOSE = '</tool_call>';

/** The part of the system prompt that offers the tools and says how to ask. */
export function toolProtocol(tools: readonly ToolSpec[]): string {
  return [
    '# Ferramentas',
    '',
    'Você pode pedir à plataforma que execute as ferramentas abaixo. Para pedir uma, escreva um bloco exatamente neste formato:',
    '',
    OPEN,
    '{"name": "nome_da_ferramenta", "arguments": {"campo": "valor"}}',
    CLOSE,
    '',
    'Regras:',
    '- Dentro do bloco vai só um objeto JSON, com "name" e "arguments"; os argumentos seguem o esquema da ferramenta.',
    '- Pode pedir mais de uma ferramenta, um bloco para cada, um logo depois do outro.',
    '- Depois do último bloco, pare de escrever. Você ainda não sabe o resultado: ele chega na próxima mensagem.',
    '- Nunca escreva por conta própria o resultado de uma ferramenta.',
    '- Quando não precisar de ferramenta, responda normalmente, sem bloco.',
    '',
    'Ferramentas disponíveis:',
    ...tools.flatMap((tool) => [
      '',
      `## ${tool.name}`,
      tool.description,
      `Argumentos (esquema JSON): ${JSON.stringify(tool.parameters)}`,
    ]),
  ].join('\n');
}

/** The system prompt a harness gets: the agent's own, plus the tools if any. */
export function systemWithTools(system: string, tools: readonly ToolSpec[] | undefined): string {
  if (!tools?.length) return system;
  return [system, toolProtocol(tools)].filter((part) => part.trim() !== '').join('\n\n');
}

/**
 * Text from outside the model (a tool result) is kept from looking like the
 * protocol: a stray tag in a file must not read as a block the model wrote.
 * Hygiene for the model's sake only; nothing here is a security control.
 */
function untag(text: string): string {
  return text.replace(/<(\/?)(tool_call|tool_result)\b/gi, '[$1$2');
}

function blockOf(call: ToolCallRequest): string {
  return [OPEN, JSON.stringify({ name: call.name, arguments: call.arguments }), CLOSE].join('\n');
}

function describe(message: ChatMessage): string {
  if (message.role === 'user') return `Usuário: ${message.content}`;
  if (message.role === 'assistant') {
    const said = message.content ? `Você: ${message.content}` : 'Você:';
    return [said, ...(message.toolCalls ?? []).map(blockOf)].join('\n');
  }
  // The runtime already labels the content as data, not instructions.
  return [`<tool_result name="${message.name}">`, untag(message.content), '</tool_result>'].join(
    '\n',
  );
}

/**
 * A harness keeps nothing between calls, so each call carries the whole
 * story: the earlier turns as context, then the message to answer and, when
 * tools were used while answering it, what was asked and what came back.
 */
export function promptOf(messages: readonly ChatMessage[]): string {
  if (messages.length === 0) return '';
  let start = messages.length - 1;
  while (start > 0 && messages[start]?.role !== 'user') start -= 1;
  const asked = messages[start];
  if (!asked) return '';
  const earlier = messages.slice(0, start);
  const progress = messages.slice(start + 1);

  const current = asked.role === 'user' ? asked.content : describe(asked);
  if (earlier.length === 0 && progress.length === 0) return current;

  return [
    ...(earlier.length > 0
      ? ['Conversa até agora, apenas para contexto:', ...earlier.map(describe), '']
      : []),
    'Mensagem atual, responda somente a ela:',
    current,
    ...(progress.length > 0
      ? [
          '',
          'O que já aconteceu enquanto você respondia a esta mensagem:',
          ...progress.map(describe),
          '',
          'Continue a partir daqui: peça outra ferramenta, se precisar, ou escreva a resposta final.',
        ]
      : []),
  ].join('\n');
}

function callOf(value: unknown): { name: string; arguments: unknown } | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.name !== 'string' || record.name.trim() === '') return null;
  return { name: record.name.trim(), arguments: record.arguments ?? {} };
}

/**
 * Splits a harness answer, as it streams, into text and tool calls. Text is
 * passed on as soon as it cannot be the start of a block. Once a call was
 * asked for, the rest of the text is dropped: the model was told to stop
 * there, and anything after it would be a guess at a result it does not have.
 */
export class ToolCallReader {
  private buffer = '';
  private calls = 0;

  /** Whether the answer asked for at least one tool. */
  get askedForTools(): boolean {
    return this.calls > 0;
  }

  push(text: string): ChatEvent[] {
    this.buffer += text;
    const events: ChatEvent[] = [];
    for (;;) {
      const open = this.buffer.indexOf(OPEN);
      if (open === -1) {
        // Hold back what could still become the opening tag.
        const keep = partialTagLength(this.buffer);
        this.say(events, this.buffer.slice(0, this.buffer.length - keep));
        this.buffer = this.buffer.slice(this.buffer.length - keep);
        return events;
      }
      this.say(events, this.buffer.slice(0, open));
      const close = this.buffer.indexOf(CLOSE, open + OPEN.length);
      if (close === -1) {
        this.buffer = this.buffer.slice(open);
        return events;
      }
      const block = this.buffer.slice(open, close + CLOSE.length);
      const body = block.slice(OPEN.length, -CLOSE.length);
      this.buffer = this.buffer.slice(close + CLOSE.length);

      const call = callOf(safeJson(body.trim()));
      if (call) {
        this.calls += 1;
        events.push({ type: 'tool_call', id: `call_${randomUUID()}`, ...call });
      } else {
        // Not a usable request: shown as the text it is, never executed.
        this.say(events, block);
      }
    }
  }

  /** Whatever is left when the answer ends: an unfinished block is just text. */
  end(): ChatEvent[] {
    const events: ChatEvent[] = [];
    this.say(events, this.buffer);
    this.buffer = '';
    return events;
  }

  private say(events: ChatEvent[], text: string): void {
    if (text === '' || this.calls > 0) return;
    events.push({ type: 'text_delta', text });
  }
}

/** Length of the longest end of `text` that is the start of the opening tag. */
function partialTagLength(text: string): number {
  for (let size = Math.min(OPEN.length - 1, text.length); size > 0; size -= 1) {
    if (OPEN.startsWith(text.slice(-size))) return size;
  }
  return 0;
}

/** Null for a line that is not JSON: a harness notice is not an error. */
export function safeJson(line: string): unknown {
  try {
    return JSON.parse(line) as unknown;
  } catch {
    return null;
  }
}
