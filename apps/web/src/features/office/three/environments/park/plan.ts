import { entranceOf, type OfficeLayout } from '@ea/shared';
import { GROUND, seeded } from '../../approach';
import { framesOf, hidesOffice, inSight, intrudes, sightPoints } from '../clearance';
import { type Point, type Spot, type Tree, type TreeKind, treeVolume } from '../kit';
import { type Piece, volumeOf } from '../pieces';

export type { Point, Spot, Tree, TreeKind };

// The park around the office (Phase 33), as plain data in tiles: where the
// ground rises and falls, the lake, the stone paths from the steps of the
// entrance, the fountain, the gazebo, the benches and lamps along the paths,
// the trees in groves and everything small between them. The same layout
// always gets the same park (a seeded random source); everything is placed
// outside the platform and where it hides nothing of the office.

type Layout = Pick<OfficeLayout, 'width' | 'height' | 'items'>;

export interface Ellipse extends Point {
  readonly rx: number;
  readonly ry: number;
}

export interface Lake {
  /** Two lobes joined at a narrow neck, where the bridge crosses. */
  readonly lobes: readonly [Ellipse, Ellipse];
  /** The height of the water. */
  readonly level: number;
}

export interface Path {
  /** The middle line, already smoothed, a point every `PATH_STEP` tiles or so. */
  readonly line: readonly Point[];
  readonly width: number;
}

export interface Bed extends Spot {
  readonly w: number;
  readonly d: number;
  /** The flowers of the bed: colour indices into `FLOWERS`. */
  readonly tones: readonly number[];
}

export interface ParkPlan {
  readonly width: number;
  readonly height: number;
  /** The part of the ground drawn in detail: the platform and `REACH` tiles around it. */
  readonly reach: number;
  readonly lake: Lake;
  readonly paths: readonly Path[];
  readonly plaza: Point & { readonly radius: number };
  readonly gazebo: Point;
  readonly bridge: { readonly from: Point; readonly to: Point };
  readonly deck: Spot & { readonly length: number };
  readonly knolls: readonly (Point & { readonly radius: number; readonly rise: number })[];
  readonly trees: readonly Tree[];
  readonly bushes: readonly (Point & { readonly size: number; readonly bloom: number | null })[];
  readonly beds: readonly Bed[];
  readonly benches: readonly Spot[];
  readonly lamps: readonly Spot[];
  readonly tables: readonly Spot[];
  readonly rocks: readonly (Point & { readonly size: number; readonly seed: number })[];
  readonly reeds: readonly Point[];
  readonly lilies: readonly (Point & { readonly size: number; readonly bloom: boolean })[];
  readonly ducks: readonly Spot[];
  readonly blossoms: readonly (Point & { readonly tone: number })[];
  readonly fireflies: readonly (Point & { readonly z: number })[];
}

/** Tiles of detailed ground around the platform. */
export const REACH = 24;
export const PATH_STEP = 0.3;

/** Flower colours: the purple of the brand first, then the garden's. */
export const FLOWERS = ['#b48cff', '#ff8fb8', '#ffd36b', '#f6f2ff', '#ff6f6f', '#7fa8ff'] as const;

const smooth = (edge0: number, edge1: number, value: number) => {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/** How far a point is outside the platform (0 on it). */
export function outside(plan: Pick<ParkPlan, 'width' | 'height'>, x: number, y: number): number {
  const dx = Math.max(0, -x, x - plan.width);
  const dy = Math.max(0, -y, y - plan.height);
  return Math.hypot(dx, dy);
}

/** Signed distance to the shore: below 0 in the water. Approximate, as an ellipse's is. */
export function shoreDistance(lake: Lake, x: number, y: number): number {
  let best = Number.POSITIVE_INFINITY;
  for (const lobe of lake.lobes) {
    const k = Math.hypot((x - lobe.x) / lobe.rx, (y - lobe.y) / lobe.ry);
    // A gentle wobble, so the shore is never a perfect ellipse.
    const angle = Math.atan2(y - lobe.y, x - lobe.x);
    const wobble = 0.07 * Math.sin(angle * 3 + lobe.x) + 0.04 * Math.sin(angle * 5 + lobe.y);
    best = Math.min(best, (k - 1 - wobble) * Math.min(lobe.rx, lobe.ry));
  }
  return best;
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const length = vx * vx + vy * vy;
  const t =
    length === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / length));
  return Math.hypot(p.x - a.x - vx * t, p.y - a.y - vy * t);
}

/** Distance from a point to the nearest path's middle line. */
export function pathDistance(paths: readonly Path[], x: number, y: number): number {
  let best = Number.POSITIVE_INFINITY;
  const p = { x, y };
  for (const path of paths)
    for (let index = 1; index < path.line.length; index += 1) {
      const a = path.line[index - 1];
      const b = path.line[index];
      if (a && b) best = Math.min(best, distanceToSegment(p, a, b) - path.width / 2);
    }
  return best;
}

/**
 * The height of the ground: flat at the foot of the platform, rising in soft
 * mounds farther out, down into the lake, and flat again at the edge of the
 * detailed ground, where the far lawn takes over.
 */
export function heightAt(
  plan: Pick<ParkPlan, 'width' | 'height' | 'reach' | 'lake' | 'knolls' | 'plaza'>,
  x: number,
  y: number,
): number {
  const away = outside(plan, x, y);
  const open = smooth(2.5, 8, away) * (1 - smooth(plan.reach - 6, plan.reach, away));
  // Only upward: the ground never dips below the water outside the lake.
  const roll =
    0.18 * (1 + Math.sin(x * 0.23 + 1.3) * Math.cos(y * 0.19 + 0.4)) +
    0.07 * (1 + Math.sin((x + y) * 0.41 + 2.1));
  let rise = roll;
  for (const knoll of plan.knolls) {
    const t = Math.hypot(x - knoll.x, y - knoll.y) / knoll.radius;
    if (t < 1) rise += knoll.rise * (1 - smooth(0, 1, t));
  }
  // Level around the plaza, so its paving and the fountain sit flat.
  rise *= smooth(
    plan.plaza.radius,
    plan.plaza.radius + 2.5,
    Math.hypot(x - plan.plaza.x, y - plan.plaza.y),
  );
  // Level near the water, then down into it.
  const shore = shoreDistance(plan.lake, x, y);
  rise *= smooth(0.4, 3, shore);
  const ground = GROUND + rise * open;
  const deep = smooth(0.3, -1.6, shore);
  return ground + (plan.lake.level - 0.42 - ground) * deep;
}

/** A smooth line through the points (Catmull-Rom), a point every `PATH_STEP` tiles or so. */
export function smoothLine(points: readonly Point[]): Point[] {
  const line: Point[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[Math.max(0, index - 1)];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[Math.min(points.length - 1, index + 2)];
    if (!p0 || !p1 || !p2 || !p3) continue;
    const steps = Math.max(2, Math.ceil(Math.hypot(p2.x - p1.x, p2.y - p1.y) / PATH_STEP));
    for (let step = 0; step < steps; step += 1) {
      const t = step / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const along = (a: number, b: number, c: number, d: number) =>
        0.5 *
        (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      line.push({ x: along(p0.x, p1.x, p2.x, p3.x), y: along(p0.y, p1.y, p2.y, p3.y) });
    }
  }
  const last = points[points.length - 1];
  if (last) line.push(last);
  return line;
}

/** Points along a line every `spacing` tiles, with the way it runs there. */
export function alongLine(line: readonly Point[], spacing: number, start = spacing / 2): Spot[] {
  const spots: Spot[] = [];
  let next = start;
  let walked = 0;
  for (let index = 1; index < line.length; index += 1) {
    const a = line[index - 1];
    const b = line[index];
    if (!a || !b) continue;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    while (length > 0 && next <= walked + length) {
      const t = (next - walked) / length;
      spots.push({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        yaw: Math.atan2(b.x - a.x, b.y - a.y),
      });
      next += spacing;
    }
    walked += length;
  }
  return spots;
}

/** Whether every piece of a thing stays clear of the office and hides none of it. */
function fitterOf(layout: Layout): (pieces: readonly Piece[]) => boolean {
  const points = sightPoints(layout);
  return (pieces) =>
    pieces.every((piece) => {
      const volume = volumeOf(piece);
      return !intrudes(layout, volume) && !hidesOffice(layout, volume, points);
    });
}

/** The park of a layout: where everything goes. The volumes come from `parkPieces`. */
export function parkPlan(layout: Layout): ParkPlan {
  const { width, height } = layout;
  const random = seeded(`park-${width}x${height}`);
  const frames = framesOf(layout);
  const seen = (x: number, y: number, z = GROUND) => inSight(frames, x, y, z, 40);

  // The plaza at the foot of the steps, and the lake beside it, on the side
  // of the front with more room.
  const entrance = entranceOf(layout);
  const ex = entrance ? entrance.x + 0.5 : width * 0.3;
  const side = ex < width / 2 ? 1 : -1;
  const plaza = { x: ex, y: height + 4.4, radius: 2.1 };
  const lobeA: Ellipse = { x: ex + side * 8.6, y: height + 5.9, rx: 4.7, ry: 2.2 };
  const lobeB: Ellipse = { x: ex + side * 15.9, y: height + 5.2, rx: 3.2, ry: 1.8 };
  const lake: Lake = { lobes: [lobeA, lobeB], level: GROUND - 0.12 };
  const neck = { x: (lobeA.x + side * lobeA.rx + lobeB.x - side * lobeB.rx) / 2, y: height + 5.5 };

  // Paths: a promenade along the front and the side of the building, a walk
  // from the plaza around the lake and over the bridge, and one out to the
  // gazebo on the lawn beside the building.
  const front = height + 2.6;
  const flank = width + 3;
  const promenade: Point[] = [
    { x: -REACH * 0.6, y: front + 0.6 },
    { x: -4, y: front },
    { x: width * 0.5, y: front },
    { x: width + 1.6, y: front - 0.4 },
    { x: flank, y: height - 2 },
    { x: flank, y: height * 0.4 },
    { x: flank + 0.6, y: -REACH * 0.6 },
  ];
  const walk: Point[] = [
    { x: plaza.x, y: plaza.y },
    { x: plaza.x + side * 2, y: height + 8.4 },
    { x: lobeA.x, y: lobeA.y + lobeA.ry + 1.3 },
    { x: neck.x, y: height + 9.2 },
    { x: neck.x, y: neck.y },
    { x: neck.x + side * 0.2, y: front },
  ];
  const gazebo = side > 0 ? { x: width + 7, y: height * 0.42 } : { x: -7, y: height * 0.42 };
  const toGazebo: Point[] =
    side > 0
      ? [
          { x: flank, y: height * 0.62 },
          { x: (flank + gazebo.x) / 2, y: height * 0.55 },
          { x: gazebo.x - 1.2, y: gazebo.y + 0.3 },
        ]
      : [
          { x: -3, y: height * 0.62 },
          { x: (-3 + gazebo.x) / 2, y: height * 0.55 },
          { x: gazebo.x + 1.2, y: gazebo.y + 0.3 },
        ];
  const back: Point[] = [
    { x: -3.4, y: front - 1 },
    { x: -3.2, y: height * 0.5 },
    { x: -3, y: -3 },
    { x: width * 0.5, y: -3.4 },
    { x: flank + 0.6, y: -3 },
  ];
  const paths: Path[] = [
    { line: smoothLine(promenade), width: 1.1 },
    { line: smoothLine(walk), width: 0.95 },
    { line: smoothLine(toGazebo), width: 0.9 },
    { line: smoothLine(back), width: 0.9 },
  ];
  const bridge = { from: { x: neck.x, y: neck.y + 1.5 }, to: { x: neck.x, y: neck.y - 1.5 } };
  const deck = { x: lobeA.x - side * 1.6, y: lobeA.y + lobeA.ry - 0.2, yaw: Math.PI, length: 2.2 };

  const knolls = [
    { x: -9, y: height * 0.3, radius: 6, rise: 0.7 },
    { x: width * 0.65, y: -9, radius: 7, rise: 0.9 },
    { x: width + 9, y: -4, radius: 6, rise: 0.6 },
    { x: lobeB.x + side * 6, y: height + 9, radius: 5, rise: 0.5 },
  ];

  const base = { width, height, reach: REACH, lake, knolls, plaza };
  /** Whether a spot of ground is free for a thing of this radius. */
  const taken: (Point & { readonly r: number })[] = [
    { ...plaza, r: plaza.radius + 0.3 },
    { ...gazebo, r: 2.2 },
  ];
  const free = (x: number, y: number, r: number, onPath = 0.5, pathR = r) =>
    outside(base, x, y) > 1.2 + r &&
    !intrudes(layout, { x0: x - r, x1: x + r, y0: y - r, y1: y + r, z0: GROUND, z1: GROUND + 1 }) &&
    shoreDistance(lake, x, y) > r + 0.4 &&
    pathDistance(paths, x, y) > pathR + onPath &&
    taken.every((other) => Math.hypot(other.x - x, other.y - y) > other.r + r);

  // Flower beds: a pair flanking the plaza, a ring round the gazebo, some along the promenade.
  const beds: Bed[] = [];
  const bed = (x: number, y: number, w: number, d: number, yaw: number) => {
    const r = Math.max(w, d) / 2;
    if (!free(x, y, r, 0.15, d / 2) || !seen(x, y)) return;
    const tones = Array.from({ length: Math.round(w * d * 9) }, () =>
      // Mostly one or two colours per bed, as planted.
      random() < 0.7 ? (beds.length * 2) % FLOWERS.length : Math.floor(random() * FLOWERS.length),
    );
    beds.push({ x, y, w, d, yaw, tones });
    taken.push({ x, y, r });
  };
  // Flanking the plaza, along its rim (the plaza's own ground is taken, so these are checked against the rest).
  for (const turn of [0.85, 0.1]) {
    const angle = Math.PI * (side > 0 ? turn : 1 - turn);
    const x = plaza.x + Math.cos(angle) * (plaza.radius + 1.3);
    const y = plaza.y + Math.sin(angle) * (plaza.radius + 1.3);
    bed(x, y, 1.9, 0.8, Math.PI / 2 - angle);
  }
  for (const spot of alongLine(paths[0]?.line ?? [], 8, 4)) {
    const nx = Math.cos(spot.yaw);
    const ny = -Math.sin(spot.yaw);
    // On the side away from the building.
    const out = spot.y > height || spot.x > width ? 1 : -1;
    const offset = (paths[0]?.width ?? 1) / 2 + 0.85;
    bed(spot.x + nx * offset * out, spot.y + ny * offset * out, 2.4, 0.9, spot.yaw);
  }

  // Benches and lamps along the paths, facing them; tables on the lawns.
  const benches: Spot[] = [];
  const lamps: Spot[] = [];
  paths.forEach((path, index) => {
    for (const [n, spot] of alongLine(path.line, 5.2, 2.6 + index).entries()) {
      const out = n % 2 === 0 ? 1 : -1;
      const offset = path.width / 2 + 0.55;
      const nx = Math.cos(spot.yaw) * out;
      const ny = -Math.sin(spot.yaw) * out;
      const lamp = { x: spot.x + nx * offset, y: spot.y + ny * offset, yaw: spot.yaw };
      if (free(lamp.x, lamp.y, 0.4, 0.1, 0.2) && seen(lamp.x, lamp.y)) {
        lamps.push(lamp);
        taken.push({ ...lamp, r: 0.3 });
      }
    }
    for (const [n, spot] of alongLine(path.line, 7.4, 5.4 + index).entries()) {
      const out = n % 2 === 0 ? -1 : 1;
      const offset = path.width / 2 + 0.6;
      const nx = Math.cos(spot.yaw) * out;
      const ny = -Math.sin(spot.yaw) * out;
      const bench = {
        x: spot.x + nx * offset,
        y: spot.y + ny * offset,
        // Its seat faces the path.
        yaw: Math.atan2(-nx, -ny),
      };
      if (free(bench.x, bench.y, 0.9, 0.1, 0.45) && seen(bench.x, bench.y)) {
        benches.push(bench);
        taken.push({ ...bench, r: 0.8 });
      }
    }
  });

  const tables: Spot[] = [];
  for (const [dx, dy] of [
    [side * 2.6, 2.4],
    [side * 3.2, -2.6],
    [side * -0.4, 3.4],
  ] as const) {
    const spot = { x: gazebo.x + dx, y: gazebo.y + dy, yaw: random() * Math.PI };
    if (free(spot.x, spot.y, 0.9) && seen(spot.x, spot.y)) {
      tables.push(spot);
      taken.push({ ...spot, r: 1.1 });
    }
  }

  // Trees in groves: a jittered grid kept where a grove is, clear of
  // everything else, in sight in some frame (or tall enough to rise into one
  // from behind), and never hiding the office.
  const fits = fitterOf(layout);
  const trees: Tree[] = [];
  const bushes: (Point & { size: number; bloom: number | null })[] = [];
  const grove = (x: number, y: number) =>
    Math.sin(x * 0.29 + 0.7) * Math.cos(y * 0.33 + 1.9) + 0.6 * Math.sin((x - y) * 0.17);
  const spread = REACH + 4;
  for (let gx = -spread; gx < width + spread; gx += 2.3)
    for (let gy = -spread; gy < height + spread; gy += 2.3) {
      const x = gx + (random() - 0.5) * 1.8;
      const y = gy + (random() - 0.5) * 1.8;
      const roll = random();
      const size = 0.85 + random() * 0.6;
      const behind = x < 0 || y < 0;
      if (grove(x, y) < (behind ? -0.2 : 0.25)) continue;
      if (!free(x, y, size * 0.55, 0.4)) continue;
      const kind: TreeKind =
        roll < 0.14
          ? 'jacaranda'
          : shoreDistance(lake, x, y) < 4 && roll < 0.5
            ? 'birch'
            : behind && roll < 0.55
              ? 'pine'
              : 'oak';
      const top = heightAt(base, x, y) + size * 2.3;
      if (!seen(x, y) && !seen(x, y, top)) continue;
      const tree = { kind, x, y, size, seed: Math.floor(random() * 10_000) };
      if (fits(treeVolume(tree, heightAt(base, x, y)))) {
        trees.push(tree);
        taken.push({ x, y, r: size * 0.5 });
      } else if (free(x, y, 0.6, 0.3)) {
        // Where a tree would hide the office, a bush.
        bushes.push({ x, y, size: 0.55 + random() * 0.3, bloom: null });
        taken.push({ x, y, r: 0.5 });
      }
    }

  // Bushes at the edges of groves and along the plaza; some in flower.
  for (const tree of trees) {
    if (random() < 0.45) continue;
    const angle = random() * Math.PI * 2;
    const x = tree.x + Math.cos(angle) * (tree.size * 0.9 + 0.5);
    const y = tree.y + Math.sin(angle) * (tree.size * 0.9 + 0.5);
    const size = 0.4 + random() * 0.4;
    if (free(x, y, size * 0.7, 0.25) && seen(x, y)) {
      bushes.push({
        x,
        y,
        size,
        bloom: random() < 0.3 ? Math.floor(random() * FLOWERS.length) : null,
      });
      taken.push({ x, y, r: size * 0.5 });
    }
  }
  for (let index = 0; index < 7; index += 1) {
    const angle = Math.PI * (0.15 + (index / 6) * 0.7);
    const x = plaza.x + Math.cos(angle) * (plaza.radius + 0.7);
    const y = plaza.y + Math.sin(angle) * (plaza.radius + 0.7);
    if (pathDistance(paths, x, y) > 0.5 && outside(base, x, y) > 1.6)
      bushes.push({ x, y, size: 0.5, bloom: index % 2 === 0 ? 0 : null });
  }

  // Rocks: some at the shore, some in the lawns.
  const rocks: (Point & { size: number; seed: number })[] = [];
  for (let index = 0; index < 60; index += 1) {
    const lobe = random() < 0.5 ? lobeA : lobeB;
    const angle = random() * Math.PI * 2;
    const at = index < 22 ? 1.04 + random() * 0.08 : 0;
    const x = at
      ? lobe.x + Math.cos(angle) * lobe.rx * at
      : -spread + random() * (width + spread * 2);
    const y = at
      ? lobe.y + Math.sin(angle) * lobe.ry * at
      : -spread + random() * (height + spread * 2);
    const size = at ? 0.25 + random() * 0.35 : 0.3 + random() * 0.5;
    if (!seen(x, y) || pathDistance(paths, x, y) < size + 0.2 || outside(base, x, y) < 1.8)
      continue;
    if (!at && !free(x, y, size * 0.5, 0.2)) continue;
    if (Math.abs(x - neck.x) < 1.6 && Math.abs(y - neck.y) < 2.4) continue;
    rocks.push({ x, y, size, seed: Math.floor(random() * 10_000) });
  }

  // In and around the water: reeds at the shore, lilies, ducks.
  const reeds: Point[] = [];
  const lilies: (Point & { size: number; bloom: boolean })[] = [];
  for (const lobe of lake.lobes) {
    for (let index = 0; index < 5; index += 1) {
      const angle = random() * Math.PI * 2;
      const x = lobe.x + Math.cos(angle) * lobe.rx * 0.93;
      const y = lobe.y + Math.sin(angle) * lobe.ry * 0.93;
      if (pathDistance(paths, x, y) > 0.9 && Math.hypot(x - deck.x, y - deck.y) > 2)
        reeds.push({ x, y });
    }
    for (let index = 0; index < 7; index += 1) {
      const angle = random() * Math.PI * 2;
      const t = 0.45 + random() * 0.4;
      lilies.push({
        x: lobe.x + Math.cos(angle) * lobe.rx * t,
        y: lobe.y + Math.sin(angle) * lobe.ry * t,
        size: 0.25 + random() * 0.2,
        bloom: random() < 0.35,
      });
    }
  }
  const ducks: Spot[] = [
    { x: lobeA.x + side * 1.2, y: lobeA.y - 0.6, yaw: 2.2 },
    { x: lobeA.x + side * 1.9, y: lobeA.y - 0.2, yaw: 2.5 },
    { x: lobeB.x - side * 0.4, y: lobeB.y + 0.5, yaw: -0.9 },
  ];

  // Small flowers in the grass, and fireflies over it at night.
  const blossoms: (Point & { tone: number })[] = [];
  for (let index = 0; index < 260; index += 1) {
    const x = -spread / 2 + random() * (width + spread);
    const y = -spread / 2 + random() * (height + spread);
    if (seen(x, y) && free(x, y, 0.05, 0.15)) blossoms.push({ x, y, tone: random() < 0.6 ? 3 : 2 });
  }
  const fireflies: (Point & { z: number })[] = [];
  for (let index = 0; index < 90 && fireflies.length < 46; index += 1) {
    const anchor = trees[Math.floor(random() * trees.length)];
    if (!anchor) break;
    const x = anchor.x + (random() - 0.5) * 3;
    const y = anchor.y + (random() - 0.5) * 3;
    if (outside(base, x, y) < 2 || !seen(x, y)) continue;
    fireflies.push({ x, y, z: heightAt(base, x, y) + 0.35 + random() * 0.9 });
  }

  return {
    ...base,
    paths,
    gazebo,
    bridge,
    deck,
    trees,
    bushes,
    beds,
    benches,
    lamps,
    tables,
    rocks,
    reeds,
    lilies,
    ducks,
    blossoms,
    fireflies,
  };
}
