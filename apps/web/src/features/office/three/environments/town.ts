import { windowLit } from '../../daylight';
import { GROUND } from '../approach';
import type { OfficeLayout } from '@ea/shared';
import { placerOf } from './clearance';
import {
  bench,
  type Ink,
  inkOf,
  LAMP_LIT,
  lamp,
  pick,
  type Point,
  type Spot,
  type Tree,
  tree,
} from './kit';
import { type Part, type Piece, placed } from './pieces';

// What a street is made of (Phase 35), for the residential neighbourhood and
// the modern condominium: houses with a pitched roof, modern houses of boxes
// and glass, cars, fences, hedges, the street itself, bollards, loungers and
// umbrellas. Plain data placed where each thing stands; every thing faces
// its own +y (its front), turned by `yaw`.

export interface HouseSpec {
  readonly x: number;
  readonly y: number;
  /** Turn: the front (local +y) faces (sin yaw, cos yaw). */
  readonly yaw: number;
  readonly w: number;
  readonly d: number;
  readonly floors: 1 | 2;
  readonly roof: 'gable' | 'hip';
  readonly wall: string;
  readonly roofColor: string;
  readonly garage: boolean;
  readonly seed: number;
}

export interface ModernSpec {
  readonly x: number;
  readonly y: number;
  readonly yaw: number;
  /** Width and depth of the ground floor. */
  readonly w: number;
  readonly d: number;
  /** The cladding of the upper box: dark panels or wood. */
  readonly cladding: string;
  readonly seed: number;
}

export const HOUSE_WALLS = [
  '#f1e3c8',
  '#dfe8ee',
  '#f3d4c6',
  '#e8efd9',
  '#d9d2ec',
  '#f6f1e7',
] as const;
export const HOUSE_ROOFS = ['#b5563f', '#6b4f45', '#3f4a5c', '#8a3f3f', '#5b4a8a'] as const;
export const CAR_COLORS = [
  '#d94b4b',
  '#3f6fd1',
  '#f2f2ef',
  '#2b2b33',
  '#9aa3ad',
  '#f0b43c',
  '#7b5cd6',
  '#3a8f6a',
] as const;

const FLOOR = 1.05;

/** A seed of any size as a fraction in [0, 1), as `windowLit` wants: spread by the golden ratio. */
const fraction = (seed: number) => {
  const value = seed * 0.618_033_988_7;
  return value - Math.floor(value);
};
const GLASS_DAY = '#86a0c4';

/** A window: its frame, and the glass, lit at night one window at a time. */
function windowParts(
  dx: number,
  dy: number,
  dz: number,
  yaw: number,
  seed: number,
  ink: Ink,
  light: number,
  size: { w: number; h: number } = { w: 0.42, h: 0.5 },
): Part[] {
  const lit = ink.lit && windowLit(fraction(seed), light);
  return [
    { dx, dy, dz, w: size.w, d: 0.05, h: size.h, color: ink.tone('#f7f5ef'), yaw },
    {
      dx,
      dy,
      dz: dz + 0.04,
      w: size.w - 0.08,
      d: 0.07,
      h: size.h - 0.08,
      color: lit ? '#ffd27a' : ink.tone(GLASS_DAY),
      surface: lit ? 'glow' : 'gloss',
      yaw,
    },
  ];
}

/** Windows along the four walls of a box, a floor at a time. */
function facadeWindows(
  w: number,
  d: number,
  floors: number,
  base: number,
  seed: number,
  ink: Ink,
  light: number,
  skipFront: (dx: number) => boolean,
): Part[] {
  const parts: Part[] = [];
  let n = seed;
  for (let floor = 0; floor < floors; floor += 1) {
    const dz = base + floor * FLOOR + 0.35;
    for (let dx = -w / 2 + 0.7; dx <= w / 2 - 0.6; dx += 1.0) {
      n += 1;
      if (!(floor === 0 && skipFront(dx)))
        parts.push(...windowParts(dx, d / 2 + 0.01, dz, 0, n * 7.13, ink, light));
      n += 1;
      parts.push(...windowParts(dx, -d / 2 - 0.01, dz, 0, n * 7.13, ink, light));
    }
    for (let dy = -d / 2 + 0.7; dy <= d / 2 - 0.6; dy += 1.1) {
      for (const side of [-1, 1]) {
        n += 1;
        parts.push(
          ...windowParts(side * (w / 2 + 0.01), dy, dz, Math.PI / 2, n * 7.13, ink, light),
        );
      }
    }
  }
  return parts;
}

/** A house with a pitched roof, a door with its porch light, a chimney, maybe a garage. */
export function house(spec: HouseSpec, ink: Ink, light: number): Piece[] {
  const { w, d, floors } = spec;
  const z = GROUND;
  const wall = ink.tone(spec.wall);
  const roof = ink.tone(spec.roofColor);
  const top = 0.15 + floors * FLOOR;
  const rise = 0.9 + (spec.seed % 3) * 0.12;
  const door = (dx: number) => Math.abs(dx) < 0.5;
  const parts: Part[] = [
    { dx: 0, dy: 0, dz: 0, w: w + 0.2, d: d + 0.2, h: 0.15, color: ink.tone('#9c968c') },
    { dx: 0, dy: 0, dz: 0.15, w, d, h: floors * FLOOR, color: wall, shade: 0.12 },
    // The eaves, a little wider than the walls.
    spec.roof === 'gable'
      ? { dx: 0, dy: 0, dz: top, w: w + 0.35, d: d + 0.45, h: rise, color: roof, shape: 'gable' }
      : {
          dx: 0,
          dy: 0,
          dz: top,
          w: (w + 0.4) * Math.SQRT2,
          d: (d + 0.4) * Math.SQRT2,
          h: rise,
          color: roof,
          shape: 'cone',
          sides: 4,
          yaw: Math.PI / 4,
        },
    {
      dx: w * 0.28,
      dy: -d * 0.15,
      dz: top + 0.2,
      w: 0.32,
      d: 0.32,
      h: rise,
      color: ink.tone('#8a5a4a'),
    },
    // The door, its step and the light beside it.
    {
      dx: 0,
      dy: d / 2 + 0.01,
      dz: 0.15,
      w: 0.5,
      d: 0.06,
      h: 0.82,
      color: ink.tone(pick(['#6b3f2a', '#2f4a6a', '#7a2f3a', '#3f5f45'], spec.seed)),
    },
    { dx: 0, dy: d / 2 + 0.25, dz: 0, w: 0.9, d: 0.45, h: 0.12, color: ink.tone('#c9c2b4') },
    {
      dx: 0.4,
      dy: d / 2 + 0.06,
      dz: 0.85,
      w: 0.09,
      d: 0.09,
      h: 0.12,
      color: ink.lit ? LAMP_LIT : ink.tone('#efe9d6'),
      surface: ink.lit ? 'glow' : 'matte',
    },
    ...facadeWindows(w, d, floors, 0.15, spec.seed, ink, light, door),
  ];
  if (spec.garage) {
    const gx = w / 2 + 1.15;
    parts.push(
      { dx: gx, dy: 0.2, dz: 0, w: 2.2, d: d - 0.4, h: 1.0, color: wall, shade: 0.12 },
      { dx: gx, dy: 0.2, dz: 1.0, w: 2.4, d: d - 0.2, h: 0.12, color: roof },
      { dx: gx, dy: d / 2 - 0.19, dz: 0.05, w: 1.6, d: 0.05, h: 0.8, color: ink.tone('#e9e6df') },
      ...[0.25, 0.45, 0.65].map((dz): Part => ({
        dx: gx,
        dy: d / 2 - 0.16,
        dz,
        w: 1.6,
        d: 0.02,
        h: 0.02,
        color: ink.tone('#c9c5bc'),
      })),
    );
  }
  return placed(spec.x, spec.y, z, spec.yaw, parts);
}

/** A modern house: a white ground floor, an upper box clad in wood or dark panels, flat roofs and walls of glass. */
export function modernHouse(spec: ModernSpec, ink: Ink, light: number): Piece[] {
  const { w, d } = spec;
  const white = ink.tone('#f1efe9');
  const clad = ink.tone(spec.cladding);
  const litGround = ink.lit && windowLit(fraction(spec.seed * 1.7), light);
  const litUpper = ink.lit && windowLit(fraction(spec.seed * 3.1), light);
  const glass = (lit: boolean) => ({
    color: lit ? '#ffd9a0' : ink.tone('#4a6688'),
    surface: lit ? ('glow' as const) : ('gloss' as const),
  });
  const parts: Part[] = [
    { dx: 0, dy: 0, dz: 0, w: w + 0.3, d: d + 0.3, h: 0.12, color: ink.tone('#b9b5ad') },
    // Ground floor: white, with a wall of glass on the front.
    { dx: -w * 0.12, dy: 0, dz: 0.12, w: w * 0.76, d, h: 1.1, color: white, shade: 0.1 },
    {
      dx: w * 0.38,
      dy: -0.15,
      dz: 0.12,
      w: w * 0.24,
      d: d - 0.3,
      h: 1.1,
      color: white,
      shade: 0.1,
    },
    { dx: w * 0.08, dy: d / 2 + 0.02, dz: 0.2, w: w * 0.5, d: 0.06, h: 0.92, ...glass(litGround) },
    { dx: -w * 0.12, dy: 0, dz: 1.22, w: w * 0.9, d: d + 0.5, h: 0.1, color: white },
    // Upper box, set back and to one side, clad, with its own long window.
    {
      dx: -w * 0.18,
      dy: -d * 0.12,
      dz: 1.32,
      w: w * 0.66,
      d: d * 0.8,
      h: 1.0,
      color: clad,
      shade: 0.15,
    },
    {
      dx: -w * 0.18,
      dy: -d * 0.12 + (d * 0.8) / 2 + 0.02,
      dz: 1.55,
      w: w * 0.5,
      d: 0.06,
      h: 0.55,
      ...glass(litUpper),
    },
    { dx: -w * 0.18, dy: -d * 0.12, dz: 2.32, w: w * 0.72, d: d * 0.86, h: 0.08, color: white },
    // The back opens to the garden: a wall of glass below, a long window above.
    {
      dx: -w * 0.12,
      dy: -d / 2 - 0.02,
      dz: 0.2,
      w: w * 0.6,
      d: 0.06,
      h: 0.92,
      ...glass(ink.lit && windowLit(fraction(spec.seed * 5.3), light)),
    },
    {
      dx: -w * 0.18,
      dy: -d * 0.12 - (d * 0.8) / 2 - 0.02,
      dz: 1.55,
      w: w * 0.44,
      d: 0.06,
      h: 0.55,
      ...glass(ink.lit && windowLit(fraction(spec.seed * 7.9), light)),
    },
    // Tall windows on both sides of the upper box.
    ...[-1, 1].map((k): Part => ({
      dx: -w * 0.18 + k * (w * 0.33 + 0.02),
      dy: -d * 0.12,
      dz: 1.5,
      w: 0.06,
      d: d * 0.4,
      h: 0.65,
      ...glass(ink.lit && windowLit(fraction(spec.seed * (11 + k)), light)),
    })),
    // Wooden slats screening the side of the ground floor.
    ...Array.from({ length: 6 }, (_, n): Part => ({
      dx: w * 0.3 + n * 0.09,
      dy: d / 2 + 0.05,
      dz: 0.12,
      w: 0.04,
      d: 0.05,
      h: 1.1,
      color: ink.tone('#a8744a'),
    })),
    // A light by the door.
    {
      dx: -w * 0.42,
      dy: d / 2 + 0.05,
      dz: 0.7,
      w: 0.06,
      d: 0.06,
      h: 0.22,
      color: ink.lit ? LAMP_LIT : ink.tone('#3b3f4a'),
      surface: ink.lit ? 'glow' : 'matte',
    },
  ];
  return placed(spec.x, spec.y, GROUND, spec.yaw, parts);
}

/** A car, parked along `yaw` (its nose toward local +y). */
export function car(x: number, y: number, yaw: number, color: string, ink: Ink): Piece[] {
  const body = ink.tone(color);
  const glass = ink.tone('#2c3445');
  const tyre = ink.tone('#1d1d22');
  const parts: Part[] = [
    {
      dx: 0,
      dy: 0,
      dz: 0.12,
      w: 0.62,
      d: 1.3,
      h: 0.3,
      color: body,
      shape: 'soft',
      surface: 'gloss',
    },
    {
      dx: 0,
      dy: -0.08,
      dz: 0.4,
      w: 0.54,
      d: 0.7,
      h: 0.24,
      color: glass,
      shape: 'soft',
      surface: 'gloss',
    },
    { dx: 0, dy: -0.08, dz: 0.62, w: 0.5, d: 0.6, h: 0.04, color: body, shape: 'soft' },
    ...[-0.4, 0.4].flatMap((dy) =>
      [-0.3, 0.3].map((dx): Part => ({
        dx,
        dy,
        dz: 0,
        w: 0.24,
        d: 0.24,
        h: 0.1,
        color: tyre,
        shape: 'drum',
        sides: 10,
        tilt: Math.PI / 2,
        yaw: Math.PI / 2,
      })),
    ),
    { dx: -0.2, dy: 0.66, dz: 0.24, w: 0.12, d: 0.03, h: 0.06, color: ink.tone('#f4f1e3') },
    { dx: 0.2, dy: 0.66, dz: 0.24, w: 0.12, d: 0.03, h: 0.06, color: ink.tone('#f4f1e3') },
    { dx: -0.2, dy: -0.66, dz: 0.24, w: 0.12, d: 0.03, h: 0.06, color: ink.tone('#c23b3b') },
    { dx: 0.2, dy: -0.66, dz: 0.24, w: 0.12, d: 0.03, h: 0.06, color: ink.tone('#c23b3b') },
  ];
  return placed(x, y, GROUND, yaw, parts);
}

/** A white picket fence from one point to another, on the ground. */
export function picketFence(
  from: { x: number; y: number },
  to: { x: number; y: number },
  ink: Ink,
): Piece[] {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  if (length < 0.2) return [];
  const yaw = Math.atan2(to.x - from.x, to.y - from.y);
  const white = ink.tone('#f4f2ec');
  const count = Math.max(1, Math.round(length / 0.28));
  const parts: Part[] = [];
  for (let n = 0; n <= count; n += 1)
    parts.push({ dx: 0, dy: (n / count) * length, dz: 0, w: 0.07, d: 0.05, h: 0.46, color: white });
  for (const dz of [0.14, 0.33])
    parts.push({ dx: 0, dy: length / 2, dz, w: 0.04, d: length, h: 0.05, color: white });
  return placed(from.x, from.y, GROUND, yaw, parts);
}

/** A clipped hedge from one point to another. */
export function hedge(
  from: { x: number; y: number },
  to: { x: number; y: number },
  ink: Ink,
  height = 0.5,
): Piece[] {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const yaw = Math.atan2(to.x - from.x, to.y - from.y);
  return placed(from.x, from.y, GROUND, yaw, [
    {
      dx: 0,
      dy: length / 2,
      dz: 0,
      w: 0.45,
      d: length,
      h: height,
      color: ink.tone('#3f7f45'),
      shape: 'soft',
      shade: 0.3,
    },
  ]);
}

/** A flat strip on the ground (asphalt, pavement, a stripe), from (x0, y0) to (x1, y1). */
export function strip(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: string,
  ink: Ink,
  height = 0.03,
  lift = 0,
): Piece {
  return {
    x: (x0 + x1) / 2,
    y: (y0 + y1) / 2,
    z: GROUND - 0.02 + lift,
    w: Math.abs(x1 - x0),
    d: Math.abs(y1 - y0),
    h: height,
    color: ink.tone(color),
    shade: 0,
  };
}

/** A mailbox at the edge of a front yard. */
export function mailbox(x: number, y: number, yaw: number, ink: Ink, seed: number): Piece[] {
  return placed(x, y, GROUND, yaw, [
    { dx: 0, dy: 0, dz: 0, w: 0.06, d: 0.06, h: 0.6, color: ink.tone('#5b4636') },
    {
      dx: 0,
      dy: 0,
      dz: 0.6,
      w: 0.2,
      d: 0.32,
      h: 0.18,
      color: ink.tone(pick(['#3f6fd1', '#d94b4b', '#2b2b33', '#f2f2ef'], seed)),
      shape: 'soft',
    },
  ]);
}

/** A low bollard that lights the path at night. */
export function bollard(x: number, y: number, ink: Ink): Piece[] {
  return [
    {
      x,
      y,
      z: GROUND,
      w: 0.14,
      d: 0.14,
      h: 0.42,
      color: ink.tone('#3b3f4a'),
      shape: 'drum',
      sides: 8,
    },
    {
      x,
      y,
      z: GROUND + 0.3,
      w: 0.15,
      d: 0.15,
      h: 0.06,
      color: ink.lit ? LAMP_LIT : ink.tone('#d9d5c9'),
      shape: 'drum',
      sides: 8,
      surface: ink.lit ? 'glow' : 'matte',
    },
  ];
}

/** A sun lounger facing `yaw`, its back raised. */
export function lounger(x: number, y: number, yaw: number, ink: Ink): Piece[] {
  const frame = ink.tone('#e9e6df');
  const cushion = ink.tone('#f6f2ea');
  return placed(x, y, GROUND, yaw, [
    { dx: 0, dy: 0.1, dz: 0.18, w: 0.55, d: 1.0, h: 0.06, color: frame, shape: 'soft' },
    { dx: 0, dy: 0.1, dz: 0.24, w: 0.5, d: 0.95, h: 0.05, color: cushion, shape: 'soft' },
    {
      dx: 0,
      dy: -0.52,
      dz: 0.24,
      w: 0.5,
      d: 0.45,
      h: 0.06,
      color: cushion,
      shape: 'soft',
      tilt: -0.7,
    },
    ...[-0.35, 0.5].flatMap((dy) =>
      [-0.22, 0.22].map((dx): Part => ({ dx, dy, dz: 0, w: 0.05, d: 0.05, h: 0.18, color: frame })),
    ),
  ]);
}

/** A parasol: a pole and a wide canopy of eight panels. */
export function parasol(x: number, y: number, color: string, ink: Ink): Piece[] {
  return [
    {
      x,
      y,
      z: GROUND,
      w: 0.3,
      d: 0.3,
      h: 0.08,
      color: ink.tone('#4a4a52'),
      shape: 'drum',
      sides: 8,
    },
    {
      x,
      y,
      z: GROUND,
      w: 0.05,
      d: 0.05,
      h: 1.55,
      color: ink.tone('#e9e6df'),
      shape: 'drum',
      sides: 6,
    },
    {
      x,
      y,
      z: GROUND + 1.35,
      w: 1.9,
      d: 1.9,
      h: 0.38,
      color: ink.tone(color),
      shape: 'cone',
      sides: 8,
      shade: 0.25,
    },
  ];
}

/** A clump of ornamental grass: thin blades leaning out. */
export function grass(x: number, y: number, ink: Ink, seed: number): Piece[] {
  return Array.from({ length: 7 }, (_, n): Piece => {
    const angle = n * 0.9 + seed;
    return {
      x: x + Math.cos(angle) * 0.08,
      y: y + Math.sin(angle) * 0.08,
      z: GROUND,
      w: 0.08,
      d: 0.08,
      h: 0.55 + (n % 3) * 0.12,
      color: ink.tone(n % 2 ? '#b9b37a' : '#9aa067'),
      shape: 'cone',
      sides: 4,
      tilt: 0.25,
      yaw: angle,
    };
  });
}

/** A clipped ball of box on the ground. */
export function topiary(x: number, y: number, size: number, ink: Ink, seed: number): Piece {
  return {
    x,
    y,
    z: GROUND - 0.05,
    w: size,
    d: size,
    h: size * 0.9,
    color: ink.tone('#3c7a46'),
    shape: 'blob',
    surface: 'facet',
    seed,
    shade: 0.3,
  };
}

/** One thing of a street, as placed by a plan; its pieces depend on the hour. */
export type Thing =
  | { readonly kind: 'house'; readonly spec: HouseSpec }
  | { readonly kind: 'modern'; readonly spec: ModernSpec }
  | {
      readonly kind: 'car';
      readonly x: number;
      readonly y: number;
      readonly yaw: number;
      readonly color: string;
    }
  | { readonly kind: 'tree'; readonly tree: Tree }
  | { readonly kind: 'lamp'; readonly spot: Spot }
  | { readonly kind: 'bench'; readonly spot: Spot }
  | { readonly kind: 'fence'; readonly from: Point; readonly to: Point }
  | { readonly kind: 'hedge'; readonly from: Point; readonly to: Point; readonly height: number }
  | { readonly kind: 'mailbox'; readonly spot: Spot; readonly seed: number }
  | { readonly kind: 'bollard'; readonly x: number; readonly y: number }
  | { readonly kind: 'lounger'; readonly spot: Spot }
  | { readonly kind: 'parasol'; readonly x: number; readonly y: number; readonly color: string }
  | { readonly kind: 'grass'; readonly x: number; readonly y: number; readonly seed: number }
  | {
      readonly kind: 'topiary';
      readonly x: number;
      readonly y: number;
      readonly size: number;
      readonly seed: number;
    }
  | {
      readonly kind: 'strip';
      readonly x0: number;
      readonly y0: number;
      readonly x1: number;
      readonly y1: number;
      readonly color: string;
      readonly height: number;
      readonly lift: number;
    }
  /** Anything else, already as pieces (coloured by the hour through `tone`). */
  | { readonly kind: 'pieces'; readonly pieces: (ink: Ink) => Piece[] };

/** The pieces of a thing at this hour. */
export function thingPieces(thing: Thing, ink: Ink, light: number): Piece[] {
  switch (thing.kind) {
    case 'house':
      return house(thing.spec, ink, light);
    case 'modern':
      return modernHouse(thing.spec, ink, light);
    case 'car':
      return car(thing.x, thing.y, thing.yaw, thing.color, ink);
    case 'tree':
      return tree(thing.tree, GROUND, ink);
    case 'lamp':
      return lamp(thing.spot, GROUND, ink);
    case 'bench':
      return bench(thing.spot, GROUND, ink);
    case 'fence':
      return picketFence(thing.from, thing.to, ink);
    case 'hedge':
      return hedge(thing.from, thing.to, ink, thing.height);
    case 'mailbox':
      return mailbox(thing.spot.x, thing.spot.y, thing.spot.yaw, ink, thing.seed);
    case 'bollard':
      return bollard(thing.x, thing.y, ink);
    case 'lounger':
      return lounger(thing.spot.x, thing.spot.y, thing.spot.yaw, ink);
    case 'parasol':
      return parasol(thing.x, thing.y, thing.color, ink);
    case 'grass':
      return grass(thing.x, thing.y, ink, thing.seed);
    case 'topiary':
      return [topiary(thing.x, thing.y, thing.size, ink, thing.seed)];
    case 'strip':
      return [
        strip(thing.x0, thing.y0, thing.x1, thing.y1, thing.color, ink, thing.height, thing.lift),
      ];
    case 'pieces':
      return thing.pieces(ink);
  }
}

/**
 * Collects the things of a plan, keeping only what stands clear of the
 * office, hides none of it and shows in some frame. Placement is decided on
 * the daytime pieces, so day and night have the same things.
 */
export function townPlanner(layout: Pick<OfficeLayout, 'width' | 'height' | 'items'>) {
  const placer = placerOf(layout);
  const day = inkOf(0);
  const things: Thing[] = [];
  return {
    things,
    seen: placer.seen,
    /** Adds the thing if it fits; `always` skips the check, for what lies flat far from the office. */
    add(thing: Thing, always = false): boolean {
      if (!always) {
        const pieces = thingPieces(thing, day, 1);
        if (!placer.fits(pieces)) return false;
        if (!pieces.some((piece) => placer.seen(piece.x, piece.y, piece.z + piece.h))) return false;
      }
      things.push(thing);
      return true;
    },
  };
}

/** Every piece of a plan at this hour. */
export function townPieces(things: readonly Thing[], dusk: number, light: number): Piece[] {
  const ink = inkOf(dusk);
  return things.flatMap((thing) => thingPieces(thing, ink, light));
}
