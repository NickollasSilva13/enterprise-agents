import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router';

interface QuickActionProps {
  icon: LucideIcon;
  label: string;
  description: string;
  to: string;
  /** Why the action is not possible now; turns the card off and says so. */
  disabledReason?: string;
  /** One line, for a narrow column (Phase 30): the description is left out, never the reason. */
  compact?: boolean;
}

const FRAME = 'surface-glass flex items-center gap-3 rounded-2xl text-left transition-colors';

/**
 * A shortcut to the next thing to do (Phase 20). Off, it still shows, with
 * the reason, so the user learns what is missing instead of a vanished button.
 */
export function QuickAction({
  icon: Icon,
  label,
  description,
  to,
  disabledReason,
  compact = false,
}: QuickActionProps) {
  const frame = `${FRAME} ${compact ? 'min-h-10 px-2 py-1' : 'min-h-16 p-3'}`;
  const detail = compact ? disabledReason : (disabledReason ?? description);
  const body = (
    <>
      <span
        className={`grid shrink-0 place-items-center bg-accent text-white ${
          compact ? 'size-7 rounded-lg' : 'size-10 rounded-xl'
        }`}
      >
        <Icon className={compact ? 'size-4' : 'size-5'} aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block font-semibold">{label}</span>
        {detail && <span className="block text-sm text-dim">{detail}</span>}
      </span>
    </>
  );

  if (disabledReason)
    return (
      <span
        role="link"
        aria-disabled="true"
        // Still reachable by keyboard, so the reason can be read.
        tabIndex={0}
        className={`${frame} cursor-not-allowed opacity-60`}
      >
        {body}
      </span>
    );

  return (
    <Link
      to={to}
      className={`${frame} hover:bg-sheet-raised`}
      title={compact ? description : undefined}
    >
      {body}
    </Link>
  );
}
