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
    <dl
      role="group"
      aria-label={label}
      className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-[repeat(auto-fit,minmax(10.5rem,1fr))]"
    >
      {stats.map((stat) => (
        <div key={stat.label} className="flex flex-col-reverse justify-end bg-sheet px-4 py-3">
          <dt className="text-sm text-dim">{stat.label}</dt>
          <dd
            className={`whitespace-nowrap text-2xl font-bold leading-tight sm:text-3xl ${TONES[stat.tone ?? 'neutral']}`}
          >
            {stat.value}
            {stat.hint && <span className="ml-2 text-xs font-normal text-dim">{stat.hint}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}
