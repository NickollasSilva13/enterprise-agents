import type { TipId } from '@ea/shared';
import { Lightbulb } from 'lucide-react';
import type { ReactNode } from 'react';
import { useGuide, useGuideActions } from '../lib/frame-queries';
import { TONES } from '../lib/tone';

/**
 * A short tip where it helps (Phase 32, D5): shown until the user closes it
 * with "Entendi", and back again from Ajuda. Nothing shows while the choice
 * is being read, so a closed tip never flashes in.
 */
export function Tip({
  id,
  children,
  className = '',
}: {
  id: TipId;
  children: ReactNode;
  className?: string;
}) {
  const guide = useGuide();
  const { dismissTip } = useGuideActions();
  if (!guide.data || guide.data.dismissedTips.includes(id)) return null;
  return (
    <aside
      aria-label="Dica"
      data-tip={id}
      className={`flex flex-wrap items-start gap-x-3 gap-y-2 rounded-xl border p-3 text-sm ${TONES.info.edge} ${TONES.info.tint} ${className}`}
    >
      <Lightbulb className={`mt-0.5 size-4.5 shrink-0 ${TONES.info.ink}`} aria-hidden />
      <p className="min-w-0 flex-1 basis-60">{children}</p>
      <button
        type="button"
        onClick={() => dismissTip(id)}
        className="rounded-md px-2 py-0.5 font-semibold text-chalk hover:bg-sheet-raised"
      >
        Entendi
      </button>
    </aside>
  );
}
