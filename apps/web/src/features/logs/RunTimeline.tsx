import type { RunStep } from '@ea/shared';
import { formatTime } from '../../lib/format';
import { describeStep, type StepView } from '../../lib/run-labels';

const DOT: Record<StepView['tone'], string> = {
  neutral: 'bg-line-strong',
  ok: 'bg-ok',
  fail: 'bg-fail',
};

/** The steps of a run in order, each with its time (RF-33, RF-70). */
export function RunTimeline({ steps, label }: { steps: readonly RunStep[]; label: string }) {
  return (
    <ol aria-label={label} className="space-y-3">
      {steps.map((step) => {
        const view = describeStep(step);
        return (
          <li key={step.seq} className="flex gap-3 text-sm">
            <span
              className={`mt-1.5 size-2.5 shrink-0 rounded-full ${DOT[view.tone]}`}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className={`font-semibold ${view.tone === 'fail' ? 'text-fail' : ''}`}>
                  {view.title}
                </span>
                <time dateTime={step.createdAt} className="text-dim">
                  {formatTime(step.createdAt)}
                </time>
              </p>
              {view.detail && <p className="break-words text-dim">{view.detail}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
