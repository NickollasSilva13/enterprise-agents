import { useEffect, useState } from 'react';
import { mix } from '../../components/pixel-art/shade';

// Day and night over the office (Phase 23, D3), by the clock of this machine:
// night from 18:00 to 6:00, day the rest, each change spread over an hour.

/** When the day begins and ends, in hours; each change takes `FADE` hours, centred there. */
const SUNRISE = 6;
const SUNSET = 18;
const FADE = 1;

/** How much daylight there is: 0 at night, 1 by day, in between while it changes. */
export function daylight(at: Date): number {
  const hour = at.getHours() + at.getMinutes() / 60;
  const ramp = (edge: number) => Math.min(1, Math.max(0, (hour - (edge - FADE / 2)) / FADE));
  return ramp(SUNRISE) - ramp(SUNSET);
}

export interface SkyColors {
  readonly top: string;
  readonly bottom: string;
}

const NIGHT_SKY: SkyColors = { top: '#110c2e', bottom: '#3b2a7a' };
const DAY_SKY: SkyColors = { top: '#7fb6ef', bottom: '#dcecff' };

export const skyAt = (light: number, night = NIGHT_SKY, day = DAY_SKY): SkyColors => ({
  top: mix(night.top, day.top, light),
  bottom: mix(night.bottom, day.bottom, light),
});

/**
 * Whether a window of the city is lit. Each window has its own `seed` in
 * [0, 1): as the light goes, windows come on one after another, never
 * blinking; by day a few stay lit.
 */
export const windowLit = (seed: number, light: number): boolean => seed < 0.08 + (1 - light) * 0.55;

/** The daylight now, read again every minute. */
export function useDaylight(): number {
  const [light, setLight] = useState(() => daylight(new Date()));
  useEffect(() => {
    const timer = setInterval(() => setLight(daylight(new Date())), 60_000);
    return () => clearInterval(timer);
  }, []);
  return light;
}
