// Teams and roles (Phase 39): a stage is worked by a role, every agent of the
// role can take its tasks, a task sent back goes to whoever worked on it, and
// the agent form can make a team from a template and put an agent in a role.
// Through the API and the real RunManager, with the in-process FakeProvider.
import {
  agentExportSchema,
  agentImportResultSchema,
  agentSchema,
  areaCreatedSchema,
  type TaskDetail,
  taskDetailSchema,
  taskSummarySchema,
  teamListSchema,
  workflowSchema,
} from '@ea/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { FakeProvider, type FakeTurn, waitFor } from './fake-provider';
import { addAgent, addModel, addProject, addProvider } from './fixtures';
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
  return {
    ...test,
    provider,
    modelId,
    call,
    detail,
    until: (taskId: string, done: (found: TaskDetail) => boolean) =>
      waitFor(async () => {
        const found = await detail(taskId);
        return done(found) ? found : null;
      }),
    /**
     * An area whose flow is "Desenvolvimento" (the role Dev, with the agents
     * given) then "Revisão" (the user's), which can send it back, then "Fim".
     */
    devTeam: async (agentNames: string[]) => {
      const areaId = addProject(test.database, 'Site');
      const saved = await call('PUT', `/api/areas/${areaId}/workflow`, {
        roles: [{ key: 'dev', name: 'Dev' }],
        stages: [
          { key: 'd', name: 'Desenvolvimento', kind: 'agent', roleKey: 'dev' },
          { key: 'r', name: 'Revisão', kind: 'human', roleKey: null },
          { key: 'f', name: 'Fim', kind: 'done', roleKey: null },
        ],
        transitions: [
          { from: 'd', to: 'r', actor: 'agent' },
          { from: 'r', to: 'd', actor: 'human' },
          { from: 'r', to: 'f', actor: 'human' },
        ],
      });
      expect(saved.status, JSON.stringify(saved.body)).toBe(200);
      const workflow = workflowSchema.parse(saved.body);
      const roleId = workflow.roles[0]!.id;
      const agentIds: string[] = [];
      for (const name of agentNames) {
        const id = addAgent(test.database, { name, projectId: areaId, modelId });
        const joined = await call('PATCH', `/api/agents/${id}`, { roleId });
        expect(joined.status, JSON.stringify(joined.body)).toBe(200);
        agentIds.push(id);
      }
      const stage = (name: string) => workflow.stages.find((entry) => entry.name === name)!;
      return { areaId, roleId, agentIds, stage };
    },
    newTask: async (areaId: string, title: string) => {
      const { status, body } = await call('POST', `/api/areas/${areaId}/tasks`, { title });
      expect(status, JSON.stringify(body)).toBe(201);
      return taskSummarySchema.parse(body);
    },
  };
}

const passes = (stage: string, note: string): FakeTurn[] => [
  { toolCalls: [{ name: 'move_task', arguments: { stage, note } }] },
  { chunks: ['Feito.'] },
];

describe('a stage worked by a role (D3)', () => {
  it('gives tasks to every free agent of the role at the same time', async () => {
    const s = await setup([{ hang: true }, { hang: true }]);
    const team = await s.devTeam(['Dev 1', 'Dev 2']);
    const first = await s.newTask(team.areaId, 'Página de contato');
    const second = await s.newTask(team.areaId, 'Página de preços');

    const a = await s.until(first.id, (found) => found.task.working);
    const b = await s.until(second.id, (found) => found.task.working);
    expect(new Set([a.task.agentName, b.task.agentName])).toEqual(new Set(['Dev 1', 'Dev 2']));
    expect(a.task.roleName).toBe('Dev');

    // A third task waits: everyone of the role is busy.
    const third = await s.newTask(team.areaId, 'Página de equipe');
    const waiting = await s.detail(third.id);
    expect(waiting.task).toMatchObject({ working: false, queued: true, agentName: null });

    const workflow = workflowSchema.parse(
      (await s.call('GET', `/api/areas/${team.areaId}/workflow`)).body,
    );
    expect(workflow.roles[0]?.agents.every((agent) => agent.busy)).toBe(true);
    for (const task of [first, second, third]) await s.call('POST', `/api/tasks/${task.id}/cancel`);
  });

  it('sends a task back to the agent who worked on it, and waits for it while busy', async () => {
    const s = await setup([...passes('Revisão', 'Pronto para revisar.'), { hang: true }]);
    const team = await s.devTeam(['Dev 1', 'Dev 2']);
    const first = await s.newTask(team.areaId, 'Página de contato');
    const reviewed = await s.until(first.id, (found) => found.task.stageName === 'Revisão');
    expect(reviewed.events.find((event) => event.kind === 'run_started')?.agentName).toBe('Dev 1');

    // Dev 1 takes the next task and hangs on it.
    const second = await s.newTask(team.areaId, 'Página de preços');
    await s.until(second.id, (found) => found.task.working && found.task.agentName === 'Dev 1');

    // Sent back, the first task waits for Dev 1, though Dev 2 is free.
    const back = await s.call('POST', `/api/tasks/${first.id}/move`, {
      toStageId: team.stage('Desenvolvimento').id,
      note: 'Faltou o botão.',
    });
    expect(back.status, JSON.stringify(back.body)).toBe(200);
    const waiting = await s.detail(first.id);
    expect(waiting.task).toMatchObject({
      working: false,
      queued: true,
      agentName: 'Dev 1',
      stageName: 'Desenvolvimento',
    });
    expect(s.provider.requests).toHaveLength(3);
    for (const task of [first, second]) await s.call('POST', `/api/tasks/${task.id}/cancel`);
  });

  it('stops a task whose role has nobody, and lets only agents of the role move it', async () => {
    const s = await setup([
      { toolCalls: [{ name: 'move_task', arguments: { stage: 'Revisão', note: 'x' } }] },
      { chunks: ['Ok.'] },
    ]);
    const team = await s.devTeam([]);
    const task = await s.newTask(team.areaId, 'Página de contato');
    const stopped = await s.detail(task.id);
    expect(stopped.task.attention).toContain('Nenhum agente da equipe tem o papel "Dev"');

    // Someone joins the role: the task goes on when the user resumes it.
    const dev = addAgent(s.database, { name: 'Dev 1', projectId: team.areaId, modelId: s.modelId });
    await s.call('PATCH', `/api/agents/${dev}`, { roleId: team.roleId });
    await s.call('POST', `/api/tasks/${task.id}/resume`);
    const moved = await s.until(task.id, (found) => found.task.stageName === 'Revisão');
    expect(
      moved.events.some((event) => event.kind === 'moved' && event.agentName === 'Dev 1'),
    ).toBe(true);
  });
});

describe('roles of a team', () => {
  it('belong to the agent area: another area role is refused, and moving away drops it', async () => {
    const s = await setup();
    const team = await s.devTeam(['Dev 1']);
    const other = addProject(s.database, 'Loja');
    const stranger = addAgent(s.database, { name: 'De fora', projectId: other });
    const refused = await s.call('PATCH', `/api/agents/${stranger}`, { roleId: team.roleId });
    expect(refused.status).toBe(400);
    const created = await s.call('POST', '/api/agents', {
      name: 'Dev 2',
      projectId: other,
      roleId: team.roleId,
    });
    expect(created.status).toBe(400);
    const joined = agentSchema.parse(
      (
        await s.call('POST', '/api/agents', {
          name: 'Dev 2',
          projectId: team.areaId,
          roleId: team.roleId,
        })
      ).body,
    );
    expect(joined).toMatchObject({ roleId: team.roleId, roleName: 'Dev' });

    // Moving to another area leaves the role behind.
    const moved = agentSchema.parse(
      (await s.call('PATCH', `/api/agents/${joined.id}`, { projectId: other })).body,
    );
    expect(moved.roleId).toBeNull();
    // A copy takes the same role.
    const copy = agentSchema.parse(
      (await s.call('POST', `/api/agents/${team.agentIds[0]}/duplicate`)).body,
    );
    expect(copy.roleName).toBe('Dev');
  });

  it('are renamed and removed with the flow; a removed role leaves its agents without one', async () => {
    const s = await setup();
    const team = await s.devTeam(['Dev 1']);
    const renamed = workflowSchema.parse(
      (
        await s.call('PUT', `/api/areas/${team.areaId}/workflow`, {
          roles: [
            { key: team.roleId, name: 'Programação' },
            { key: 'novo', name: 'Design' },
          ],
          stages: [
            { key: 'd', name: 'Desenvolvimento', kind: 'agent', roleKey: team.roleId },
            { key: 'f', name: 'Fim', kind: 'done', roleKey: null },
          ],
          transitions: [{ from: 'd', to: 'f', actor: 'both' }],
        })
      ).body,
    );
    expect(
      renamed.roles.map((role) => [role.name, role.agents.map((agent) => agent.name)]),
    ).toEqual([
      ['Programação', ['Dev 1']],
      ['Design', []],
    ]);
    expect(renamed.stages[0]).toMatchObject({ roleId: team.roleId, roleName: 'Programação' });

    const repeated = await s.call('PUT', `/api/areas/${team.areaId}/workflow`, {
      roles: [
        { key: 'a', name: 'Dev' },
        { key: 'b', name: 'dev' },
      ],
      stages: [
        { key: 'd', name: 'Desenvolvimento', kind: 'human', roleKey: null },
        { key: 'f', name: 'Fim', kind: 'done', roleKey: null },
      ],
      transitions: [],
    });
    expect(repeated.status).toBe(400);

    await s.call('PUT', `/api/areas/${team.areaId}/workflow`, {
      roles: [],
      stages: [
        { key: 'd', name: 'Desenvolvimento', kind: 'human', roleKey: null },
        { key: 'f', name: 'Fim', kind: 'done', roleKey: null },
      ],
      transitions: [],
    });
    const agent = agentSchema.parse((await s.call('GET', `/api/agents/${team.agentIds[0]}`)).body);
    expect(agent).toMatchObject({ roleId: null, projectId: team.areaId });
  });

  it('go with the agent to a file by name, and come back into the same team', async () => {
    const s = await setup();
    const team = await s.devTeam(['Dev 1']);
    const file = agentExportSchema.parse(
      (await s.call('GET', `/api/agents/export?ids=${team.agentIds[0]}`)).body,
    );
    expect(file.agents[0]).toMatchObject({ project: 'Site', role: 'Dev' });
    const result = agentImportResultSchema.parse(
      (await s.call('POST', '/api/agents/import', file)).body,
    );
    const imported = agentSchema.parse(
      (await s.call('GET', `/api/agents/${result.imported[0]!.id}`)).body,
    );
    expect(imported).toMatchObject({ projectId: team.areaId, roleId: team.roleId });
  });
});

describe('teams from a template (D1, D2)', () => {
  it('creates only the team for an agent to join, and lists teams with their roles', async () => {
    const s = await setup();
    const withoutModel = await s.call('POST', '/api/areas/from-template', {
      templateId: 'desenvolvimento',
      name: 'Site',
    });
    expect(withoutModel.status).toBe(400);

    const created = areaCreatedSchema.parse(
      (
        await s.call('POST', '/api/areas/from-template', {
          templateId: 'desenvolvimento',
          name: 'Site',
          withAgents: false,
        })
      ).body,
    );
    expect(created.agentIds).toEqual([]);
    expect(created.roles.map((role) => role.key)).toEqual(['produto', 'desenvolvimento', 'testes']);

    const dev = created.roles.find((role) => role.key === 'desenvolvimento')!.id;
    const joined = await s.call('POST', '/api/agents', {
      name: 'Dev 1',
      projectId: created.areaId,
      roleId: dev,
    });
    expect(joined.status, JSON.stringify(joined.body)).toBe(201);

    const teams = teamListSchema.parse((await s.call('GET', '/api/teams')).body).teams;
    expect(teams).toEqual([
      {
        areaId: created.areaId,
        areaName: 'Site',
        templateId: 'desenvolvimento',
        templateName: 'Desenvolvimento',
        roles: [
          { id: created.roles[0]!.id, name: 'Produto', agents: [], stages: ['Refinamento'] },
          {
            id: dev,
            name: 'Desenvolvimento',
            agents: [{ id: expect.any(String) as string, name: 'Dev 1' }],
            stages: ['Desenvolvimento'],
          },
          { id: created.roles[2]!.id, name: 'Testes', agents: [], stages: ['Testes'] },
        ],
      },
    ]);

    // The flow of the template points to the roles.
    const workflow = workflowSchema.parse(
      (await s.call('GET', `/api/areas/${created.areaId}/workflow`)).body,
    );
    expect(workflow.stages.map((stage) => stage.roleName)).toEqual([
      'Produto',
      'Desenvolvimento',
      'Testes',
      null,
      null,
    ]);
  });
});
