import { buildPresetLayout, OFFICE_PRESETS } from '@ea/shared';
import { describe, expect, it } from 'vitest';
import { hidesOffice, intrudes, sightPoints } from './clearance';
import { GROUND } from '../approach';
import { condoPlan } from './condo/plan';
import { gardenPlan } from './garden/plan';
import { coastDistance, islandHeight, islandPlan, SEA } from './island/plan';
import { neighborhoodPlan } from './neighborhood/plan';
import { volumeOf } from './pieces';
import { townPieces } from './town';

// The residential neighbourhood and the modern condominium (Phase 35), the
// tropical island and the technological garden (Phase 36) keep
// the office as it is, as the park does: nothing on the platform, its free
// ground or the steps, nothing hiding the floor or someone standing on it,
// by day and by night, in every preset.

const layouts = OFFICE_PRESETS.map((preset) =>
  buildPresetLayout(preset, [
    { projectId: 'a', agents: 4 },
    { projectId: 'b', agents: 3 },
    { projectId: null, agents: 2 },
  ]),
);

const plans = {
  neighborhood: (layout: (typeof layouts)[number]) => neighborhoodPlan(layout).things,
  condo: (layout: (typeof layouts)[number]) => condoPlan(layout).things,
  island: (layout: (typeof layouts)[number]) => islandPlan(layout).things,
  techGarden: (layout: (typeof layouts)[number]) => gardenPlan(layout).things,
};

describe.each(Object.entries(plans))('the %s', (_, planOf) => {
  it('stands clear of the office and hides none of it, in every preset, day and night', () => {
    for (const layout of layouts) {
      const things = planOf(layout);
      const points = sightPoints(layout);
      for (const [dusk, light] of [
        [0, 1],
        [1, 0],
      ] as const) {
        const pieces = townPieces(things, dusk, light);
        expect(pieces.length).toBeGreaterThan(800);
        const wrong = pieces.filter((piece) => {
          const volume = volumeOf(piece);
          return intrudes(layout, volume) || hidesOffice(layout, volume, points);
        });
        expect(wrong).toEqual([]);
        // Nothing of no size or out of place reaches the GPU.
        for (const piece of pieces)
          for (const value of [piece.x, piece.y, piece.z, piece.w, piece.d, piece.h])
            expect(Number.isFinite(value)).toBe(true);
      }
    }
  }, 60_000);

  it('is the same every time for the same layout, and planned quickly', () => {
    const layout = layouts[0] ?? buildPresetLayout('complete', []);
    // About 100 ms alone in the browser; the bound leaves room for the tests running beside it.
    const start = performance.now();
    const things = planOf(layout);
    townPieces(things, 0, 1);
    expect(performance.now() - start).toBeLessThan(1000);
    expect(JSON.stringify(planOf(layout))).toBe(JSON.stringify(things));
  });

  it('lights windows at night and none by day', () => {
    const layout = layouts[0] ?? buildPresetLayout('complete', []);
    const things = planOf(layout);
    const glowing = (dusk: number, light: number) =>
      townPieces(things, dusk, light).filter((piece) => piece.surface === 'glow').length;
    expect(glowing(0, 1)).toBe(0);
    expect(glowing(1, 0)).toBeGreaterThan(20);
  });
});

describe('the street of the neighbourhood', () => {
  it('has houses, cars, lamps, trees and the fence of the office lot', () => {
    const plan = neighborhoodPlan(layouts[0] ?? buildPresetLayout('complete', []));
    const count = (kind: string) => plan.things.filter((thing) => thing.kind === kind).length;
    expect(count('house')).toBeGreaterThan(6);
    expect(count('car')).toBeGreaterThan(4);
    expect(count('tree')).toBeGreaterThan(10);
    expect(count('fence')).toBeGreaterThanOrEqual(5);
    expect(plan.lamps.length).toBeGreaterThan(6);
  });
});

describe('the condominium', () => {
  it('has modern houses, the pool with loungers and parasols, and bollards', () => {
    const plan = condoPlan(layouts[0] ?? buildPresetLayout('complete', []));
    const count = (kind: string) => plan.things.filter((thing) => thing.kind === kind).length;
    expect(count('modern')).toBeGreaterThan(4);
    expect(count('lounger')).toBeGreaterThan(2);
    expect(count('parasol')).toBeGreaterThan(0);
    expect(plan.lights.length).toBeGreaterThan(10);
    expect(plan.pool.w * plan.pool.d).toBeGreaterThan(20);
  });
});

describe('the tropical island', () => {
  it('is flat sand under and around the platform, with the sea beyond the beach', () => {
    const layout = layouts[0] ?? buildPresetLayout('complete', []);
    const plan = islandPlan(layout);
    for (let x = -2; x <= layout.width + 2; x += 1)
      for (const y of [-2, layout.height / 2, layout.height + 2])
        expect(islandHeight(plan.shape, x, y)).toBe(GROUND);
    // Far out it is sea, and the sea floor lies under the water.
    expect(coastDistance(plan.shape, layout.width / 2, layout.height + 30)).toBeGreaterThan(0);
    expect(islandHeight(plan.shape, layout.width / 2, layout.height + 30)).toBeLessThan(SEA);
  });

  it('has palms, the pier with its bungalows, loungers and torches', () => {
    const plan = islandPlan(layouts[0] ?? buildPresetLayout('complete', []));
    const palms = plan.things.filter(
      (thing) => thing.kind === 'tree' && thing.tree.kind === 'palm',
    );
    expect(palms.length).toBeGreaterThan(20);
    expect(plan.things.filter((thing) => thing.kind === 'lounger').length).toBeGreaterThan(2);
    expect(plan.torches.length).toBeGreaterThan(4);
  });
});

describe('the technological garden', () => {
  it('has trees of light, the pool on the axis, planters, canopies and turbines', () => {
    const layout = layouts[0] ?? buildPresetLayout('complete', []);
    const plan = gardenPlan(layout);
    expect(plan.lights.length).toBeGreaterThan(10);
    expect(plan.pool.w * plan.pool.d).toBeGreaterThan(8);
    expect(plan.things.filter((thing) => thing.kind === 'pieces').length).toBeGreaterThan(30);
  });
});
