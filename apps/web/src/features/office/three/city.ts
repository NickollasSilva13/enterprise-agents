import { entranceOf, hashText, type OfficeLayout } from '@ea/shared';
import type { Block } from './model';
import { HEIGHTS } from './view';

// What is around the 3D office (Phase 25), as plain data in tiles: the city
// at night of the proposal, the ground far below the floor, the steps down
// from the entrance and the trees at the foot of the building. Kept apart
// from three.js so it is tested without a GPU. Original art.

/** How far below the office floor the street is. */
export const GROUND = -1.7;

/** A small seeded random source, so the same layout always gets the same city. */
export function seeded(seed: string): () => number {
  let state = hashText(seed) || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 10_000) / 10_000;
  };
}

export interface Tower {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly d: number;
  readonly h: number;
  /** Which of the facade tones. */
  readonly tone: number;
  readonly crown: 'neon' | 'antenna' | 'box' | 'none';
  /** 0 for the nearest ring, farther rings fade into the night. */
  readonly ring: number;
  /** Where its windows start in the facade pattern, so no two towers look alike. */
  readonly shift: number;
}

/** Each ring of towers: how far from the office, how far apart, how tall (tiles). */
const RINGS = [
  { gap: 5, step: 6, low: 3, high: 3 },
  { gap: 12, step: 5, low: 5, high: 4 },
  { gap: 21, step: 4, low: 7, high: 6 },
] as const;

export const TOWER_TONES = 4;

/**
 * The towers around the office: a few close ones with room between them,
 * more behind, taller the farther they are, so the skyline rises behind the
 * office as in the proposal. Only behind and beside it: nothing stands
 * between the viewer and the office.
 */
export function towersOf(layout: Pick<OfficeLayout, 'width' | 'height'>): Tower[] {
  const { width, height } = layout;
  const random = seeded('towers-3d');
  const towers: Tower[] = [];
  const crowns = ['neon', 'antenna', 'box', 'none'] as const;
  RINGS.forEach((ring, index) => {
    const add = (x: number, y: number) => {
      // Gaps now and then, so a ring never reads as a wall.
      if (random() < 0.3) return;
      towers.push({
        x,
        y,
        w: 2 + Math.floor(random() * 2),
        d: 2 + Math.floor(random() * 2),
        h: ring.low + random() * ring.high,
        tone: Math.floor(random() * TOWER_TONES),
        crown: crowns[Math.floor(random() * crowns.length)] ?? 'none',
        ring: index,
        shift: Math.floor(random() * 16),
      });
    };
    const edge = -ring.gap - 3;
    const jitter = () => Math.floor(random() * 3);
    // Along the back of the office (north), then along its left side (west).
    for (let x = edge; x < width + ring.gap; x += ring.step + jitter()) add(x, edge - jitter());
    for (let y = edge + ring.step; y < height + ring.gap; y += ring.step + jitter())
      add(edge - jitter(), y);
  });
  return towers;
}

/** Tree spots at the foot of the building, in front of it (behind, a tall floor would hide them). */
export function treesOf(
  layout: Pick<OfficeLayout, 'width' | 'height'>,
): { x: number; y: number; size: number }[] {
  const { width, height } = layout;
  const random = seeded('trees-3d');
  const trees: { x: number; y: number; size: number }[] = [];
  for (let x = -1; x < width + 2; x += 2.2 + random() * 1.8)
    trees.push({ x, y: height + 1.6 + random() * 1.2, size: 0.8 + random() * 0.5 });
  for (let y = -1; y < height + 2; y += 2.2 + random() * 1.8)
    trees.push({ x: width + 1.6 + random() * 1.2, y, size: 0.8 + random() * 0.5 });
  return trees;
}

const darken = (hex: string, amount: number) => {
  const value = Number.parseInt(hex.slice(1), 16);
  const channel = (shift: number) =>
    Math.round(((value >> shift) & 255) * (1 - amount))
      .toString(16)
      .padStart(2, '0');
  return `#${channel(16)}${channel(8)}${channel(0)}`;
};

/** A tree in volume: a trunk and a rounded crown of a few clumps, darker at night. */
export function treeBlocks(
  tree: { x: number; y: number; size: number },
  dusk: number,
  z = GROUND,
): Block[] {
  const { x, y, size } = tree;
  const leaf = (hex: string) => darken(hex, dusk * 0.5);
  const trunk = size * 0.12;
  const crown = size * 0.9;
  const base = z + size * 0.55;
  const clump = (dx: number, dy: number, dz: number, scale: number, color: string): Block => ({
    x: x + dx - (crown * scale) / 2,
    y: y + dy - (crown * scale) / 2,
    z: base + dz,
    w: crown * scale,
    d: crown * scale,
    h: crown * scale * 0.95,
    color: leaf(color),
    shape: 'ball',
  });
  return [
    {
      x: x - trunk / 2,
      y: y - trunk / 2,
      z,
      w: trunk,
      d: trunk,
      h: size * 0.8,
      color: darken('#7a5233', dusk * 0.5),
      shape: 'drum',
    },
    clump(0.12 * size, 0.1 * size, 0, 0.95, '#2f7d3c'),
    clump(-0.15 * size, -0.05 * size, size * 0.15, 0.8, '#3f9b4a'),
    clump(0.05 * size, -0.12 * size, size * 0.4, 0.7, '#57b55a'),
  ];
}

/** Steps from the entrance down to the street, in front of the floor. */
export function stepBlocks(layout: Pick<OfficeLayout, 'height' | 'items'>): Block[] {
  const entrance = entranceOf(layout);
  if (!entrance) return [];
  const count = 6;
  const drop = -GROUND - 0.06;
  return Array.from({ length: count }, (_, step) => ({
    x: entrance.x - 0.4,
    y: layout.height + 0.02 + step * 0.4,
    z: GROUND,
    w: 1.8,
    d: 0.4,
    h: drop - (step * drop) / count,
    color: '#3a2d6e',
  }));
}

/** The panel with the product's mark on the back wall over the reception. */
export function logoBlocks(layout: Pick<OfficeLayout, 'areas' | 'width'>): Block[] {
  const reception = layout.areas.find((area) => area.kind === 'reception');
  const x = reception ? reception.x + reception.width / 2 : layout.width / 2;
  const y = reception ? reception.y + 0.02 : 0.02;
  const mark = '#cdb8ff';
  const top = HEIGHTS.wall - 0.1;
  return [
    { x: x - 0.55, y, z: 0.25, w: 1.1, d: 0.04, h: top - 0.25, color: '#21194a' },
    { x: x - 0.3, y: y + 0.04, z: 0.55, w: 0.6, d: 0.02, h: 0.04, color: mark, glow: true },
    { x: x - 0.3, y: y + 0.04, z: 0.95, w: 0.6, d: 0.02, h: 0.04, color: mark, glow: true },
    { x: x - 0.3, y: y + 0.04, z: 0.55, w: 0.04, d: 0.02, h: 0.44, color: mark, glow: true },
    { x: x + 0.26, y: y + 0.04, z: 0.55, w: 0.04, d: 0.02, h: 0.44, color: mark, glow: true },
    { x: x + 0.02, y: y + 0.04, z: 0.62, w: 0.2, d: 0.02, h: 0.26, color: '#8467ff', glow: true },
  ];
}
