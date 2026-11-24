import { expect, type Page, test } from '@playwright/test';
import { expectNoHorizontalScroll, navigateTo, watchForProblems } from './helpers';
import { CRUD_URL } from './servers';

// Runs against a server of its own, because it changes data. The desktop and
// mobile projects share that server, so every name carries the project name.

test.describe.configure({ mode: 'serial' });

const agentRow = (page: Page, name: string) =>
  page.getByRole('list', { name: 'Agentes' }).getByRole('listitem').filter({ hasText: name });

test('an agent can be created, edited, duplicated, deactivated and deleted', async ({
  page,
}, testInfo) => {
  const tag = testInfo.project.name;
  const projectName = `Atendimento ${tag}`;
  const agentName = `Triagem ${tag}`;
  const renamed = `Triagem inicial ${tag}`;
  const problems = watchForProblems(page);

  // A project, so the agent has a room in the office.
  await page.goto(`${CRUD_URL}/agentes`);
  await page.getByRole('textbox', { name: 'Novo projeto' }).fill(projectName);
  await page.getByRole('button', { name: 'Criar projeto' }).click();
  await expect(page.getByText(`Projeto "${projectName}" criado.`)).toBeVisible();

  // Create.
  await page.getByRole('link', { name: 'Novo agente' }).click();
  await expect(page.getByRole('heading', { name: 'Novo agente', level: 1 })).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page.getByRole('button', { name: 'Criar agente' }).click();
  await expect(page.getByText('Informe o nome do agente.')).toBeVisible();

  await page.getByRole('textbox', { name: 'Nome' }).fill(agentName);
  await page.getByRole('textbox', { name: 'Objetivo' }).fill('Classificar os pedidos que chegam');
  await page.getByRole('textbox', { name: 'Prompt de sistema' }).fill('Responda em uma linha.');
  // The project is the agent's team (Phase 39), picked in "Função na empresa".
  await page.getByRole('radio', { name: projectName }).check();
  await page.getByRole('textbox', { name: 'Temperatura' }).fill('0,3');
  await page.getByRole('textbox', { name: 'Passos por execução' }).fill('8');
  await page.getByRole('button', { name: 'Criar agente' }).click();

  await expect(page).toHaveURL(`${CRUD_URL}/agentes`);
  await expect(page.getByText(`${agentName} criado.`)).toBeVisible();
  await expect(agentRow(page, agentName)).toContainText(`${projectName} · sem modelo de IA`);
  await expect(agentRow(page, agentName)).toContainText('Ocioso');
  await expectNoHorizontalScroll(page);

  // The same name cannot be used twice.
  await page.getByRole('link', { name: 'Novo agente' }).click();
  await page.getByRole('textbox', { name: 'Nome' }).fill(agentName.toUpperCase());
  await page.getByRole('button', { name: 'Criar agente' }).click();
  await expect(page.getByText('Já existe um agente com esse nome.')).toBeVisible();
  await page.getByRole('link', { name: 'Cancelar' }).click();

  // The office and the dashboard reflect the new agent.
  await navigateTo(page, 'Escritório');
  const desk = page
    .getByRole('region', { name: /^Agentes no escritório/ })
    .getByRole('listitem')
    .filter({ hasText: agentName });
  await expect(desk).toContainText(`${agentName}Ocioso`);
  await expect(desk).toContainText(`Na mesa, em ${projectName}`);
  await navigateTo(page, 'Relatórios');
  await expect(page.getByText(/sem modelo e não/)).toBeVisible();

  // Edit: the form opens with what was saved, and survives a reload.
  await navigateTo(page, 'Agentes');
  await page.getByRole('link', { name: `Editar ${agentName}` }).click();
  await expect(page.getByRole('textbox', { name: 'Temperatura' })).toHaveValue('0,3');
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Nome' })).toHaveValue(agentName);
  await expect(page.getByRole('textbox', { name: 'Passos por execução' })).toHaveValue('8');
  await expect(page.getByRole('textbox', { name: 'Prompt de sistema' })).toHaveValue(
    'Responda em uma linha.',
  );
  await page.getByRole('textbox', { name: 'Nome' }).fill(renamed);
  await page.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(page.getByText(`${renamed} salvo.`)).toBeVisible();
  await expect(agentRow(page, renamed)).toBeVisible();

  // Duplicate.
  await page.getByRole('button', { name: `Duplicar ${renamed}`, exact: true }).click();
  const copyName = `${renamed} (cópia)`;
  await expect(page.getByText(`Cópia criada: ${copyName}.`)).toBeVisible();
  await expect(agentRow(page, copyName)).toContainText(projectName);

  // Deactivate and reactivate.
  const toggle = page.getByRole('switch', { name: `${renamed} ativo`, exact: true });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await expect(agentRow(page, renamed).first()).toContainText('Inativo');
  await navigateTo(page, 'Escritório');
  await expect(
    page
      .getByRole('region', { name: /^Agentes no escritório/ })
      .getByRole('listitem')
      .filter({ hasText: 'Fora do escritório' })
      .filter({ hasText: renamed }),
  ).toHaveCount(1);
  await navigateTo(page, 'Agentes');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');

  // Delete the copy: cancel first, then confirm.
  await page.getByRole('button', { name: `Excluir ${copyName}` }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Cancelar' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(agentRow(page, copyName)).toBeVisible();

  await page.getByRole('button', { name: `Excluir ${copyName}` }).click();
  await dialog.getByRole('button', { name: 'Excluir agente' }).click();
  await expect(page.getByText(`${copyName} excluído.`)).toBeVisible();
  await expect(agentRow(page, copyName)).toHaveCount(0);

  // Everything is still there after a reload.
  await page.reload();
  await expect(agentRow(page, renamed)).toHaveCount(1);
  await expect(agentRow(page, copyName)).toHaveCount(0);

  // Deleting the project leaves the agent without one.
  await page.getByRole('button', { name: `Excluir o projeto ${projectName}` }).click();
  await expect(dialog).toContainText('1 agente continua existindo e fica sem projeto.');
  await dialog.getByRole('button', { name: 'Excluir projeto' }).click();
  await expect(agentRow(page, renamed)).toContainText('Sem projeto');

  // Leave the shared server clean for the other project.
  await page.getByRole('button', { name: `Excluir ${renamed}`, exact: true }).click();
  await dialog.getByRole('button', { name: 'Excluir agente' }).click();
  await expect(agentRow(page, renamed)).toHaveCount(0);

  // The only error is the name clash provoked on purpose above.
  expect(problems).toEqual([
    'console: Failed to load resource: the server responded with a status of 409 (Conflict)',
  ]);
});
