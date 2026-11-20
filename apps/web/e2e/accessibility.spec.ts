import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { EMPTY_URL, SEEDED_URL } from './servers';

// The WCAG 2.1 AA audit of Phase 32 (D7): every screen, in both projects
// (desktop and phone), on a fresh installation and on one with data, checked
// by axe. A critical or serious violation fails; the rest is printed, so the
// lighter findings stay in view without blocking.

const SCREENS = [
  '/escritorio',
  '/relatorios',
  '/agentes',
  '/agentes/novo',
  '/tarefas',
  '/tarefas/agendamentos',
  '/tarefas/pedidos',
  '/tarefas/modelos',
  '/aprovacoes',
  '/modelos',
  '/ferramentas',
  '/logs',
  '/configuracoes',
  '/ajuda',
];

async function audit(page: Page, url: string) {
  await page.goto(url);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  // Let the data arrive: an audit of the loading state would say little.
  await expect(page.getByRole('status', { name: /Carregando/ })).toHaveCount(0);
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  return violations.map((violation) => ({
    rule: violation.id,
    impact: violation.impact ?? 'unknown',
    help: violation.help,
    where: violation.nodes.slice(0, 3).map((node) => node.target.join(' ')),
  }));
}

for (const [name, base] of [
  ['fresh installation', EMPTY_URL],
  ['installation with data', SEEDED_URL],
] as const) {
  test(`every screen of a ${name} passes WCAG 2.1 AA (axe)`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const blocking: string[] = [];
    for (const screen of SCREENS) {
      const found = await audit(page, `${base}${screen}`);
      for (const item of found) {
        const line = `${screen} [${item.impact}] ${item.rule}: ${item.help} → ${item.where.join(', ')}`;
        if (item.impact === 'critical' || item.impact === 'serious') blocking.push(line);
        else testInfo.annotations.push({ type: 'axe', description: line });
      }
    }
    expect(blocking).toEqual([]);
  });
}
