import type { AgentState, Appearance } from '@ea/shared';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { AGENT_STATE_STYLES } from '../lib/agent-state';
import { Avatar } from './Avatar';
import { StatusPill } from './StatusPill';

interface AgentCardProps {
  agentId: string;
  name: string;
  /** What the agent is for, e.g. its role in the area. */
  role: string;
  appearance: Appearance | null;
  state: AgentState;
  /**
   * What it is doing now, or what it waits for; null when it has nothing.
   * Left out (undefined), the card has no activity line: a list of agents
   * that does not follow their runs says nothing about them (Phase 31).
   */
  activity?: string | null;
  /** Short facts under the activity, e.g. "3 passos · 2 min". */
  meta?: string;
  /** Where the card leads; the whole card is the link. */
  to: string;
  /** Picked in the scene (Phase 24): drawn with a lit edge. */
  selected?: boolean;
  /** Controls along the foot of the card, above the link that covers it (Phase 31). */
  actions?: ReactNode;
  /** A turned-off agent: the portrait fades. */
  dimmed?: boolean;
}

/**
 * An agent at a glance (Phase 20): who, in what state, doing what. The state
 * is a word in a pill; the activity line takes the colour of a wait or a
 * failure, the two things the user may have to act on.
 */
export function AgentCard({
  agentId,
  name,
  role,
  appearance,
  state,
  activity,
  meta,
  to,
  selected = false,
  actions,
  dimmed = false,
}: AgentCardProps) {
  const style = AGENT_STATE_STYLES[state];
  const urgent = state === 'waiting' || state === 'failed';
  return (
    <article
      data-agent-card={agentId}
      className={`relative flex flex-wrap gap-3 rounded-2xl border bg-sheet p-3 transition-colors focus-within:ring-2 focus-within:ring-glow hover:bg-sheet-raised ${
        selected ? 'border-glow shadow-[0_0_14px_-4px_var(--color-glow)]' : 'border-line'
      }`}
    >
      <span className={dimmed ? 'opacity-50' : ''}>
        <Avatar agentId={agentId} appearance={appearance} state={state} size="md" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <h3 className="min-w-0 truncate font-semibold">
            {/* The link covers the card, so the whole card is one target. */}
            <Link
              to={to}
              aria-current={selected ? 'true' : undefined}
              className="outline-none after:absolute after:inset-0 after:rounded-2xl"
            >
              {name}
            </Link>
          </h3>
          <StatusPill tone={style.tone} live={state === 'working'}>
            {style.label}
          </StatusPill>
        </div>
        <p className="truncate text-sm text-dim">{role}</p>
        {activity !== undefined && (
          <p
            className={`mt-1.5 line-clamp-2 text-sm ${
              activity === null ? 'text-dim' : urgent ? style.text : 'text-chalk'
            }`}
          >
            {activity ?? 'Sem tarefa no momento.'}
          </p>
        )}
        {meta && <p className="mt-1 text-xs text-dim">{meta}</p>}
      </div>
      {actions && (
        <div className="relative z-10 -mx-1 -mb-1 flex basis-full flex-wrap items-center gap-1 border-t border-line pt-2">
          {actions}
        </div>
      )}
    </article>
  );
}

/** The place of a card while the team loads. */
export function AgentCardSkeleton() {
  return (
    <div aria-hidden className="flex gap-3 rounded-2xl border border-line bg-sheet p-3">
      <div className="size-12 shrink-0 animate-pulse rounded-xl bg-sheet-raised" />
      <div className="flex-1 space-y-2 py-1">
        <div className="h-4 w-1/2 animate-pulse rounded bg-sheet-raised" />
        <div className="h-3 w-1/3 animate-pulse rounded bg-sheet-raised" />
        <div className="h-3 w-3/4 animate-pulse rounded bg-sheet-raised" />
      </div>
    </div>
  );
}
