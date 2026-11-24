import { expect, type Page, test } from '@playwright/test';
import { expectNoHorizontalScroll, navigateTo, watchForProblems } from './helpers';
import { CRUD_URL, FAKE_PROVIDER_URL } from './servers';

// The whole path of Phase 7 against a real server and the fake provider:
// connect a provider, give its model to an agent, talk to the agent with the
// answer streaming in, interrupt a run, and find everything in the logs,
// the dashboard and the office. Names carry the Playwright project name
// because desktop and mobile share the database.

test.describe.configure({ mode: 'serial' });

// The run is watched from the 3D office too: drawn in software (SwiftShader),
// two of these pages at once starve the server and the chat of the processor,
// so the graphics card is switched on, as in office.spec.ts and tools.spec.ts.
test.use({
  launchOptions: { args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'] },
});

const messages = (page: Page) => page.getByRole('list', { name: 'Mensagens' });
const composer = (page: Page) => page.getByRole('textbox', { name: 'Mensagem' });

test('an agent answers in a chat, can be interrupted, and leaves a trail', async ({
  page,
  context,
}, testInfo) => {
  const tag = testInfo.project.name;
  const providerName = `Chat ${tag}`;
  const projectName = `Suporte ${tag}`;
  const agentName = `Atendente ${tag}`;
  const problems = watchForProblems(page);

  // A provider with one enabled model.
  await page.goto(`${CRUD_URL}/modelos`);
  await page
    .getByRole('button', { name: /^Adicionar (o primeiro )?provedor$/ })
    .first()
    .click();
  const add = page.getByRole('dialog', { name: 'Adicionar provedor' });
  await add.getByRole('textbox', { name: 'Nome' }).fill(providerName);
  await add.getByRole('textbox', { name: 'Endereço' }).fill(FAKE_PROVIDER_URL);
  await add.getByRole('button', { name: 'Adicionar provedor' }).click();
  const card = page.getByRole('region', { name: providerName });
  const modelToggle = card.getByRole('switch', { name: 'llama3.2:3b habilitado' });
  await modelToggle.click();
  await expect(modelToggle).toHaveAttribute('aria-checked', 'true');

  // An agent that uses it, in a project of its own.
  await navigateTo(page, 'Agentes');
  await page.getByRole('textbox', { name: 'Novo projeto' }).fill(projectName);
  await page.getByRole('button', { name: 'Criar projeto' }).click();
  await expect(page.getByText(`Projeto "${projectName}" criado.`)).toBeVisible();
  await page.getByRole('link', { name: 'Novo agente' }).click();
  await page.getByRole('textbox', { name: 'Nome' }).fill(agentName);
  // The project is the agent's team (Phase 39), picked in "Função na empresa".
  await page.getByRole('radio', { name: projectName }).check();
  await page
    .getByRole('combobox', { name: 'Modelo de IA' })
    .selectOption({ label: `llama3.2:3b (${providerName})` });
  await page.getByRole('button', { name: 'Criar agente' }).click();
  await expect(page.getByText(`${agentName} criado.`)).toBeVisible();

  // First message: a new conversation, answered in full (RF-30, RF-32).
  await page.getByRole('link', { name: `Conversar com ${agentName}` }).click();
  await expect(page.getByRole('heading', { name: agentName, level: 1 })).toBeVisible();
  await expect(page.getByText(`Nova conversa com ${agentName}`)).toBeVisible();
  await expectNoHorizontalScroll(page);
  await composer(page).fill('Bom dia');
  await page.getByRole('button', { name: 'Enviar' }).click();
  await expect(page).toHaveURL(/\/conversa\/[0-9A-Z]+$/);
  await expect(messages(page).getByText('Eco: Bom dia (fim)')).toBeVisible();
  await expect(messages(page).getByText(/18 tokens/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enviar' })).toBeVisible();

  // Model output is shown as text and formatting, never as live markup (C-07).
  await composer(page).fill('perigo');
  await composer(page).press('Enter');
  await expect(messages(page).getByText('seguro', { exact: true })).toBeVisible();
  await expect(messages(page).getByText('[imagem: rastreador]')).toBeVisible();
  await expect(messages(page).locator('img, script')).toHaveCount(0);
  expect(await page.evaluate(() => (window as { __hacked?: boolean }).__hacked)).toBeUndefined();

  // A long answer arrives piece by piece (RF-31) …
  await composer(page).fill('responda devagar');
  await composer(page).press('Enter');
  await expect(messages(page).getByText('Escrevendo…')).toBeVisible();
  await expect(messages(page).getByText(/palavra3 /)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enviar' })).toHaveCount(0);

  // … the office shows the agent at work, saying what it is answering …
  const officePage = await context.newPage();
  await officePage.goto(`${CRUD_URL}/escritorio`);
  const desk = officePage
    .getByRole('region', { name: /^Agentes no escritório/ })
    .getByRole('listitem')
    .filter({ hasText: agentName });
  await expect(desk).toContainText(`Na mesa, em ${projectName}`);
  await expect(desk).toContainText('Respondendo: “responda devagar”');
  await expect(desk).toContainText('Trabalhando');
  await expect(officePage.getByLabel('Resumo').getByRole('listitem').nth(1)).not.toHaveText(
    '0trabalhando',
  );
  await expectNoHorizontalScroll(officePage);

  // … and a reload in the middle picks the answer up where it is (resume).
  await page.reload();
  await expect(messages(page).getByText('Escrevendo…')).toBeVisible();
  await expect(messages(page).getByText(/palavra1 palavra2 palavra3 /)).toBeVisible();

  // Interrupting stops it at once and keeps what was written (RF-35, UC-04).
  await page.getByRole('button', { name: 'Interromper' }).click();
  await expect(messages(page).getByText('Você interrompeu a execução.')).toBeVisible();
  await expect(messages(page).getByText('Escrevendo…')).toHaveCount(0);
  await expect(messages(page).getByText(/palavra1 palavra2 /)).toBeVisible();

  // The office follows without a reload: live events, not polling.
  await expect(desk).toContainText('Ocioso', { timeout: 4000 });
  await officePage.close();

  // The conversation goes on after the interruption (RF-36).
  await composer(page).fill('E agora?');
  await composer(page).press('Enter');
  await expect(messages(page).getByText('Eco: E agora? (fim)')).toBeVisible();

  // The interrupted run, step by step (RF-33, RF-70).
  await messages(page).getByRole('link', { name: 'Ver passos' }).nth(2).click();
  await expect(page.getByRole('heading', { name: `Execução de ${agentName}` })).toBeVisible();
  await expect(page.getByText('Interrompida por você').first()).toBeVisible();
  await expect(
    page.getByRole('list', { name: 'Passos da execução' }).getByRole('listitem'),
  ).toHaveText([/Execução iniciada/, /Chamada ao modelo/, /Execução encerrada/]);
  await expectNoHorizontalScroll(page);

  // The logs list the four runs and filter by state (RF-71); the agent's
  // history is the same list, already filtered (RF-19).
  await navigateTo(page, 'Agentes');
  await page.getByRole('link', { name: `Histórico de ${agentName}` }).click();
  const runRows = page.getByRole('table', { name: 'Execuções' }).locator('tbody tr');
  await expect(runRows).toHaveCount(4);
  await page
    .getByRole('combobox', { name: 'Estado' })
    .selectOption({ label: 'Interrompida por você' });
  await expect(runRows).toHaveCount(1);
  await expectNoHorizontalScroll(page);

  // The reports tell the same story (RF-03, RF-04).
  await navigateTo(page, 'Relatórios');
  const feed = page.getByRole('list', { name: 'Atividade dos agentes' }).getByRole('listitem');
  await expect(feed.filter({ hasText: `${agentName} foi interrompido por você` })).toHaveCount(1);
  await expect(feed.filter({ hasText: `${agentName} concluiu a execução` })).toHaveCount(3);

  // The history survives a reload and can be reopened (RF-32).
  await navigateTo(page, 'Agentes');
  await page.getByRole('link', { name: `Conversar com ${agentName}` }).click();
  // Below 1280 px the list and the chat take turns (Phase 38): the list is
  // reached by "Ver as conversas" in the chat's bar; wide, it is beside the chat.
  const showList = page.getByRole('button', { name: 'Ver as conversas' });
  const first = page.getByRole('link', { name: /Bom dia/ }).first();
  await expect(async () => {
    // Bounded: on a wide screen the button is hidden, and the link may simply
    // not be drawn yet; an unbounded click would wait for ever.
    if (!(await first.isVisible())) await showList.click({ timeout: 1000 });
    await expect(first).toBeVisible({ timeout: 1000 });
  }).toPass();
  await first.click();
  await expect(messages(page).getByText('Eco: Bom dia (fim)')).toBeVisible();
  await expect(messages(page).getByText('Eco: E agora? (fim)')).toBeVisible();

  // An inactive agent cannot be messaged (RN-01).
  await navigateTo(page, 'Agentes');
  const active = page.getByRole('switch', { name: `${agentName} ativo`, exact: true });
  await active.click();
  await expect(active).toHaveAttribute('aria-checked', 'false');
  await page.getByRole('link', { name: `Conversar com ${agentName}` }).click();
  await expect(page.getByText(/Este agente está inativo/)).toBeVisible();
  await expect(composer(page)).toBeDisabled();

  // Leave the shared server clean for the other project.
  const dialog = page.getByRole('dialog');
  await navigateTo(page, 'Agentes');
  await page.getByRole('button', { name: `Excluir ${agentName}`, exact: true }).click();
  await dialog.getByRole('button', { name: 'Excluir agente' }).click();
  await expect(page.getByText(`${agentName} excluído.`)).toBeVisible();
  await page.getByRole('button', { name: `Excluir o projeto ${projectName}` }).click();
  await dialog.getByRole('button', { name: 'Excluir projeto' }).click();
  await expect(page.getByText(new RegExp(`Projeto "${projectName}" excluído`))).toBeVisible();
  await navigateTo(page, 'Modelos');
  await card.getByRole('button', { name: `Excluir ${providerName}` }).click();
  await dialog.getByRole('button', { name: 'Excluir provedor' }).click();
  await expect(card).toHaveCount(0);

  // The run of a deleted agent stays in the logs (RN-07).
  await navigateTo(page, 'Logs');
  await expect(
    page
      .getByRole('table', { name: 'Execuções' })
      .locator('tbody tr')
      .filter({ hasText: agentName }),
  ).toHaveCount(4);
  await expect(page.getByText(`${agentName} (excluído)`).first()).toBeVisible();

  expect(problems).toEqual([]);
});
