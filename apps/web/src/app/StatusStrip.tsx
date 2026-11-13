import { formatCount } from '../lib/format';
import { useDashboardSummary } from '../lib/queries';

interface Counter {
  readonly label: string;
  readonly value: number | undefined;
  /** Colour applied only when the value is above zero. */
  readonly tone: string;
}

/**
 * Always-visible summary of the whole office: how many agents exist, how many
 * are working and how many are waiting for the user.
 */
export function StatusStrip() {
  const { data, isError } = useDashboardSummary();

  const counters: Counter[] = [
    { label: 'agentes', value: data?.agents.total, tone: 'text-chalk' },
    { label: 'trabalhando', value: data?.agents.working, tone: 'text-ok' },
    { label: 'precisam de você', value: data?.agents.waiting, tone: 'text-wait' },
  ];

  return (
    <div className="flex min-w-0 items-center gap-x-5 gap-y-1 text-sm" aria-label="Resumo">
      <ul className="flex min-w-0 flex-wrap items-baseline gap-x-5 gap-y-1">
        {counters.map((counter) => (
          <li key={counter.label} className="whitespace-nowrap text-dim">
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
        <p role="status" className="ml-auto whitespace-nowrap text-fail">
          Sem conexão com o servidor
        </p>
      )}
    </div>
  );
}
