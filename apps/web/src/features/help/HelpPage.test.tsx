import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp, setUpGuide } from '../../test/render';
import { anchorOf } from './GuideDocument';

describe('anchorOf', () => {
  it('makes the anchors the guide links to, as GitHub does', () => {
    expect(anchorOf('1. Instalação e primeira execução')).toBe('1-instalação-e-primeira-execução');
    expect(anchorOf('8. Acompanhar o trabalho: Escritório, Relatórios e Logs')).toBe(
      '8-acompanhar-o-trabalho-escritório-relatórios-e-logs',
    );
  });
});

describe('help (Phase 32, D4)', () => {
  it('shows the user guide with its contents working as links inside the page', async () => {
    renderApp('/ajuda', {});
    const guide = within(await screen.findByRole('region', { name: 'Guia de uso' }));
    const first = guide.getByRole('heading', { name: '1. Instalação e primeira execução' });
    expect(first.id).toBe('1-instalação-e-primeira-execução');
    // Every entry of the contents leads to a heading of the page.
    const contents = guide
      .getAllByRole('link')
      .map((link) => link.getAttribute('href') ?? '')
      .filter((href) => href.startsWith('#'));
    expect(contents.length).toBeGreaterThanOrEqual(10);
    for (const href of contents) {
      expect(document.getElementById(decodeURIComponent(href.slice(1)))).not.toBeNull();
    }
    // Tables come out as tables.
    expect(guide.getAllByRole('table').length).toBeGreaterThan(0);
    // Links to other documents of the repository have no page here.
    expect(guide.queryByRole('link', { name: 'SPEC.md' })).toBeNull();
  });

  it('brings back the first steps put aside, and the tips closed (D2, D5)', async () => {
    const skipped = {
      ...setUpGuide,
      skipped: true,
      done: { provider: true, model: false, area: false, task: false },
    };
    const { writes } = renderApp('/ajuda', {
      '/api/guide': skipped,
      'PUT /api/guide': { ...skipped, skipped: false },
    });
    const steps = within(await screen.findByRole('region', { name: 'Primeiros passos' }));
    expect(steps.getByText('1 de 4')).toBeTruthy();
    fireEvent.click(steps.getByRole('button', { name: 'Retomar o roteiro' }));
    await waitFor(() =>
      expect(writes()).toEqual([
        {
          method: 'PUT',
          url: '/api/guide',
          body: { skipped: false, dismissedTips: setUpGuide.dismissedTips },
        },
      ]),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar as dicas de novo' }));
    await waitFor(() => expect(writes()).toHaveLength(2));
    expect(writes()[1]?.body).toEqual({ skipped: false, dismissedTips: [] });
  });
});
