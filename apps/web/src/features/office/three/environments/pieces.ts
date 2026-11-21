// The volumes an environment is built of (Phase 33), as plain data in tiles,
// apart from three.js so the plans are tested without a GPU. Unlike the
// office's `Block` (a corner and a size), a piece stands on its centre:
// trees, lamps and benches are placed and turned around where they stand.

export type Shape =
  /** A plain box. */
  | 'box'
  /** A box with rounded edges (planks, stones, cushions of moss). */
  | 'soft'
  | 'ball'
  /** A cylinder; with few `sides`, a prism (an octagonal basin). */
  | 'drum'
  /** A cone; with four `sides`, a pyramid (the cap of a lamp). */
  | 'cone'
  /** A rounded low-poly lump, a little irregular: foliage, rocks, bushes. */
  | 'blob'
  /** A tiny lump of few faces: a flower, a firefly. */
  | 'dot'
  /** A roof of two slopes: the ridge runs along its width (x), up to its full height. */
  | 'gable';

/** `facet` is matte with flat faces, for the low-poly foliage and rocks. */
export type Surface = 'matte' | 'facet' | 'gloss' | 'glow';

export interface Piece {
  /** Centre on the ground and height of the base, in tiles. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Size along x, along y and up, before turning. */
  readonly w: number;
  readonly d: number;
  readonly h: number;
  readonly color: string;
  readonly shape?: Shape;
  readonly surface?: Surface;
  /** Turn about the vertical, in radians. */
  readonly yaw?: number;
  /** Lean forward (about its own x), in radians: a backrest, a reed. */
  readonly tilt?: number;
  /** Faces around a drum or a cone. */
  readonly sides?: number;
  /** Makes each lump of foliage or rock its own. */
  readonly seed?: number;
  /** How much darker its foot is than its top (0 to 1): baked shading. */
  readonly shade?: number;
}

/** A piece of a thing, placed from the thing's centre and turned with it. */
export interface Part extends Omit<Piece, 'x' | 'y' | 'z'> {
  readonly dx: number;
  readonly dy: number;
  readonly dz: number;
}

/** The parts of a thing standing at (x, y, z), turned by `yaw`. */
export function placed(
  x: number,
  y: number,
  z: number,
  yaw: number,
  parts: readonly Part[],
): Piece[] {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return parts.map(({ dx, dy, dz, ...part }) => ({
    ...part,
    // The same turn three.js gives a geometry about its vertical (x → x, tile y → z).
    x: x + dx * cos + dy * sin,
    y: y - dx * sin + dy * cos,
    z: z + dz,
    yaw: yaw + (part.yaw ?? 0),
  }));
}

/** A box in tiles: on the ground from (x0, y0) to (x1, y1), from height z0 to z1. */
export interface Volume {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  readonly z0: number;
  readonly z1: number;
}

/** The box a piece fits in, whatever its turn. */
export function volumeOf(piece: Piece): Volume {
  const yaw = piece.yaw ?? 0;
  const cos = Math.abs(Math.cos(yaw));
  const sin = Math.abs(Math.sin(yaw));
  // A lean reaches out as far as its height (and a blob a little past its size).
  const lean = piece.tilt ? Math.abs(Math.sin(piece.tilt)) * piece.h : 0;
  const swell = piece.shape === 'blob' ? 1.15 : 1;
  const halfX = ((cos * piece.w + sin * piece.d) / 2) * swell + lean;
  const halfY = ((sin * piece.w + cos * piece.d) / 2) * swell + lean;
  return {
    x0: piece.x - halfX,
    x1: piece.x + halfX,
    y0: piece.y - halfY,
    y1: piece.y + halfY,
    z0: piece.z,
    z1: piece.z + piece.h * swell,
  };
}

/** Darker (amount 0 to 1) or, below 0, lighter: the same colour as the hex given. */
export function shadeOf(hex: string, amount: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const channel = (shift: number) => {
    const c = (value >> shift) & 255;
    const next = amount >= 0 ? c * (1 - amount) : c + (255 - c) * -amount;
    return Math.round(Math.min(255, Math.max(0, next)))
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(16)}${channel(8)}${channel(0)}`;
}
