import { expect, test } from '@playwright/test';
import { api, expectNoHorizontalScroll, watchForProblems } from './helpers';
import { TOOLS_URL } from './servers';

// Requests between areas (Phase 17) against a real server: the user lets
// one area ask another, sends a request from a task, approves it, finishes
// it in the other area, and the task that asked gets the delivery. The flows
// start at a stage of the user, so no model is needed. Uses the tools server,
// like tasks.spec.ts; names carry the Playwright project name because desktop
// and mobile share the database.

interface Created {
  id: string;
}

test('one area asks another for work and gets the delivery', async ({ page }, testInfo) => {
  const tag = testInfo.project.name;
  const marketing = `Marketing ${tag}`;
  const dados = `Dados ${tag}`;
  const problems = watchForProblems(page);

  await page.goto(`${TOOLS_URL}/tarefas`);
  // The page opens the session; data made before that would meet a 401 first.
  await expect(page.getByRole('heading', { name: 'Tarefas', level: 1 })).toBeVisible();
  const area = async (name: string) => {
    const project = await api<Created>(page, 'POST', '/api/projects', { name });
    await api(page, 'PUT', `/api/areas/${project.id}/workflow`, {
      stages: [
        { key: 'f', name: 'Fila', kind: 'human', roleKey: null },
        { key: 'd', name: 'Fim', kind: 'done', roleKey: null },
      ],
      transitions: [{ from: 'f', to: 'd', actor: 'human' }],
    });
    return project.id;
  };
  const marketingId = await area(marketing);
  await area(dados);
  const task = await api<Created>(page, 'POST', `/api/areas/${marketingId}/tasks`, {
    title: `Campanha ${tag}`,
  });

  // The rule: Marketing may ask Dados, with the user's approval.
  await page.goto(`${TOOLS_URL}/tarefas`);
  await page.getByRole('link', { name: 'Pedidos entre áreas' }).click();
  const rules = page.getByRole('region', { name: 'Quem pode pedir a quem' });
  await rules.getByRole('combobox', { name: 'A área' }).selectOption({ label: marketing });
  await rules
    .getByRole('combobox', { name: 'pode pedir trabalho a' })
    .selectOption({ label: dados });
  await rules.getByRole('button', { name: 'Criar regra' }).click();
  await expect(rules.getByText(`${marketing} → ${dados}`)).toBeVisible();

  // The request, from the task.
  await page.goto(`${TOOLS_URL}/tarefas/${task.id}`);
  const requests = page.getByRole('region', { name: 'Pedidos a outras áreas' });
  await requests.getByRole('combobox', { name: 'Pedir à área' }).selectOption({ label: dados });
  await requests.getByRole('textbox', { name: 'O que pedir' }).fill(`Números ${tag}`);
  await requests.getByRole('textbox', { name: 'Detalhes' }).fill('Vendas por dia.');
  await requests.getByRole('button', { name: 'Enviar pedido' }).click();
  await expect(requests.getByText(/esperando aprovação/)).toBeVisible();
  await expect(page.getByText('Aguardando outra área')).toBeVisible();
  await expectNoHorizontalScroll(page);

  // Approved, then finished in the other area.
  await page.goto(`${TOOLS_URL}/tarefas/pedidos`);
  const waiting = page
    .getByRole('region', { name: 'Esperando sua aprovação' })
    .getByRole('listitem')
    .filter({ hasText: `Números ${tag}` });
  await waiting.getByRole('button', { name: 'Aprovar' }).click();
  const working = page.getByRole('region', { name: 'Em andamento' });
  await working.getByRole('link', { name: `Números ${tag}` }).click();
  await expect(
    page.getByRole('region', { name: 'Pedido de outra área' }).getByText(`Campanha ${tag}`),
  ).toBeVisible();
  const move = page.getByRole('region', { name: 'Mover' });
  await move
    .getByRole('textbox', { name: 'Nota para quem vem depois' })
    .fill('Total de 42 vendas.');
  await move.getByRole('button', { name: 'Mover' }).click();
  await expect(page.getByRole('region', { name: 'Situação' }).getByText('Concluída')).toBeVisible();

  // The task that asked has the delivery and no longer waits.
  await page.goto(`${TOOLS_URL}/tarefas/${task.id}`);
  const history = page.getByRole('list', { name: 'Histórico da tarefa' });
  await expect(history.getByText(/Total de 42 vendas\./)).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Pedidos a outras áreas' }).getByText(/entregue/),
  ).toBeVisible();
  await expect(page.getByText('Aguardando outra área')).toHaveCount(0);
  await expectNoHorizontalScroll(page);

  expect(problems).toEqual([]);
});
