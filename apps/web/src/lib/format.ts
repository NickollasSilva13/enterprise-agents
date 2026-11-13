const LOCALE = 'pt-BR';

const numberFormat = new Intl.NumberFormat(LOCALE);
const percentFormat = new Intl.NumberFormat(LOCALE, { style: 'percent', maximumFractionDigits: 0 });
const timeFormat = new Intl.DateTimeFormat(LOCALE, { timeStyle: 'medium' });
const dateTimeFormat = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'short', timeStyle: 'short' });

/** Placeholder for a value that does not exist yet (nothing measured). */
export const NO_VALUE = '—';

export const formatCount = (value: number) => numberFormat.format(value);

export const formatPercent = (ratio: number | null) =>
  ratio === null ? NO_VALUE : percentFormat.format(ratio);

export const formatTime = (iso: string) => timeFormat.format(new Date(iso));

export const formatDateTime = (iso: string) => dateTimeFormat.format(new Date(iso));

/** 850 ms, 12,4 s, 3 min 05 s, 2 h 10 min */
export function formatDuration(ms: number | null): string {
  if (ms === null) return NO_VALUE;
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 }).format(seconds)} s`;
  }
  const totalSeconds = Math.round(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60) return `${minutes} min ${String(totalSeconds % 60).padStart(2, '0')} s`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`;
}

/** "1 agente" / "3 agentes" */
export const plural = (value: number, singular: string, pluralForm: string) =>
  `${formatCount(value)} ${value === 1 ? singular : pluralForm}`;
