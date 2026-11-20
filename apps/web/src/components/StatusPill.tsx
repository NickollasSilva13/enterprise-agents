import type { ReactNode } from 'react';
import { type Tone, TONES } from '../lib/tone';

interface StatusPillProps {
  tone: Tone;
  children: ReactNode;
  /** A slow blink of the dot, for something happening right now. */
  live?: boolean;
}

/**
 * A state said in a word on its own tint. The word is always there: colour
 * alone never carries the meaning.
 */
export function StatusPill({ tone, children, live = false }: StatusPillProps) {
  const classes = TONES[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${classes.text} ${classes.tint}`}
    >
      <span
        aria-hidden
        className={`size-1.5 shrink-0 rounded-full ${classes.dot} ${live ? 'animate-lamp' : ''}`}
      />
      {children}
    </span>
  );
}
