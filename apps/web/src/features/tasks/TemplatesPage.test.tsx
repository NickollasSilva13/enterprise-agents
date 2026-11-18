import type {
  ModelOption,
  Project,
  TemplateImportResult,
  Workflow,
  WorkflowTemplateSummary,
} from '@ea/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { json, noContent, renderApp } from '../../test/render';

// The catalogue of workflow templates (Phase 18): the screen of templates,
// choosing one for a new area, and saving an area's flow as a template.

const builtin: WorkflowTemplateSummary = {
  id: 'marketing',
  name: 'Marketing',
  origin: 'builtin',
  description: 'Um briefing vira texto.',
  practices: ['Nada fica pronto sem a sua aprovação.'],
  roles: [
    {
      name: 'Redação',
      objective: 'Escrever.',
      tools: ['read_file', 'write_file'],
      areaAccess: 'write',
    },
    {
      name: 'Revisão de marketing',
      objective: 'Conferir.',
      tools: ['read_file'],
      areaAccess: 'read',
    },
  ],
  stages: [
    { name: 'Redação', kind: 'agent' },
    { name: 'Sua aprovação', kind: 'human' },
    { name: 'Publicado', kind: 'done' },
  ],
};

const own: WorkflowTemplateSummary = {
  ...builtin,
  id: 'u1',
  name: 'Meu marketing',
  origin: 'user',
  practices: [],
};

const area: Project = {
  id: 'p1',
  name: 'Site',
  description: 'O site da loja.',
  agentCount: 1,
  createdAt: '2026-11-16T12:00:00.000Z',
  updatedAt: '2026-11-16T12:00:00.000Z',
};

const model: ModelOption = {
  id: 'm1',
  name: 'llama3',
  displayName: 'Llama 3',
  providerName: 'Ollama local',
  isExternal: false,
  supportsTools: true,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the templates screen (Phase 18)', () => {
  it('lists ready-made and own templates, with what each creates', async () => {
    renderApp('/tarefas/modelos', { '/api/workflow-templates': { templates: [builtin, own] } });
    const ready = within(await screen.findByRole('region', { name: 'Modelos prontos' }));
    expect(ready.getByText('Redação → Sua aprovação → Publicado')).toBeTruthy();
    expect(
      ready.getByText(/lê e escreve na pasta da área · ferramentas: read_file, write_file/),
    ).toBeTruthy();
    expect(ready.getByText(/^lê a pasta da área/)).toBeTruthy();
    // Ready-made templates are exported, never edited or deleted.
    expect(ready.getByRole('button', { name: 'Exportar Marketing' })).toBeTruthy();
    expect(ready.queryByRole('button', { name: 'Excluir Marketing' })).toBeNull();

    const mine = within(screen.getByRole('region', { name: 'Seus modelos' }));
    expect(mine.getByRole('button', { name: 'Excluir Meu marketing' })).toBeTruthy();
  });

  it('says how to get a template of your own', async () => {
    renderApp('/tarefas/modelos', { '/api/workflow-templates': { templates: [builtin] } });
    expect(await screen.findByText('Nenhum modelo seu ainda.')).toBeTruthy();
  });

  it('edits and deletes an own template', async () => {
    const { writes } = renderApp('/tarefas/modelos', {
      '/api/workflow-templates': { templates: [builtin, own] },
      'PATCH /api/workflow-templates/u1': { ...own, name: 'Campanhas' },
      'DELETE /api/workflow-templates/u1': noContent,
    });
    const mine = within(await screen.findByRole('region', { name: 'Seus modelos' }));
    fireEvent.click(mine.getByRole('button', { name: 'Editar Meu marketing' }));
    const dialog = within(await screen.findByRole('dialog'));
    fireEvent.change(dialog.getByRole('textbox', { name: 'Nome' }), {
      target: { value: 'Campanhas' },
    });
    fireEvent.change(dialog.getByRole('textbox', { name: /Boas práticas/ }), {
      target: { value: 'Uma.\n\n  Duas.  ' },
    });
    fireEvent.click(dialog.getByRole('button', { name: 'Salvar' }));
    await screen.findByText('Modelo atualizado.');

    fireEvent.click(mine.getByRole('button', { name: 'Excluir Meu marketing' }));
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Excluir' }),
    );
    await waitFor(() =>
      expect(writes()).toEqual([
        {
          method: 'PATCH',
          url: '/api/workflow-templates/u1',
          body: {
            name: 'Campanhas',
            description: 'Um briefing vira texto.',
            practices: ['Uma.', 'Duas.'],
          },
        },
        { method: 'DELETE', url: '/api/workflow-templates/u1', body: undefined },
      ]),
    );
  });

  it('exports a template to a JSON file', async () => {
    const blobs: Blob[] = [];
    URL.createObjectURL = vi.fn((blob: Blob) => {
      blobs.push(blob);
      return 'blob:teste';
    });
    URL.revokeObjectURL = vi.fn();
    const clicked: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(this.download);
    });
    const file = {
      format: 'enterprise-agents/workflow-template',
      version: 1,
      template: {
        name: 'Conteúdo e documentação',
        content: {
          description: '',
          practices: [],
          roles: [],
          stages: [
            { key: 'a', name: 'Fila', kind: 'human', role: null },
            { key: 'b', name: 'Fim', kind: 'done', role: null },
          ],
          transitions: [{ from: 'a', to: 'b', actor: 'human' }],
        },
      },
    };
    renderApp('/tarefas/modelos', {
      '/api/workflow-templates': {
        templates: [{ ...builtin, id: 'conteudo', name: 'Conteúdo e documentação' }],
      },
      '/api/workflow-templates/conteudo/export': file,
    });
    fireEvent.click(
      await screen.findByRole('button', { name: 'Exportar Conteúdo e documentação' }),
    );
    expect(await screen.findByText('Modelo "Conteúdo e documentação" exportado.')).toBeTruthy();
    expect(clicked).toEqual(['modelo-conteudo-e-documentacao.json']);
    expect(JSON.parse(await (blobs[0] as Blob).text())).toEqual(file);
  });

  it('imports a file and shows what changed', async () => {
    const result: TemplateImportResult = {
      template: { ...own, name: 'Meu marketing (importado)' },
      warnings: ['"Executar script" é de risco alto e não vem de um arquivo.'],
    };
    const { writes } = renderApp('/tarefas/modelos', {
      '/api/workflow-templates': { templates: [builtin] },
      'POST /api/workflow-templates/import': () => json(201, result),
    });
    await screen.findByRole('region', { name: 'Modelos prontos' });
    fireEvent.change(screen.getByLabelText('Arquivo de modelo para importar'), {
      target: {
        files: [new File(['{"format":"x"}'], 'modelo.json', { type: 'application/json' })],
      },
    });
    const dialog = within(await screen.findByRole('dialog', { name: 'Modelo importado' }));
    expect(dialog.getByText('Meu marketing (importado)')).toBeTruthy();
    expect(dialog.getByText(/risco alto/)).toBeTruthy();
    expect(writes()).toEqual([
      { method: 'POST', url: '/api/workflow-templates/import', body: { format: 'x' } },
    ]);
  });

  it('refuses a file that is not JSON without sending it', async () => {
    const { writes } = renderApp('/tarefas/modelos', {
      '/api/workflow-templates': { templates: [builtin] },
    });
    await screen.findByRole('region', { name: 'Modelos prontos' });
    fireEvent.change(screen.getByLabelText('Arquivo de modelo para importar'), {
      target: { files: [new File(['não é json'], 'modelo.json')] },
    });
    expect(await screen.findByText('Este arquivo não é um JSON válido.')).toBeTruthy();
    expect(writes()).toEqual([]);
  });
});

describe('a new area from a template (Phase 18)', () => {
  it('groups ready-made and own templates and creates the area', async () => {
    const { writes } = renderApp('/tarefas', {
      '/api/projects': { projects: [] },
      '/api/workflow-templates': { templates: [builtin, own] },
      '/api/models': { models: [model] },
      'POST /api/areas/from-template': () => json(201, { areaId: 'p9', agentIds: [] }),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Nova área a partir de modelo' }));
    const dialog = within(await screen.findByRole('dialog'));
    const select = await dialog.findByRole('combobox', { name: 'Modelo de fluxo' });
    expect(
      [...select.querySelectorAll('optgroup')].map((group) => [
        group.label,
        [...group.querySelectorAll('option')].map((option) => option.textContent),
      ]),
    ).toEqual([
      ['Modelos prontos', ['Marketing']],
      ['Seus modelos', ['Meu marketing']],
    ]);
    fireEvent.change(select, { target: { value: 'u1' } });
    expect(dialog.getByText(/lê a pasta da área/)).toBeTruthy();
    fireEvent.change(dialog.getByRole('textbox', { name: 'Nome da área' }), {
      target: { value: 'Campanhas' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Criar área' }));
    await waitFor(() =>
      expect(writes()).toEqual([
        {
          method: 'POST',
          url: '/api/areas/from-template',
          body: { templateId: 'u1', name: 'Campanhas', modelId: 'm1' },
        },
      ]),
    );
  });
});

describe('saving an area as a template (Phase 18, D3)', () => {
  const workflow: Workflow = {
    areaId: 'p1',
    stages: [
      {
        id: 's1',
        name: 'Fila',
        kind: 'human',
        position: 0,
        agentId: null,
        agentName: null,
        openTasks: 0,
      },
      {
        id: 's2',
        name: 'Fim',
        kind: 'done',
        position: 1,
        agentId: null,
        agentName: null,
        openTasks: 0,
      },
    ],
    transitions: [{ id: 't1', fromStageId: 's1', toStageId: 's2', actor: 'human' }],
  };

  it('saves the flow with a name, description and practices', async () => {
    const { writes } = renderApp('/tarefas/fluxo/p1', {
      '/api/projects': { projects: [area] },
      '/api/agents': { agents: [] },
      '/api/areas/p1/workflow': workflow,
      'POST /api/workflow-templates': () => json(201, { ...own, name: 'Fluxo do site' }),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Salvar como modelo' }));
    const dialog = within(await screen.findByRole('dialog'));
    expect(dialog.getByRole<HTMLTextAreaElement>('textbox', { name: 'Descrição' }).value).toBe(
      'O site da loja.',
    );
    fireEvent.change(dialog.getByRole('textbox', { name: 'Nome do modelo' }), {
      target: { value: 'Fluxo do site' },
    });
    fireEvent.change(dialog.getByRole('textbox', { name: /Boas práticas/ }), {
      target: { value: 'Revisar sempre.\n' },
    });
    fireEvent.click(dialog.getByRole('button', { name: 'Salvar modelo' }));
    expect(await screen.findByText('Modelo "Fluxo do site" salvo.')).toBeTruthy();
    expect(writes()).toEqual([
      {
        method: 'POST',
        url: '/api/workflow-templates',
        body: {
          areaId: 'p1',
          name: 'Fluxo do site',
          description: 'O site da loja.',
          practices: ['Revisar sempre.'],
        },
      },
    ]);
  });

  it('shows why the server refused the name', async () => {
    renderApp('/tarefas/fluxo/p1', {
      '/api/projects': { projects: [area] },
      '/api/agents': { agents: [] },
      '/api/areas/p1/workflow': workflow,
      'POST /api/workflow-templates': () =>
        json(409, { code: 'name_taken', message: 'Já existe um modelo com esse nome.' }),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Salvar como modelo' }));
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Salvar modelo' }),
    );
    expect(await screen.findByText('Já existe um modelo com esse nome.')).toBeTruthy();
  });
});
