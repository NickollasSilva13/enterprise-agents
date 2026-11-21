import { buildPresetLayout, type GuideState, type Office } from '@ea/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { emptySummary, renderApp } from '../../test/render';

const halfway: GuideState = {
  skipped: false,
  dismissedTips: [],
  done: { provider: true, model: false, area: false, task: false },
};

/** A new installation's office: nobody in it yet. */
const emptyOffice: Office = {
  layout: buildPresetLayout('complete', [{ projectId: null, agents: 0 }]),
  customized: false,
  projects: [],
  agents: [],
};
const office = { '/api/office': emptyOffice, '/api/dashboard/summary': emptySummary };

describe('first steps (Phase 32, D1 and D2)', () => {
  it('marks what the data shows done and points to the next step', async () => {
    renderApp('/escritorio', { ...office, '/api/guide': halfway });
    const card = within(
      await screen.findByRole('region', { name: 'Primeiros passos' }, { timeout: 3000 }),
    );
    expect(card.getByText('1 de 4')).toBeTruthy();
    expect(card.getByText(/Conectar um provedor de modelos/).textContent).toContain('(feito)');
    // Only the next step has its way there.
    const links = card.getAllByRole('link');
    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Escolher', '/modelos'],
    ]);
  });

  it('goes away when put aside, and the choice is kept on the server', async () => {
    const { writes } = renderApp('/escritorio', {
      ...office,
      '/api/guide': halfway,
      'PUT /api/guide': { ...halfway, skipped: true },
    });
    fireEvent.click(
      await screen.findByRole('button', { name: 'Pular por agora' }, { timeout: 3000 }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Primeiros passos' })).toBeNull(),
    );
    expect(writes()).toEqual([
      { method: 'PUT', url: '/api/guide', body: { skipped: true, dismissedTips: [] } },
    ]);
  });

  it('is not there once every step is done', async () => {
    renderApp('/escritorio', office);
    await screen.findByRole('heading', { name: /Agentes no escritório/ }, { timeout: 3000 });
    expect(screen.queryByRole('region', { name: 'Primeiros passos' })).toBeNull();
  });

  it('opens the form of each step from its link', async () => {
    renderApp('/modelos?novo=1', { '/api/providers': { providers: [] } });
    expect(await screen.findByRole('dialog', { name: 'Adicionar provedor' })).toBeTruthy();
  });
});
