import type { TaskSummary } from '@ea/shared';
import { describe, expect, it } from 'vitest';
import { taskStatus } from './TaskBadges';

const task = (overrides: Partial<TaskSummary>): TaskSummary => ({
  id: 't1',
  areaId: 'p1',
  title: 'Checkout com Pix',
  priority: 'normal',
  state: 'open',
  stageId: 's1',
  stageName: 'Desenvolvimento',
  stageKind: 'agent',
  roleName: 'Desenvolvimento',
  agentId: null,
  agentName: null,
  attention: null,
  working: false,
  queued: true,
  returns: 0,
  runCount: 0,
  parentTaskId: null,
  waitingOn: 0,
  createdAt: '2026-11-24T12:00:00.000Z',
  updatedAt: '2026-11-24T12:00:00.000Z',
  ...overrides,
});

describe('the status of a queued task (Phase 39)', () => {
  it('names the agent it goes back to', () => {
    expect(taskStatus(task({ agentId: 'a1', agentName: 'Rafael' })).label).toBe(
      'Na fila de Rafael',
    );
  });

  // Defect found on the board: "Na fila: todos de Desenvolvimento ocupados"
  // ran past the edge of the card. The label no longer grows with the role name.
  it('waits for the role in a label short enough for the card, whatever the role is called', () => {
    const label = taskStatus(task({ roleName: 'Revisão técnica e de segurança' })).label;
    expect(label).toBe('Na fila: papel ocupado');
  });
});
