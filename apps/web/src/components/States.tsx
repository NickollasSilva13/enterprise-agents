import { CircleAlert, Inbox, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { errorMessage } from '../lib/errors';
import { Button } from './Button';

/** Shown while the first response has not arrived. */
export function LoadingState({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div role="status" className="space-y-3 p-4">
      <span className="sr-only">{label}</span>
      <div className="h-4 w-2/3 animate-pulse rounded bg-sheet-raised" />
      <div className="h-4 w-1/2 animate-pulse rounded bg-sheet-raised" />
      <div className="h-4 w-3/5 animate-pulse rounded bg-sheet-raised" />
    </div>
  );
}

interface EmptyStateProps {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  /** What will be here, drawn small above the title. */
  icon?: LucideIcon;
}

/** Nothing to show yet: says what will appear here and how to get it. */
export function EmptyState({ title, children, action, icon: Icon = Inbox }: EmptyStateProps) {
  return (
    <div className="px-4 py-8 sm:px-6">
      <span
        aria-hidden
        className="mb-3 grid size-10 place-items-center rounded-xl border border-line bg-sheet-raised text-dim"
      >
        <Icon className="size-5" />
      </span>
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-1 max-w-prose text-sm text-dim">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

interface ErrorStateProps {
  /** What failed, e.g. "Não foi possível carregar o painel." */
  title: string;
  error: unknown;
  onRetry?: () => void;
}

export function ErrorState({ title, error, onRetry }: ErrorStateProps) {
  return (
    <div role="alert" className="flex gap-3 px-4 py-6">
      <CircleAlert className="mt-0.5 size-5 shrink-0 text-fail" aria-hidden />
      <div>
        <p className="font-semibold">{title}</p>
        <p className="mt-1 text-sm text-dim">{errorMessage(error)}</p>
        {onRetry && (
          <Button className="mt-4" onClick={onRetry}>
            Tentar de novo
          </Button>
        )}
      </div>
    </div>
  );
}

/** Marks a feature that is designed but not built yet (RNF-12). */
export function PlannedNote({ phase, children }: { phase: number; children: ReactNode }) {
  return (
    <p className="text-sm text-dim">
      {children}{' '}
      <span className="whitespace-nowrap rounded border border-line-strong px-1.5 py-0.5 text-xs text-chalk">
        Planejado para a Fase {phase}
      </span>
    </p>
  );
}
