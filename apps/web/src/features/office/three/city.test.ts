import type { OfficeArea, OfficeItem } from '@ea/shared';
import { describe, expect, it } from 'vitest';
import { GROUND, logoBlocks, stepBlocks, towersOf, treeBlocks, treesOf } from './city';

const layout = { width: 18, height: 12 };

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

  it('runs the steps from the entrance down to the street', () => {
    const items = [{ kind: 'entrance', x: 5, y: 11 } as OfficeItem];
    const steps = stepBlocks({ height: 12, items });
    expect(steps.length).toBeGreaterThan(1);
    for (const step of steps) expect(step.z).toBe(GROUND);
    // Each step is lower than the one before, going away from the floor.
    for (let index = 1; index < steps.length; index += 1) {
      expect(steps[index]?.h).toBeLessThan(steps[index - 1]?.h ?? 0);
      expect(steps[index]?.y).toBeGreaterThan(steps[index - 1]?.y ?? 0);
    }
    expect(stepBlocks({ height: 12, items: [] })).toEqual([]);
  });

  it('hangs the mark on the back wall of the reception, lit', () => {
    const reception = { kind: 'reception', x: 6, y: 0, width: 4 } as OfficeArea;
    const blocks = logoBlocks({ areas: [reception], width: 18 });
    expect(blocks.some((block) => block.glow)).toBe(true);
    for (const block of blocks) {
      expect(block.x).toBeGreaterThanOrEqual(6);
      expect(block.x + block.w).toBeLessThanOrEqual(10);
    }
  });
});
