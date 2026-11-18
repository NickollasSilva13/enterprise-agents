import type { StageKind, TaskSummary } from '@ea/shared';

export const STAGE_KIND_LABEL: Record<StageKind, string> = {
  agent: 'Agente',
  human: 'Você',
  done: 'Final',
};

/** Where the task stands, in one short phrase, with the tone of the app. */
export function taskStatus(task: TaskSummary): { label: string; tone: string } {
  if (task.state === 'cancelled') return { label: 'Cancelada', tone: 'text-dim' };
  if (task.state === 'done') return { label: 'Concluída', tone: 'text-ok' };
  if (task.state === 'pending')
    return { label: 'Pedido esperando sua aprovação', tone: 'text-wait' };
  if (task.attention) return { label: 'Precisa de você', tone: 'text-wait' };
  if (task.working) return { label: `${task.agentName ?? 'Agente'} trabalhando`, tone: 'text-ok' };
  if (task.waitingOn > 0) {
    return {
      label:
        task.waitingOn === 1 ? 'Aguardando outra área' : `Aguardando ${task.waitingOn} pedidos`,
      tone: 'text-dim',
    };
  }
  if (task.queued) return { label: `Na fila de ${task.agentName ?? 'agente'}`, tone: 'text-dim' };
  if (task.stageKind === 'human') return { label: 'Esperando você', tone: 'text-wait' };
  return { label: 'Aguardando', tone: 'text-dim' };
}

export function TaskStatus({ task }: { task: TaskSummary }) {
  const status = taskStatus(task);
  return <span className={`text-sm ${status.tone}`}>{status.label}</span>;
}

export function PriorityBadge({ task }: { task: TaskSummary }) {
  if (task.priority !== 'high') return null;
  return (
    <span className="rounded border border-wait/60 px-1.5 py-0.5 text-xs font-semibold text-wait">
      Alta
    </span>
  );
}
