import type { PixelPath } from './pixels';

// Shading of the 32-bit characters (Phase 22). A character is drawn as a
// mask: one character per pixel naming a material (skin, hair, outfit...).
// Shading turns the mask into colours with three to four tones per material,
// as the art of that generation does: a coloured outline on the silhouette,
// a highlight where the light (top left) hits, the base, and a shadow on the
// far side and under whatever covers it. The tones come from one function
// (`ramp`), so every colour option shades the same way.

export interface Ramp {
  readonly light: string;
  readonly base: string;
  readonly shadow: string;
  readonly outline: string;
}

/** A material: shaded by its ramp, or one flat colour (eyes, lenses, mouth). */
export type Material =
  | { readonly id: string; readonly ramp: Ramp; readonly tone?: 'light' | 'shadow' }
  | { readonly id: string; readonly flat: string };

export type Materials = Readonly<Record<string, Material>>;

const channels = (hex: string): [number, number, number] => {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
};

const toHex = (rgb: readonly number[]) =>
  `#${rgb
    .map((c) =>
      Math.round(Math.min(255, Math.max(0, c)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;

/** `a` moved `amount` of the way to `b`. */
export function mix(a: string, b: string, amount: number): string {
  const [ar, ag, ab] = channels(a);
  const [br, bg, bb] = channels(b);
  return toHex([ar + (br - ar) * amount, ag + (bg - ag) * amount, ab + (bb - ab) * amount]);
}

/** Warm light and a cool, violet dark, so shadows are not just grey. */
const LIGHT = '#fff6e8';
const DARK = '#1d1530';

/**
 * The four tones of a material from the two its option already has (light
 * and shadow): a soft highlight pushed toward a warm white, and a dark
 * outline, almost the deep violet of the office at night with a hint of the
 * material, as the genre the user chose draws its outlines (2026-11-19).
 */
export function ramp([base, shadow]: readonly [string, string]): Ramp {
  return {
    light: mix(base, LIGHT, 0.2),
    base,
    shadow,
    outline: mix(shadow, DARK, 0.8),
  };
}

const EMPTY = '.';

/**
 * Colours of a mask, row by row; null where it is transparent. Unknown
 * characters are left out. Rules, for a pixel of a shaded material:
 * - next to a transparent pixel: the outline (the silhouette);
 * - a forced tone of its material ("shadow" for folds, "light" for shine);
 * - under or left of another material: the shadow (it is covered);
 * - with another material or nothing to its left or above: the light;
 * - with another material to its right or below: the shadow;
 * - otherwise the base.
 */
export function shade(mask: readonly string[], materials: Materials): (string | null)[][] {
  const at = (x: number, y: number) => mask[y]?.[x] ?? EMPTY;
  const idOf = (pixel: string) => (pixel === EMPTY ? null : (materials[pixel]?.id ?? null));
  return mask.map((row, y) =>
    [...row].map((pixel, x) => {
      const material = materials[pixel];
      if (!material) return null;
      if ('flat' in material) return material.flat;
      const { id, ramp: tones } = material;
      const near = [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)];
      if (near.some((other) => idOf(other) === null)) return tones.outline;
      if (material.tone) return tones[material.tone];
      const other = (dx: number, dy: number) => idOf(at(x + dx, y + dy)) !== id;
      if (other(0, -1) || other(1, 0)) return tones.shadow;
      if (other(-1, 0) || other(0, -2)) return tones.light;
      if (other(0, 1)) return tones.shadow;
      return tones.base;
    }),
  );
}

/** One path per colour, each horizontal run of a colour a single rectangle. */
export function colorPaths(
  grid: readonly (readonly (string | null)[])[],
  originX = 0,
  originY = 0,
): PixelPath[] {
  const runs = new Map<string, string[]>();
  grid.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const fill = row[x] ?? null;
      let end = x + 1;
      while (end < row.length && (row[end] ?? null) === fill) end += 1;
      if (fill !== null) {
        const list = runs.get(fill) ?? [];
        list.push(`M${originX + x} ${originY + y}h${end - x}v1h${x - end}z`);
        runs.set(fill, list);
      }
      x = end;
    }
  });
  return [...runs].map(([fill, parts]) => ({ fill, d: parts.join('') }));
}
