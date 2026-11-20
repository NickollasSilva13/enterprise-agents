import type { ActivityEntry, OfficeAgent } from '@ea/shared';
import type { Activity } from '../../components/ActivityFeed';
import { formatDuration } from '../../lib/format';

// What the office's side column says (Phase 29): the sentence of each entry
// of the recent activity, and the facts under each agent's card.

const quoted = (text: string) => `“${text}”`;

/** One entry of `/api/activity` as a line of the feed: what happened and where to see it. */
export function activityOf(entry: ActivityEntry): Activity {
  switch (entry.kind) {
    case 'task_done':
      return {
        id: entry.id,
        kind: 'task',
        at: entry.at,
        text: entry.agentName
          ? `${entry.agentName} concluiu ${quoted(entry.title)} em ${entry.areaName}`
          : `${quoted(entry.title)} foi concluída em ${entry.areaName}`,
        to: `/tarefas/${entry.taskId}`,
      };
    case 'delivery':
      return {
        id: entry.id,
        kind: 'delivery',
        at: entry.at,
        text: `${entry.fromArea} entregou ${quoted(entry.title)} a ${entry.toArea}`,
        to: `/tarefas/${entry.taskId}`,
      };
    case 'scheduled':
      return {
        id: entry.id,
        kind: 'schedule',
        at: entry.at,
        text: `Um agendamento criou ${quoted(entry.title)} em ${entry.areaName}`,
        to: `/tarefas/${entry.taskId}`,
      };
    case 'approval': {
      const tool = quoted(entry.toolTitle);
      const said = {
        pending: `${entry.agentName} pede para usar ${tool}`,
        approved: `Você aprovou ${tool} para ${entry.agentName}`,
        denied: `Você negou ${tool} a ${entry.agentName}`,
        cancelled: `O pedido de ${entry.agentName} para usar ${tool} foi retirado`,
      }[entry.status];
      return {
        id: entry.id,
        kind: 'approval',
        at: entry.at,
        text: said,
        to: '/aprovacoes',
      };
    }
    case 'failure':
      return {
        id: entry.id,
        kind: 'failure',
        at: entry.at,
        text: entry.taskTitle
          ? `${entry.agentName} falhou em ${quoted(entry.taskTitle)}`
          : `A execução de ${entry.agentName} falhou`,
        to: `/logs/${entry.runId}`,
      };
  }
}

/**
 * The facts under a working agent's card (D4): the step it is on out of its
 * limit, and for how long; never a percentage, which a model cannot know.
 */
export function runFacts(agent: OfficeAgent, now: number): string | undefined {
  const run = agent.currentRun;
  if (!run) return undefined;
  if (run.status === 'queued' || run.startedAt === null) return 'Na fila';
  const elapsed = Math.max(0, now - Date.parse(run.startedAt));
  return `passo ${Math.max(1, run.steps)} de até ${run.maxSteps} · ${formatDuration(elapsed)}`;
}

/** Who needs the user comes first, then who failed, who works, who is idle, who is off (D2). */
const URGENCY: Record<OfficeAgent['state'], number> = {
  waiting: 0,
  failed: 1,
  working: 2,
  idle: 3,
  inactive: 4,
};

export function byUrgency(agents: readonly OfficeAgent[]): OfficeAgent[] {
  return [...agents].sort(
    (a, b) => URGENCY[a.state] - URGENCY[b.state] || a.name.localeCompare(b.name, 'pt-BR'),
  );
}
