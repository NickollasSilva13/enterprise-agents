// The catalogue of workflow templates (Phase 18) through the API: the
// ready-made templates, saving an area as a template (D3), what a template
// carries and never carries (D2), and files from elsewhere (D4).
import {
  agentToolsSchema,
  areaCreatedSchema,
  boardSchema,
  templateExportSchema,
  templateImportResultSchema,
  type TemplateExport,
  WORKFLOW_TEMPLATES,
  workflowTemplateListSchema,
  workflowTemplateSummarySchema,
} from '@ea/shared';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { newId } from '../src/db/ids';
import { agents, auditLog, projects, workflowTemplates } from '../src/db/schema';
import { addModel, addProvider, grantTools } from './fixtures';
import { makeApp, type TestApp } from './helpers';

let current: TestApp | undefined;
afterEach(async () => {
  await current?.close();
  current = undefined;
});

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

async function setup() {
  const test = await makeApp();
  current = test;
  const modelId = addModel(test.database, addProvider(test.database), 'fake-model', {
    supportsTools: true,
  });
  const call = async (method: Method, url: string, payload?: unknown) => {
    const response = await test.app.inject({
      method,
      url,
      headers: test.trusted,
      ...(payload === undefined ? {} : { payload: payload as object }),
    });
    return { status: response.statusCode, body: response.body ? response.json<unknown>() : null };
  };
  const list = async () =>
    workflowTemplateListSchema.parse((await call('GET', '/api/workflow-templates')).body).templates;
  const area = async (templateId: string, name: string) => {
    const { status, body } = await call('POST', '/api/areas/from-template', {
      templateId,
      name,
      modelId,
    });
    expect(status, JSON.stringify(body)).toBe(201);
    const created = areaCreatedSchema.parse(body);
    const board = boardSchema.parse((await call('GET', `/api/areas/${created.areaId}/board`)).body);
    const areaAgents = test.database.db
      .select()
      .from(agents)
      .where(eq(agents.projectId, created.areaId))
      .all();
    return { ...created, board, agents: areaAgents };
  };
  const toolsOf = async (agentId: string) =>
    agentToolsSchema.parse((await call('GET', `/api/agents/${agentId}/tools`)).body).grants;
  return { ...test, modelId, call, list, area, toolsOf };
}

const stageNames = (board: { workflow: { stages: { name: string; kind: string }[] } }) =>
  board.workflow.stages.map((stage) => `${stage.name}:${stage.kind}`);

describe('ready-made templates (Phase 18)', () => {
  it('lists the five ready-made templates with what each role gets', async () => {
    const s = await setup();
    const templates = await s.list();
    expect(templates.map((template) => [template.id, template.origin])).toEqual([
      ['desenvolvimento', 'builtin'],
      ['marketing', 'builtin'],
      ['dados', 'builtin'],
      ['produto', 'builtin'],
      ['conteudo', 'builtin'],
    ]);
    const marketing = templates.find((template) => template.id === 'marketing');
    expect(marketing?.roles.map((role) => [role.name, role.areaAccess])).toEqual([
      ['Estratégia', 'write'],
      ['Redação', 'write'],
      ['Revisão de marketing', 'read'],
    ]);
    expect(marketing?.roles[0]?.tools).toContain('fetch_url');
  });

  it('creates an area from each new template, with every tool as "ask"', async () => {
    const s = await setup();
    const marketing = await s.area('marketing', 'Marketing');
    expect(stageNames(marketing.board)).toEqual([
      'Briefing:agent',
      'Redação:agent',
      'Revisão:agent',
      'Sua aprovação:human',
      'Publicado:done',
    ]);
    expect(await s.toolsOf(marketing.agents[0]!.id)).toEqual(
      expect.arrayContaining([{ toolName: 'fetch_url', permission: 'ask' }]),
    );

    const dados = await s.area('dados', 'Dados');
    expect(stageNames(dados.board)).toEqual([
      'Pedido:agent',
      'Análise:agent',
      'Validação:agent',
      'Entregue:done',
    ]);
    // One role works the first two stages; another checks.
    const pedido = dados.board.workflow.stages[0]!;
    expect(dados.board.workflow.stages[1]!.roleId).toBe(pedido.roleId);
    expect(dados.agents.map((agent) => [agent.name, agent.areaAccess])).toEqual([
      ['Análise de dados (Dados)', 'write'],
      ['Validação de dados (Dados)', 'read'],
    ]);

    const produto = await s.area('produto', 'Produto');
    expect(stageNames(produto.board)).toEqual([
      'Ideia:human',
      'Especificação:agent',
      'Priorização:human',
      'Envio:agent',
      'Enviado:done',
    ]);
    // request_from_area only exists inside tasks: it is never granted (C-26).
    for (const agent of produto.agents) {
      expect((await s.toolsOf(agent.id)).map((grant) => grant.toolName)).not.toContain(
        'request_from_area',
      );
    }

    const conteudo = await s.area('conteudo', 'Docs');
    expect(conteudo.agents.map((agent) => agent.areaAccess)).toEqual(['write', 'read', 'read']);
    for (const created of [marketing, dados, produto, conteudo]) {
      for (const agent of created.agents) {
        for (const grant of await s.toolsOf(agent.id)) expect(grant.permission).toBe('ask');
      }
    }
  });

  it('cannot be changed or deleted', async () => {
    const s = await setup();
    expect((await s.call('PATCH', '/api/workflow-templates/marketing', { name: 'X' })).status).toBe(
      409,
    );
    expect((await s.call('DELETE', '/api/workflow-templates/marketing')).status).toBe(409);
    expect((await s.list()).map((template) => template.name)).toContain('Marketing');
  });
});

describe('saving an area as a template (D3, D2)', () => {
  it('copies the flow and the agents on it, never ids, models or permissions', async () => {
    const s = await setup();
    const site = await s.area('desenvolvimento', 'Site');
    const [produto, desenvolvimento] = site.agents;
    // The user loosened one tool, and denied another, before saving.
    grantTools(s.database, produto!.id, { fetch_url: 'allow' });
    s.database.db
      .update(agents)
      .set({ objective: 'Especificar o site.' })
      .where(eq(agents.id, desenvolvimento!.id))
      .run();

    const saved = await s.call('POST', '/api/workflow-templates', {
      areaId: site.areaId,
      name: 'Meu desenvolvimento',
      practices: ['Testes antes de tudo.'],
    });
    expect(saved.status, JSON.stringify(saved.body)).toBe(201);
    const summary = workflowTemplateSummarySchema.parse(saved.body);
    expect(summary).toMatchObject({
      name: 'Meu desenvolvimento',
      origin: 'user',
      description: WORKFLOW_TEMPLATES[0]!.description,
      practices: ['Testes antes de tudo.'],
    });
    // "Produto (Site)" goes back to the role name.
    expect(summary.roles.map((role) => role.name)).toEqual([
      'Produto',
      'Desenvolvimento',
      'Testes',
    ]);
    expect(summary.roles[0]!.tools).toEqual(['fetch_url', 'list_dir', 'read_file', 'write_file']);
    expect(summary.roles[1]!.objective).toBe('Especificar o site.');

    // The file names nothing of this installation.
    const file = (await s.call('GET', `/api/workflow-templates/${summary.id}/export`)).body;
    const parsed = templateExportSchema.parse(file);
    const text = JSON.stringify(file);
    for (const secret of [site.areaId, produto!.id, s.modelId, 'fake-model', '"allow"', '"ask"']) {
      expect(text).not.toContain(secret);
    }
    expect(parsed.template.content.stages.map((stage) => stage.name)).toEqual([
      'Refinamento',
      'Desenvolvimento',
      'Testes',
      'Sua revisão',
      'Concluído',
    ]);

    // Applying it makes a new area where the loosened tool is "ask" again.
    const loja = await s.area(summary.id, 'Loja');
    expect(loja.agents.map((agent) => agent.name)).toEqual([
      'Produto (Loja)',
      'Desenvolvimento (Loja)',
      'Testes (Loja)',
    ]);
    expect(await s.toolsOf(loja.agents[0]!.id)).toContainEqual({
      toolName: 'fetch_url',
      permission: 'ask',
    });
    expect(stageNames(loja.board)).toEqual(stageNames(site.board));
    expect(
      s.database.db
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, 'workflow_template.created'))
        .all(),
    ).toHaveLength(1);
  });

  it('refuses a name in use, an unknown area and an empty name', async () => {
    const s = await setup();
    const site = await s.area('desenvolvimento', 'Site');
    const save = (body: object) => s.call('POST', '/api/workflow-templates', body);
    expect((await save({ areaId: site.areaId, name: 'marketing' })).status).toBe(409);
    expect((await save({ areaId: site.areaId, name: 'Meu' })).status).toBe(201);
    expect((await save({ areaId: site.areaId, name: 'MEU' })).status).toBe(409);
    expect((await save({ areaId: 'nao-existe', name: 'Outro' })).status).toBe(404);
    expect((await save({ areaId: site.areaId, name: '  ' })).status).toBe(400);
  });

  it('refuses an area whose flow is not finished', async () => {
    const s = await setup();
    const id = newId();
    s.database.db.insert(projects).values({ id, name: 'Vazia' }).run();
    const saved = await s.call('POST', '/api/workflow-templates', { areaId: id, name: 'Vazio' });
    expect(saved.status).toBe(400);
    expect(JSON.stringify(saved.body)).toContain('Este fluxo não pode virar modelo.');
  });

  it('renames and deletes a saved template; areas made from it stay', async () => {
    const s = await setup();
    const site = await s.area('desenvolvimento', 'Site');
    const { id } = workflowTemplateSummarySchema.parse(
      (await s.call('POST', '/api/workflow-templates', { areaId: site.areaId, name: 'Meu' })).body,
    );
    const loja = await s.area(id, 'Loja');

    const renamed = await s.call('PATCH', `/api/workflow-templates/${id}`, {
      name: 'Meu fluxo',
      description: 'Para sites pequenos.',
    });
    expect(renamed.body).toMatchObject({ name: 'Meu fluxo', description: 'Para sites pequenos.' });
    expect((await s.call('PATCH', `/api/workflow-templates/${id}`, { name: 'Dados' })).status).toBe(
      409,
    );
    expect((await s.call('PATCH', `/api/workflow-templates/${id}`, {})).status).toBe(400);

    expect((await s.call('DELETE', `/api/workflow-templates/${id}`)).status).toBe(204);
    expect((await s.list()).some((template) => template.id === id)).toBe(false);
    expect((await s.call('DELETE', `/api/workflow-templates/${id}`)).status).toBe(404);
    expect((await s.call('GET', `/api/areas/${loja.areaId}/board`)).status).toBe(200);
  });

  it('leaves out a stored template that no longer passes the rules', async () => {
    const s = await setup();
    const id = newId();
    s.database.db
      .insert(workflowTemplates)
      .values({
        id,
        name: 'Danificado',
        content: { description: '', practices: [], roles: [], stages: [], transitions: [] },
      })
      .run();
    expect((await s.list()).some((template) => template.id === id)).toBe(false);
    const created = await s.call('POST', '/api/areas/from-template', {
      templateId: id,
      name: 'Outra',
      modelId: s.modelId,
    });
    expect(created.status).toBe(409);
  });
});

describe('templates from a file (D4)', () => {
  const fileOf = (s: Awaited<ReturnType<typeof setup>>, id: string) =>
    s.call('GET', `/api/workflow-templates/${id}/export`).then((r) => r.body as TemplateExport);

  it('exports a ready-made template and imports it back under a free name', async () => {
    const s = await setup();
    const file = await fileOf(s, 'dados');
    const imported = await s.call('POST', '/api/workflow-templates/import', file);
    expect(imported.status).toBe(201);
    const result = templateImportResultSchema.parse(imported.body);
    expect(result.template.name).toBe('Dados (importado)');
    expect(result.warnings).toEqual([
      'Já existia um modelo chamado "Dados"; este entrou como "Dados (importado)".',
    ]);
    const again = templateImportResultSchema.parse(
      (await s.call('POST', '/api/workflow-templates/import', file)).body,
    );
    expect(again.template.name).toBe('Dados (importado 2)');
  });

  it('drops unknown, high-risk and task-only tools, with a warning for each', async () => {
    const s = await setup();
    const file = await fileOf(s, 'conteudo');
    const role = file.template.content.roles[0]!;
    file.template.name = 'De outra máquina';
    file.template.content.roles[0] = {
      ...role,
      tools: [...role.tools, 'planilha_magica', 'run_script', 'request_from_area', 'read_file'],
    };
    const result = templateImportResultSchema.parse(
      (await s.call('POST', '/api/workflow-templates/import', file)).body,
    );
    expect(result.template.roles[0]!.tools).toEqual(['read_file', 'list_dir', 'write_file']);
    expect(result.warnings).toHaveLength(3);
    expect(result.warnings.join('\n')).toMatch(/"planilha_magica".*não existe/);
    expect(result.warnings.join('\n')).toMatch(/risco alto/);
    expect(result.warnings.join('\n')).toMatch(/só existe dentro das tarefas/);
    // Area access comes along: the area is new, and the screen shows it.
    expect(result.template.roles.map((entry) => entry.areaAccess)).toEqual([
      'write',
      'read',
      'read',
    ]);
  });

  it('refuses a file that is not a template, or whose flow is broken', async () => {
    const s = await setup();
    const file = await fileOf(s, 'marketing');
    const post = (body: unknown) => s.call('POST', '/api/workflow-templates/import', body);
    expect((await post({ ...file, format: 'enterprise-agents/agents' })).status).toBe(400);
    expect(
      (
        await post({
          ...file,
          template: {
            ...file.template,
            content: {
              ...file.template.content,
              transitions: [{ from: 'x', to: 'y', actor: 'human' }],
            },
          },
        })
      ).status,
    ).toBe(400);
    expect(
      (await post({ ...file, template: { ...file.template, permissions: { all: 'allow' } } }))
        .status,
    ).toBe(400);
    expect((await s.list()).filter((template) => template.origin === 'user')).toEqual([]);
  });
});
