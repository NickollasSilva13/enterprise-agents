import { describe, expect, it } from 'vitest';
import {
  nextOccurrence,
  scheduleInputSchema,
  type ScheduleRule,
  scheduleRuleSchema,
} from './schedules';

// When a schedule is due next (Phase 19, D2). Dates are built in local time,
// so the checks hold in any time zone.

const at = (year: number, month: number, day: number, hours = 0, minutes = 0) =>
  new Date(year, month - 1, day, hours, minutes);

describe('nextOccurrence', () => {
  it('runs a single time once, only while it is ahead', () => {
    const rule = { kind: 'once', at: '2026-11-20T09:30' } as const;
    expect(nextOccurrence(rule, at(2026, 11, 16, 12))).toEqual(at(2026, 11, 20, 9, 30));
    expect(nextOccurrence(rule, at(2026, 11, 20, 9, 30))).toBeNull();
  });

  it('runs every day at the time, today when it is still ahead', () => {
    const rule = { kind: 'daily', time: '09:00' } as const;
    expect(nextOccurrence(rule, at(2026, 11, 16, 8, 59))).toEqual(at(2026, 11, 16, 9));
    expect(nextOccurrence(rule, at(2026, 11, 16, 9))).toEqual(at(2026, 11, 17, 9));
    // Across the end of the year.
    expect(nextOccurrence(rule, at(2026, 12, 31, 10))).toEqual(at(2027, 1, 1, 9));
  });

  it('runs on the chosen weekdays', () => {
    // 2026-11-16 is a Monday.
    const rule: ScheduleRule = { kind: 'weekly', days: [1, 5], time: '18:00' };
    expect(nextOccurrence(rule, at(2026, 11, 16, 17))).toEqual(at(2026, 11, 16, 18));
    expect(nextOccurrence(rule, at(2026, 11, 16, 18))).toEqual(at(2026, 11, 20, 18));
    expect(nextOccurrence(rule, at(2026, 11, 20, 19))).toEqual(at(2026, 11, 23, 18));
    expect(
      nextOccurrence({ kind: 'weekly', days: [1], time: '08:00' }, at(2026, 11, 16, 9)),
    ).toEqual(at(2026, 11, 23, 8));
  });

  it('runs monthly, on the last day when the month is shorter', () => {
    const rule = { kind: 'monthly', day: 31, time: '07:15' } as const;
    expect(nextOccurrence(rule, at(2026, 11, 16))).toEqual(at(2026, 11, 30, 7, 15));
    expect(nextOccurrence(rule, at(2026, 11, 30, 8))).toEqual(at(2026, 12, 31, 7, 15));
    expect(nextOccurrence(rule, at(2027, 1, 31, 8))).toEqual(at(2027, 2, 28, 7, 15));
    expect(nextOccurrence({ kind: 'monthly', day: 1, time: '00:00' }, at(2026, 11, 16))).toEqual(
      at(2026, 12, 1),
    );
  });
});

describe('schedule rules', () => {
  const messages = (value: unknown) =>
    scheduleRuleSchema.safeParse(value).error?.issues.map((issue) => issue.message) ?? [];

  it('refuses times, days and dates that do not exist', () => {
    expect(messages({ kind: 'daily', time: '24:00' })).toEqual([
      'Informe a hora no formato HH:MM.',
    ]);
    expect(messages({ kind: 'weekly', days: [], time: '09:00' })).toEqual([
      'Escolha pelo menos um dia da semana.',
    ]);
    expect(messages({ kind: 'weekly', days: [1, 1], time: '09:00' })).toEqual([
      'Há um dia repetido.',
    ]);
    expect(messages({ kind: 'monthly', day: 32, time: '09:00' })).toEqual([
      'Escolha um dia de 1 a 31.',
    ]);
    expect(messages({ kind: 'once', at: '2026-13-01T09:00' })).toEqual([
      'Informe a data e a hora.',
    ]);
    expect(scheduleRuleSchema.safeParse({ kind: 'hourly' }).success).toBe(false);
  });

  it('takes the task fields with their defaults', () => {
    expect(
      scheduleInputSchema.parse({
        areaId: 'p1',
        title: ' Relatório ',
        rule: { kind: 'daily', time: '09:00' },
      }),
    ).toEqual({
      areaId: 'p1',
      title: 'Relatório',
      description: '',
      acceptance: '',
      priority: 'normal',
      rule: { kind: 'daily', time: '09:00' },
      enabled: true,
    });
    expect(
      scheduleInputSchema.safeParse({
        areaId: 'p1',
        title: 'x',
        rule: { kind: 'daily', time: '09:00' },
        stageId: 's1',
      }).success,
    ).toBe(false);
  });
});
