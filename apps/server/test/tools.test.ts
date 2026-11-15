import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  agentToolsSchema,
  type Approval,
  approvalListSchema,
  approvalSchema,
  dashboardSummarySchema,
  officeSchema,
  type RunAccepted,
  runAcceptedSchema,
  type RunDetail,
  runDetailSchema,
  toolCatalogueSchema,
} from '@ea/shared';
import { desc, eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { agents, auditLog, models, providers, toolCalls } from '../src/db/schema';
import { FakeProvider, type FakeTurn, waitFor } from './fake-provider';
import { addAgent, addModel, addProvider, grantTools } from './fixtures';
import { makeApp, type TestApp } from './helpers';

interface Setup extends TestApp {
  readonly provider: FakeProvider;
  readonly modelId: string;
  readonly agentId: string;
  call(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH',
    url: string,
    payload?: unknown,
  ): Promise<{ status: number; body: unknown }>;
  start(content?: string, agentId?: string): Promise<RunAccepted>;
  detail(runId: string): Promise<RunDetail>;
  finished(runId: string): Promise<RunDetail>;
  pending(): Promise<Approval>;
  workspace(agentId?: string): string;
  audit(action: string): (typeof auditLog.$inferSelect)[];
}

let current: TestApp | undefined;
afterEach(async () => {
  await current?.close();
  current = undefined;
});

async function setup(
  options: {
    turns?: FakeTurn[];
    grants?: Record<string, 'ask' | 'allow'>;
    env?: Record<string, string>;
    supportsTools?: boolean;
  } = {},
): Promise<Setup> {
  const provider = new FakeProvider(...(options.turns ?? []));
  const test = await makeApp({ createProvider: () => provider, env: options.env ?? {} });
  current = test;
  const modelId = addModel(test.database, addProvider(test.database), 'fake-model', {
    supportsTools: options.supportsTools ?? true,
  });
  const agentId = addAgent(test.database, { name: 'Coordenador', modelId });
  grantTools(test.database, agentId, options.grants ?? {});

  const call: Setup['call'] = async (method, url, payload) => {
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
    ...test,
    provider,
    modelId,
    agentId,
    call,
    detail,
    start: async (content = 'Faça.', id = agentId) => {
      const { status, body } = await call('POST', '/api/conversations', { agentId: id, content });
      expect(status).toBe(202);
      return runAcceptedSchema.parse(body);
    },
    finished: (runId) =>
      waitFor(async () => {
        const found = await detail(runId);
        return found.run.finishedAt ? found : null;
      }),
    pending: () =>
      waitFor(async () => {
        const { approvals } = approvalListSchema.parse((await call('GET', '/api/approvals')).body);
        return approvals[0];
      }),
    workspace: (id = agentId) => join(test.dataDir, 'workspaces', id),
    audit: (action) =>
      test.database.db
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, action))
        .orderBy(desc(auditLog.id))
        .all(),
  };
}

const writeNote: FakeTurn = {
  toolCalls: [{ name: 'write_file', arguments: { path: 'notas/a.txt', content: 'conteúdo' } }],
};
const done: FakeTurn = { chunks: ['Pronto.'] };
const stepTypes = (detail: RunDetail) => detail.steps.map((step) => step.type);

describe('tool catalogue and installation switch (RF-50, RF-52)', () => {
  it('lists the tools with risk and state; scripts start switched off', async () => {
    const s = await setup();
    const { tools } = toolCatalogueSchema.parse((await s.call('GET', '/api/tools')).body);
    expect(tools.map((tool) => [tool.name, tool.risk, tool.maxPermission, tool.enabled])).toEqual([
      ['read_file', 'low', 'allow', true],
      ['list_dir', 'low', 'allow', true],
      ['write_file', 'medium', 'allow', true],
      ['fetch_url', 'medium', 'allow', true],
      ['delegate_to_agent', 'medium', 'allow', true],
      ['run_script', 'high', 'ask', false],
    ]);
  });

  it('switches the script tool on and off, with an audit entry (C-20, C-23)', async () => {
    const s = await setup();
    const on = await s.call('PATCH', '/api/tools/run_script', { enabled: true });
    expect(on).toMatchObject({ status: 200, body: { name: 'run_script', enabled: true } });
    expect(s.audit('tool.enabled')).toMatchObject([{ actor: 'user', target: 'run_script' }]);

    const off = await s.call('PATCH', '/api/tools/run_script', { enabled: false });
    expect(off.body).toMatchObject({ enabled: false });
    expect(s.audit('tool.disabled')).toHaveLength(1);
  });

  it('refuses to switch other tools, unknown tools and bad input', async () => {
    const s = await setup();
    expect(await s.call('PATCH', '/api/tools/read_file', { enabled: false })).toMatchObject({
      status: 409,
      body: { code: 'tool_always_available' },
    });
    expect((await s.call('PATCH', '/api/tools/ghost', { enabled: true })).status).toBe(404);
    expect((await s.call('PATCH', '/api/tools/run_script', { enabled: 'yes' })).status).toBe(400);
    expect(
      (await s.call('PATCH', '/api/tools/run_script', { enabled: true, risk: 'low' })).status,
    ).toBe(400);
  });
});

describe('per-agent permissions (RF-16, RF-53)', () => {
  it('starts with nothing granted and shows the workspace folder (RF-55)', async () => {
    const s = await setup();
    const tools = agentToolsSchema.parse(
      (await s.call('GET', `/api/agents/${s.agentId}/tools`)).body,
    );
    expect(tools).toEqual({
      agentId: s.agentId,
      workspacePath: s.workspace(),
      modelSupportsTools: true,
      grants: [],
    });
  });

  it('replaces the grants and records what changed (C-23)', async () => {
    const s = await setup({ grants: { fetch_url: 'allow' } });
    const { status, body } = await s.call('PUT', `/api/agents/${s.agentId}/tools`, {
      grants: [
        { toolName: 'read_file', permission: 'allow' },
        { toolName: 'write_file', permission: 'ask' },
        { toolName: 'list_dir', permission: 'deny' },
      ],
    });
    expect(status).toBe(200);
    expect(agentToolsSchema.parse(body).grants).toEqual([
      { toolName: 'read_file', permission: 'allow' },
      { toolName: 'write_file', permission: 'ask' },
    ]);
    expect(s.audit('agent.tools_changed')[0]).toMatchObject({
      actor: 'user',
      agentId: s.agentId,
      details: {
        changes: {
          read_file: { from: 'deny', to: 'allow' },
          write_file: { from: 'deny', to: 'ask' },
          fetch_url: { from: 'allow', to: 'deny' },
        },
      },
    });
  });

  it('refuses "allow" for a high-risk tool, unknown tools and repeats (C-16)', async () => {
    const s = await setup();
    const put = (grants: unknown) => s.call('PUT', `/api/agents/${s.agentId}/tools`, { grants });

    expect((await put([{ toolName: 'run_script', permission: 'allow' }])).status).toBe(400);
    expect((await put([{ toolName: 'run_script', permission: 'ask' }])).status).toBe(200);
    expect((await put([{ toolName: 'ghost', permission: 'allow' }])).status).toBe(400);
    expect(
      (
        await put([
          { toolName: 'read_file', permission: 'allow' },
          { toolName: 'read_file', permission: 'ask' },
        ])
      ).status,
    ).toBe(400);
    expect((await put([{ toolName: 'read_file', permission: 'sempre' }])).status).toBe(400);
    expect((await s.call('GET', '/api/agents/nope/tools')).status).toBe(404);
  });

  it('requires a session like every other route (C-04)', async () => {
    const s = await setup();
    for (const url of ['/api/tools', '/api/approvals', `/api/agents/${s.agentId}/tools`]) {
      const response = await s.app.inject({
        method: 'GET',
        url,
        headers: { host: s.trusted.host ?? '', 'sec-fetch-site': 'same-origin' },
      });
      expect(response.statusCode).toBe(401);
    }
  });
});

describe('runs with tools', () => {
  it('lets an agent write in its own folder when that was allowed', async () => {
    const s = await setup({ turns: [writeNote, done], grants: { write_file: 'allow' } });
    const { runId } = await s.start();
    const detail = await s.finished(runId);

    expect(detail.run).toMatchObject({ status: 'completed', endReason: 'completed' });
    expect(readFileSync(join(s.workspace(), 'notas', 'a.txt'), 'utf8')).toBe('conteúdo');
    expect(stepTypes(detail)).toEqual([
      'run_started',
      'model_call_started',
      'model_call_finished',
      'tool_call_requested',
      'tool_call_finished',
      'model_call_started',
      'model_call_finished',
      'run_finished',
    ]);
    expect(s.provider.requests[0]?.tools?.map((tool) => tool.name)).toEqual(['write_file']);
    expect(s.provider.requests[0]?.system).toContain('Você tem ferramentas.');
    expect(s.audit('tool.executed')).toMatchObject([
      { actor: 'agent', target: 'write_file', agentId: s.agentId, runId },
    ]);
  });

  it('blocks a tool that was not granted, whatever the model asks (C-15, RN-03)', async () => {
    const s = await setup({ turns: [writeNote, done], grants: { read_file: 'allow' } });
    const { runId } = await s.start();
    const detail = await s.finished(runId);

    expect(detail.run.status).toBe('completed');
    expect(existsSync(join(s.workspace(), 'notas', 'a.txt'))).toBe(false);
    expect(detail.steps.find((step) => step.type === 'tool_call_finished')?.payload).toMatchObject({
      tool: 'write_file',
      status: 'denied',
    });
    expect(s.provider.requests[1]?.messages.at(-1)).toMatchObject({ role: 'tool', isError: true });
    expect(s.audit('tool.executed')).toEqual([]);
  });

  it('keeps the agent inside its folder even with write permission (C-17)', async () => {
    const s = await setup({
      turns: [
        {
          toolCalls: [
            { name: 'write_file', arguments: { path: '../../fora.txt', content: 'x' } },
            {
              name: 'write_file',
              arguments: { path: 'C:\\Windows\\Temp\\fora.txt', content: 'x' },
            },
          ],
        },
        done,
      ],
      grants: { write_file: 'allow' },
    });
    const { runId } = await s.start();
    const detail = await s.finished(runId);

    expect(existsSync(join(s.dataDir, 'fora.txt'))).toBe(false);
    const results = detail.steps.filter((step) => step.type === 'tool_call_finished');
    expect(results.map((step) => step.payload.status)).toEqual(['failed', 'failed']);
    expect(String(results[0]?.payload.preview)).toContain('não pode sair da pasta de trabalho');
  });

  it('does not offer tools to a model that cannot call them', async () => {
    const s = await setup({ grants: { write_file: 'allow' }, supportsTools: false });
    const { runId } = await s.start();
    await s.finished(runId);
    expect(s.provider.requests[0]?.tools).toBeUndefined();
    expect(s.provider.requests[0]?.system).not.toContain('ferramentas');
  });

  it('reaches the step limit when the model never stops calling tools (C-13)', async () => {
    const s = await setup({
      turns: [{ toolCalls: [{ name: 'list_dir', arguments: {} }] }],
      grants: { list_dir: 'allow' },
    });
    s.database.db.update(agents).set({ maxSteps: 2 }).run();
    const { runId } = await s.start();
    expect((await s.finished(runId)).run).toMatchObject({
      status: 'failed',
      endReason: 'step_limit',
    });
    expect(s.provider.requests).toHaveLength(2);
  });
});

describe('approvals (RF-54, UC-05, C-16)', () => {
  it('pauses the run, shows the exact arguments and runs the tool once approved', async () => {
    const s = await setup({ turns: [writeNote, done], grants: { write_file: 'ask' } });
    const { runId, conversationId } = await s.start();
    const approval = await s.pending();

    expect(approval).toMatchObject({
      runId,
      originRunId: runId,
      agentId: s.agentId,
      agentName: 'Coordenador',
      conversationId,
      toolName: 'write_file',
      toolTitle: 'Escrever arquivo',
      risk: 'medium',
      arguments: { path: 'notas/a.txt', content: 'conteúdo' },
      status: 'pending',
    });
    // Nothing was written, and the whole application shows the agent waiting.
    expect(existsSync(join(s.workspace(), 'notas', 'a.txt'))).toBe(false);
    expect((await s.detail(runId)).run.status).toBe('waiting_approval');
    const dashboard = dashboardSummarySchema.parse(
      (await s.call('GET', '/api/dashboard/summary')).body,
    );
    expect(dashboard).toMatchObject({ pendingApprovals: 1, agents: { waiting: 1 } });
    const office = officeSchema.parse((await s.call('GET', '/api/office')).body);
    expect(office.rooms[0]?.agents[0]).toMatchObject({
      state: 'waiting',
      pendingApproval: { id: approval.id, toolTitle: 'Escrever arquivo' },
    });

    const decided = await s.call('POST', `/api/approvals/${approval.id}/decision`, {
      decision: 'approve',
    });
    expect(decided.status).toBe(200);
    expect(approvalSchema.parse(decided.body)).toMatchObject({ status: 'approved' });

    const detail = await s.finished(runId);
    expect(detail.run.status).toBe('completed');
    expect(readFileSync(join(s.workspace(), 'notas', 'a.txt'), 'utf8')).toBe('conteúdo');
    expect(stepTypes(detail).slice(3, 7)).toEqual([
      'tool_call_requested',
      'approval_requested',
      'approval_decided',
      'tool_call_finished',
    ]);
    expect(s.audit('approval.approved')).toMatchObject([
      { actor: 'user', target: 'write_file', agentId: s.agentId, runId },
    ]);

    // Answered: it leaves the queue and cannot be answered again.
    expect(
      approvalListSchema.parse((await s.call('GET', '/api/approvals')).body).approvals,
    ).toEqual([]);
    const decidedList = approvalListSchema.parse(
      (await s.call('GET', '/api/approvals?status=decided')).body,
    );
    expect(decidedList.approvals.map((entry) => entry.id)).toEqual([approval.id]);
    expect(
      await s.call('POST', `/api/approvals/${approval.id}/decision`, { decision: 'deny' }),
    ).toMatchObject({ status: 409, body: { code: 'approval_not_pending' } });
  });

  it('never runs a denied tool; the agent is told and goes on', async () => {
    const s = await setup({ turns: [writeNote, done], grants: { write_file: 'ask' } });
    const { runId } = await s.start();
    const approval = await s.pending();

    const decided = await s.call('POST', `/api/approvals/${approval.id}/decision`, {
      decision: 'deny',
      reason: 'Não mexa nisso.',
    });
    expect(decided.body).toMatchObject({ status: 'denied', reason: 'Não mexa nisso.' });

    expect((await s.finished(runId)).run.status).toBe('completed');
    expect(existsSync(join(s.workspace(), 'notas', 'a.txt'))).toBe(false);
    expect(s.provider.requests[1]?.messages.at(-1)).toMatchObject({
      role: 'tool',
      isError: true,
      content: expect.stringContaining(
        'O usuário negou esta ação. Motivo: Não mexa nisso.',
      ) as string,
    });
    expect(s.audit('approval.denied')).toHaveLength(1);
    expect(s.audit('tool.executed')).toEqual([]);
  });

  it('withdraws the request when the run is cancelled (RN-09)', async () => {
    const s = await setup({ turns: [writeNote, done], grants: { write_file: 'ask' } });
    const { runId } = await s.start();
    const approval = await s.pending();

    expect((await s.call('POST', `/api/runs/${runId}/cancel`)).status).toBe(202);
    expect((await s.finished(runId)).run.status).toBe('cancelled');
    const { approvals } = approvalListSchema.parse(
      (await s.call('GET', '/api/approvals?status=decided')).body,
    );
    expect(approvals).toMatchObject([{ id: approval.id, status: 'cancelled' }]);
    expect(
      (await s.call('POST', `/api/approvals/${approval.id}/decision`, { decision: 'approve' }))
        .status,
    ).toBe(409);
    expect(existsSync(join(s.workspace(), 'notas', 'a.txt'))).toBe(false);
    expect(s.database.db.select({ status: toolCalls.status }).from(toolCalls).all()).toEqual([
      { status: 'cancelled' },
    ]);
  });

  it('validates the decision', async () => {
    const s = await setup();
    expect(
      (await s.call('POST', '/api/approvals/nope/decision', { decision: 'approve' })).status,
    ).toBe(404);
    expect(
      (await s.call('POST', '/api/approvals/nope/decision', { decision: 'maybe' })).status,
    ).toBe(400);
    expect(
      (
        await s.call('POST', '/api/approvals/nope/decision', {
          decision: 'deny',
          reason: 'x'.repeat(501),
        })
      ).status,
    ).toBe(400);
  });
});

describe('script tool through the API (C-20)', () => {
  const runIt: FakeTurn = { toolCalls: [{ name: 'run_script', arguments: { path: 'oi.js' } }] };

  it('does nothing while the tool is switched off, even if granted', async () => {
    const s = await setup({ turns: [runIt, done], grants: { run_script: 'ask' } });
    const { runId } = await s.start();
    const detail = await s.finished(runId);
    expect(detail.steps.find((step) => step.type === 'tool_call_requested')?.payload).toMatchObject(
      {
        permission: 'deny',
        reason: 'tool_disabled',
      },
    );
    // Not even described to the model.
    expect(s.provider.requests[0]?.tools).toBeUndefined();
  });

  it('once switched on, still asks before every run, even with a stored "allow"', async () => {
    const s = await setup({
      turns: [
        {
          toolCalls: [
            {
              name: 'write_file',
              arguments: { path: 'oi.js', content: 'console.log("oi do script")' },
            },
          ],
        },
        runIt,
        done,
      ],
      grants: { write_file: 'allow' },
    });
    // A grant the API would refuse, written straight to the database.
    grantTools(s.database, s.agentId, { run_script: 'allow' });
    await s.call('PATCH', '/api/tools/run_script', { enabled: true });

    const { runId } = await s.start();
    const approval = await s.pending();
    expect(approval).toMatchObject({
      toolName: 'run_script',
      risk: 'high',
      arguments: { path: 'oi.js' },
    });

    await s.call('POST', `/api/approvals/${approval.id}/decision`, { decision: 'approve' });
    const detail = await s.finished(runId);
    expect(detail.run.status).toBe('completed');
    const results = detail.steps.filter((step) => step.type === 'tool_call_finished');
    expect(results.at(-1)?.payload).toMatchObject({ status: 'completed', preview: 'oi do script' });
    expect(s.audit('tool.executed').map((entry) => entry.target)).toEqual([
      'run_script',
      'write_file',
    ]);
  });
});

describe('delegation (RF-60 to RF-63, UC-06)', () => {
  const delegateTo = (agent: string, task = 'Revise o texto.'): FakeTurn => ({
    toolCalls: [{ name: 'delegate_to_agent', arguments: { agent, task } }],
  });
  const addSpecialist = (s: Setup, name: string, grants: Record<string, 'ask' | 'allow'> = {}) => {
    const id = addAgent(s.database, { name, modelId: s.modelId, objective: `Cuida de ${name}` });
    grantTools(s.database, id, grants);
    return id;
  };

  it('runs the specialist as a child run and shows the tree', async () => {
    const s = await setup({
      turns: [delegateTo('revisor'), { chunks: ['Texto revisado.'] }, { chunks: ['Entregue.'] }],
      grants: { delegate_to_agent: 'allow' },
    });
    const specialistId = addSpecialist(s, 'Revisor');
    const { runId } = await s.start();
    const detail = await s.finished(runId);

    expect(detail.run).toMatchObject({ status: 'completed', parentRunId: null });
    expect(detail.tree).toHaveLength(2);
    expect(detail.tree[0]).toMatchObject({ depth: 0, run: { id: runId } });
    const child = detail.tree[1]?.run;
    expect(detail.tree[1]?.depth).toBe(1);
    expect(child).toMatchObject({
      agentId: specialistId,
      agentName: 'Revisor',
      parentRunId: runId,
      trigger: 'delegation',
      status: 'completed',
    });
    expect(detail.steps.find((step) => step.type === 'delegation_started')?.payload).toEqual({
      childRunId: child?.id,
      agentId: specialistId,
      agentName: 'Revisor',
    });
    // The child sees the same tree, and its own conversation holds the task.
    const childDetail = await s.detail(child?.id ?? '');
    expect(childDetail.tree.map((node) => node.run.id)).toEqual([runId, child?.id]);
    expect(s.provider.requests[1]?.messages).toEqual([
      { role: 'user', content: 'Revise o texto.' },
    ]);
    expect(s.provider.requests[0]?.system).toContain('- Revisor: Cuida de Revisor');
    expect(s.provider.requests[2]?.messages.at(-1)).toMatchObject({
      role: 'tool',
      content: expect.stringContaining('Texto revisado.') as string,
    });
    expect(s.audit('agent.delegated')).toMatchObject([
      { actor: 'agent', agentId: s.agentId, runId },
    ]);
  });

  it('does not hand the permissions of the delegator to the other agent (C-22)', async () => {
    const s = await setup({
      turns: [delegateTo('Revisor'), writeNote, done, done],
      grants: { delegate_to_agent: 'allow', write_file: 'allow' },
    });
    const specialistId = addSpecialist(s, 'Revisor');
    const { runId } = await s.start();
    const detail = await s.finished(runId);

    expect(existsSync(join(s.workspace(specialistId), 'notas', 'a.txt'))).toBe(false);
    expect(existsSync(join(s.workspace(), 'notas', 'a.txt'))).toBe(false);
    const childDetail = await s.detail(detail.tree[1]?.run.id ?? '');
    expect(
      childDetail.steps.find((step) => step.type === 'tool_call_finished')?.payload,
    ).toMatchObject({ tool: 'write_file', status: 'denied' });
    // The specialist was not even told about tools it does not have.
    expect(s.provider.requests[1]?.tools).toBeUndefined();
  });

  it('gives each agent its own folder (RF-55)', async () => {
    const s = await setup({
      turns: [delegateTo('Revisor'), writeNote, done, done],
      grants: { delegate_to_agent: 'allow' },
    });
    const specialistId = addSpecialist(s, 'Revisor', { write_file: 'allow' });
    await s.finished((await s.start()).runId);
    expect(existsSync(join(s.workspace(specialistId), 'notas', 'a.txt'))).toBe(true);
    expect(existsSync(join(s.workspace(), 'notas', 'a.txt'))).toBe(false);
  });

  it('refuses a cycle in the chain, including an agent delegating to itself (C-21)', async () => {
    const s = await setup({
      turns: [delegateTo('Revisor'), delegateTo('Coordenador'), delegateTo('Revisor'), done, done],
      grants: { delegate_to_agent: 'allow' },
    });
    addSpecialist(s, 'Revisor', { delegate_to_agent: 'allow' });
    const detail = await s.finished((await s.start()).runId);

    expect(detail.tree).toHaveLength(2);
    const child = await s.detail(detail.tree[1]?.run.id ?? '');
    const refusals = child.steps
      .filter((step) => step.type === 'tool_call_finished')
      .map((step) => String(step.payload.preview));
    expect(refusals).toHaveLength(2);
    expect(refusals[0]).toContain('"Coordenador" já participa desta cadeia');
    expect(refusals[1]).toContain('"Revisor" já participa desta cadeia');
  });

  it('refuses to go deeper than the configured limit (C-21, RN-10)', async () => {
    const s = await setup({
      turns: [delegateTo('B'), delegateTo('C'), delegateTo('D'), done, done, done],
      grants: { delegate_to_agent: 'allow' },
      env: { MAX_DELEGATION_DEPTH: '2' },
    });
    for (const name of ['B', 'C', 'D']) addSpecialist(s, name, { delegate_to_agent: 'allow' });
    const detail = await s.finished((await s.start()).runId);

    expect(detail.tree.map((node) => [node.run.agentName, node.depth])).toEqual([
      ['Coordenador', 0],
      ['B', 1],
      ['C', 2],
    ]);
    const deepest = await s.detail(detail.tree[2]?.run.id ?? '');
    expect(
      String(deepest.steps.find((step) => step.type === 'tool_call_finished')?.payload.preview),
    ).toContain('profundidade máxima de 2 níveis');
  });

  it('refuses unknown and inactive agents (RN-01)', async () => {
    const s = await setup({
      turns: [delegateTo('Fantasma'), delegateTo('Parado'), done],
      grants: { delegate_to_agent: 'allow' },
    });
    addAgent(s.database, { name: 'Parado', modelId: s.modelId, enabled: false });
    addSpecialist(s, 'Revisor');
    const detail = await s.finished((await s.start()).runId);

    expect(detail.tree).toHaveLength(1);
    const previews = detail.steps
      .filter((step) => step.type === 'tool_call_finished')
      .map((step) => String(step.payload.preview));
    expect(previews[0]).toContain(
      'Não existe um agente chamado "Fantasma". Agentes disponíveis: Revisor.',
    );
    expect(previews[1]).toContain('"Parado" não pode receber tarefas agora');
  });

  it('shows an approval asked by the delegated agent under the original run', async () => {
    const s = await setup({
      turns: [delegateTo('Revisor'), writeNote, done, done],
      grants: { delegate_to_agent: 'allow' },
    });
    const specialistId = addSpecialist(s, 'Revisor', { write_file: 'ask' });
    const { runId } = await s.start();
    const approval = await s.pending();

    expect(approval).toMatchObject({ agentId: specialistId, originRunId: runId });
    expect(approval.runId).not.toBe(runId);
    const office = officeSchema.parse((await s.call('GET', '/api/office')).body);
    const desks = office.rooms.flatMap((room) => room.agents);
    expect(desks.find((desk) => desk.id === s.agentId)).toMatchObject({
      delegatingTo: [specialistId],
      pendingApproval: null,
    });
    expect(desks.find((desk) => desk.id === specialistId)?.pendingApproval?.id).toBe(approval.id);

    // Cancelling the original run stops the child and withdraws its request.
    await s.call('POST', `/api/runs/${runId}/cancel`);
    const detail = await s.finished(runId);
    expect(detail.tree[1]?.run).toMatchObject({ status: 'cancelled', endReason: 'parent_stopped' });
    expect(
      approvalListSchema.parse((await s.call('GET', '/api/approvals')).body).approvals,
    ).toEqual([]);
  });
});

describe('marking tool support by hand (OpenAI-compatible models)', () => {
  it('accepts the marking only where the provider cannot tell', async () => {
    const s = await setup();
    expect(
      await s.call('PATCH', `/api/models/${s.modelId}`, { supportsTools: false }),
    ).toMatchObject({ status: 409, body: { code: 'tools_support_detected' } });

    const openAi = addProvider(s.database, 'Serviço compatível');
    s.database.db
      .update(providers)
      .set({ kind: 'openai_compatible' })
      .where(eq(providers.id, openAi))
      .run();
    const modelId = addModel(s.database, openAi, 'gpt-local');
    const marked = await s.call('PATCH', `/api/models/${modelId}`, { supportsTools: true });
    expect(marked).toMatchObject({ status: 200, body: { supportsTools: true, enabled: true } });
    expect(
      s.database.db.select().from(models).where(eq(models.id, modelId)).get()?.supportsTools,
    ).toBe(true);
    expect(s.audit('model.tools_support_changed')).toHaveLength(1);
    expect((await s.call('PATCH', `/api/models/${modelId}`, {})).status).toBe(400);
  });
});
