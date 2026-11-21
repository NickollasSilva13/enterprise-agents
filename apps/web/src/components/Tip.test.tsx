import { TIP_IDS } from '@ea/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp, setUpGuide } from '../test/render';

const SOURCES = import.meta.glob<string>(['../features/**/*.tsx', '!../**/*.test.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

describe('tips (Phase 32, D5)', () => {
  it('shows a tip until the user closes it, and keeps that on the server', async () => {
    const fresh = { ...setUpGuide, dismissedTips: [] };
    const { writes } = renderApp('/aprovacoes', {
      '/api/approvals': { approvals: [] },
      '/api/guide': fresh,
      'PUT /api/guide': { ...fresh, dismissedTips: ['approvals-wait'] },
    });
    const tip = within(await screen.findByRole('complementary', { name: 'Dica' }));
    expect(tip.getByText(/a execução do agente fica parada/)).toBeTruthy();
    fireEvent.click(tip.getByRole('button', { name: 'Entendi' }));
    await waitFor(() => expect(screen.queryByRole('complementary', { name: 'Dica' })).toBeNull());
    expect(writes()).toEqual([
      {
        method: 'PUT',
        url: '/api/guide',
        body: { skipped: false, dismissedTips: ['approvals-wait'] },
      },
    ]);
  });

  it('has a place on some screen for every tip there is', () => {
    const text = Object.values(SOURCES).join('\n');
    for (const id of TIP_IDS) expect(text).toContain(`<Tip id="${id}"`);
  });
});
