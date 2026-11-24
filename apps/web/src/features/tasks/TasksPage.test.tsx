import type { Board, Project, TaskDetail, TaskSummary, Workflow } from '@ea/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { json, renderApp } from '../../test/render';

const area: Project = {
  id: 'p1',
  name: 'Site',
  description: '',
  agentCount: 2,
  createdAt: '2026-11-16T12:00:00.000Z',
  updatedAt: '2026-11-16T12:00:00.000Z',
};

const workflow: Workflow = {
  areaId: 'p1',
  roles: [{ id: 'r1', name: 'Dev', agents: [{ id: 'a1', name: 'Ana', busy: false }] }],
  stages: [
    {
      id: 's1',
      name: 'Desenvolvimento',
      kind: 'agent',
      position: 0,
      roleId: 'r1',
      roleName: 'Dev',
      openTasks: 2,
    },
    {
      id: 's2',
      name: 'Sua revisão',
      kind: 'human',
      position: 1,
      roleId: null,
      roleName: null,
      openTasks: 1,
    },
    {
      id: 's3',
      name: 'Concluído',
      kind: 'done',
      position: 2,
      roleId: null,
      roleName: null,
      openTasks: 0,
    },
  ],
  transitions: [
    { id: 't1', fromStageId: 's1', toStageId: 's2', actor: 'both' },
    { id: 't2', fromStageId: 's2', toStageId: 's3', actor: 'human' },
    { id: 't3', fromStageId: 's2', toStageId: 's1', actor: 'human' },
  ],
};

const task = (overrides: Partial<TaskSummary> & { id: string; title: string }): TaskSummary => ({
  areaId: 'p1',
  priority: 'normal',
  state: 'open',
  stageId: 's1',
  stageName: 'Desenvolvimento',
  stageKind: 'agent',
  roleName: null,
  agentId: 'a1',
  agentName: 'Dev',
  attention: null,
  working: false,
  queued: false,
  returns: 0,
  runCount: 1,
  parentTaskId: null,
  waitingOn: 0,
  createdAt: '2026-11-16T12:00:00.000Z',
  updatedAt: '2026-11-16T12:00:00.000Z',
  ...overrides,
});

const board: Board = {
  area: { id: 'p1', name: 'Site' },
  workflow,
  tasks: [
    task({ id: 'k1', title: 'Formulário de contato', working: true, priority: 'high' }),
    task({ id: 'k2', title: 'Rodapé', queued: true }),
    task({
      id: 'k3',
      title: 'Página inicial',
      stageId: 's2',
      stageName: 'Sua revisão',
      stageKind: 'human',
      roleName: null,
      agentId: null,
      agentName: null,
    }),
  ],
};

const detail: TaskDetail = {
  task: {
    ...board.tasks[2]!,
    areaName: 'Site',
    description: 'Criar a página inicial.',
    acceptance: '- Tem um título.',
  },
  events: [
    {
      id: 'e1',
      kind: 'moved',
      actor: 'agent',
      agentId: 'a1',
      agentName: 'Dev',
      runId: 'r1',
      relatedTaskId: null,
      fromStageName: 'Desenvolvimento',
      toStageName: 'Sua revisão',
      text: 'Pronto. <script>alert(1)</script> **feito**',
      createdAt: '2026-11-16T12:05:00.000Z',
    },
  ],
  moves: [
    { stageId: 's1', stageName: 'Desenvolvimento' },
    { stageId: 's3', stageName: 'Concluído' },
  ],
  parent: null,
  children: [],
  requestTargets: [],
  schedule: null,
};

describe('the board (Phase 16)', () => {
  it('shows a column per stage, with who works it and where each task stands', async () => {
    renderApp('/tarefas', { '/api/projects': { projects: [area] }, '/api/areas/p1/board': board });

    const dev = within(await screen.findByRole('region', { name: 'Desenvolvimento' }));
    expect(dev.getByText(/Dev · 2 tarefas/)).toBeTruthy();
    expect(dev.getByText('Dev trabalhando')).toBeTruthy();
    expect(dev.getByText('Na fila de Dev')).toBeTruthy();
    expect(dev.getByText('Alta')).toBeTruthy();

    const review = within(screen.getByRole('region', { name: 'Sua revisão' }));
    expect(review.getByText('Esperando você')).toBeTruthy();
    expect(review.getByRole('link', { name: /Página inicial/ }).getAttribute('href')).toBe(
      '/tarefas/k3',
    );
  });

  it('opens the new task form from the office quick action (Phase 29)', async () => {
    renderApp('/tarefas?nova=1', {
      '/api/projects': { projects: [area] },
      '/api/areas/p1/board': board,
    });
    expect(await screen.findByRole('dialog', { name: 'Nova tarefa' })).toBeTruthy();
  });

  it('creates a task in the area', async () => {
    const { writes } = renderApp('/tarefas', {
      '/api/projects': { projects: [area] },
      '/api/areas/p1/board': board,
      'POST /api/areas/p1/tasks': () => json(201, task({ id: 'k9', title: 'Nova página' })),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Nova tarefa' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Nova tarefa' }));
    fireEvent.change(dialog.getByRole('textbox', { name: 'Título' }), {
      target: { value: 'Nova página' },
    });
    fireEvent.change(dialog.getByRole('textbox', { name: 'Critérios de aceite' }), {
      target: { value: '- Abre.' },
    });
    fireEvent.click(dialog.getByRole('button', { name: 'Criar tarefa' }));
    await waitFor(() =>
      expect(writes()).toEqual([
        {
          method: 'POST',
          url: '/api/areas/p1/tasks',
          body: {
            title: 'Nova página',
            description: '',
            acceptance: '- Abre.',
            priority: 'normal',
          },
        },
      ]),
    );
  });

  it('moves a task from its card, after the user confirms (Phase 31, D2)', async () => {
    const { writes } = renderApp('/tarefas', {
      '/api/projects': { projects: [area] },
      '/api/areas/p1/board': board,
      'POST /api/tasks/k3/move': task({ id: 'k3', title: 'Página inicial', state: 'done' }),
    });
    // A task an agent is working on has no way out from the board.
    await screen.findByRole('region', { name: 'Desenvolvimento' });
    expect(screen.queryByRole('button', { name: /Mover "Formulário de contato"/ })).toBeNull();

    fireEvent.click(
      screen.getByRole('button', { name: 'Mover "Página inicial" para outra etapa' }),
    );
    const dialog = within(screen.getByRole('dialog', { name: 'Mover "Página inicial"' }));
    const options = dialog.getAllByRole('option').map((option) => option.textContent);
    expect(options).toEqual(['Desenvolvimento', 'Concluído']);
    expect(writes()).toEqual([]);

    fireEvent.change(dialog.getByRole('combobox', { name: 'Para a etapa' }), {
      target: { value: 's3' },
    });
    fireEvent.change(dialog.getByRole('textbox', { name: 'Nota para quem vem depois' }), {
      target: { value: 'Aprovado.' },
    });
    fireEvent.click(dialog.getByRole('button', { name: 'Mover' }));
    await waitFor(() =>
      expect(writes()).toEqual([
        { method: 'POST', url: '/api/tasks/k3/move', body: { toStageId: 's3', note: 'Aprovado.' } },
      ]),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('lets a card be dropped only where the flow allows (Phase 31, D1)', async () => {
    const { writes } = renderApp('/tarefas', {
      '/api/projects': { projects: [area] },
      '/api/areas/p1/board': board,
      'POST /api/tasks/k2/move': task({ id: 'k2', title: 'Rodapé', stageId: 's2' }),
    });
    const dev = await screen.findByRole('region', { name: 'Desenvolvimento' });
    const card = (title: string) => within(dev).getByText(title).closest('li')!;
    const column = (name: string) => screen.getByRole('region', { name });
    const dataTransfer = { setData: () => undefined, effectAllowed: '', dropEffect: '' };

    // Working on it: the card does not leave.
    expect(card('Formulário de contato').getAttribute('draggable')).toBe('false');

    fireEvent.dragStart(card('Rodapé'), { dataTransfer });
    expect(column('Sua revisão').dataset.accepts).toBe('true');
    expect(column('Concluído').dataset.accepts).toBe('false');

    // Dropped where the flow does not go: nothing happens.
    fireEvent.drop(column('Concluído'), { dataTransfer });
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.dragStart(card('Rodapé'), { dataTransfer });
    fireEvent.drop(column('Sua revisão'), { dataTransfer });
    const dialog = within(screen.getByRole('dialog', { name: 'Mover "Rodapé"' }));
    expect(dialog.getByRole<HTMLSelectElement>('combobox', { name: 'Para a etapa' }).value).toBe(
      's2',
    );
    // Nothing moves before the confirmation: a slip of the mouse delivers nothing.
    expect(writes()).toEqual([]);
    expect(column('Sua revisão').dataset.accepts).toBeUndefined();
    fireEvent.click(dialog.getByRole('button', { name: 'Mover' }));
    await waitFor(() =>
      expect(writes()).toEqual([
        { method: 'POST', url: '/api/tasks/k2/move', body: { toStageId: 's2', note: '' } },
      ]),
    );
  });

  it('invites the user to build a flow when the area has none', async () => {
    renderApp('/tarefas', {
      '/api/projects': { projects: [area] },
      '/api/areas/p1/board': {
        ...board,
        workflow: { ...workflow, stages: [], transitions: [] },
        tasks: [],
      },
    });
    expect(await screen.findByText('Esta área ainda não tem fluxo.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Montar o fluxo' }).getAttribute('href')).toBe(
      '/tarefas/fluxo/p1',
    );
  });
});

describe('a task (Phase 16)', () => {
  it('shows the history as safe Markdown and lets the user move it on', async () => {
    const { writes } = renderApp('/tarefas/k3', {
      '/api/tasks/k3': detail,
      'POST /api/tasks/k3/move': task({ id: 'k3', title: 'Página inicial', state: 'done' }),
    });
    const history = within(await screen.findByRole('list', { name: 'Histórico da tarefa' }));
    expect(history.getByText(/passou de "Desenvolvimento" para "Sua revisão"/)).toBeTruthy();
    // What a model wrote never becomes HTML.
    expect(document.querySelector('script')).toBeNull();
    expect(history.getByText('feito').tagName).toBe('STRONG');

    const panel = within(screen.getByRole('region', { name: 'Mover' }));
    fireEvent.change(panel.getByRole('combobox', { name: 'Para a etapa' }), {
      target: { value: 's3' },
    });
    fireEvent.change(panel.getByRole('textbox', { name: 'Nota para quem vem depois' }), {
      target: { value: 'Aprovado.' },
    });
    fireEvent.click(panel.getByRole('button', { name: 'Mover' }));
    await waitFor(() =>
      expect(writes()).toEqual([
        { method: 'POST', url: '/api/tasks/k3/move', body: { toStageId: 's3', note: 'Aprovado.' } },
      ]),
    );
  });

  it('says why a stopped task waits and lets the user resume it', async () => {
    const stopped: TaskDetail = {
      ...detail,
      task: {
        ...detail.task,
        stageId: 's1',
        stageName: 'Desenvolvimento',
        stageKind: 'agent',
        roleName: null,
        attention: 'O agente terminou sem passar a tarefa adiante.',
      },
    };
    const { writes } = renderApp('/tarefas/k3', {
      '/api/tasks/k3': stopped,
      'POST /api/tasks/k3/resume': task({ id: 'k3', title: 'Página inicial' }),
    });
    expect(await screen.findByText('O agente terminou sem passar a tarefa adiante.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retomar' }));
    await waitFor(() =>
      expect(writes()).toMatchObject([{ method: 'POST', url: '/api/tasks/k3/resume' }]),
    );
  });
});

describe('the flow editor, drawn (Phase 16, D2; Phase 39, D5)', () => {
  const editor = (extra: Record<string, unknown> = {}) =>
    renderApp('/tarefas/fluxo/p1', {
      '/api/projects': { projects: [area] },
      '/api/areas/p1/workflow': workflow,
      ...extra,
    });

  it('edits a stage picked in the drawing and saves the flow with its roles', async () => {
    const { writes } = editor({ 'PUT /api/areas/p1/workflow': workflow });
    const drawing = within(await screen.findByRole('region', { name: 'Desenho do fluxo' }));
    fireEvent.click(drawing.getByRole('button', { name: /^Desenvolvimento: Dev, 1 agente/ }));
    const panel = within(screen.getByRole('region', { name: 'Etapa: Desenvolvimento' }));
    fireEvent.change(panel.getByRole('textbox', { name: 'Nome da etapa' }), {
      target: { value: 'Construção' },
    });
    expect(panel.getByText('Ana · livre')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar fluxo' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]?.body).toEqual({
      roles: [{ key: 'r1', name: 'Dev' }],
      stages: [
        { key: 's1', name: 'Construção', kind: 'agent', roleKey: 'r1' },
        { key: 's2', name: 'Sua revisão', kind: 'human', roleKey: null },
        { key: 's3', name: 'Concluído', kind: 'done', roleKey: null },
      ],
      transitions: [
        { from: 's1', to: 's2', actor: 'both' },
        { from: 's2', to: 's3', actor: 'human' },
        { from: 's2', to: 's1', actor: 'human' },
      ],
    });
  });

  it('tells the flow in words and walks a pretend task through it', async () => {
    editor();
    const words = within(await screen.findByRole('region', { name: 'Em palavras' }));
    expect(
      words.getByText(
        'Uma tarefa nova chega em Desenvolvimento, onde trabalha Ana (Dev). Daqui segue para Sua revisão (o agente ou você levam).',
      ),
    ).toBeTruthy();
    expect(
      words.getByText(
        'Em Sua revisão, onde a tarefa espera a sua decisão. Daqui segue para Concluído (só você leva); ou volta para Desenvolvimento (só você leva).',
      ),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Simular uma tarefa' }));
    const simulation = within(screen.getByRole('region', { name: 'Simulação' }));
    fireEvent.click(simulation.getByRole('button', { name: 'Passar para Sua revisão' }));
    fireEvent.click(simulation.getByRole('button', { name: 'Devolver para Desenvolvimento' }));
    fireEvent.click(simulation.getByRole('button', { name: 'Passar para Sua revisão' }));
    fireEvent.click(simulation.getByRole('button', { name: 'Passar para Concluído' }));
    expect(simulation.getByText('Concluída em 4 passagem(ns).')).toBeTruthy();
    expect(
      within(simulation.getByRole('list', { name: 'Passos da simulação' }))
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      'A tarefa chega em Desenvolvimento: Ana (Dev).',
      'Passa para Sua revisão: você decide.',
      'Devolvida para Desenvolvimento: Ana (Dev).',
      'Passa para Sua revisão: você decide.',
      'Passa para Concluído: a tarefa termina.',
    ]);
  });

  it('points out what would stop tasks: a role nobody has, a stage with no way out', async () => {
    editor({
      '/api/areas/p1/workflow': {
        ...workflow,
        roles: [{ id: 'r1', name: 'Dev', agents: [] }],
      },
    });
    expect(
      await screen.findByText(
        'Ninguém tem o papel Dev, de Desenvolvimento: dê esse papel a um agente da equipe.',
      ),
    ).toBeTruthy();
    // Removing the only way out of the review is pointed out too.
    const drawing = within(screen.getByRole('region', { name: 'Desenho do fluxo' }));
    fireEvent.click(drawing.getByRole('button', { name: /^Sua revisão/ }));
    const panel = within(screen.getByRole('region', { name: 'Etapa: Sua revisão' }));
    for (const button of panel.getAllByRole('button', { name: /Remover a passagem/ })) {
      fireEvent.click(button);
    }
    expect(
      screen.getByText('Sua revisão não tem saída: uma tarefa que chega lá não anda mais.'),
    ).toBeTruthy();
  });

  it('points out a flow without a final stage before sending anything', async () => {
    const { writes } = editor();
    const drawing = within(await screen.findByRole('region', { name: 'Desenho do fluxo' }));
    fireEvent.click(drawing.getByRole('button', { name: /^Concluído/ }));
    fireEvent.click(screen.getByRole('radio', { name: /^Você/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar fluxo' }));
    expect((await screen.findByRole('alert')).textContent).toContain(
      'O fluxo precisa de uma etapa final.',
    );
    expect(writes()).toEqual([]);
  });

  it('adds a stage before the end, linked in, and a role for it', async () => {
    const { writes } = editor({ 'PUT /api/areas/p1/workflow': workflow });
    fireEvent.click(await screen.findByRole('button', { name: 'Etapa' }));
    const panel = within(screen.getByRole('region', { name: 'Etapa: Etapa 4' }));
    fireEvent.click(panel.getByRole('button', { name: 'Novo papel para esta etapa' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar fluxo' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    const body = writes()[0]?.body as {
      roles: { key: string; name: string }[];
      stages: { name: string; roleKey: string | null }[];
      transitions: { from: string; to: string }[];
    };
    expect(body.roles.map((role) => role.name)).toEqual(['Dev', 'Etapa 4']);
    expect(body.stages.map((stage) => stage.name)).toEqual([
      'Desenvolvimento',
      'Sua revisão',
      'Etapa 4',
      'Concluído',
    ]);
    expect(body.stages[2]?.roleKey).toBe(body.roles[1]?.key);
  });
});
