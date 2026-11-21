import { afterEach, describe, expect, it, vi } from 'vitest';
import { geometryOf } from './Blocks';

describe('geometryOf', () => {
  afterEach(() => vi.restoreAllMocks());

  it('builds every shape quietly, with only position, normal and colour', () => {
    // Rounded boxes used to warn once per volume, hundreds of times per office.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    for (const shape of ['box', 'soft', 'ball', 'drum', 'leaf'] as const) {
      const geometry = geometryOf({
        x: 1,
        y: 2,
        z: 0,
        w: 0.5,
        d: 0.4,
        h: 0.3,
        color: '#7c5cff',
        shape,
      });
      expect(geometry.index).toBeNull();
      expect(Object.keys(geometry.attributes).sort()).toEqual(['color', 'normal', 'position']);
    }
    expect(warn).not.toHaveBeenCalled();
  });
});
