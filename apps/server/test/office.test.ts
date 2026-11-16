import {
  type Agent,
  agentExportSchema,
  agentSchema,
  apiErrorSchema,
  type Appearance,
  buildPresetLayout,
  type OfficeLayout,
  layoutInputOf,
  type OfficeLayoutInput,
  officeLayoutSchema,
  officeSchema,
} from '@ea/shared';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { agents } from '../src/db/schema';
import { makeApp, type TestApp } from './helpers';

// Phase 14: the office layout the user edits and the look of each agent.

let t: TestApp;
beforeEach(async () => {
  t = await makeApp();
});
afterEach(async () => {
  await t.close();
});

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

async function call(method: Method, url: string, payload?: unknown) {
  const response = await t.app.inject({
    method,
    url,
    headers: t.trusted,
    ...(payload === undefined ? {} : { payload: payload as object }),
  });
  return { status: response.statusCode, body: response.body ? response.json<unknown>() : null };
}

const office = async () => officeSchema.parse((await call('GET', '/api/office')).body);

async function createAgent(input: Record<string, unknown>): Promise<Agent> {
  const { status, body } = await call('POST', '/api/agents', input);
  expect(status).toBe(201);
  return agentSchema.parse(body);
}

async function createProject(name: string): Promise<string> {
  const { status, body } = await call('POST', '/api/projects', { name });
  expect(status).toBe(201);
  return (body as { id: string }).id;
}

/** A layout as the editor would send it: without ids. */
const inputOf = (layout: OfficeLayout): OfficeLayoutInput => layoutInputOf(layout);

const LOOK: Appearance = {
  kind: 'person',
  skin: 'brown',
  hair: 'curly',
  hairColor: 'black',
  outfit: 'hoodie',
  outfitColor: 'teal',
  pants: 'denim',
  accessory: 'headset',
};

describe('office layout', () => {
  it('is automatic until saved, and follows the projects meanwhile', async () => {
    let current = await office();
    expect(current.customized).toBe(false);
    const support = await createProject('Suporte');
    current = await office();
    expect(current.layout.areas.filter((area) => area.kind === 'project')).toMatchObject([
      { projectId: support, name: null },
    ]);
  });

  it('saves a layout and reads it back the same, with new ids', async () => {
    const support = await createProject('Suporte');
    const agent = await createAgent({ name: 'Ana', projectId: support });
    const layout = buildPresetLayout('compact', [{ projectId: support, agents: 1 }]);
    const input = inputOf(layout);
    // The user renames a room and gives the first desk to Ana.
    const room = input.areas.findIndex((area) => area.kind === 'project');
    input.areas[room] = { ...input.areas[room]!, name: 'Sala azul', floor: 'carpet_blue' };
    const desk = input.items.findIndex((item) => item.kind === 'desk');
    input.items[desk] = { ...input.items[desk]!, agentId: agent.id };

    const saved = await call('PUT', '/api/office/layout', input);
    expect(saved.status).toBe(200);
    const returned = officeLayoutSchema.parse(saved.body);
    expect(inputOf(returned)).toEqual(input);
    expect(returned.areas[0]?.id).not.toBe(layout.areas[0]?.id);

    const current = await office();
    expect(current.customized).toBe(true);
    expect(inputOf(current.layout)).toEqual(input);
  });

  it('refuses a layout with problems, saying which, and keeps the previous one', async () => {
    const input = inputOf(buildPresetLayout('compact', []));
    const broken: OfficeLayoutInput = {
      ...input,
      // Without the pantry, and with the reception moved over another area.
      areas: input.areas
        .filter((area) => area.kind !== 'pantry')
        .map((area) => (area.kind === 'reception' ? area : area)),
    };
    const response = await call('PUT', '/api/office/layout', broken);
    expect(response.status).toBe(400);
    const error = apiErrorSchema.parse(response.body);
    expect(error.message).toBe('O layout tem problemas e não foi salvo.');
    expect(error.details).toContainEqual({
      path: '',
      message: 'O escritório precisa de exatamente uma área "Copa".',
    });
    expect((await office()).customized).toBe(false);
  });

  it('refuses unknown fields, unknown projects and unknown or deleted agents', async () => {
    const input = inputOf(buildPresetLayout('compact', [{ projectId: null, agents: 1 }]));
    const extra = await call('PUT', '/api/office/layout', { ...input, theme: 'x' });
    expect(extra.status).toBe(400);

    const room = input.areas.findIndex((area) => area.kind === 'project');
    const withProject = structuredClone(input);
    withProject.areas[room]!.projectId = 'nao-existe';
    const project = await call('PUT', '/api/office/layout', withProject);
    expect(project.status).toBe(400);
    expect(apiErrorSchema.parse(project.body).details).toContainEqual({
      path: `areas.${room}.projectId`,
      message: 'Projeto não encontrado.',
    });

    const gone = await createAgent({ name: 'Saiu' });
    expect((await call('DELETE', `/api/agents/${gone.id}`)).status).toBe(204);
    const desk = input.items.findIndex((item) => item.kind === 'desk');
    const withOwner = structuredClone(input);
    withOwner.items[desk]!.agentId = gone.id;
    const owner = await call('PUT', '/api/office/layout', withOwner);
    expect(owner.status).toBe(400);
    expect(apiErrorSchema.parse(owner.body).details).toContainEqual({
      path: `items.${desk}.agentId`,
      message: 'Agente não encontrado.',
    });
  });

  it('frees the desk of a deleted agent and unlinks the room of a deleted project', async () => {
    const support = await createProject('Suporte');
    const agent = await createAgent({ name: 'Ana', projectId: support });
    const input = inputOf(buildPresetLayout('compact', [{ projectId: support, agents: 1 }]));
    const desk = input.items.findIndex((item) => item.kind === 'desk');
    input.items[desk]!.agentId = agent.id;
    expect((await call('PUT', '/api/office/layout', input)).status).toBe(200);

    expect((await call('DELETE', `/api/agents/${agent.id}`)).status).toBe(204);
    expect((await office()).layout.items[desk]?.agentId).toBeNull();

    expect((await call('DELETE', `/api/projects/${support}`)).status).toBe(204);
    const room = (await office()).layout.areas.find((area) => area.kind === 'project');
    expect(room?.projectId).toBeNull();
  });

  it('goes back to the automatic layout on request', async () => {
    const input = inputOf(buildPresetLayout('spacious', []));
    expect((await call('PUT', '/api/office/layout', input)).status).toBe(200);
    expect((await office()).customized).toBe(true);
    expect((await call('DELETE', '/api/office/layout')).status).toBe(204);
    const current = await office();
    expect(current.customized).toBe(false);
    expect(current.layout).toEqual(buildPresetLayout('complete', []));
  });
});

describe('agent appearance', () => {
  it('is null until chosen, then saved, shown in the office and copied by duplicate', async () => {
    const agent = await createAgent({ name: 'Ana' });
    expect(agent.appearance).toBeNull();
    const updated = await call('PATCH', `/api/agents/${agent.id}`, { appearance: LOOK });
    expect(agentSchema.parse(updated.body).appearance).toEqual(LOOK);
    expect((await office()).agents[0]?.appearance).toEqual(LOOK);

    const copy = await call('POST', `/api/agents/${agent.id}/duplicate`);
    expect(agentSchema.parse(copy.body).appearance).toEqual(LOOK);
  });

  it('does not count as activity: an idle agent stays idle for as long as before (RF-80)', async () => {
    const agent = await createAgent({ name: 'Ana' });
    const before = (await office()).agents[0]?.idleSince;
    await call('PATCH', `/api/agents/${agent.id}`, { appearance: LOOK });
    expect((await office()).agents[0]?.idleSince).toBe(before);
    // Any other change still does.
    await new Promise((resolve) => setTimeout(resolve, 5));
    await call('PATCH', `/api/agents/${agent.id}`, { appearance: LOOK, objective: 'Novo' });
    expect((await office()).agents[0]?.idleSince).not.toBe(before);
  });

  it('accepts only the options of the list', async () => {
    const agent = await createAgent({ name: 'Ana' });
    for (const bad of [
      { ...LOOK, hairColor: '#ff0000' },
      { ...LOOK, extra: true },
      { ...LOOK, skin: undefined },
    ]) {
      const response = await call('PATCH', `/api/agents/${agent.id}`, { appearance: bad });
      expect(response.status).toBe(400);
    }
  });

  it('reads a stored look that no longer fits the schema as none chosen', async () => {
    const agent = await createAgent({ name: 'Ana' });
    t.database.db
      .update(agents)
      .set({ appearance: { ...LOOK, hair: 'mohawk' } as unknown as Appearance })
      .where(eq(agents.id, agent.id))
      .run();
    expect(agentSchema.parse((await call('GET', `/api/agents/${agent.id}`)).body).appearance).toBe(
      null,
    );
  });

  it('travels in the export file and comes back on import (RF-20)', async () => {
    const agent = await createAgent({ name: 'Ana', appearance: LOOK });
    const exported = agentExportSchema.parse(
      (await call('GET', `/api/agents/export?ids=${agent.id}`)).body,
    );
    expect(exported.agents[0]?.appearance).toEqual(LOOK);
    const imported = await call('POST', '/api/agents/import', exported);
    expect(imported.status).toBe(201);
    const id = (imported.body as { imported: { id: string }[] }).imported[0]?.id;
    expect(agentSchema.parse((await call('GET', `/api/agents/${id}`)).body).appearance).toEqual(
      LOOK,
    );
  });
});
