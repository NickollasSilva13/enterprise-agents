import { formatCount } from '../lib/format';
import { useDashboardSummary } from '../lib/queries';
import { TONES } from '../lib/tone';

interface Counter {
  readonly label: string;
  readonly value: number | undefined;
  /** Colour applied only when the value is above zero. */
  readonly tone: string;
  /** Shown on a phone, where the top bar is compact (Phase 21, D6); the others are only read there. */
  readonly compact?: boolean;
}

/**
 * Always-visible summary of the whole office: how many agents exist, how many
 * are working and how many are waiting for the user.
 */
export function StatusStrip() {
  const { data, isError } = useDashboardSummary();

  const counters: Counter[] = [
    { label: 'agentes', value: data?.agents.total, tone: 'text-chalk' },
    { label: 'trabalhando', value: data?.agents.working, tone: TONES.ok.text },
    {
      label: 'precisam de você',
      value: data?.agents.waiting,
      tone: TONES.wait.text,
      compact: true,
    },
  ];

  return (
    <div className="flex min-w-0 items-center gap-x-5 gap-y-1 text-sm" aria-label="Resumo">
      <ul className="flex min-w-0 flex-wrap items-baseline gap-x-5 gap-y-1">
        {counters.map((counter) => (
          <li
            key={counter.label}
            className={`whitespace-nowrap text-dim ${counter.compact ? '' : 'sr-only sm:not-sr-only'}`}
          >
            <span
              className={`mr-1.5 text-base font-bold ${
                counter.value ? counter.tone : 'text-chalk'
              }`}
            >
              {counter.value === undefined ? '–' : formatCount(counter.value)}
            </span>
            {counter.label}
          </li>
        ))}
      </ul>
      {isError && (
        <p role="status" className={`ml-auto whitespace-nowrap ${TONES.fail.text}`}>
          Sem conexão com o servidor
        </p>
      )}
    </div>
  );
}
