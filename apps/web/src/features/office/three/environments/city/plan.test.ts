import { buildPresetLayout, OFFICE_PRESETS } from '@ea/shared';
import { describe, expect, it } from 'vitest';
import { GROUND } from '../../approach';
import { hidesOffice, sightPoints } from '../clearance';
import { inkOf } from '../kit';
import { cityPlan, shop, streetsOf, towersOf } from './plan';

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
    const rings = [0, 1, 2, 3].map((ring) => towers.filter((tower) => tower.ring === ring));
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

describe('the city as an environment (Phase 34, redrawn after Phase 38)', () => {
  it('keeps every tower off the avenues and hides nothing of the office, in every preset', () => {
    for (const preset of OFFICE_PRESETS) {
      const office = buildPresetLayout(preset, [{ projectId: 'a', agents: 4 }]);
      const points = sightPoints(office);
      const { side, sideWalk, front, frontWalk } = streetsOf(office);
      const towers = towersOf(office);
      for (const tower of towers) {
        expect(tower.x + tower.w <= side.x0 || tower.x >= sideWalk.x1).toBe(true);
        expect(tower.y + tower.d <= front.y0 || tower.y >= frontWalk.y1).toBe(true);
      }
      const volumes = towers.map((tower) => ({
        x0: tower.x - 0.16,
        x1: tower.x + tower.w + 0.16,
        y0: tower.y - 0.16,
        y1: tower.y + tower.d + 0.16,
        z0: GROUND,
        z1: GROUND + tower.h + 1.6,
      }));
      expect(volumes.filter((volume) => hidesOffice(office, volume, points))).toEqual([]);
    }
  });

  it('has the square, shops, traffic lights, street trees, lamps and cars', () => {
    const plan = cityPlan(layout);
    const count = (kind: string) => plan.things.filter((thing) => thing.kind === kind).length;
    expect(count('car')).toBeGreaterThan(10);
    expect(count('bench')).toBeGreaterThan(2);
    expect(count('bollard')).toBeGreaterThan(5);
    expect(count('pieces')).toBeGreaterThan(30);
    expect(plan.lamps.length).toBeGreaterThan(8);
  });

  it('builds shops with windows that light at night only', () => {
    const spec = {
      x: 0,
      y: 30,
      yaw: Math.PI,
      w: 4,
      d: 4,
      floors: 3,
      wall: '#e8d9c0',
      awning: '#c8553d',
      seed: 7,
    };
    const glowing = (dusk: number, light: number) =>
      shop(spec, inkOf(dusk), light).filter((piece) => piece.surface === 'glow').length;
    expect(glowing(0, 1)).toBe(0);
    expect(glowing(1, 0)).toBeGreaterThan(3);
  });
});
