import type { DashboardSummary } from '@ea/shared';
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { emptySummary, json, renderApp } from '../../test/render';

const board = (name: string) => within(screen.getByRole('group', { name }));

/** Value shown for a figure, found through its label. */
const figure = (boardName: string, label: string) =>
  board(boardName).getByText(label).closest('div')?.querySelector('dd')?.textContent;

const busySummary: DashboardSummary = {
  ...emptySummary,
  agents: { total: 6, active: 5, inactive: 1, failed: 2, working: 1, waiting: 1 },
  runs: {
    active: 2,
    waitingApproval: 1,
    last24h: {
      finished: 4,
      completed: 3,
      failed: 1,
      successRate: 0.75,
      averageDurationMs: 16000,
      inputTokens: 1200,
      outputTokens: 345,
    },
  },
  pendingApprovals: 1,
  providers: 1,
  recentRuns: [
    {
      id: 'r2',
      agentId: 'a1',
      agentName: 'Triagem',
      status: 'failed',
      trigger: 'chat',
      createdAt: '2026-11-12T11:00:00.000Z',
      durationMs: 2500,
    },
    {
      id: 'r1',
      agentId: 'a2',
      agentName: 'Leitor',
      status: 'running',
      trigger: 'manual',
      createdAt: '2026-11-12T10:00:00.000Z',
      durationMs: null,
    },
  ],
  alerts: [
    { kind: 'failed_agents', severity: 'error', count: 2 },
    { kind: 'pending_approvals', severity: 'warning', count: 1 },
    { kind: 'agents_without_model', severity: 'warning', count: 1 },
  ],
};

describe('DashboardPage', () => {
  it('shows a loading state, then zeros and guidance on an empty installation', async () => {
    renderApp('/', {
      '/api/dashboard/summary': {
        ...emptySummary,
        alerts: [{ kind: 'no_provider', severity: 'info', count: 0 }],
      },
    });
    expect(screen.getByText('Carregando o painel…')).toBeTruthy();

    expect(await screen.findByRole('heading', { name: 'Painel', level: 1 })).toBeTruthy();
    await screen.findByRole('group', { name: 'Agentes' });
    expect(figure('Agentes', 'Agentes cadastrados')).toBe('0');
    expect(figure('Agentes', 'Com falha')).toBe('0');
    expect(figure('Execuções', 'Taxa de sucesso em 24 h')).toBe('—');
    expect(figure('Execuções', 'Duração média em 24 h')).toBe('—');

    expect(screen.getByText('Nenhuma execução ainda.')).toBeTruthy();
    expect(screen.getByText(/Nenhum provedor de modelos conectado/)).toBeTruthy();
    expect(screen.queryByText('Carregando o painel…')).toBeNull();
  });

  it('shows the figures, recent runs and alerts it receives', async () => {
    renderApp('/', { '/api/dashboard/summary': busySummary });
    await screen.findByRole('group', { name: 'Agentes' });

    expect(figure('Agentes', 'Agentes cadastrados')).toBe('6');
    expect(figure('Agentes', 'Ativos')).toBe('5');
    expect(figure('Agentes', 'Inativos')).toBe('1');
    expect(figure('Agentes', 'Com falha')).toBe('2');
    expect(figure('Execuções', 'Execuções em andamento')).toBe('2');
    expect(figure('Execuções', 'Aguardando aprovação')).toBe('1');
    expect(figure('Execuções', 'Taxa de sucesso em 24 h')).toBe('75%');
    expect(figure('Execuções', 'Duração média em 24 h')).toBe('16 s');
    expect(figure('Execuções', 'Tokens em 24 h')).toBe('1.545');

    const rows = within(screen.getByRole('table', { name: 'Execuções recentes' })).getAllByRole(
      'row',
    );
    expect(rows).toHaveLength(3);
    expect(rows[1]?.textContent).toContain('Triagem');
    expect(within(rows[1]!).getByRole('link').getAttribute('href')).toBe('/logs/r2');
    expect(rows[1]?.textContent).toContain('Falhou');
    expect(rows[1]?.textContent).toContain('2,5 s');
    expect(rows[2]?.textContent).toContain('Em andamento');

    expect(screen.getByText('2 agentes falharam na última execução.')).toBeTruthy();
    expect(screen.getByText('1 ação espera a sua aprovação.')).toBeTruthy();
    expect(screen.getByText(/1 agente ativo está sem modelo/)).toBeTruthy();
  });

  it('says so when nothing needs attention', async () => {
    renderApp('/', { '/api/dashboard/summary': emptySummary });
    expect(await screen.findByText('Nada pede a sua atenção agora.')).toBeTruthy();
  });

  it('says so when no agent has done anything yet', async () => {
    renderApp('/', { '/api/dashboard/summary': emptySummary });
    const panel = (await screen.findByRole('heading', { name: 'Atividade dos agentes' })).closest(
      'section',
    );
    expect(panel?.textContent).toContain('Nenhuma atividade ainda.');
    expect(panel?.textContent).not.toContain('Planejado');
  });

  it('tells what the agents did in plain language, linking to each run (RF-04)', async () => {
    renderApp('/', {
      '/api/dashboard/summary': {
        ...emptySummary,
        activity: [
          {
            id: 'r2:4',
            runId: 'r2',
            agentId: 'a1',
            agentName: 'Triagem',
            kind: 'finished',
            status: 'failed',
            at: '2026-11-12T11:00:02.000Z',
          },
          {
            id: 'r2:1',
            runId: 'r2',
            agentId: 'a1',
            agentName: 'Triagem',
            kind: 'started',
            status: null,
            at: '2026-11-12T11:00:00.000Z',
          },
          {
            id: 'r1:4',
            runId: 'r1',
            agentId: 'a2',
            agentName: 'Leitor',
            kind: 'finished',
            status: 'completed',
            at: '2026-11-12T10:00:00.000Z',
          },
        ],
        alerts: [{ kind: 'provider_unreachable', severity: 'error', count: 1 }],
      } satisfies DashboardSummary,
    });

    const feed = within(await screen.findByRole('list', { name: 'Atividade dos agentes' }));
    const lines = feed.getAllByRole('listitem').map((item) => item.textContent);
    expect(lines[0]).toContain('Triagem falhou na execução');
    expect(lines[1]).toContain('Triagem começou a trabalhar');
    expect(lines[2]).toContain('Leitor concluiu a execução');
    expect(feed.getAllByRole('link')[0]?.getAttribute('href')).toBe('/logs/r2');

    expect(
      screen.getByText('1 agente não conseguiu falar com o provedor do modelo na última execução.'),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Testar a conexão' }).getAttribute('href')).toBe(
      '/modelos',
    );
  });

  it('shows the error and recovers when the user retries', async () => {
    let attempts = 0;
    renderApp('/', {
      '/api/dashboard/summary': () => {
        attempts += 1;
        return attempts === 1
          ? json(500, { code: 'internal_error', message: 'Erro interno do servidor.' })
          : json(200, emptySummary);
      },
    });

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Não foi possível carregar o painel.');
    expect(alert.textContent).toContain('Erro interno do servidor.');
    expect(screen.getByText('Sem conexão com o servidor')).toBeTruthy();

    fireEvent.click(within(alert).getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByRole('group', { name: 'Agentes' })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
