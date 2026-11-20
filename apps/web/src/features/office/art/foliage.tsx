import { hashText } from '@ea/shared';
import { mix } from '../../../components/pixel-art/shade';
import { project } from './iso';

// Leaves (Phase 23, after the user's second review): a crown is a cluster of
// round clumps, each lit on the top left and shaded on the bottom right like
// every other thing in the scene, with a dark outline around the whole crown,
// instead of square blocks. Original art.

const NIGHT = '#0d1f24';
const OUTLINE = '#14281c';

/** The four tones of the leaves, darkened toward night outdoors (`dusk` 1). */
function leaves(dusk: number) {
  const at = (color: string) => mix(color, NIGHT, dusk * 0.55);
  return {
    edge: at(OUTLINE),
    dark: at('#2c7238'),
    mid: at('#3f9b4a'),
    light: at('#6cc35e'),
    shine: at('#a8e08a'),
  };
}

/** A circle as path data, so all the clumps of one tone go in one `path`. */
const disc = (cx: number, cy: number, r: number) =>
  `M${(cx - r).toFixed(1)} ${cy.toFixed(1)}a${r.toFixed(1)} ${r.toFixed(1)} 0 1 0 ${(2 * r).toFixed(1)} 0a${r.toFixed(1)} ${r.toFixed(1)} 0 1 0 ${(-2 * r).toFixed(1)} 0z`;

/** The same layout always gets the same crowns. */
function seeded(seed: string): () => number {
  let state = hashText(seed) || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 10_000) / 10_000;
  };
}

/** Where the clumps of a crown sit, as fractions of its radius: a rounded mass, wider below. */
const CLUMPS: readonly (readonly [number, number, number])[] = [
  [-0.55, 0.3, 0.55],
  [0.55, 0.3, 0.55],
  [0, 0.42, 0.6],
  [-0.4, -0.15, 0.6],
  [0.42, -0.1, 0.58],
  [0, -0.1, 0.68],
  [-0.15, -0.55, 0.5],
  [0.25, -0.5, 0.45],
];

/**
 * A crown of leaves centred over (x, y), its base at height `z`, `size` tiles
 * wide.
 */
export function Foliage({
  x,
  y,
  z,
  size,
  tall = 1,
  dusk = 0,
}: {
  x: number;
  y: number;
  z: number;
  size: number;
  /** Stretches the crown up, for trees and tall plants. */
  tall?: number;
  /** How dark it is outside: 0 by day, 1 at night. */
  dusk?: number;
}) {
  const radius = size * 10;
  const base = project(x, y, z);
  const cx = base.x;
  const cy = base.y - radius * tall * 0.85;
  const random = seeded(`leaf${x.toFixed(2)},${y.toFixed(2)}`);
  const clumps = CLUMPS.map(([dx, dy, r]) => ({
    x: cx + (dx + (random() - 0.5) * 0.18) * radius,
    y: cy + (dy + (random() - 0.5) * 0.14) * radius * tall,
    r: r * radius * (0.9 + random() * 0.2),
  }));
  const tone = leaves(dusk);
  /** `from` skips the lower clumps: highlights only where the light falls. */
  const path = (shift: number, lift: number, scale: number, from = 0) =>
    clumps
      .slice(from)
      .map((c) => disc(c.x + shift * c.r, c.y + lift * c.r, c.r * scale))
      .join('');
  return (
    <g>
      <path d={clumps.map((c) => disc(c.x, c.y, c.r + 1)).join('')} fill={tone.edge} />
      <path d={path(0, 0, 1)} fill={tone.dark} />
      <path d={path(-0.12, -0.14, 0.72)} fill={tone.mid} />
      <path d={path(-0.26, -0.3, 0.42, 3)} fill={tone.light} />
      <path d={path(-0.38, -0.42, 0.14, 5)} fill={tone.shine} />
    </g>
  );
}

const TRUNK = { light: '#8a5d3a', dark: '#5e3e26' };

/** A tree standing at (x, y) on ground of height `z`: a shadow, a trunk and a crown. */
export function Tree({
  x,
  y,
  z,
  size = 1.4,
  dusk = 0,
}: {
  x: number;
  y: number;
  z: number;
  size?: number;
  dusk?: number;
}) {
  const foot = project(x, y, z);
  const trunkHeight = size * 11;
  const half = size * 1.6;
  const top = foot.y - trunkHeight;
  const light = mix(TRUNK.light, NIGHT, dusk * 0.5);
  const dark = mix(TRUNK.dark, NIGHT, dusk * 0.5);
  const fmt = (value: number) => value.toFixed(1);
  return (
    <g>
      <ellipse
        cx={foot.x + size * 2}
        cy={foot.y}
        rx={size * 9}
        ry={size * 4}
        fill="#0a0818"
        opacity={0.22}
      />
      {/* The trunk narrows upward; the left half catches the light. */}
      <polygon
        points={`${fmt(foot.x - half)},${fmt(foot.y)} ${fmt(foot.x)},${fmt(foot.y + 0.8)} ${fmt(foot.x)},${fmt(top)} ${fmt(foot.x - half * 0.6)},${fmt(top)}`}
        fill={light}
      />
      <polygon
        points={`${fmt(foot.x)},${fmt(foot.y + 0.8)} ${fmt(foot.x + half)},${fmt(foot.y)} ${fmt(foot.x + half * 0.6)},${fmt(top)} ${fmt(foot.x)},${fmt(top)}`}
        fill={dark}
      />
      <Foliage x={x} y={y} z={z + trunkHeight * 0.7} size={size} tall={1.15} dusk={dusk} />
    </g>
  );
}
