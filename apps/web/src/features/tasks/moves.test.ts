import type { TaskSummary, Workflow } from '@ea/shared';
import { describe, expect, it } from 'vitest';
import { movesOf } from './moves';

const stage = (id: string, name: string) => ({
  id,
  name,
  kind: 'agent' as const,
  position: 0,
  roleId: null,
  roleName: null,
  openTasks: 0,
});

const workflow: Workflow = {
  areaId: 'p1',
  roles: [],
  stages: [stage('s1', 'Desenvolvimento'), stage('s2', 'Revisão'), stage('s3', 'Concluído')],
  transitions: [
    { id: 't1', fromStageId: 's1', toStageId: 's2', actor: 'both' },
    { id: 't2', fromStageId: 's1', toStageId: 's3', actor: 'agent' },
    { id: 't3', fromStageId: 's2', toStageId: 's3', actor: 'human' },
    { id: 't4', fromStageId: 's2', toStageId: 's1', actor: 'human' },
  ],
};

const task = (overrides: Partial<TaskSummary> = {}): TaskSummary => ({
  id: 'k1',
  areaId: 'p1',
  title: 'Contato',
  priority: 'normal',
  state: 'open',
  stageId: 's1',
  stageName: 'Desenvolvimento',
  stageKind: 'agent',
  roleName: null,
  agentId: null,
  agentName: null,
  attention: null,
  working: false,
  queued: false,
  returns: 0,
  runCount: 0,
  parentTaskId: null,
  waitingOn: 0,
  createdAt: '2026-11-20T12:00:00.000Z',
  updatedAt: '2026-11-20T12:00:00.000Z',
  ...overrides,
});

const targetNames = (moves: ReturnType<typeof movesOf>) =>
  moves.kind === 'open' ? moves.targets.map((target) => target.name) : moves.reason;

describe('movesOf (Phase 31, D1)', () => {
  it('offers the stages the flow lets the user reach, in the order of the flow', () => {
    // "agent only" passages are not the user's.
    expect(targetNames(movesOf(workflow, task()))).toEqual(['Revisão']);
    expect(targetNames(movesOf(workflow, task({ stageId: 's2' })))).toEqual([
      'Desenvolvimento',
      'Concluído',
    ]);
  });

  it('keeps in place what the server would refuse to move, and says why', () => {
    expect(targetNames(movesOf(workflow, task({ working: true })))).toMatch(/trabalhando/);
    expect(targetNames(movesOf(workflow, task({ state: 'pending' })))).toMatch(/Aprove o pedido/);
    expect(targetNames(movesOf(workflow, task({ state: 'cancelled' })))).toMatch(/cancelada/);
    expect(targetNames(movesOf(workflow, task({ stageId: 's3' })))).toBe(
      'O fluxo não tem passagem sua daqui.',
    );
  });
});
