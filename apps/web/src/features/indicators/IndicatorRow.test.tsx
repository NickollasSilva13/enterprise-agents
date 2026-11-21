import type { Indicators } from '@ea/shared';
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { emptyIndicators, json, renderApp } from '../../test/render';
import { indicatorViews } from './IndicatorRow';

const busy: Indicators = {
  doneToday: { today: 5, yesterday: 3, series: [1, 0, 2, 4, 0, 3, 5] },
  meanTaskTime: {
    ms: 14 * 60_000,
    tasks: 15,
    series: [600_000, null, 900_000, 840_000, null, 780_000, 960_000],
  },
  runsWithoutFailure: { rate: 0.95, runs: 40, series: [1, 1, null, 0.9, 1, 0.8, 1] },
  doneThisWeek: { week: 15, previousWeek: 18, series: [1, 0, 2, 4, 0, 3, 5] },
  generatedAt: '2026-11-19T12:00:00.000Z',
};

describe('indicatorViews', () => {
  it('says each figure with its change and its trend (Phase 30, D1)', () => {
    const views = indicatorViews(busy);
    expect(views.map((view) => view.label)).toEqual([
      'Concluídas hoje',
      'Tempo médio por tarefa',
      'Execuções sem falha',
      'Concluídas na semana',
    ]);
    const ready = views.map((view) => (view.status.kind === 'ready' ? view.status : null));
    expect(
      ready.map((status) => [status?.value, status?.delta?.text, status?.delta?.tone]),
    ).toEqual([
      ['5', '+2 contra ontem', 'ok'],
      ['14 min 00 s', '15 tarefas em 7 dias', 'idle'],
      ['95%', '40 execuções em 7 dias', 'idle'],
      ['15', '−3 contra os 7 dias anteriores', 'wait'],
    ]);
    // Days with nothing to measure are left out of the line, and said so to screen readers.
    expect(ready[1]?.series).toHaveLength(5);
    expect(ready[1]?.seriesLabel).toContain('há 5 dias, sem dado');
    expect(ready[0]?.seriesLabel).toContain('hoje, 5 tarefas');
    // Every card says how it is computed.
    for (const view of views) expect(view.explain.length).toBeGreaterThan(40);
  });

  it('says the same as yesterday without a sign', () => {
    const views = indicatorViews({ ...busy, doneToday: { ...busy.doneToday, yesterday: 5 } });
    expect(views[0]?.status).toMatchObject({ delta: { text: 'Igual a ontem', tone: 'idle' } });
  });

  it('says what will make each number appear, when there is nothing to count', () => {
    expect(indicatorViews(emptyIndicators).map((view) => view.status)).toEqual([
      { kind: 'empty', message: 'Nada concluído em 7 dias.' },
      { kind: 'empty', message: 'Nada concluído em 7 dias.' },
      { kind: 'empty', message: 'Nenhuma execução em 7 dias.' },
      { kind: 'empty', message: 'Nada concluído em 14 dias.' },
    ]);
  });
});

describe('IndicatorRow', () => {
  it('shows the four cards under the office scene and at the top of the reports', async () => {
    renderApp('/relatorios', { '/api/indicators': busy });
    const region = within(await screen.findByRole('region', { name: 'Indicadores' }));
    const card = within(await region.findByRole('region', { name: 'Concluídas hoje' }));
    expect(card.getByText('5')).toBeTruthy();
    expect(card.getByText('+2 contra ontem')).toBeTruthy();
    expect(card.getByRole('img', { name: /Últimos 7 dias/ })).toBeTruthy();
    expect(region.getAllByText(/^Como é calculado:/)).toHaveLength(4);
  });

  it('says it could not count, and offers to try again', async () => {
    renderApp('/relatorios', {
      '/api/indicators': () => json(500, { code: 'internal_error', message: 'Erro interno.' }),
    });
    const region = within(await screen.findByRole('region', { name: 'Indicadores' }));
    expect(await region.findAllByText(/Não foi possível calcular/)).toHaveLength(4);
    expect(region.getAllByRole('button', { name: 'Tentar de novo' })).toHaveLength(4);
  });
});
