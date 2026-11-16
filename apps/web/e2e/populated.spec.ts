import { expect, test } from '@playwright/test';
import { api, expectNoHorizontalScroll, figure, navigateTo, watchForProblems } from './helpers';
import { SEEDED_URL } from './servers';

// Sample data created by apps/server/scripts/prepare-e2e-data.ts:
// Atendimento: Triagem and Respostas, each with a run that was still active
//   when the "previous server" stopped. On start the server marks those runs
//   as interrupted (RN-12), so both agents are idle.
// Pesquisa: Leitor (last run failed), Resumidor (no model, idle for an hour:
//   resting in the lounge)
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

    // The automatic layout: common areas and one room per project, each with its sign.
    const scene = page.locator('[data-office-scene]');
    for (const name of [
      'Recepção',
      'Copa',
      'Sala de reunião',
      'Descompressão',
      'Arquivo',
      'Atendimento',
      'Pesquisa',
      'Sem projeto',
    ]) {
      await expect(scene).toContainText(name);
    }

    // The same, in words: every agent, where it is and what it says.
    const people = page.getByRole('region', { name: 'Agentes no escritório (4)' });
    await expect(people.getByRole('listitem')).toHaveText([
      /^LeitorCom falhaNa mesa, em PesquisaA última execução falhou/,
      /^RascunhoInativoFora do escritório/,
      // Idle since the server started: at their desks, until they go for a coffee.
      /^RespostasOciosoNa mesa, em Atendimento/,
      /^ResumidorOciosoNa descompressão/,
      /^TriagemOciosoNa mesa, em Atendimento/,
    ]);
    // Clicking an agent opens its conversation.
    await expect(people.getByRole('listitem').first().getByRole('link')).toHaveAttribute(
      'href',
      /\/agentes\/.+\/conversa$/,
    );

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

      // Idle for an hour: resting in the lounge, away from its chair (RF-80).
      const people = page.getByRole('region', { name: /^Agentes no escritório/ });
      const resting = people.getByRole('listitem').filter({ hasText: 'Resumidor' });
      await expect(resting).toHaveAttribute('data-place', 'lounge');
      await expect(resting).toHaveAttribute('data-seated', 'false');
      const id = await resting.getAttribute('data-agent');
      const character = page.locator(`[data-walker="${id}"]`);
      await expect(character).toHaveAttribute('data-moving', 'false');
      const office = await api<{ layout: { areas: { id: string; kind: string }[] } }>(
        page,
        'GET',
        '/api/office',
      );
      const lounge = office.layout.areas.find((area) => area.kind === 'lounge');
      const [feet, floor] = await Promise.all([
        character.boundingBox(),
        page.locator(`[data-office-scene] [data-area-floor="${lounge?.id}"] polygon`).boundingBox(),
      ]);
      expect(feet && floor).toBeTruthy();
      if (feet && floor) {
        const x = feet.x + feet.width / 2;
        expect(x).toBeGreaterThan(floor.x);
        expect(x).toBeLessThan(floor.x + floor.width);
        expect(feet.y + feet.height).toBeGreaterThan(floor.y);
        expect(feet.y + feet.height).toBeLessThan(floor.y + floor.height + 4);
      }

      // Failed: still at the desk. Inactive: outside, and not drawn anywhere.
      const failed = people.getByRole('listitem').filter({ hasText: 'Leitor' });
      await expect(failed).toHaveAttribute('data-seated', 'true');
      const away = people.getByRole('listitem').filter({ hasText: 'Rascunho' });
      await expect(away).toHaveAttribute('data-place', 'outside');
      await expect(away).toContainText('Fora do escritório');
      await expect(
        page.locator(`[data-walker="${await away.getAttribute('data-agent')}"]`),
      ).toHaveCount(0);

      // The same after a reload: the place comes from the data, not from the page.
      await page.reload();
      await expect(resting).toHaveAttribute('data-place', 'lounge');
      await expect(character).toHaveAttribute('data-moving', 'false');

      await expectNoHorizontalScroll(page);
      expect(problems).toEqual([]);
    });
  }
});
