import { expect, type Page, test } from '@playwright/test';
import { expectNoHorizontalScroll, navigateTo, watchForProblems } from './helpers';
import { CRUD_URL, FAKE_PROVIDER_KEY, FAKE_PROVIDER_URL } from './servers';

// Runs against the server the tests may change, with a fake provider standing
// in for Ollama and for an OpenAI-compatible service. Names carry the
// Playwright project name because desktop and mobile share the database.

test.describe.configure({ mode: 'serial' });

const openAddDialog = async (page: Page) => {
  await page
    .getByRole('button', { name: /^Adicionar (o primeiro )?provedor$/ })
    .first()
    .click();
  return page.getByRole('dialog', { name: 'Adicionar provedor' });
};

test('a local provider can be connected, tested and given to an agent', async ({
  page,
}, testInfo) => {
  const tag = testInfo.project.name;
  const providerName = `Ollama ${tag}`;
  const agentName = `Leitor ${tag}`;
  const problems = watchForProblems(page);

  await page.goto(`${CRUD_URL}/modelos`);
  const dialog = await openAddDialog(page);
  await expect(dialog.getByRole('textbox', { name: 'Endereço' })).toHaveValue(
    'http://127.0.0.1:11434',
  );
  await dialog.getByRole('textbox', { name: 'Nome' }).fill(providerName);
  await dialog.getByRole('textbox', { name: 'Endereço' }).fill(FAKE_PROVIDER_URL);
  await expect(dialog.getByText(/fica fora deste computador/)).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Adicionar provedor' }).click();

  // The models are fetched automatically and arrive disabled.
  const card = page.getByRole('region', { name: providerName });
  await expect(card.getByText('neste computador')).toBeVisible();
  const models = card.getByRole('list', { name: `Modelos de ${providerName}` });
  await expect(models.getByRole('listitem')).toHaveCount(2);
  await expect(card.getByText('0 de 2 habilitados')).toBeVisible();
  await expect(models.getByRole('listitem').first()).toContainText('Aceita ferramentas');
  await expectNoHorizontalScroll(page);

  await card.getByRole('button', { name: 'Testar conexão' }).click();
  await expect(card.getByText(/Conexão bem-sucedida: Ollama 0\.0\.0-fake\./)).toBeVisible();

  const toggle = card.getByRole('switch', { name: 'llama3.2:3b habilitado' });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await expect(card.getByText('1 de 2 habilitados')).toBeVisible();

  // The enabled model, and only it, can now be chosen for an agent.
  await navigateTo(page, 'Agentes');
  await page.getByRole('link', { name: 'Novo agente' }).click();
  const modelSelect = page.getByRole('combobox', { name: 'Modelo de IA' });
  await expect(
    modelSelect.getByRole('option', { name: `llama3.2:3b (${providerName})` }),
  ).toBeAttached();
  await expect(modelSelect.getByRole('option', { name: /phi:latest/ })).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Nome' }).fill(agentName);
  await modelSelect.selectOption({ label: `llama3.2:3b (${providerName})` });
  await expect(page.getByText(/serviço externo/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Criar agente' }).click();
  await expect(
    page
      .getByRole('list', { name: 'Agentes' })
      .getByRole('listitem')
      .filter({ hasText: agentName }),
  ).toContainText('Sem projeto, llama3.2:3b');

  // While the agent uses it, neither the model nor the provider can go away.
  await navigateTo(page, 'Modelos');
  await expect(card.getByText('1 agente', { exact: true })).toBeVisible();
  await toggle.click();
  await expect(page.getByText(/Este modelo é usado por 1 agente/)).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');

  await card.getByRole('button', { name: `Excluir ${providerName}` }).click();
  const confirm = page.getByRole('dialog');
  await confirm.getByRole('button', { name: 'Excluir provedor' }).click();
  await expect(confirm.getByRole('alert')).toContainText('Este provedor é usado por 1 agente');
  await confirm.getByRole('button', { name: 'Cancelar' }).click();

  // After the agent is gone, the provider can be removed.
  await navigateTo(page, 'Agentes');
  await page.getByRole('button', { name: `Excluir ${agentName}` }).click();
  await confirm.getByRole('button', { name: 'Excluir agente' }).click();
  await expect(page.getByText(`${agentName} excluído.`)).toBeVisible();

  await navigateTo(page, 'Modelos');
  await card.getByRole('button', { name: `Excluir ${providerName}` }).click();
  await confirm.getByRole('button', { name: 'Excluir provedor' }).click();
  await expect(page.getByText(`${providerName} excluído.`)).toBeVisible();
  await expect(card).toHaveCount(0);

  // Two refusals were provoked on purpose: disabling the model and deleting the provider.
  const conflict =
    'console: Failed to load resource: the server responded with a status of 409 (Conflict)';
  expect(problems).toEqual([conflict, conflict]);
});

test('an API key is stored but never shown or returned', async ({ page }, testInfo) => {
  const providerName = `Serviço ${testInfo.project.name}`;
  const responses: string[] = [];
  page.on('response', (response) => {
    if (response.url().includes('/api/')) {
      void response
        .text()
        .then((body) => responses.push(body))
        .catch(() => {});
    }
  });

  await page.goto(`${CRUD_URL}/modelos`);
  const dialog = await openAddDialog(page);
  await dialog.getByRole('combobox', { name: 'Tipo' }).selectOption({ label: 'Anthropic' });
  await expect(dialog.getByText(/fica fora deste computador/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Adicionar provedor' }).click();
  await expect(dialog.getByText('Anthropic exige uma chave de API.')).toBeVisible();

  await dialog
    .getByRole('combobox', { name: 'Tipo' })
    .selectOption({ label: 'Compatível com OpenAI' });
  await dialog.getByRole('textbox', { name: 'Nome' }).fill(providerName);
  await dialog.getByRole('textbox', { name: 'Endereço' }).fill(`${FAKE_PROVIDER_URL}/v1`);
  const keyField = dialog.getByLabel('Chave de API');
  await expect(keyField).toHaveAttribute('type', 'password');
  await keyField.fill(FAKE_PROVIDER_KEY);
  await dialog.getByRole('button', { name: 'Adicionar provedor' }).click();

  const card = page.getByRole('region', { name: providerName });
  await expect(
    card.getByText(`Guardada no cofre do sistema (…${FAKE_PROVIDER_KEY.slice(-4)})`),
  ).toBeVisible();
  // The key reached the provider: the model list came back.
  await expect(card.getByRole('list').getByRole('listitem')).toHaveText([/fake-chat-model/]);
  await card.getByRole('button', { name: 'Testar conexão' }).click();
  await expect(card.getByText(/Conexão bem-sucedida/)).toBeVisible();

  // Editing shows an empty key field, and the key is nowhere on the page.
  await card.getByRole('button', { name: `Editar ${providerName}` }).click();
  const edit = page.getByRole('dialog', { name: 'Editar provedor' });
  await expect(edit.getByLabel('Chave de API')).toHaveValue('');
  await edit.getByRole('button', { name: 'Cancelar' }).click();
  await page.reload();
  await expect(card).toBeVisible();
  expect(await page.content()).not.toContain(FAKE_PROVIDER_KEY);
  expect(responses.join('\n')).not.toContain(FAKE_PROVIDER_KEY);

  // A wrong key is reported without echoing it.
  await card.getByRole('button', { name: `Editar ${providerName}` }).click();
  await edit.getByLabel('Chave de API').fill('wrong-key-000000000000');
  await edit.getByRole('button', { name: 'Salvar provedor' }).click();
  await card.getByRole('button', { name: 'Testar conexão' }).click();
  await expect(
    card.getByText('O provedor recusou a credencial. Verifique a chave de API.'),
  ).toBeVisible();
  expect(await page.content()).not.toContain('wrong-key-000000000000');

  await card.getByRole('button', { name: `Excluir ${providerName}` }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Excluir provedor' }).click();
  await expect(card).toHaveCount(0);
});
