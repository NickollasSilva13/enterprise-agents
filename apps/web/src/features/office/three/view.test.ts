import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { HEIGHTS, officeView, zoomedView } from './view';

const layout = { width: 18, height: 12 };

describe('officeView', () => {
  it('fits the whole floor, walls and slab inside the drawing', () => {
    for (const [width, height] of [
      [1536, 864],
      [760, 560],
      [360, 320],
    ] as const) {
      const view = officeView(layout, width, height);
      for (const x of [0, layout.width])
        for (const y of [0, layout.height])
          for (const z of [-HEIGHTS.slab, HEIGHTS.wall]) {
            const at = view.project(x, y, z);
            expect(at.x).toBeGreaterThanOrEqual(0);
            expect(at.x).toBeLessThanOrEqual(width);
            expect(at.y).toBeGreaterThanOrEqual(0);
            expect(at.y).toBeLessThanOrEqual(height);
          }
    }
  });

  it('looks from the front corner, as the SVG office did', () => {
    const view = officeView(layout, 1000, 600);
    const origin = view.project(0, 0);
    // Along x the screen goes right and down; along y, left and down; up is up.
    expect(view.project(1, 0).x).toBeGreaterThan(origin.x);
    expect(view.project(1, 0).y).toBeGreaterThan(origin.y);
    expect(view.project(0, 1).x).toBeLessThan(origin.x);
    expect(view.project(0, 1).y).toBeGreaterThan(origin.y);
    expect(view.project(0, 0, 1).y).toBeLessThan(origin.y);
    // The front corner is the lowest point of the floor.
    expect(view.project(layout.width, layout.height).y).toBeGreaterThan(
      view.project(layout.width, 0).y,
    );
  });

  it('puts every point where the three.js camera puts it, so the SVG layer matches the canvas', () => {
    const view = officeView(layout, 1200, 700);
    const camera = new THREE.OrthographicCamera(-600, 600, 350, -350, 0.1, 400);
    camera.zoom = view.zoom;
    const [tx, ty, tz] = view.target;
    const [dx, dy, dz] = view.direction;
    camera.position.set(tx + dx * 100, ty + dy * 100, tz + dz * 100);
    camera.lookAt(tx, ty, tz);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    for (const [x, y, z] of [
      [0, 0, 0],
      [18, 12, 0],
      [4.5, 7.25, 1.2],
      [18, 0, -0.5],
    ] as const) {
      const ndc = new THREE.Vector3(x, z, y).project(camera);
      const expected = view.project(x, y, z);
      expect((ndc.x + 1) * 600).toBeCloseTo(expected.x, 3);
      expect((1 - ndc.y) * 350).toBeCloseTo(expected.y, 3);
    }
  });

  it('finds the tile under a pixel, at any height, as the inverse of project', () => {
    const view = officeView(layout, 1200, 700);
    for (const [x, y, z] of [
      [0, 0, 0],
      [3.4, 9.1, 0],
      [17.9, 0.2, 0],
      [6, 6, 1.2],
    ] as const) {
      const at = view.project(x, y, z);
      const back = view.unproject(at.x, at.y, z);
      expect(back.x).toBeCloseTo(x, 6);
      expect(back.y).toBeCloseTo(y, 6);
    }
  });
});

describe('zoomedView', () => {
  const base = officeView(layout, 1200, 700);

  it('is the same view when the whole drawing is visible', () => {
    const same = zoomedView(base, { x: 0, y: 0, width: 1200, height: 700 });
    expect(same.zoom).toBeCloseTo(base.zoom, 9);
    for (const [index, value] of same.target.entries())
      expect(value).toBeCloseTo(base.target[index] ?? Number.NaN, 9);
  });

  it('stretches the visible rectangle over the whole drawing', () => {
    const visible = { x: 300, y: 120, width: 400, height: 700 / 3 };
    const zoomed = zoomedView(base, visible);
    for (const [x, y, z] of [
      [2, 3, 0],
      [9, 6, 0.5],
      [15, 1, 1.4],
    ] as const) {
      const before = base.project(x, y, z);
      const after = zoomed.project(x, y, z);
      expect(after.x).toBeCloseTo((before.x - visible.x) * 3, 6);
      expect(after.y).toBeCloseTo((before.y - visible.y) * 3, 6);
    }
  });
});
