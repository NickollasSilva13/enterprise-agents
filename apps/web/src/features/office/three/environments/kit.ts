import { type Part, type Piece, placed, shadeOf } from './pieces';

// Pieces every environment can use (Phase 35, from the park of Phase 33):
// the colours of the hour, trees of six kinds, benches, lamps and picnic
// tables, as plain data placed where each one stands.

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Spot extends Point {
  /** Which way it faces, in radians (a bench faces its path). */
  readonly yaw: number;
}

export type TreeKind = 'oak' | 'pine' | 'birch' | 'jacaranda' | 'cypress' | 'round' | 'palm';

export interface Tree extends Point {
  readonly kind: TreeKind;
  readonly size: number;
  readonly seed: number;
}

export const WOOD = '#a8744a';
export const WOOD_DARK = '#7f5535';
export const IRON = '#2d2a3a';
export const STONE = ['#d3cbbb', '#c2b8a6', '#dcd4c6', '#b6ac98', '#cbc2b1'] as const;
export const LEAVES = {
  oak: ['#3f8f45', '#4fa24f', '#5cb35a', '#468c3f'],
  pine: ['#2d6b4a', '#357a52', '#2a5f44'],
  birch: ['#8fc76a', '#a7d47c', '#7ab85d'],
  jacaranda: ['#9a7be0', '#b597f0', '#8466d2', '#c3a8f5'],
  cypress: ['#2f6a45', '#386f4a', '#2a5c3f'],
  round: ['#4f9a4a', '#5aa651', '#468f45'],
  palm: ['#3f9a4a', '#4fae4f', '#3a8a44', '#5bb85a'],
} as const;
export const BUSH = ['#3e8a45', '#4c9a4a', '#58a651', '#357d42'] as const;
/** The lamps' light at night; by day the glass is pale. */
export const LAMP_LIT = '#ffd89a';
export const LAMP_GLASS = '#efe9d6';

export const pick = <T>(list: readonly T[], seed: number): T =>
  list[Math.abs(seed) % list.length] as T;

export interface Ink {
  /** A colour as the hour shows it: darker and cooler at night. */
  readonly tone: (hex: string) => string;
  /** Lamps and fireflies light up at night. */
  readonly lit: boolean;
  readonly night: boolean;
}

export function inkOf(dusk: number): Ink {
  return {
    tone: (hex) => shadeOf(hex, dusk * 0.32),
    lit: dusk > 0.35,
    night: dusk > 0.55,
  };
}

export function tree(tree: Tree, z: number, ink: Ink): Piece[] {
  const s = tree.size;
  const leaves = LEAVES[tree.kind];
  const leaf = (n: number) => ink.tone(pick(leaves, tree.seed + n));
  const blob = (dx: number, dy: number, dz: number, w: number, h: number, n: number): Part => ({
    dx: dx * s,
    dy: dy * s,
    dz: dz * s,
    w: w * s,
    d: w * s * 0.92,
    h: h * s,
    color: leaf(n),
    shape: 'blob',
    surface: 'facet',
    seed: tree.seed + n * 31,
    shade: 0.28,
  });
  const trunk = (w: number, h: number, color: string): Part => ({
    dx: 0,
    dy: 0,
    dz: -0.05,
    w: w * s,
    d: w * s,
    h: h * s,
    color: ink.tone(color),
    shape: 'drum',
    sides: 7,
    shade: 0.35,
  });
  const turn = (tree.seed % 628) / 100;
  switch (tree.kind) {
    case 'oak':
      return placed(tree.x, tree.y, z, turn, [
        trunk(0.22, 1.15, '#6e4a2f'),
        blob(0, 0, 0.85, 1.25, 1.0, 0),
        blob(0.4, 0.12, 0.75, 0.85, 0.75, 1),
        blob(-0.38, 0.2, 0.8, 0.82, 0.72, 2),
        blob(0.05, -0.38, 0.85, 0.8, 0.7, 3),
        blob(0.02, 0.05, 1.42, 0.8, 0.68, 1),
      ]);
    case 'pine': {
      const cone = (dz: number, w: number, h: number, n: number): Part => ({
        dx: 0,
        dy: 0,
        dz: dz * s,
        w: w * s,
        d: w * s,
        h: h * s,
        color: leaf(n),
        shape: 'cone',
        sides: 7,
        surface: 'facet',
        shade: 0.3,
      });
      return placed(tree.x, tree.y, z, turn, [
        trunk(0.18, 0.6, '#5f3f28'),
        cone(0.4, 1.3, 1.25, 0),
        cone(1.05, 1.0, 1.1, 1),
        cone(1.65, 0.66, 1.0, 2),
      ]);
    }
    case 'birch': {
      const mark = (dz: number, side: number): Part => ({
        dx: side * 0.065 * s,
        dy: 0,
        dz: dz * s,
        w: 0.03 * s,
        d: 0.08 * s,
        h: 0.06 * s,
        color: ink.tone('#2e2a2a'),
      });
      return placed(tree.x, tree.y, z, turn, [
        trunk(0.13, 1.8, '#ece8dc'),
        mark(0.4, 1),
        mark(0.75, -1),
        mark(1.1, 1),
        blob(0, 0, 1.15, 0.85, 1.25, 0),
        blob(0.22, 0.1, 1.55, 0.6, 0.9, 1),
        blob(-0.18, -0.08, 1.4, 0.62, 0.95, 2),
      ]);
    }
    case 'jacaranda': {
      const petals: Part[] = Array.from({ length: 7 }, (_, n) => {
        const angle = n * 0.9 + turn;
        const r = (0.55 + ((tree.seed >> n) % 5) * 0.12) * s;
        return {
          dx: Math.cos(angle) * r,
          dy: Math.sin(angle) * r,
          dz: 0,
          w: 0.12,
          d: 0.12,
          h: 0.03,
          color: leaf(n),
          shape: 'dot',
        };
      });
      return placed(tree.x, tree.y, z, turn, [
        trunk(0.2, 1.05, '#5b3f2e'),
        {
          dx: 0.2 * s,
          dy: 0,
          dz: 0.75 * s,
          w: 0.09 * s,
          d: 0.09 * s,
          h: 0.6 * s,
          color: ink.tone('#5b3f2e'),
          shape: 'drum',
          sides: 5,
          tilt: 0.6,
          yaw: Math.PI / 2,
        },
        blob(0, 0, 0.95, 1.5, 0.7, 0),
        blob(0.55, 0.1, 0.9, 0.95, 0.55, 1),
        blob(-0.5, 0.25, 0.95, 0.9, 0.55, 2),
        blob(0.1, -0.5, 1.0, 0.95, 0.55, 3),
        blob(0, 0.1, 1.35, 0.95, 0.5, 1),
        ...petals,
      ]);
    }
    case 'cypress':
      // Tall and slim, as in the gardens of the condominium.
      return placed(tree.x, tree.y, z, turn, [
        trunk(0.12, 0.4, '#5f3f28'),
        blob(0, 0, 0.25, 0.8, 2.6, 0),
        blob(0.05, 0.02, 1.2, 0.6, 1.8, 1),
      ]);
    case 'round':
      // A clipped ball on a straight stem, as along a street.
      return placed(tree.x, tree.y, z, turn, [
        trunk(0.12, 1.25, '#6e4a2f'),
        blob(0, 0, 1.05, 1.15, 1.05, 0),
      ]);
    case 'palm': {
      // A curved, ringed trunk leaning one way, and a crown of drooping fronds with coconuts.
      const parts: Part[] = [];
      const segments = 7;
      const lean = 0.5 * s;
      let top = 0;
      for (let k = 0; k < segments; k += 1) {
        const t = k / segments;
        const h = (2.4 * s) / segments;
        parts.push({
          dx: lean * t * t,
          dy: 0,
          dz: top,
          w: (0.2 - t * 0.06) * s,
          d: (0.2 - t * 0.06) * s,
          h: h + 0.02,
          color: ink.tone(k % 2 ? '#8a6a48' : '#9c7a54'),
          shape: 'drum',
          sides: 7,
          tilt: 0,
          yaw: 0,
          shade: 0.15,
        });
        top += h;
      }
      const crown = { dx: lean, dz: top };
      const fronds = 8;
      for (let k = 0; k < fronds; k += 1) {
        const angle = (k / fronds) * Math.PI * 2 + (tree.seed % 7) * 0.3;
        const length = (1.25 + (k % 3) * 0.15) * s;
        const droop = 0.45 + (k % 2) * 0.2;
        parts.push({
          dx: crown.dx + Math.sin(angle) * (length / 2) * Math.cos(droop),
          dy: Math.cos(angle) * (length / 2) * Math.cos(droop),
          dz: crown.dz - (length / 2) * Math.sin(droop) + 0.05,
          w: 0.32 * s,
          d: length,
          h: 0.04,
          color: leaf(k),
          shape: 'blob',
          surface: 'facet',
          seed: tree.seed + k,
          tilt: -droop,
          yaw: angle,
          shade: 0,
        });
      }
      for (let k = 0; k < 3; k += 1)
        parts.push({
          dx: crown.dx + Math.cos(k * 2.1) * 0.12 * s,
          dy: Math.sin(k * 2.1) * 0.12 * s,
          dz: crown.dz - 0.2 * s,
          w: 0.13 * s,
          d: 0.13 * s,
          h: 0.13 * s,
          color: ink.tone('#6b4a2a'),
          shape: 'ball',
        });
      return placed(tree.x, tree.y, z, turn, parts);
    }
  }
}

export function bench(spot: Spot, z: number, ink: Ink): Piece[] {
  const wood = ink.tone(WOOD);
  const iron = ink.tone(IRON);
  const parts: Part[] = [
    ...[-0.5, 0.5].flatMap((dx): Part[] => [
      { dx, dy: 0, dz: 0, w: 0.06, d: 0.42, h: 0.38, color: iron },
      { dx, dy: -0.21, dz: 0.38, w: 0.05, d: 0.05, h: 0.38, color: iron },
    ]),
    ...[-0.13, 0, 0.13].map((dy): Part => ({
      dx: 0,
      dy,
      dz: 0.38,
      w: 1.24,
      d: 0.11,
      h: 0.05,
      color: wood,
      shape: 'soft',
    })),
    ...[0.52, 0.66].map((dz): Part => ({
      dx: 0,
      dy: -0.22,
      dz,
      w: 1.24,
      d: 0.05,
      h: 0.1,
      color: wood,
      shape: 'soft',
      tilt: -0.18,
    })),
  ];
  return placed(spot.x, spot.y, z, spot.yaw, parts);
}

export function lamp(spot: Spot, z: number, ink: Ink): Piece[] {
  const iron = ink.tone('#2b2550');
  return placed(spot.x, spot.y, z, spot.yaw, [
    { dx: 0, dy: 0, dz: 0, w: 0.2, d: 0.2, h: 0.14, color: iron, shape: 'drum', sides: 8 },
    { dx: 0, dy: 0, dz: 0.1, w: 0.07, d: 0.07, h: 1.5, color: iron, shape: 'drum', sides: 8 },
    { dx: 0, dy: 0, dz: 1.56, w: 0.24, d: 0.24, h: 0.05, color: iron },
    {
      dx: 0,
      dy: 0,
      dz: 1.6,
      w: 0.17,
      d: 0.17,
      h: 0.22,
      color: ink.lit ? LAMP_LIT : LAMP_GLASS,
      surface: ink.lit ? 'glow' : 'gloss',
    },
    ...[-1, 1].flatMap((sx) =>
      [-1, 1].map((sy): Part => ({
        dx: sx * 0.1,
        dy: sy * 0.1,
        dz: 1.6,
        w: 0.03,
        d: 0.03,
        h: 0.22,
        color: iron,
      })),
    ),
    {
      dx: 0,
      dy: 0,
      dz: 1.82,
      w: 0.34,
      d: 0.34,
      h: 0.16,
      color: iron,
      shape: 'cone',
      sides: 4,
      yaw: Math.PI / 4,
    },
    { dx: 0, dy: 0, dz: 1.96, w: 0.06, d: 0.06, h: 0.06, color: iron, shape: 'dot' },
  ]);
}

export function table(spot: Spot, z: number, ink: Ink): Piece[] {
  const wood = ink.tone('#9b6b45');
  const dark = ink.tone(WOOD_DARK);
  return placed(spot.x, spot.y, z, spot.yaw, [
    { dx: 0, dy: 0, dz: 0.5, w: 1.3, d: 0.7, h: 0.06, color: wood, shape: 'soft' },
    ...[-0.55, 0.55].map((dy): Part => ({
      dx: 0,
      dy,
      dz: 0.3,
      w: 1.3,
      d: 0.24,
      h: 0.05,
      color: wood,
      shape: 'soft',
    })),
    ...[-0.48, 0.48].flatMap((dx): Part[] => [
      { dx, dy: 0, dz: 0, w: 0.07, d: 0.07, h: 0.5, color: dark },
      { dx, dy: 0, dz: 0.24, w: 0.06, d: 1.3, h: 0.06, color: dark },
    ]),
  ]);
}

/** The volume a tree fills, roughly: for placing it before it is built. */
export function treeVolume(tree: Tree, ground: number): Piece[] {
  const crown = {
    oak: 2.1,
    pine: 1.7,
    birch: 1.4,
    jacaranda: 2.4,
    cypress: 0.9,
    round: 1.3,
    palm: 3.2,
  }[tree.kind];
  const tall = {
    oak: 2.3,
    pine: 3.1,
    birch: 2.6,
    jacaranda: 2.3,
    cypress: 3.2,
    round: 2.1,
    palm: 2.7,
  }[tree.kind];
  return [
    {
      x: tree.x,
      y: tree.y,
      z: ground,
      w: crown * tree.size,
      d: crown * tree.size,
      h: tall * tree.size,
      color: '#000000',
    },
  ];
}
