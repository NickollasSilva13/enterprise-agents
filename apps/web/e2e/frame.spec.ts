import { expect, test } from '@playwright/test';
import { api, expectNoHorizontalScroll, watchForProblems } from './helpers';
import { EMPTY_URL, TOOLS_URL } from './servers';

// The frame of every screen (Phase 21): global search by keyboard, the bell,
// widths from a phone to a wide screen, and reference screenshots of the menu
// and the top bar. Data is made on the tools server with the project name in
// it, because desktop and mobile share the database.

interface Created {
  id: string;
}

test('finds an agent and a task with three letters, by keyboard only', async ({
  page,
}, testInfo) => {
  const tag = testInfo.project.name === 'desktop' ? 'Dk' : 'Mb';
  const problems = watchForProblems(page);
  await page.goto(`${TOOLS_URL}/tarefas`);
  await expect(page.getByRole('heading', { name: 'Tarefas', level: 1 })).toBeVisible();

  // Names that start with letters nothing else here starts with.
  const agentName = `Zuleica ${tag}`;
  const taskTitle = `Xerografar ${tag}`;
  await api<Created>(page, 'POST', '/api/agents', { name: agentName });
  const area = await api<Created>(page, 'POST', '/api/projects', { name: `Cópias ${tag}` });
  await api(page, 'PUT', `/api/areas/${area.id}/workflow`, {
    stages: [
      { key: 'r', name: 'Revisão', kind: 'human', agentId: null },
      { key: 'd', name: 'Feito', kind: 'done', agentId: null },
    ],
    transitions: [{ from: 'r', to: 'd', actor: 'human' }],
  });
  const task = await api<Created>(page, 'POST', `/api/areas/${area.id}/tasks`, {
    title: taskTitle,
  });

  // Agent: Ctrl K, three letters, Enter.
  await page.keyboard.press('Control+k');
  const box = page.getByRole('combobox', { name: 'Buscar agentes, áreas, tarefas e telas' });
  await expect(box).toBeFocused();
  await page.keyboard.type('zul');
  await expect(page.getByRole('option', { name: new RegExp(agentName) })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Buscar' })).toHaveCount(0);
  await expect(page).toHaveURL(/\/agentes\/[^/]+$/);

  // Task: the same, with the accent typed or not.
  await page.keyboard.press('Control+k');
  await page.keyboard.type('xer');
  await expect(page.getByRole('option', { name: new RegExp(taskTitle) })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/tarefas/${task.id}$`));

  // The task waits at a stage of the user: the bell has it, reached by Tab.
  const bell = page.getByRole('button', { name: /^Avisos: / });
  await bell.focus();
  await page.keyboard.press('Enter');
  const panel = page.getByRole('region', { name: 'Esperando você' });
  await expect(panel.getByRole('link', { name: new RegExp(taskTitle) })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(bell).toBeFocused();

  expect(problems).toEqual([]);
});

test('never scrolls sideways, from a phone to a wide screen', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Larguras percorridas no desktop.');
  for (const width of [375, 768, 1024, 1366, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${EMPTY_URL}/relatorios`);
    await expect(page.getByRole('heading', { name: 'Relatórios', level: 1 })).toBeVisible();
    await expectNoHorizontalScroll(page);
  }
});

test('menu and top bar match their reference screenshots', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Capturas só no desktop.');
  await page.setViewportSize({ width: 1366, height: 900 });
  // The empty server: nothing waits and the totals are zero, so the images are stable.
  await page.goto(`${EMPTY_URL}/configuracoes`);
  await expect(page.getByRole('heading', { name: 'Configurações', level: 1 })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByRole('complementary')).toHaveScreenshot('menu.png');
  await expect(page.getByRole('banner')).toHaveScreenshot('topo.png');
});
