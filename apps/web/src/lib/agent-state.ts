import type { AgentState } from '@ea/shared';
import type { Tone } from './tone';

export interface AgentStateStyle {
  readonly label: string;
  /** Tailwind classes for the lamp dot. */
  readonly lamp: string;
  readonly text: string;
  /** The same state in the visual system's tones (Phase 20). */
  readonly tone: Tone;
}

/** One vocabulary and one colour per state, everywhere in the UI. */
export const AGENT_STATE_STYLES: Record<AgentState, AgentStateStyle> = {
  working: { label: 'Trabalhando', lamp: 'bg-ok animate-lamp', text: 'text-ok', tone: 'ok' },
  waiting: { label: 'Aguardando você', lamp: 'bg-wait', text: 'text-wait', tone: 'wait' },
  failed: { label: 'Com falha', lamp: 'bg-fail', text: 'text-fail', tone: 'fail' },
  idle: { label: 'Ocioso', lamp: 'bg-idle', text: 'text-dim', tone: 'idle' },
  inactive: {
    label: 'Inativo',
    lamp: 'border border-idle bg-transparent',
    text: 'text-dim',
    tone: 'idle',
  },
};

/** Order used by legends: what needs attention first. */
export const AGENT_STATE_ORDER: readonly AgentState[] = [
  'waiting',
  'failed',
  'working',
  'idle',
  'inactive',
];
