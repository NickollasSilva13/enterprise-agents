/**
 * The colours that mean something (Phase 20). Every pairing here is checked
 * for AA contrast by app/theme.test.ts: text in the tone, over 15% of it.
 */
export type Tone = 'ok' | 'wait' | 'fail' | 'info' | 'idle' | 'glow';

export interface ToneClasses {
  readonly text: string;
  readonly tint: string;
  readonly dot: string;
  /** Stroke and fill of drawings, through currentColor. */
  readonly ink: string;
  /** The edge of a box in the tone (Phase 31). */
  readonly edge: string;
}

export const TONES: Record<Tone, ToneClasses> = {
  ok: { text: 'text-ok', tint: 'bg-ok/15', dot: 'bg-ok', ink: 'text-ok', edge: 'border-ok/60' },
  wait: {
    text: 'text-wait',
    tint: 'bg-wait/15',
    dot: 'bg-wait',
    ink: 'text-wait',
    edge: 'border-wait/60',
  },
  fail: {
    text: 'text-fail',
    tint: 'bg-fail/15',
    dot: 'bg-fail',
    ink: 'text-fail',
    edge: 'border-fail/60',
  },
  info: {
    text: 'text-info',
    tint: 'bg-info/15',
    dot: 'bg-info',
    ink: 'text-info',
    edge: 'border-info/60',
  },
  idle: {
    text: 'text-idle',
    tint: 'bg-idle/15',
    dot: 'bg-idle',
    ink: 'text-idle',
    edge: 'border-idle/60',
  },
  glow: {
    text: 'text-glow',
    tint: 'bg-glow/15',
    dot: 'bg-glow',
    ink: 'text-glow',
    edge: 'border-glow/60',
  },
};
