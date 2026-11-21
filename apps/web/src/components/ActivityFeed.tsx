import {
  CalendarClock,
  CircleAlert,
  CircleCheck,
  type LucideIcon,
  PackageCheck,
  ShieldQuestion,
} from 'lucide-react';
import { Link } from 'react-router';
import { formatDateTime, formatTime } from '../lib/format';
import { type Tone, TONES } from '../lib/tone';
import { EmptyState, ErrorState, LoadingState } from './States';

export type ActivityKind = 'task' | 'delivery' | 'schedule' | 'approval' | 'failure';

const KINDS: Record<ActivityKind, { icon: LucideIcon; tone: Tone; label: string }> = {
  task: { icon: CircleCheck, tone: 'ok', label: 'Tarefa' },
  delivery: { icon: PackageCheck, tone: 'info', label: 'Entrega' },
  schedule: { icon: CalendarClock, tone: 'glow', label: 'Agendamento' },
  approval: { icon: ShieldQuestion, tone: 'wait', label: 'Aprovação' },
  failure: { icon: CircleAlert, tone: 'fail', label: 'Falha' },
};

export interface Activity {
  readonly id: string;
  readonly kind: ActivityKind;
  /** Plain text; names typed by people and models are escaped by React. */
  readonly text: string;
  /** ISO time it happened. */
  readonly at: string;
  readonly to?: string;
}

/** One line of what happened: what kind, what, when, and where to see it. */
export function ActivityItem({ activity }: { activity: Activity }) {
  const kind = KINDS[activity.kind];
  const Icon = kind.icon;
  const tone = TONES[kind.tone];
  return (
    <li className="relative flex gap-3 rounded-xl px-2 py-2 focus-within:bg-sheet-raised focus-within:ring-2 focus-within:ring-glow hover:bg-sheet-raised">
      <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${tone.tint}`}>
        <Icon className={`size-4 ${tone.text}`} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm">
          <span className="sr-only">{kind.label}: </span>
          {activity.to ? (
            <Link
              to={activity.to}
              className="outline-none after:absolute after:inset-0 after:rounded-xl"
            >
              {activity.text}
            </Link>
          ) : (
            activity.text
          )}
        </p>
        <time
          dateTime={activity.at}
          title={formatDateTime(activity.at)}
          className="text-xs text-dim"
        >
          {formatTime(activity.at)}
        </time>
      </div>
    </li>
  );
}

export type ActivityFeedStatus =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly error: unknown; readonly onRetry?: () => void }
  | { readonly kind: 'ready'; readonly items: readonly Activity[] };

interface ActivityFeedProps {
  label: string;
  status: ActivityFeedStatus;
  /** Said when nothing happened yet: what will show up here. */
  emptyText: string;
}

export function ActivityFeed({ label, status, emptyText }: ActivityFeedProps) {
  if (status.kind === 'loading') return <LoadingState label={`Carregando ${label}`} />;
  if (status.kind === 'error')
    return (
      <ErrorState
        title={`Não foi possível carregar ${label.toLowerCase()}.`}
        error={status.error}
        onRetry={status.onRetry}
      />
    );
  if (status.items.length === 0)
    return <EmptyState title="Nada por aqui ainda.">{emptyText}</EmptyState>;
  return (
    <ol aria-label={label} className="space-y-0.5">
      {status.items.map((activity) => (
        <ActivityItem key={activity.id} activity={activity} />
      ))}
    </ol>
  );
}
