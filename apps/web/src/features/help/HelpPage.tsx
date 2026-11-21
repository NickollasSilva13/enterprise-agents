import { GUIDE_STEPS, TIP_IDS } from '@ea/shared';
import { Check } from 'lucide-react';
import { Link } from 'react-router';
import { Button, buttonClass } from '../../components/Button';
import { FormError } from '../../components/Notice';
import { PageHeader } from '../../components/PageHeader';
import { Panel } from '../../components/Panel';
import { ErrorState, LoadingState } from '../../components/States';
import { errorMessage } from '../../lib/errors';
import { useGuide, useGuideActions } from '../../lib/frame-queries';
import { TONES } from '../../lib/tone';
import guideText from '../../../../../docs/GUIA.md?raw';
import { STEP_INFO } from '../guide/FirstSteps';
import { GuideDocument } from './GuideDocument';

/** Where the first steps stand, and the way back to them once put aside (D2). */
function FirstStepsPanel() {
  const guide = useGuide();
  const { resume, showTipsAgain, error } = useGuideActions();
  if (guide.isPending) return <LoadingState label="Carregando os primeiros passos…" />;
  if (!guide.data) {
    return (
      <ErrorState
        title="Não foi possível carregar os primeiros passos."
        error={guide.error}
        onRetry={() => void guide.refetch()}
      />
    );
  }
  const { done, skipped, dismissedTips } = guide.data;
  const count = GUIDE_STEPS.filter((step) => done[step]).length;
  const finished = count === GUIDE_STEPS.length;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel title="Primeiros passos" aside={`${count} de ${GUIDE_STEPS.length}`}>
        <ol className="space-y-2 px-4 py-3 text-sm">
          {GUIDE_STEPS.map((step) => (
            <li key={step} className="flex items-start gap-2.5">
              <span
                aria-hidden
                className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border ${
                  done[step] ? `${TONES.ok.edge} ${TONES.ok.tint} ${TONES.ok.ink}` : 'border-line'
                }`}
              >
                {done[step] && <Check className="size-3.5" />}
              </span>
              <span className="min-w-0 flex-1">
                {done[step] ? (
                  <span className="text-dim">
                    {STEP_INFO[step].title}
                    <span className="sr-only"> (feito)</span>
                  </span>
                ) : (
                  <Link to={STEP_INFO[step].to} className="font-semibold hover:underline">
                    {STEP_INFO[step].title}
                  </Link>
                )}
              </span>
            </li>
          ))}
        </ol>
        <div className="border-t border-line px-4 py-3 text-sm">
          {finished ? (
            <p className="text-dim">Tudo pronto: a plataforma já tem com quem trabalhar.</p>
          ) : skipped ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-dim">O roteiro está guardado.</p>
              <Button onClick={resume}>Retomar o roteiro</Button>
            </div>
          ) : (
            <p className="text-dim">O roteiro está no Escritório, acima do time.</p>
          )}
        </div>
      </Panel>
      <Panel title="Dicas" aside={`${dismissedTips.length} de ${TIP_IDS.length} fechadas`}>
        <div className="space-y-3 px-4 py-3 text-sm">
          <p className="text-dim">
            Dicas curtas aparecem uma vez onde ajudam e somem quando você clica em "Entendi".
          </p>
          <Button onClick={showTipsAgain} disabled={dismissedTips.length === 0}>
            Mostrar as dicas de novo
          </Button>
        </div>
      </Panel>
      {error && <FormError className="lg:col-span-2">{errorMessage(error)}</FormError>}
    </div>
  );
}

/** "Precisa de ajuda?" (Phase 32): the first steps, the tips and the user guide. */
export function HelpPage() {
  return (
    <>
      <PageHeader
        title="Ajuda"
        description="O roteiro de início, as dicas e o guia de uso completo, sem sair da plataforma."
        actions={
          <a href="#sumário" className={buttonClass()}>
            Ir ao sumário do guia
          </a>
        }
      />
      <div className="space-y-8">
        <FirstStepsPanel />
        <section aria-label="Guia de uso" className="rounded-xl border border-line bg-sheet p-5">
          <GuideDocument text={guideText} />
        </section>
      </div>
    </>
  );
}
