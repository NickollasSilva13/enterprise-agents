import { describe, expect, it } from 'vitest';
import { formatCount, formatDuration, formatPercent, NO_VALUE, plural } from './format';

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
