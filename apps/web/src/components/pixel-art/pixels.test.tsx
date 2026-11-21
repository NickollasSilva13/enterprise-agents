import {
  ACCESSORIES,
  type Appearance,
  defaultAppearance,
  EYE_COLORS,
  FACIAL_HAIR,
  HAIR_COLORS,
  HAIR_STYLES,
  OUTFIT_COLORS,
  OUTFITS,
  PANTS_COLORS,
  PATTERNS,
  SHOE_COLORS,
  SKIN_TONES,
} from '@ea/shared';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { materialsOf, PixelBust, PixelCharacter } from './character';
import {
  type Direction,
  FIGURE_HEIGHT,
  FIGURE_WIDTH,
  type FigureSpec,
  figureMask,
  handsOf,
  HIPS,
  screenSideOf,
} from './figure';
import { layer, mirror, toPaths } from './pixels';
import { colorPaths, ramp, shade } from './shade';

// The 32-bit characters (Phase 22): every option in every view, the tones,
// the sides of what has a side, and the frames of each animation.

const DIRECTIONS: readonly Direction[] = ['sw', 'se', 'nw', 'ne'];
/** The two tests that go through every option draw thousands of figures. */
const EVERY_OPTION = 30_000;
const PERSON: Appearance = { ...defaultAppearance('x'), kind: 'person' };

const spec = (overrides: Partial<FigureSpec> = {}): FigureSpec => ({
  look: PERSON,
  robot: null,
  facing: 'sw',
  pose: 'stand',
  frame: 0,
  holding: null,
  raisedHand: false,
  activity: null,
  ...overrides,
});

/** How many pixels of `pixel` a mask has on each half of the screen. */
function halves(mask: readonly string[], pixel: string) {
  const sides = { left: 0, right: 0 };
  for (const row of mask)
    [...row].forEach((value, x) => {
      if (value !== pixel) return;
      if (x < FIGURE_WIDTH / 2) sides.left += 1;
      else sides.right += 1;
    });
  return sides;
}

function everyLook(): Appearance[] {
  const looks: Appearance[] = [];
  const base = PERSON;
  for (const skin of SKIN_TONES) looks.push({ ...base, skin });
  for (const hair of HAIR_STYLES) looks.push({ ...base, hair });
  for (const hairColor of HAIR_COLORS) looks.push({ ...base, hairColor });
  for (const outfit of OUTFITS) looks.push({ ...base, outfit });
  for (const outfitColor of OUTFIT_COLORS) looks.push({ ...base, outfitColor });
  for (const pants of PANTS_COLORS) looks.push({ ...base, pants });
  for (const accessory of ACCESSORIES) looks.push({ ...base, accessory });
  for (const eyes of EYE_COLORS) looks.push({ ...base, eyes });
  for (const facialHair of FACIAL_HAIR) looks.push({ ...base, facialHair });
  for (const shoes of SHOE_COLORS) looks.push({ ...base, shoes });
  for (const pattern of PATTERNS) looks.push({ ...base, pattern });
  return looks;
}

describe('pixel art', () => {
  it('turns runs of pixels into one rectangle each, one path per colour', () => {
    expect(toPaths(['aab.', '.bbb'], { a: '#111', b: '#222' })).toEqual([
      { fill: '#111', d: 'M0 0h2v1h-2z' },
      { fill: '#222', d: 'M2 0h1v1h-1zM1 1h3v1h-3z' },
    ]);
    expect(colorPaths([['#111', '#111', null]], 3, 4)).toEqual([
      { fill: '#111', d: 'M3 4h2v1h-2z' },
    ]);
  });

  it('lays layers over one another, the later winning where it is not transparent', () => {
    expect(layer(['aaa', 'aaa'], ['.b.'], null, ['..c', '...', 'ddd'])).toEqual([
      'abc',
      'aaa',
      'ddd',
    ]);
    expect(mirror(['ab.'])).toEqual(['.ba']);
  });
});

describe('shading (D4)', () => {
  const tones = ramp(['#8064ff', '#5d42d8']);
  const materials = {
    A: { id: 'a', ramp: tones },
    a: { id: 'a', ramp: tones, tone: 'shadow' as const },
    e: { id: 'eye', flat: '#000000' },
  };

  it('makes four distinct tones from the two of an option', () => {
    expect(new Set(Object.values(tones)).size).toBe(4);
    expect(tones.base).toBe('#8064ff');
    expect(tones.shadow).toBe('#5d42d8');
  });

  it('outlines the silhouette, lights the top left and shades the bottom right', () => {
    const block = ['.......', ...Array.from({ length: 5 }, () => '.AAAAA.'), '.......'];
    const grid = shade(block, materials);
    expect(grid[1]?.[1]).toBe(tones.outline);
    // Two rows under the edge the light still falls; the middle is the base.
    expect(grid[2]?.[3]).toBe(tones.light);
    expect(grid[3]?.[3]).toBe(tones.base);
    expect(grid[0]?.[0]).toBeNull();
  });

  it('keeps forced tones and flat colours, and ignores unknown characters', () => {
    const grid = shade(
      ['AAAAA', 'AAaeA', 'AAAAA', 'AA?AA'].map((row) => `.${row}.`),
      materials,
    );
    expect(grid[1]?.[3]).toBe(tones.shadow);
    expect(grid[1]?.[4]).toBe('#000000');
    expect(grid[3]?.[3]).toBeNull();
  });
});

describe('characters (Phase 22)', () => {
  it(
    'fits every view, pose and frame in the 32 × 64 box, with colours of the palette only',
    () => {
      const known = new Set(Object.keys(materialsOf(PERSON, null)));
      // Collected and checked once: a check per pixel would take far too long.
      const wrong = new Set<string>();
      for (const look of everyLook()) {
        for (const facing of DIRECTIONS) {
          for (const [pose, frames] of [
            ['stand', 1],
            ['walk', 4],
            ['sit', 1],
          ] as const) {
            for (let frame = 0; frame < frames; frame += 1) {
              const mask = figureMask(spec({ look, facing, pose, frame }));
              if (mask.length !== (pose === 'sit' ? HIPS : FIGURE_HEIGHT))
                wrong.add(`altura ${facing} ${pose}`);
              for (const row of mask) {
                if (row.length !== FIGURE_WIDTH) wrong.add(`largura ${facing} ${pose}`);
                for (const pixel of row)
                  if (pixel !== '.' && !known.has(pixel)) wrong.add(`cor "${pixel}"`);
              }
            }
          }
        }
      }
      expect([...wrong]).toEqual([]);
    },
    EVERY_OPTION,
  );

  it(
    'draws every option without inline style or text, each one a picture of its own',
    () => {
      const drawings = new Set<string>();
      const looks = everyLook();
      for (const look of looks) {
        for (const facing of ['sw', 'nw'] as const) {
          const { container } = render(
            <svg>
              <PixelCharacter agentId="x" appearance={look} pose="walk" facing={facing} />
              <PixelBust agentId="x" appearance={look} />
            </svg>,
          );
          expect(container.querySelector('[style], text')).toBeNull();
          for (const path of container.querySelectorAll('path'))
            expect(path.getAttribute('fill')).toMatch(/^#[0-9a-f]{6}$/);
          drawings.add(container.innerHTML);
        }
      }
      // Front and back differ, and almost every option changes at least one of them.
      expect(drawings.size).toBeGreaterThan(looks.length);
    },
    EVERY_OPTION,
  );

  it('looks four ways, each drawn, none a plain mirror of another', () => {
    const masks = DIRECTIONS.map((facing) => figureMask(spec({ facing, holding: 'cup' })));
    expect(new Set(masks.map((mask) => mask.join('\n'))).size).toBe(4);
    // Turned around, the cup stays in the same hand: not the mirror of the other view.
    expect(masks[1]).not.toEqual(mirror(masks[0] ?? []));
    expect(masks[3]).not.toEqual(mirror(masks[2] ?? []));
  });

  it('holds things and raises the hand with the right hand, on its side in every view (D3)', () => {
    for (const facing of DIRECTIONS) {
      const side = screenSideOf(facing, 'right');
      const cup = halves(figureMask(spec({ facing, holding: 'cup' })), 'U');
      expect(cup[side], `xícara ${facing}`).toBeGreaterThan(0);
      expect(cup[side === 'left' ? 'right' : 'left'], `xícara ${facing}`).toBe(0);

      const raised = handsOf(spec({ facing, pose: 'sit', raisedHand: true }));
      expect(raised[side].y, `mão levantada ${facing}`).toBeLessThan(20);
      expect(raised[side === 'left' ? 'right' : 'left'].y).toBeGreaterThan(30);
    }
  });

  // Defect of Phase 15, kept: characters had a single arm.
  it('gives every outfit two arms with hands, front and back', () => {
    for (const outfit of OUTFITS) {
      for (const facing of DIRECTIONS) {
        const look = { ...PERSON, outfit };
        const mask = figureMask(spec({ look, facing }));
        const hands = handsOf(spec({ look, facing }));
        for (const side of ['left', 'right'] as const) {
          const { x, y } = hands[side];
          expect(mask[y + 1]?.[x], `${outfit} ${facing} ${side}`).toBe('S');
        }
        expect(hands.left.x).toBeLessThan(FIGURE_WIDTH / 2);
        expect(hands.right.x).toBeGreaterThan(FIGURE_WIDTH / 2);
      }
    }
  });

  it('wears the badge on the left chest and the microphone on the left ear', () => {
    const badge = (facing: Direction) =>
      halves(figureMask(spec({ facing, look: { ...PERSON, pattern: 'badge' } })), 'B');
    // Facing the viewer, the character's left is on the viewer's right, both ways it turns.
    expect(badge('sw').right).toBeGreaterThan(0);
    expect(badge('se').right).toBeGreaterThan(0);
    expect(badge('sw').left + badge('se').left).toBe(0);

    const mic = (facing: Direction) =>
      figureMask(spec({ facing, look: { ...PERSON, accessory: 'headset' } }))
        .join('')
        .split('g').length;
    // The left ear shows facing down-left; facing down-right only the right ear does.
    expect(mic('sw')).toBeGreaterThan(mic('se'));
  });

  it('walks in four frames with the arms swinging, types and talks in two (D6)', () => {
    const walk = [0, 1, 2, 3].map((frame) => figureMask(spec({ pose: 'walk', frame })).join(''));
    expect(new Set(walk).size).toBe(4);
    const hands = [0, 2].map((frame) => handsOf(spec({ pose: 'walk', frame })).left.x);
    expect(hands[0]).not.toBe(hands[1]);

    const draw = (props: Partial<Parameters<typeof PixelCharacter>[0]>) =>
      render(
        <svg>
          <PixelCharacter agentId="x" appearance={PERSON} pose="stand" {...props} />
        </svg>,
      ).container;
    expect(draw({ pose: 'walk' }).querySelectorAll('[class*="pixel-walk-"]')).toHaveLength(4);
    expect(
      draw({ pose: 'sit', activity: 'typing' }).querySelectorAll('.pixel-type-1, .pixel-type-2'),
    ).toHaveLength(2);
    expect(
      draw({ activity: 'talking' }).querySelectorAll('.pixel-talk-1, .pixel-talk-2'),
    ).toHaveLength(2);
    // With reduced motion only the first frame stays: the others carry "pixel-alt".
    expect(draw({ pose: 'walk' }).querySelectorAll('.pixel-alt')).toHaveLength(3);
    expect(draw({ pose: 'sit' }).querySelector('ellipse')).toBeNull();
  });

  it('draws an agent with no look as the robot of its id, always the same, front and back', () => {
    const draw = (id: string, facing: Direction = 'sw') =>
      render(
        <svg>
          <PixelCharacter agentId={id} appearance={null} pose="sit" facing={facing} />
        </svg>,
      ).container.innerHTML;
    expect(draw('agent-1')).toBe(draw('agent-1'));
    expect(draw('agent-1')).not.toBe(draw('agent-2'));
    expect(draw('agent-1', 'nw')).not.toBe(draw('agent-1'));
  });

  it('gives every id a valid default look', () => {
    for (let index = 0; index < 500; index += 1) {
      const look = defaultAppearance(`agent-${index}-${index * 7919}`);
      expect(SKIN_TONES).toContain(look.skin);
      expect(ACCESSORIES).toContain(look.accessory);
      expect(PANTS_COLORS).toContain(look.pants);
    }
  });
});
