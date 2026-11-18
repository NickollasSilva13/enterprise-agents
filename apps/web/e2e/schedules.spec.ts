import { expect, test } from '@playwright/test';
import { api, expectNoHorizontalScroll, watchForProblems } from './helpers';
import { TOOLS_URL } from './servers';

// Scheduled tasks (Phase 19) against a real server: the user schedules a task
// for an area, asks for one now, finds it on the board with its origin, then
// pauses and deletes the schedule. The flow starts at a stage of the user, so
// no model is needed. Uses the tools server, like tasks.spec.ts; names carry
// the Playwright project name because desktop and mobile share the database.

interface Created {
  id: string;
}

test('a schedule creates a task on the board of its area', async ({ page }, testInfo) => {
  const tag = testInfo.project.name;
  const areaName = `Financeiro ${tag}`;
  const title = `Fechamento ${tag}`;
  const problems = watchForProblems(page);

  await page.goto(`${TOOLS_URL}/tarefas`);
  // The page opens the session; data made before that would meet a 401 first.
  await expect(page.getByRole('heading', { name: 'Tarefas', level: 1 })).toBeVisible();
  const area = await api<Created>(page, 'POST', '/api/projects', { name: areaName });
  await api(page, 'PUT', `/api/areas/${area.id}/workflow`, {
    stages: [
      { key: 'f', name: 'Conferência', kind: 'human', agentId: null },
      { key: 'd', name: 'Fechado', kind: 'done', agentId: null },
    ],
    transitions: [{ from: 'f', to: 'd', actor: 'human' }],
  });

  // Scheduled from the screen: every day at 23:59.
  await page.goto(`${TOOLS_URL}/tarefas`);
  await page.getByRole('link', { name: 'Agendamentos' }).click();
  await expect(page.getByRole('heading', { name: 'Agendamentos', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Novo agendamento' }).click();
  const dialog = page.getByRole('dialog', { name: 'Novo agendamento' });
  await dialog.getByRole('combobox', { name: 'Área' }).selectOption({ label: areaName });
  await dialog.getByRole('textbox', { name: 'Título da tarefa' }).fill(title);
  await dialog.getByRole('combobox', { name: 'Repetição' }).selectOption({ label: 'Todo dia' });
  await dialog.getByLabel('Hora').fill('23:59');
  await dialog.getByRole('button', { name: 'Criar agendamento' }).click();

  const item = page
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: title }) });
  await expect(item.getByText(`Área ${areaName} · Todo dia às 23:59`)).toBeVisible();
  await expect(item.getByText(/^Próxima: /)).toBeVisible();
  await expectNoHorizontalScroll(page);

  // A task now: it lands on the board, and says where it came from.
  await item.getByRole('button', { name: 'Criar agora' }).click();
  await expect(page.getByText('Tarefa criada.')).toBeVisible();
  await item.getByRole('link', { name: title }).click();
  await expect(
    page.getByRole('region', { name: 'Agendamento' }).getByRole('link', { name: title }),
  ).toBeVisible();
  await expect(
    page
      .getByRole('list', { name: 'Histórico da tarefa' })
      .getByText(`Criada pelo agendamento "${title}", a seu pedido.`),
  ).toBeVisible();

  // Asked again while that task is open: nothing new.
  await page.goto(`${TOOLS_URL}/tarefas/agendamentos`);
  await item.getByRole('button', { name: 'Criar agora' }).click();
  await expect(
    page.getByText('A tarefa anterior ainda está aberta: nenhuma nova foi criada.'),
  ).toBeVisible();

  // Paused, then deleted; the task stays on the board.
  await item.getByRole('switch', { name: `Ativo: ${title}` }).click();
  await expect(item.getByText('Pausado.')).toBeVisible();
  await item.getByRole('button', { name: `Excluir ${title}` }).click();
  await page
    .getByRole('dialog', { name: `Excluir o agendamento ${title}?` })
    .getByRole('button', { name: 'Excluir' })
    .click();
  await expect(page.getByRole('heading', { name: title })).toHaveCount(0);
  await page.goto(`${TOOLS_URL}/tarefas?area=${area.id}`);
  await expect(
    page
      .getByRole('region', { name: 'Conferência' })
      .getByRole('link', { name: new RegExp(title) }),
  ).toBeVisible();

  expect(problems).toEqual([]);
});
