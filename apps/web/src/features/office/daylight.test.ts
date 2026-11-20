import { describe, expect, it } from 'vitest';
import { daylight, skyAt, windowLit } from './daylight';

const at = (hours: number, minutes = 0) => new Date(2026, 10, 19, hours, minutes);

describe('day and night (Phase 23, D3)', () => {
  it('is night from 18:00 to 6:00 and day in between, by the local clock', () => {
    expect(daylight(at(0))).toBe(0);
    expect(daylight(at(3))).toBe(0);
    expect(daylight(at(12))).toBe(1);
    expect(daylight(at(17))).toBe(1);
    expect(daylight(at(22))).toBe(0);
  });

  it('changes over an hour around sunrise and sunset', () => {
    expect(daylight(at(5, 30))).toBe(0);
    expect(daylight(at(6))).toBeCloseTo(0.5);
    expect(daylight(at(6, 30))).toBe(1);
    expect(daylight(at(18))).toBeCloseTo(0.5);
    expect(daylight(at(17, 45))).toBeCloseTo(0.75);
    expect(daylight(at(18, 30))).toBe(0);
  });

  it('lights the city windows one after another as the light goes', () => {
    const seeds = Array.from({ length: 100 }, (_, index) => index / 100);
    const lit = (light: number) => seeds.filter((seed) => windowLit(seed, light)).length;
    expect(lit(0)).toBeGreaterThan(50);
    expect(lit(1)).toBeLessThan(10);
    expect(lit(0.5)).toBeLessThan(lit(0));
    // A window lit at dusk stays lit as night falls: nothing blinks.
    for (const seed of seeds) if (windowLit(seed, 0.5)) expect(windowLit(seed, 0)).toBe(true);
  });

  it('turns the sky from night to day', () => {
    expect(skyAt(0).top).not.toBe(skyAt(1).top);
    expect(skyAt(0)).toEqual(skyAt(0));
  });
});
