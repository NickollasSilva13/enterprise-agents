import type { TaskSummary, Workflow, WorkflowStage } from '@ea/shared';

export type TaskMoves =
  | { readonly kind: 'open'; readonly targets: readonly WorkflowStage[] }
  | { readonly kind: 'blocked'; readonly reason: string };

/**
 * Where the user may take a task from the board (Phase 31, D1 and D2): the
 * same rule the server applies to a move, read from the flow the board
 * already has, so a card is never dropped where the server would refuse it.
 */
export function movesOf(workflow: Workflow, task: TaskSummary): TaskMoves {
  if (task.state === 'cancelled') return { kind: 'blocked', reason: 'Esta tarefa foi cancelada.' };
  if (task.state === 'pending') {
    return { kind: 'blocked', reason: 'Aprove o pedido antes de movê-lo.' };
  }
  if (task.working) {
    return {
      kind: 'blocked',
      reason: 'Um agente está trabalhando nesta tarefa. Espere ou interrompa a execução.',
    };
  }
  const reachable = new Set(
    workflow.transitions
      .filter((move) => move.fromStageId === task.stageId && move.actor !== 'agent')
      .map((move) => move.toStageId),
  );
  const targets = workflow.stages.filter((stage) => reachable.has(stage.id));
  return targets.length === 0
    ? { kind: 'blocked', reason: 'O fluxo não tem passagem sua daqui.' }
    : { kind: 'open', targets };
}
