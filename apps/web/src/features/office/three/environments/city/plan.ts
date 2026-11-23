import { entranceOf, type OfficeLayout } from '@ea/shared';
import { GROUND, seeded } from '../../approach';
import { placerOf } from '../clearance';
import { type Ink, pick, type Spot, tree, type TreeKind } from '../kit';
import { type Part, type Piece, placed } from '../pieces';
import { CAR_COLORS, type Thing, townPlanner, windowParts } from '../town';

// The city around the 3D office (Phase 25; an environment since Phase 34,
// redrawn after Phase 38), as plain data in tiles: the office on its own
// paved square, the avenues in front and beside it with their lanes,
// crossings and traffic lights, low buildings with
// shops across the avenues, street trees in planters, lamps, benches and
// cars, and the towers rising behind in rings that fade into the haze. Kept
// apart from three.js so it is tested without a GPU. Original art.

type Layout = Pick<OfficeLayout, 'width' | 'height' | 'items'>;

export interface Tower {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly d: number;
  readonly h: number;
  /** Which of the facade tones. */
  readonly tone: number;
  readonly crown: 'neon' | 'antenna' | 'box' | 'tier' | 'none';
  /** 0 for the nearest ring, farther rings fade into the night. */
  readonly ring: number;
  /** Where its windows start in the facade pattern, so no two towers look alike. */
  readonly shift: number;
}

/** The bands of the streets, in tiles from the office's corner. */
export function streetsOf(layout: Pick<OfficeLayout, 'width' | 'height'>) {
  const { width: w, height: h } = layout;
  return {
    /** The office's paved square, out to the kerbs; wider behind, where it shows through the glass. */
    square: { x0: -4.8, y0: -4.8, x1: w + 3.6, y1: h + 3.6 },
    /** The avenue in front (along x) and the one beside (along y). */
    front: { y0: h + 3.6, y1: h + 8.4 },
    side: { x0: w + 3.6, x1: w + 8.4 },
    /** The pavement across each avenue, where the shops open. */
    frontWalk: { y0: h + 8.4, y1: h + 10 },
    sideWalk: { x0: w + 8.4, x1: w + 10 },
  };
}

/** Each ring of towers: how far from the office, how far apart, how tall (tiles). */
const RINGS = [
  { gap: 5, step: 6, low: 3, high: 3 },
  { gap: 12, step: 5, low: 5, high: 4 },
  { gap: 21, step: 4, low: 7, high: 6 },
  { gap: 32, step: 4, low: 9, high: 8 },
] as const;

export const TOWER_TONES = 4;

/**
 * The towers around the office: a few close ones with room between them,
 * more behind, taller the farther they are, so the skyline rises behind the
 * office as in the proposal. Only behind and beside it, never on the avenues:
 * nothing stands between the viewer and the office.
 */
export function towersOf(layout: Pick<OfficeLayout, 'width' | 'height'>): Tower[] {
  const { width, height } = layout;
  const streets = streetsOf(layout);
  const random = seeded('towers-3d');
  const towers: Tower[] = [];
  const crowns = ['neon', 'antenna', 'box', 'tier', 'none'] as const;
  RINGS.forEach((ring, index) => {
    const add = (x: number, y: number) => {
      // Gaps now and then, so a ring never reads as a wall.
      if (random() < 0.3) return;
      const tower: Tower = {
        x,
        y,
        w: 2 + Math.floor(random() * 2),
        d: 2 + Math.floor(random() * 2),
        h: ring.low + random() * ring.high,
        tone: Math.floor(random() * TOWER_TONES),
        crown: crowns[Math.floor(random() * crowns.length)] ?? 'none',
        ring: index,
        shift: Math.floor(random() * 16),
      };
      // Off the avenues and their pavements.
      const onAvenue =
        (tower.x + tower.w > streets.side.x0 - 0.4 && tower.x < streets.sideWalk.x1 + 0.4) ||
        (tower.y + tower.d > streets.front.y0 - 0.4 && tower.y < streets.frontWalk.y1 + 0.4);
      if (!onAvenue) towers.push(tower);
    };
    const edge = -ring.gap - 3;
    const jitter = () => Math.floor(random() * 3);
    // Along the back of the office (north), then along its left side (west).
    for (let x = edge; x < width + ring.gap; x += ring.step + jitter()) add(x, edge - jitter());
    for (let y = edge + ring.step; y < height + ring.gap; y += ring.step + jitter())
      add(edge - jitter(), y);
  });
  return towers;
}

export interface CityPlan {
  readonly things: readonly Thing[];
  /** Where the street lamps cast their light at night. */
  readonly lamps: readonly Spot[];
}

const ASPHALT = '#3a3e48';
const SQUARE = '#d8d2c6';
const JOINT = '#c2bbae';
const PAVEMENT = '#bdb7ab';
const KERB = '#9e988c';
const LANE = '#eeeae0';
const CENTRE = '#f2c94c';
const ZEBRA = '#f2f0ea';
/** How far the streets go: past every frame's edge. */
const FAR = 48;

/** Shop walls, awnings and the glass of a lit shop window. */
const SHOP_WALLS = [
  '#c8735a',
  '#d9a066',
  '#8fa9b8',
  '#e2cfae',
  '#a6b98a',
  '#b98aa0',
  '#9c8574',
] as const;
const AWNINGS = ['#c8553d', '#2f6f8f', '#3f8a5a', '#d9a33c', '#7b5cd6', '#33363f'] as const;
const SHOP_LIT = '#ffd9a0';
const GROUND_FLOOR = 1.0;
const UPPER_FLOOR = 0.82;

export interface ShopSpec {
  readonly x: number;
  readonly y: number;
  /** Turn: the shop front (local +y) faces (sin yaw, cos yaw). */
  readonly yaw: number;
  readonly w: number;
  readonly d: number;
  /** Floors above the shop. */
  readonly floors: number;
  readonly wall: string;
  readonly awning: string;
  readonly seed: number;
}

/** A low city building: a shop with its window and awning, flats above, things on the roof. */
export function shop(spec: ShopSpec, ink: Ink, light: number): Piece[] {
  const { w, d, floors, seed } = spec;
  const top = GROUND_FLOOR + floors * UPPER_FLOOR;
  const wall = ink.tone(spec.wall);
  const trim = ink.tone('#f1ede4');
  const lit = ink.lit;
  const front = d / 2;
  const parts: Part[] = [
    { dx: 0, dy: 0, dz: 0, w, d, h: top, color: wall },
    // The shop window, its door, the sign band and the awning over the pavement.
    {
      dx: 0,
      dy: front + 0.01,
      dz: 0.08,
      w: w - 0.5,
      d: 0.06,
      h: 0.7,
      color: lit ? SHOP_LIT : ink.tone('#7f9bbf'),
      surface: lit ? 'glow' : 'gloss',
    },
    { dx: 0, dy: front + 0.02, dz: 0.78, w: w - 0.3, d: 0.08, h: 0.2, color: ink.tone('#2f2f38') },
    {
      dx: 0,
      dy: front + 0.32,
      dz: 0.8,
      w: w - 0.4,
      d: 0.6,
      h: 0.06,
      color: ink.tone(spec.awning),
      shape: 'soft',
      tilt: 0.28,
    },
    // The cornice and the parapet.
    { dx: 0, dy: 0, dz: top, w: w + 0.12, d: d + 0.12, h: 0.1, color: trim },
    // The roof, grey membrane inside the parapet.
    { dx: 0, dy: 0, dz: top + 0.1, w: w - 0.16, d: d - 0.16, h: 0.03, color: ink.tone('#85878e') },
    { dx: 0, dy: front - 0.04, dz: top + 0.1, w, d: 0.08, h: 0.16, color: wall },
    { dx: 0, dy: -front + 0.04, dz: top + 0.1, w, d: 0.08, h: 0.16, color: wall },
    { dx: w / 2 - 0.04, dy: 0, dz: top + 0.1, w: 0.08, d, h: 0.16, color: wall },
    { dx: -w / 2 + 0.04, dy: 0, dz: top + 0.1, w: 0.08, d, h: 0.16, color: wall },
    // A machine and, on some, a water tank on the roof.
    {
      dx: -w / 4,
      dy: -d / 6,
      dz: top + 0.1,
      w: 0.5,
      d: 0.4,
      h: 0.3,
      color: ink.tone('#a7abb3'),
    },
  ];
  if (seed % 3 === 0)
    parts.push(
      {
        dx: w / 4,
        dy: 0,
        dz: top + 0.1,
        w: 0.5,
        d: 0.5,
        h: 0.55,
        color: ink.tone('#8a6a52'),
        shape: 'drum',
        sides: 10,
      },
      {
        dx: w / 4,
        dy: 0,
        dz: top + 0.65,
        w: 0.56,
        d: 0.56,
        h: 0.14,
        color: ink.tone('#6b5242'),
        shape: 'cone',
        sides: 10,
      },
    );
  // Windows of the flats, on the front and on both sides, a floor at a time.
  let n = seed;
  for (let floor = 0; floor < floors; floor += 1) {
    const dz = GROUND_FLOOR + floor * UPPER_FLOOR + 0.18;
    for (let dx = -w / 2 + 0.55; dx <= w / 2 - 0.45; dx += 0.85) {
      n += 1;
      parts.push(...windowParts(dx, front + 0.01, dz, 0, n * 7.13, ink, light));
    }
    for (let dy = -d / 2 + 0.6; dy <= d / 2 - 0.5; dy += 0.95)
      for (const side of [-1, 1]) {
        n += 1;
        parts.push(
          ...windowParts(side * (w / 2 + 0.01), dy, dz, Math.PI / 2, n * 7.13, ink, light),
        );
      }
  }
  return placed(spec.x, spec.y, GROUND, spec.yaw, parts);
}

/** A traffic light on the corner, its arm over the lanes along `yaw`; red or green. */
export function trafficLight(spot: Spot, green: boolean, ink: Ink): Piece[] {
  const iron = ink.tone('#2f323b');
  const off = ink.tone('#3c3f48');
  // The lit lamp: bright by day, glowing at night (only lit things glow by day in no environment).
  const surface = ink.lit ? 'glow' : 'matte';
  return placed(spot.x, spot.y, GROUND, spot.yaw, [
    { dx: 0, dy: 0, dz: 0, w: 0.12, d: 0.12, h: 1.9, color: iron, shape: 'drum', sides: 8 },
    { dx: 0, dy: 0.9, dz: 1.82, w: 0.08, d: 1.8, h: 0.08, color: iron },
    { dx: 0, dy: 1.7, dz: 1.3, w: 0.22, d: 0.2, h: 0.52, color: iron, shape: 'soft' },
    {
      dx: 0.12,
      dy: 1.7,
      dz: 1.68,
      w: 0.03,
      d: 0.12,
      h: 0.12,
      color: green ? off : '#ff4b4b',
      ...(green ? {} : { surface }),
    },
    { dx: 0.12, dy: 1.7, dz: 1.52, w: 0.03, d: 0.12, h: 0.12, color: off },
    {
      dx: 0.12,
      dy: 1.7,
      dz: 1.36,
      w: 0.03,
      d: 0.12,
      h: 0.12,
      color: green ? '#4bff9a' : off,
      ...(green ? { surface } : {}),
    },
  ]);
}

/** A square concrete planter with a street tree in it. */
export function planter(
  x: number,
  y: number,
  kind: TreeKind,
  size: number,
  seed: number,
  ink: Ink,
): Piece[] {
  return [
    { x, y, z: GROUND, w: 1, d: 1, h: 0.3, color: ink.tone('#a39d92'), shade: 0.2 },
    { x, y, z: GROUND + 0.3, w: 0.84, d: 0.84, h: 0.02, color: ink.tone('#5a4535') },
    ...tree({ kind, x, y, size, seed }, GROUND + 0.3, ink),
  ];
}

/** A bus shelter on the pavement, its back to the buildings. */
export function busShelter(spot: Spot, ink: Ink): Piece[] {
  const frame = ink.tone('#3b3f4a');
  return placed(spot.x, spot.y, GROUND, spot.yaw, [
    { dx: -0.9, dy: 0, dz: 0, w: 0.06, d: 0.06, h: 1.2, color: frame },
    { dx: 0.9, dy: 0, dz: 0, w: 0.06, d: 0.06, h: 1.2, color: frame },
    {
      dx: 0,
      dy: -0.25,
      dz: 0.1,
      w: 1.8,
      d: 0.04,
      h: 1.0,
      color: ink.tone('#a9c4d8'),
      surface: 'gloss',
    },
    { dx: 0, dy: 0, dz: 1.2, w: 2.0, d: 0.7, h: 0.08, color: frame },
    {
      dx: 0.95,
      dy: -0.1,
      dz: 0.3,
      w: 0.05,
      d: 0.5,
      h: 0.8,
      color: ink.lit ? '#f3f0ff' : ink.tone('#e4e8f2'),
      surface: ink.lit ? 'glow' : 'matte',
    },
    { dx: 0, dy: -0.1, dz: 0.4, w: 1.4, d: 0.3, h: 0.05, color: ink.tone('#8a8f9a') },
  ]);
}

export function cityPlan(layout: Layout): CityPlan {
  const { width: w, height: h } = layout;
  const random = seeded(`city-${w}x${h}`);
  const planner = townPlanner(layout);
  const placer = placerOf(layout);
  const streets = streetsOf(layout);
  const { square, front, side, frontWalk, sideWalk } = streets;
  const flat = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    color: string,
    height = 0.03,
    lift = 0,
  ) => planner.add({ kind: 'strip', x0, y0, x1, y1, color, height, lift }, true);
  const piecesOf = (pieces: (ink: Ink, light: number) => Piece[], always = false) =>
    planner.add({ kind: 'pieces', pieces }, always);

  // The asphalt of every street, then the office's square and its joints.
  flat(-FAR, front.y0, w + FAR, front.y1, ASPHALT);
  flat(side.x0, -FAR, side.x1, h + FAR, ASPHALT, 0.03, 0.002);
  // The square runs under the office, so it stays as low as anything flat may be there.
  flat(square.x0, square.y0, square.x1, square.y1, SQUARE, 0.07);
  for (let x = square.x0 + 1.2; x < square.x1; x += 1.2)
    flat(x, square.y0, x + 0.03, square.y1, JOINT, 0.07, 0.004);
  for (let y = square.y0 + 1.2; y < square.y1; y += 1.2)
    flat(square.x0, y, square.x1, y + 0.03, JOINT, 0.07, 0.004);
  // Kerbs round the square and along the far pavements.
  flat(square.x0, square.y1 - 0.1, square.x1, square.y1, KERB, 0.08);
  flat(square.x1 - 0.1, square.y0, square.x1, square.y1, KERB, 0.08);
  flat(square.x0, square.y0, square.x1, square.y0 + 0.1, KERB, 0.08);
  flat(square.x0, square.y0, square.x0 + 0.1, square.y1, KERB, 0.08);
  flat(-FAR, frontWalk.y0, side.x0, frontWalk.y1, PAVEMENT, 0.08);
  flat(side.x1, frontWalk.y0, w + FAR, frontWalk.y1, PAVEMENT, 0.08);
  flat(sideWalk.x0, -FAR, sideWalk.x1, front.y0, PAVEMENT, 0.08);
  flat(sideWalk.x0, front.y1, sideWalk.x1, h + FAR, PAVEMENT, 0.08);
  flat(-FAR, frontWalk.y0, side.x0, frontWalk.y0 + 0.1, KERB, 0.1);
  flat(side.x1, frontWalk.y0, w + FAR, frontWalk.y0 + 0.1, KERB, 0.1);
  flat(sideWalk.x0, -FAR, sideWalk.x0 + 0.1, front.y0, KERB, 0.1);
  flat(sideWalk.x0, front.y1, sideWalk.x0 + 0.1, h + FAR, KERB, 0.1);

  // Lanes: a double yellow line in the middle, broken white lines between
  // the lanes, out of the crossing; zebras on every side of it.
  const fm = (front.y0 + front.y1) / 2;
  const sm = (side.x0 + side.x1) / 2;
  const crossing = (v: number, from: number, to: number) => v > from - 2 && v < to + 2;
  for (let x = -FAR; x < w + FAR; x += 1.4) {
    if (crossing(x, side.x0, side.x1) || crossing(x + 0.7, side.x0, side.x1)) continue;
    flat(x, fm - 0.12, x + 1.4, fm - 0.06, CENTRE, 0.03, 0.004);
    flat(x, fm + 0.06, x + 1.4, fm + 0.12, CENTRE, 0.03, 0.004);
    for (const lane of [front.y0 + 1.2, front.y1 - 1.2])
      flat(x, lane - 0.04, x + 0.7, lane + 0.04, LANE, 0.03, 0.004);
  }
  for (let y = -FAR; y < h + FAR; y += 1.4) {
    if (crossing(y, front.y0, front.y1) || crossing(y + 0.7, front.y0, front.y1)) continue;
    flat(sm - 0.12, y, sm - 0.06, y + 1.4, CENTRE, 0.03, 0.004);
    flat(sm + 0.06, y, sm + 0.12, y + 1.4, CENTRE, 0.03, 0.004);
    for (const lane of [side.x0 + 1.2, side.x1 - 1.2])
      flat(lane - 0.04, y, lane + 0.04, y + 0.7, LANE, 0.03, 0.004);
  }
  for (let k = 0; k < 8; k += 1) {
    const a = front.y0 + 0.25 + k * 0.58;
    flat(side.x0 - 1.6, a, side.x0 - 0.3, a + 0.3, ZEBRA, 0.03, 0.004);
    flat(side.x1 + 0.3, a, side.x1 + 1.6, a + 0.3, ZEBRA, 0.03, 0.004);
    const b = side.x0 + 0.25 + k * 0.58;
    flat(b, front.y0 - 1.6, b + 0.3, front.y0 - 0.3, ZEBRA, 0.03, 0.004);
    flat(b, front.y1 + 0.3, b + 0.3, front.y1 + 1.6, ZEBRA, 0.03, 0.004);
  }
  // Stop lines before the zebras.
  flat(side.x0 - 1.9, front.y0 + 0.1, side.x0 - 1.8, fm, LANE, 0.03, 0.004);
  flat(side.x1 + 1.8, fm, side.x1 + 1.9, front.y1 - 0.1, LANE, 0.03, 0.004);

  // Traffic lights on the four corners of the crossing.
  for (const [x, y, yaw, green] of [
    [side.x0 - 0.3, front.y0 - 0.3, Math.PI / 2, false],
    [side.x1 + 0.3, front.y1 + 0.3, -Math.PI / 2, false],
    [side.x1 + 0.3, front.y0 - 0.3, Math.PI, true],
    [side.x0 - 0.3, front.y1 + 0.3, 0, true],
  ] as const)
    piecesOf((ink) => trafficLight({ x, y, yaw }, green, ink));

  // The square: planters with trees along its edges, benches between them,
  // bollards at the kerb; nothing in the way of the steps.
  const entrance = entranceOf(layout);
  const ex = entrance ? entrance.x + 0.5 : w * 0.3;
  const kinds: readonly TreeKind[] = ['round', 'oak', 'birch'];
  let n = 0;
  for (let x = square.x0 + 0.9; x < square.x1 - 0.5; x += 3.1) {
    n += 1;
    if (Math.abs(x - ex) < 2) continue;
    const kind = pick(kinds, n);
    const size = 0.8 + random() * 0.3;
    const seed = n * 13;
    const y = square.y1 - 0.9;
    piecesOf((ink) => planter(x, y, kind, size, seed, ink));
    planner.add({ kind: 'bench', spot: { x: x + 1.55, y: square.y1 - 0.9, yaw: Math.PI } });
  }
  for (let y = square.y0 + 0.9; y < square.y1 - 1; y += 3.1) {
    n += 1;
    const kind = pick(kinds, n);
    const size = 0.8 + random() * 0.3;
    const seed = n * 13;
    const x = square.x1 - 0.9;
    piecesOf((ink) => planter(x, y, kind, size, seed, ink));
  }
  for (let x = square.x0 + 0.5; x < square.x1; x += 1.55)
    if (Math.abs(x - ex) > 1.2) planner.add({ kind: 'bollard', x, y: square.y1 - 0.25 });
  for (let x = square.x0 + 1.4; x < square.x1; x += 3.6)
    piecesOf((ink) => planter(x, square.y0 + 0.6, 'cypress', 0.8, Math.floor(x * 7), ink));

  // Lamps along every pavement, and their light on the ground at night.
  const lamps: Spot[] = [];
  const lampAt = (x: number, y: number) => {
    if (planner.add({ kind: 'lamp', spot: { x, y, yaw: 0 } })) lamps.push({ x, y, yaw: 0 });
  };
  for (let x = -FAR + 2; x < w + FAR; x += 6) {
    if (crossing(x, side.x0, side.x1)) continue;
    if (x > square.x0 && x < square.x1) lampAt(x, square.y1 - 0.3);
    lampAt(x + 3, frontWalk.y0 + 0.35);
  }
  for (let y = -FAR + 2; y < h + FAR; y += 6) {
    if (crossing(y, front.y0, front.y1)) continue;
    if (y > square.y0 && y < square.y1) lampAt(square.x1 - 0.3, y);
    lampAt(sideWalk.x0 + 0.35, y + 3);
  }

  // Street trees and a bus stop on the far pavements.
  for (let x = -FAR + 4; x < w + FAR; x += 6) {
    if (crossing(x, side.x0, side.x1)) continue;
    n += 1;
    const seed = n * 17;
    piecesOf((ink) => planter(x, frontWalk.y0 + 0.75, 'round', 0.9, seed, ink));
  }
  for (let y = -FAR + 4; y < h + FAR; y += 6) {
    if (crossing(y, front.y0, front.y1)) continue;
    n += 1;
    const seed = n * 17;
    piecesOf((ink) => planter(sideWalk.x0 + 0.75, y, 'round', 0.9, seed, ink));
  }
  const stop = { x: side.x0 - 6, y: frontWalk.y1 - 0.5, yaw: Math.PI };
  piecesOf((ink) => busShelter(stop, ink));

  // Cars: parked at the far kerbs, some driving in the lanes, stopped at the red light.
  const car = (x: number, y: number, yaw: number) =>
    planner.add({ kind: 'car', x, y, yaw, color: pick(CAR_COLORS, Math.floor(random() * 8)) });
  for (let x = -FAR + 1; x < w + FAR; x += 2.4) {
    if (crossing(x, side.x0, side.x1)) continue;
    if (random() < 0.5) car(x, front.y1 - 0.5, Math.PI / 2);
    if (random() < 0.18) car(x + 1.2, front.y0 + 1.8, -Math.PI / 2);
    if (random() < 0.18) car(x + 0.6, fm + 0.8, Math.PI / 2);
  }
  for (let y = -FAR + 1; y < h + FAR; y += 2.4) {
    if (crossing(y, front.y0, front.y1)) continue;
    if (random() < 0.5) car(side.x1 - 0.5, y, 0);
    if (random() < 0.18) car(side.x0 + 1.8, y + 1.2, Math.PI);
    if (random() < 0.18) car(sm + 0.8, y + 0.6, 0);
  }
  // A queue at the red light.
  for (let k = 0; k < 3; k += 1) car(side.x0 - 2.8 - k * 1.6, fm + 0.8 + 0.9, Math.PI / 2);
  for (let k = 0; k < 2; k += 1) car(side.x0 + 0.8, front.y0 - 2.8 - k * 1.6, 0);

  // Low buildings with shops across the avenues, their fronts toward them,
  // as tall as each place allows without hiding the office.
  const row = (
    from: number,
    to: number,
    place: (along: number) => { x: number; y: number; yaw: number },
  ) => {
    for (let along = from; along < to; along += 5.2) {
      n += 1;
      const at = place(along);
      const width = 3.2 + random() * 1.6;
      const depth = 3.4 + random() * 1.2;
      const most = 2 + Math.floor(random() * 4);
      const wall = pick(SHOP_WALLS, n * 3 + 1);
      const awning = pick(AWNINGS, n * 5 + 2);
      const seed = Math.floor(random() * 10_000);
      // Never on the side avenue or its pavements.
      if (at.x + width / 2 > side.x0 - 0.3 && at.x - width / 2 < sideWalk.x1 + 0.3) continue;
      // Checked by its outer box (with the awning and the tank), not part by
      // part: a few hundred parts each, tried at every height, are too slow.
      for (let floors = most; floors >= 1; floors -= 1) {
        const spec: ShopSpec = { ...at, w: width, d: depth, floors, wall, awning, seed };
        const top = GROUND_FLOOR + floors * UPPER_FLOOR + 0.85;
        const [outer] = placed(at.x, at.y, GROUND, at.yaw, [
          { dx: 0, dy: 0.35, dz: 0, w: width + 0.2, d: depth + 0.9, h: top, color: '#000000' },
        ]);
        if (!outer || !placer.fits([outer])) continue;
        const r = Math.max(width, depth) / 2;
        const seen = [-r, r].some((dx) =>
          [-r, r].some((dy) => planner.seen(at.x + dx, at.y + dy, GROUND + top)),
        );
        if (!seen) break;
        piecesOf((ink, light) => shop(spec, ink, light), true);
        break;
      }
    }
  };
  const frontRow = frontWalk.y1 + 2.4;
  const sideRow = sideWalk.x1 + 2.4;
  // Across the front avenue, all along it; beside the office, up to the front avenue.
  row(-22, w + 34, (x) => ({ x, y: frontRow, yaw: Math.PI }));
  row(-22, front.y0 - 2.6, (y) => ({ x: sideRow, y, yaw: -Math.PI / 2 }));
  // A second row behind each, seen over the first.
  row(-19.4, w + 34, (x) => ({ x, y: frontRow + 6, yaw: Math.PI }));
  row(-19.4, front.y0 - 2.6, (y) => ({ x: sideRow + 6, y, yaw: -Math.PI / 2 }));

  return { things: planner.things, lamps };
}
