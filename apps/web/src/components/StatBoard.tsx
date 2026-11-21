export type StatTone = 'neutral' | 'ok' | 'wait' | 'fail';

export interface Stat {
  readonly label: string;
  readonly value: string;
  readonly tone?: StatTone;
  /** Extra context under the value. */
  readonly hint?: string;
}

const TONES: Record<StatTone, string> = {
  neutral: 'text-chalk',
  ok: 'text-ok',
  wait: 'text-wait',
  fail: 'text-fail',
};

/**
 * A row of related figures sharing one frame, like a building directory board.
 * Cells are divided by rules instead of being separate cards because the
 * numbers are read together.
 */
export function StatBoard({ label, stats }: { label: string; stats: readonly Stat[] }) {
  return (
    // The name goes on a wrapper: a role on the <dl> itself would take its list meaning away.
    <div role="group" aria-label={label}>
      {/* The label is shown too: two boards of bare numbers in a row read as one. */}
      <p aria-hidden className="mb-2 text-sm font-medium text-dim">
        {label}
      </p>
      {/* Each cell draws its own right and bottom rule, so a short last row leaves no block of colour. */}
      <dl className="grid grid-cols-2 overflow-hidden rounded-xl border border-line bg-sheet sm:grid-cols-[repeat(auto-fit,minmax(10.5rem,1fr))]">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="flex flex-col-reverse justify-end px-4 py-3.5 shadow-[1px_1px_0_0_var(--color-line)]"
          >
            <dt className="text-sm text-dim">{stat.label}</dt>
            <dd
              className={`whitespace-nowrap text-2xl font-semibold leading-tight tracking-tight sm:text-3xl ${TONES[stat.tone ?? 'neutral']}`}
            >
              {stat.value}
              {stat.hint && <span className="ml-2 text-xs font-normal text-dim">{stat.hint}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
