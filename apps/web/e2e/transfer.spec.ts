import { expect, type Page, test } from '@playwright/test';
import { api, expectNoHorizontalScroll, watchForProblems } from './helpers';
import { CRUD_URL } from './servers';

// Export and import of agents (RF-20) in a real browser: the download has to
// work under the page's content security policy, and the file that comes out
// has to go back in. Names carry the Playwright project name because desktop
// and mobile share the database.

test.describe.configure({ mode: 'serial' });

/** Puts a file in the import field, as choosing it in the file dialog would. */
async function chooseFile(page: Page, name: string, content: string): Promise<void> {
  await page.getByLabel('Arquivo de agentes para importar').evaluate(
    (input, file) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([file.content], file.name, { type: 'application/json' }));
      (input as HTMLInputElement).files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    },
    { name, content },
  );
}

interface Created {
  readonly id: string;
}
interface ExportedFile {
  format: string;
  version: number;
  agents: { name: string; project: string | null; tools: unknown[]; systemPrompt: string }[];
}

test('agents are exported to a file and imported back from it', async ({ page }, testInfo) => {
  const tag = testInfo.project.name;
  const projectName = `Transferência ${tag}`;
  const agentName = `Exportável ${tag}`;
  const problems = watchForProblems(page);

  await page.goto(`${CRUD_URL}/agentes`);
  await expect(page.getByRole('heading', { name: 'Agentes', level: 1 })).toBeVisible();
  const project = await api<Created>(page, 'POST', '/api/projects', { name: projectName });
  const agent = await api<Created>(page, 'POST', '/api/agents', {
    name: agentName,
    projectId: project.id,
    systemPrompt: 'Responda em uma linha.',
    maxSteps: 7,
  });
  await api(page, 'PUT', `/api/agents/${agent.id}/tools`, {
    grants: [{ toolName: 'write_file', permission: 'allow' }],
  });
  await page.reload();
  const rows = page.getByRole('list', { name: 'Agentes' }).getByRole('listitem');
  await expect(rows.filter({ hasText: agentName })).toHaveCount(1);

  // Export: a real download, with nothing in it that belongs to this
  // installation. What goes into the file is caught on its way to the download.
  await page.evaluate(() => {
    const original = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob: Blob | MediaSource) => {
      Object.assign(window, { __exported: blob });
      return original(blob);
    };
  });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Exportar' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^agentes-\d{4}-\d{2}-\d{2}\.json$/);
  expect(await download.failure()).toBeNull();
  await expect(page.getByText(/agentes? exportados?\./)).toBeVisible();
  const text = await page.evaluate(() =>
    (window as unknown as { __exported: Blob }).__exported.text(),
  );
  const file = JSON.parse(text) as ExportedFile;
  expect(file.format).toBe('enterprise-agents/agents');
  const mine = file.agents.find((entry) => entry.name === agentName);
  expect(mine).toMatchObject({
    project: projectName,
    systemPrompt: 'Responda em uma linha.',
    maxSteps: 7,
    tools: [{ toolName: 'write_file', permission: 'allow' }],
  });
  expect(text).not.toContain(agent.id);
  expect(text).not.toContain(project.id);

  // Import only this agent back: it is added beside the original, and the
  // tool it had no longer acts on its own.
  await chooseFile(page, 'agentes.json', JSON.stringify({ ...file, agents: [mine] }));
  const dialog = page.getByRole('dialog', { name: 'Agentes importados' });
  await expect(dialog).toContainText('1 agente foi criado. 1 precisa da sua atenção:');
  await expect(dialog).toContainText(`${agentName} (importado)`);
  await expect(dialog).toContainText(`Já existia um agente chamado "${agentName}"`);
  await expect(dialog).toContainText('"Escrever arquivo" estava permitida no arquivo');
  await expectNoHorizontalScroll(page);
  await dialog.getByRole('button', { name: 'Fechar' }).click();
  await expect(dialog).toHaveCount(0);

  const copy = rows.filter({ hasText: `${agentName} (importado)` });
  await expect(copy).toContainText(projectName);
  await page.getByRole('link', { name: `Ferramentas de ${agentName} (importado)` }).click();
  await expect(
    page
      .getByRole('group', { name: 'Escrever arquivo' })
      .getByRole('radio', { name: 'Pede aprovação' }),
  ).toBeChecked();

  // A file that is something else is refused, in words.
  await page.goto(`${CRUD_URL}/agentes`);
  await expect(rows.filter({ hasText: agentName })).toHaveCount(2);
  await chooseFile(page, 'outra.json', JSON.stringify({ receita: 'bolo' }));
  await expect(page.getByText(/O arquivo não pôde ser importado\./)).toBeVisible();

  // Leave the shared server clean for the other tests.
  const { agents } = await api<{ agents: { id: string; name: string }[] }>(
    page,
    'GET',
    '/api/agents',
  );
  for (const entry of agents.filter((entry) => entry.name.startsWith(agentName))) {
    await api(page, 'DELETE', `/api/agents/${entry.id}`);
  }
  await api(page, 'DELETE', `/api/projects/${project.id}`);
  // The only error is the refused file, provoked on purpose.
  expect(problems).toEqual([
    'console: Failed to load resource: the server responded with a status of 400 (Bad Request)',
  ]);
});
