import { describe, expect, it } from 'vitest';
import {
  formatClock,
  formatCount,
  formatDay,
  formatDuration,
  formatPercent,
  formatWhen,
  NO_VALUE,
  plural,
} from './format';

describe('formatDuration', () => {
  it.each([
    [null, NO_VALUE],
    [0, '0 ms'],
    [850, '850 ms'],
    [1000, '1 s'],
    [12_400, '12,4 s'],
    [59_940, '59,9 s'],
    [185_000, '3 min 05 s'],
    [7_800_000, '2 h 10 min'],
  ])('formats %s as %s', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });
});

describe('formatPercent', () => {
  it('shows a dash when there is nothing to measure', () => {
    expect(formatPercent(null)).toBe(NO_VALUE);
  });

  it('rounds to whole percents', () => {
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(0.756)).toBe('76%');
    expect(formatPercent(1)).toBe('100%');
  });
});

describe('counts', () => {
  it('uses the Brazilian thousands separator', () => {
    expect(formatCount(1234567)).toBe('1.234.567');
  });

  it('picks singular or plural', () => {
    expect(plural(1, 'agente', 'agentes')).toBe('1 agente');
    expect(plural(0, 'agente', 'agentes')).toBe('0 agentes');
    expect(plural(2, 'agente', 'agentes')).toBe('2 agentes');
  });
});

describe('chat dates', () => {
  // Local times, as the user sees them: the helpers compare calendar days, not 24 h spans.
  const now = new Date(2026, 10, 21, 9, 30);
  const at = (day: number, hour: number, minute = 0) =>
    new Date(2026, 10, day, hour, minute).toISOString();

  it('says the time of a message in hours and minutes', () => {
    expect(formatClock(at(21, 8, 5))).toBe('08:05');
  });

  it('names today and yesterday, and dates the rest', () => {
    expect(formatDay(at(21, 0, 1), now)).toBe('Hoje');
    // Late last night is yesterday, though less than 24 h ago.
    expect(formatDay(at(20, 23, 50), now)).toBe('Ontem');
    expect(formatDay(at(13, 15), now)).toBe('13/11/2026');
  });

  it('shows the time for today in a list and the day otherwise', () => {
    expect(formatWhen(at(21, 8, 5), now)).toBe('08:05');
    expect(formatWhen(at(20, 8, 5), now)).toBe('Ontem');
    expect(formatWhen(at(13, 8, 5), now)).toBe('13/11/2026');
  });
});
