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

const clockFormat = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' });
const dateFormat = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'short' });

/** "14:05": the time on a chat message. */
export const formatClock = (iso: string) => clockFormat.format(new Date(iso));

/** Whole days from the local day of `iso` to the local day of `now` (0 is today). */
function daysAgo(iso: string, now: Date): number {
  const day = new Date(iso);
  const start = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((start(now).getTime() - start(day).getTime()) / 86_400_000);
}

/** "Hoje", "Ontem" or "13/11/2026": the day a group of chat messages was sent. */
export function formatDay(iso: string, now = new Date()): string {
  const days = daysAgo(iso, now);
  if (days === 0) return 'Hoje';
  if (days === 1) return 'Ontem';
  return dateFormat.format(new Date(iso));
}

/** "14:05" today, "Ontem" or "13/11/2026": when a conversation last moved, in a list. */
export function formatWhen(iso: string, now = new Date()): string {
  return daysAgo(iso, now) === 0 ? formatClock(iso) : formatDay(iso, now);
}

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
