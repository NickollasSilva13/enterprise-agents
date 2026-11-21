import { CircleAlert, CircleHelp } from 'lucide-react';
import { useId } from 'react';
import type { Tone } from '../lib/tone';
import { TONES } from '../lib/tone';
import { Sparkline } from './Sparkline';

export type IndicatorStatus =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string; readonly onRetry?: () => void }
  /** No data to count yet; the message says what will make the number appear. */
  | { readonly kind: 'empty'; readonly message: string }
  | {
      readonly kind: 'ready';
      readonly value: string;
      /** The change against the previous period, e.g. "+3 contra ontem". */
      readonly delta?: { readonly text: string; readonly tone: Tone };
      readonly series?: readonly number[];
      /** What the line shows, for screen readers. */
      readonly seriesLabel?: string;
    };

interface IndicatorCardProps {
  label: string;
  /** How the number is computed, opened by "Como é calculado". */
  explain: string;
  status: IndicatorStatus;
}

/**
 * One figure on glass, with its trend and how it is computed (Phase 20). Every
 * number in the interface comes with its explanation, so nothing on screen is
 * a figure the user cannot check.
 */
export function IndicatorCard({ label, explain, status }: IndicatorCardProps) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="surface-glass flex flex-col rounded-2xl p-4">
      <header className="flex items-start justify-between gap-3">
        <h3 id={titleId} className="text-sm font-medium text-dim">
          {label}
        </h3>
        <details className="group relative shrink-0">
          <summary className="grid size-7 cursor-pointer list-none place-items-center rounded-full text-dim hover:bg-sheet-raised hover:text-chalk [&::-webkit-details-marker]:hidden">
            <CircleHelp className="size-4" aria-hidden />
            <span className="sr-only">Como é calculado: {label}</span>
          </summary>
          <p className="surface-glass absolute right-0 z-10 mt-1 w-60 rounded-xl p-3 text-sm">
            {explain}
          </p>
        </details>
      </header>
      <IndicatorBody label={label} status={status} />
    </section>
  );
}

function IndicatorBody({ label, status }: { label: string; status: IndicatorStatus }) {
  switch (status.kind) {
    case 'loading':
      return (
        <div role="status" className="mt-3 space-y-2">
          <span className="sr-only">Carregando {label}</span>
          <div className="h-8 w-1/2 animate-pulse rounded bg-sheet-raised" />
          <div className="h-8 w-full animate-pulse rounded bg-sheet-raised" />
        </div>
      );
    case 'error':
      return (
        <div role="alert" className="mt-3 flex gap-2 text-sm">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-fail" aria-hidden />
          <div>
            <p className="text-fail">{status.message}</p>
            {status.onRetry && (
              <button
                type="button"
                onClick={status.onRetry}
                className="mt-1 font-semibold text-chalk underline underline-offset-4"
              >
                Tentar de novo
              </button>
            )}
          </div>
        </div>
      );
    case 'empty':
      return (
        <div className="mt-3">
          <p className="text-3xl font-bold leading-tight text-dim" aria-hidden>
            —
          </p>
          <p className="mt-1 text-sm text-dim">{status.message}</p>
        </div>
      );
    case 'ready':
      return (
        <div className="mt-3 flex flex-1 flex-col">
          <p className="text-3xl font-bold leading-tight">{status.value}</p>
          {status.delta && (
            <p className={`mt-0.5 text-sm font-medium ${TONES[status.delta.tone].text}`}>
              {status.delta.text}
            </p>
          )}
          {status.series && (
            <Sparkline
              className="mt-3"
              values={status.series}
              label={status.seriesLabel ?? `Tendência de ${label}`}
            />
          )}
        </div>
      );
  }
}
