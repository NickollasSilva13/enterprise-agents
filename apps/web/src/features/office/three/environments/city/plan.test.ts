import { buildPresetLayout, OFFICE_PRESETS } from '@ea/shared';
import { describe, expect, it } from 'vitest';
import { GROUND, stepBlocks } from '../../approach';
import { hidesOffice, sightPoints } from '../clearance';
import { towersOf, treeBlocks, treesOf } from './plan';

const layout = { width: 18, height: 12, items: [] };

describe('towersOf', () => {
  it('always builds the same city for the same office', () => {
    expect(towersOf(layout)).toEqual(towersOf(layout));
  });

  it('keeps every tower off the office and out of the way in front of it', () => {
    for (const tower of towersOf(layout)) {
      const overlapsX = tower.x < layout.width && tower.x + tower.w > 0;
      const overlapsY = tower.y < layout.height && tower.y + tower.d > 0;
      expect(overlapsX && overlapsY).toBe(false);
      // Behind (north) or beside (west): never between the viewer and the floor.
      expect(tower.x < 0 || tower.y < 0).toBe(true);
    }
  });

  it('spaces the towers in rings that rise with distance, with room between them', () => {
    const towers = towersOf(layout);
    const rings = [0, 1, 2].map((ring) => towers.filter((tower) => tower.ring === ring));
    for (const ring of rings) expect(ring.length).toBeGreaterThan(0);
    const tallest = rings.map((ring) => Math.max(...ring.map((tower) => tower.h)));
    expect(tallest[0]).toBeLessThan(tallest[2] ?? 0);
    // No two towers of the same ring share ground.
    for (const ring of rings)
      for (const a of ring)
        for (const b of ring) {
          if (a === b) continue;
          const apart =
            a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.d <= b.y || b.y + b.d <= a.y;
          expect(apart).toBe(true);
        }
  });
});

describe('the street around the building', () => {
  it('puts the trees in front of the office, on the street', () => {
    const trees = treesOf(layout);
    expect(trees.length).toBeGreaterThan(4);
    for (const tree of trees) expect(tree.x > layout.width || tree.y > layout.height).toBe(true);
    for (const block of treeBlocks(trees[0] ?? { x: 0, y: 0, size: 1 }, 0))
      expect(block.z).toBeGreaterThanOrEqual(GROUND);
  });

  it('darkens the leaves at night', () => {
    const tree = { x: 20, y: 3, size: 1 };
    const day = treeBlocks(tree, 0).map((block) => block.color);
    const night = treeBlocks(tree, 1).map((block) => block.color);
    expect(night).not.toEqual(day);
  });
});

describe('the city as an environment (Phase 34)', () => {
  it('hides nothing of the office, in every preset, by day and by night', () => {
    for (const preset of OFFICE_PRESETS) {
      const office = buildPresetLayout(preset, [{ projectId: 'a', agents: 4 }]);
      const points = sightPoints(office);
      const volumes = [
        ...towersOf(office).map((tower) => ({
          x0: tower.x,
          x1: tower.x + tower.w,
          y0: tower.y,
          y1: tower.y + tower.d,
          z0: GROUND,
          z1: GROUND + tower.h + 1.2,
        })),
        ...[0, 1].flatMap((dusk) =>
          treesOf(office).flatMap((tree) =>
            treeBlocks(tree, dusk).map((block) => ({
              x0: block.x,
              x1: block.x + block.w,
              y0: block.y,
              y1: block.y + block.d,
              z0: block.z,
              z1: block.z + block.h,
            })),
          ),
        ),
      ];
      expect(volumes.filter((volume) => hidesOffice(office, volume, points))).toEqual([]);
      // Its trees keep their place of Phase 25 (some crowns nearer the platform
      // than the park's free ground, low enough to hide nothing), but none on the steps.
      for (const step of stepBlocks(office))
        for (const tree of treesOf(office)) {
          const r = tree.size * 0.5 + 0.1;
          const apart =
            tree.x + r <= step.x ||
            tree.x - r >= step.x + step.w ||
            tree.y + r <= step.y ||
            tree.y - r >= step.y + step.d;
          expect(apart).toBe(true);
        }
    }
  });
});
