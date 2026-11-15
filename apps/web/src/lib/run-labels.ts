import { ACTIVE_RUN_STATUSES, type RunStatus, type RunStep, type RunSummary } from '@ea/shared';
import { formatCount, formatDuration } from './format';

/** One label and one colour per run status, everywhere in the UI. */
export const RUN_STATUS: Record<RunStatus, { label: string; tone: string }> = {
  queued: { label: 'Na fila', tone: 'text-dim' },
  running: { label: 'Em andamento', tone: 'text-ok' },
  waiting_approval: { label: 'Aguardando aprovação', tone: 'text-wait' },
  completed: { label: 'Concluída', tone: 'text-chalk' },
  failed: { label: 'Falhou', tone: 'text-fail' },
  cancelled: { label: 'Interrompida por você', tone: 'text-dim' },
  timed_out: { label: 'Tempo esgotado', tone: 'text-fail' },
  interrupted: { label: 'Interrompida', tone: 'text-dim' },
};

export const isActiveRun = (status: RunStatus) => ACTIVE_RUN_STATUSES.includes(status);

const END_REASONS: Record<string, string> = {
  completed: 'O agente terminou a resposta.',
  max_tokens: 'A resposta foi cortada no limite de tokens de saída do agente.',
  refusal: 'O modelo se recusou a responder.',
  cancelled_by_user: 'Você interrompeu a execução.',
  time_limit: 'O tempo máximo do agente foi atingido.',
  token_limit: 'O limite de tokens do agente foi atingido.',
  step_limit: 'O limite de passos do agente foi atingido.',
  provider_unreachable: 'O provedor do modelo não respondeu.',
  provider_timeout: 'O provedor do modelo demorou demais.',
  provider_error: 'O provedor do modelo devolveu um erro.',
  not_runnable: 'O agente não podia mais ser executado.',
  shutdown: 'O servidor foi encerrado durante a execução.',
  server_restart: 'O servidor foi reiniciado durante a execução.',
  parent_stopped: 'A execução que delegou esta tarefa foi encerrada.',
  internal_error: 'Ocorreu um erro interno.',
};

/** A sentence for why a run ended; the raw value for a reason this UI does not know. */
export const endReasonText = (reason: string | null) =>
  reason === null ? null : (END_REASONS[reason] ?? reason);

export const totalTokens = (run: Pick<RunSummary, 'inputTokens' | 'outputTokens'>) =>
  run.inputTokens + run.outputTokens;

const asNumber = (value: unknown) => (typeof value === 'number' ? value : null);
const asText = (value: unknown) => (typeof value === 'string' ? value : null);

export interface StepView {
  readonly title: string;
  readonly detail: string | null;
  readonly tone: 'neutral' | 'ok' | 'fail';
}

const STOP_REASONS: Record<string, string> = {
  end: 'resposta completa',
  tool_use: 'pediu ferramentas',
  max_tokens: 'cortada no limite de tokens',
  refusal: 'o modelo se recusou a responder',
};

const DENIAL_REASONS: Record<string, string> = {
  unknown_tool: 'Essa ferramenta não existe',
  not_granted: 'Bloqueada: não foi liberada para este agente',
  denied: 'Bloqueada para este agente',
  tool_disabled: 'Bloqueada: a ferramenta está desligada nesta instalação',
};

const toolLabel = (payload: RunStep['payload']) =>
  `"${asText(payload.toolTitle) ?? asText(payload.tool) ?? 'desconhecida'}"`;

/** Tool arguments on one line, as recorded in the step (long texts arrive cut). */
function argumentsText(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const parts = Object.entries(value).map(
    ([key, item]) => `${key}: ${typeof item === 'string' ? item : JSON.stringify(item)}`,
  );
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** A step of a run in plain language (RF-33). Unknown types are shown by name. */
export function describeStep(step: RunStep): StepView {
  const { payload } = step;
  switch (step.type) {
    case 'run_started': {
      const model = asText(payload.model);
      return {
        title: 'Execução iniciada',
        detail: model ? `Modelo ${model}` : null,
        tone: 'neutral',
      };
    }
    case 'tool_call_requested': {
      const blocked = asText(payload.permission) === 'deny';
      return {
        title: `Pediu a ferramenta ${toolLabel(payload)}`,
        detail: [
          blocked ? (DENIAL_REASONS[asText(payload.reason) ?? ''] ?? 'Bloqueada') : null,
          argumentsText(payload.arguments),
        ]
          .filter(Boolean)
          .join(' · '),
        tone: blocked ? 'fail' : 'neutral',
      };
    }
    case 'approval_requested':
      return {
        title: 'Aguardando a sua aprovação',
        detail: `Para usar ${toolLabel(payload)}`,
        tone: 'neutral',
      };
    case 'approval_decided': {
      const approved = asText(payload.decision) === 'approved';
      const reason = asText(payload.reason);
      return {
        title: approved ? 'Você aprovou' : 'Você negou',
        detail: [toolLabel(payload), reason ? `Motivo: ${reason}` : null]
          .filter(Boolean)
          .join(' · '),
        tone: approved ? 'ok' : 'fail',
      };
    }
    case 'tool_call_finished': {
      const status = asText(payload.status);
      const duration = asNumber(payload.durationMs);
      return {
        title:
          status === 'completed'
            ? `Ferramenta ${toolLabel(payload)} concluída`
            : status === 'denied'
              ? `Ferramenta ${toolLabel(payload)} não executada`
              : `Ferramenta ${toolLabel(payload)} falhou`,
        detail: [duration === null ? null : formatDuration(duration), asText(payload.preview)]
          .filter(Boolean)
          .join(' · '),
        tone: status === 'completed' ? 'ok' : 'fail',
      };
    }
    case 'delegation_started':
      return {
        title: `Delegou uma tarefa a ${asText(payload.agentName) ?? 'outro agente'}`,
        detail: null,
        tone: 'neutral',
      };
    case 'delegation_finished': {
      const status = asText(payload.status) as RunStatus | null;
      return {
        title: `${asText(payload.agentName) ?? 'O outro agente'} devolveu a tarefa`,
        detail: status && status in RUN_STATUS ? RUN_STATUS[status].label : null,
        tone: status === 'completed' ? 'ok' : 'fail',
      };
    }
    case 'model_call_started':
      return {
        title: 'Chamada ao modelo',
        detail: `Passo ${asNumber(payload.step) ?? 1}`,
        tone: 'neutral',
      };
    case 'model_call_finished': {
      const parts = [
        STOP_REASONS[asText(payload.stopReason) ?? ''] ?? null,
        formatDuration(asNumber(payload.durationMs)),
        `${formatCount(asNumber(payload.inputTokens) ?? 0)} tokens de entrada`,
        `${formatCount(asNumber(payload.outputTokens) ?? 0)} de saída`,
      ];
      return {
        title: 'Resposta do modelo',
        detail: parts.filter(Boolean).join(' · '),
        tone: 'ok',
      };
    }
    case 'error':
      return { title: 'Erro', detail: asText(payload.message), tone: 'fail' };
    case 'run_finished': {
      const status = asText(payload.status) as RunStatus | null;
      const label = status && status in RUN_STATUS ? RUN_STATUS[status].label : null;
      const failed = status === 'failed' || status === 'timed_out';
      return {
        title: 'Execução encerrada',
        detail: [label, endReasonText(asText(payload.endReason))].filter(Boolean).join(' · '),
        tone: failed ? 'fail' : status === 'completed' ? 'ok' : 'neutral',
      };
    }
    default:
      return { title: step.type, detail: null, tone: 'neutral' };
  }
}
