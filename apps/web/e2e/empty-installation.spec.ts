import { expect, test } from '@playwright/test';
import { expectNoHorizontalScroll, figure, navigateTo, watchForProblems } from './helpers';
import { EMPTY_URL } from './servers';

test.describe('fresh installation', () => {
  test('the dashboard shows real zeros and says what is missing', async ({ page }) => {
    const problems = watchForProblems(page);
    await page.goto(EMPTY_URL);

    await expect(page.getByRole('heading', { name: 'Painel', level: 1 })).toBeVisible();
    await expect(figure(page, 'Agentes', 'Agentes cadastrados')).toHaveText('0');
    await expect(figure(page, 'Agentes', 'Com falha')).toHaveText('0');
    await expect(figure(page, 'Execuções', 'Execuções em andamento')).toHaveText('0');
    await expect(figure(page, 'Execuções', 'Taxa de sucesso em 24 h')).toHaveText('—');

    await expect(page.getByText('Nenhuma execução ainda.')).toBeVisible();
    await expect(page.getByText(/Nenhum provedor de modelos conectado/)).toBeVisible();
    await expect(page.getByLabel('Resumo').getByRole('listitem').first()).toHaveText('0agentes');

    await expectNoHorizontalScroll(page);
    expect(problems).toEqual([]);
  });

  test('every area is reachable and unfinished ones say so', async ({ page }) => {
    const problems = watchForProblems(page);
    await page.goto(EMPTY_URL);

    await navigateTo(page, 'Escritório');
    await expect(page).toHaveURL(`${EMPTY_URL}/escritorio`);
    await expect(page.getByText('O escritório ainda está vazio.')).toBeVisible();

    await navigateTo(page, 'Agentes');
    await expect(page.getByText('Nenhum agente ainda.')).toBeVisible();
    await expect(page.getByText('Nenhum projeto ainda.')).toBeVisible();
    await expectNoHorizontalScroll(page);

    await navigateTo(page, 'Modelos');
    await expect(page.getByText('Nenhum provedor conectado.')).toBeVisible();
    await expectNoHorizontalScroll(page);

    const planned = [
      ['Ferramentas', 8],
      ['Aprovações', 8],
      ['Logs', 7],
    ] as const;
    for (const [label, phase] of planned) {
      await navigateTo(page, label);
      await expect(page.getByRole('heading', { name: label, level: 1 })).toBeVisible();
      await expect(
        page.getByRole('heading', { name: `Planejado para a Fase ${phase}` }),
      ).toBeVisible();
      await expectNoHorizontalScroll(page);
    }

    await navigateTo(page, 'Configurações');
    await expect(page.getByText(EMPTY_URL, { exact: true })).toBeVisible();
    await expect(page.getByText('Uso normal')).toBeVisible();
    await expectNoHorizontalScroll(page);

    await navigateTo(page, 'Painel');
    await expect(page).toHaveURL(`${EMPTY_URL}/`);
    expect(problems).toEqual([]);
  });

  test('an inner page survives a reload and unknown addresses are handled', async ({ page }) => {
    await page.goto(`${EMPTY_URL}/configuracoes`);
    await expect(page.getByRole('heading', { name: 'Configurações', level: 1 })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Configurações', level: 1 })).toBeVisible();

    await page.goto(`${EMPTY_URL}/nada-aqui`);
    await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible();
    await page.getByRole('link', { name: 'Voltar ao painel' }).click();
    await expect(page.getByRole('heading', { name: 'Painel', level: 1 })).toBeVisible();
  });

  test('the navigation can be used with the keyboard alone', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Keyboard navigation is checked on the desktop layout.');
    await page.goto(EMPTY_URL);
    await expect(page.getByRole('heading', { name: 'Painel', level: 1 })).toBeVisible();

    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Painel' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Escritório' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Escritório', level: 1 })).toBeVisible();
  });
});

test.describe('browser security (C-01 to C-05)', () => {
  test('pages carry a strict content security policy and the session is hidden from scripts', async ({
    page,
  }) => {
    const response = await page.goto(EMPTY_URL);
    const headers = response?.headers() ?? {};
    expect(headers['content-security-policy']).toContain("script-src 'self'");
    expect(headers['content-security-policy']).not.toContain('unsafe-inline');
    expect(headers['x-frame-options']).toBe('DENY');

    await expect(page.getByRole('group', { name: 'Agentes' })).toBeVisible();
    expect(await page.evaluate(() => document.cookie)).toBe('');
    const cookies = await page.context().cookies();
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toMatchObject({ name: 'ea_session', httpOnly: true, sameSite: 'Strict' });
  });

  test('inline scripts injected into the page do not run', async ({ page }) => {
    await page.goto(EMPTY_URL);
    await expect(page.getByRole('group', { name: 'Agentes' })).toBeVisible();
    const ran = await page.evaluate(async () => {
      const script = document.createElement('script');
      script.textContent = 'window.__injected = true';
      document.body.appendChild(script);
      await new Promise((resolve) => setTimeout(resolve, 50));
      return (window as { __injected?: boolean }).__injected === true;
    });
    expect(ran).toBe(false);
  });

  test('another origin cannot read the API or obtain a session', async ({ page, request }) => {
    await page.goto(EMPTY_URL);
    await expect(page.getByRole('group', { name: 'Agentes' })).toBeVisible();
    const cookie = (await page.context().cookies())
      .map((entry) => `${entry.name}=${entry.value}`)
      .join('; ');

    // Same valid session, but the request claims to come from elsewhere.
    const crossSite = await request.get(`${EMPTY_URL}/api/dashboard/summary`, {
      headers: { cookie, 'sec-fetch-site': 'cross-site' },
    });
    expect(crossSite.status()).toBe(403);

    const foreignSession = await request.post(`${EMPTY_URL}/api/session`, {
      headers: { origin: 'https://evil.example' },
    });
    expect(foreignSession.status()).toBe(403);

    const noSession = await request.get(`${EMPTY_URL}/api/dashboard/summary`);
    expect(noSession.status()).toBe(401);
  });
});
