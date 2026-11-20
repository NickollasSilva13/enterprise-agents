import { type Tone, TONES } from '../lib/tone';

const WIDTH = 100;
const HEIGHT = 32;
/** Room for the stroke at the top and bottom of the box. */
const PAD = 2;

/** Points of the line, from the first value on the left to the last. */
export function sparklinePoints(values: readonly number[]): [number, number][] {
  if (values.length < 2) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const step = WIDTH / (values.length - 1);
  return values.map((value, index) => [
    index * step,
    // A flat series sits in the middle instead of on the floor.
    span === 0 ? HEIGHT / 2 : PAD + (1 - (value - min) / span) * (HEIGHT - 2 * PAD),
  ]);
}

interface SparklineProps {
  values: readonly number[];
  /** What the line shows, read by screen readers, e.g. "Últimos 7 dias: 2, 4, 3…". */
  label: string;
  tone?: Tone;
  className?: string;
}

/**
 * A small trend line drawn in SVG (Phase 20, no chart library). It stretches
 * to its box; the stroke keeps its width. Fewer than two values draw nothing.
 */
export function Sparkline({ values, label, tone = 'glow', className = '' }: SparklineProps) {
  const points = sparklinePoints(values);
  if (points.length === 0) return null;
  const line = points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const area = `0,${HEIGHT} ${line} ${WIDTH},${HEIGHT}`;
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      className={`block h-8 w-full ${TONES[tone].ink} ${className}`}
    >
      <polygon points={area} fill="currentColor" opacity={0.14} />
      <polyline
        points={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
