// Requests between areas (Phase 17), through the API and the real RunManager:
// the rules from area to area (D2), the request as a task of the other area
// that the asking task waits for (D1), files copied both ways (D3) and the
// guards against loops (D4). Areas whose flow starts at a stage of the user
// start no run, so most tests need no model at all.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  type AreaLink,
  areaCreatedSchema,
  areaLinkSchema,
  areaLinksSchema,
  officeSchema,
  REQUEST_LIMITS,
  requestsSchema,
  type TaskDetail,
  taskDetailSchema,
  taskSummarySchema,
  workflowSchema,
} from '@ea/shared';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { auditLog } from '../src/db/schema';
import { FakeProvider, type FakeTurn, waitFor } from './fake-provider';
import { addModel, addProject, addProvider } from './fixtures';
import { makeApp, type TestApp } from './helpers';

let current: TestApp | undefined;
afterEach(async () => {
  await current?.close();
  current = undefined;
});

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

async function setup(turns: FakeTurn[] = []) {
  const provider = new FakeProvider(...turns);
  const test = await makeApp({ createProvider: () => provider });
  current = test;
  const modelId = addModel(test.database, addProvider(test.database), 'fake-model', {
    supportsTools: true,
  });
  const call = async (method: Method, url: string, payload?: unknown) => {
    const response = await test.app.inject({
      method,
      url,
      headers: test.trusted,
      ...(payload === undefined ? {} : { payload: payload as object }),
    });
    return { status: response.statusCode, body: response.body ? response.json<unknown>() : null };
  };
  const detail = async (taskId: string): Promise<TaskDetail> =>
    taskDetailSchema.parse((await call('GET', `/api/tasks/${taskId}`)).body);
  const areaDir = (areaId: string, ...rest: string[]) =>
    join(test.dataDir, 'areas', areaId, ...rest);

  return {
    ...test,
    provider,
    modelId,
    call,
    detail,
    areaDir,
    /** An area whose flow is "Fila" (the user's) then "Fim": nothing runs by itself. */
    quietArea: async (name: string) => {
      const areaId = addProject(test.database, name);
      const { status, body } = await call('PUT', `/api/areas/${areaId}/workflow`, {
        stages: [
          { key: 'f', name: 'Fila', kind: 'human', agentId: null },
          { key: 'd', name: 'Fim', kind: 'done', agentId: null },
        ],
        transitions: [{ from: 'f', to: 'd', actor: 'human' }],
      });
      expect(status, JSON.stringify(body)).toBe(200);
      const stages = workflowSchema.parse(body).stages;
      return { areaId, fila: stages[0]!.id, fim: stages[1]!.id };
    },
    link: async (fromAreaId: string, toAreaId: string, requiresApproval = false) => {
      const { status, body } = await call('POST', '/api/area-links', {
        fromAreaId,
        toAreaId,
        requiresApproval,
      });
      expect(status, JSON.stringify(body)).toBe(201);
      return areaLinkSchema.parse(body);
    },
    newTask: async (areaId: string, title = 'Campanha de março') => {
      const { status, body } = await call('POST', `/api/areas/${areaId}/tasks`, { title });
      expect(status, JSON.stringify(body)).toBe(201);
      return taskSummarySchema.parse(body);
    },
    request: (taskId: string, payload: Record<string, unknown>) =>
      call('POST', `/api/tasks/${taskId}/requests`, {
        title: 'Números de vendas',
        description: 'Vendas por dia em março.',
        ...payload,
      }),
    until: (taskId: string, done: (found: TaskDetail) => boolean) =>
      waitFor(async () => {
        const found = await detail(taskId);
        return done(found) ? found : null;
      }),
  };
}

const conflict = (response: { status: number; body: unknown }) => {
  expect(response.status, JSON.stringify(response.body)).toBe(409);
  return (response.body as { message: string }).message;
};

describe('rules between areas (D2)', () => {
  it('creates, changes, lists and removes a rule, and refuses repeated or invalid ones', async () => {
    const s = await setup();
    const marketing = await s.quietArea('Marketing');
    const dados = await s.quietArea('Dados');
    const link: AreaLink = await s.link(marketing.areaId, dados.areaId, true);
    expect(link).toMatchObject({
      fromAreaName: 'Marketing',
      toAreaName: 'Dados',
      requiresApproval: true,
    });

    const repeated = await s.call('POST', '/api/area-links', {
      fromAreaId: marketing.areaId,
      toAreaId: dados.areaId,
    });
    expect(conflict(repeated)).toMatch(/já existe/);
    const self = await s.call('POST', '/api/area-links', {
      fromAreaId: dados.areaId,
      toAreaId: dados.areaId,
    });
    expect(self.status).toBe(400);
    const unknown = await s.call('POST', '/api/area-links', {
      fromAreaId: dados.areaId,
      toAreaId: 'nao-existe',
    });
    expect(unknown.status).toBe(404);

    const changed = await s.call('PATCH', `/api/area-links/${link.id}`, {
      requiresApproval: false,
    });
    expect(areaLinkSchema.parse(changed.body).requiresApproval).toBe(false);
    expect(areaLinksSchema.parse((await s.call('GET', '/api/area-links')).body).links).toHaveLength(
      1,
    );
    expect((await s.call('DELETE', `/api/area-links/${link.id}`)).status).toBe(204);
    expect((await s.call('DELETE', `/api/area-links/${link.id}`)).status).toBe(404);
    expect(areaLinksSchema.parse((await s.call('GET', '/api/area-links')).body).links).toEqual([]);
    expect(
      s.database.db
        .select()
        .from(auditLog)
        .all()
        .filter((entry) => entry.action.startsWith('area_link.'))
        .map((entry) => entry.action),
    ).toEqual(['area_link.created', 'area_link.updated', 'area_link.deleted']);
  });
});

describe('requests made by the user', () => {
  it('needs a rule, waits for approval, and is turned down or let in', async () => {
    const s = await setup();
    const marketing = await s.quietArea('Marketing');
    const dados = await s.quietArea('Dados');
    const task = await s.newTask(marketing.areaId);

    expect(conflict(await s.request(task.id, { toAreaId: dados.areaId }))).toMatch(
      /não tem permissão/,
    );
    await s.link(marketing.areaId, dados.areaId, true);
    expect((await s.detail(task.id)).requestTargets).toEqual([
      { areaId: dados.areaId, areaName: 'Dados', requiresApproval: true },
    ]);

    // Turned down: the asking task goes on, with the reason in its history.
    const first = taskSummarySchema.parse(
      (await s.request(task.id, { toAreaId: dados.areaId })).body,
    );
    expect(first).toMatchObject({ state: 'pending', parentTaskId: task.id, stageName: 'Fila' });
    expect((await s.detail(task.id)).task.waitingOn).toBe(1);
    const listed = requestsSchema.parse((await s.call('GET', '/api/requests')).body).requests;
    expect(listed).toEqual([
      expect.objectContaining({
        id: first.id,
        state: 'pending',
        fromAreaName: 'Marketing',
        toAreaName: 'Dados',
        parentTitle: 'Campanha de março',
      }),
    ]);
    expect(
      conflict(await s.call('POST', `/api/tasks/${first.id}/move`, { toStageId: dados.fim })),
    ).toMatch(/aprovação/);
    const refused = await s.call('POST', `/api/tasks/${first.id}/refuse-request`, {
      note: 'Sem dados de março ainda.',
    });
    expect(taskSummarySchema.parse(refused.body).state).toBe('cancelled');
    const afterRefusal = await s.detail(task.id);
    expect(afterRefusal.task.waitingOn).toBe(0);
    expect(afterRefusal.task.attention).toBeNull();
    expect(afterRefusal.events.at(-1)).toMatchObject({
      kind: 'request_refused',
      relatedTaskId: first.id,
    });
    expect(afterRefusal.events.at(-1)?.text).toContain('Sem dados de março ainda.');
    expect((await s.call('POST', `/api/tasks/${first.id}/approve-request`)).status).toBe(409);

    // Let in: it is on the other board, and the parent shows it.
    const second = taskSummarySchema.parse(
      (await s.request(task.id, { toAreaId: dados.areaId, title: 'Outra tentativa' })).body,
    );
    const approved = await s.call('POST', `/api/tasks/${second.id}/approve-request`);
    expect(taskSummarySchema.parse(approved.body).state).toBe('open');
    const parent = await s.detail(task.id);
    expect(parent.children.map((child) => [child.title, child.state])).toEqual([
      ['Números de vendas', 'cancelled'],
      ['Outra tentativa', 'open'],
    ]);
    expect((await s.detail(second.id)).parent).toMatchObject({
      id: task.id,
      areaName: 'Marketing',
    });
  });

  it('delivers the files of the other area when the request is done, and again if reopened', async () => {
    const s = await setup();
    const marketing = await s.quietArea('Marketing');
    const dados = await s.quietArea('Dados');
    await s.link(marketing.areaId, dados.areaId);
    const task = await s.newTask(marketing.areaId);
    mkdirSync(s.areaDir(marketing.areaId, 'briefing'), { recursive: true });
    writeFileSync(s.areaDir(marketing.areaId, 'briefing', 'publico.md'), '# Público');

    const child = taskSummarySchema.parse(
      (await s.request(task.id, { toAreaId: dados.areaId, files: ['area/briefing'] })).body,
    );
    expect(child.state).toBe('open');
    expect(
      readFileSync(s.areaDir(dados.areaId, 'pedidos', child.id, 'briefing', 'publico.md'), 'utf8'),
    ).toBe('# Público');

    mkdirSync(s.areaDir(dados.areaId, 'entregas', child.id), { recursive: true });
    writeFileSync(s.areaDir(dados.areaId, 'entregas', child.id, 'vendas.csv'), 'dia,total');
    const moved = await s.call('POST', `/api/tasks/${child.id}/move`, {
      toStageId: dados.fim,
      note: 'Total de 42 vendas.',
    });
    expect(moved.status, JSON.stringify(moved.body)).toBe(200);
    expect(
      readFileSync(s.areaDir(marketing.areaId, 'recebidos', child.id, 'vendas.csv'), 'utf8'),
    ).toBe('dia,total');
    const parent = await s.detail(task.id);
    expect(parent.task.waitingOn).toBe(0);
    const delivered = parent.events.filter((event) => event.kind === 'delivered');
    expect(delivered).toHaveLength(1);
    expect(delivered[0]?.text).toContain('Total de 42 vendas.');
    expect(delivered[0]?.text).toContain(`area/recebidos/${child.id}/`);
    expect(requestsSchema.parse((await s.call('GET', '/api/requests')).body).requests).toEqual([]);

    // The user reopens the request: the parent waits again and gets a second delivery.
    await s.call('PUT', `/api/areas/${dados.areaId}/workflow`, {
      stages: [
        { key: dados.fila, name: 'Fila', kind: 'human', agentId: null },
        { key: dados.fim, name: 'Fim', kind: 'done', agentId: null },
      ],
      transitions: [
        { from: dados.fila, to: dados.fim, actor: 'human' },
        { from: dados.fim, to: dados.fila, actor: 'human' },
      ],
    });
    await s.call('POST', `/api/tasks/${child.id}/move`, { toStageId: dados.fila });
    expect((await s.detail(task.id)).task.waitingOn).toBe(1);
    await s.call('POST', `/api/tasks/${child.id}/move`, { toStageId: dados.fim, note: 'Revisto.' });
    const again = await s.detail(task.id);
    expect(again.task.waitingOn).toBe(0);
    expect(again.events.filter((event) => event.kind === 'delivered')).toHaveLength(2);
  });

  it('stops the asking task when its request is cancelled', async () => {
    const s = await setup();
    const marketing = await s.quietArea('Marketing');
    const dados = await s.quietArea('Dados');
    await s.link(marketing.areaId, dados.areaId);
    const task = await s.newTask(marketing.areaId);
    const child = taskSummarySchema.parse(
      (await s.request(task.id, { toAreaId: dados.areaId })).body,
    );
    await s.call('POST', `/api/tasks/${child.id}/cancel`);
    const parent = await s.detail(task.id);
    expect(parent.task.attention).toMatch(/Números de vendas.*foi cancelado/);
    expect(parent.task.waitingOn).toBe(0);
  });

  it('refuses loops, chains deeper than the limit, too many open requests and bad paths (D4)', async () => {
    const s = await setup();
    const [a, b, c, d, e] = await Promise.all(
      ['A', 'B', 'C', 'D', 'E'].map((name) => s.quietArea(name)),
    );
    for (const [from, to] of [
      [a, b],
      [b, a],
      [b, c],
      [c, d],
      [d, e],
    ] as const) {
      await s.link(from!.areaId, to!.areaId);
    }
    const root = await s.newTask(a!.areaId);
    const inB = taskSummarySchema.parse((await s.request(root.id, { toAreaId: b!.areaId })).body);
    expect(conflict(await s.request(inB.id, { toAreaId: a!.areaId }))).toMatch(/laço/);
    // The area that would close the loop is not offered either.
    expect((await s.detail(inB.id)).requestTargets.map((target) => target.areaName)).toEqual(['C']);

    const inC = taskSummarySchema.parse((await s.request(inB.id, { toAreaId: c!.areaId })).body);
    const inD = taskSummarySchema.parse((await s.request(inC.id, { toAreaId: d!.areaId })).body);
    expect((await s.detail(inD.id)).requestTargets).toEqual([]);
    expect(conflict(await s.request(inD.id, { toAreaId: e!.areaId }))).toMatch(
      new RegExp(`limite é de ${REQUEST_LIMITS.maxDepth}`),
    );

    for (let n = 1; n < REQUEST_LIMITS.openPerTask; n += 1) {
      expect((await s.request(root.id, { toAreaId: b!.areaId })).status).toBe(201);
    }
    expect(conflict(await s.request(root.id, { toAreaId: b!.areaId }))).toMatch(
      /pedidos em aberto/,
    );

    const other = await s.newTask(a!.areaId, 'Outra');
    const escaping = await s.request(other.id, { toAreaId: b!.areaId, files: ['../segredo.txt'] });
    expect(escaping.status).toBe(400);
    expect(
      conflict(await s.request(other.id, { toAreaId: b!.areaId, files: ['nao-existe.md'] })),
    ).toMatch(/não existe/);
    expect((await s.detail(other.id)).children).toEqual([]);
  });
});

describe('requests made by agents', () => {
  it('asks another area, waits for the delivery and goes on with it', async () => {
    // In order: the agent of Site asks (run 1); after approval the analyst of
    // Dados delivers (run 2); the agent of Site goes on (run 3); the next
    // stage's agent finishes without moving (run 4), which stops the task.
    const s = await setup([
      {
        toolCalls: [
          {
            name: 'request_from_area',
            arguments: {
              area: 'dados',
              title: 'Números de março',
              description: 'Vendas por dia.',
              files: ['area/briefing.md'],
            },
          },
        ],
      },
      { chunks: ['Pedi.'] },
      {
        toolCalls: [
          { name: 'move_task', arguments: { stage: 'Entregue', note: 'Total de 42 vendas.' } },
        ],
      },
      { chunks: ['Entregue.'] },
      {
        toolCalls: [
          { name: 'move_task', arguments: { stage: 'Desenvolvimento', note: 'Com os números.' } },
        ],
      },
      { chunks: ['Ok.'] },
    ]);
    const fromTemplate = async (name: string) => {
      const { body } = await s.call('POST', '/api/areas/from-template', {
        templateId: 'desenvolvimento',
        name,
        modelId: s.modelId,
      });
      return areaCreatedSchema.parse(body);
    };
    const site = await fromTemplate('Site');
    const dados = await fromTemplate('Dados');
    const analyst = dados.agentIds[0]!;
    await s.call('PUT', `/api/areas/${dados.areaId}/workflow`, {
      stages: [
        { key: 'a', name: 'Análise', kind: 'agent', agentId: analyst },
        { key: 'b', name: 'Entregue', kind: 'done', agentId: null },
      ],
      transitions: [{ from: 'a', to: 'b', actor: 'both' }],
    });
    await s.link(site.areaId, dados.areaId, true);
    mkdirSync(s.areaDir(site.areaId), { recursive: true });
    writeFileSync(s.areaDir(site.areaId, 'briefing.md'), 'Público jovem.');

    const task = await s.newTask(site.areaId, 'Página de promoções');
    const waiting = await s.until(
      task.id,
      (found) => !found.task.working && found.children.length === 1,
    );
    expect(waiting.task.attention).toBeNull();
    expect(waiting.task.waitingOn).toBe(1);
    const child = waiting.children[0]!;
    expect(child).toMatchObject({ areaName: 'Dados', state: 'pending', stageName: 'Análise' });
    expect(readFileSync(s.areaDir(dados.areaId, 'pedidos', child.id, 'briefing.md'), 'utf8')).toBe(
      'Público jovem.',
    );
    // The first brief offered the other area; nothing ran while the request waited.
    expect(JSON.stringify(s.provider.requests[0]?.messages)).toContain(
      'Áreas que você pode acionar: \\"Dados\\"',
    );
    expect(s.provider.requests).toHaveLength(2);

    // The agent that asked is taking the request to the other area's room.
    const office = officeSchema.parse((await s.call('GET', '/api/office')).body);
    const asker = office.agents.find((agent) => agent.name === 'Produto (Site)');
    expect(asker?.visit?.areaId).toBe(dados.areaId);

    mkdirSync(s.areaDir(dados.areaId, 'entregas', child.id), { recursive: true });
    writeFileSync(s.areaDir(dados.areaId, 'entregas', child.id, 'vendas.csv'), 'dia,total');
    await s.call('POST', `/api/tasks/${child.id}/approve-request`);

    const done = await s.until(
      task.id,
      (found) => found.task.stageName === 'Desenvolvimento' && found.task.attention !== null,
    );
    expect(done.events.map((event) => event.kind)).toEqual(
      expect.arrayContaining(['requested', 'request_approved', 'delivered']),
    );
    expect((await s.detail(child.id)).task.state).toBe('done');
    expect(existsSync(s.areaDir(site.areaId, 'recebidos', child.id, 'vendas.csv'))).toBe(true);
    // The agent went on with the delivery in its brief.
    expect(JSON.stringify(s.provider.requests[4]?.messages)).toContain('Total de 42 vendas.');
    expect(
      s.database.db.select().from(auditLog).where(eq(auditLog.action, 'task.requested')).all(),
    ).toHaveLength(1);
  });

  it('refuses files outside the folders the agent may read (C-17)', async () => {
    const s = await setup([
      {
        toolCalls: [
          {
            name: 'request_from_area',
            arguments: {
              area: 'Dados',
              title: 'Números',
              description: 'Vendas.',
              files: ['../../segredo.txt'],
            },
          },
        ],
      },
      { chunks: ['Não consegui.'] },
    ]);
    const { body } = await s.call('POST', '/api/areas/from-template', {
      templateId: 'desenvolvimento',
      name: 'Site',
      modelId: s.modelId,
    });
    const site = areaCreatedSchema.parse(body);
    const dados = await s.quietArea('Dados');
    await s.link(site.areaId, dados.areaId);
    const task = await s.newTask(site.areaId);
    const stopped = await s.until(task.id, (found) => found.task.attention !== null);
    expect(stopped.children).toEqual([]);
    expect(JSON.stringify(s.provider.requests[1]?.messages)).toContain(
      'O caminho não pode sair da pasta de trabalho',
    );
  });

  it('is refused without a rule, and the task stops for the user', async () => {
    const s = await setup([
      {
        toolCalls: [
          {
            name: 'request_from_area',
            arguments: { area: 'Dados', title: 'Números', description: 'Vendas.' },
          },
        ],
      },
      { chunks: ['Não consegui.'] },
    ]);
    const { body } = await s.call('POST', '/api/areas/from-template', {
      templateId: 'desenvolvimento',
      name: 'Site',
      modelId: s.modelId,
    });
    const site = areaCreatedSchema.parse(body);
    await s.quietArea('Dados');
    const task = await s.newTask(site.areaId);
    const stopped = await s.until(task.id, (found) => found.task.attention !== null);
    expect(stopped.children).toEqual([]);
    expect(stopped.task.attention).toMatch(/sem passar a tarefa adiante/);
    expect(JSON.stringify(s.provider.requests[1]?.messages)).toContain('não tem permissão');
  });
});
