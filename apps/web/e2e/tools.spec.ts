import { expect, type Page, test } from '@playwright/test';
import { api, expectNoHorizontalScroll, navigateTo, watchForProblems } from './helpers';
import { FAKE_PROVIDER_URL, TOOLS_URL } from './servers';

// The whole path of Phase 8 against a real server and the fake provider:
// grant tools to an agent, see a call wait for approval, deny it, approve the
// next one from the agent's desk in the office, delegate to another agent and
// find the tree in the logs. Names carry the Playwright project name because
// desktop and mobile share the database.

test.describe.configure({ mode: 'serial' });

const messages = (page: Page) => page.getByRole('list', { name: 'Mensagens' });
const composer = (page: Page) => page.getByRole('textbox', { name: 'Mensagem' });

async function createAgent(page: Page, name: string, model: string): Promise<void> {
  await navigateTo(page, 'Agentes');
  await page.getByRole('link', { name: 'Novo agente' }).click();
  await page.getByRole('textbox', { name: 'Nome' }).fill(name);
  await page.getByRole('combobox', { name: 'Modelo de IA' }).selectOption({ label: model });
  await page.getByRole('button', { name: 'Criar agente' }).click();
  await expect(page.getByText(`${name} criado.`)).toBeVisible();
}

test('an agent uses tools only as granted, waits for approval and delegates', async ({
  page,
  context,
}, testInfo) => {
  const tag = testInfo.project.name;
  const providerName = `Ferramentas ${tag}`;
  const writer = `Escritor ${tag}`;
  const reviewer = `Revisor ${tag}`;
  const problems = watchForProblems(page);

  // A provider with one enabled model that accepts tools, and two agents.
  await page.goto(`${TOOLS_URL}/modelos`);
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
  const model = `llama3.2:3b (${providerName})`;
  await createAgent(page, writer, model);
  await createAgent(page, reviewer, model);

  // Nothing is granted to begin with: the model's request for a tool it was
  // never offered is not even possible, and the agent just answers (RN-03).
  await page.getByRole('link', { name: `Conversar com ${writer}` }).click();
  await composer(page).fill('anote isto');
  await composer(page).press('Enter');
  await expect(messages(page).getByText('Eco: anote isto (fim)')).toBeVisible();

  // The catalogue, with the script tool switched off (RF-50, RF-52) …
  await navigateTo(page, 'Agentes');
  await page.getByRole('link', { name: `Ferramentas de ${writer}` }).click();
  await expect(page.getByRole('heading', { name: 'Ferramentas', level: 1 })).toBeVisible();
  const catalogue = page.getByRole('region', { name: 'Catálogo' });
  await expect(catalogue.getByRole('listitem')).toHaveCount(6);
  await expect(
    catalogue.getByRole('switch', { name: 'Executar script ligada nesta instalação' }),
  ).toHaveAttribute('aria-checked', 'false');

  // … and the agent's permissions: writing asks first, delegating is free (RF-16, RF-53).
  await expect(page.getByRole('combobox', { name: 'Agente' })).toHaveValue(/.+/);
  await page
    .getByRole('group', { name: 'Escrever arquivo' })
    .getByRole('radio', { name: 'Pede aprovação' })
    .check();
  await page
    .getByRole('group', { name: 'Delegar a agente' })
    .getByRole('radio', { name: 'Permitida' })
    .check();
  await expect(
    page.getByRole('group', { name: 'Executar script' }).getByRole('radio', { name: 'Permitida' }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Salvar permissões' }).click();
  await expect(page.getByText('Permissões salvas.')).toBeVisible();
  await expectNoHorizontalScroll(page);

  // Now the same request stops and waits for a decision (UC-05, C-16).
  await navigateTo(page, 'Agentes');
  await page.getByRole('link', { name: `Conversar com ${writer}` }).click();
  await composer(page).fill('anote a primeira');
  await composer(page).press('Enter');
  const request = messages(page).getByRole('article', {
    name: `Aprovação pedida por ${writer}: Escrever arquivo`,
  });
  await expect(request).toBeVisible();
  await expect(request.getByText('nota.txt')).toBeVisible();
  await expect(request.getByText('anote a primeira')).toBeVisible();
  await expect(messages(page).getByText('Aguardando a sua aprovação…')).toBeVisible();
  await expectNoHorizontalScroll(page);

  // Denied: the tool does not run and the agent is told why.
  await request.getByLabel(/Motivo, se for negar/).fill('Ainda não.');
  await request.getByRole('button', { name: 'Negar' }).click();
  await expect(
    messages(page).getByText(
      /Ferramenta respondeu: O usuário negou esta ação\. Motivo: Ainda não\./,
    ),
  ).toBeVisible();
  await expect(request).toHaveCount(0);
  // The composer only takes the next message once the run is over.
  await expect(page.getByRole('button', { name: 'Enviar' })).toBeVisible();

  // The next request is answered from the agent's own desk in the office (RF-09).
  await composer(page).fill('anote a segunda');
  await composer(page).press('Enter');
  await expect(request).toBeVisible();
  const officePage = await context.newPage();
  await officePage.goto(`${TOOLS_URL}/escritorio`);
  const desk = officePage.getByRole('listitem').filter({ hasText: writer });
  await expect(desk).toContainText('Posso usar “Escrever arquivo”?');
  await expect(desk).toContainText('Aguardando você');
  await desk.getByRole('button', { name: `Decidir o pedido de ${writer}` }).click();
  const decision = officePage.getByRole('dialog', { name: 'Decidir o pedido' });
  await expect(decision.getByText('anote a segunda')).toBeVisible();
  await expectNoHorizontalScroll(officePage);
  await decision.getByRole('button', { name: 'Aprovar' }).click();
  await expect(
    messages(page).getByText(/Ferramenta respondeu: Arquivo "nota\.txt" criado/),
  ).toBeVisible();
  await expect(desk).toContainText('Ocioso');
  await officePage.close();
  await expect(page.getByRole('button', { name: 'Enviar' })).toBeVisible();

  // Delegation: the other agent does the task and the answer comes back (UC-06).
  await composer(page).fill(`delegue a "${reviewer}"`);
  await composer(page).press('Enter');
  await expect(messages(page).getByText('Ferramenta respondeu: Eco: Bom dia (fim)')).toBeVisible();

  // The run shows the tree and each step in plain words (RF-61, RF-62).
  await messages(page).getByRole('link', { name: 'Ver passos' }).last().click();
  const steps = page.getByRole('list', { name: 'Passos da execução' });
  await expect(steps.getByText('Pediu a ferramenta "Delegar a agente"')).toBeVisible();
  await expect(steps.getByText(`Delegou uma tarefa a ${reviewer}`)).toBeVisible();
  await expect(steps.getByText(`${reviewer} devolveu a tarefa`)).toBeVisible();
  const tree = page.getByRole('list', { name: 'Árvore de execução' });
  await expect(tree.getByRole('listitem')).toHaveText([
    new RegExp(`${writer}.*iniciada por você.*Você está aqui`),
    new RegExp(`${reviewer}.*tarefa delegada`),
  ]);
  await expectNoHorizontalScroll(page);
  await tree.getByRole('link', { name: `Abrir a execução de ${reviewer}` }).click();
  await expect(page.getByRole('heading', { name: `Execução de ${reviewer}` })).toBeVisible();
  await expect(page.getByText('Delegação de outro agente')).toBeVisible();

  // A delegation that lasts is seen in the office as a meeting: whoever
  // delegated and whoever does the task meet in the meeting room (RF-80).
  await navigateTo(page, 'Agentes');
  await page.getByRole('link', { name: `Conversar com ${writer}` }).click();
  await composer(page).fill(`delegue devagar a "${reviewer}"`);
  await composer(page).press('Enter');
  await expect(page.getByRole('button', { name: 'Interromper' })).toBeVisible();
  const visitPage = await context.newPage();
  await visitPage.goto(`${TOOLS_URL}/escritorio`);
  const people = visitPage.getByRole('region', { name: /^Agentes no escritório/ });
  // A balloon may name the other agent too: match the name line itself.
  const visitor = people
    .getByRole('listitem')
    .filter({ has: visitPage.getByText(writer, { exact: true }) });
  const host = people
    .getByRole('listitem')
    .filter({ has: visitPage.getByText(reviewer, { exact: true }) });
  await expect(visitor).toHaveAttribute('data-place', 'meeting');
  await expect(visitor).toContainText('Na sala de reunião');
  await expect(visitor).toContainText(`Pedi ajuda a ${reviewer}`);
  await expect(host).toHaveAttribute('data-place', 'meeting');
  await expect(visitor).toHaveAttribute('data-seated', 'false');
  const visitorId = (await visitor.getAttribute('data-agent')) ?? '';
  // The page loaded in the middle of the meeting: the visitor is already there, standing still.
  const character = visitPage.locator(`[data-walker="${visitorId}"]`);
  await expect(character).toHaveAttribute('data-moving', 'false');
  const office = await api<{ layout: { areas: { id: string; kind: string }[] } }>(
    visitPage,
    'GET',
    '/api/office',
  );
  const meeting = office.layout.areas.find((area) => area.kind === 'meeting');
  const [feet, room] = await Promise.all([
    character.boundingBox(),
    visitPage
      .locator(`[data-office-scene] [data-area-floor="${meeting?.id}"] polygon`)
      .boundingBox(),
  ]);
  expect(feet && room).toBeTruthy();
  if (feet && room) {
    const x = feet.x + feet.width / 2;
    expect(x).toBeGreaterThan(room.x);
    expect(x).toBeLessThan(room.x + room.width);
    expect(feet.y + feet.height).toBeGreaterThan(room.y);
    expect(feet.y + feet.height).toBeLessThan(room.y + room.height + 4);
  }
  await expectNoHorizontalScroll(visitPage);

  // The task is called off: both walk back and sit down again.
  await page.getByRole('button', { name: 'Interromper' }).click();
  await expect(messages(page).getByText('Você interrompeu a execução.')).toBeVisible();
  await expect(visitor).toHaveAttribute('data-place', 'desk');
  await expect(visitor).toHaveAttribute('data-seated', 'true');
  await expect(character).toHaveCount(0);
  await expect(host).toContainText('Ocioso');
  await visitPage.close();

  // Both decisions are on record (RF-54).
  await navigateTo(page, 'Aprovações');
  await expect(page.getByText('Nada esperando por você.')).toBeVisible();
  const decided = page
    .getByRole('region', { name: 'Decisões recentes' })
    .getByRole('listitem')
    .filter({ hasText: writer });
  await expect(decided).toHaveText([/Aprovada/, /Negada/]);
  await expect(decided.nth(1)).toContainText('Motivo: Ainda não.');
  await expectNoHorizontalScroll(page);

  // Leave the shared server clean for the other project.
  const dialog = page.getByRole('dialog');
  await navigateTo(page, 'Agentes');
  for (const name of [writer, reviewer]) {
    await page.getByRole('button', { name: `Excluir ${name}`, exact: true }).click();
    await dialog.getByRole('button', { name: 'Excluir agente' }).click();
    await expect(page.getByText(`${name} excluído.`)).toBeVisible();
  }
  await navigateTo(page, 'Modelos');
  await card.getByRole('button', { name: `Excluir ${providerName}` }).click();
  await dialog.getByRole('button', { name: 'Excluir provedor' }).click();
  await expect(card).toHaveCount(0);

  expect(problems).toEqual([]);
});
