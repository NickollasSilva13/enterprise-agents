import type { AreaLink, Project, RequestSummary, TaskDetail, TaskSummary } from '@ea/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../../test/render';

// Requests between areas (Phase 17): the screen of open requests and rules,
// and what a task shows of the requests it made or answers.

const project = (id: string, name: string): Project => ({
  id,
  name,
  description: '',
  agentCount: 1,
  createdAt: '2026-11-16T12:00:00.000Z',
  updatedAt: '2026-11-16T12:00:00.000Z',
});
const marketing = project('p1', 'Marketing');
const dados = project('p2', 'Dados');

const request = (overrides: Partial<RequestSummary> & { id: string }): RequestSummary => ({
  title: 'Números de março',
  state: 'pending',
  stageName: 'Análise',
  fromAreaId: 'p1',
  fromAreaName: 'Marketing',
  toAreaId: 'p2',
  toAreaName: 'Dados',
  parentTaskId: 't1',
  parentTitle: 'Campanha',
  createdAt: '2026-11-16T12:00:00.000Z',
  ...overrides,
});

const link: AreaLink = {
  id: 'l1',
  fromAreaId: 'p1',
  fromAreaName: 'Marketing',
  toAreaId: 'p2',
  toAreaName: 'Dados',
  requiresApproval: true,
};

const summary = (overrides: Partial<TaskSummary> & { id: string }): TaskSummary => ({
  areaId: 'p1',
  title: 'Campanha',
  priority: 'normal',
  state: 'open',
  stageId: 's1',
  stageName: 'Criação',
  stageKind: 'human',
  agentId: null,
  agentName: null,
  attention: null,
  working: false,
  queued: false,
  returns: 0,
  runCount: 0,
  parentTaskId: null,
  waitingOn: 0,
  createdAt: '2026-11-16T12:00:00.000Z',
  updatedAt: '2026-11-16T12:00:00.000Z',
  ...overrides,
});

const detailOf = (task: TaskSummary, extra: Partial<TaskDetail> = {}): TaskDetail => ({
  task: { ...task, areaName: 'Marketing', description: '', acceptance: '' },
  events: [],
  moves: [],
  parent: null,
  children: [],
  requestTargets: [],
  schedule: null,
  ...extra,
});

describe('requests between areas (Phase 17)', () => {
  it('lists open requests, approves one and changes a rule', async () => {
    const { writes } = renderApp('/tarefas/pedidos', {
      '/api/requests': {
        requests: [
          request({ id: 'r1' }),
          request({ id: 'r2', title: 'Público-alvo', state: 'open' }),
        ],
      },
      '/api/area-links': { links: [link] },
      '/api/projects': { projects: [marketing, dados] },
      'POST /api/tasks/r1/approve-request': summary({ id: 'r1', state: 'open' }),
      'PATCH /api/area-links/l1': { ...link, requiresApproval: false },
    });

    const waiting = within(await screen.findByRole('region', { name: 'Esperando sua aprovação' }));
    expect(waiting.getByText(/Marketing → Dados/)).toBeTruthy();
    const working = within(screen.getByRole('region', { name: 'Em andamento' }));
    expect(working.getByText('Em andamento, na etapa "Análise".')).toBeTruthy();
    fireEvent.click(waiting.getByRole('button', { name: 'Aprovar' }));

    const rules = within(await screen.findByRole('region', { name: 'Quem pode pedir a quem' }));
    fireEvent.click(rules.getByRole('switch', { name: 'Aprovação para Marketing → Dados' }));
    await waitFor(() =>
      expect(writes()).toEqual([
        { method: 'POST', url: '/api/tasks/r1/approve-request', body: undefined },
        { method: 'PATCH', url: '/api/area-links/l1', body: { requiresApproval: false } },
      ]),
    );
  });

  it('creates a rule between two areas', async () => {
    const { writes } = renderApp('/tarefas/pedidos', {
      '/api/requests': { requests: [] },
      '/api/area-links': { links: [] },
      '/api/projects': { projects: [marketing, dados] },
      'POST /api/area-links': link,
    });
    const rules = within(await screen.findByRole('region', { name: 'Quem pode pedir a quem' }));
    expect(rules.getByText('Nenhuma regra ainda.')).toBeTruthy();
    fireEvent.click(rules.getByRole('button', { name: 'Criar regra' }));
    await waitFor(() =>
      expect(writes()).toEqual([
        {
          method: 'POST',
          url: '/api/area-links',
          body: { fromAreaId: 'p1', toAreaId: 'p2', requiresApproval: true },
        },
      ]),
    );
  });

  it('lets a task ask another area, with files, and shows its requests', async () => {
    const parent = summary({ id: 't1', waitingOn: 1 });
    const { writes } = renderApp('/tarefas/t1', {
      '/api/tasks/t1': detailOf(parent, {
        children: [
          {
            id: 'r1',
            title: 'Números de março',
            areaId: 'p2',
            areaName: 'Dados',
            state: 'open',
            stageName: 'Análise',
          },
        ],
        requestTargets: [{ areaId: 'p2', areaName: 'Dados', requiresApproval: false }],
      }),
      'POST /api/tasks/t1/requests': summary({ id: 'r9', areaId: 'p2', parentTaskId: 't1' }),
    });

    const panel = within(await screen.findByRole('region', { name: 'Pedidos a outras áreas' }));
    expect(panel.getByRole('link', { name: 'Números de março' }).getAttribute('href')).toBe(
      '/tarefas/r1',
    );
    expect(panel.getByText(/Área Dados · em andamento em "Análise"/)).toBeTruthy();
    expect(screen.getByText('Aguardando outra área')).toBeTruthy();

    fireEvent.change(panel.getByRole('textbox', { name: 'O que pedir' }), {
      target: { value: 'Público-alvo' },
    });
    fireEvent.change(panel.getByRole('textbox', { name: 'Arquivos para mandar junto' }), {
      target: { value: 'area/briefing.md\n\n  area/fotos  ' },
    });
    fireEvent.click(panel.getByRole('button', { name: 'Enviar pedido' }));
    await waitFor(() =>
      expect(writes()).toEqual([
        {
          method: 'POST',
          url: '/api/tasks/t1/requests',
          body: {
            toAreaId: 'p2',
            title: 'Público-alvo',
            description: '',
            files: ['area/briefing.md', 'area/fotos'],
          },
        },
      ]),
    );
  });

  it('points to the rules when the area may not ask anyone', async () => {
    renderApp('/tarefas/t1', { '/api/tasks/t1': detailOf(summary({ id: 't1' })) });
    const panel = within(await screen.findByRole('region', { name: 'Pedidos a outras áreas' }));
    expect(panel.getByRole('link', { name: 'Criar uma regra' }).getAttribute('href')).toBe(
      '/tarefas/pedidos',
    );
  });

  it('shows where a request came from and lets the user turn it down with a reason', async () => {
    const pending = summary({ id: 'r1', areaId: 'p2', state: 'pending', parentTaskId: 't1' });
    const { writes } = renderApp('/tarefas/r1', {
      '/api/tasks/r1': detailOf(pending, {
        parent: {
          id: 't1',
          title: 'Campanha',
          areaId: 'p1',
          areaName: 'Marketing',
          state: 'open',
          stageName: 'Criação',
        },
      }),
      'POST /api/tasks/r1/refuse-request': { ...pending, state: 'cancelled' },
    });
    const origin = within(await screen.findByRole('region', { name: 'Pedido de outra área' }));
    expect(origin.getByRole('link', { name: 'Campanha' }).getAttribute('href')).toBe('/tarefas/t1');
    expect(screen.getByText('Pedido esperando sua aprovação')).toBeTruthy();
    expect(screen.getByText('Este pedido entra no quadro quando você o aprovar.')).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: 'Motivo, se recusar' }), {
      target: { value: 'Fora do escopo.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Recusar' }));
    await waitFor(() =>
      expect(writes()).toEqual([
        {
          method: 'POST',
          url: '/api/tasks/r1/refuse-request',
          body: { note: 'Fora do escopo.' },
        },
      ]),
    );
  });
});
