import { expect, type Locator, type Page, test } from '@playwright/test';
import { expectNoHorizontalScroll, watchForProblems } from './helpers';
import { FAKE_PROVIDER_URL, FIRST_USE_URL } from './servers';

// The first use of Phase 32 (D8): from an empty installation, following only
// the "Primeiros passos" card, to the first task worked on by the agents and
// waiting for the user. Every user action is counted and the time is taken,
// with the fake provider; how long a person takes with a real model is not
// measured here. The first step is taken with the keyboard alone (D7).
// One project only: the steps change the installation for good.

const MAX_ACTIONS = 20;
const MAX_MS = 5 * 60_000;

test('a new installation reaches its first task by following the first steps', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Uma vez só: os passos mudam a instalação.');
  test.setTimeout(MAX_MS);
  const problems = watchForProblems(page);
  let actions = 0;
  const act = async (step: Promise<void>) => {
    actions += 1;
    await step;
  };
  const card = page.getByRole('region', { name: 'Primeiros passos' });
  const backHome = async (count: string) => {
    await act(page.getByRole('link', { name: 'Escritório', exact: true }).first().click());
    await expect(card.getByText(`${count} de 4`)).toBeVisible();
  };
  const started = Date.now();

  // An empty installation opens on the office, with the checklist above the team.
  await page.goto(`${FIRST_USE_URL}/`);
  await expect(card.getByText('0 de 4')).toBeVisible();
  await expectNoHorizontalScroll(page);

  // 1. Connect a provider, with the keyboard alone: Tab until the step's link, Enter.
  const connect = card.getByRole('link', { name: 'Conectar' });
  await expect(async () => {
    await page.keyboard.press('Tab');
    await expect(connect).toBeFocused({ timeout: 100 });
  }).toPass({ intervals: [50], timeout: 30_000 });
  await act(page.keyboard.press('Enter'));
  const add = page.getByRole('dialog', { name: 'Adicionar provedor' });
  await act(add.getByRole('textbox', { name: 'Nome' }).fill('Ollama de teste'));
  await act(add.getByRole('textbox', { name: 'Endereço' }).fill(FAKE_PROVIDER_URL));
  await act(add.getByRole('button', { name: 'Adicionar provedor' }).press('Enter'));
  await expect(add).toHaveCount(0);

  // 2. Turn a model on.
  await backHome('1');
  await act(card.getByRole('link', { name: 'Escolher' }).click());
  const toggle = page.getByRole('switch', { name: 'llama3.2:3b habilitado' });
  await act(toggle.click());
  await expect(toggle).toHaveAttribute('aria-checked', 'true');

  // 3. An area from a ready-made flow.
  await backHome('2');
  await act(card.getByRole('link', { name: 'Criar a área' }).click());
  const area = page.getByRole('dialog', { name: 'Nova área a partir de um modelo' });
  await act(area.getByRole('textbox', { name: 'Nome da área' }).fill('Site'));
  await act(
    area
      .getByRole('combobox', { name: 'Modelo de IA dos agentes' })
      .selectOption({ label: 'llama3.2:3b (Ollama de teste)' })
      .then(() => undefined),
  );
  await act(area.getByRole('button', { name: 'Criar área' }).click());
  await expect(area).toHaveCount(0);

  // 4. The first task; the agents take it along the flow to the user.
  await backHome('3');
  await act(card.getByRole('link', { name: 'Criar a tarefa' }).click());
  const task = page.getByRole('dialog', { name: 'Nova tarefa' });
  await act(task.getByRole('textbox', { name: 'Título' }).fill('Página de contato'));
  await act(
    task.getByRole('textbox', { name: 'Critérios de aceite' }).fill('- Envia o formulário.'),
  );
  await act(task.getByRole('button', { name: 'Criar tarefa' }).click());
  const review = page.getByRole('region', { name: 'Sua revisão' });
  await expect(review.getByText('Esperando você')).toBeVisible({ timeout: 60_000 });
  const elapsed = Date.now() - started;

  // Done: the checklist leaves the office, and the help says so.
  await act(page.getByRole('link', { name: 'Escritório', exact: true }).first().click());
  await expect(page.getByRole('heading', { name: 'Escritório', level: 1 })).toBeVisible();
  await expect(card).toHaveCount(0);
  await expectHelpDone(page, act);

  console.log(
    `[primeiro uso] ${actions} ações, ${(elapsed / 1000).toFixed(1)} s até a primeira tarefa esperando você`,
  );
  expect(actions).toBeLessThanOrEqual(MAX_ACTIONS);
  expect(elapsed).toBeLessThan(MAX_MS);
  expect(problems).toEqual([]);
});

async function expectHelpDone(page: Page, act: (step: Promise<void>) => Promise<void>) {
  await act(page.getByRole('link', { name: 'Precisa de ajuda?' }).first().click());
  const steps: Locator = page.getByRole('region', { name: 'Primeiros passos' });
  await expect(steps.getByText('4 de 4')).toBeVisible();
  await expect(steps.getByText(/Tudo pronto/)).toBeVisible();
}
