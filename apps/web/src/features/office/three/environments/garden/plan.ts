import { entranceOf, type OfficeLayout } from '@ea/shared';
import { GROUND, seeded } from '../../approach';
import { type Ink, pick, type Point } from '../kit';
import { type Part, type Piece, placed } from '../pieces';
import { CAR_COLORS, type Thing, townPlanner } from '../town';

// The technological garden around the office (Phase 36), as plain data in
// tiles: a geometric garden of slate paths with lines of light along their
// edges, an axis of light pylons from the steps to a reflecting pool, raised
// planters and living walls, trees of light with glowing nodes, a glass dome
// for the greenhouse, solar canopies over charging cars, small wind turbines
// and bollards. By day it is white, slate and green; at night the lines,
// nodes and pylons glow cyan and purple, as the office does.

type Layout = Pick<OfficeLayout, 'width' | 'height' | 'items'>;

export interface GardenPlan {
  readonly things: readonly Thing[];
  /** The reflecting pool on the axis of the steps. */
  readonly pool: { readonly x: number; readonly y: number; readonly w: number; readonly d: number };
  /** Where something lights the ground at night. */
  readonly lights: readonly Point[];
}

const SLATE = '#414857';
const WHITE = '#eef0f3';
const STEEL = '#c9ced8';
const CYAN = '#7fe9ff';
const PURPLE = '#b48cff';
const FAR = 40;

/** A line of light along a path's edge: pale by day, glowing at night. */
function lightLine(x0: number, y0: number, x1: number, y1: number, color: string, ink: Ink): Piece {
  return {
    x: (x0 + x1) / 2,
    y: (y0 + y1) / 2,
    z: GROUND + 0.01,
    w: Math.max(0.05, Math.abs(x1 - x0)),
    d: Math.max(0.05, Math.abs(y1 - y0)),
    h: 0.04,
    color: ink.lit ? color : ink.tone('#c3cad6'),
    surface: ink.lit ? 'glow' : 'matte',
    shade: 0,
  };
}

/** A tree of light: a steel trunk branching three ways, a glowing node at each tip. */
function lightTree(x: number, y: number, seed: number, ink: Ink): Piece[] {
  const steel = ink.tone(STEEL);
  const node = (k: number) => (ink.lit ? (k % 2 ? CYAN : PURPLE) : ink.tone(WHITE));
  const parts: Part[] = [
    {
      dx: 0,
      dy: 0,
      dz: 0,
      w: 0.5,
      d: 0.5,
      h: 0.12,
      color: ink.tone(SLATE),
      shape: 'drum',
      sides: 8,
    },
    {
      dx: 0,
      dy: 0,
      dz: 0.1,
      w: 0.14,
      d: 0.14,
      h: 1.5,
      color: steel,
      shape: 'drum',
      sides: 8,
      surface: 'gloss',
    },
  ];
  for (let k = 0; k < 3; k += 1) {
    const angle = (k / 3) * Math.PI * 2 + seed;
    const lean = 0.55;
    const length = 0.9;
    parts.push(
      {
        dx: 0,
        dy: 0,
        dz: 1.45,
        w: 0.07,
        d: 0.07,
        h: length,
        color: steel,
        shape: 'drum',
        sides: 6,
        surface: 'gloss',
        tilt: lean,
        yaw: angle,
      },
      {
        dx: Math.sin(angle) * Math.sin(lean) * length,
        dy: Math.cos(angle) * Math.sin(lean) * length,
        dz: 1.45 + Math.cos(lean) * length - 0.1,
        w: 0.24,
        d: 0.24,
        h: 0.24,
        color: node(k),
        shape: 'ball',
        surface: ink.lit ? 'glow' : 'gloss',
      },
    );
  }
  parts.push({
    dx: 0,
    dy: 0,
    dz: 1.6,
    w: 0.3,
    d: 0.3,
    h: 0.3,
    color: node(seed),
    shape: 'ball',
    surface: ink.lit ? 'glow' : 'gloss',
  });
  return placed(x, y, GROUND, 0, parts);
}

/** A pylon of light: a slim white blade with a glowing stripe up its face. */
function pylon(x: number, y: number, yaw: number, ink: Ink): Piece[] {
  return placed(x, y, GROUND, yaw, [
    { dx: 0, dy: 0, dz: 0, w: 0.28, d: 0.12, h: 1.6, color: ink.tone(WHITE), shade: 0.1 },
    {
      dx: 0,
      dy: 0.065,
      dz: 0.15,
      w: 0.06,
      d: 0.02,
      h: 1.3,
      color: ink.lit ? PURPLE : ink.tone('#9aa3b5'),
      surface: ink.lit ? 'glow' : 'matte',
    },
  ]);
}

/** A raised planter with rows of clipped plants and grasses. */
function planter(
  x: number,
  y: number,
  w: number,
  d: number,
  yaw: number,
  seed: number,
  ink: Ink,
): Piece[] {
  const parts: Part[] = [
    { dx: 0, dy: 0, dz: 0, w, d, h: 0.38, color: ink.tone(WHITE), shade: 0.15 },
    { dx: 0, dy: 0, dz: 0.38, w: w - 0.14, d: d - 0.14, h: 0.02, color: ink.tone('#4a3a2e') },
  ];
  let n = seed;
  for (let dx = -w / 2 + 0.3; dx <= w / 2 - 0.25; dx += 0.42)
    for (let dy = -d / 2 + 0.3; dy <= d / 2 - 0.25; dy += 0.42) {
      n += 1;
      parts.push({
        dx,
        dy,
        dz: 0.36,
        w: 0.34,
        d: 0.34,
        h: n % 3 ? 0.3 : 0.5,
        color: ink.tone(pick(['#3c8a4a', '#57a85a', '#2f7a44', '#7cbf5a'], n)),
        shape: n % 3 ? 'blob' : 'cone',
        sides: 6,
        surface: 'facet',
        seed: n,
        shade: 0.25,
      });
    }
  return placed(x, y, GROUND, yaw, parts);
}

/** A living wall: a white frame filled with a grid of greenery. */
function livingWall(x: number, y: number, yaw: number, ink: Ink): Piece[] {
  const parts: Part[] = [
    { dx: 0, dy: 0, dz: 0, w: 2.2, d: 0.2, h: 1.5, color: ink.tone(WHITE), shade: 0.1 },
  ];
  let n = 0;
  for (let dx = -0.9; dx <= 0.9; dx += 0.3)
    for (let dz = 0.15; dz <= 1.25; dz += 0.28) {
      n += 1;
      parts.push({
        dx,
        dy: 0.12,
        dz,
        w: 0.3,
        d: 0.12,
        h: 0.28,
        color: ink.tone(pick(['#3c8a4a', '#57a85a', '#2f7a44', '#6fb85a', '#a46fd8'], n * 7)),
        shape: 'blob',
        surface: 'facet',
        seed: n * 5,
      });
    }
  return placed(x, y, GROUND, yaw, parts);
}

/** The greenhouse: a faceted glass dome half out of the ground, with a white ring. */
function dome(x: number, y: number, size: number, ink: Ink): Piece[] {
  return [
    {
      x,
      y,
      z: GROUND,
      w: size + 0.4,
      d: size + 0.4,
      h: 0.16,
      color: ink.tone(WHITE),
      shape: 'drum',
      sides: 16,
    },
    {
      x,
      y,
      z: GROUND - size * 0.5 + 0.12,
      w: size,
      d: size,
      h: size,
      color: ink.lit ? '#2f6f7c' : ink.tone('#bfe6ee'),
      shape: 'ball',
      surface: ink.lit ? 'glow' : 'facet',
    },
  ];
}

/** A solar canopy: four posts and a tilted dark panel with its white frame. */
function solarCanopy(x: number, y: number, yaw: number, ink: Ink): Piece[] {
  return placed(x, y, GROUND, yaw, [
    ...[-1, 1].flatMap((sx) =>
      [-1, 1].map((sy): Part => ({
        dx: sx * 1.4,
        dy: sy * 0.8,
        dz: 0,
        w: 0.1,
        d: 0.1,
        h: sy > 0 ? 1.6 : 1.9,
        color: ink.tone(STEEL),
      })),
    ),
    { dx: 0, dy: 0, dz: 1.72, w: 3.3, d: 2.1, h: 0.06, color: ink.tone(WHITE), tilt: 0.14 },
    {
      dx: 0,
      dy: 0,
      dz: 1.76,
      w: 3.1,
      d: 1.9,
      h: 0.04,
      color: ink.tone('#1f3a6a'),
      surface: 'gloss',
      tilt: 0.14,
    },
    { dx: 1.2, dy: -0.9, dz: 0, w: 0.25, d: 0.15, h: 0.9, color: ink.tone(WHITE) },
    {
      dx: 1.2,
      dy: -0.82,
      dz: 0.55,
      w: 0.12,
      d: 0.02,
      h: 0.18,
      color: ink.lit ? CYAN : ink.tone('#6fd0e0'),
      surface: ink.lit ? 'glow' : 'gloss',
    },
  ]);
}

/** A small wind turbine: a white mast, the nacelle and three blades. */
function turbine(x: number, y: number, yaw: number, ink: Ink): Piece[] {
  const white = ink.tone(WHITE);
  const hub = 3.6;
  return placed(x, y, GROUND, yaw, [
    {
      dx: 0,
      dy: 0,
      dz: 0,
      w: 0.4,
      d: 0.4,
      h: 0.12,
      color: ink.tone(SLATE),
      shape: 'drum',
      sides: 8,
    },
    { dx: 0, dy: 0, dz: 0, w: 0.12, d: 0.12, h: hub, color: white, shape: 'drum', sides: 8 },
    { dx: 0, dy: 0.05, dz: hub - 0.1, w: 0.2, d: 0.45, h: 0.2, color: white, shape: 'soft' },
    ...[0, 1, 2].map((k): Part => ({
      dx: 0,
      dy: 0.3,
      dz: hub,
      w: 0.06,
      d: 0.12,
      h: 1.3,
      color: white,
      tilt: (k * Math.PI * 2) / 3 + 0.4,
      yaw: 0,
    })),
    {
      dx: 0,
      dy: 0.3,
      dz: hub - 0.04,
      w: 0.08,
      d: 0.08,
      h: 0.08,
      color: ink.lit ? '#ff5a7a' : white,
      shape: 'dot',
      surface: ink.lit ? 'glow' : 'matte',
    },
  ]);
}

export function gardenPlan(layout: Layout): GardenPlan {
  const { width: w, height: h } = layout;
  const random = seeded(`tech-garden-${w}x${h}`);
  const planner = townPlanner(layout);
  const entrance = entranceOf(layout);
  const ex = entrance ? entrance.x + 0.5 : w * 0.3;
  const lights: Point[] = [];
  const flat = (x0: number, y0: number, x1: number, y1: number, color: string, height = 0.04) =>
    planner.add({ kind: 'strip', x0, y0, x1, y1, color, height, lift: 0 }, true);
  /** A slate path from (x0, y0) to (x1, y1) with a line of light on each edge. */
  const path = (x0: number, y0: number, x1: number, y1: number, glow = CYAN) => {
    flat(x0, y0, x1, y1, SLATE);
    const alongX = x1 - x0 > y1 - y0;
    planner.add(
      {
        kind: 'pieces',
        pieces: (ink) =>
          alongX
            ? [
                lightLine(x0, y0 + 0.04, x1, y0 + 0.08, glow, ink),
                lightLine(x0, y1 - 0.08, x1, y1 - 0.04, glow, ink),
              ]
            : [
                lightLine(x0 + 0.04, y0, x0 + 0.08, y1, glow, ink),
                lightLine(x1 - 0.08, y0, x1 - 0.04, y1, glow, ink),
              ],
      },
      true,
    );
  };

  // Mowing stripes across the lawn, a lighter green every other band.
  // At night the lawn under them is dark, so the bands go dark too.
  planner.add(
    {
      kind: 'pieces',
      pieces: (ink) => {
        const bands: Piece[] = [];
        for (let y = -FAR; y < h + FAR; y += 3)
          bands.push({
            x: w / 2,
            y: y + 0.75,
            z: GROUND - 0.02,
            w: w + FAR * 2,
            d: 1.5,
            h: 0.015,
            color: ink.night ? '#41755a' : '#6cc566',
            shade: 0,
          });
        return bands;
      },
    },
    true,
  );

  // The ring of paths round the office, and paths out from it every few tiles.
  const ring = 2.6;
  path(-ring - 1, -ring - 1, w + ring + 1, -ring);
  path(-ring - 1, h + ring, w + ring + 1, h + ring + 1);
  path(-ring - 1, -ring, -ring, h + ring);
  path(w + ring, -ring, w + ring + 1, h + ring);
  for (let x = -ring - 9; x > -FAR; x -= 9) path(x, -FAR, x + 1, FAR + h);
  for (let x = w + ring + 9; x < w + FAR; x += 9) path(x, -FAR, x + 1, FAR + h);
  for (let y = -ring - 9; y > -FAR; y -= 9) path(-FAR, y, w + FAR, y + 1);
  for (let y = h + ring + 9; y < h + FAR; y += 9) path(-FAR, y, w + FAR, y + 1);
  // The axis from the steps to the reflecting pool, between pylons of light.
  const pool = { x: ex, y: h + 8.6, w: 3.6, d: 3.2 };
  path(ex - 0.7, h + 2.45, ex + 0.7, pool.y - pool.d / 2 - 0.4, PURPLE);
  flat(
    pool.x - pool.w / 2 - 0.35,
    pool.y - pool.d / 2 - 0.35,
    pool.x + pool.w / 2 + 0.35,
    pool.y + pool.d / 2 + 0.35,
    WHITE,
    0.1,
  );
  flat(
    pool.x - pool.w / 2,
    pool.y - pool.d / 2,
    pool.x + pool.w / 2,
    pool.y + pool.d / 2,
    '#24384f',
    0.11,
  );
  for (let y = h + ring + 1.6; y < pool.y - pool.d / 2 - 0.6; y += 1.5)
    for (const side of [-1, 1])
      planner.add({ kind: 'pieces', pieces: (ink) => pylon(ex + side * 1.1, y, 0, ink) });

  // Trees of light at the corners of the ring and along the outer paths.
  let n = 0;
  const tree = (x: number, y: number) => {
    n += 1;
    // The seed is fixed now: the pieces are built again at every hour.
    const seed = n;
    if (planner.add({ kind: 'pieces', pieces: (ink) => lightTree(x, y, seed, ink) }))
      lights.push({ x, y });
  };
  for (const [x, y] of [
    [-ring - 2.2, -ring - 2.2],
    [w + ring + 2.2, -ring - 2.2],
    [-ring - 2.2, h + ring + 2.2],
    [w + ring + 2.2, h + ring + 2.2],
  ] as const)
    tree(x, y);
  for (let x = -ring - 5; x < w + ring + 6; x += 6) {
    tree(x, -ring - 4.5);
    tree(x + 3, h + ring + 4.5);
  }
  for (let y = -ring + 1; y < h + ring; y += 6) {
    tree(-ring - 4.5, y);
    tree(w + ring + 4.5, y + 3);
  }

  // Planters and living walls inside the ring and in the squares beyond it.
  for (let x = -ring - 8; x < w + ring + 8; x += 4.5)
    for (let y = -ring - 8; y < h + ring + 8; y += 4.5) {
      if (random() < 0.22) continue;
      const kind = random();
      if (kind < 0.55) {
        const size = 2 + Math.round(random() * 2) * 0.42;
        const seed = n++;
        planner.add({ kind: 'pieces', pieces: (ink) => planter(x, y, size, 0.9, 0, seed, ink) });
      } else if (kind < 0.7)
        planner.add({ kind: 'pieces', pieces: (ink) => livingWall(x, y, 0, ink) });
      else if (kind < 0.85) planner.add({ kind: 'grass', x, y, seed: n++ });
      else planner.add({ kind: 'topiary', x, y, size: 0.6, seed: n++ });
    }

  // The greenhouse dome, the solar canopies with cars charging, the turbines.
  planner.add({ kind: 'pieces', pieces: (ink) => dome(w + 10, -6, 4.2, ink) });
  planner.add({ kind: 'pieces', pieces: (ink) => dome(-9, h * 0.4, 3.2, ink) });
  for (let k = 0; k < 3; k += 1) {
    const x = w + ring + 6.5;
    const y = h * 0.35 + k * 3.2;
    if (planner.add({ kind: 'pieces', pieces: (ink) => solarCanopy(x, y, Math.PI / 2, ink) }))
      planner.add({
        kind: 'car',
        x: x - 0.1,
        y,
        yaw: Math.PI / 2,
        color: pick(CAR_COLORS, k * 3 + 1),
      });
  }
  for (const [x, y] of [
    [-ring - 7, -ring - 7],
    [w * 0.5, -ring - 9],
    [w + ring + 9, h + ring + 6],
  ] as const)
    planner.add({ kind: 'pieces', pieces: (ink) => turbine(x, y, 0.6, ink) });

  // Bollards along the ring, benches facing the pool.
  for (let x = -ring; x < w + ring; x += 3.2) {
    if (planner.add({ kind: 'bollard', x, y: h + ring + 1.4 }))
      lights.push({ x, y: h + ring + 1.4 });
  }
  for (const side of [-1, 1])
    planner.add({
      kind: 'bench',
      spot: {
        x: pool.x + side * (pool.w / 2 + 1.2),
        y: pool.y,
        yaw: side > 0 ? -Math.PI / 2 : Math.PI / 2,
      },
    });

  return { things: planner.things, pool, lights };
}
