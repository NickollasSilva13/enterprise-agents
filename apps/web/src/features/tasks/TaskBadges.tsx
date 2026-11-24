import type { StageKind, TaskSummary } from '@ea/shared';
import { StatusPill } from '../../components/StatusPill';
import type { Tone } from '../../lib/tone';

export const STAGE_KIND_LABEL: Record<StageKind, string> = {
  agent: 'Agente',
  human: 'Você',
  done: 'Final',
};

/** Where the task stands, in one short phrase, with the tone of the app. */
export function taskStatus(task: TaskSummary): { label: string; tone: Tone } {
  if (task.state === 'cancelled') return { label: 'Cancelada', tone: 'idle' };
  if (task.state === 'done') return { label: 'Concluída', tone: 'ok' };
  if (task.state === 'pending') return { label: 'Pedido esperando sua aprovação', tone: 'wait' };
  if (task.attention) return { label: 'Precisa de você', tone: 'wait' };
  if (task.working) return { label: `${task.agentName ?? 'Agente'} trabalhando`, tone: 'ok' };
  if (task.waitingOn > 0) {
    return {
      label:
        task.waitingOn === 1 ? 'Aguardando outra área' : `Aguardando ${task.waitingOn} pedidos`,
      tone: 'idle',
    };
  }
  if (task.queued) {
    // Waits for the agent it goes back to, or for anyone of the role (Phase 39).
    // Short, so the pill fits the narrow board card whatever the role is called.
    return {
      label: task.agentName ? `Na fila de ${task.agentName}` : 'Na fila: papel ocupado',
      tone: 'idle',
    };
  }
  if (task.stageKind === 'human') return { label: 'Esperando você', tone: 'wait' };
  return { label: 'Aguardando', tone: 'idle' };
}

export function TaskStatus({ task }: { task: TaskSummary }) {
  const status = taskStatus(task);
  return (
    <StatusPill tone={status.tone} live={task.working}>
      {status.label}
    </StatusPill>
  );
}

export function PriorityBadge({ task }: { task: TaskSummary }) {
  if (task.priority !== 'high') return null;
  return <StatusPill tone="wait">Alta</StatusPill>;
}
