import type { OfficeLayout } from '@ea/shared';
import { GROUND, stepBlocks } from '../approach';
import { cameraDirection, HEIGHTS, officeView, type OfficeView } from '../view';
import { type Piece, type Volume, volumeOf } from './pieces';

// The rules every environment keeps around the office (Phase 33, D2), as
// plain math: nothing of it stands on the platform or within `CLEARANCE` of
// it, nor on the steps, and nothing hides any point of the floor or of a
// standing agent from the camera. The plans use them to place things and
// their tests check the result.

type Layout = Pick<OfficeLayout, 'width' | 'height' | 'items'>;

/** Free ground around the platform, in tiles. */
export const CLEARANCE = 1.2;

/** Anything lower than this over the ground lies flat on it (paving, water, light on the grass). */
const FLAT = 0.06;

const overlaps = (a: Volume, b: Omit<Volume, 'z0' | 'z1'>) =>
  a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

/** Whether a volume stands on the platform, its free ground or the steps. */
export function intrudes(layout: Layout, volume: Volume): boolean {
  if (volume.z1 <= GROUND + FLAT) return false;
  const platform = {
    x0: -CLEARANCE,
    y0: -CLEARANCE,
    x1: layout.width + CLEARANCE,
    y1: layout.height + CLEARANCE,
  };
  if (overlaps(volume, platform)) return true;
  return stepBlocks(layout).some((step) =>
    overlaps(volume, {
      x0: step.x - 0.3,
      y0: step.y,
      x1: step.x + step.w + 0.3,
      y1: step.y + step.d + 0.3,
    }),
  );
}

/** Points of the office that must stay in sight: the floor, and the height of the tall walls over it. */
export function sightPoints(layout: Layout): [number, number, number][] {
  const points: [number, number, number][] = [];
  for (let x = 0.25; x < layout.width; x += 0.5)
    for (let y = 0.25; y < layout.height; y += 0.5)
      for (const z of [0.02, HEIGHTS.wall]) points.push([x, y, z]);
  return points;
}

/** Whether the line from a point toward the camera passes through the volume (the slab method). */
function blocks(volume: Volume, point: readonly [number, number, number]): boolean {
  // Toward the camera: +x, +y and up, in tiles.
  const [dx, dz, dy] = cameraDirection();
  let enter = 0;
  let leave = Number.POSITIVE_INFINITY;
  for (const [from, step, low, high] of [
    [point[0], dx, volume.x0, volume.x1],
    [point[1], dy, volume.y0, volume.y1],
    [point[2], dz, volume.z0, volume.z1],
  ] as const) {
    if (Math.abs(step) < 1e-9) {
      if (from < low || from > high) return false;
      continue;
    }
    const a = (low - from) / step;
    const b = (high - from) / step;
    enter = Math.max(enter, Math.min(a, b));
    leave = Math.min(leave, Math.max(a, b));
    if (enter > leave) return false;
  }
  return true;
}

/** Whether a volume hides some point of the office floor or of someone standing on it. */
export function hidesOffice(layout: Layout, volume: Volume, points = sightPoints(layout)): boolean {
  // The line of sight only rises: what is lower than the floor never hides it.
  if (volume.z1 <= 0) return false;
  // It only goes toward +x and +y: a point past the volume on either is never hidden by it.
  return points.some(
    (point) => point[0] < volume.x1 && point[1] < volume.y1 && blocks(volume, point),
  );
}

/**
 * The drawings the environments are planned for: the office seen whole on a
 * wide screen, on a wider one and on a phone held upright. Detail goes only
 * where one of them can show it.
 */
export function framesOf(layout: Pick<OfficeLayout, 'width' | 'height'>): OfficeView[] {
  return [
    officeView(layout, 1000, 700),
    officeView(layout, 1400, 700),
    officeView(layout, 700, 900),
  ];
}

/** Whether a point (in tiles, z up) shows in one of the frames, with `pad` pixels of room. */
export function inSight(frames: readonly OfficeView[], x: number, y: number, z: number, pad = 0) {
  return frames.some((frame) => {
    const pixel = frame.project(x, y, z);
    return (
      pixel.x >= -pad &&
      pixel.x <= frame.width + pad &&
      pixel.y >= -pad &&
      pixel.y <= frame.height + pad
    );
  });
}

export interface Placer {
  /** Whether every piece of a thing stays clear of the office and hides none of it. */
  readonly fits: (pieces: readonly Piece[]) => boolean;
  /** Whether a point shows in some frame (with room around), so detail there is worth drawing. */
  readonly seen: (x: number, y: number, z?: number) => boolean;
}

/** The rules above for one layout, computed once for many things. */
export function placerOf(layout: Layout): Placer {
  const frames = framesOf(layout);
  const points = sightPoints(layout);
  return {
    fits: (pieces) =>
      pieces.every((piece) => {
        const volume = volumeOf(piece);
        return !intrudes(layout, volume) && !hidesOffice(layout, volume, points);
      }),
    seen: (x, y, z = GROUND) => inSight(frames, x, y, z, 40),
  };
}
