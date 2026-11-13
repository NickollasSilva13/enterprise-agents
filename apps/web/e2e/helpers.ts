import { expect, type Page } from '@playwright/test';

/** Collects console errors and failed requests; CSP violations show up here. */
export function watchForProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`);
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
