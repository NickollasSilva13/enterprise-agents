import { entranceOf, type OfficeLayout } from '@ea/shared';
import { GROUND, seeded } from '../../approach';
import { type Ink, LAMP_LIT, pick, type Point } from '../kit';
import { type Part, type Piece, placed } from '../pieces';
import { type Thing, townPlanner } from '../town';

// The tropical island around the office (Phase 36), as plain data in tiles:
// the coast of the island (sand, then a sandy shelf under clear water, then
// the deep), coconut palms along the beach and inland, flowering bushes, a
// boardwalk from the steps to a pier with two bungalows over the water and a
// moored boat, a beach bar, loungers and parasols, rocks at the shore and
// torches that burn at night. The same layout always gets the same island.

type Layout = Pick<OfficeLayout, 'width' | 'height' | 'items'>;

export interface IslandShape {
  readonly width: number;
  readonly height: number;
  /** Tiles of island around the platform, on average. */
  readonly radius: number;
  readonly phase: number;
}

export interface IslandPlan {
  readonly shape: IslandShape;
  readonly things: readonly Thing[];
  /** The sea level. */
  readonly level: number;
  /** Where the torches burn at night. */
  readonly torches: readonly Point[];
}

/** The sea level: the beach meets it at the coast. */
export const SEA = GROUND - 0.12;

/** The colour of the dry sand. */
export const SAND = '#ead9a6';
const BOARD = '#b08458';
const BOARD_DARK = '#8a6644';
const THATCH = '#c9a86a';
const FLOWERS = ['#ff5f7e', '#ffb84d', '#f45bd0', '#ffffff'] as const;

/** How far a point is outside the platform (0 on it). */
function away(shape: IslandShape, x: number, y: number): number {
  const dx = Math.max(0, -x, x - shape.width);
  const dy = Math.max(0, -y, y - shape.height);
  return Math.hypot(dx, dy);
}

/** Signed distance to the coast: below 0 on the island, above 0 out at sea. */
export function coastDistance(shape: IslandShape, x: number, y: number): number {
  const angle = Math.atan2(y - shape.height / 2, x - shape.width / 2);
  const reach =
    shape.radius +
    1.8 * Math.sin(angle * 3 + shape.phase) +
    1.1 * Math.sin(angle * 5 + shape.phase * 2.3);
  return away(shape, x, y) - reach;
}

/** The height of the ground: flat sand inland, a gentle beach, then down under the sea. */
export function islandHeight(shape: IslandShape, x: number, y: number): number {
  const coast = coastDistance(shape, x, y);
  if (coast < -1.6) return GROUND;
  if (coast < 0) return GROUND + (SEA - GROUND) * ((coast + 1.6) / 1.6);
  return SEA - Math.min(1.5, coast * 0.18 + coast * coast * 0.02);
}

/** A torch on a bamboo pole that burns at night. */
function torch(x: number, y: number, ink: Ink): Piece[] {
  return [
    {
      x,
      y,
      z: GROUND,
      w: 0.07,
      d: 0.07,
      h: 1.2,
      color: ink.tone('#a88a52'),
      shape: 'drum',
      sides: 6,
    },
    {
      x,
      y,
      z: GROUND + 1.2,
      w: 0.16,
      d: 0.16,
      h: 0.14,
      color: ink.tone('#5b4636'),
      shape: 'drum',
      sides: 6,
    },
    {
      x,
      y,
      z: GROUND + 1.32,
      w: 0.14,
      d: 0.14,
      h: 0.2,
      color: ink.lit ? '#ffb347' : ink.tone('#4a3a2a'),
      shape: 'cone',
      sides: 6,
      surface: ink.lit ? 'glow' : 'matte',
    },
  ];
}

/** A bungalow over the water: a deck on stilts, walls, a window, a thatched roof. */
function bungalow(x: number, y: number, yaw: number, seed: number, ink: Ink): Piece[] {
  const lit = ink.lit;
  const deck = SEA + 0.35;
  const parts: Part[] = [
    ...[-1, 1].flatMap((sx) =>
      [-1, 1].map((sy): Part => ({
        dx: sx * 1.0,
        dy: sy * 0.9,
        dz: SEA - 0.8,
        w: 0.12,
        d: 0.12,
        h: deck - SEA + 0.8,
        color: ink.tone(BOARD_DARK),
        shape: 'drum',
        sides: 6,
      })),
    ),
    { dx: 0, dy: 0, dz: deck, w: 2.4, d: 2.2, h: 0.1, color: ink.tone(BOARD) },
    {
      dx: 0,
      dy: -0.15,
      dz: deck + 0.1,
      w: 1.7,
      d: 1.5,
      h: 0.95,
      color: ink.tone('#f2e6cf'),
      shade: 0.12,
    },
    {
      dx: 0,
      dy: 0.62,
      dz: deck + 0.35,
      w: 0.9,
      d: 0.05,
      h: 0.5,
      color: lit ? '#ffd27a' : ink.tone('#6f8fb0'),
      surface: lit ? 'glow' : 'gloss',
    },
    {
      dx: 0,
      dy: -0.15,
      dz: deck + 1.05,
      w: 2.9,
      d: 2.7,
      h: 1.0,
      color: ink.tone(THATCH),
      shape: 'cone',
      sides: 4,
      yaw: Math.PI / 4,
      surface: 'facet',
      shade: 0.25,
    },
  ];
  return placed(x, y, 0, yaw + (seed % 2) * 0.05, parts);
}

/** A small motorboat, moored. */
function boat(x: number, y: number, yaw: number, ink: Ink): Piece[] {
  return placed(x, y, SEA - 0.1, yaw, [
    {
      dx: 0,
      dy: 0,
      dz: 0,
      w: 0.75,
      d: 1.9,
      h: 0.3,
      color: ink.tone('#f4f2ec'),
      shape: 'soft',
      surface: 'gloss',
    },
    {
      dx: 0,
      dy: 0.95,
      dz: 0.02,
      w: 0.5,
      d: 0.4,
      h: 0.26,
      color: ink.tone('#f4f2ec'),
      shape: 'cone',
      sides: 4,
      yaw: Math.PI / 4,
      tilt: Math.PI / 2,
    },
    { dx: 0, dy: 0, dz: 0.22, w: 0.77, d: 1.92, h: 0.06, color: ink.tone('#2f6fb8') },
    {
      dx: 0,
      dy: -0.2,
      dz: 0.3,
      w: 0.5,
      d: 0.5,
      h: 0.25,
      color: ink.tone('#d9e6f2'),
      shape: 'soft',
    },
  ]);
}

/** A beach bar: a counter, stools and a thatched roof on posts. */
function bar(x: number, y: number, yaw: number, ink: Ink): Piece[] {
  const parts: Part[] = [
    { dx: 0, dy: 0, dz: 0, w: 2.0, d: 0.6, h: 0.75, color: ink.tone(BOARD), shade: 0.2 },
    { dx: 0, dy: 0, dz: 0.75, w: 2.2, d: 0.75, h: 0.06, color: ink.tone(BOARD_DARK) },
    ...[-1, 1].flatMap((sx) =>
      [-1, 1].map((sy): Part => ({
        dx: sx * 1.05,
        dy: sy * 0.6,
        dz: 0,
        w: 0.1,
        d: 0.1,
        h: 1.7,
        color: ink.tone(BOARD_DARK),
      })),
    ),
    {
      dx: 0,
      dy: 0,
      dz: 1.65,
      w: 3.4,
      d: 2.4,
      h: 0.8,
      color: ink.tone(THATCH),
      shape: 'cone',
      sides: 4,
      yaw: Math.PI / 4,
      surface: 'facet',
      shade: 0.25,
    },
    ...[-0.7, 0, 0.7].flatMap((dx): Part[] => [
      { dx, dy: 0.75, dz: 0, w: 0.06, d: 0.06, h: 0.5, color: ink.tone(BOARD_DARK) },
      {
        dx,
        dy: 0.75,
        dz: 0.5,
        w: 0.3,
        d: 0.3,
        h: 0.06,
        color: ink.tone('#e2574c'),
        shape: 'drum',
        sides: 10,
      },
    ]),
    {
      dx: 0,
      dy: 0,
      dz: 1.5,
      w: 1.6,
      d: 0.05,
      h: 0.05,
      color: ink.lit ? LAMP_LIT : ink.tone('#d9d2bf'),
      surface: ink.lit ? 'glow' : 'matte',
    },
  ];
  return placed(x, y, GROUND, yaw, parts);
}

export function islandPlan(layout: Layout): IslandPlan {
  const { width: w, height: h } = layout;
  const random = seeded(`island-${w}x${h}`);
  const shape: IslandShape = { width: w, height: h, radius: 8.5, phase: 1.1 };
  const planner = townPlanner(layout);
  const entrance = entranceOf(layout);
  const ex = entrance ? entrance.x + 0.5 : w * 0.3;
  const onSand = (x: number, y: number, margin = 0.4) => coastDistance(shape, x, y) < -margin;
  const torches: Point[] = [];

  // A boardwalk from the steps down the beach to the pier, then the pier.
  let coastY = h + 2.6;
  while (coastDistance(shape, ex, coastY) < 0 && coastY < h + 30) coastY += 0.2;
  const boards = (fromY: number, toY: number, z: number) =>
    planner.add(
      {
        kind: 'pieces',
        pieces: (ink) => {
          const pieces: Piece[] = [];
          for (let y = fromY; y < toY; y += 0.26)
            pieces.push({
              x: ex,
              y,
              z,
              w: 1.2,
              d: 0.22,
              h: 0.06,
              color: ink.tone(Math.round(y * 4) % 3 ? BOARD : BOARD_DARK),
            });
          return pieces;
        },
      },
      true,
    );
  boards(h + 2.5, coastY - 0.4, GROUND - 0.02);
  const pierEnd = coastY + 6.5;
  boards(coastY - 0.4, pierEnd, SEA + 0.3);
  planner.add(
    {
      kind: 'pieces',
      pieces: (ink) => {
        const posts: Piece[] = [];
        for (let y = coastY; y <= pierEnd; y += 1.6)
          for (const sx of [-0.55, 0.55])
            posts.push({
              x: ex + sx,
              y,
              z: SEA - 0.8,
              w: 0.12,
              d: 0.12,
              h: 1.3,
              color: ink.tone(BOARD_DARK),
              shape: 'drum',
              sides: 6,
            });
        return posts;
      },
    },
    true,
  );
  // Two bungalows at the end of the pier, a walkway to each, the boat between them.
  for (const side of [-1, 1]) {
    const bx = ex + side * 3.4;
    const by = pierEnd - 0.6;
    planner.add({
      kind: 'pieces',
      pieces: (ink) => bungalow(bx, by, side > 0 ? -Math.PI / 2 : Math.PI / 2, side + 2, ink),
    });
    planner.add(
      {
        kind: 'pieces',
        pieces: (ink) => {
          const pieces: Piece[] = [];
          for (let k = 0.7; k < 2.3; k += 0.26)
            pieces.push({
              x: ex + side * k,
              y: by,
              z: SEA + 0.3,
              w: 0.22,
              d: 0.9,
              h: 0.06,
              color: ink.tone(BOARD),
            });
          return pieces;
        },
      },
      true,
    );
  }
  planner.add({ kind: 'pieces', pieces: (ink) => boat(ex + 1.4, coastY + 2.6, 0.15, ink) }, true);
  for (const y of [coastY - 1.6, coastY + 3, pierEnd])
    for (const sx of [-0.75, 0.75])
      if (planner.add({ kind: 'pieces', pieces: (ink) => torch(ex + sx, y, ink) }, y > coastY))
        torches.push({ x: ex + sx, y });

  // Palms all along the beach, leaning to the sea, and some inland.
  const center = { x: w / 2, y: h / 2 };
  for (let k = 0; k < 140; k += 1) {
    const angle = (k / 140) * Math.PI * 2 + random() * 0.03;
    // Walk out from the platform's edge along the angle to the beach.
    let x = center.x;
    let y = center.y;
    const step = { x: Math.cos(angle) * 0.25, y: Math.sin(angle) * 0.25 };
    let guard = 0;
    while (coastDistance(shape, x, y) < -(1.2 + random() * 1.6) && guard < 400) {
      x += step.x;
      y += step.y;
      guard += 1;
    }
    if (Math.abs(x - ex) < 1.6 && y > h) continue;
    // A torch now and then along the beach, a little inland of the palms.
    if (k % 9 === 4) {
      const tx = x - step.x * 3;
      const ty = y - step.y * 3;
      if (planner.add({ kind: 'pieces', pieces: (ink) => torch(tx, ty, ink) }))
        torches.push({ x: tx, y: ty });
    }
    if (random() < 0.45)
      planner.add({
        kind: 'tree',
        tree: {
          kind: 'palm',
          x,
          y,
          size: 0.85 + random() * 0.35,
          seed: Math.floor(random() * 10_000),
        },
      });
  }
  for (let k = 0; k < 90; k += 1) {
    const x = -14 + random() * (w + 28);
    const y = -14 + random() * (h + 28);
    if (!onSand(x, y, 3.5)) continue;
    if (random() < 0.5)
      planner.add({
        kind: 'tree',
        tree: {
          kind: 'palm',
          x,
          y,
          size: 0.9 + random() * 0.3,
          seed: Math.floor(random() * 10_000),
        },
      });
    else
      planner.add({
        kind: 'pieces',
        pieces: (ink) => {
          const size = 0.6 + (((x * 7 + y * 3) % 1) + 1) * 0.15;
          const pieces: Piece[] = [
            {
              x,
              y,
              z: GROUND - 0.05,
              w: size * 1.3,
              d: size * 1.2,
              h: size * 0.8,
              color: ink.tone(pick(['#2f8a46', '#3a9a4c', '#257a3e'], Math.round(x + y))),
              shape: 'blob',
              surface: 'facet',
              seed: Math.round(x * 31 + y * 17),
              shade: 0.3,
            },
          ];
          for (let n = 0; n < 5; n += 1) {
            const a = n * 1.3 + x;
            pieces.push({
              x: x + Math.cos(a) * size * 0.45,
              y: y + Math.sin(a) * size * 0.4,
              z: GROUND + size * (0.35 + (n % 3) * 0.12),
              w: 0.12,
              d: 0.12,
              h: 0.1,
              color: ink.tone(pick(FLOWERS, Math.round(x * 3 + y))),
              shape: 'dot',
            });
          }
          return pieces;
        },
      });
  }

  // The beach in front: loungers and parasols facing the sea, the bar behind them.
  for (let k = -3; k <= 3; k += 1) {
    if (k === 0) continue;
    const x = ex + k * 1.5;
    let y = h + 3;
    while (coastDistance(shape, x, y) < -1.5 && y < h + 20) y += 0.2;
    if (!onSand(x, y - 0.4, 0.8)) continue;
    planner.add({ kind: 'lounger', spot: { x, y: y - 0.6, yaw: 0 } });
    if (k % 2 === 0)
      planner.add({
        kind: 'parasol',
        x: x + 0.75,
        y: y - 0.5,
        color: k > 0 ? '#e9d7a8' : '#f26b5b',
      });
  }
  const barX = ex - 6.5;
  if (onSand(barX, h + 4.2, 1.5))
    planner.add({ kind: 'pieces', pieces: (ink) => bar(barX, h + 4.2, 0, ink) });

  // Rocks where the sand meets the sea.
  planner.add(
    {
      kind: 'pieces',
      pieces: (ink) => {
        const rocks: Piece[] = [];
        for (let k = 0; k < 60; k += 1) {
          const angle = (k / 60) * Math.PI * 2 + 0.37;
          let x = center.x;
          let y = center.y;
          let guard = 0;
          while (coastDistance(shape, x, y) < 0.3 && guard < 500) {
            x += Math.cos(angle) * 0.25;
            y += Math.sin(angle) * 0.25;
            guard += 1;
          }
          if (k % 3 !== 0 || (Math.abs(x - ex) < 2.5 && y > h)) continue;
          const size = 0.35 + (k % 5) * 0.12;
          rocks.push({
            x,
            y,
            z: SEA - size * 0.3,
            w: size * 1.3,
            d: size,
            h: size * 0.75,
            color: ink.tone(pick(['#8c8478', '#a0978a', '#7a7268'], k)),
            shape: 'blob',
            surface: 'facet',
            seed: k * 13,
            yaw: k,
            shade: 0.3,
          });
        }
        return rocks;
      },
    },
    true,
  );

  // Torches along the boardwalk on the beach.
  for (let y = h + 3.4; y < coastY - 1.8; y += 2.4)
    for (const sx of [-0.85, 0.85])
      if (planner.add({ kind: 'pieces', pieces: (ink) => torch(ex + sx, y, ink) }))
        torches.push({ x: ex + sx, y });

  return { shape, things: planner.things, level: SEA, torches };
}
