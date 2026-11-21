import { expect, test } from '@playwright/test';
import { expectNoHorizontalScroll, watchForProblems } from './helpers';
import { EMPTY_URL } from './servers';

// The reference of the visual system (Phase 20). It exists only in the build
// of these tests (vite build --mode e2e), never in `npm start`. Each section is
// compared with a screenshot kept in reference.spec.ts-snapshots/; after an
// intended visual change, refresh them with --update-snapshots and look at the
// new images before committing them.

const SECTIONS = [
  'Cores',
  'Tipo',
  'Superfícies',
  'Pílulas de estado',
  'Avisos e links',
  'Indicadores',
  'Cartões de agente',
  'Atividade',
  'Ações rápidas',
  'Avatares',
  'Personagens',
  'Opções de aparência',
  'Botões',
  'Abas de seção',
];

test('the reference shows every piece without overflowing', async ({ page }) => {
  const problems = watchForProblems(page);
  await page.goto(`${EMPTY_URL}/referencia`);
  await expect(page.getByRole('heading', { name: 'Sistema visual', level: 1 })).toBeVisible();
  for (const name of SECTIONS) {
    await expect(page.getByRole('region', { name })).toBeVisible();
  }
  await expectNoHorizontalScroll(page);
  expect(problems).toEqual([]);
});

test('an agent card shows a focus ring when reached by keyboard', async ({ page }) => {
  await page.goto(`${EMPTY_URL}/referencia`);
  const link = page.getByRole('link', { name: 'Exemplo Ana' });
  await link.focus();
  await expect(link).toBeFocused();
  const ring = await page
    .locator('[data-agent-card="ref-ana"]')
    .evaluate((card) => getComputedStyle(card).boxShadow);
  expect(ring).not.toBe('none');
});

test('each section matches its reference screenshot', async ({ page }, testInfo) => {
  // One set of images: the phone layout is covered by the overflow check above.
  test.skip(testInfo.project.name !== 'desktop', 'Capturas só no desktop.');
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(`${EMPTY_URL}/referencia`);
  await expect(page.getByRole('heading', { name: 'Sistema visual', level: 1 })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  for (const name of SECTIONS) {
    const file = `${name
      .normalize('NFD')
      .replace(/[^\w ]/g, '')
      .replaceAll(' ', '-')
      .toLowerCase()}.png`;
    await expect(page.getByRole('region', { name })).toHaveScreenshot(file);
  }
});
