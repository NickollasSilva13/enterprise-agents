import type { AgentState } from '@ea/shared';

export interface AgentStateStyle {
  readonly label: string;
  /** Tailwind classes for the lamp dot. */
  readonly lamp: string;
  readonly text: string;
}

/** One vocabulary and one colour per state, everywhere in the UI. */
export const AGENT_STATE_STYLES: Record<AgentState, AgentStateStyle> = {
  working: { label: 'Trabalhando', lamp: 'bg-ok animate-lamp', text: 'text-ok' },
  waiting: { label: 'Aguardando você', lamp: 'bg-wait', text: 'text-wait' },
  failed: { label: 'Com falha', lamp: 'bg-fail', text: 'text-fail' },
  idle: { label: 'Ocioso', lamp: 'bg-idle', text: 'text-dim' },
  inactive: { label: 'Inativo', lamp: 'border border-idle bg-transparent', text: 'text-dim' },
};

/** Order used by legends: what needs attention first. */
export const AGENT_STATE_ORDER: readonly AgentState[] = [
  'waiting',
  'failed',
  'working',
  'idle',
  'inactive',
];
