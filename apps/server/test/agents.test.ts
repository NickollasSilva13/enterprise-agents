import {
  AGENT_DEFAULTS,
  AGENT_LIMITS,
  type Agent,
  agentListSchema,
  agentSchema,
  apiErrorSchema,
  modelListSchema,
  type Project,
  projectListSchema,
  projectSchema,
} from '@ea/shared';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { agents, agentTools, models, runs } from '../src/db/schema';
import { copyName } from '../src/modules/agents/service';
import { getDashboardSummary } from '../src/modules/dashboard/service';
import { getOffice } from '../src/modules/office/service';
import { createBuiltinRegistry } from '../src/tools/builtin';
import { addModel, addProvider, addRun } from './fixtures';
import { makeApp, type TestApp } from './helpers';

let t: TestApp;
beforeEach(async () => {
  t = await makeApp();
});
afterEach(async () => {
  await t.close();
});

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

async function call(method: Method, url: string, payload?: unknown) {
  const response = await t.app.inject({
    method,
    url,
    headers: t.trusted,
    ...(payload === undefined ? {} : { payload: payload as object }),
  });
  return { status: response.statusCode, body: response.body ? response.json<unknown>() : null };
}

async function createAgent(input: Record<string, unknown>): Promise<Agent> {
  const { status, body } = await call('POST', '/api/agents', input);
  expect(status).toBe(201);
  return agentSchema.parse(body);
}

async function createProject(name: string, description?: string): Promise<Project> {
  const { status, body } = await call('POST', '/api/projects', { name, description });
  expect(status).toBe(201);
  return projectSchema.parse(body);
}

const listAgents = async () =>
  agentListSchema.parse((await call('GET', '/api/agents')).body).agents;

const errorOf = (body: unknown) => apiErrorSchema.parse(body);
const fieldsOf = (body: unknown) =>
  (errorOf(body).details as { path: string; message: string }[]).map((detail) => detail.path);

describe('creating agents (RF-10, RF-13, RF-15)', () => {
  it('creates an agent from just a name, with the documented defaults', async () => {
    const agent = await createAgent({ name: '  Triagem  ' });
    expect(agent).toMatchObject({ ...AGENT_DEFAULTS, name: 'Triagem', state: 'idle' });
    expect(agent.projectName).toBeNull();
    expect(agent.modelName).toBeNull();
    expect(await listAgents()).toEqual([agent]);
  });

  it('stores every configurable field', async () => {
    const project = await createProject('Atendimento');
    const model = addModel(t.database, addProvider(t.database), 'llama3');
    const input = {
      name: 'Respostas',
      description: 'Responde clientes',
      objective: 'Resolver dúvidas no primeiro contato',
      systemPrompt: 'Você é cordial.\nResponda em português.',
      projectId: project.id,
      modelId: model,
      temperature: 0.2,
      maxOutputTokens: 1000,
      maxSteps: 5,
      maxDurationSeconds: 60,
      maxTotalTokens: 20000,
      enabled: false,
    };
    const agent = await createAgent(input);
    expect(agent).toMatchObject({
      ...input,
      projectName: 'Atendimento',
      modelName: 'llama3',
      state: 'inactive',
    });

    const fetched = await call('GET', `/api/agents/${agent.id}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body).toEqual(agent);
  });

  it.each([
    ['a missing name', {}, 'name'],
    ['a blank name', { name: '   ' }, 'name'],
    ['a name that is too long', { name: 'x'.repeat(AGENT_LIMITS.name + 1) }, 'name'],
    ['a prompt over the limit', { name: 'A', systemPrompt: 'x'.repeat(50_001) }, 'systemPrompt'],
    ['a temperature above the range', { name: 'A', temperature: 2.1 }, 'temperature'],
    ['a negative temperature', { name: 'A', temperature: -0.1 }, 'temperature'],
    ['a fractional step limit', { name: 'A', maxSteps: 1.5 }, 'maxSteps'],
    ['a zero step limit', { name: 'A', maxSteps: 0 }, 'maxSteps'],
    ['a duration below the minimum', { name: 'A', maxDurationSeconds: 1 }, 'maxDurationSeconds'],
    ['a duration above the maximum', { name: 'A', maxDurationSeconds: 3601 }, 'maxDurationSeconds'],
    ['a number sent as text', { name: 'A', maxOutputTokens: '100' }, 'maxOutputTokens'],
    ['a wrong type for enabled', { name: 'A', enabled: 'yes' }, 'enabled'],
  ])('rejects %s and names the field (C-06)', async (_label, input, field) => {
    const { status, body } = await call('POST', '/api/agents', input);
    expect(status).toBe(400);
    expect(errorOf(body).code).toBe('validation_error');
    expect(fieldsOf(body)).toContain(field);
    expect(await listAgents()).toEqual([]);
  });

  it('rejects fields it does not know, so nothing is silently ignored', async () => {
    const { status, body } = await call('POST', '/api/agents', {
      name: 'A',
      id: 'chosen-by-client',
      deletedAt: null,
    });
    expect(status).toBe(400);
    expect(errorOf(body).code).toBe('validation_error');
  });

  it('answers validation errors in Portuguese', async () => {
    const { body } = await call('POST', '/api/agents', { name: '', maxSteps: 999 });
    const messages = (errorOf(body).details as { message: string }[]).map((d) => d.message);
    expect(messages).toContain('Informe o nome do agente.');
    expect(messages).toContain('Passos por execução: o máximo é 200.');
  });

  it('rejects a name already used by another agent, ignoring letter case', async () => {
    await createAgent({ name: 'Ágata' });
    const { status, body } = await call('POST', '/api/agents', { name: 'ágata' });
    expect(status).toBe(409);
    expect(errorOf(body).code).toBe('name_taken');
  });

  it('rejects a project or a model that does not exist', async () => {
    const project = await call('POST', '/api/agents', { name: 'A', projectId: 'missing' });
    expect(project.status).toBe(400);
    expect(fieldsOf(project.body)).toEqual(['projectId']);

    const model = await call('POST', '/api/agents', { name: 'A', modelId: 'missing' });
    expect(model.status).toBe(400);
    expect(fieldsOf(model.body)).toEqual(['modelId']);
  });

  it('rejects a disabled model (RN-02)', async () => {
    const model = addModel(t.database, addProvider(t.database));
    t.database.db.update(models).set({ enabled: false }).where(eq(models.id, model)).run();
    const { status, body } = await call('POST', '/api/agents', { name: 'A', modelId: model });
    expect(status).toBe(400);
    expect(fieldsOf(body)).toEqual(['modelId']);
  });
});

describe('editing agents (RF-10, RF-11)', () => {
  it('changes only the fields sent and updates the modification time', async () => {
    const agent = await createAgent({ name: 'Leitor', objective: 'Ler' });
    await new Promise((resolve) => setTimeout(resolve, 5));

    const { status, body } = await call('PATCH', `/api/agents/${agent.id}`, {
      objective: 'Ler e resumir',
      maxSteps: 7,
    });
    expect(status).toBe(200);
    const updated = agentSchema.parse(body);
    expect(updated).toMatchObject({ name: 'Leitor', objective: 'Ler e resumir', maxSteps: 7 });
    expect(updated.createdAt).toBe(agent.createdAt);
    expect(updated.updatedAt > agent.updatedAt).toBe(true);
  });

  it('deactivates and reactivates an agent', async () => {
    const agent = await createAgent({ name: 'Leitor' });

    const off = await call('PATCH', `/api/agents/${agent.id}`, { enabled: false });
    expect(agentSchema.parse(off.body)).toMatchObject({ enabled: false, state: 'inactive' });
    expect(getDashboardSummary(t.database.db).agents).toMatchObject({ active: 0, inactive: 1 });

    const on = await call('PATCH', `/api/agents/${agent.id}`, { enabled: true });
    expect(agentSchema.parse(on.body)).toMatchObject({ enabled: true, state: 'idle' });
  });

  it('can clear the project, the model and the token limit', async () => {
    const project = await createProject('P');
    const model = addModel(t.database, addProvider(t.database));
    const agent = await createAgent({
      name: 'A',
      projectId: project.id,
      modelId: model,
      maxTotalTokens: 500,
    });
    const { body } = await call('PATCH', `/api/agents/${agent.id}`, {
      projectId: null,
      modelId: null,
      maxTotalTokens: null,
    });
    expect(agentSchema.parse(body)).toMatchObject({
      projectId: null,
      projectName: null,
      modelId: null,
      maxTotalTokens: null,
    });
  });

  it('lets an agent keep its own name but not take another one', async () => {
    const first = await createAgent({ name: 'Um' });
    await createAgent({ name: 'Dois' });

    const same = await call('PATCH', `/api/agents/${first.id}`, { name: 'UM' });
    expect(same.status).toBe(200);

    const clash = await call('PATCH', `/api/agents/${first.id}`, { name: 'dois' });
    expect(clash.status).toBe(409);
  });

  it('validates edits like creations', async () => {
    const agent = await createAgent({ name: 'A' });
    const invalid = await call('PATCH', `/api/agents/${agent.id}`, { temperature: 5 });
    expect(invalid.status).toBe(400);
    expect(fieldsOf(invalid.body)).toEqual(['temperature']);

    const unknown = await call('PATCH', `/api/agents/${agent.id}`, { state: 'working' });
    expect(unknown.status).toBe(400);
  });

  it('answers 404 for an agent that does not exist', async () => {
    for (const [method, url] of [
      ['GET', '/api/agents/missing'],
      ['PATCH', '/api/agents/missing'],
      ['DELETE', '/api/agents/missing'],
      ['POST', '/api/agents/missing/duplicate'],
    ] as const) {
      const { status, body } = await call(method, url, method === 'PATCH' ? {} : undefined);
      expect(status, `${method} ${url}`).toBe(404);
      expect(errorOf(body).code).toBe('not_found');
    }
  });
});

describe('duplicating agents (RF-12)', () => {
  it('copies the configuration and the granted tools under a new name', async () => {
    const project = await createProject('P');
    const source = await createAgent({
      name: 'Leitor',
      objective: 'Ler',
      systemPrompt: 'Leia com atenção.',
      projectId: project.id,
      temperature: 1.1,
      maxSteps: 3,
    });
    t.database.db
      .insert(agentTools)
      .values({ agentId: source.id, toolName: 'read_file', permission: 'allow' })
      .run();
    addRun(t.database, source.id, { status: 'failed' });

    const { status, body } = await call('POST', `/api/agents/${source.id}/duplicate`);
    expect(status).toBe(201);
    const copy = agentSchema.parse(body);

    expect(copy.id).not.toBe(source.id);
    expect(copy).toMatchObject({
      name: 'Leitor (cópia)',
      objective: 'Ler',
      systemPrompt: 'Leia com atenção.',
      projectId: project.id,
      temperature: 1.1,
      maxSteps: 3,
      // History is not copied: the copy has never failed.
      state: 'idle',
    });
    expect(
      t.database.db.select().from(agentTools).where(eq(agentTools.agentId, copy.id)).all(),
    ).toEqual([{ agentId: copy.id, toolName: 'read_file', permission: 'allow' }]);

    const again = await call('POST', `/api/agents/${source.id}/duplicate`);
    expect(agentSchema.parse(again.body).name).toBe('Leitor (cópia 2)');
  });

  it('keeps copy names within the limit', () => {
    const long = 'x'.repeat(AGENT_LIMITS.name);
    const first = copyName(long, [long]);
    expect(first).toHaveLength(AGENT_LIMITS.name);
    expect(first.endsWith(' (cópia)')).toBe(true);
    expect(copyName(long, [long, first]).endsWith(' (cópia 2)')).toBe(true);
  });
});

describe('deleting agents (RF-10, RN-07)', () => {
  it('removes the agent from every listing but keeps its history', async () => {
    const agent = await createAgent({ name: 'Leitor' });
    const run = addRun(t.database, agent.id, { status: 'completed' });

    const { status } = await call('DELETE', `/api/agents/${agent.id}`);
    expect(status).toBe(204);

    expect(await listAgents()).toEqual([]);
    expect((await call('GET', `/api/agents/${agent.id}`)).status).toBe(404);
    expect(getOffice(t.database.db, createBuiltinRegistry()).agents).toEqual([]);

    const summary = getDashboardSummary(t.database.db);
    expect(summary.agents.total).toBe(0);
    expect(summary.recentRuns).toMatchObject([{ id: run, agentName: 'Leitor' }]);

    const row = t.database.db.select().from(agents).where(eq(agents.id, agent.id)).get();
    expect(row?.deletedAt).not.toBeNull();
    expect(row?.enabled).toBe(false);
    expect(t.database.db.select().from(runs).all()).toHaveLength(1);
  });

  it('frees the name for a new agent', async () => {
    const agent = await createAgent({ name: 'Leitor' });
    await call('DELETE', `/api/agents/${agent.id}`);
    const again = await createAgent({ name: 'Leitor' });
    expect(again.id).not.toBe(agent.id);
  });

  it.each(['queued', 'running', 'waiting_approval'] as const)(
    'refuses to delete an agent with a %s run',
    async (runStatus) => {
      const agent = await createAgent({ name: 'Ocupado' });
      addRun(t.database, agent.id, { status: runStatus });

      const { status, body } = await call('DELETE', `/api/agents/${agent.id}`);
      expect(status).toBe(409);
      expect(errorOf(body).code).toBe('agent_has_active_run');
      expect(await listAgents()).toHaveLength(1);
    },
  );

  it('cannot be deleted twice', async () => {
    const agent = await createAgent({ name: 'Leitor' });
    expect((await call('DELETE', `/api/agents/${agent.id}`)).status).toBe(204);
    expect((await call('DELETE', `/api/agents/${agent.id}`)).status).toBe(404);
  });
});

describe('projects', () => {
  it('creates, lists with agent counts, renames and deletes', async () => {
    const support = await createProject('Suporte', 'Atende clientes');
    await createProject('Arquivo');
    const agent = await createAgent({ name: 'Ana', projectId: support.id });
    const gone = await createAgent({ name: 'Removida', projectId: support.id });
    await call('DELETE', `/api/agents/${gone.id}`);

    const list = projectListSchema.parse((await call('GET', '/api/projects')).body).projects;
    expect(list.map((p) => [p.name, p.agentCount])).toEqual([
      ['Arquivo', 0],
      ['Suporte', 1],
    ]);

    const renamed = await call('PATCH', `/api/projects/${support.id}`, { name: 'Atendimento' });
    expect(projectSchema.parse(renamed.body)).toMatchObject({
      name: 'Atendimento',
      description: 'Atende clientes',
      agentCount: 1,
    });
    expect((await listAgents())[0]?.projectName).toBe('Atendimento');

    expect((await call('DELETE', `/api/projects/${support.id}`)).status).toBe(204);
    // The agent survives its project and moves to "no project".
    expect(await listAgents()).toMatchObject([
      { id: agent.id, projectId: null, projectName: null },
    ]);
    // The automatic office keeps a room for the remaining project and one for agents without any.
    const { layout } = getOffice(t.database.db, createBuiltinRegistry());
    expect(
      layout.areas.filter((area) => area.kind === 'project').map((area) => area.projectId),
    ).toEqual([expect.any(String), null]);
  });

  it('rejects blank, long and duplicate names', async () => {
    await createProject('Suporte');

    const blank = await call('POST', '/api/projects', { name: ' ' });
    expect(blank.status).toBe(400);
    expect(fieldsOf(blank.body)).toEqual(['name']);

    const long = await call('POST', '/api/projects', { name: 'x'.repeat(61) });
    expect(long.status).toBe(400);

    const duplicate = await call('POST', '/api/projects', { name: 'SUPORTE' });
    expect(duplicate.status).toBe(409);
    expect(errorOf(duplicate.body).code).toBe('name_taken');
  });

  it('answers 404 for a project that does not exist', async () => {
    expect((await call('PATCH', '/api/projects/missing', { name: 'X' })).status).toBe(404);
    expect((await call('DELETE', '/api/projects/missing')).status).toBe(404);
  });
});

describe('models available to agents', () => {
  it('is empty until a provider is connected', async () => {
    const { status, body } = await call('GET', '/api/models');
    expect(status).toBe(200);
    expect(modelListSchema.parse(body)).toEqual({ models: [] });
  });

  it('lists enabled models with their provider', async () => {
    const provider = addProvider(t.database, 'Ollama local');
    addModel(t.database, provider, 'llama3');
    const disabled = addModel(t.database, provider, 'old');
    t.database.db.update(models).set({ enabled: false }).where(eq(models.id, disabled)).run();

    const list = modelListSchema.parse((await call('GET', '/api/models')).body).models;
    expect(list).toMatchObject([
      { name: 'llama3', providerName: 'Ollama local', isExternal: false, supportsTools: false },
    ]);
  });
});

describe('protection of the new routes', () => {
  it('requires a session and a trusted origin to change anything', async () => {
    const withoutSession = { ...t.trusted, cookie: '' };
    const noSession = await t.app.inject({
      method: 'POST',
      url: '/api/agents',
      headers: withoutSession,
      payload: { name: 'A' },
    });
    expect(noSession.statusCode).toBe(401);

    const foreign = await t.app.inject({
      method: 'DELETE',
      url: '/api/agents/anything',
      headers: { ...t.trusted, origin: 'https://evil.example' },
    });
    expect(foreign.statusCode).toBe(403);

    expect(await listAgents()).toEqual([]);
  });
});
