import { footprint, type OfficeItem, type OfficeLayout } from '@ea/shared';
import { colorOf, SCREEN_COLOR, type Screen } from '../art/furniture';
import { HEIGHTS } from './view';

// What the 3D office is made of, as plain data (Phases 24 and 26): the glass
// walls of each room and every piece of furniture modelled from parts (legs,
// tops, cushions, screens, keyboards, books, leaves), in tiles, sized to the
// characters. Kept apart from three.js so it is tested without a GPU.
// Original art.

type Side = OfficeItem['facing'];

export interface Block {
  /** Corner on the floor and height of the base, in tiles. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Size along x, along y and up. */
  readonly w: number;
  readonly d: number;
  readonly h: number;
  readonly color: string;
  /** `soft` is a box with rounded edges (cushions, tops); `leaf` a flat, low-poly ellipsoid. */
  readonly shape?: 'box' | 'ball' | 'drum' | 'soft' | 'leaf';
  /** Turns around its centre, in radians: about the vertical, then sideways, then forward. */
  readonly yaw?: number;
  readonly pitch?: number;
  readonly roll?: number;
  /** Gives its own light: screens, lamps, neon. */
  readonly glow?: boolean;
  /** Below 1 for glass. */
  readonly opacity?: number;
  /** A polished surface that reflects a little of the room (floors, tops). */
  readonly finish?: 'matte' | 'gloss';
  /** A part that changes with the agent's state (a screen): redrawn apart from the rest. */
  readonly live?: boolean;
}

export interface WallPiece {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly d: number;
  readonly h: number;
  /** A light post stands at this piece (every other tile). */
  readonly post: boolean;
}

const THICK = 0.06;

/**
 * The glass walls of every room: tall at the back (north and west), low at
 * the front (south and east) so nothing inside is hidden, a gap at each door;
 * and the tall glass of the building along the back edges of the floor.
 */
export function wallPieces(layout: Pick<OfficeLayout, 'areas' | 'width' | 'height'>): WallPiece[] {
  const pieces: WallPiece[] = [];
  for (const area of layout.areas) {
    const door = (side: Side, offset: number) =>
      area.doors.some((each) => each.side === side && each.offset === offset);
    const right = area.x + area.width;
    const bottom = area.y + area.height;
    for (let offset = 0; offset < area.width; offset += 1) {
      const x = area.x + offset;
      const post = (x + area.y) % 2 === 0;
      if (!door('n', offset))
        pieces.push({ x, y: area.y - THICK, w: 1, d: THICK, h: HEIGHTS.wall, post });
      if (!door('s', offset))
        pieces.push({ x, y: bottom, w: 1, d: THICK, h: HEIGHTS.lowWall, post });
    }
    for (let offset = 0; offset < area.height; offset += 1) {
      const y = area.y + offset;
      const post = (area.x + y) % 2 === 0;
      if (!door('w', offset))
        pieces.push({ x: area.x - THICK, y, w: THICK, d: 1, h: HEIGHTS.wall, post });
      if (!door('e', offset))
        pieces.push({ x: right, y, w: THICK, d: 1, h: HEIGHTS.lowWall, post });
    }
  }
  const outer = HEIGHTS.wall + 0.25;
  for (let x = 0; x < layout.width; x += 1)
    pieces.push({ x, y: -THICK * 2, w: 1, d: THICK, h: outer, post: x % 3 === 0 });
  for (let y = 0; y < layout.height; y += 1)
    pieces.push({ x: -THICK * 2, y, w: THICK, d: 1, h: outer, post: y % 3 === 0 });
  return pieces;
}

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly d: number;
}

/** The tiles an item covers, as one rectangle. */
export function rectOf(item: Pick<OfficeItem, 'kind' | 'x' | 'y' | 'facing'>): Rect {
  const tiles = footprint(item);
  const xs = tiles.map((tile) => tile.x);
  const ys = tiles.map((tile) => tile.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) + 1 - x, d: Math.max(...ys) + 1 - y };
}

/** A rectangle shrunk on every side, never below a sliver, and always inside the first. */
function inset(rect: Rect, by: number): Rect {
  const w = Math.min(rect.w, Math.max(0.05, rect.w - 2 * by));
  const d = Math.min(rect.d, Math.max(0.05, rect.d - 2 * by));
  return { x: rect.x + (rect.w - w) / 2, y: rect.y + (rect.d - d) / 2, w, d };
}

type Part = (u0: number, u1: number, v0: number, v1: number) => Rect;

/**
 * The frame of a piece seen from its front: `u` goes across, left to right,
 * and `v` from the back (0) to the front (1), both as fractions of the piece.
 * `part` turns such a rectangle into tiles whatever way the piece faces.
 */
function frameOf(rect: Rect, facing: Side): { part: Part; across: number } {
  const turned = facing === 'e' || facing === 'w';
  const across = turned ? rect.d : rect.w;
  const deep = turned ? rect.w : rect.d;
  const part: Part = (u0, u1, v0, v1) => {
    const wide = (u1 - u0) * across;
    const long = (v1 - v0) * deep;
    switch (facing) {
      case 's':
        return { x: rect.x + u0 * across, y: rect.y + v0 * deep, w: wide, d: long };
      case 'n':
        return { x: rect.x + (1 - u1) * across, y: rect.y + (1 - v1) * deep, w: wide, d: long };
      case 'e':
        return { x: rect.x + v0 * deep, y: rect.y + (1 - u1) * across, w: long, d: wide };
      case 'w':
        return { x: rect.x + (1 - v1) * deep, y: rect.y + u0 * across, w: long, d: wide };
    }
  };
  return { part, across };
}

type Extra = Partial<
  Pick<Block, 'shape' | 'glow' | 'opacity' | 'finish' | 'yaw' | 'pitch' | 'roll' | 'live'>
>;

const block = (rect: Rect, z: number, h: number, color: string, extra: Extra = {}): Block => ({
  ...rect,
  z,
  h,
  color,
  ...extra,
});

const WOOD = '#c98d5a';
const WOOD_LIGHT = '#dcae7c';
const WOOD_DARK = '#7d5639';
const METAL = '#4b4566';
const STEEL = '#a9a6bd';
const WHITE = '#ece8f6';
const INK = '#1d1934';
const POT = '#e9e4f2';
const TERRACOTTA = '#c9734f';
const SOIL = '#4a3426';
const MACHINE = '#3a3264';
const GLASS = '#a9cdf0';
const BOOKS = ['#e0675b', '#f2b13f', '#5b8de0', '#62b86f', '#a77bff', '#f07bb6', '#2fb5a5'];
const LEAVES = ['#2f7d3c', '#3f9b4a', '#4fae52', '#5cbf5a'];

const pick = (list: readonly string[], index: number) => list[index % list.length] ?? '#888888';

/** Lighter (positive) or darker (negative) of a colour, for cushions and trims. */
function shadeOf(hex: string, amount: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const channel = (shift: number) => {
    const base = (value >> shift) & 255;
    const next = amount >= 0 ? base + (255 - base) * amount : base * (1 + amount);
    return Math.round(Math.min(255, Math.max(0, next)))
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(16)}${channel(8)}${channel(0)}`;
}

/** Four legs at the corners of a rectangle of the frame; `size` is a fraction of the piece. */
function legs(
  part: Part,
  [u0, u1, v0, v1]: readonly [number, number, number, number],
  size: number,
  height: number,
  color: string,
  shape: 'box' | 'drum' = 'box',
): Block[] {
  const corners: [number, number][] = [
    [u0, v0],
    [u1 - size, v0],
    [u0, v1 - size],
    [u1 - size, v1 - size],
  ];
  return corners.map(([u, v]) =>
    block(part(u, u + size, v, v + size), 0, height, color, { shape }),
  );
}

/** A computer screen on its stand, at the back of a top whose surface is at height `z`. */
function monitor(part: Part, z: number, u0: number, u1: number, screen: Screen): Block[] {
  const middle = (u0 + u1) / 2;
  const lit = screen !== 'off';
  return [
    block(part(middle - 0.1, middle + 0.1, 0.12, 0.3), z, 0.015, METAL, { shape: 'soft' }),
    block(part(middle - 0.025, middle + 0.025, 0.16, 0.2), z, 0.13, METAL),
    block(part(u0, u1, 0.14, 0.19), z + 0.1, 0.3, INK, { shape: 'soft' }),
    block(
      part(u0 + 0.03, u1 - 0.03, 0.19, 0.2),
      z + 0.125,
      0.25,
      lit ? SCREEN_COLOR[screen] : '#262238',
      { glow: lit, live: true },
    ),
  ];
}

/** A plant's leaves: blades fanning out of the soil, in three layers, tipped up more inside. */
function leaves(
  cx: number,
  cy: number,
  z: number,
  size: number,
  count: number,
  seed: number,
): Block[] {
  const blades: Block[] = [];
  for (let index = 0; index < count; index += 1) {
    const turn = (index / count) * Math.PI * 2 + seed;
    const layer = index % 3;
    const reach = size * (0.16 + layer * 0.04);
    const length = size * (0.46 - layer * 0.06);
    const width = length * 0.38;
    const x = cx + Math.cos(turn) * reach;
    const y = cy + Math.sin(turn) * reach;
    blades.push({
      x: x - width / 2,
      y: y - length / 2,
      z: z + layer * size * 0.16,
      w: width,
      d: length,
      h: size * 0.05,
      color: pick(LEAVES, layer + index),
      shape: 'leaf',
      // Pointing outward, tipped up more on the inner layers.
      yaw: Math.PI / 2 - turn,
      pitch: 0.5 + layer * 0.3,
    });
  }
  return blades;
}

/** An office chair whose sitter faces `facing`: five-arm base, column, cushioned seat and back, arms. */
export function chairBlocks(x: number, y: number, facing: Side, color = '#3d3757'): Block[] {
  const { part } = frameOf({ x, y, w: 1, d: 1 }, facing);
  const seat = HEIGHTS.seat - 0.06;
  return [
    block(part(0.2, 0.8, 0.47, 0.53), 0.03, 0.025, METAL),
    block(part(0.47, 0.53, 0.2, 0.8), 0.03, 0.025, METAL),
    ...(
      [
        [0.2, 0.47],
        [0.74, 0.47],
        [0.47, 0.2],
        [0.47, 0.74],
      ] as const
    ).map(([u, v]) => block(part(u, u + 0.06, v, v + 0.06), 0, 0.035, INK, { shape: 'ball' })),
    block(part(0.46, 0.54, 0.46, 0.54), 0.05, seat - 0.05, STEEL, { shape: 'drum' }),
    block(part(0.22, 0.78, 0.26, 0.78), seat, 0.07, color, { shape: 'soft' }),
    block(part(0.25, 0.75, 0.14, 0.24), seat + 0.05, 0.42, color, { shape: 'soft' }),
    block(part(0.18, 0.24, 0.35, 0.7), seat + 0.14, 0.03, METAL),
    block(part(0.76, 0.82, 0.35, 0.7), seat + 0.14, 0.03, METAL),
  ];
}

/** A sofa or an armchair: base, cushions, back, arms, little legs and a pillow per seat. */
function upholstered(rect: Rect, facing: Side, color: string, cushions: number): Block[] {
  const { part, across } = frameOf(rect, facing);
  const arm = 0.12 / across;
  const trim = shadeOf(color, -0.2);
  const blocks: Block[] = [
    ...legs(part, [0.05, 0.95, 0.12, 0.92], 0.05 / across, 0.05, WOOD_DARK, 'drum'),
    block(part(0.02, 0.98, 0.1, 0.94), 0.05, 0.16, trim, { shape: 'soft' }),
    block(part(0.03, 0.97, 0.08, 0.34), 0.18, 0.36, color, { shape: 'soft' }),
    block(part(0, arm, 0.1, 0.94), 0.05, 0.31, color, { shape: 'soft' }),
    block(part(1 - arm, 1, 0.1, 0.94), 0.05, 0.31, color, { shape: 'soft' }),
  ];
  const inner = 1 - 2 * arm;
  for (let index = 0; index < cushions; index += 1) {
    const u0 = arm + (inner * index) / cushions + 0.01;
    const u1 = arm + (inner * (index + 1)) / cushions - 0.01;
    blocks.push(
      block(part(u0, u1, 0.32, 0.92), 0.21, 0.1, shadeOf(color, 0.08), { shape: 'soft' }),
    );
    const pillow = Math.min(u1, u0 + 0.24 / across);
    blocks.push(
      block(part(u0 + 0.04 / across, pillow, 0.3, 0.42), 0.3, 0.17, shadeOf(color, 0.3), {
        shape: 'soft',
      }),
    );
  }
  return blocks;
}

/** A shelf of books standing side by side from `u` to 0.9, now and then a small pot. */
function shelfOfBooks(part: Part, z: number, start: number): Block[] {
  const blocks: Block[] = [];
  let u = 0.1;
  let index = start;
  while (u < 0.84) {
    if (index % 7 === 3) {
      blocks.push(block(part(u, u + 0.1, 0.18, 0.36), z, 0.08, TERRACOTTA, { shape: 'drum' }));
      blocks.push(
        block(part(u, u + 0.1, 0.18, 0.36), z + 0.08, 0.09, pick(LEAVES, 1), { shape: 'ball' }),
      );
      u += 0.14;
    } else {
      const width = 0.05 + ((index * 7) % 4) * 0.012;
      const tall = 0.17 + ((index * 5) % 3) * 0.035;
      blocks.push(
        block(part(u, Math.min(0.9, u + width), 0.12, 0.46), z, tall, pick(BOOKS, index)),
      );
      u += width + 0.008;
    }
    index += 1;
  }
  return blocks;
}

/** The volumes of a piece of furniture, modelled from its parts. */
export function itemBlocks(item: OfficeItem, screen: Screen = 'off'): Block[] {
  const rect = rectOf(item);
  const { part, across } = frameOf(rect, item.facing);
  const color = colorOf(item);
  const odd = (item.x + item.y) % 2 === 1;
  switch (item.kind) {
    case 'desk': {
      // The person sits at the front (`facing`); the screen is at the back.
      const top = 0.44;
      const surface = top + 0.035;
      return [
        ...legs(part, [0.05, 0.95, 0.08, 0.92], 0.04, top, METAL),
        block(part(0.08, 0.92, 0.1, 0.14), 0.16, top - 0.18, WOOD_DARK),
        block(part(0.03, 0.97, 0.05, 0.95), top, 0.035, WOOD, { finish: 'gloss', shape: 'soft' }),
        ...monitor(part, surface, 0.2, 0.8, screen),
        block(part(0.28, 0.68, 0.55, 0.68), surface, 0.015, '#3a3555', { shape: 'soft' }),
        block(part(0.3, 0.66, 0.57, 0.66), surface + 0.015, 0.006, '#5b5578'),
        block(part(0.74, 0.8, 0.57, 0.66), surface, 0.02, '#e8e4f4', { shape: 'soft' }),
        block(part(0.06, 0.22, 0.32, 0.5), surface, 0.008, '#fbfaff'),
        block(part(0.72, 0.9, 0.18, 0.5), 0, 0.34, '#2b2840', { shape: 'soft' }),
        block(part(0.72, 0.9, 0.5, 0.51), 0.26, 0.03, '#7ce0ff', {
          glow: screen !== 'off',
          live: true,
        }),
      ];
    }
    case 'meeting_table': {
      const top = 0.44;
      const surface = top + 0.05;
      const unit = 1 / across;
      return [
        block(part(0.2, 0.26, 0.4, 0.6), 0, top, METAL),
        block(part(0.74, 0.8, 0.4, 0.6), 0, top, METAL),
        block(part(0.15, 0.31, 0.3, 0.7), 0, 0.03, METAL),
        block(part(0.69, 0.85, 0.3, 0.7), 0, 0.03, METAL),
        block(part(0.02, 0.98, 0.1, 0.9), top, 0.05, WOOD, { shape: 'soft', finish: 'gloss' }),
        // A laptop at each end, papers and a water jug in the middle.
        block(part(0.08, 0.08 + 0.3 * unit, 0.5, 0.75), surface, 0.012, STEEL),
        block(part(0.08, 0.08 + 0.3 * unit, 0.46, 0.5), surface, 0.18, INK),
        block(part(0.92 - 0.3 * unit, 0.92, 0.5, 0.75), surface, 0.012, STEEL),
        block(part(0.92 - 0.3 * unit, 0.92, 0.46, 0.5), surface, 0.18, INK),
        block(part(0.44, 0.56, 0.35, 0.6), surface, 0.006, '#fbfaff'),
        block(part(0.47, 0.47 + 0.08 * unit, 0.22, 0.32), surface, 0.12, '#bfe8ff', {
          shape: 'drum',
          opacity: 0.7,
        }),
      ];
    }
    case 'coffee_table':
      return [
        ...legs(part, [0.14, 0.86, 0.2, 0.8], 0.05, 0.2, WOOD_DARK, 'drum'),
        block(part(0.1, 0.9, 0.15, 0.85), 0.2, 0.04, WOOD, { shape: 'soft', finish: 'gloss' }),
        block(part(0.2, 0.42, 0.3, 0.6), 0.24, 0.015, '#e0675b'),
        block(part(0.58, 0.68, 0.4, 0.5), 0.24, 0.08, '#f4f1ff', { shape: 'drum' }),
        block(part(0.6, 0.75, 0.6, 0.75), 0.24, 0.05, '#62b86f', { shape: 'ball' }),
      ];
    case 'chair':
      return chairBlocks(rect.x, rect.y, item.facing, color);
    case 'bar_stool':
      return [
        block(part(0.3, 0.7, 0.3, 0.7), 0, 0.02, METAL, { shape: 'drum' }),
        block(part(0.46, 0.54, 0.46, 0.54), 0.02, 0.42, STEEL, { shape: 'drum' }),
        block(part(0.34, 0.66, 0.34, 0.66), 0.16, 0.015, STEEL, { shape: 'drum' }),
        block(part(0.28, 0.72, 0.28, 0.72), 0.44, 0.07, color, { shape: 'drum' }),
      ];
    case 'sofa':
      return upholstered(rect, item.facing, color, 2);
    case 'armchair':
      return upholstered(rect, item.facing, color, 1);
    case 'bean_bag':
      return [
        block(part(0.1, 0.9, 0.12, 0.92), 0, 0.3, color, { shape: 'ball' }),
        block(part(0.2, 0.75, 0.15, 0.55), 0.14, 0.3, shadeOf(color, 0.1), { shape: 'ball' }),
        // The dip where someone sat.
        block(part(0.3, 0.7, 0.45, 0.8), 0.2, 0.08, shadeOf(color, -0.12), { shape: 'ball' }),
      ];
    case 'bookshelf': {
      // The back against the wall, shelves of books facing out.
      const height = 1.2;
      const shelves = [0, 0.3, 0.6, 0.9, height - 0.04];
      return [
        block(part(0.04, 0.96, 0.02, 0.08), 0, height, WOOD_DARK),
        block(part(0.04, 0.09, 0.02, 0.5), 0, height, WOOD_DARK),
        block(part(0.91, 0.96, 0.02, 0.5), 0, height, WOOD_DARK),
        ...shelves.map((z) => block(part(0.04, 0.96, 0.02, 0.5), z, 0.04, WOOD)),
        ...shelves
          .slice(0, 4)
          .flatMap((z, row) => shelfOfBooks(part, z + 0.04, row * 3 + (odd ? 1 : 0))),
      ];
    }
    case 'counter': {
      const top = 0.48;
      const surface = top + 0.05;
      return [
        block(part(0.02, 0.98, 0.08, 0.96), 0, 0.04, shadeOf(color, -0.4)),
        block(part(0.02, 0.98, 0.06, 0.94), 0.04, top - 0.04, color, { shape: 'soft' }),
        block(part(0.08, 0.92, 0.94, 0.95), 0.12, 0.3, shadeOf(color, -0.08)),
        block(part(0.45, 0.55, 0.95, 0.97), 0.36, 0.02, STEEL),
        block(part(0, 1, 0.02, 1), top, 0.05, WOOD_LIGHT, { finish: 'gloss', shape: 'soft' }),
        // A laptop open toward the front, or a fruit bowl.
        ...(odd
          ? [
              block(part(0.25, 0.75, 0.35, 0.7), surface, 0.012, STEEL),
              block(part(0.25, 0.75, 0.3, 0.35), surface, 0.2, INK),
            ]
          : [
              block(part(0.3, 0.6, 0.35, 0.65), surface, 0.04, '#f4f1ff', { shape: 'drum' }),
              block(part(0.34, 0.46, 0.4, 0.52), surface + 0.03, 0.06, '#f2b13f', {
                shape: 'ball',
              }),
              block(part(0.44, 0.56, 0.45, 0.57), surface + 0.03, 0.06, '#e0675b', {
                shape: 'ball',
              }),
            ]),
      ];
    }
    case 'coffee_machine': {
      const top = 0.48;
      const surface = top + 0.05;
      return [
        block(part(0.02, 0.98, 0.06, 0.94), 0, top, WHITE, { shape: 'soft' }),
        block(part(0, 1, 0.02, 1), top, 0.05, WOOD_LIGHT, { finish: 'gloss', shape: 'soft' }),
        block(part(0.22, 0.78, 0.12, 0.6), surface, 0.36, MACHINE, { shape: 'soft' }),
        block(part(0.3, 0.7, 0.6, 0.66), surface + 0.2, 0.08, '#2b2550'),
        block(part(0.4, 0.6, 0.6, 0.72), surface, 0.08, '#f4f1ff', { shape: 'drum' }),
        block(part(0.62, 0.72, 0.6, 0.61), surface + 0.25, 0.03, '#7cffb0', { glow: true }),
      ];
    }
    case 'water_cooler':
      return [
        block(part(0.28, 0.72, 0.28, 0.72), 0, 0.55, WHITE, { shape: 'soft' }),
        block(part(0.4, 0.6, 0.72, 0.76), 0.36, 0.05, STEEL),
        block(part(0.3, 0.7, 0.3, 0.7), 0.55, 0.32, '#8fc6f2', { shape: 'drum', opacity: 0.75 }),
        block(part(0.62, 0.7, 0.74, 0.82), 0.3, 0.06, '#f4f1ff', { shape: 'drum' }),
      ];
    case 'vending_machine':
      return [
        block(part(0.06, 0.94, 0.08, 0.7), 0, 1.2, MACHINE, { shape: 'soft' }),
        block(part(0.12, 0.66, 0.7, 0.72), 0.3, 0.8, '#bfe8ff', { opacity: 0.5 }),
        block(part(0.7, 0.88, 0.7, 0.72), 0.65, 0.3, '#2b2550'),
        block(part(0.73, 0.85, 0.72, 0.73), 0.9, 0.04, '#7ce0ff', { glow: true }),
        block(part(0.12, 0.66, 0.7, 0.71), 0.12, 0.12, '#151024'),
        ...[0, 1, 2, 3].flatMap((row) =>
          [0, 1, 2, 3].map((column) =>
            block(
              part(0.15 + column * 0.12, 0.24 + column * 0.12, 0.5, 0.66),
              0.36 + row * 0.18,
              0.1,
              pick(BOOKS, row * 4 + column),
            ),
          ),
        ),
      ];
    case 'fridge':
      return [
        block(part(0.08, 0.92, 0.06, 0.7), 0, 1.15, WHITE, { shape: 'soft', finish: 'gloss' }),
        block(part(0.1, 0.9, 0.7, 0.71), 0.78, 0.01, '#c9c6d8'),
        block(part(0.78, 0.82, 0.71, 0.75), 0.86, 0.22, STEEL),
        block(part(0.78, 0.82, 0.71, 0.75), 0.35, 0.3, STEEL),
      ];
    case 'tv':
      return [
        block(part(0.04, 0.96, 0.15, 0.55), 0, 0.28, WOOD_DARK, { shape: 'soft' }),
        block(part(0.12, 0.42, 0.55, 0.56), 0.06, 0.16, '#5e3e26'),
        block(part(0.58, 0.88, 0.55, 0.56), 0.06, 0.16, '#5e3e26'),
        block(part(0.44, 0.56, 0.28, 0.4), 0.28, 0.05, METAL),
        block(part(0.06, 0.94, 0.3, 0.36), 0.33, 0.48, INK, { shape: 'soft' }),
        block(part(0.1, 0.9, 0.36, 0.37), 0.36, 0.42, '#5a7fd6', { glow: true }),
        block(part(0.6, 0.8, 0.4, 0.5), 0.28, 0.04, '#e8e4f4', { shape: 'soft' }),
      ];
    case 'wall_tv':
      return [
        block(part(0.06, 0.94, 0.02, 0.07), 0.55, 0.52, INK, { shape: 'soft' }),
        block(part(0.1, 0.9, 0.07, 0.08), 0.59, 0.44, '#24305e', { glow: true }),
        ...[0.2, 0.36, 0.52, 0.68].map((u, index) =>
          block(
            part(u, u + 0.1, 0.08, 0.09),
            0.63,
            0.08 + index * 0.06,
            index % 2 ? '#7ce0ff' : '#b98cff',
            {
              glow: true,
            },
          ),
        ),
      ];
    case 'whiteboard':
      return [
        block(part(0.12, 0.16, 0.06, 0.12), 0, 0.3, METAL),
        block(part(0.84, 0.88, 0.06, 0.12), 0, 0.3, METAL),
        block(part(0.04, 0.96, 0.02, 0.08), 0.28, 0.8, STEEL),
        block(part(0.07, 0.93, 0.08, 0.09), 0.31, 0.74, '#fbfaff'),
        block(part(0.12, 0.5, 0.09, 0.1), 0.8, 0.02, '#5b8de0'),
        block(part(0.12, 0.38, 0.09, 0.1), 0.72, 0.02, '#e0675b'),
        block(part(0.55, 0.85, 0.09, 0.1), 0.5, 0.18, '#62b86f', { opacity: 0.6 }),
        block(part(0.1, 0.9, 0.09, 0.16), 0.3, 0.02, STEEL),
      ];
    case 'mural':
      return [
        block(part(0.02, 0.98, 0.02, 0.1), 0, 1.15, '#3d8a3a', { shape: 'soft' }),
        ...[0.1, 0.3, 0.5, 0.7, 0.9].flatMap((z, row) =>
          [0.1, 0.3, 0.5, 0.7, 0.9].map((u, column) =>
            block(part(u - 0.06, u + 0.06, 0.1, 0.16), z, 0.14, pick(LEAVES, row + column), {
              shape: 'ball',
            }),
          ),
        ),
      ];
    case 'glass_partition':
      return [
        block(part(0, 1, 0.02, 0.07), 0, 1.05, GLASS, { opacity: 0.4 }),
        block(part(0, 1, 0.01, 0.08), 0, 0.04, STEEL),
        block(part(0, 1, 0.01, 0.08), 1.05, 0.03, STEEL),
      ];
    case 'floor_lamp':
      return [
        block(part(0.32, 0.68, 0.32, 0.68), 0, 0.03, METAL, { shape: 'drum' }),
        block(part(0.48, 0.52, 0.48, 0.52), 0.03, 1, METAL, { shape: 'drum' }),
        block(part(0.3, 0.7, 0.3, 0.7), 1, 0.2, '#ffe3a3', { glow: true, shape: 'drum' }),
      ];
    case 'plant':
    case 'plant_large': {
      const large = item.kind === 'plant_large';
      const size = large ? 0.44 : 0.36;
      const pot = part(0.5 - size / 2, 0.5 + size / 2, 0.5 - size / 2, 0.5 + size / 2);
      const potHeight = large ? 0.3 : 0.24;
      const cx = pot.x + pot.w / 2;
      const cy = pot.y + pot.d / 2;
      return [
        block(pot, 0, potHeight, large ? TERRACOTTA : POT, { shape: 'drum' }),
        block(inset(pot, 0.03), potHeight - 0.02, 0.03, SOIL, { shape: 'drum' }),
        ...(large
          ? [block(part(0.48, 0.52, 0.48, 0.52), potHeight, 0.35, WOOD_DARK, { shape: 'drum' })]
          : []),
        ...leaves(
          cx,
          cy,
          potHeight - 0.02,
          large ? 0.62 : 0.5,
          large ? 14 : 10,
          item.x * 0.7 + item.y,
        ),
        ...(large ? leaves(cx, cy, potHeight + 0.3, 0.5, 9, item.y * 0.9) : []),
      ];
    }
    case 'rug':
      return [
        block(inset(rect, 0.05), 0, 0.012, shadeOf(color, -0.15), { shape: 'soft' }),
        block(inset(rect, 0.15), 0.004, 0.012, color, { shape: 'soft' }),
      ];
    case 'entrance':
      return [
        block(inset(rect, 0.08), 0, 0.012, '#3a2d6e'),
        block(inset(rect, 0.18), 0.004, 0.012, '#5a4c86'),
      ];
  }
}
