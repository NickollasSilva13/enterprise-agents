import { expect, test } from '@playwright/test';
import { api, expectNoHorizontalScroll, watchForProblems } from './helpers';
import { TOOLS_URL } from './servers';

// The catalogue of workflow templates (Phase 18) against a real server: the
// user saves an area's flow as a template, finds it in the catalogue and in
// the new-area dialog, exports it to a file, imports that file back and
// deletes the copy. Uses the tools server, like tasks.spec.ts; names carry
// the Playwright project name because desktop and mobile share the database.

interface Created {
  id: string;
}

test('an area becomes a template that goes to a file and back', async ({ page }, testInfo) => {
  const tag = testInfo.project.name;
  const areaName = `Atendimento ${tag}`;
  const templateName = `Fluxo ${tag}`;
  const problems = watchForProblems(page);

  await page.goto(`${TOOLS_URL}/tarefas`);
  // The page opens the session; data made before that would meet a 401 first.
  await expect(page.getByRole('heading', { name: 'Tarefas', level: 1 })).toBeVisible();
  const area = await api<Created>(page, 'POST', '/api/projects', { name: areaName });
  await api(page, 'PUT', `/api/areas/${area.id}/workflow`, {
    stages: [
      { key: 'f', name: 'Triagem', kind: 'human', agentId: null },
      { key: 'd', name: 'Resolvido', kind: 'done', agentId: null },
    ],
    transitions: [{ from: 'f', to: 'd', actor: 'human' }],
  });

  // Saved from the flow screen.
  await page.goto(`${TOOLS_URL}/tarefas/fluxo/${area.id}`);
  await page.getByRole('button', { name: 'Salvar como modelo' }).click();
  const save = page.getByRole('dialog', { name: 'Salvar como modelo' });
  await save.getByRole('textbox', { name: 'Nome do modelo' }).fill(templateName);
  await save.getByRole('textbox', { name: /Boas práticas/ }).fill('Responder no mesmo dia.');
  await save.getByRole('button', { name: 'Salvar modelo' }).click();
  await expect(page.getByText(`Modelo "${templateName}" salvo.`)).toBeVisible();

  // In the catalogue, with what it creates.
  await page.goto(`${TOOLS_URL}/tarefas`);
  await page.getByRole('link', { name: 'Modelos de fluxo' }).click();
  const mine = page.getByRole('region', { name: 'Seus modelos' });
  const item = mine.getByRole('listitem').filter({ hasText: templateName }).first();
  await expect(item.getByText('Triagem → Resolvido')).toBeVisible();
  await expect(item.getByText('Responder no mesmo dia.')).toBeVisible();
  await expectNoHorizontalScroll(page);

  // To a file and back: the copy gets a free name.
  const downloading = page.waitForEvent('download');
  await item.getByRole('button', { name: `Exportar ${templateName}` }).click();
  const file = await downloading;
  expect(file.suggestedFilename()).toBe(`modelo-fluxo-${tag.toLowerCase()}.json`);
  await page.getByLabel('Arquivo de modelo para importar').setInputFiles(await file.path());
  const imported = page.getByRole('dialog', { name: 'Modelo importado' });
  await expect(imported.getByText(`${templateName} (importado)`, { exact: true })).toBeVisible();
  await expect(imported.getByText(/Já existia um modelo chamado/)).toBeVisible();
  await imported.getByRole('button', { name: 'Fechar' }).click();

  // The copy is deleted; the original stays.
  await mine.getByRole('button', { name: `Excluir ${templateName} (importado)` }).click();
  await page
    .getByRole('dialog', { name: `Excluir o modelo ${templateName} (importado)?` })
    .getByRole('button', { name: 'Excluir' })
    .click();
  await expect(page.getByText('Modelo excluído.')).toBeVisible();
  await expect(mine.getByRole('heading', { name: `${templateName} (importado)` })).toHaveCount(0);

  // Offered when creating an area, among the user's own.
  await page.goto(`${TOOLS_URL}/tarefas`);
  await page
    .getByRole('button', { name: /área a partir de/ })
    .first()
    .click();
  const dialog = page.getByRole('dialog', { name: 'Nova área a partir de um modelo' });
  await dialog
    .getByRole('combobox', { name: 'Modelo de fluxo' })
    .selectOption({ label: templateName });
  await expect(dialog.getByText('Triagem → Resolvido')).toBeVisible();

  expect(problems).toEqual([]);
});
