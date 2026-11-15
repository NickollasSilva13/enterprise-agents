import { expect, type Locator, type Page, test } from '@playwright/test';
import { api, expectNoHorizontalScroll, watchForProblems } from './helpers';
import { CRUD_URL } from './servers';

// The living office (RF-80) against a real server: characters that leave by
// the street door, come back in, and walk without the page slowing down.
// Creating and switching agents is covered through the interface in
// agents.spec.ts; here the data is prepared through the API, from the page
// itself, so the tests spend their time on the scene. Names carry the
// Playwright project name because desktop and mobile share the database.

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

const desk = (page: Page, id: string) => page.locator(`[data-desk="${id}"]`);
const walker = (page: Page, id: string) => page.locator(`[data-walker="${id}"]`);

/** Whether the point where a character stands is inside an element. */
async function standsIn(character: Locator, place: Locator): Promise<boolean> {
  const [feet, box] = await Promise.all([character.boundingBox(), place.boundingBox()]);
  if (!feet || !box) return false;
  const x = feet.x + feet.width / 2;
  const y = feet.y + feet.height;
  return x >= box.x && x <= box.x + box.width && y >= box.y - 4 && y <= box.y + box.height + 8;
}

interface Created {
  readonly id: string;
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

    // Loaded with the agent already there: it is simply at its desk.
    await page.reload();
    const room = page.getByRole('region', { name: `Vivo ${tag}` });
    await expect(room.getByRole('listitem')).toHaveText([`${agentName}Ocioso`]);
    await expect(desk(page, agent.id)).toHaveAttribute('data-seated', 'true');
    await expect(walker(page, agent.id)).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Recepção' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Copa' })).toBeVisible();

    // Switched off: the agent leaves the office by the street door.
    await api(page, 'PATCH', `/api/agents/${agent.id}`, { enabled: false });
    await refreshUntil(page, () =>
      expect(desk(page, agent.id)).toHaveAttribute('data-place', 'outside', { timeout: 1000 }),
    );
    await expect(desk(page, agent.id)).toHaveAttribute('data-seated', 'false');
    if (reduced) {
      // No walk at all: the chair is empty and nobody is on the way.
      await expect(page.locator('[data-moving="true"]')).toHaveCount(0);
    } else {
      await expect(walker(page, agent.id)).toHaveAttribute('data-moving', 'true');
    }
    await expect(walker(page, agent.id)).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Recepção' })).toContainText(agentName);

    // After a reload it is still outside, with nobody walking (coherent position).
    await page.reload();
    await expect(desk(page, agent.id)).toHaveAttribute('data-place', 'outside');
    await expect(page.locator('[data-walker]')).toHaveCount(0);

    // Switched on again: it comes in through the reception and sits down.
    await api(page, 'PATCH', `/api/agents/${agent.id}`, { enabled: true });
    await refreshUntil(page, () =>
      expect(desk(page, agent.id)).toHaveAttribute('data-place', 'desk', { timeout: 1000 }),
    );
    if (reduced) {
      await expect(desk(page, agent.id)).toHaveAttribute('data-seated', 'true');
      await expect(page.locator('[data-moving="true"]')).toHaveCount(0);
    } else {
      await expect(walker(page, agent.id)).toHaveAttribute('data-moving', 'true');
      // The first steps are inside the reception, where the street door is.
      expect(
        await standsIn(walker(page, agent.id), page.getByRole('region', { name: 'Recepção' })),
      ).toBe(true);
      await expect(desk(page, agent.id)).toHaveAttribute('data-seated', 'false');
    }
    await expect(desk(page, agent.id)).toHaveAttribute('data-seated', 'true');
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
  await page.reload();
  const room = page.getByRole('region', { name: `Trinta ${tag}` });
  await expect(room.locator('[data-seated="true"]')).toHaveCount(30);

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
    expect(room.locator('[data-place="outside"]')).toHaveCount(30, { timeout: 1000 }),
  );
  await expect(page.locator('[data-moving="true"]').first()).toBeAttached();
  await expect(page.locator('[data-moving="true"]')).toHaveCount(0);
  await expect(room.locator('[data-place="outside"]')).toHaveCount(30);

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
