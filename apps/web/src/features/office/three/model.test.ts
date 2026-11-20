import {
  ITEM_COLORS,
  ITEM_KIND_INFO,
  ITEM_KINDS,
  type OfficeArea,
  type OfficeItem,
} from '@ea/shared';
import { describe, expect, it } from 'vitest';
import { chairBlocks, itemBlocks, rectOf, wallPieces } from './model';
import { HEIGHTS } from './view';

const SIDES = ['n', 's', 'e', 'w'] as const;

function item(kind: OfficeItem['kind'], facing: OfficeItem['facing'], color: OfficeItem['color']) {
  return {
    id: `${kind}-${facing}`,
    kind,
    x: 3,
    y: 4,
    facing,
    color,
    label: null,
  } as OfficeItem;
}

describe('itemBlocks', () => {
  it('builds every piece in every direction and colour inside its own tiles', () => {
    for (const kind of ITEM_KINDS) {
      for (const facing of SIDES) {
        for (const color of ITEM_COLORS) {
          const piece = item(kind, facing, color);
          const rect = rectOf(piece);
          const blocks = itemBlocks(piece);
          expect(blocks.length, kind).toBeGreaterThan(0);
          for (const block of blocks) {
            expect(block.w, kind).toBeGreaterThan(0);
            expect(block.d, kind).toBeGreaterThan(0);
            expect(block.h, kind).toBeGreaterThan(0);
            expect(block.x, kind).toBeGreaterThanOrEqual(rect.x - 1e-9);
            expect(block.y, kind).toBeGreaterThanOrEqual(rect.y - 1e-9);
            expect(block.x + block.w, kind).toBeLessThanOrEqual(rect.x + rect.w + 1e-9);
            expect(block.y + block.d, kind).toBeLessThanOrEqual(rect.y + rect.d + 1e-9);
            expect(block.color, kind).toMatch(/^#[0-9a-f]{6}$/i);
          }
        }
      }
    }
  });

  it('turns the footprint of a piece with its facing', () => {
    const kind = ITEM_KINDS.find(
      (each) => ITEM_KIND_INFO[each].size.w !== ITEM_KIND_INFO[each].size.d,
    );
    expect(kind).toBeDefined();
    if (!kind) return;
    const along = rectOf(item(kind, 's', 'default'));
    const across = rectOf(item(kind, 'e', 'default'));
    expect([along.w, along.d]).toEqual([across.d, across.w]);
  });

  it('changes only the live parts of a desk when its screen turns on', () => {
    const desk = item('desk', 's', 'default');
    const fixed = (screen: 'off' | 'on') =>
      JSON.stringify(itemBlocks(desk, screen).filter((block) => !block.live));
    expect(fixed('on')).toBe(fixed('off'));
    expect(itemBlocks(desk, 'on').filter((block) => block.live).length).toBeGreaterThan(0);
  });

  it('lights a desk screen only while someone works at it', () => {
    const desk = item('desk', 's', 'default');
    expect(itemBlocks(desk, 'off').some((block) => block.glow)).toBe(false);
    expect(itemBlocks(desk, 'on').some((block) => block.glow)).toBe(true);
  });

  it('changes only the pieces that take a colour', () => {
    for (const kind of ITEM_KINDS) {
      const plain = itemBlocks(item(kind, 's', 'default')).map((block) => block.color);
      const pink = itemBlocks(item(kind, 's', 'pink')).map((block) => block.color);
      expect(plain.join() !== pink.join(), kind).toBe(Boolean(ITEM_KIND_INFO[kind].colorable));
    }
  });
});

describe('the models of Phase 26', () => {
  const parts = (kind: OfficeItem['kind'], facing: OfficeItem['facing'] = 's') =>
    itemBlocks(item(kind, facing, 'default'));

  it('builds the furniture from parts, not single boxes', () => {
    for (const kind of ITEM_KINDS) {
      if (kind === 'rug' || kind === 'entrance') continue;
      expect(parts(kind).length, kind).toBeGreaterThanOrEqual(3);
    }
  });

  it('gives plants leaves in volume, turned outward and tipped up', () => {
    for (const kind of ['plant', 'plant_large'] as const) {
      const blades = parts(kind).filter((part) => part.shape === 'leaf');
      expect(blades.length, kind).toBeGreaterThanOrEqual(8);
      expect(new Set(blades.map((blade) => blade.yaw?.toFixed(2))).size, kind).toBe(blades.length);
      expect(
        blades.every((blade) => (blade.pitch ?? 0) > 0),
        kind,
      ).toBe(true);
    }
  });

  it('puts the screen of a desk at the back and the keyboard in front, whatever way it faces', () => {
    for (const facing of SIDES) {
      const blocks = parts('desk', facing);
      const screen = blocks.find((part) => part.color === '#262238');
      const keyboard = blocks.find((part) => part.color === '#3a3555');
      expect(screen && keyboard, facing).toBeTruthy();
      if (!screen || !keyboard) continue;
      // The front of the desk is the side the person sits on.
      const towardFront = { s: [0, 1], n: [0, -1], e: [1, 0], w: [-1, 0] }[facing];
      const ahead =
        (keyboard.x - screen.x) * (towardFront[0] ?? 0) +
        (keyboard.y - screen.y) * (towardFront[1] ?? 0);
      expect(ahead, facing).toBeGreaterThan(0);
    }
  });

  it('sets the back of a chair opposite where the sitter looks', () => {
    for (const facing of SIDES) {
      const blocks = chairBlocks(0, 0, facing);
      const seat = blocks.find((part) => part.shape === 'soft' && part.h < 0.1);
      const back = blocks.find((part) => part.shape === 'soft' && part.h > 0.3);
      if (!seat || !back) throw new Error(`chair ${facing} without seat or back`);
      const look = { s: [0, 1], n: [0, -1], e: [1, 0], w: [-1, 0] }[facing];
      const behind =
        (back.x + back.w / 2 - (seat.x + seat.w / 2)) * (look[0] ?? 0) +
        (back.y + back.d / 2 - (seat.y + seat.d / 2)) * (look[1] ?? 0);
      expect(behind, facing).toBeLessThan(0);
    }
  });

  it('keeps tables and seats at heights that fit the characters', () => {
    const top = (kind: OfficeItem['kind']) =>
      Math.max(
        ...parts(kind)
          .filter((part) => !part.glow)
          .map((part) => part.z + part.h),
      );
    expect(top('coffee_table')).toBeLessThan(HEIGHTS.seat + 0.05);
    expect(top('bookshelf')).toBeGreaterThan(HEIGHTS.character);
    const desk = parts('desk').find((part) => part.finish === 'gloss');
    expect(desk && desk.z).toBeGreaterThan(HEIGHTS.seat);
    expect(desk && desk.z).toBeLessThan(HEIGHTS.character * 0.5);
  });
});

describe('wallPieces', () => {
  const area: OfficeArea = {
    id: 'a',
    kind: 'meeting',
    name: null,
    projectId: null,
    x: 2,
    y: 2,
    width: 3,
    height: 2,
    floor: 'tile',
    doors: [{ side: 's', offset: 1 }],
  };

  it('walls a room tall at the back, low at the front, with a gap at the door', () => {
    const pieces = wallPieces({ areas: [area], width: 8, height: 6 });
    const inside = pieces.filter((piece) => piece.x >= 1.5 && piece.y >= 1.5);
    const north = inside.filter((piece) => piece.y < 2 && piece.w === 1);
    const south = inside.filter((piece) => piece.y === 4);
    expect(north).toHaveLength(3);
    expect(north.every((piece) => piece.h === HEIGHTS.wall)).toBe(true);
    // The door takes the middle tile of the south wall.
    expect(south.map((piece) => piece.x).sort()).toEqual([2, 4]);
    expect(south.every((piece) => piece.h === HEIGHTS.lowWall)).toBe(true);
  });

  it('closes the back edges of the floor with the building glass', () => {
    const pieces = wallPieces({ areas: [], width: 8, height: 6 });
    expect(pieces).toHaveLength(8 + 6);
    expect(pieces.every((piece) => piece.h > HEIGHTS.wall)).toBe(true);
  });
});
