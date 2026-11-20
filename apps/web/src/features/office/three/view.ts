// The camera of the 3D office (Phase 24, D6): orthographic, high and on the
// diagonal, framing the whole floor. Kept as plain math, apart from three.js,
// so the WebGL camera and the SVG layer over it (signs, balloons, the marks
// the tests read) project every point to the same pixel, and so it is tested
// without a GPU.
//
// World axes: tile x is world x, tile y is world z, height is world y, in
// tiles. The viewer looks from the front corner of the floor (+x, +y), as the
// SVG office did: the screen goes right with x and left with y.

export type Vec3 = readonly [number, number, number];

/** How high the camera looks down from, in degrees: higher than true isometric, as in the proposal. */
export const ELEVATION = 38;

/** Heights of the scene, in tiles. */
export const HEIGHTS = {
  /** The tall glass walls at the back of each room. */
  wall: 1.45,
  /** The low glass walls at the front, which hide nothing. */
  lowWall: 0.55,
  /** The thickness of the floor under the office. */
  slab: 0.8,
  /** A standing character. */
  character: 1.15,
  /** Where a seated character's hips are. */
  seat: 0.3,
} as const;

const SQRT_HALF = Math.SQRT1_2;
/** Screen right, on the floor. */
const RIGHT: Vec3 = [SQRT_HALF, 0, -SQRT_HALF];

/** From the point looked at toward the camera. */
export function cameraDirection(elevation = ELEVATION): Vec3 {
  const e = (elevation * Math.PI) / 180;
  return [Math.cos(e) * SQRT_HALF, Math.sin(e), Math.cos(e) * SQRT_HALF];
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

export interface OfficeView {
  /** Size of the drawing in CSS pixels. */
  readonly width: number;
  readonly height: number;
  /** The point at the middle of the screen. */
  readonly target: Vec3;
  /** From the target toward the camera, unit length. */
  readonly direction: Vec3;
  /** Pixels per tile. */
  readonly zoom: number;
  /** A tile point (x, y on the floor, z up, in tiles) to a pixel of the drawing. */
  project(x: number, y: number, z?: number): { x: number; y: number };
  /**
   * The tile point at height `z` under a pixel of the drawing: what the
   * pointer is over, for the editor (Phase 28). The inverse of `project`.
   */
  unproject(px: number, py: number, z?: number): { x: number; y: number };
}

/** Free space around the office, as a share of the drawing. */
const MARGIN = 0.06;

/**
 * The view that shows the whole office (floor, walls and the slab under it)
 * in a drawing of `width` × `height` pixels.
 */
export function officeView(
  layout: { readonly width: number; readonly height: number },
  width: number,
  height: number,
): OfficeView {
  const direction = cameraDirection();
  const right = RIGHT;
  const up = cross(direction, right);
  const corners: Vec3[] = [];
  for (const x of [0, layout.width])
    for (const z of [0, layout.height])
      for (const y of [-HEIGHTS.slab, HEIGHTS.wall]) corners.push([x, y, z]);
  const across = corners.map((corner) => dot(corner, right));
  const along = corners.map((corner) => dot(corner, up));
  const spanX = Math.max(...across) - Math.min(...across);
  const spanY = Math.max(...along) - Math.min(...along);
  const zoom = Math.max(
    1,
    Math.min(
      (width * (1 - 2 * MARGIN)) / Math.max(spanX, 1e-6),
      (height * (1 - 2 * MARGIN)) / Math.max(spanY, 1e-6),
    ),
  );
  const midX = (Math.max(...across) + Math.min(...across)) / 2;
  const midY = (Math.max(...along) + Math.min(...along)) / 2;
  // The point on the floor's plane of view whose screen position is the middle.
  const target: Vec3 = [
    right[0] * midX + up[0] * midY,
    right[1] * midX + up[1] * midY,
    right[2] * midX + up[2] * midY,
  ];
  return viewOf(width, height, target, zoom);
}

function viewOf(width: number, height: number, target: Vec3, zoom: number): OfficeView {
  const direction = cameraDirection();
  const up = cross(direction, RIGHT);
  return {
    width,
    height,
    target,
    direction,
    zoom,
    project(x, y, z = 0) {
      const point: Vec3 = [x - target[0], z - target[1], y - target[2]];
      return {
        x: width / 2 + zoom * dot(point, RIGHT),
        y: height / 2 - zoom * dot(point, up),
      };
    },
    unproject(px, py, z = 0) {
      // The pixel is a line along the direction of view; it meets the plane of height z once.
      const across = (px - width / 2) / zoom;
      const along = -(py - height / 2) / zoom;
      const depth = (z - target[1] - up[1] * along) / direction[1];
      return {
        x: target[0] + RIGHT[0] * across + up[0] * along + direction[0] * depth,
        y: target[2] + RIGHT[2] * across + up[2] * along + direction[2] * depth,
      };
    },
  };
}

/** A rectangle of the drawing, in its pixels. */
export interface ViewRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The view that shows only `visible`, a rectangle of `base`'s drawing with
 * its proportions, on the whole drawing: the editor's zoom and pan (Phase 28),
 * which keep the camera of `base` and move only its frame.
 */
export function zoomedView(base: OfficeView, visible: ViewRect): OfficeView {
  const across = (visible.x + visible.width / 2 - base.width / 2) / base.zoom;
  const along = -(visible.y + visible.height / 2 - base.height / 2) / base.zoom;
  const up = cross(base.direction, RIGHT);
  const target: Vec3 = [
    base.target[0] + RIGHT[0] * across + up[0] * along,
    base.target[1] + RIGHT[1] * across + up[1] * along,
    base.target[2] + RIGHT[2] * across + up[2] * along,
  ];
  return viewOf(base.width, base.height, target, (base.zoom * base.width) / visible.width);
}
