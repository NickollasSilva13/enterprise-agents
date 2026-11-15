import { expect, type Page } from '@playwright/test';

/** Collects console errors and failed requests; CSP violations show up here. */
export function watchForProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    // Desktop and mobile share one database: a provider the other project has
    // just deleted may still be on this page's list when its models are read.
    const staleProvider =
      message.text().includes('404') &&
      /\/api\/providers\/[^/]+\/models$/.test(message.location().url);
    if (!staleProvider) problems.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('requestfailed', (request) => {
    // Requests cut short by a reload or a navigation are not failures.
    if (request.failure()?.errorText === 'net::ERR_ABORTED') return;
    problems.push(`requestfailed: ${request.url()}`);
  });
  return problems;
}

/** Follows a navigation link, opening the menu first on narrow screens. */
export async function navigateTo(page: Page, label: string): Promise<void> {
  const menuButton = page.getByRole('button', { name: 'Abrir menu' });
  if (await menuButton.isVisible()) {
    await menuButton.click();
    await page.getByRole('dialog', { name: 'Menu' }).getByRole('link', { name: label }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  } else {
    await page
      .getByRole('navigation', { name: 'Principal' })
      .getByRole('link', { name: label })
      .click();
  }
}

/** The page must never scroll sideways (RNF-10). */
export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

/** Value of a figure on a stat board, found through its label. */
export const figure = (page: Page, board: string, label: string) =>
  page
    .getByRole('group', { name: board })
    .locator('div', { has: page.getByText(label, { exact: true }) })
    .locator('dd');

/**
 * Calls the local API as the open page would, to prepare data quickly. The
 * page may not have opened its session yet (or the server may have issued a
 * new one), so a 401 is answered the way the interface does: ask for a
 * session and try once more.
 */
export async function api<T>(page: Page, method: string, path: string, body?: unknown): Promise<T> {
  return page.evaluate(
    async ({ method, path, body }) => {
      const send = () =>
        fetch(path, {
          method,
          credentials: 'same-origin',
          headers: body === undefined ? undefined : { 'content-type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      let response = await send();
      if (response.status === 401) {
        await fetch('/api/session', { method: 'POST', credentials: 'same-origin' });
        response = await send();
      }
      if (!response.ok) throw new Error(`${method} ${path}: ${response.status}`);
      return response.status === 204 ? null : ((await response.json()) as unknown);
    },
    { method, path, body },
  ) as Promise<T>;
}
