import { fireEvent, render, screen, within } from '@testing-library/react';
import { ListPlus } from 'lucide-react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { emptySummary, renderApp } from '../test/render';
import { ActivityFeed } from './ActivityFeed';
import { AgentCard } from './AgentCard';
import { Avatar } from './Avatar';
import { IndicatorCard } from './IndicatorCard';
import { QuickAction } from './QuickAction';
import { sparklinePoints } from './Sparkline';
import { StatusPill } from './StatusPill';

// The pieces of the visual system (Phase 20): each one in every state it has,
// read the way a screen reader and a keyboard user meet it.

const inRouter = (node: ReactNode) => render(<MemoryRouter>{node}</MemoryRouter>);

describe('sparklinePoints', () => {
  it('draws nothing with fewer than two values', () => {
    expect(sparklinePoints([])).toEqual([]);
    expect(sparklinePoints([5])).toEqual([]);
  });

  it('spreads the values across the width, the highest on top', () => {
    const points = sparklinePoints([0, 10, 5]);
    expect(points.map(([x]) => x)).toEqual([0, 50, 100]);
    const [low, high, middle] = points.map(([, y]) => y);
    expect(high).toBeLessThan(middle!);
    expect(middle).toBeLessThan(low!);
  });

  it('puts a flat series in the middle', () => {
    expect(sparklinePoints([3, 3, 3]).map(([, y]) => y)).toEqual([16, 16, 16]);
  });
});

describe('IndicatorCard', () => {
  it('shows the value, the change and the trend, with how it is computed', () => {
    render(
      <IndicatorCard
        label="Concluídas hoje"
        explain="Tarefas que chegaram à etapa final hoje."
        status={{
          kind: 'ready',
          value: '12',
          delta: { text: '+3 contra ontem', tone: 'ok' },
          series: [1, 2, 3],
          seriesLabel: 'Últimos 3 dias: 1, 2 e 3',
        }}
      />,
    );
    const card = screen.getByRole('region', { name: 'Concluídas hoje' });
    expect(within(card).getByText('12')).toBeTruthy();
    expect(within(card).getByText('+3 contra ontem')).toBeTruthy();
    expect(within(card).getByRole('img', { name: 'Últimos 3 dias: 1, 2 e 3' })).toBeTruthy();
    // "Como é calculado" is a native disclosure: focusable and opened by keyboard.
    const summary = within(card).getByText('Como é calculado: Concluídas hoje').closest('summary');
    expect(summary).toBeTruthy();
    expect(within(card).getByText('Tarefas que chegaram à etapa final hoje.')).toBeTruthy();
  });

  it('says why there is no number instead of showing zero', () => {
    render(
      <IndicatorCard
        label="Tempo médio"
        explain="Média."
        status={{ kind: 'empty', message: 'Ainda não há tarefas concluídas.' }}
      />,
    );
    expect(screen.getByText('Ainda não há tarefas concluídas.')).toBeTruthy();
    expect(screen.queryByText('0')).toBeNull();
  });

  it('announces loading and lets a failure be retried', () => {
    const retry = vi.fn();
    render(
      <>
        <IndicatorCard label="A" explain="." status={{ kind: 'loading' }} />
        <IndicatorCard
          label="B"
          explain="."
          status={{ kind: 'error', message: 'Não foi possível calcular.', onRetry: retry }}
        />
      </>,
    );
    expect(screen.getByRole('status').textContent).toContain('Carregando A');
    expect(screen.getByRole('alert').textContent).toContain('Não foi possível calcular.');
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(retry).toHaveBeenCalledOnce();
  });
});

describe('StatusPill', () => {
  it('always says the state in words', () => {
    render(<StatusPill tone="wait">Aguardando você</StatusPill>);
    expect(screen.getByText('Aguardando você')).toBeTruthy();
  });
});

describe('AgentCard', () => {
  const base = {
    agentId: 'a1',
    name: 'Ana',
    role: 'Atendimento',
    appearance: null,
    to: '/agentes/a1',
  } as const;

  it('is one link to the agent, with its state and what it does', () => {
    inRouter(<AgentCard {...base} state="working" activity="Respondendo" meta="3 passos" />);
    const link = screen.getByRole('link', { name: 'Ana' });
    expect(link.getAttribute('href')).toBe('/agentes/a1');
    expect(screen.getAllByText('Trabalhando').length).toBeGreaterThan(0);
    expect(screen.getByText('Respondendo')).toBeTruthy();
    expect(screen.getByText('3 passos')).toBeTruthy();
  });

  it('says when the agent has nothing to do, and marks the picked card', () => {
    inRouter(<AgentCard {...base} state="idle" activity={null} selected />);
    expect(screen.getByText('Sem tarefa no momento.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ana' }).getAttribute('aria-current')).toBe('true');
  });

  it('colours a wait the way the state is coloured', () => {
    inRouter(<AgentCard {...base} state="waiting" activity="Quer sua aprovação" />);
    expect(screen.getByText('Quer sua aprovação').className).toContain('text-wait');
  });
});

describe('Avatar', () => {
  it('names the state of the dot for screen readers', () => {
    render(<Avatar agentId="a1" appearance={null} state="failed" />);
    expect(screen.getByText('Com falha').className).toContain('sr-only');
  });
});

describe('ActivityFeed', () => {
  const at = '2026-11-16T14:32:00';

  it('lists what happened, each item saying its kind and leading to it', () => {
    inRouter(
      <ActivityFeed
        label="Atividade recente"
        emptyText="Nada."
        status={{
          kind: 'ready',
          items: [
            { id: '1', kind: 'task', text: 'Tarefa concluída', at, to: '/tarefas/1' },
            { id: '2', kind: 'approval', text: 'Espera aprovação', at },
          ],
        }}
      />,
    );
    const list = screen.getByRole('list', { name: 'Atividade recente' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]!.textContent).toContain('Tarefa: Tarefa concluída');
    expect(within(items[0]!).getByRole('link').getAttribute('href')).toBe('/tarefas/1');
    expect(within(items[1]!).queryByRole('link')).toBeNull();
    expect(items[1]!.querySelector('time')?.getAttribute('dateTime')).toBe(at);
  });

  it('says what will appear when there is nothing yet', () => {
    inRouter(
      <ActivityFeed
        label="Atividade"
        emptyText="Tarefas e aprovações aparecem aqui."
        status={{ kind: 'ready', items: [] }}
      />,
    );
    expect(screen.getByText('Tarefas e aprovações aparecem aqui.')).toBeTruthy();
  });

  it('announces loading and offers a retry on failure', () => {
    const retry = vi.fn();
    inRouter(
      <>
        <ActivityFeed label="Atividade" emptyText="" status={{ kind: 'loading' }} />
        <ActivityFeed
          label="Atividade"
          emptyText=""
          status={{ kind: 'error', error: new Error('x'), onRetry: retry }}
        />
      </>,
    );
    expect(screen.getByRole('status').textContent).toContain('Carregando Atividade');
    expect(screen.getByRole('alert').textContent).toContain('Não foi possível carregar atividade.');
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(retry).toHaveBeenCalledOnce();
  });
});

describe('QuickAction', () => {
  it('leads to the action', () => {
    inRouter(
      <QuickAction icon={ListPlus} label="Criar tarefa" description="No quadro" to="/tarefas" />,
    );
    expect(screen.getByRole('link', { name: /Criar tarefa/ }).getAttribute('href')).toBe(
      '/tarefas',
    );
  });

  it('stays visible when off, says why, and can still be reached by keyboard', () => {
    inRouter(
      <QuickAction
        icon={ListPlus}
        label="Agendar tarefa"
        description="Repetir"
        to="/tarefas/agendamentos"
        disabledReason="Crie uma área antes de agendar."
      />,
    );
    const action = screen.getByRole('link', { name: /Agendar tarefa/ });
    expect(action.getAttribute('aria-disabled')).toBe('true');
    expect(action.getAttribute('href')).toBeNull();
    expect(action.tabIndex).toBe(0);
    expect(action.textContent).toContain('Crie uma área antes de agendar.');
  });
});

describe('reference page', () => {
  it('opens in development, saying its values are examples', async () => {
    renderApp('/referencia', {
      '/api/dashboard/summary': emptySummary,
      '/api/office': { rooms: [] },
    });
    // The page draws every piece and every character: it takes a moment in jsdom.
    expect(
      await screen.findByRole('heading', { name: 'Sistema visual', level: 1 }, { timeout: 3000 }),
    ).toBeTruthy();
    expect(screen.getByText(/todos os valores são exemplos/)).toBeTruthy();
  });
});
