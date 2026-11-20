import type { ReactNode } from 'react';
import { type Tone, TONES } from '../lib/tone';

/** What went wrong with the action just tried, next to where it was tried. */
export function FormError({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p role="alert" className={`text-sm text-fail ${className}`}>
      {children}
    </p>
  );
}

interface NoticeProps {
  tone: Tone;
  children: ReactNode;
  /** "alert" for a problem, "status" for news; none for a standing note. */
  role?: 'alert' | 'status';
  icon?: ReactNode;
  className?: string;
}

/**
 * A boxed note in the tone of what it says (Phase 31): a warning before an
 * action, why something waits, a problem to fix.
 */
export function Notice({ tone, children, role, icon, className = '' }: NoticeProps) {
  const classes = TONES[tone];
  return (
    <div
      role={role}
      className={`flex gap-2.5 rounded-md border p-3 text-sm ${classes.edge} ${classes.tint} ${className}`}
    >
      {icon && <span className={`mt-0.5 shrink-0 ${classes.ink}`}>{icon}</span>}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Text in the tone of what it says, for a short line that is not a pill. */
export function ToneText({
  tone,
  children,
  className = '',
}: {
  tone: Tone;
  children: ReactNode;
  className?: string;
}) {
  return <span className={`${TONES[tone].text} ${className}`}>{children}</span>;
}
