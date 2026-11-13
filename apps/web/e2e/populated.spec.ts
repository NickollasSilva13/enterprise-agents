import { expect, test } from '@playwright/test';
import { expectNoHorizontalScroll, figure, navigateTo, watchForProblems } from './helpers';
import { SEEDED_URL } from './servers';

// Sample data created by apps/server/scripts/prepare-e2e-data.ts:
// Atendimento: Triagem (working), Respostas (waiting on an approval)
// Pesquisa: Leitor (last run failed), Resumidor (idle, no model)
// Arquivo: empty. No project: Rascunho (inactive).

test.describe('installation with agents', () => {
  test('the agent list shows every agent and can be filtered', async ({ page }) => {
    await page.goto(`${SEEDED_URL}/agentes`);
    const rows = page.getByRole('list', { name: 'Agentes' }).getByRole('listitem');
    await expect(rows).toHaveCount(5);
    await expect(rows.filter({ hasText: 'Resumidor' })).toContainText('Pesquisa, sem modelo');
    await expect(rows.filter({ hasText: 'Triagem' })).toContainText('Trabalhando');

    await page.getByRole('searchbox', { name: 'Buscar' }).fill('pesquisa');
    await expect(rows).toHaveText([/Leitor/, /Resumidor/]);
    await page.getByRole('combobox', { name: 'Estado' }).selectOption({ label: 'Com falha' });
    await expect(rows).toHaveText([/Leitor/]);
    await expectNoHorizontalScroll(page);
  });

  test('the dashboard reflects what is in the database', async ({ page }) => {
    const problems = watchForProblems(page);
    await page.goto(SEEDED_URL);

    await expect(figure(page, 'Agentes', 'Agentes cadastrados')).toHaveText('5');
    await expect(figure(page, 'Agentes', 'Ativos')).toHaveText('4');
    await expect(figure(page, 'Agentes', 'Inativos')).toHaveText('1');
    await expect(figure(page, 'Agentes', 'Com falha')).toHaveText('1');
    await expect(figure(page, 'Execuções', 'Execuções em andamento')).toHaveText('2');
    await expect(figure(page, 'Execuções', 'Aguardando aprovação')).toHaveText('1');
    await expect(figure(page, 'Execuções', 'Concluídas em 24 h')).toHaveText('1');
    await expect(figure(page, 'Execuções', 'Taxa de sucesso em 24 h')).toHaveText('50%');
    await expect(figure(page, 'Execuções', 'Tokens em 24 h')).toHaveText('1.500');

    const strip = page.getByLabel('Resumo').getByRole('listitem');
    await expect(strip).toHaveText(['5agentes', '1trabalhando', '1precisam de você']);

    const rows = page.getByRole('table', { name: 'Execuções recentes' }).locator('tbody tr');
    await expect(rows).toHaveCount(4);
    await expect(rows.filter({ hasText: 'Leitor' })).toContainText('Falhou');
    await expect(rows.filter({ hasText: 'Resumidor' })).toContainText('2 min 00 s');
    await expect(rows.filter({ hasText: 'Triagem' })).toContainText('Em andamento');

    await expect(page.getByText('1 agente falhou na última execução.')).toBeVisible();
    await expect(page.getByText('1 ação espera a sua aprovação.')).toBeVisible();
    await expect(page.getByText(/1 agente ativo está sem modelo/)).toBeVisible();
    await expect(page.getByText(/Nenhum provedor de modelos conectado/)).toHaveCount(0);

    await expectNoHorizontalScroll(page);
    expect(problems).toEqual([]);
  });

  test('the office shows each project as a room with its agents', async ({ page }) => {
    const problems = watchForProblems(page);
    await page.goto(SEEDED_URL);
    await navigateTo(page, 'Escritório');

    const rooms = page.getByRole('region');
    await expect(rooms).toHaveCount(4);
    await expect(rooms.getByRole('heading')).toHaveText([
      'Arquivo',
      'Atendimento',
      'Pesquisa',
      'Sem projeto',
    ]);

    const support = page.getByRole('region', { name: 'Atendimento' });
    await expect(support.getByRole('listitem')).toHaveText([
      'RespostasAguardando você',
      'TriagemTrabalhando',
    ]);
    await expect(support.getByText('Responde clientes')).toBeVisible();

    const research = page.getByRole('region', { name: 'Pesquisa' });
    await expect(research.getByRole('listitem')).toHaveText(['LeitorCom falha', 'ResumidorOcioso']);

    await expect(page.getByRole('region', { name: 'Arquivo' })).toContainText('Sala vazia.');
    await expect(
      page.getByRole('region', { name: 'Sem projeto' }).getByRole('listitem'),
    ).toHaveText(['RascunhoInativo']);

    await expectNoHorizontalScroll(page);
    expect(problems).toEqual([]);
  });
});
