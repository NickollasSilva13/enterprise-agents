import { entranceOf, type OfficeLayout } from '@ea/shared';
import { seeded } from '../../approach';
import { pick, type Spot } from '../kit';
import { CAR_COLORS, HOUSE_ROOFS, HOUSE_WALLS, type Thing, townPlanner } from '../town';

// The residential neighbourhood around the office (Phase 35), as plain data
// in tiles: the office on its own lot with a picket fence and a gate at the
// steps, the two streets that meet at its front corner with their pavements,
// kerbs, lane marks and crossings, houses with front yards, garages and
// mailboxes across the streets, the neighbours' back gardens behind and
// beside the office, street trees, lamps and parked cars. The same layout
// always gets the same street.

type Layout = Pick<OfficeLayout, 'width' | 'height' | 'items'>;

export interface NeighborhoodPlan {
  readonly things: readonly Thing[];
  /** Where the street lamps cast their light at night. */
  readonly lamps: readonly Spot[];
}

const ASPHALT = '#3d414c';
const PAVEMENT = '#c9c4b8';
const KERB = '#a9a397';
const MARK = '#f2d36b';
const ZEBRA = '#f2f0ea';
const DRIVE = '#b5b0a5';
/** How far streets and lots go: past every frame's edge. */
const FAR = 44;

export function neighborhoodPlan(layout: Layout): NeighborhoodPlan {
  const { width: w, height: h } = layout;
  const random = seeded(`neighborhood-${w}x${h}`);
  const planner = townPlanner(layout);
  const flat = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    color: string,
    height = 0.03,
    lift = 0,
  ) => planner.add({ kind: 'strip', x0, y0, x1, y1, color, height, lift }, true);
  /** A flat band from one point to another, `half` wide on each side (a path, a driveway). */
  const pad = (ax: number, ay: number, bx: number, by: number, half: number, color: string) => {
    const alongX = Math.abs(bx - ax) > Math.abs(by - ay);
    flat(
      Math.min(ax, bx) - (alongX ? 0 : half),
      Math.min(ay, by) - (alongX ? half : 0),
      Math.max(ax, bx) + (alongX ? 0 : half),
      Math.max(ay, by) + (alongX ? half : 0),
      color,
      0.04,
    );
  };
  const entrance = entranceOf(layout);
  const ex = entrance ? entrance.x + 0.5 : w * 0.3;

  // The lot of the office, the pavement and the two streets.
  const fence = 3.4;
  const inner = [h + 3.7, h + 4.9];
  const street = [h + 4.9, h + 8.5];
  const outer = [h + 8.5, h + 9.7];
  const sInner = [w + 3.7, w + 4.9];
  const sStreet = [w + 4.9, w + 8.5];
  const sOuter = [w + 8.5, w + 9.7];
  const [i0 = 0, i1 = 0] = inner;
  const [t0 = 0, t1 = 0] = street;
  const [o0 = 0, o1 = 0] = outer;
  const [si0 = 0, si1 = 0] = sInner;
  const [st0 = 0, st1 = 0] = sStreet;
  const [so0 = 0, so1 = 0] = sOuter;
  flat(-FAR, t0, w + FAR, t1, ASPHALT, 0.03);
  flat(st0, -FAR, st1, h + FAR, ASPHALT, 0.03, 0.002);
  // Pavements of the four blocks, raised a little, with their kerbs.
  for (const [x0, y0, x1, y1] of [
    [-FAR, i0, si1, i1],
    [si0, -FAR, si1, i1],
    [-FAR, o0, si1, o1],
    [si0, o0, si1, h + FAR],
    [so0, i0, w + FAR, i1],
    [so0, -FAR, so1, i1],
    [so0, o0, w + FAR, o1],
    [so0, o0, so1, h + FAR],
  ] as const)
    flat(x0, y0, x1, y1, PAVEMENT, 0.08);
  for (const [x0, y0, x1, y1] of [
    [-FAR, i1 - 0.08, si1, i1],
    [si1 - 0.08, -FAR, si1, i1],
    [-FAR, o0, si1, o0 + 0.08],
    [si1 - 0.08, o0, si1, h + FAR],
    [so0, i1 - 0.08, w + FAR, i1],
    [so0, -FAR, so0 + 0.08, i1],
    [so0, o0, w + FAR, o0 + 0.08],
    [so0, o0, so0 + 0.08, h + FAR],
  ] as const)
    flat(x0, y0, x1, y1, KERB, 0.1);
  // Lane marks, broken, out of the crossing; zebras at its four sides.
  const middle = (t0 + t1) / 2;
  const sMiddle = (st0 + st1) / 2;
  for (let x = -FAR; x < w + FAR; x += 1.6)
    if (x + 0.8 < si0 - 1.2 || x > so1 + 1.2)
      flat(x, middle - 0.05, x + 0.8, middle + 0.05, MARK, 0.03, 0.004);
  for (let y = -FAR; y < h + FAR; y += 1.6)
    if (y + 0.8 < i0 - 1.2 || y > o1 + 1.2)
      flat(sMiddle - 0.05, y, sMiddle + 0.05, y + 0.8, MARK, 0.03, 0.004);
  for (let k = 0; k < 6; k += 1) {
    const a = t0 + 0.3 + k * 0.55;
    flat(si0 - 1.4, a, si0 - 0.3, a + 0.3, ZEBRA, 0.03, 0.004);
    flat(so1 + 0.3, a, so1 + 1.4, a + 0.3, ZEBRA, 0.03, 0.004);
    const b = st0 + 0.3 + k * 0.55;
    flat(b, i0 - 1.4, b + 0.3, i0 - 0.3, ZEBRA, 0.03, 0.004);
    flat(b, o1 + 0.3, b + 0.3, o1 + 1.4, ZEBRA, 0.03, 0.004);
  }

  // The office's lot: a path from the steps to the gate, the picket fence round it.
  flat(ex - 0.55, h + 2.45, ex + 0.55, i0, DRIVE, 0.05);
  const corners = { x0: -fence, y0: -fence, x1: w + fence, y1: h + fence };
  for (const [from, to] of [
    [
      { x: corners.x0, y: corners.y1 },
      { x: ex - 0.8, y: corners.y1 },
    ],
    [
      { x: ex + 0.8, y: corners.y1 },
      { x: corners.x1, y: corners.y1 },
    ],
    [
      { x: corners.x1, y: corners.y1 },
      { x: corners.x1, y: corners.y0 },
    ],
    [
      { x: corners.x1, y: corners.y0 },
      { x: corners.x0, y: corners.y0 },
    ],
    [
      { x: corners.x0, y: corners.y0 },
      { x: corners.x0, y: corners.y1 },
    ],
  ] as const)
    planner.add({ kind: 'fence', from, to });
  for (const [x, y] of [
    [corners.x0 + 1, corners.y0 + 1],
    [corners.x1 - 1, corners.y0 + 1],
    [corners.x0 + 1, corners.y1 - 1],
    [corners.x1 - 1, corners.y1 - 1],
    [ex - 1.4, corners.y1 - 0.6],
    [ex + 1.4, corners.y1 - 0.6],
  ] as const)
    planner.add({ kind: 'topiary', x, y, size: 0.6, seed: Math.floor(x * 31 + y * 17) });
  for (let x = corners.x0 + 3; x < corners.x1 - 2; x += 4.5)
    planner.add({
      kind: 'tree',
      tree: { kind: 'round', x, y: corners.y0 + 1.1, size: 0.95, seed: Math.floor(x * 13) },
    });

  // A house on a lot: the house, a path and a mailbox at the pavement, a
  // driveway to its garage with sometimes a car, a tree in the yard.
  const lot = (x: number, y: number, yaw: number, front: { x: number; y: number }, n: number) => {
    const garage = random() < 0.55;
    const spec = {
      x,
      y,
      yaw,
      w: 3.4 + random() * 0.8,
      d: 3.0 + random() * 0.6,
      floors: random() < 0.45 ? 2 : 1,
      roof: random() < 0.6 ? 'gable' : 'hip',
      wall: pick(HOUSE_WALLS, n * 3 + 1),
      roofColor: pick(HOUSE_ROOFS, n * 7 + 2),
      garage,
      seed: Math.floor(random() * 10_000),
    } as const;
    if (!planner.add({ kind: 'house', spec })) return;
    // The front of the house toward its pavement, along the turn.
    const fx = Math.sin(yaw);
    const fy = Math.cos(yaw);
    const sx = Math.cos(yaw);
    const sy = -Math.sin(yaw);
    const doorX = x + fx * (spec.d / 2);
    const doorY = y + fy * (spec.d / 2);
    pad(doorX, doorY, front.x, front.y, 0.3, DRIVE);
    planner.add({
      kind: 'mailbox',
      spot: { x: front.x + sx * 0.9 - fx * 0.3, y: front.y + sy * 0.9 - fy * 0.3, yaw },
      seed: n,
    });
    if (garage) {
      const gx = x + sx * (spec.w / 2 + 1.15);
      const gy = y + sy * (spec.w / 2 + 1.15);
      const ox = front.x + sx * (spec.w / 2 + 1.15);
      const oy = front.y + sy * (spec.w / 2 + 1.15);
      pad(gx + fx * (spec.d / 2 - 0.4), gy + fy * (spec.d / 2 - 0.4), ox, oy, 0.8, DRIVE);
      if (random() < 0.6)
        planner.add({
          kind: 'car',
          x: (gx + ox) / 2 + fx * 0.6,
          y: (gy + oy) / 2 + fy * 0.6,
          yaw: yaw + Math.PI,
          color: pick(CAR_COLORS, n * 5 + 3),
        });
    }
    const tx = x - sx * (spec.w / 2 + 0.9) + fx * (spec.d / 2 + 1.0);
    const ty = y - sy * (spec.w / 2 + 0.9) + fy * (spec.d / 2 + 1.0);
    planner.add({
      kind: 'tree',
      tree: {
        kind: random() < 0.5 ? 'oak' : 'birch',
        x: tx,
        y: ty,
        size: 0.75 + random() * 0.25,
        seed: n * 11,
      },
    });
  };

  // Across the front street, facing it; across the side street, facing that.
  let n = 0;
  for (let x = -16; x < w + 22; x += 6.2) {
    n += 1;
    if (x > si0 - 3.6 && x < so1 + 3.6) continue;
    lot(x, o1 + 4.6, Math.PI, { x, y: o1 }, n);
  }
  for (let y = -16; y < h + 2; y += 6.2) {
    n += 1;
    lot(so1 + 4.6, y, -Math.PI / 2, { x: so1, y }, n);
  }
  // Behind and beside the office, the neighbours' houses turn their backs to it, across their gardens.
  for (let x = -14; x < w + 8; x += 6.6) {
    n += 1;
    lot(x, -fence - 7.5, Math.PI, { x, y: -fence - 12 }, n);
    planner.add({
      kind: 'fence',
      from: { x: x - 3.3, y: -fence - 1.2 },
      to: { x: x - 3.3, y: -fence - 5.2 },
    });
  }
  for (let y = -10; y < h + 2; y += 6.6) {
    n += 1;
    lot(-fence - 7.5, y, -Math.PI / 2, { x: -fence - 12, y }, n);
    planner.add({
      kind: 'fence',
      from: { x: -fence - 1.2, y: y - 3.3 },
      to: { x: -fence - 5.2, y: y - 3.3 },
    });
  }
  for (let x = -14; x < w + 8; x += 3.1)
    planner.add({
      kind: 'tree',
      tree: {
        kind: random() < 0.3 ? 'pine' : 'oak',
        x: x + random(),
        y: -fence - 2.6 - random(),
        size: 0.8 + random() * 0.4,
        seed: n++ * 13,
      },
    });
  for (let y = -10; y < h + 2; y += 3.1)
    planner.add({
      kind: 'tree',
      tree: {
        kind: random() < 0.3 ? 'pine' : 'oak',
        x: -fence - 2.6 - random(),
        y: y + random(),
        size: 0.8 + random() * 0.4,
        seed: n++ * 13,
      },
    });

  // Street trees, lamps and benches on the pavements; cars at the kerbs.
  const lamps: Spot[] = [];
  const lampAt = (x: number, y: number) => {
    if (planner.add({ kind: 'lamp', spot: { x, y, yaw: 0 } })) lamps.push({ x, y, yaw: 0 });
  };
  for (let x = -FAR + 2; x < w + FAR; x += 8.4) {
    if (Math.abs(x - (st0 + st1) / 2) < 3) continue;
    lampAt(x, i1 - 0.35);
    lampAt(x + 4.2, o0 + 0.35);
    planner.add({
      kind: 'tree',
      tree: { kind: 'round', x: x + 2.1, y: o0 + 0.5, size: 0.9, seed: Math.floor(x * 7) },
    });
  }
  for (let y = -FAR + 2; y < h + FAR; y += 8.4) {
    if (Math.abs(y - (t0 + t1) / 2) < 3) continue;
    lampAt(si1 - 0.35, y);
    lampAt(so0 + 0.35, y + 4.2);
    planner.add({
      kind: 'tree',
      tree: { kind: 'round', x: so0 + 0.5, y: y + 2.1, size: 0.9, seed: Math.floor(y * 7) },
    });
  }
  for (let x = -FAR + 1; x < w + FAR; x += 3.1) {
    if (x > si0 - 3 && x < so1 + 2) continue;
    if (random() < 0.45)
      planner.add({
        kind: 'car',
        x,
        y: t1 - 0.55,
        yaw: Math.PI / 2,
        color: pick(CAR_COLORS, Math.floor(random() * 8)),
      });
    if (random() < 0.25)
      planner.add({
        kind: 'car',
        x: x + 1.5,
        y: t0 + 0.55,
        yaw: -Math.PI / 2,
        color: pick(CAR_COLORS, Math.floor(random() * 8)),
      });
  }
  for (let y = -FAR + 1; y < h + FAR; y += 3.1) {
    if (y > i0 - 3 && y < o1 + 2) continue;
    if (random() < 0.45)
      planner.add({
        kind: 'car',
        x: st1 - 0.55,
        y,
        yaw: 0,
        color: pick(CAR_COLORS, Math.floor(random() * 8)),
      });
  }
  planner.add({ kind: 'bench', spot: { x: ex + 2.6, y: i1 - 0.4, yaw: 0 } });

  return { things: planner.things, lamps };
}
