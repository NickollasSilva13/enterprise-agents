import { entranceOf, type OfficeLayout } from '@ea/shared';
import { GROUND, seeded } from '../../approach';
import { pick, type Point } from '../kit';
import type { Part, Piece } from '../pieces';
import { placed } from '../pieces';
import { CAR_COLORS, type Thing, townPlanner } from '../town';

// The modern condominium around the office (Phase 35), as plain data in
// tiles: the office as the clubhouse, with a paved terrace at its foot and
// the pool in front (deck, loungers, parasols, lights under the water at
// night); the inner roads of pale pavers lit by bollards; modern houses of
// white boxes, wood and glass on their lots, each with its driveway, car,
// cypresses and beds of grasses; the gatehouse with its barrier, and the
// white wall round it all. The same layout always gets the same condominium.

type Layout = Pick<OfficeLayout, 'width' | 'height' | 'items'>;

export interface Pool {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly d: number;
  readonly level: number;
}

export interface CondoPlan {
  readonly things: readonly Thing[];
  readonly pool: Pool;
  /** Where the bollards light the ground at night. */
  readonly lights: readonly Point[];
}

const PAVER = '#d8d3c8';
const JOINT = '#bdb7aa';
const TERRACE = '#e6e1d7';
const DECK = '#a87a52';
const DRIVE = '#5c5f68';
const GRAVEL = '#cfc4a8';
const FAR = 44;
const CLADDING = ['#3b3f4a', '#9a6a45', '#5a5f6b', '#b07d52'] as const;
const PARASOLS = ['#f4f1ea', '#e9dcc4', '#3b3f4a'] as const;

export function condoPlan(layout: Layout): CondoPlan {
  const { width: w, height: h } = layout;
  const random = seeded(`condo-${w}x${h}`);
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
  const entrance = entranceOf(layout);
  const ex = entrance ? entrance.x + 0.5 : w * 0.3;
  const side = ex < w / 2 ? 1 : -1;
  const lights: Point[] = [];

  // The terrace at the foot of the clubhouse, with its paving joints.
  const terrace = { x0: -3.2, y0: h + 2.5, x1: w + 3.2, y1: h + 4.6 };
  flat(terrace.x0, terrace.y0, terrace.x1, terrace.y1, TERRACE, 0.05);
  flat(w + 2.5, -3.2, w + 4.6, terrace.y1, TERRACE, 0.05);
  flat(ex - 0.7, h + 2.45, ex + 0.7, terrace.y0, TERRACE, 0.05);
  for (let x = terrace.x0 + 1.2; x < terrace.x1; x += 1.2)
    flat(x, terrace.y0, x + 0.03, terrace.y1, JOINT, 0.05, 0.002);

  // The pool in front, its deck, its coping, loungers and parasols.
  const px0 = side > 0 ? ex + 2.2 : ex - 11.2;
  const pool: Pool = { x: px0 + 4.5, y: h + 8.6, w: 9, d: 3.4, level: GROUND + 0.05 };
  const pX0 = pool.x - pool.w / 2;
  const pX1 = pool.x + pool.w / 2;
  const pY0 = pool.y - pool.d / 2;
  const pY1 = pool.y + pool.d / 2;
  flat(pX0 - 1.4, pY0 - 1.6, pX1 + 1.4, pY1 + 2.2, DECK, 0.06);
  for (let x = pX0 - 1.4; x < pX1 + 1.4; x += 0.3)
    flat(x, pY0 - 1.6, x + 0.02, pY1 + 2.2, '#8a6242', 0.06, 0.002);
  flat(pX0, pY0, pX1, pY1, '#5fd0e0', 0.04, 0.01);
  for (const [x0, y0, x1, y1] of [
    [pX0 - 0.3, pY0 - 0.3, pX1 + 0.3, pY0],
    [pX0 - 0.3, pY1, pX1 + 0.3, pY1 + 0.3],
    [pX0 - 0.3, pY0, pX0, pY1],
    [pX1, pY0, pX1 + 0.3, pY1],
  ] as const)
    flat(x0, y0, x1, y1, '#f4f2ec', 0.12);
  planner.add(
    {
      kind: 'pieces',
      pieces: (ink) =>
        ink.lit
          ? [0.2, 0.4, 0.6, 0.8].flatMap((t): Piece[] => [
              {
                x: pX0 + pool.w * t,
                y: pY0 + 0.08,
                z: GROUND,
                w: 0.3,
                d: 0.05,
                h: 0.06,
                color: '#7fe8ff',
                surface: 'glow',
              },
              {
                x: pX0 + pool.w * t,
                y: pY1 - 0.08,
                z: GROUND,
                w: 0.3,
                d: 0.05,
                h: 0.06,
                color: '#7fe8ff',
                surface: 'glow',
              },
            ])
          : [],
    },
    true,
  );
  for (let x = pX0 + 0.6; x < pX1 - 0.3; x += 1.5) {
    planner.add({ kind: 'lounger', spot: { x, y: pY1 + 1.25, yaw: Math.PI } });
    if (Math.round((x - pX0) / 1.5) % 2 === 1)
      planner.add({
        kind: 'parasol',
        x: x + 0.75,
        y: pY1 + 1.5,
        color: pick(PARASOLS, Math.round(x)),
      });
  }

  // The inner roads: pale pavers with joints, lit by bollards.
  const road = [h + 13.2, h + 16.2];
  const sRoad = [w + 6.5, w + 9.5];
  const [r0 = 0, r1 = 0] = road;
  const [s0 = 0, s1 = 0] = sRoad;
  flat(-FAR, r0, w + FAR, r1, PAVER, 0.04);
  flat(s0, -FAR, s1, h + FAR, PAVER, 0.04, 0.002);
  for (let x = -FAR; x < w + FAR; x += 1.0) flat(x, r0, x + 0.03, r1, JOINT, 0.04, 0.003);
  for (let y = -FAR; y < h + FAR; y += 1.0) flat(s0, y, s1, y + 0.03, JOINT, 0.04, 0.004);
  // A path from the terrace to the road, beside the pool.
  const walk = side > 0 ? pX0 - 2.2 : pX1 + 2.2;
  flat(walk - 0.6, terrace.y1, walk + 0.6, r0, TERRACE, 0.05);
  const bollardAt = (x: number, y: number) => {
    if (planner.add({ kind: 'bollard', x, y })) lights.push({ x, y });
  };
  for (let x = -FAR + 1; x < w + FAR; x += 3.2) {
    if (x > s0 - 1 && x < s1 + 1) continue;
    bollardAt(x, r0 - 0.35);
    bollardAt(x + 1.6, r1 + 0.35);
  }
  for (let y = -FAR + 1; y < h + FAR; y += 3.2) {
    if (y > r0 - 1 && y < r1 + 1) continue;
    bollardAt(s0 - 0.35, y);
    bollardAt(s1 + 0.35, y + 1.6);
  }
  for (let y = terrace.y1 + 0.8; y < r0 - 0.5; y += 1.6) bollardAt(walk + 0.85, y);

  // Gardens of the clubhouse: cypresses behind and beside it, grasses and box balls in beds.
  for (let x = -2.4; x < w + 2.4; x += 2.2)
    planner.add({
      kind: 'tree',
      tree: { kind: 'cypress', x, y: -2.6, size: 0.9 + random() * 0.2, seed: Math.floor(x * 17) },
    });
  for (let y = -0.4; y < h + 2; y += 2.2)
    planner.add({
      kind: 'tree',
      tree: { kind: 'cypress', x: -2.6, y, size: 0.9 + random() * 0.2, seed: Math.floor(y * 19) },
    });
  const bed = (x0: number, y0: number, x1: number, y1: number) => {
    flat(x0, y0, x1, y1, GRAVEL, 0.05);
    for (let x = x0 + 0.4; x < x1 - 0.2; x += 0.8)
      for (let y = y0 + 0.4; y < y1 - 0.2; y += 0.8)
        if (random() < 0.6) planner.add({ kind: 'grass', x, y, seed: Math.floor(random() * 100) });
        else planner.add({ kind: 'topiary', x, y, size: 0.45, seed: Math.floor(random() * 1000) });
  };
  bed(terrace.x0, terrace.y1 + 0.4, terrace.x0 + 4, terrace.y1 + 1.8);
  bed(w + 5, h * 0.3, w + 6.2, h * 0.3 + 4);

  // Modern houses on their lots, each with a driveway to the road, a car,
  // two cypresses at the door and a bed of grasses.
  let n = 0;
  const lot = (x: number, y: number, yaw: number, roadEdge: { x: number; y: number }) => {
    n += 1;
    const spec = {
      x,
      y,
      yaw,
      w: 4.6 + random() * 0.8,
      d: 3.6 + random() * 0.5,
      cladding: pick(CLADDING, n),
      seed: Math.floor(random() * 10_000),
    };
    if (!planner.add({ kind: 'modern', spec })) return;
    const fx = Math.sin(yaw);
    const fy = Math.cos(yaw);
    const sx = Math.cos(yaw);
    const sy = -Math.sin(yaw);
    const gx = x + sx * (spec.w * 0.38);
    const gy = y + sy * (spec.w * 0.38);
    const ax = gx + fx * (spec.d / 2);
    const ay = gy + fy * (spec.d / 2);
    const bx = roadEdge.x + sx * (spec.w * 0.38);
    const by = roadEdge.y + sy * (spec.w * 0.38);
    const alongX = Math.abs(bx - ax) > Math.abs(by - ay);
    flat(
      Math.min(ax, bx) - (alongX ? 0 : 0.8),
      Math.min(ay, by) - (alongX ? 0.8 : 0),
      Math.max(ax, bx) + (alongX ? 0 : 0.8),
      Math.max(ay, by) + (alongX ? 0.8 : 0),
      DRIVE,
      0.05,
    );
    if (random() < 0.7)
      planner.add({
        kind: 'car',
        x: (ax + bx) / 2,
        y: (ay + by) / 2,
        yaw: yaw + Math.PI,
        color: pick(['#2b2b33', '#f2f2ef', '#9aa3ad', '#3f6fd1', '#5a5f6b'], n * 3),
      });
    for (const k of [-1, 1]) {
      const tx = x - sx * (spec.w * 0.42) + fx * (spec.d / 2 + 0.6) + sx * k * 0.5;
      const ty = y - sy * (spec.w * 0.42) + fy * (spec.d / 2 + 0.6) + sy * k * 0.5;
      planner.add({
        kind: 'tree',
        tree: { kind: 'cypress', x: tx, y: ty, size: 0.75, seed: n * 7 + k },
      });
    }
    const cx = x - sx * (spec.w * 0.1) + fx * (spec.d / 2 + 1.6);
    const cy = y - sy * (spec.w * 0.1) + fy * (spec.d / 2 + 1.6);
    for (let k = -2; k <= 1; k += 1)
      planner.add({ kind: 'grass', x: cx + sx * k * 0.6, y: cy + sy * k * 0.6, seed: n * 5 + k });
  };
  for (let x = -18; x < w + 24; x += 7.6) {
    if (x > s0 - 4.5 && x < s1 + 4.5) continue;
    lot(x, r1 + 5, Math.PI, { x, y: r1 });
  }
  for (let y = -16; y < h + 6; y += 7.6) lot(s1 + 5, y, -Math.PI / 2, { x: s1, y });
  for (let x = -16; x < w + 4; x += 7.6) lot(x, -9.5, Math.PI, { x, y: -14 });
  for (let y = -6; y < h + 4; y += 7.6) lot(-9.5, y, -Math.PI / 2, { x: -14, y });

  // The white wall round the condominium, beyond the houses behind and beside.
  const wall = (x0: number, y0: number, x1: number, y1: number) =>
    planner.add({
      kind: 'pieces',
      pieces: (ink) => [
        {
          x: (x0 + x1) / 2,
          y: (y0 + y1) / 2,
          z: GROUND,
          w: Math.max(0.25, x1 - x0),
          d: Math.max(0.25, y1 - y0),
          h: 1.1,
          color: ink.tone('#eeebe4'),
          shade: 0.12,
        },
        {
          x: (x0 + x1) / 2,
          y: (y0 + y1) / 2,
          z: GROUND + 1.1,
          w: Math.max(0.35, x1 - x0),
          d: Math.max(0.35, y1 - y0),
          h: 0.08,
          color: ink.tone('#4a4d56'),
        },
      ],
    });
  wall(-15, -15, w + 30, -14.75);
  wall(-15, -15, -14.75, h + 30);

  // The gatehouse at the side road, with its barrier.
  const gate = { x: s1 + 2, y: r1 + 2.2 };
  planner.add({
    kind: 'pieces',
    pieces: (ink) => {
      const lit = ink.lit;
      const parts: Part[] = [
        { dx: 0, dy: 0, dz: 0, w: 1.8, d: 1.6, h: 0.12, color: ink.tone('#b9b5ad') },
        { dx: 0, dy: 0, dz: 0.12, w: 1.5, d: 1.3, h: 1.1, color: ink.tone('#f1efe9'), shade: 0.1 },
        {
          dx: 0,
          dy: 0.66,
          dz: 0.4,
          w: 1.2,
          d: 0.04,
          h: 0.6,
          color: lit ? '#ffd9a0' : ink.tone('#4a6688'),
          surface: lit ? 'glow' : 'gloss',
        },
        { dx: 0, dy: 0, dz: 1.22, w: 2.1, d: 1.9, h: 0.1, color: ink.tone('#3b3f4a') },
        { dx: -1.0, dy: 0.9, dz: 0, w: 0.18, d: 0.18, h: 0.8, color: ink.tone('#3b3f4a') },
        // The barrier across the road, white with red bands.
        ...Array.from({ length: 6 }, (_, k): Part => ({
          dx: -1.0 - 0.25 - k * 0.42,
          dy: 0.9,
          dz: 0.7,
          w: 0.42,
          d: 0.07,
          h: 0.07,
          color: ink.tone(k % 2 ? '#d94b4b' : '#f4f2ec'),
        })),
      ];
      return placed(gate.x, gate.y, GROUND, -Math.PI / 2, parts);
    },
  });

  // Visitors' cars on the road by the clubhouse.
  for (let x = -6; x < w + 2; x += 2.8)
    if (random() < 0.4)
      planner.add({
        kind: 'car',
        x,
        y: r0 + 0.6,
        yaw: Math.PI / 2,
        color: pick(CAR_COLORS, Math.floor(random() * 8)),
      });

  return { things: planner.things, pool, lights };
}
