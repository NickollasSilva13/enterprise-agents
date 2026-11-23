import { expect, type Page, test } from '@playwright/test';
import { watchForProblems } from './helpers';
import { EMPTY_URL } from './servers';

// The building of Phase 23 by day and by night, by the clock of the machine
// (here a fake one), and still when motion is reduced. The empty server has
// no agents, so the pictures change only with the drawing. Since Phase 24 the
// office is drawn in 3D (WebGL in Chromium); the page at 1536 × 864 is the
// picture compared with the proposal at the end of each visual phase.

const scene = (page: Page) => page.locator('[data-office-scene]');

/** Draws the office of the server's answer in other surroundings, without saving anything. */
async function showIn(
  page: Page,
  surroundings: 'building' | 'house' | 'park' | 'condo' | 'island' | 'techGarden',
) {
  await page.unroute('**/api/office');
  await page.route('**/api/office', async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as { layout: Record<string, unknown> };
    await route.fulfill({ response, json: { ...body, layout: { ...body.layout, surroundings } } });
  });
}

for (const [name, hour, light] of [
  ['noite', '22:00', '0.00'],
  ['dia', '12:00', '1.00'],
] as const) {
  test(`the office by ${name === 'dia' ? 'day' : 'night'}`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Capturas só no desktop.');
    const problems = watchForProblems(page);
    // Still water, so two pictures in a row match (Phase 33).
    await page.emulateMedia({ reducedMotion: 'reduce' });
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
  await page.emulateMedia({ reducedMotion: 'reduce' });
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

test('the wheel zooms the office and scrolling back shows all of it', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'A roda do mouse só no desktop.');
  await page.goto(`${EMPTY_URL}/escritorio`);
  await expect(scene(page).locator('canvas')).toBeVisible();
  const floor = scene(page).locator('[data-area-floor]').first();
  const before = await floor.boundingBox();
  const stage = await scene(page).boundingBox();
  expect(before && stage).toBeTruthy();
  if (!before || !stage) return;
  await page.mouse.move(stage.x + stage.width / 2, stage.y + stage.height / 2);
  await page.mouse.wheel(0, -300);
  await expect
    .poll(async () => (await floor.boundingBox())?.width ?? 0)
    .toBeGreaterThan(before.width * 1.2);
  // Scrolling back out never goes past the whole office.
  for (let step = 0; step < 6; step += 1) await page.mouse.wheel(0, 300);
  await expect
    .poll(async () => Math.round((await floor.boundingBox())?.width ?? 0))
    .toBe(Math.round(before.width));
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

// The environment around the office never changes the office (Phase 33, D2):
// the same answer of the server drawn in every environment gives the
// same picture of the middle of the floor. The first environment writes the
// picture when it is missing; the others are compared with it.
test('the office is the same in every environment', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Capturas só no desktop.');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install({ time: new Date('2026-11-19T12:00:00') });
  await page.setViewportSize({ width: 1536, height: 864 });
  for (const surroundings of [
    'building',
    'park',
    'house',
    'condo',
    'island',
    'techGarden',
  ] as const) {
    await showIn(page, surroundings);
    await page.goto(`${EMPTY_URL}/escritorio`);
    await expect(page.locator('[data-surroundings]')).toHaveAttribute(
      'data-surroundings',
      surroundings,
    );
    await expect(scene(page).locator('canvas')).toBeVisible();
    const floors = await scene(page)
      .locator('[data-area-floor]')
      .evaluateAll((nodes) =>
        nodes.map((node) => {
          const box = node.getBoundingClientRect();
          return [box.left, box.top, box.right, box.bottom];
        }),
      );
    const left = Math.min(...floors.map((box) => box[0] ?? 0));
    const top = Math.min(...floors.map((box) => box[1] ?? 0));
    const right = Math.max(...floors.map((box) => box[2] ?? 0));
    const bottom = Math.max(...floors.map((box) => box[3] ?? 0));
    // The middle of the floor, away from the glass of its edges, through which the outside shows.
    const inset = { x: (right - left) * 0.2, y: (bottom - top) * 0.25 };
    await expect(page).toHaveScreenshot('escritorio-recorte.png', {
      clip: {
        x: left + inset.x,
        y: top + inset.y,
        width: right - left - inset.x * 2,
        height: bottom - top - inset.y * 2,
      },
      maxDiffPixelRatio: 0.01,
    });
  }
});

// Each environment around the office by day and by night, from the same
// answer of the server: the city of Phase 25 (an environment since Phase 34,
// redrawn after Phase 38), the residential neighbourhood and the modern
// condominium (Phase 35), the tropical island and the technological garden
// (Phase 36). The park is in the pictures of the office above.
for (const [place, surroundings, label] of [
  ['cidade', 'building', 'city'],
  ['bairro', 'house', 'neighbourhood'],
  ['condominio', 'condo', 'condominium'],
  ['ilha', 'island', 'island'],
  ['jardim', 'techGarden', 'technological garden'],
] as const)
  for (const [name, hour] of [
    ['noite', '22:00'],
    ['dia', '12:00'],
  ] as const) {
    test(`the ${label} around the office by ${name === 'dia' ? 'day' : 'night'}`, async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'Capturas só no desktop.');
      const problems = watchForProblems(page);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.clock.install({ time: new Date(`2026-11-19T${hour}:00`) });
      await page.setViewportSize({ width: 1366, height: 900 });
      await showIn(page, surroundings);
      await page.goto(`${EMPTY_URL}/escritorio`);
      await expect(page.locator('[data-surroundings]')).toHaveAttribute(
        'data-surroundings',
        surroundings,
      );
      await expect(scene(page).locator('canvas')).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await expect(scene(page)).toHaveScreenshot(`${place}-${name}.png`, {
        maxDiffPixelRatio: 0.01,
      });
      expect(problems).toEqual([]);
    });
  }
