import { buildPresetLayout, OFFICE_PRESETS } from '@ea/shared';
import { describe, expect, it } from 'vitest';
import { GROUND } from '../../approach';
import { hidesOffice, intrudes, sightPoints } from '../clearance';
import { volumeOf } from '../pieces';
import { parkPieces } from './build';
import { heightAt, outside, parkPlan, shoreDistance } from './plan';

// The park keeps the office as it is (Phase 33, D2): nothing of it on the
// platform, its free ground or the steps, and nothing hiding the floor or
// someone standing on it, by day and by night, for every preset.

const layouts = OFFICE_PRESETS.map((preset) =>
  buildPresetLayout(preset, [
    { projectId: 'a', agents: 4 },
    { projectId: 'b', agents: 3 },
    { projectId: null, agents: 2 },
  ]),
);

describe('the park', () => {
  it('stands clear of the office and hides none of it, in every preset, day and night', () => {
    for (const layout of layouts) {
      const plan = parkPlan(layout);
      const points = sightPoints(layout);
      for (const dusk of [0, 1]) {
        const pieces = parkPieces(plan, dusk);
        expect(pieces.length).toBeGreaterThan(500);
        const wrong = pieces.filter((piece) => {
          const volume = volumeOf(piece);
          return intrudes(layout, volume) || hidesOffice(layout, volume, points);
        });
        expect(wrong).toEqual([]);
      }
    }
  }, 60_000);

  it('is flat at ground level under and around the platform', () => {
    for (const layout of layouts) {
      const plan = parkPlan(layout);
      for (let x = -1.5; x <= layout.width + 1.5; x += 0.5)
        for (const y of [-1.5, layout.height / 2, layout.height + 1.5])
          expect(heightAt(plan, x, y)).toBeCloseTo(GROUND, 5);
    }
  });

  it('has its lake, trees of every kind, benches, lamps and the gazebo', () => {
    const plan = parkPlan(layouts[0] ?? buildPresetLayout('complete', []));
    expect(new Set(plan.trees.map((tree) => tree.kind))).toEqual(
      new Set(['oak', 'pine', 'birch', 'jacaranda']),
    );
    expect(plan.benches.length).toBeGreaterThan(3);
    expect(plan.lamps.length).toBeGreaterThan(6);
    expect(plan.tables.length).toBeGreaterThan(0);
    expect(plan.beds.length).toBeGreaterThan(0);
    // The water lies below the ground around it, and nothing grows in it.
    for (const lobe of plan.lake.lobes)
      expect(heightAt(plan, lobe.x, lobe.y)).toBeLessThan(plan.lake.level);
    for (const tree of plan.trees)
      expect(shoreDistance(plan.lake, tree.x, tree.y)).toBeGreaterThan(0);
    expect(outside(plan, plan.gazebo.x, plan.gazebo.y)).toBeGreaterThan(3);
  });

  it('is the same park every time for the same layout', () => {
    const layout = layouts[0] ?? buildPresetLayout('complete', []);
    expect(parkPlan(layout)).toEqual(parkPlan(layout));
  });

  it('is planned quickly enough to open the office without a pause', () => {
    const layout = layouts[0] ?? buildPresetLayout('complete', []);
    // About 100 ms alone in the browser; the bound leaves room for the tests running beside it.
    const start = performance.now();
    const plan = parkPlan(layout);
    parkPieces(plan, 0);
    expect(performance.now() - start).toBeLessThan(1000);
  });
});
