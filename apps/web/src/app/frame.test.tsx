import type { Approval, RequestSummary, SearchResults, TaskSummary } from '@ea/shared';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { json, renderApp } from '../test/render';

// The frame of every screen (Phase 21): menu counters, Automações, the bell,
// the global search and the user's card.

const AT = '2026-11-19T12:00:00.000Z';

const approval: Approval = {
  id: 'ap1',
  runId: 'r1',
  originRunId: 'r1',
  agentId: 'a1',
  agentName: 'Triagem',
  conversationId: null,
  toolName: 'write_file',
  toolTitle: 'Escrever arquivo',
  risk: 'medium',
  arguments: {},
  status: 'pending',
  reason: null,
  createdAt: AT,
  decidedAt: null,
};

const waitingTask: TaskSummary & { areaName: string } = {
  id: 't1',
  areaId: 'p1',
  areaName: 'Site',
  title: 'Revisar a página inicial',
  priority: 'normal',
  state: 'open',
  stageId: 's2',
  stageName: 'Sua revisão',
  stageKind: 'human',
  roleName: null,
  agentId: null,
  agentName: null,
  attention: null,
  working: false,
  queued: false,
  returns: 0,
  runCount: 1,
  parentTaskId: null,
  waitingOn: 0,
  createdAt: AT,
  updatedAt: AT,
};

const request = (id: string, state: RequestSummary['state']): RequestSummary => ({
  id,
  title: `Pedido ${id}`,
  state,
  stageName: 'Fila',
  fromAreaId: 'p1',
  fromAreaName: 'Site',
  toAreaId: 'p2',
  toAreaName: 'Marketing',
  parentTaskId: 't1',
  parentTitle: 'Revisar a página inicial',
  createdAt: AT,
});

const waitingApi = {
  '/api/approvals': { approvals: [approval, { ...approval, id: 'ap2' }] },
  '/api/tasks/waiting': { tasks: [waitingTask] },
  // Only a request still to be approved waits for the user.
  '/api/requests': { requests: [request('q1', 'pending'), request('q2', 'open')] },
};

const menu = () => within(screen.getAllByRole('navigation', { name: 'Principal' })[0]!);

describe('menu (Phase 21, D1)', () => {
  it('counts only what waits for the user', async () => {
    renderApp('/', waitingApi);
    const tasks = menu().getByRole('link', { name: /^Tarefas/ });
    await waitFor(() => expect(tasks.textContent).toBe('Tarefas2 esperando você'));
    expect(menu().getByRole('link', { name: /^Aprovações/ }).textContent).toBe(
      'Aprovações2 esperando você',
    );
    expect(menu().getByRole('link', { name: 'Escritório' }).textContent).toBe('Escritório');
  });

  it('marks Automações, not Tarefas, on the schedules page', async () => {
    renderApp('/tarefas/agendamentos', {
      '/api/schedules': { schedules: [] },
      '/api/projects': { projects: [] },
    });
    expect(menu().getByRole('link', { name: 'Automações' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(
      menu()
        .getByRole('link', { name: /^Tarefas/ })
        .getAttribute('aria-current'),
    ).toBeNull();
    expect(menu().getByRole('link', { name: 'Modelos de IA' })).toBeTruthy();
  });
});

describe('bell (Phase 21, D4)', () => {
  it('lists approvals, stopped tasks and requests, each leading where it is resolved', async () => {
    renderApp('/', waitingApi);
    const bell = await screen.findByRole('button', {
      name: 'Avisos: 4 itens esperando você',
    });
    fireEvent.click(bell);
    const panel = within(screen.getByRole('region', { name: 'Esperando você' }));
    const links = panel.getAllByRole('link');
    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Triagem quer usar "Escrever arquivo"Aprovação de ferramenta', '/aprovacoes'],
      ['Triagem quer usar "Escrever arquivo"Aprovação de ferramenta', '/aprovacoes'],
      ['Revisar a página inicialSite · na etapa Sua revisão', '/tarefas/t1'],
      ['Pedido q1Pedido de Site para Marketing', '/tarefas/q1'],
    ]);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('region', { name: 'Esperando você' })).toBeNull();
    expect(document.activeElement).toBe(bell);
  });

  it('says when nothing waits, and when a list could not be read', async () => {
    renderApp('/', { '/api/requests': () => json(500, { code: 'x', message: 'falhou' }) });
    fireEvent.click(await screen.findByRole('button', { name: 'Avisos: nada esperando você' }));
    const panel = within(screen.getByRole('region', { name: 'Esperando você' }));
    expect(await panel.findByRole('alert')).toBeTruthy();
    expect(panel.getByText(/Nada esperando você/)).toBeTruthy();
  });
});

const results: SearchResults = {
  agents: [{ id: 'a1', name: 'Fátima', description: 'Fecha o mês', areaName: 'Finanças' }],
  areas: [],
  tasks: [{ id: 't9', title: 'Fechar o mês', areaName: 'Finanças', state: 'open' }],
};

describe('global search (Phase 21, D3)', () => {
  it('opens on Ctrl K and finds screens, agents and tasks', async () => {
    const { requests } = renderApp('/', { '/api/search': results });
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    const dialog = within(screen.getByRole('dialog', { name: 'Buscar' }));
    const box = dialog.getByRole('combobox', { name: 'Buscar agentes, áreas, tarefas e telas' });
    expect(document.activeElement).toBe(box);

    fireEvent.change(box, { target: { value: 'fec' } });
    expect(await dialog.findByRole('option', { name: /Fátima/ })).toBeTruthy();
    expect(dialog.getByRole('group', { name: 'Tarefas' })).toBeTruthy();
    expect(requests.some((request) => request.url === '/api/search?q=fec')).toBe(true);

    // Screens are matched without the server, accents ignored.
    fireEvent.change(box, { target: { value: 'escrito' } });
    expect(await dialog.findByRole('option', { name: /Escritório/ })).toBeTruthy();
  });

  it('moves with the arrows and opens with Enter', async () => {
    const { router } = renderApp('/', { '/api/search': results });
    fireEvent.click(screen.getByRole('button', { name: /^Buscar…/ }));
    const box = screen.getByRole('combobox');
    fireEvent.change(box, { target: { value: 'fec' } });
    await screen.findByRole('option', { name: /Fechar o mês/ });
    const options = screen.getAllByRole('option');
    expect(options[0]!.getAttribute('aria-selected')).toBe('true');
    expect(box.getAttribute('aria-activedescendant')).toBe(options[0]!.id);

    fireEvent.keyDown(box, { key: 'ArrowDown' });
    expect(box.getAttribute('aria-activedescendant')).toBe(options[1]!.id);
    fireEvent.keyDown(box, { key: 'Enter' });
    await waitFor(() => expect(router.state.location.pathname).toBe('/tarefas/t9'));
    expect(screen.queryByRole('dialog', { name: 'Buscar' })).toBeNull();
  });

  it('says when nothing is found, and closes with Escape', async () => {
    renderApp('/', { '/api/search': { agents: [], areas: [], tasks: [] } });
    const opener = screen.getByRole('button', { name: /^Buscar…/ });
    opener.focus();
    fireEvent.click(opener);
    const box = screen.getByRole('combobox');
    fireEvent.change(box, { target: { value: 'zzz' } });
    expect(await screen.findByText('Nada encontrado para "zzz".')).toBeTruthy();
    fireEvent.keyDown(box, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Buscar' })).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});

describe('your card (Phase 21, D5)', () => {
  it('says "Você" without a name, and the name once there is one', async () => {
    renderApp('/', { '/api/profile': { name: 'Nick', appearance: null } });
    const column = within(screen.getAllByRole('complementary')[0]!);
    const card = await column.findByRole('link', { name: /Nick/ });
    expect(card.getAttribute('href')).toBe('/configuracoes#voce');
  });

  it('saves the name and the character from the settings', async () => {
    let saved: unknown = null;
    const { writes } = renderApp('/configuracoes', {
      '/api/system/info': {
        version: '0.1.0',
        nodeVersion: 'v22.0.0',
        platform: 'win32',
        environment: 'production',
        address: 'http://127.0.0.1:4317',
        dataDir: 'C:\\dados',
        databasePath: 'C:\\dados\\app.db',
        maxConcurrentRuns: 4,
        secretStore: 'os',
        startedAt: AT,
      },
      'PUT /api/profile': (sent: { body: unknown }) => {
        saved = sent.body;
        return json(200, sent.body);
      },
    });
    const panel = within(await screen.findByRole('region', { name: 'Você' }));
    fireEvent.change(await panel.findByRole('textbox', { name: 'Seu nome' }), {
      target: { value: 'Nick' },
    });
    fireEvent.click(panel.getByRole('switch', { name: 'Usar um personagem' }));
    expect(panel.getByRole('radiogroup', { name: 'Personagem' })).toBeTruthy();
    await act(async () => {
      fireEvent.click(panel.getByRole('button', { name: 'Salvar perfil' }));
    });
    expect(writes()).toHaveLength(1);
    expect(saved).toMatchObject({ name: 'Nick', appearance: { kind: 'robot' } });
    expect(await screen.findByText('Perfil salvo.')).toBeTruthy();
  });
});
