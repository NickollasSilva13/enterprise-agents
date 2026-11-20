import { mix } from '../../../components/pixel-art/shade';

// Isometric projection (2:1) of the office grid. Tile coordinates go in; SVG
// user units come out. A tile is 32 units wide and 16 high on screen; `z`
// lifts a point straight up, in the same units.

export const TILE_W = 32;
export const TILE_H = 16;

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

export const project = (x: number, y: number, z = 0): ScreenPoint => ({
  x: ((x - y) * TILE_W) / 2,
  y: ((x + y) * TILE_H) / 2 - z,
});

/** The tile coordinates under a point of the screen, on the floor. */
export function unproject(point: ScreenPoint): { x: number; y: number } {
  const a = point.x / (TILE_W / 2);
  const b = point.y / (TILE_H / 2);
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

const fmt = (value: number) => Math.round(value * 100) / 100;

/** The `points` attribute of a polygon through tile points. */
export function points(corners: readonly (readonly [number, number, number?])[]): string {
  return corners
    .map(([x, y, z]) => {
      const p = project(x, y, z ?? 0);
      return `${fmt(p.x)},${fmt(p.y)}`;
    })
    .join(' ');
}

/** The floor of a rectangle of tiles. */
export const floorPoints = (x: number, y: number, w: number, d: number, z = 0): string =>
  points([
    [x, y, z],
    [x + w, y, z],
    [x + w, y + d, z],
    [x, y + d, z],
  ]);

export interface BoxColors {
  readonly top: string;
  /** The face toward the bottom left of the screen (facing +y). */
  readonly left: string;
  /** The face toward the bottom right of the screen (facing +x). */
  readonly right: string;
  /** A dark outline around each face, as the characters have (Phase 23). */
  readonly edge?: string;
}

/**
 * A box standing on the grid: from (x, y) it spans `w` along x and `d` along
 * y, from height `z` to `z + h`. Only the three faces seen from the front are drawn.
 */
export function IsoBox({
  x,
  y,
  w,
  d,
  h,
  z = 0,
  colors,
  className,
}: {
  x: number;
  y: number;
  w: number;
  d: number;
  h: number;
  z?: number;
  colors: BoxColors;
  className?: string;
}) {
  const top = z + h;
  const stroke = colors.edge
    ? { stroke: colors.edge, strokeWidth: 0.6, strokeLinejoin: 'round' as const }
    : {};
  return (
    <g className={className}>
      <polygon
        points={points([
          [x, y + d, z],
          [x + w, y + d, z],
          [x + w, y + d, top],
          [x, y + d, top],
        ])}
        fill={colors.left}
        {...stroke}
      />
      <polygon
        points={points([
          [x + w, y, z],
          [x + w, y + d, z],
          [x + w, y + d, top],
          [x + w, y, top],
        ])}
        fill={colors.right}
        {...stroke}
      />
      <polygon points={floorPoints(x, y, w, d, top)} fill={colors.top} {...stroke} />
    </g>
  );
}

/** Light top, middle left face, dark right face, from one colour family. */
export const shades = (top: string, left: string, right: string): BoxColors => ({
  top,
  left,
  right,
});

const WARM_LIGHT = '#fff6e8';
const NIGHT = '#1d1530';

/**
 * The faces of a box from one colour, in the tones of the characters (Phase
 * 23): a lit top, the colour itself toward the viewer's left, a shadow on the
 * right, and a dark outline.
 */
export const tones = (base: string): BoxColors => ({
  top: mix(base, WARM_LIGHT, 0.28),
  left: base,
  right: mix(base, NIGHT, 0.22),
  edge: mix(base, NIGHT, 0.75),
});
