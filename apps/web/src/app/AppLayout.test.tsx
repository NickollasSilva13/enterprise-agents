import type { SystemInfo } from '@ea/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { emptySummary, renderApp } from '../test/render';
import { NAV_ITEMS, PLANNED_AREAS } from './navigation';

const info: SystemInfo = {
  version: '0.1.0',
  nodeVersion: 'v22.0.0',
  platform: 'win32',
  environment: 'production',
  address: 'http://127.0.0.1:4317',
  dataDir: 'C:\\dados',
  databasePath: 'C:\\dados\\app.db',
  maxConcurrentRuns: 4,
  secretStore: 'os',
  startedAt: '2026-11-12T12:00:00.000Z',
};

const api = {
  '/api/dashboard/summary': {
    ...emptySummary,
    agents: { ...emptySummary.agents, total: 7, working: 2, waiting: 1 },
  },
  '/api/office': { rooms: [] },
  '/api/system/info': info,
};

const sidebar = () => within(screen.getAllByRole('navigation', { name: 'Principal' })[0]!);

describe('navigation', () => {
  it('offers every area and marks the ones not built yet with their phase', async () => {
    renderApp('/', api);
    const links = sidebar().getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual(
      NAV_ITEMS.map((item) => item.to),
    );
    for (const area of PLANNED_AREAS) {
      const link = sidebar().getByRole('link', { name: new RegExp(area.title) });
      expect(link.textContent).toContain(`Fase ${area.phase}`);
    }
    expect(sidebar().getByRole('link', { name: 'Painel' }).textContent).not.toContain('Fase');
    expect(sidebar().getByRole('link', { name: 'Painel' }).getAttribute('aria-current')).toBe(
      'page',
    );
  });

  it.each(PLANNED_AREAS.map((area) => [area.title, area] as const))(
    'opens %s as a planned area, not as a working screen',
    async (_title, area) => {
      renderApp('/', api);
      fireEvent.click(sidebar().getByRole('link', { name: new RegExp(area.title) }));
      expect(await screen.findByRole('heading', { name: area.title, level: 1 })).toBeTruthy();
      expect(
        screen.getByRole('heading', { name: `Planejado para a Fase ${area.phase}` }),
      ).toBeTruthy();
      expect(screen.getByText(area.capabilities[0]!)).toBeTruthy();
    },
  );

  it('shows the installation details in settings', async () => {
    renderApp('/configuracoes', api);
    expect(await screen.findByText('http://127.0.0.1:4317')).toBeTruthy();
    expect(screen.getByText('C:\\dados\\app.db')).toBeTruthy();
    expect(screen.getByText('Uso normal')).toBeTruthy();
  });

  it('shows a not-found page for unknown addresses', async () => {
    renderApp('/nao-existe', api);
    expect(await screen.findByRole('heading', { name: 'Página não encontrada' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Voltar ao painel' }).getAttribute('href')).toBe('/');
  });
});

describe('status strip', () => {
  it('shows the office totals on every page', async () => {
    renderApp('/configuracoes', api);
    const strip = within(screen.getByLabelText('Resumo'));
    await waitFor(() => expect(strip.getByText('7')).toBeTruthy());
    expect(strip.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      '7agentes',
      '2trabalhando',
      '1precisam de você',
    ]);
  });
});

describe('mobile menu', () => {
  it('opens, navigates and closes', async () => {
    renderApp('/', api);
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Abrir menu' }));
    const menu = within(screen.getByRole('dialog', { name: 'Menu' }));
    expect(document.activeElement).toBe(menu.getByRole('button', { name: 'Fechar menu' }));

    fireEvent.click(menu.getByRole('link', { name: 'Escritório' }));
    expect(await screen.findByRole('heading', { name: 'Escritório', level: 1 })).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes with Escape', async () => {
    renderApp('/', api);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menu' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
