import type { Agent, Project } from '@ea/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { json, makeAgent, noContent, renderApp } from '../../test/render';

const reader = makeAgent({
  id: 'a1',
  name: 'Leitor',
  projectId: 'p1',
  projectName: 'Pesquisa',
  modelId: 'm1',
  modelName: 'Llama 3',
  state: 'working',
});
const draft = makeAgent({ id: 'a2', name: 'Rascunho', enabled: false, state: 'inactive' });
const triage = makeAgent({
  id: 'a3',
  name: 'Triagem',
  projectName: 'Atendimento',
  state: 'failed',
});

const project: Project = {
  id: 'p1',
  name: 'Pesquisa',
  description: 'Lê e resume',
  agentCount: 1,
  createdAt: '2026-11-12T12:00:00.000Z',
  updatedAt: '2026-11-12T12:00:00.000Z',
};

const api = (agents: Agent[] = [reader, draft, triage], projects: Project[] = [project]) => ({
  '/api/agents': { agents },
  '/api/projects': { projects },
});

const rows = async () =>
  within(await screen.findByRole('list', { name: 'Agentes' })).getAllByRole('listitem');

describe('agent list', () => {
  it('invites the user to create the first agent when there are none', async () => {
    renderApp('/agentes', api([], []));
    expect(await screen.findByText('Nenhum agente ainda.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Criar o primeiro agente' }).getAttribute('href')).toBe(
      '/agentes/novo',
    );
    expect(screen.queryByRole('searchbox')).toBeNull();
  });

  it('shows each agent as a card with its project, model and state (Phase 31, D3)', async () => {
    renderApp('/agentes', api());
    const [first, second, third] = await rows();
    expect(first?.querySelector('[data-agent-card]')).toBeTruthy();
    expect(first?.textContent).toContain('Leitor');
    expect(first?.textContent).toContain('Pesquisa · Llama 3');
    expect(first?.textContent).toContain('Trabalhando');
    expect(second?.textContent).toContain('Sem projeto · sem modelo de IA');
    // What the user must fix is said in words, not only in a colour.
    expect(second?.textContent).toContain('escolha um para ele poder trabalhar');
    expect(second?.textContent).toContain('Inativo');
    expect(third?.textContent).toContain('Com falha');

    expect(screen.getByRole('switch', { name: 'Leitor ativo' }).getAttribute('aria-checked')).toBe(
      'true',
    );
    expect(
      screen.getByRole('switch', { name: 'Rascunho ativo' }).getAttribute('aria-checked'),
    ).toBe('false');
    expect(screen.getByRole('link', { name: 'Editar Leitor' }).getAttribute('href')).toBe(
      '/agentes/a1',
    );
  });

  it('filters by text, ignoring accents, and by state', async () => {
    renderApp('/agentes', api());
    await rows();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar' }), {
      target: { value: 'ATENDIMENTO' },
    });
    expect((await rows()).map((row) => row.textContent)).toHaveLength(1);
    expect(screen.getByText('1 de 3 agentes')).toBeTruthy();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar' }), { target: { value: '' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Estado' }), {
      target: { value: 'inactive' },
    });
    const filtered = await rows();
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.textContent).toContain('Rascunho');

    fireEvent.change(screen.getByRole('combobox', { name: 'Estado' }), {
      target: { value: 'waiting' },
    });
    expect(screen.getByText('Nenhum agente corresponde aos filtros.')).toBeTruthy();
  });

  it('deactivates an agent with the switch and confirms it', async () => {
    const { writes } = renderApp('/agentes', {
      ...api(),
      'PATCH /api/agents/a1': { ...reader, enabled: false, state: 'inactive' },
    });
    await rows();

    fireEvent.click(screen.getByRole('switch', { name: 'Leitor ativo' }));
    expect(await screen.findByText('Leitor desativado.')).toBeTruthy();
    expect(writes()).toEqual([
      { method: 'PATCH', url: '/api/agents/a1', body: { enabled: false } },
    ]);
  });

  it('duplicates an agent and names the copy', async () => {
    const { writes } = renderApp('/agentes', {
      ...api(),
      'POST /api/agents/a1/duplicate': () =>
        json(201, { ...reader, id: 'a9', name: 'Leitor (cópia)' }),
    });
    await rows();

    fireEvent.click(screen.getByRole('button', { name: 'Duplicar Leitor' }));
    expect(await screen.findByText('Cópia criada: Leitor (cópia).')).toBeTruthy();
    expect(writes()).toMatchObject([{ method: 'POST', url: '/api/agents/a1/duplicate' }]);
  });

  it('asks before deleting and deletes only after confirmation', async () => {
    const { writes } = renderApp('/agentes', {
      ...api(),
      'DELETE /api/agents/a1': () => noContent(),
    });
    await rows();

    fireEvent.click(screen.getByRole('button', { name: 'Excluir Leitor' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Excluir Leitor?' }));
    expect(dialog.getByText(/histórico de execuções dele é\s+mantido/)).toBeTruthy();
    expect(document.activeElement).toBe(dialog.getByRole('button', { name: 'Cancelar' }));
    expect(writes()).toEqual([]);

    fireEvent.click(dialog.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(writes()).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: 'Excluir Leitor' }));
    fireEvent.click(screen.getByRole('button', { name: 'Excluir agente' }));
    expect(await screen.findByText('Leitor excluído.')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(writes()).toMatchObject([{ method: 'DELETE', url: '/api/agents/a1' }]);
  });

  it('keeps the dialog open and explains when the agent cannot be deleted', async () => {
    renderApp('/agentes', {
      ...api(),
      'DELETE /api/agents/a1': () =>
        json(409, {
          code: 'agent_has_active_run',
          message: 'Este agente tem uma execução em andamento.',
        }),
    });
    await rows();

    fireEvent.click(screen.getByRole('button', { name: 'Excluir Leitor' }));
    fireEvent.click(screen.getByRole('button', { name: 'Excluir agente' }));

    const dialog = within(await screen.findByRole('dialog'));
    expect((await dialog.findByRole('alert')).textContent).toBe(
      'Este agente tem uma execução em andamento.',
    );
  });

  it('closes a dialog with Escape and returns focus to where it was', async () => {
    renderApp('/agentes', api());
    await rows();
    // A real click focuses the button; fireEvent does not.
    screen.getByRole('button', { name: 'Excluir Leitor' }).focus();
    fireEvent.click(screen.getByRole('button', { name: 'Excluir Leitor' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Excluir Leitor' })),
    );
  });
});

describe('projects', () => {
  it('lists projects with their agent count', async () => {
    renderApp('/agentes', api());
    const panel = within(
      (await screen.findByRole('heading', { name: 'Projetos' })).closest('section')!,
    );
    expect(await panel.findByText('Pesquisa')).toBeTruthy();
    expect(panel.getByText('1 agente. Lê e resume')).toBeTruthy();
  });

  it('creates a project from its name', async () => {
    const { writes } = renderApp('/agentes', {
      ...api([], []),
      'POST /api/projects': () =>
        json(201, { ...project, id: 'p2', name: 'Vendas', agentCount: 0 }),
    });
    const field = await screen.findByRole('textbox', { name: 'Novo projeto' });
    const button = screen.getByRole('button', { name: 'Criar projeto' });
    expect(button).toHaveProperty('disabled', true);

    fireEvent.change(field, { target: { value: 'Vendas' } });
    fireEvent.click(button);

    expect(await screen.findByText('Projeto "Vendas" criado.')).toBeTruthy();
    expect(writes()).toEqual([
      { method: 'POST', url: '/api/projects', body: { name: 'Vendas', description: '' } },
    ]);
    expect(field).toHaveProperty('value', '');
  });

  it('shows a name clash on the field', async () => {
    renderApp('/agentes', {
      ...api(),
      'POST /api/projects': () =>
        json(409, { code: 'name_taken', message: 'Já existe um projeto com esse nome.' }),
    });
    const field = await screen.findByRole('textbox', { name: 'Novo projeto' });
    fireEvent.change(field, { target: { value: 'Pesquisa' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar projeto' }));

    expect(await screen.findByText('Já existe um projeto com esse nome.')).toBeTruthy();
    expect(field.getAttribute('aria-invalid')).toBe('true');
  });

  it('renames a project in a dialog', async () => {
    const { writes } = renderApp('/agentes', {
      ...api(),
      'PATCH /api/projects/p1': { ...project, name: 'Leitura' },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Editar o projeto Pesquisa' }));

    const dialog = within(screen.getByRole('dialog', { name: 'Editar projeto' }));
    fireEvent.change(dialog.getByRole('textbox', { name: 'Nome' }), {
      target: { value: 'Leitura' },
    });
    fireEvent.click(dialog.getByRole('button', { name: 'Salvar projeto' }));

    expect(await screen.findByText('Projeto salvo.')).toBeTruthy();
    expect(writes()).toEqual([
      {
        method: 'PATCH',
        url: '/api/projects/p1',
        body: { name: 'Leitura', description: 'Lê e resume' },
      },
    ]);
  });

  it('says what happens to the agents before deleting a project', async () => {
    const { writes } = renderApp('/agentes', {
      ...api(),
      'DELETE /api/projects/p1': () => noContent(),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir o projeto Pesquisa' }));

    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByText('1 agente continua existindo e fica sem projeto.')).toBeTruthy();
    fireEvent.click(dialog.getByRole('button', { name: 'Excluir projeto' }));

    expect(await screen.findByText('Projeto "Pesquisa" excluído.')).toBeTruthy();
    expect(writes()).toMatchObject([{ method: 'DELETE', url: '/api/projects/p1' }]);
  });
});
