// The frame of every screen (Phase 21) through the API: the global search
// (D3) and the user's card (D5).
import { profileSchema, SEARCH_LIMITS, searchResultsSchema, type TaskState } from '@ea/shared';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { newId } from '../src/db/ids';
import { agents, models, settings, tasks, workflowStages } from '../src/db/schema';
import { addAgent, addModel, addProject, addProvider } from './fixtures';
import { makeApp, type TestApp } from './helpers';

let current: TestApp | undefined;
afterEach(async () => {
  await current?.close();
  current = undefined;
});

async function setup() {
  const test = await makeApp();
  current = test;
  const call = async (method: 'GET' | 'PUT', url: string, payload?: object) => {
    const response = await test.app.inject({
      method,
      url,
      headers: test.trusted,
      ...(payload ? { payload } : {}),
    });
    return { status: response.statusCode, body: response.json<unknown>() };
  };
  const search = async (q: string) =>
    searchResultsSchema.parse((await call('GET', `/api/search?q=${encodeURIComponent(q)}`)).body);
  return { ...test, call, search };
}

function addTask(test: TestApp, areaId: string, title: string, state: TaskState = 'open') {
  const stageId = newId();
  test.database.db
    .insert(workflowStages)
    .values({ id: stageId, projectId: areaId, position: 0, name: 'Fila', kind: 'human' })
    .run();
  const id = newId();
  test.database.db.insert(tasks).values({ id, projectId: areaId, title, stageId, state }).run();
  return id;
}

describe('global search (Phase 21)', () => {
  it('finds agents, areas and tasks ignoring case and accents', async () => {
    const s = await setup();
    const finance = addProject(s.database, 'Finanças', 'Contas e relatórios');
    addAgent(s.database, { name: 'Fátima', description: 'Fecha o mês', projectId: finance });
    addAgent(s.database, { name: 'Bruno' });
    const taskId = addTask(s, finance, 'Relatório de vendas');

    const byAgent = await s.search('fat');
    expect(byAgent.agents.map((agent) => [agent.name, agent.description, agent.areaName])).toEqual([
      ['Fátima', 'Fecha o mês', 'Finanças'],
    ]);
    expect((await s.search('FINAN')).areas.map((area) => area.name)).toEqual(['Finanças']);
    expect(await s.search('relatorio')).toMatchObject({
      tasks: [{ id: taskId, title: 'Relatório de vendas', areaName: 'Finanças', state: 'open' }],
    });
    expect((await s.search('bru')).agents.map((agent) => agent.areaName)).toEqual([null]);
  });

  it('ranks the start of a name first and keeps open tasks before done ones', async () => {
    const s = await setup();
    const area = addProject(s.database, 'Vendas');
    addTask(s, area, 'Eventos de venda');
    const done = addTask(s, area, 'Vender planos', 'done');
    const open = addTask(s, area, 'Vender cursos');
    const titles = (await s.search('vend')).tasks.map((task) => task.id);
    expect(titles.slice(0, 2)).toEqual([open, done]);
    expect(titles).toHaveLength(3);
  });

  it('caps each group and never lists a deleted agent', async () => {
    const s = await setup();
    for (let index = 0; index < SEARCH_LIMITS.perGroup + 3; index += 1) {
      addAgent(s.database, { name: `Ana ${index}` });
    }
    const gone = addAgent(s.database, { name: 'Ana excluída' });
    s.database.db
      .update(agents)
      .set({ deletedAt: new Date().toISOString() })
      .where(eq(agents.id, gone))
      .run();
    const found = await s.search('ana');
    expect(found.agents).toHaveLength(SEARCH_LIMITS.perGroup);
    expect(found.agents.map((agent) => agent.id)).not.toContain(gone);
  });

  it('takes % and _ as letters, and refuses an empty or long query', async () => {
    const s = await setup();
    addProject(s.database, '100% pronto');
    addProject(s.database, 'Outra');
    expect((await s.search('%')).areas.map((area) => area.name)).toEqual(['100% pronto']);
    expect((await s.search('_')).areas).toEqual([]);
    expect((await s.call('GET', '/api/search?q=')).status).toBe(400);
    expect((await s.call('GET', '/api/search')).status).toBe(400);
    expect((await s.call('GET', `/api/search?q=${'x'.repeat(101)}`)).status).toBe(400);
    expect((await s.call('GET', '/api/search?q=a&extra=1')).status).toBe(400);
  });
});

describe('profile (Phase 21)', () => {
  it('starts empty, saves and reads back the card', async () => {
    const s = await setup();
    expect((await s.call('GET', '/api/profile')).body).toEqual({ name: null, appearance: null });
    const appearance = {
      kind: 'person',
      skin: 'tan',
      hair: 'curly',
      hairColor: 'black',
      outfit: 'hoodie',
      outfitColor: 'violet',
      pants: 'denim',
      accessory: 'none',
      eyes: 'brown',
      facialHair: 'none',
      shoes: 'white',
      pattern: 'plain',
    };
    const saved = await s.call('PUT', '/api/profile', { name: ' Nick ', appearance });
    expect(saved.status).toBe(200);
    expect(profileSchema.parse(saved.body)).toEqual({ name: 'Nick', appearance });
    expect((await s.call('GET', '/api/profile')).body).toEqual({ name: 'Nick', appearance });
  });

  it('refuses what does not fit, and ignores a stored value that does not', async () => {
    const s = await setup();
    expect(
      (await s.call('PUT', '/api/profile', { name: 'x'.repeat(41), appearance: null })).status,
    ).toBe(400);
    expect(
      (await s.call('PUT', '/api/profile', { name: 'A', appearance: null, email: 'a@b' })).status,
    ).toBe(400);
    s.database.db
      .insert(settings)
      .values({ key: 'profile', value: { name: 42 } })
      .run();
    expect((await s.call('GET', '/api/profile')).body).toEqual({ name: null, appearance: null });
  });
});

describe('guide (Phase 32, D3)', () => {
  it('starts with nothing put aside, then keeps what the user chose', async () => {
    const s = await setup();
    expect((await s.call('GET', '/api/guide')).body).toEqual({
      skipped: false,
      dismissedTips: [],
      done: { provider: false, model: false, area: false, task: false },
    });
    const saved = await s.call('PUT', '/api/guide', {
      skipped: true,
      dismissedTips: ['board-move', 'office-pick', 'board-move'],
    });
    expect(saved.status).toBe(200);
    // A tip closed twice counts once.
    expect(saved.body).toMatchObject({
      skipped: true,
      dismissedTips: ['board-move', 'office-pick'],
    });
    expect((await s.call('GET', '/api/guide')).body).toEqual(saved.body);
  });

  it('reads each step as done from the data, never from what was stored (D1)', async () => {
    const s = await setup();
    const done = async () => ((await s.call('GET', '/api/guide')).body as { done: object }).done;
    const provider = addProvider(s.database);
    const model = addModel(s.database, provider);
    s.database.db.update(models).set({ enabled: false }).where(eq(models.id, model)).run();
    expect(await done()).toEqual({ provider: true, model: false, area: false, task: false });
    s.database.db.update(models).set({ enabled: true }).where(eq(models.id, model)).run();
    // A project without a flow is not yet an area with a board.
    const area = addProject(s.database, 'Site');
    expect(await done()).toEqual({ provider: true, model: true, area: false, task: false });
    addTask(s, area, 'Primeira tarefa');
    expect(await done()).toEqual({ provider: true, model: true, area: true, task: true });
  });

  it('refuses unknown tips and fields, and ignores a stored value that does not fit', async () => {
    const s = await setup();
    expect(
      (await s.call('PUT', '/api/guide', { skipped: false, dismissedTips: ['inventada'] })).status,
    ).toBe(400);
    expect(
      (await s.call('PUT', '/api/guide', { skipped: false, dismissedTips: [], step: 3 })).status,
    ).toBe(400);
    s.database.db
      .insert(settings)
      .values({ key: 'guide', value: { skipped: 'sim' } })
      .run();
    expect((await s.call('GET', '/api/guide')).body).toMatchObject({
      skipped: false,
      dismissedTips: [],
    });
  });
});
