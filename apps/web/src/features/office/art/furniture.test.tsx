import { ITEM_COLORS, ITEM_KIND_INFO, ITEM_KINDS, SIDES } from '@ea/shared';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FlatItem, Furniture, isFlat } from './furniture';

// The furniture of Phase 23: every piece, every way it can face, every colour
// it can take, drawn without inline style or text and only in plain colours.

describe('furniture (Phase 23)', () => {
  it('draws every piece facing every way, in every colour it may take', () => {
    for (const kind of ITEM_KINDS) {
      const colors = ITEM_KIND_INFO[kind].colorable ? ITEM_COLORS : (['default'] as const);
      for (const facing of SIDES) {
        for (const color of colors) {
          const item = { kind, x: 2, y: 3, facing, color };
          const { container, unmount } = render(
            <svg>{isFlat(kind) ? <FlatItem item={item} /> : <Furniture item={item} />}</svg>,
          );
          expect(container.querySelector('[style], text'), `${kind} ${facing}`).toBeNull();
          for (const shape of container.querySelectorAll('polygon, path, polyline, circle')) {
            const fill = shape.getAttribute('fill');
            if (fill !== null && fill !== 'none')
              expect(fill, `${kind} ${color}`).toMatch(/^#[0-9a-f]{6}$/);
          }
          if (kind !== 'entrance') expect(container.querySelector('svg > *'), kind).not.toBeNull();
          unmount();
        }
      }
    }
  });

  it('changes the colour of the pieces that can change it, and only those', () => {
    const draw = (kind: (typeof ITEM_KINDS)[number], color: (typeof ITEM_COLORS)[number]) =>
      render(
        <svg>
          {isFlat(kind) ? (
            <FlatItem item={{ kind, x: 0, y: 0, facing: 's', color }} />
          ) : (
            <Furniture item={{ kind, x: 0, y: 0, facing: 's', color }} />
          )}
        </svg>,
      ).container.innerHTML;
    for (const kind of ITEM_KINDS.filter((each) => ITEM_KIND_INFO[each].colorable)) {
      expect(draw(kind, 'teal'), kind).not.toBe(draw(kind, 'pink'));
      expect(draw(kind, 'default'), kind).not.toBe(draw(kind, 'teal'));
    }
  });

  it('has a drawing for each kind of the new catalog', () => {
    for (const kind of [
      'vending_machine',
      'fridge',
      'bar_stool',
      'wall_tv',
      'glass_partition',
      'floor_lamp',
    ] as const) {
      const { container } = render(
        <svg>
          <Furniture item={{ kind, x: 0, y: 0, facing: 's', color: 'default' }} />
        </svg>,
      );
      expect(container.querySelectorAll('polygon').length, kind).toBeGreaterThan(2);
    }
  });
});
