import { entranceOf, hashText, type OfficeLayout } from '@ea/shared';
import type { Block } from './model';
import { HEIGHTS } from './view';

// What belongs to the 3D office whatever is around it (Phase 34, from the
// city of Phase 25): the height of the ground below the floor, the steps
// down from the entrance and the panel with the mark, plus the seeded random
// source every environment plans with. Plain data in tiles, tested without a
// GPU. Original art.

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
