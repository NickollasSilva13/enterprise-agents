import { expect, type Page, test } from '@playwright/test';
import { watchForProblems } from './helpers';
import { EMPTY_URL } from './servers';

// The building of Phase 23 by day and by night, by the clock of the machine
// (here a fake one), and still when motion is reduced. The empty server has
// no agents, so the pictures change only with the drawing. Since Phase 24 the
// office is drawn in 3D (WebGL in Chromium); the page at 1536 × 864 is the
// picture compared with the proposal at the end of each visual phase.

const scene = (page: Page) => page.locator('[data-office-scene]');

for (const [name, hour, light] of [
  ['noite', '22:00', '0.00'],
  ['dia', '12:00', '1.00'],
] as const) {
  test(`the office by ${name === 'dia' ? 'day' : 'night'}`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Capturas só no desktop.');
    const problems = watchForProblems(page);
    await page.clock.install({ time: new Date(`2026-11-19T${hour}:00`) });
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto(`${EMPTY_URL}/escritorio`);
    await expect(page.getByRole('heading', { name: 'Escritório', level: 1 })).toBeVisible();
    await expect(page.locator('[data-surroundings]')).toHaveAttribute('data-light', light);
    await expect(scene(page).locator('canvas')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect(scene(page)).toHaveScreenshot(`escritorio-${name}.png`, {
      maxDiffPixelRatio: 0.01,
    });
    expect(problems).toEqual([]);
  });
}

test('the office page at 1536 × 864, as the proposal is framed', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Capturas só no desktop.');
  const problems = watchForProblems(page);
  await page.clock.install({ time: new Date('2026-11-19T22:00:00') });
  await page.setViewportSize({ width: 1536, height: 864 });
  await page.goto(`${EMPTY_URL}/escritorio`);
  await expect(scene(page).locator('canvas')).toBeVisible();
  // No zoom buttons and no minimap (Phase 24, D6).
  await expect(page.getByRole('button', { name: 'Aproximar' })).toHaveCount(0);
  await expect(page.getByRole('toolbar', { name: 'Ações do escritório' })).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot('escritorio-1536x864.png', { maxDiffPixelRatio: 0.01 });
  expect(problems).toEqual([]);
});

test('nothing in the scenery moves when motion is reduced', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${EMPTY_URL}/escritorio`);
  await expect(page.locator('[data-surroundings]')).toBeAttached();
  const moving = await scene(page).evaluate(
    (root) =>
      [...root.querySelectorAll('*')].filter(
        (node) => getComputedStyle(node).animationName !== 'none',
      ).length,
  );
  expect(moving).toBe(0);
});
