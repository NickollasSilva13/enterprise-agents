import {
  AGENT_EXPORT_FORMAT,
  AGENT_IMPORT_LIMITS,
  type AgentExport,
  agentExportSchema,
  agentImportResultSchema,
  agentListSchema,
  agentToolsSchema,
  apiErrorSchema,
  projectListSchema,
} from '@ea/shared';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { auditLog, models, providers } from '../src/db/schema';
import { addAgent, addModel, addProject, addProvider, addRun, grantTools } from './fixtures';
import { makeApp, type TestApp } from './helpers';

// Export and import of agents as JSON (RF-20).

let t: TestApp;
beforeEach(async () => {
  t = await makeApp();
});
afterEach(async () => {
  await t.close();
});

async function call(method: 'GET' | 'POST', url: string, payload?: unknown) {
  const response = await t.app.inject({
    method,
    url,
    headers: t.trusted,
    ...(payload === undefined ? {} : { payload: payload as object }),
  });
  return {
    status: response.statusCode,
    text: response.body,
    body: response.body ? response.json<unknown>() : null,
  };
}

const exported = async (query = '') =>
  agentExportSchema.parse((await call('GET', `/api/agents/export${query}`)).body);
const importFile = async (document: unknown) => {
  const response = await call('POST', '/api/agents/import', document);
  expect(response.status).toBe(201);
  return agentImportResultSchema.parse(response.body).imported;
};
const agentsNow = async () => agentListSchema.parse((await call('GET', '/api/agents')).body).agents;
const toolsOf = async (id: string) =>
  agentToolsSchema.parse((await call('GET', `/api/agents/${id}/tools`)).body).grants;

const file = (...agents: Record<string, unknown>[]): Record<string, unknown> => ({
  format: AGENT_EXPORT_FORMAT,
  version: 1,
  agents,
});

/** One fully configured agent, with a project, a model, tools and some history. */
function seed() {
  const providerId = addProvider(t.database, 'Ollama local');
  const modelId = addModel(t.database, providerId, 'llama3.2:3b', { supportsTools: true });
  const projectId = addProject(t.database, 'Atendimento', 'Responde clientes');
  const agentId = addAgent(t.database, {
    name: 'Triagem',
    description: 'Classifica pedidos',
    objective: 'Separar por urgência',
    systemPrompt: 'Responda em uma linha.',
    projectId,
    modelId,
    temperature: 0.3,
    maxOutputTokens: 800,
    maxSteps: 8,
    maxDurationSeconds: 60,
    maxTotalTokens: 5000,
  });
  grantTools(t.database, agentId, { write_file: 'allow', read_file: 'ask', run_script: 'ask' });
  addRun(t.database, agentId, { status: 'completed', finishedAt: new Date().toISOString() });
  return { providerId, modelId, projectId, agentId };
}

describe('exporting agents (RF-20)', () => {
  it('writes the whole configuration by name, with no ids and no history', async () => {
    const { agentId, projectId, modelId, providerId } = seed();
    addAgent(t.database, { name: 'Avulso', enabled: false });
    addAgent(t.database, { name: 'Excluído', deletedAt: new Date().toISOString() });

    const response = await call('GET', '/api/agents/export');
    expect(response.status).toBe(200);
    const document = agentExportSchema.parse(response.body);
    expect(document.format).toBe(AGENT_EXPORT_FORMAT);
    expect(document.version).toBe(1);
    expect(Number.isNaN(Date.parse(document.exportedAt ?? ''))).toBe(false);
    expect(document.agents).toEqual([
      {
        name: 'Avulso',
        description: '',
        objective: '',
        systemPrompt: '',
        temperature: 0.7,
        maxOutputTokens: 4096,
        maxSteps: 20,
        maxDurationSeconds: 300,
        maxTotalTokens: null,
        enabled: false,
        project: null,
        model: null,
        tools: [],
      },
      {
        name: 'Triagem',
        description: 'Classifica pedidos',
        objective: 'Separar por urgência',
        systemPrompt: 'Responda em uma linha.',
        temperature: 0.3,
        maxOutputTokens: 800,
        maxSteps: 8,
        maxDurationSeconds: 60,
        maxTotalTokens: 5000,
        enabled: true,
        project: 'Atendimento',
        model: { name: 'llama3.2:3b', provider: 'Ollama local' },
        tools: [
          { toolName: 'read_file', permission: 'ask' },
          { toolName: 'run_script', permission: 'ask' },
          { toolName: 'write_file', permission: 'allow' },
        ],
      },
    ]);
    // Nothing that only means something in this installation.
    for (const id of [agentId, projectId, modelId, providerId]) {
      expect(response.text).not.toContain(id);
    }
  });

  it('never writes a provider address or key (RN-11)', async () => {
    const key = 'sk-export-secret-0123456789';
    const { providerId } = seed();
    t.secrets.set(`provider:${providerId}`, key);
    t.database.db
      .update(providers)
      .set({ secretRef: `provider:${providerId}`, baseUrl: 'https://api.exemplo.test/v1' })
      .where(eq(providers.id, providerId))
      .run();

    const { text } = await call('GET', '/api/agents/export');
    expect(text).not.toContain(key);
    expect(text).not.toContain(key.slice(-4));
    expect(text).not.toContain('api.exemplo.test');
    expect(text).not.toContain('secretRef');
    expect(text).not.toContain('provider:');
  });

  it('exports only the agents asked for, and refuses an unknown one', async () => {
    const { agentId } = seed();
    const other = addAgent(t.database, { name: 'Outro' });
    expect((await exported(`?ids=${agentId}`)).agents.map((agent) => agent.name)).toEqual([
      'Triagem',
    ]);
    expect((await exported(`?ids=${other},${agentId}`)).agents).toHaveLength(2);
    expect((await call('GET', `/api/agents/export?ids=${agentId},nope`)).status).toBe(404);
    expect((await call('GET', '/api/agents/export?outro=1')).status).toBe(400);
  });

  it('gives an empty list when there are no agents', async () => {
    const response = await call('GET', '/api/agents/export');
    expect(response.status).toBe(200);
    expect((response.body as AgentExport).agents).toEqual([]);
  });
});

describe('importing agents (RF-20)', () => {
  it('brings an exported agent back with the same configuration', async () => {
    const { agentId, modelId, projectId } = seed();
    const document = await exported();
    await call('POST', `/api/agents/${agentId}/duplicate`);

    const [result] = await importFile(document);
    expect(result).toMatchObject({ nameInFile: 'Triagem', name: 'Triagem (importado)' });
    const copy = (await agentsNow()).find((agent) => agent.id === result?.id);
    expect(copy).toMatchObject({
      name: 'Triagem (importado)',
      description: 'Classifica pedidos',
      objective: 'Separar por urgência',
      systemPrompt: 'Responda em uma linha.',
      projectId,
      modelId,
      temperature: 0.3,
      maxOutputTokens: 800,
      maxSteps: 8,
      maxDurationSeconds: 60,
      maxTotalTokens: 5000,
      enabled: true,
      // History is not part of a file: the new agent has never run.
      state: 'idle',
    });
  });

  it('adds and never replaces: a taken name gets a suffix, also within the same file', async () => {
    addAgent(t.database, { name: 'Triagem' });
    const results = await importFile(
      file({ name: 'triagem' }, { name: 'TRIAGEM' }, { name: 'Novo' }, { name: 'Novo' }),
    );
    expect(results.map((result) => result.name)).toEqual([
      'triagem (importado)',
      'TRIAGEM (importado 2)',
      'Novo',
      'Novo (importado)',
    ]);
    expect(results[0]?.warnings).toEqual([
      'Já existia um agente chamado "triagem"; este entrou como "triagem (importado)".',
    ]);
    expect(results[2]?.warnings).toEqual([]);
    expect(await agentsNow()).toHaveLength(5);
  });

  it('gives no tool the power to act alone, whatever the file says (C-15, C-16)', async () => {
    const [result] = await importFile(
      file({
        name: 'De fora',
        tools: [
          { toolName: 'write_file', permission: 'allow' },
          { toolName: 'fetch_url', permission: 'allow' },
          { toolName: 'run_script', permission: 'allow' },
          { toolName: 'read_file', permission: 'ask' },
          { toolName: 'list_dir', permission: 'deny' },
          { toolName: 'format_disk', permission: 'allow' },
        ],
      }),
    );
    expect(await toolsOf(result?.id ?? '')).toEqual([
      { toolName: 'fetch_url', permission: 'ask' },
      { toolName: 'read_file', permission: 'ask' },
      { toolName: 'run_script', permission: 'ask' },
      { toolName: 'write_file', permission: 'ask' },
    ]);
    expect(result?.warnings).toEqual([
      '"Escrever arquivo" estava permitida no arquivo e entrou como "pede aprovação". Libere-a na tela Ferramentas, se quiser.',
      '"Buscar URL" estava permitida no arquivo e entrou como "pede aprovação". Libere-a na tela Ferramentas, se quiser.',
      '"Executar script" é de risco alto e entrou como "pede aprovação".',
      'A ferramenta "format_disk" não existe nesta instalação e foi ignorada.',
    ]);
  });

  it('leaves the agent without a model when the model is not here or is disabled', async () => {
    const providerId = addProvider(t.database, 'Ollama local');
    const off = addModel(t.database, providerId, 'desligado');
    t.database.db.update(models).set({ enabled: false }).where(eq(models.id, off)).run();
    const on = addModel(t.database, providerId, 'ligado');

    const results = await importFile(
      file(
        { name: 'A', model: { name: 'ligado', provider: 'ollama LOCAL' } },
        { name: 'B', model: { name: 'desligado', provider: 'Ollama local' } },
        { name: 'C', model: { name: 'ligado', provider: 'Outro provedor' } },
        { name: 'D', model: { name: 'gpt-x', provider: 'Ollama local' } },
      ),
    );
    const byName = new Map((await agentsNow()).map((agent) => [agent.name, agent.modelId]));
    expect([...'ABCD'].map((name) => byName.get(name))).toEqual([on, null, null, null]);
    expect(results.map((result) => result.warnings)).toEqual([
      [],
      ['O modelo "desligado" está desabilitado nesta instalação; o agente ficou sem modelo.'],
      [
        'O modelo "ligado" do provedor "Outro provedor" não existe nesta instalação; o agente ficou sem modelo.',
      ],
      [
        'O modelo "gpt-x" do provedor "Ollama local" não existe nesta instalação; o agente ficou sem modelo.',
      ],
    ]);
  });

  it('uses the project of the same name and creates the ones that are missing, once', async () => {
    const existing = addProject(t.database, 'Atendimento');
    await importFile(
      file(
        { name: 'A', project: 'atendimento' },
        { name: 'B', project: 'Pesquisa' },
        { name: 'C', project: ' pesquisa ' },
        { name: 'D' },
      ),
    );
    const projects = projectListSchema.parse((await call('GET', '/api/projects')).body).projects;
    expect(projects.map((project) => [project.name, project.agentCount])).toEqual([
      ['Atendimento', 1],
      ['Pesquisa', 2],
    ]);
    const agents = await agentsNow();
    expect(agents.find((agent) => agent.name === 'A')?.projectId).toBe(existing);
    expect(agents.find((agent) => agent.name === 'D')?.projectId).toBeNull();
  });

  it('fills what the file leaves out with the defaults and records each import', async () => {
    const [result] = await importFile(file({ name: 'Mínimo' }));
    expect((await agentsNow())[0]).toMatchObject({
      name: 'Mínimo',
      temperature: 0.7,
      maxSteps: 20,
      enabled: true,
      modelId: null,
    });
    const entries = t.database.db.select().from(auditLog).all();
    expect(entries.map((entry) => [entry.action, entry.target])).toEqual([
      ['agent.imported', result?.id],
    ]);
  });

  it('refuses a file that is not what it should be, and then imports nothing', async () => {
    const refused = async (document: unknown) => {
      const response = await call('POST', '/api/agents/import', document);
      expect(response.status).toBe(400);
      return apiErrorSchema.parse(response.body);
    };
    const messages = (error: { details?: unknown }) =>
      (error.details as { path: string; message: string }[]).map((detail) => detail.message);

    expect(messages(await refused({ ...file({ name: 'A' }), format: 'outra-coisa' }))).toEqual([
      'Este não é um arquivo de agentes do Enterprise Agents.',
    ]);
    expect(messages(await refused({ ...file({ name: 'A' }), version: 2 }))).toEqual([
      'Este arquivo é de uma versão que esta instalação não sabe ler.',
    ]);
    expect(messages(await refused(file()))).toEqual(['O arquivo não tem nenhum agente.']);
    await refused(file({ name: 'A', id: '01ABC' }));
    await refused(file({ name: 'A', apiKey: 'sk-qualquer-coisa-123456' }));
    await refused(file({ name: 'A', temperature: 9 }));
    await refused(file({ name: 'A', maxSteps: 100_000 }));
    await refused(file({ name: 'A', tools: [{ toolName: 'read_file', permission: 'sempre' }] }));
    await refused(file({ name: '' }));
    await refused(
      file(
        ...Array.from({ length: AGENT_IMPORT_LIMITS.agents + 1 }, (_, n) => ({ name: `A${n}` })),
      ),
    );
    // One bad agent refuses the whole file.
    await refused(file({ name: 'Bom' }, { name: 'Ruim', temperature: 'quente' }));
    expect(await agentsNow()).toEqual([]);
  });

  it('refuses a file larger than a request may be', async () => {
    const response = await call(
      'POST',
      '/api/agents/import',
      file(
        ...Array.from({ length: 30 }, (_, n) => ({
          name: `A${n}`,
          systemPrompt: 'x'.repeat(49_000),
        })),
      ),
    );
    expect(response.status).toBe(413);
    expect(await agentsNow()).toEqual([]);
  });

  it('is protected like every other route', async () => {
    for (const [method, url] of [
      ['GET', '/api/agents/export'],
      ['POST', '/api/agents/import'],
    ] as const) {
      const noSession = await t.app.inject({
        method,
        url,
        headers: { host: t.trusted.host ?? '', origin: t.trusted.origin ?? '' },
        ...(method === 'POST' ? { payload: file({ name: 'A' }) } : {}),
      });
      expect(noSession.statusCode).toBe(401);
    }
    const foreign = await t.app.inject({
      method: 'POST',
      url: '/api/agents/import',
      headers: { ...t.trusted, origin: 'http://evil.example' },
      payload: file({ name: 'A' }),
    });
    expect(foreign.statusCode).toBe(403);
    expect(await agentsNow()).toEqual([]);
  });
});
