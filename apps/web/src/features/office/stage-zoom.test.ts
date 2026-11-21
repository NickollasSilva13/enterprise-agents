import { describe, expect, it } from 'vitest';
import { clampFrame, MAX_ZOOM, panFrame, WHOLE, zoomFrame } from './stage-zoom';

describe('office zoom', () => {
  it('keeps the point under the pointer where it is', () => {
    const frame = zoomFrame(WHOLE, 2, { x: 0.25, y: 0.75 });
    expect(frame.size).toBeCloseTo(0.5);
    // The point at a quarter of the width and three quarters of the height stays under the pointer.
    expect(frame.x + 0.25 * frame.size).toBeCloseTo(0.25);
    expect(frame.y + 0.75 * frame.size).toBeCloseTo(0.75);
  });

  it('goes no closer than the limit and no farther than the whole office', () => {
    let frame = WHOLE;
    for (let step = 0; step < 30; step += 1) frame = zoomFrame(frame, 1.3);
    expect(frame.size).toBeCloseTo(1 / MAX_ZOOM);
    for (let step = 0; step < 30; step += 1) frame = zoomFrame(frame, 1 / 1.3);
    expect(frame).toEqual(WHOLE);
  });

  it('pans with the drag and never leaves the drawing', () => {
    const zoomed = zoomFrame(WHOLE, 2);
    const moved = panFrame(zoomed, -0.2, 0);
    // Dragging to the left shows more of the right.
    expect(moved.x).toBeGreaterThan(zoomed.x);
    expect(panFrame(zoomed, 5, 5)).toMatchObject({ x: 0, y: 0 });
    expect(panFrame(zoomed, -5, -5)).toMatchObject({ x: 0.5, y: 0.5 });
    expect(panFrame(WHOLE, 0.3, 0.3)).toEqual(WHOLE);
  });

  it('clamps a frame bigger than the office back to the whole', () => {
    expect(clampFrame({ x: -1, y: 2, size: 3 })).toEqual(WHOLE);
  });
});
