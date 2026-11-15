import { expect, test } from '@playwright/test';
import { expectNoHorizontalScroll, figure, navigateTo, watchForProblems } from './helpers';
import { SEEDED_URL } from './servers';

// Sample data created by apps/server/scripts/prepare-e2e-data.ts:
// Atendimento: Triagem and Respostas, each with a run that was still active
//   when the "previous server" stopped. On start the server marks those runs
//   as interrupted (RN-12), so both agents are idle.
// Pesquisa: Leitor (last run failed), Resumidor (no model, idle for an hour:
//   at the pantry)
// Arquivo: empty. No project: Rascunho (inactive: outside the office).

test.describe('installation with agents', () => {
  test('the agent list shows every agent and can be filtered', async ({ page }) => {
    await page.goto(`${SEEDED_URL}/agentes`);
    const rows = page.getByRole('list', { name: 'Agentes' }).getByRole('listitem');
    await expect(rows).toHaveCount(5);
    await expect(rows.filter({ hasText: 'Resumidor' })).toContainText('Pesquisa, sem modelo');
    await expect(rows.filter({ hasText: 'Triagem' })).toContainText('Ocioso');

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
    // Nothing is running: the two runs the seed left active were interrupted on start.
    await expect(figure(page, 'Execuções', 'Execuções em andamento')).toHaveText('0');
    await expect(figure(page, 'Execuções', 'Aguardando aprovação')).toHaveText('0');
    await expect(figure(page, 'Execuções', 'Concluídas em 24 h')).toHaveText('1');
    await expect(figure(page, 'Execuções', 'Taxa de sucesso em 24 h')).toHaveText('25%');
    await expect(figure(page, 'Execuções', 'Tokens em 24 h')).toHaveText('1.500');

    const strip = page.getByLabel('Resumo').getByRole('listitem');
    await expect(strip).toHaveText(['5agentes', '0trabalhando', '0precisam de você']);

    const rows = page.getByRole('table', { name: 'Execuções recentes' }).locator('tbody tr');
    await expect(rows).toHaveCount(4);
    await expect(rows.filter({ hasText: 'Leitor' })).toContainText('Falhou');
    await expect(rows.filter({ hasText: 'Resumidor' })).toContainText('2 min 00 s');
    await expect(rows.filter({ hasText: 'Triagem' })).toContainText('Interrompida');

    await expect(page.getByText('1 agente falhou na última execução.')).toBeVisible();
    // The approval the interrupted run was waiting for was withdrawn with it.
    await expect(page.getByText(/espera a sua aprovação/)).toHaveCount(0);
    await expect(
      page.getByRole('list', { name: 'Atividade dos agentes' }).getByRole('listitem'),
    ).toHaveText([/foi interrompido pelo encerramento/, /foi interrompido pelo encerramento/]);
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
    await expect(rooms).toHaveCount(6);
    await expect(rooms.getByRole('heading')).toHaveText([
      'Recepção',
      'Copa',
      'Arquivo',
      'Atendimento',
      'Pesquisa',
      'Sem projeto',
    ]);

    const support = page.getByRole('region', { name: 'Atendimento' });
    // Idle since the server started: at their desks, until they go for a coffee.
    await expect(support.getByRole('listitem')).toHaveText([/^RespostasOcioso/, /^TriagemOcioso/]);
    await expect(support.getByText('Responde clientes')).toBeVisible();

    const research = page.getByRole('region', { name: 'Pesquisa' });
    await expect(research.getByRole('listitem')).toHaveText([
      'A última execução falhouLeitorCom falha',
      'ResumidorOciosoNa copa',
    ]);

    await expect(page.getByRole('region', { name: 'Arquivo' })).toContainText('Sala vazia.');
    // Clicking an agent opens its conversation.
    await expect(research.getByRole('link').first()).toHaveAttribute(
      'href',
      /\/agentes\/.+\/conversa$/,
    );
    await expect(
      page.getByRole('region', { name: 'Sem projeto' }).getByRole('listitem'),
    ).toHaveText(['RascunhoInativo']);

    await expectNoHorizontalScroll(page);
    expect(problems).toEqual([]);
  });

  for (const motion of ['no-preference', 'reduce'] as const) {
    test(`the office puts each agent where its state says (motion: ${motion})`, async ({
      page,
    }) => {
      const problems = watchForProblems(page);
      await page.emulateMedia({ reducedMotion: motion });
      await page.goto(`${SEEDED_URL}/escritorio`);

      // Idle for an hour: having a coffee at the pantry, away from its chair (RF-80).
      const pantry = page.getByRole('region', { name: 'Copa' });
      await expect(pantry).toContainText(/Na copa: .*Resumidor/);
      const resting = page
        .getByRole('region', { name: 'Pesquisa' })
        .getByRole('listitem')
        .filter({ hasText: 'Resumidor' });
      await expect(resting).toHaveAttribute('data-place', 'pantry');
      await expect(resting).toHaveAttribute('data-seated', 'false');
      const id = await resting.getAttribute('data-desk');
      const character = page.locator(`[data-walker="${id}"]`);
      await expect(character).toHaveAttribute('data-moving', 'false');
      const [feet, floor] = await Promise.all([character.boundingBox(), pantry.boundingBox()]);
      expect(feet && floor).toBeTruthy();
      if (feet && floor) {
        const x = feet.x + feet.width / 2;
        expect(x).toBeGreaterThan(floor.x);
        expect(x).toBeLessThan(floor.x + floor.width);
        expect(feet.y).toBeGreaterThan(floor.y);
        expect(feet.y + feet.height).toBeLessThan(floor.y + floor.height + 8);
      }

      // Failed: still at the desk. Inactive: outside, and not drawn anywhere.
      const failed = page.getByRole('listitem').filter({ hasText: 'Leitor' });
      await expect(failed).toHaveAttribute('data-seated', 'true');
      await expect(page.getByRole('region', { name: 'Recepção' })).toContainText(
        'Fora do escritório: Rascunho.',
      );
      const away = page.getByRole('listitem').filter({ hasText: 'Rascunho' });
      await expect(away).toHaveAttribute('data-place', 'outside');
      await expect(
        page.locator(`[data-walker="${await away.getAttribute('data-desk')}"]`),
      ).toHaveCount(0);

      // The same after a reload: the place comes from the data, not from the page.
      await page.reload();
      await expect(resting).toHaveAttribute('data-place', 'pantry');
      await expect(character).toHaveAttribute('data-moving', 'false');

      await expectNoHorizontalScroll(page);
      expect(problems).toEqual([]);
    });
  }
});
