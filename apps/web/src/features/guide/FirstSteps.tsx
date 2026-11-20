import { GUIDE_STEPS, type GuideStep } from '@ea/shared';
import { Check } from 'lucide-react';
import { useId } from 'react';
import { Link } from 'react-router';
import { buttonClass } from '../../components/Button';
import { useGuide, useGuideActions } from '../../lib/frame-queries';
import { TONES } from '../../lib/tone';

/** What each step asks and where it is done (Phase 32, D1). */
export const STEP_INFO: Record<GuideStep, { title: string; hint: string; to: string; go: string }> =
  {
    provider: {
      title: 'Conectar um provedor de modelos',
      hint: 'O Ollama neste computador, ou um serviço com chave de API.',
      to: '/modelos?novo=1',
      go: 'Conectar',
    },
    model: {
      title: 'Habilitar um modelo',
      hint: 'Escolha, no provedor, os modelos que os agentes podem usar.',
      to: '/modelos',
      go: 'Escolher',
    },
    area: {
      title: 'Criar uma área a partir de um modelo pronto',
      hint: 'Um time com agentes, fluxo e quadro, já com boas práticas.',
      to: '/tarefas?nova-area=1',
      go: 'Criar a área',
    },
    task: {
      title: 'Criar a primeira tarefa',
      hint: 'Os agentes da área a passam de etapa em etapa e avisam quando precisar de você.',
      to: '/tarefas?nova=1',
      go: 'Criar a tarefa',
    },
  };

/**
 * The checklist of a new installation (D1): four steps, each marked done by
 * what the data shows, with a link to where it is done. It leaves when all are
 * done, or when the user puts it aside; Ajuda brings it back (D2).
 */
/** Whether the checklist is on screen: read, not put aside, and something left to do. */
export function useFirstStepsOpen(): boolean {
  const guide = useGuide();
  return (
    guide.data !== undefined &&
    !guide.data.skipped &&
    GUIDE_STEPS.some((step) => !guide.data.done[step])
  );
}

export function FirstSteps({ className = '' }: { className?: string }) {
  const titleId = useId();
  const guide = useGuide();
  const { skip } = useGuideActions();
  const open = useFirstStepsOpen();
  if (!open || !guide.data) return null;
  const { done } = guide.data;
  const count = GUIDE_STEPS.filter((step) => done[step]).length;
  const next = GUIDE_STEPS.find((step) => !done[step]);

  return (
    <section
      aria-labelledby={titleId}
      className={`rounded-xl border border-glow/60 bg-sheet-raised p-3 ${className}`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={titleId} className="font-bold">
          Primeiros passos
        </h2>
        <span className="text-sm text-dim">
          {count} de {GUIDE_STEPS.length}
        </span>
      </div>
      <ol className="mt-2 space-y-2">
        {GUIDE_STEPS.map((step, index) => {
          const info = STEP_INFO[step];
          const current = step === next;
          return (
            <li key={step} className="flex gap-2.5 text-sm" data-step={step}>
              <span
                aria-hidden
                className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border text-xs font-bold ${
                  done[step]
                    ? `${TONES.ok.edge} ${TONES.ok.tint} ${TONES.ok.ink}`
                    : current
                      ? 'border-glow text-chalk'
                      : 'border-line text-dim'
                }`}
              >
                {done[step] ? <Check className="size-3.5" /> : index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={done[step] ? 'text-dim line-through' : current ? 'font-semibold' : ''}
                >
                  {info.title}
                  {done[step] && <span className="sr-only"> (feito)</span>}
                </p>
                {current && (
                  <>
                    <p className="text-dim">{info.hint}</p>
                    <Link to={info.to} className={`mt-1.5 ${buttonClass('primary')}`}>
                      {info.go}
                    </Link>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        onClick={skip}
        className="mt-2 text-sm text-dim underline underline-offset-4 hover:text-chalk"
      >
        Pular por agora
      </button>
      <span className="ml-1 text-sm text-dim">(volta pela Ajuda)</span>
    </section>
  );
}
