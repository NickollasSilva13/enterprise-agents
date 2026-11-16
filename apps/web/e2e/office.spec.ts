import { expect, type Locator, type Page, test } from '@playwright/test';
import { api, expectNoHorizontalScroll, navigateTo, watchForProblems } from './helpers';
import { CRUD_URL, EMPTY_URL } from './servers';

// The isometric office (Phase 14) against a real server: characters that
// leave by the street door, come back in and walk without the page slowing
// down; the layout editor; the look of an agent. Creating and switching
// agents is covered through the interface in agents.spec.ts; here the data
// is prepared through the API, from the page itself, so the tests spend their
// time on the scene. Names carry the Playwright project name because desktop
// and mobile share the database.

test.describe.configure({ mode: 'serial' });

/**
 * Makes the office read the server again, until `seen` holds. The page does
 * that when the window comes back to the front, unless what it has is fresh
 * (2 s); so the nudge is repeated instead of trusting a single one.
 */
async function refreshUntil(page: Page, seen: () => Promise<void>): Promise<void> {
  await expect(async () => {
    await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
    await seen();
  }).toPass({ intervals: [2100], timeout: 30_000 });
}

const entry = (page: Page, id: string) => page.locator(`[data-agent="${id}"]`);
const walker = (page: Page, id: string) => page.locator(`[data-walker="${id}"]`);

interface Created {
  readonly id: string;
}

interface OfficeData {
  readonly layout: { areas: { id: string; kind: string }[] };
}

/** The floor of the area of a kind, as drawn in the scene. */
async function floorOf(page: Page, kind: string): Promise<Locator> {
  const office = await api<OfficeData>(page, 'GET', '/api/office');
  const area = office.layout.areas.find((each) => each.kind === kind);
  return page.locator(`[data-office-scene] [data-area-floor="${area?.id ?? 'none'}"] polygon`);
}

/** Whether the feet of a character are over an element's box. */
async function standsIn(character: Locator, place: Locator): Promise<boolean> {
  const [feet, box] = await Promise.all([character.boundingBox(), place.boundingBox()]);
  if (!feet || !box) return false;
  const x = feet.x + feet.width / 2;
  const y = feet.y + feet.height;
  return x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height + 4;
}

for (const motion of ['no-preference', 'reduce'] as const) {
  const reduced = motion === 'reduce';

  test(`an agent leaves and comes back by the reception (${reduced ? 'reduced motion' : 'walking'})`, async ({
    page,
  }, testInfo) => {
    const tag = `${testInfo.project.name} ${reduced ? 'parado' : 'andando'}`;
    const problems = watchForProblems(page);
    await page.emulateMedia({ reducedMotion: motion });
    await page.goto(`${CRUD_URL}/escritorio`);
    await expect(page.getByRole('heading', { name: 'Escritório', level: 1 })).toBeVisible();

    const project = await api<Created>(page, 'POST', '/api/projects', { name: `Vivo ${tag}` });
    const agentName = `Andante ${tag}`;
    const agent = await api<Created>(page, 'POST', '/api/agents', {
      name: agentName,
      projectId: project.id,
    });

    // Loaded with the agent already there: it is simply at its desk, in its project's room.
    await page.reload();
    await expect(entry(page, agent.id)).toContainText(`${agentName}Ocioso`);
    await expect(entry(page, agent.id)).toContainText(`Na mesa, em Vivo ${tag}`);
    await expect(entry(page, agent.id)).toHaveAttribute('data-seated', 'true');
    await expect(page.locator(`[data-sitter="${agent.id}"]`)).toHaveCount(1);
    await expect(walker(page, agent.id)).toHaveCount(0);
    await expect(page.locator('[data-office-scene]')).toContainText(`Vivo ${tag}`);

    // Switched off: the agent leaves the office by the street door.
    await api(page, 'PATCH', `/api/agents/${agent.id}`, { enabled: false });
    await refreshUntil(page, () =>
      expect(entry(page, agent.id)).toHaveAttribute('data-place', 'outside', { timeout: 1000 }),
    );
    await expect(entry(page, agent.id)).toHaveAttribute('data-seated', 'false');
    if (reduced) {
      // No walk at all: the chair is empty and nobody is on the way.
      await expect(page.locator('[data-moving="true"]')).toHaveCount(0);
    } else {
      await expect(walker(page, agent.id)).toHaveAttribute('data-moving', 'true');
    }
    await expect(walker(page, agent.id)).toHaveCount(0);
    await expect(entry(page, agent.id)).toContainText('Fora do escritório');

    // After a reload it is still outside, with nobody walking (coherent position).
    await page.reload();
    await expect(entry(page, agent.id)).toHaveAttribute('data-place', 'outside');
    await expect(walker(page, agent.id)).toHaveCount(0);

    // Switched on again: it comes in through the reception and sits down.
    await api(page, 'PATCH', `/api/agents/${agent.id}`, { enabled: true });
    await refreshUntil(page, () =>
      expect(entry(page, agent.id)).toHaveAttribute('data-place', 'desk', { timeout: 1000 }),
    );
    if (reduced) {
      await expect(entry(page, agent.id)).toHaveAttribute('data-seated', 'true');
      await expect(page.locator('[data-moving="true"]')).toHaveCount(0);
    } else {
      await expect(walker(page, agent.id)).toHaveAttribute('data-moving', 'true');
      // The first steps are inside the reception, where the street door is.
      expect(await standsIn(walker(page, agent.id), await floorOf(page, 'reception'))).toBe(true);
      await expect(entry(page, agent.id)).toHaveAttribute('data-seated', 'false');
    }
    await expect(entry(page, agent.id)).toHaveAttribute('data-seated', 'true');
    await expect(walker(page, agent.id)).toHaveCount(0);
    await expectNoHorizontalScroll(page);

    // Leave the shared server clean for the other tests.
    await api(page, 'DELETE', `/api/agents/${agent.id}`);
    await api(page, 'DELETE', `/api/projects/${project.id}`);
    expect(problems).toEqual([]);
  });
}

test('thirty agents walk at the same time and the scene stays fluid', async ({
  page,
}, testInfo) => {
  const tag = testInfo.project.name;
  const problems = watchForProblems(page);
  await page.goto(`${CRUD_URL}/escritorio`);
  await expect(page.getByRole('heading', { name: 'Escritório', level: 1 })).toBeVisible();

  const project = await api<Created>(page, 'POST', '/api/projects', { name: `Trinta ${tag}` });
  const ids: string[] = [];
  for (let index = 0; index < 30; index += 1) {
    const agent = await api<Created>(page, 'POST', '/api/agents', {
      name: `Trinta ${tag} ${String(index + 1).padStart(2, '0')}`,
      projectId: project.id,
    });
    ids.push(agent.id);
  }
  const ours = (attribute: string) =>
    page.locator(ids.map((id) => `[data-agent="${id}"]${attribute}`).join(', '));
  await page.reload();
  await expect(ours('[data-seated="true"]')).toHaveCount(30);

  // Everyone is sent out at once, while the page counts the frames it draws.
  await page.evaluate(() => {
    const record = { frames: 0, walking: 0, worstGap: 0 };
    Object.assign(window, { __frames: record });
    let last = performance.now();
    const count = (time: number) => {
      if (document.querySelector('[data-moving="true"]')) {
        record.frames += 1;
        record.walking += time - last;
        record.worstGap = Math.max(record.worstGap, time - last);
      }
      last = time;
      requestAnimationFrame(count);
    };
    requestAnimationFrame(count);
  });
  for (const id of ids) await api(page, 'PATCH', `/api/agents/${id}`, { enabled: false });
  await refreshUntil(page, () =>
    expect(ours('[data-place="outside"]')).toHaveCount(30, { timeout: 1000 }),
  );
  await expect(page.locator('[data-moving="true"]').first()).toBeAttached();
  await expect(page.locator('[data-moving="true"]')).toHaveCount(0);
  await expect(ours('[data-place="outside"]')).toHaveCount(30);

  const { frames, walking, worstGap } = await page.evaluate(
    () =>
      (window as unknown as { __frames: Record<'frames' | 'walking' | 'worstGap', number> })
        .__frames,
  );
  const fps = walking > 0 ? (frames * 1000) / walking : 0;
  testInfo.annotations.push({
    type: 'cena com 30 agentes',
    description: `${fps.toFixed(1)} quadros/s em ${(walking / 1000).toFixed(1)} s de caminhada; maior intervalo ${worstGap.toFixed(0)} ms`,
  });
  console.log(
    `[office] ${tag}: 30 agentes, ${fps.toFixed(1)} quadros/s em ${(walking / 1000).toFixed(1)} s; maior intervalo entre quadros ${worstGap.toFixed(0)} ms`,
  );
  // Far below what was measured, so only a real slowdown fails (see TESTING.md).
  expect(fps).toBeGreaterThan(20);
  await expectNoHorizontalScroll(page);

  for (const id of ids) await api(page, 'DELETE', `/api/agents/${id}`);
  await api(page, 'DELETE', `/api/projects/${project.id}`);
  expect(problems).toEqual([]);
});

test('the look chosen for an agent shows in the office and in its avatar', async ({
  page,
}, testInfo) => {
  const tag = testInfo.project.name;
  const problems = watchForProblems(page);
  await page.goto(`${CRUD_URL}/agentes/novo`);
  const name = `Visual ${tag}`;
  await page.getByRole('textbox', { name: 'Nome' }).fill(name);
  await page.getByRole('radio', { name: 'Pessoa' }).click();
  await page.getByRole('radio', { name: 'Escura' }).click();
  await page.getByRole('combobox', { name: 'Cabelo' }).selectOption({ label: 'Coque' });
  await page.getByRole('combobox', { name: 'Acessório' }).selectOption({ label: 'Fone' });
  await expectNoHorizontalScroll(page);
  await page.getByRole('button', { name: 'Criar agente' }).click();
  await expect(page.getByText(`${name} criado.`)).toBeVisible();

  const agents = await api<{ agents: { id: string; name: string; appearance: unknown }[] }>(
    page,
    'GET',
    '/api/agents',
  );
  const created = agents.agents.find((agent) => agent.name === name);
  expect(created?.appearance).toMatchObject({
    kind: 'person',
    skin: 'deep',
    hair: 'bun',
    accessory: 'headset',
  });

  await navigateTo(page, 'Escritório');
  await expect(page.locator(`[data-sitter="${created?.id}"]`)).toHaveCount(1);
  await expect(entry(page, created?.id ?? '')).toContainText(name);
  await api(page, 'DELETE', `/api/agents/${created?.id}`);
  expect(problems).toEqual([]);
});

test('the layout is edited, saved, seen in the office and set back to automatic', async ({
  page,
}, testInfo) => {
  // Desktop and mobile share the server: only one of them saves, the other checks the editor fits.
  const problems = watchForProblems(page);
  await page.goto(`${EMPTY_URL}/escritorio/editar`);
  await expect(page.getByRole('heading', { name: 'Editar escritório', level: 1 })).toBeVisible();
  const areas = page.getByRole('list', { name: 'Áreas' });
  await expect(areas.getByRole('button')).toHaveText([
    'Recepção · Recepção',
    'Copa · Copa',
    'Sala de reunião · Sala de reunião',
    'Descompressão · Descompressão',
  ]);
  await expectNoHorizontalScroll(page);
  if (testInfo.project.name !== 'desktop') {
    expect(problems).toEqual([]);
    return;
  }

  // A problem blocks saving and says what is wrong; undo fixes it.
  await areas.getByRole('button', { name: /^Copa/ }).click();
  await page.getByRole('button', { name: 'Apagar área' }).click();
  await expect(page.getByText('O escritório precisa de exatamente uma área "Copa".')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Salvar' })).toBeDisabled();
  await page.getByRole('button', { name: 'Desfazer' }).click();

  // Rename the lounge and save.
  await areas.getByRole('button', { name: /^Descompressão/ }).click();
  await page.getByRole('textbox', { name: 'Nome' }).fill('Cantinho do jogo');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText('Escritório salvo.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Layout salvo' })).toBeVisible();

  await page.getByRole('link', { name: 'Voltar ao escritório' }).click();
  await expect(page.locator('[data-office-scene]')).toContainText('Cantinho do jogo');
  await page.reload();
  await expect(page.locator('[data-office-scene]')).toContainText('Cantinho do jogo');

  // Back to the automatic layout.
  await page.getByRole('link', { name: 'Editar escritório' }).first().click();
  await page.getByRole('button', { name: 'Voltar ao automático' }).click();
  await page
    .getByRole('dialog', { name: 'Voltar ao layout automático?' })
    .getByRole('button', { name: 'Voltar ao automático' })
    .click();
  await expect(page.getByText('O escritório voltou ao layout automático.')).toBeVisible();
  await page.goto(`${EMPTY_URL}/escritorio`);
  await expect(page.locator('[data-office-scene]')).toContainText('Descompressão');
  await expect(page.locator('[data-office-scene]')).not.toContainText('Cantinho do jogo');
  expect(problems).toEqual([]);
});
