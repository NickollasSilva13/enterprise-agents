import type { Board, Project, TaskDetail, TaskSummary, Workflow } from '@ea/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { json, makeAgent, renderApp } from '../../test/render';

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
  stages: [
    {
      id: 's1',
      name: 'Desenvolvimento',
      kind: 'agent',
      position: 0,
      agentId: 'a1',
      agentName: 'Dev',
      openTasks: 2,
    },
    {
      id: 's2',
      name: 'Sua revisão',
      kind: 'human',
      position: 1,
      agentId: null,
      agentName: null,
      openTasks: 1,
    },
    {
      id: 's3',
      name: 'Concluído',
      kind: 'done',
      position: 2,
      agentId: null,
      agentName: null,
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

describe('the flow editor (Phase 16, D2)', () => {
  it('saves the stages and moves, forcing "only you" out of your own stages', async () => {
    const { writes } = renderApp('/tarefas/fluxo/p1', {
      '/api/projects': { projects: [area] },
      '/api/agents': { agents: [makeAgent({ id: 'a1', name: 'Dev', projectId: 'p1' })] },
      '/api/areas/p1/workflow': workflow,
      'PUT /api/areas/p1/workflow': workflow,
    });
    const stages = within(await screen.findByRole('region', { name: 'Etapas' }));
    fireEvent.change(stages.getByRole('textbox', { name: 'Etapa 1' }), {
      target: { value: 'Construção' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar fluxo' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]?.body).toEqual({
      stages: [
        { key: 's1', name: 'Construção', kind: 'agent', agentId: 'a1' },
        { key: 's2', name: 'Sua revisão', kind: 'human', agentId: null },
        { key: 's3', name: 'Concluído', kind: 'done', agentId: null },
      ],
      transitions: [
        { from: 's1', to: 's2', actor: 'both' },
        { from: 's2', to: 's3', actor: 'human' },
        { from: 's2', to: 's1', actor: 'human' },
      ],
    });
  });

  it('points out a flow without a final stage before sending anything', async () => {
    const { writes } = renderApp('/tarefas/fluxo/p1', {
      '/api/projects': { projects: [area] },
      '/api/agents': { agents: [] },
      '/api/areas/p1/workflow': workflow,
    });
    const stages = within(await screen.findByRole('region', { name: 'Etapas' }));
    const kinds = stages.getAllByRole('combobox', { name: 'Tipo' });
    fireEvent.change(kinds[2]!, { target: { value: 'human' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar fluxo' }));
    expect((await screen.findByRole('alert')).textContent).toContain(
      'O fluxo precisa de uma etapa final.',
    );
    expect(writes()).toEqual([]);
  });
});
