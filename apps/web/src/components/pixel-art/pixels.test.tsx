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
import {
  ALL_SPRITES,
  CHARACTER_HEIGHT,
  CHARACTER_WIDTH,
  type Direction,
  PixelBust,
  PixelCharacter,
} from './character';
import { layer, mirror, toPaths } from './pixels';

describe('pixel art', () => {
  it('turns runs of pixels into one rectangle each, one path per colour', () => {
    expect(toPaths(['aab.', '.bbb'], { a: '#111', b: '#222' })).toEqual([
      { fill: '#111', d: 'M0 0h2v1h-2z' },
      { fill: '#222', d: 'M2 0h1v1h-1zM1 1h3v1h-3z' },
    ]);
    // Unknown colours and transparency are not drawn; the origin moves everything.
    expect(toPaths(['x.a'], { a: '#111' }, 10, 5)).toEqual([{ fill: '#111', d: 'M12 5h1v1h-1z' }]);
  });

  it('lays layers over one another, the later winning where it is not transparent', () => {
    expect(layer(['aaa', 'aaa'], ['.b.'], null, ['..c', '...', 'ddd'])).toEqual([
      'abc',
      'aaa',
      'ddd',
    ]);
    expect(mirror(['ab.'])).toEqual(['.ba']);
  });

  it('draws every option without inline style or text', () => {
    const looks: Appearance[] = [];
    const base = defaultAppearance('x');
    for (const skin of SKIN_TONES) looks.push({ ...base, kind: 'person', skin });
    for (const hair of HAIR_STYLES) looks.push({ ...base, kind: 'person', hair });
    for (const hairColor of HAIR_COLORS) looks.push({ ...base, kind: 'person', hairColor });
    for (const outfit of OUTFITS) looks.push({ ...base, kind: 'person', outfit });
    for (const outfitColor of OUTFIT_COLORS) looks.push({ ...base, kind: 'person', outfitColor });
    for (const pants of PANTS_COLORS) looks.push({ ...base, kind: 'person', pants });
    for (const accessory of ACCESSORIES) looks.push({ ...base, kind: 'person', accessory });
    for (const eyes of EYE_COLORS) looks.push({ ...base, kind: 'person', eyes });
    for (const facialHair of FACIAL_HAIR) looks.push({ ...base, kind: 'person', facialHair });
    for (const shoes of SHOE_COLORS) looks.push({ ...base, kind: 'person', shoes });
    for (const pattern of PATTERNS) looks.push({ ...base, kind: 'person', pattern });
    const drawings = new Set<string>();
    for (const look of looks) {
      for (const facing of ['sw', 'nw'] as const satisfies readonly Direction[]) {
        const { container } = render(
          <svg>
            <PixelCharacter agentId="x" appearance={look} pose="walk" facing={facing} />
            <PixelBust agentId="x" appearance={look} />
          </svg>,
        );
        expect(container.querySelector('[style], text')).toBeNull();
        // Every path has a colour from the palettes, never "undefined".
        for (const path of container.querySelectorAll('path')) {
          expect(path.getAttribute('fill') ?? path.getAttribute('stroke')).toMatch(
            /^#[0-9a-f]{6}$/,
          );
        }
        drawings.add(container.innerHTML);
      }
    }
    // Front and back are different pictures, and most options change at least one of them.
    expect(drawings.size).toBeGreaterThan(looks.length);
  });

  it('keeps every sprite inside the character box', () => {
    for (const sprite of ALL_SPRITES) {
      expect(sprite).toHaveLength(CHARACTER_HEIGHT);
      for (const row of sprite) expect(row).toHaveLength(CHARACTER_WIDTH);
    }
  });

  it('looks four ways: two drawn, two mirrored', () => {
    const look: Appearance = { ...defaultAppearance('x'), kind: 'person' };
    const draw = (facing: Direction, pose: 'stand' | 'walk' | 'sit' = 'stand') =>
      render(
        <svg>
          <PixelCharacter agentId="x" appearance={look} pose={pose} facing={facing} />
        </svg>,
      ).container.querySelector('g');
    expect(draw('sw')?.getAttribute('transform')).toBe('scale(0.8 0.8)');
    expect(draw('se')?.getAttribute('transform')).toBe('scale(-0.8 0.8)');
    expect(draw('ne')?.innerHTML).toBe(draw('nw')?.innerHTML);
    expect(draw('nw')?.innerHTML).not.toBe(draw('sw')?.innerHTML);
    // A walk alternates two leg frames; seated, no legs at all.
    expect(draw('sw', 'walk')?.querySelectorAll('.pixel-frame-a, .pixel-frame-b')).toHaveLength(2);
    expect(draw('sw', 'sit')?.querySelector('ellipse')).toBeNull();
  });

  it('draws an agent with no look as the robot of its id, always the same', () => {
    const draw = (id: string) =>
      render(
        <svg>
          <PixelCharacter agentId={id} appearance={null} pose="sit" />
        </svg>,
      ).container.innerHTML;
    expect(draw('agent-1')).toBe(draw('agent-1'));
    expect(draw('agent-1')).not.toBe(draw('agent-2'));
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
