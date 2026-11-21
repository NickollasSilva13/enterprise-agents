import { INDICATOR_DAYS, type Indicators } from '@ea/shared';
import { IndicatorCard, type IndicatorStatus } from '../../components/IndicatorCard';
import { errorMessage } from '../../lib/errors';
import { formatCount, formatDuration, formatPercent, plural } from '../../lib/format';
import { useIndicators } from '../../lib/queries';
import type { Tone } from '../../lib/tone';

// The four indicators of the office (Phase 30, D1), under the scene and at
// the top of the reports. Each card says how it is computed; with nothing to
// count, it says what will make the number appear (rule 5).

export interface IndicatorView {
  readonly label: string;
  readonly explain: string;
  readonly status: IndicatorStatus;
}

const DAYS = `${INDICATOR_DAYS} dias`;

/** "+3 contra ontem", in the tone of the change: more done is good news, less is worth a look. */
function change(
  now: number,
  before: number,
  words: { readonly same: string; readonly against: string },
): { text: string; tone: Tone } {
  if (now === before) return { text: words.same, tone: 'idle' };
  const diff = now - before;
  return {
    text: `${diff > 0 ? '+' : '−'}${formatCount(Math.abs(diff))} ${words.against}`,
    tone: diff > 0 ? 'ok' : 'wait',
  };
}

const LABELS = {
  doneToday: 'Concluídas hoje',
  meanTaskTime: 'Tempo médio por tarefa',
  runsWithoutFailure: 'Execuções sem falha',
  doneThisWeek: 'Concluídas na semana',
} as const;

/** How each number is computed: "Como é calculado" on its card. */
const EXPLAIN: Record<keyof typeof LABELS, string> = {
  doneToday:
    'Tarefas que entraram hoje numa etapa "concluída" do fluxo da sua área, contra as de ontem. Uma tarefa conta uma vez, no primeiro dia em que foi concluída. O dia é o deste computador.',
  meanTaskTime: `Média, entre as tarefas concluídas nos últimos ${DAYS}, do tempo entre a criação da tarefa e a sua chegada a uma etapa "concluída". Inclui o tempo parada esperando alguém.`,
  runsWithoutFailure: `Execuções que terminaram nos últimos ${DAYS} sem falhar, sobre todas as que terminaram sozinhas (concluídas, com falha ou fora do tempo). As interrompidas por você ou pelo desligamento do servidor não contam.`,
  doneThisWeek: `Tarefas concluídas nos últimos ${DAYS}, hoje incluído, contra as dos ${DAYS} anteriores.`,
};

/** The days that have a value, for the small chart and for what a screen reader says of it. */
function trend(series: readonly (number | null)[], say: (value: number) => string) {
  const values = series.filter((value): value is number => value !== null);
  const days = series
    .map((value, index) => {
      const ago = series.length - 1 - index;
      const day = ago === 0 ? 'hoje' : ago === 1 ? 'ontem' : `há ${ago} dias`;
      return value === null ? `${day}, sem dado` : `${day}, ${say(value)}`;
    })
    .join('; ');
  return { series: values, seriesLabel: `Últimos ${DAYS}: ${days}.` };
}

/** What each of the four cards shows, from the counts of the server. */
export function indicatorViews(data: Indicators): IndicatorView[] {
  const { doneToday, meanTaskTime, runsWithoutFailure, doneThisWeek } = data;
  const tasks = (value: number) => plural(value, 'tarefa', 'tarefas');
  return [
    {
      label: LABELS.doneToday,
      explain: EXPLAIN.doneToday,
      status:
        doneToday.today === 0 && doneThisWeek.week === 0
          ? { kind: 'empty', message: `Nada concluído em ${DAYS}.` }
          : {
              kind: 'ready',
              value: formatCount(doneToday.today),
              delta: change(doneToday.today, doneToday.yesterday, {
                same: 'Igual a ontem',
                against: 'contra ontem',
              }),
              ...trend(doneToday.series, tasks),
            },
    },
    {
      label: LABELS.meanTaskTime,
      explain: EXPLAIN.meanTaskTime,
      status:
        meanTaskTime.ms === null
          ? { kind: 'empty', message: `Nada concluído em ${DAYS}.` }
          : {
              kind: 'ready',
              value: formatDuration(meanTaskTime.ms),
              delta: { text: `${tasks(meanTaskTime.tasks)} em ${DAYS}`, tone: 'idle' },
              ...trend(meanTaskTime.series, formatDuration),
            },
    },
    {
      label: LABELS.runsWithoutFailure,
      explain: EXPLAIN.runsWithoutFailure,
      status:
        runsWithoutFailure.rate === null
          ? { kind: 'empty', message: `Nenhuma execução em ${DAYS}.` }
          : {
              kind: 'ready',
              value: formatPercent(runsWithoutFailure.rate),
              delta: {
                text: `${plural(runsWithoutFailure.runs, 'execução', 'execuções')} em ${DAYS}`,
                tone: 'idle',
              },
              ...trend(runsWithoutFailure.series, formatPercent),
            },
    },
    {
      label: LABELS.doneThisWeek,
      explain: EXPLAIN.doneThisWeek,
      status:
        doneThisWeek.week === 0 && doneThisWeek.previousWeek === 0
          ? { kind: 'empty', message: 'Nada concluído em 14 dias.' }
          : {
              kind: 'ready',
              value: formatCount(doneThisWeek.week),
              delta: change(doneThisWeek.week, doneThisWeek.previousWeek, {
                same: `Igual aos ${DAYS} anteriores`,
                against: `contra os ${DAYS} anteriores`,
              }),
              ...trend(doneThisWeek.series, tasks),
            },
    },
  ];
}

/** The four cards, loading, failed or with their numbers. */
export function IndicatorRow({ className = '' }: { className?: string }) {
  const { data, error, refetch } = useIndicators();
  const views: IndicatorView[] = data
    ? indicatorViews(data)
    : (Object.keys(LABELS) as (keyof typeof LABELS)[]).map((key) => ({
        label: LABELS[key],
        explain: EXPLAIN[key],
        status: error
          ? {
              kind: 'error',
              message: `Não foi possível calcular: ${errorMessage(error)}`,
              onRetry: () => void refetch(),
            }
          : { kind: 'loading' },
      }));
  return (
    <section aria-labelledby="indicators-title" className={className}>
      <h2 id="indicators-title" className="sr-only">
        Indicadores
      </h2>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {views.map((view) => (
          <IndicatorCard key={view.label} {...view} />
        ))}
      </div>
    </section>
  );
}
