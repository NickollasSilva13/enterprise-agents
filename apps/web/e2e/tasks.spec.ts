import { expect, test } from '@playwright/test';
import { expectNoHorizontalScroll, navigateTo, watchForProblems } from './helpers';
import { FAKE_PROVIDER_URL, TOOLS_URL } from './servers';

// The task board of Phase 16 against a real server and the fake provider: an
// area made from the development template, a task that its agents pass along
// by themselves (the fake model takes it to the last stage the brief offers)
// until it waits for the user, who finishes it. Uses the tools server, whose
// data no other spec counts; names carry the Playwright project name because
// desktop and mobile share the database.

test('a task crosses the flow of an area on its own and waits for the user', async ({
  page,
}, testInfo) => {
  const tag = testInfo.project.name;
  const providerName = `Quadro ${tag}`;
  const areaName = `Site ${tag}`;
  const problems = watchForProblems(page);

  // A provider with an enabled model that accepts tools.
  await page.goto(`${TOOLS_URL}/modelos`);
  await page
    .getByRole('button', { name: /^Adicionar (o primeiro )?provedor$/ })
    .first()
    .click();
  const add = page.getByRole('dialog', { name: 'Adicionar provedor' });
  await add.getByRole('textbox', { name: 'Nome' }).fill(providerName);
  await add.getByRole('textbox', { name: 'Endereço' }).fill(FAKE_PROVIDER_URL);
  await add.getByRole('button', { name: 'Adicionar provedor' }).click();
  const toggle = page
    .getByRole('region', { name: providerName })
    .getByRole('switch', { name: 'llama3.2:3b habilitado' });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');

  // An area from the development template.
  await navigateTo(page, 'Tarefas');
  await page
    .getByRole('button', { name: /área a partir de/ })
    .first()
    .click();
  const dialog = page.getByRole('dialog', { name: 'Nova área a partir de um modelo' });
  await expect(
    dialog.getByText('Refinamento → Desenvolvimento → Testes → Sua revisão → Concluído'),
  ).toBeVisible();
  await dialog.getByRole('textbox', { name: 'Nome da área' }).fill(areaName);
  await dialog
    .getByRole('combobox', { name: 'Modelo de IA dos agentes' })
    .selectOption({ label: `llama3.2:3b (${providerName})` });
  await dialog.getByRole('button', { name: 'Criar área' }).click();
  await expect(page.getByRole('combobox', { name: 'Área' })).toHaveValue(/.+/);
  await expect(page.getByRole('region', { name: 'Refinamento' })).toBeVisible();

  // A task: the agents take it through refinement, development and testing.
  await page.getByRole('button', { name: 'Nova tarefa' }).click();
  const newTask = page.getByRole('dialog', { name: 'Nova tarefa' });
  await newTask.getByRole('textbox', { name: 'Título' }).fill('Página de contato');
  await newTask.getByRole('textbox', { name: 'Critérios de aceite' }).fill('- Envia o formulário.');
  await newTask.getByRole('button', { name: 'Criar tarefa' }).click();

  const review = page.getByRole('region', { name: 'Sua revisão' });
  await expect(review.getByRole('link', { name: /Página de contato/ })).toBeVisible();
  await expect(review.getByText('Esperando você')).toBeVisible();
  await expectNoHorizontalScroll(page);

  // The user reads what happened and finishes it.
  await review.getByRole('link', { name: /Página de contato/ }).click();
  const history = page.getByRole('list', { name: 'Histórico da tarefa' });
  await expect(history.getByText(/passou de "Testes" para "Sua revisão"/)).toBeVisible();
  await expect(history.getByText('Etapa feita pelo provedor simulado.').first()).toBeVisible();
  const move = page.getByRole('region', { name: 'Mover' });
  await move.getByRole('combobox', { name: 'Para a etapa' }).selectOption({ label: 'Concluído' });
  await move.getByRole('button', { name: 'Mover' }).click();
  await expect(page.getByRole('region', { name: 'Situação' }).getByText('Concluída')).toBeVisible();
  await expectNoHorizontalScroll(page);

  expect(problems).toEqual([]);
});
