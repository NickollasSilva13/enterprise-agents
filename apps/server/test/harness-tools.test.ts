// A harness agent using the platform's tools, end to end through the API and
// the real RunManager. The Claude Code program is simulated (no account is
// signed in on this machine), but everything after its output is real: the
// adapter reading the tool block, the PermissionEngine, approval, the tool,
// the steps and the next run of the program with the result (Fase 13).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  approvalListSchema,
  conversationDetailSchema,
  type RunDetail,
  runAcceptedSchema,
  runDetailSchema,
} from '@ea/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { newId } from '../src/db/ids';
import { providers } from '../src/db/schema';
import { ClaudeCodeProvider } from '../src/providers/claude-code';
import type { CommandRun, CommandRunner } from '../src/providers/command';
import { waitFor } from './fake-provider';
import { addAgent, addModel, grantTools } from './fixtures';
import { makeApp, type TestApp } from './helpers';

/** One run of the simulated program: what it was given, and what it printed. */
interface Seen {
  readonly run: CommandRun;
  readonly system: string;
}

const delta = (text: string) =>
  JSON.stringify({
    type: 'stream_event',
    event: { type: 'content_block_delta', delta: { type: 'text_delta', text } },
  });
const result = () =>
  JSON.stringify({
    type: 'result',
    is_error: false,
    result: '',
    stop_reason: 'end_turn',
    usage: { input_tokens: 30, output_tokens: 10 },
  });
/** What the program prints for one answer. */
const answer = (...texts: string[]) => [...texts.map(delta), result()];
const toolBlock = (name: string, args: Record<string, unknown>) =>
  `<tool_call>${JSON.stringify({ name, arguments: args })}</tool_call>`;

/** A Claude Code that answers each run with the next script, in order. */
function scriptedClaude(scripts: string[][]): { runner: CommandRunner; seen: Seen[] } {
  const seen: Seen[] = [];
  const runner: CommandRunner = {
    collect: async () => ({ code: 0, stdout: '2.1.301 (Claude Code)', stderr: '' }),
    lines: async function* (run) {
      const at = run.args.indexOf('--system-prompt-file');
      const file = at === -1 ? undefined : run.args[at + 1];
      seen.push({ run, system: file ? readFileSync(file, 'utf8') : '' });
      for (const line of scripts[seen.length - 1] ?? answer('(sem roteiro)')) yield line;
    },
  };
  return { runner, seen };
}

let current: TestApp | undefined;
afterEach(async () => {
  await current?.close();
  current = undefined;
});

async function setup(scripts: string[][], grants: Record<string, 'ask' | 'allow'> = {}) {
  const claude = scriptedClaude(scripts);
  const test = await makeApp({
    createProvider: (settings) =>
      new ClaudeCodeProvider({ ...settings, command: 'claude' }, claude.runner),
  });
  current = test;
  const providerId = newId();
  test.database.db
    .insert(providers)
    .values({
      id: providerId,
      name: 'Claude Code',
      kind: 'claude_code',
      baseUrl: null,
      command: 'claude',
      isExternal: true,
    })
    .run();
  const modelId = addModel(test.database, providerId, 'sonnet', { supportsTools: true });
  const agentId = addAgent(test.database, {
    name: 'Escritora',
    modelId,
    systemPrompt: 'Seja breve.',
  });
  grantTools(test.database, agentId, grants);

  const call = async (method: 'GET' | 'POST', url: string, payload?: unknown) => {
    const response = await test.app.inject({
      method,
      url,
      headers: test.trusted,
      ...(payload === undefined ? {} : { payload: payload as object }),
    });
    return { status: response.statusCode, body: response.body ? response.json<unknown>() : null };
  };
  const detail = async (runId: string) =>
    runDetailSchema.parse((await call('GET', `/api/runs/${runId}`)).body);

  return {
    ...claude,
    call,
    workspace: join(test.dataDir, 'workspaces', agentId),
    start: async (content: string) => {
      const { status, body } = await call('POST', '/api/conversations', { agentId, content });
      expect(status).toBe(202);
      return runAcceptedSchema.parse(body).runId;
    },
    finished: (runId: string) =>
      waitFor(async () => {
        const found = await detail(runId);
        return found.run.finishedAt ? found : null;
      }),
    /** What the agent answered, as saved in the conversation. */
    answerOf: async (found: RunDetail) => {
      const { messages } = conversationDetailSchema.parse(
        (await call('GET', `/api/conversations/${found.run.conversationId ?? ''}`)).body,
      );
      return messages.findLast((message) => message.role === 'assistant')?.text;
    },
  };
}

const stepTypes = (found: RunDetail) => found.steps.map((step) => step.type);

describe('harness agents with platform tools (Fase 13)', () => {
  it('writes a file it was allowed to, and answers with the result in hand', async () => {
    const s = await setup(
      [
        answer(
          'Vou anotar. ',
          toolBlock('write_file', { path: 'nota.txt', content: 'comprar pão' }),
        ),
        answer('Anotei em nota.txt.'),
      ],
      { write_file: 'allow' },
    );
    const found = await s.finished(await s.start('Anote: comprar pão.'));

    expect(found.run.status).toBe('completed');
    expect(readFileSync(join(s.workspace, 'nota.txt'), 'utf8')).toBe('comprar pão');
    expect(stepTypes(found)).toEqual([
      'run_started',
      'model_call_started',
      'model_call_finished',
      'tool_call_requested',
      'tool_call_finished',
      'model_call_started',
      'model_call_finished',
      'run_finished',
    ]);
    // The block is not part of the answer; what came before and after it is.
    expect(await s.answerOf(found)).toBe('Vou anotar. \n\nAnotei em nota.txt.');

    // Each step is a new run of the program, carrying what happened so far.
    expect(s.seen).toHaveLength(2);
    expect(s.seen[0]?.system).toContain('## write_file');
    expect(s.seen[0]?.system.startsWith('Seja breve.')).toBe(true);
    expect(s.seen[1]?.run.stdin).toContain('<tool_result name="write_file">');
    expect(s.seen[1]?.run.stdin).toContain('"path":"nota.txt"');
    expect(s.seen[1]?.run.cwd).toBe(s.workspace);
  });

  it('never runs a tool that was not granted, whatever the harness writes (C-15)', async () => {
    const s = await setup(
      [
        answer(toolBlock('write_file', { path: 'invasao.txt', content: 'x' })),
        answer('Não consegui escrever.'),
      ],
      { read_file: 'allow' },
    );
    const found = await s.finished(await s.start('Escreva um arquivo.'));

    expect(found.run.status).toBe('completed');
    expect(existsSync(join(s.workspace, 'invasao.txt'))).toBe(false);
    // The tools the agent has are the only ones described to the harness.
    expect(s.seen[0]?.system).toContain('## read_file');
    expect(s.seen[0]?.system).not.toContain('## write_file');
    expect(s.seen[1]?.run.stdin).toContain('<tool_result name="write_file">');
    expect(s.seen[1]?.run.stdin).toMatch(/não (está|foi) (liberada|concedida|permitida)|negad/i);
  });

  it('waits for approval with no harness running, then goes on (C-16)', async () => {
    const s = await setup(
      [answer(toolBlock('write_file', { path: 'aprovado.txt', content: 'ok' })), answer('Feito.')],
      { write_file: 'ask' },
    );
    const runId = await s.start('Escreva.');

    const approval = await waitFor(async () => {
      const { approvals } = approvalListSchema.parse((await s.call('GET', '/api/approvals')).body);
      return approvals[0];
    });
    // Nothing was written before the decision, and the program is not kept alive.
    expect(existsSync(join(s.workspace, 'aprovado.txt'))).toBe(false);
    expect(s.seen).toHaveLength(1);

    const decided = await s.call('POST', `/api/approvals/${approval.id}/decision`, {
      decision: 'approve',
    });
    expect(decided.status).toBe(200);
    const found = await s.finished(runId);
    expect(found.run.status).toBe('completed');
    expect(readFileSync(join(s.workspace, 'aprovado.txt'), 'utf8')).toBe('ok');
    expect(s.seen).toHaveLength(2);
  });

  it('offers no tools to the harness when the agent has none', async () => {
    const s = await setup([answer('Olá!')]);
    const found = await s.finished(await s.start('Oi'));
    expect(await s.answerOf(found)).toBe('Olá!');
    expect(s.seen[0]?.system).toBe('Seja breve.');
  });
});
