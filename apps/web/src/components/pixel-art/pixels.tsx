// Pixel art described in code (Phase 14). A sprite is a list of rows, one
// character per pixel: '.' is transparent and every other character names a
// colour of the palette it is drawn with. Several sprites can be laid over
// one another (layers), so a character is a body, a hair style, an outfit and
// an accessory, each recoloured by changing the palette alone.

export type Sprite = readonly string[];
export type Palette = Readonly<Record<string, string>>;

export interface PixelPath {
  readonly fill: string;
  readonly d: string;
}

/** Lays sprites over one another: a later layer wins where it is not transparent. */
export function layer(...sprites: (Sprite | null | undefined)[]): string[] {
  const rows: string[][] = [];
  for (const sprite of sprites) {
    if (!sprite) continue;
    sprite.forEach((row, y) => {
      const target = (rows[y] ??= []);
      for (let x = 0; x < row.length; x += 1) {
        const pixel = row[x] as string;
        if (pixel !== '.' && pixel !== ' ') target[x] = pixel;
      }
    });
  }
  return rows.map((row) => Array.from(row, (pixel) => pixel ?? '.').join(''));
}

/**
 * One SVG path per colour, each horizontal run of pixels a single rectangle,
 * so a sprite costs a handful of elements however many pixels it has.
 * Colours missing from the palette are not drawn.
 */
export function toPaths(sprite: Sprite, palette: Palette, originX = 0, originY = 0): PixelPath[] {
  const runs = new Map<string, string[]>();
  sprite.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const pixel = row[x] as string;
      let end = x + 1;
      while (end < row.length && row[end] === pixel) end += 1;
      const fill = palette[pixel];
      if (pixel !== '.' && pixel !== ' ' && fill !== undefined) {
        const list = runs.get(fill) ?? [];
        list.push(`M${originX + x} ${originY + y}h${end - x}v1h${x - end}z`);
        runs.set(fill, list);
      }
      x = end;
    }
  });
  return [...runs].map(([fill, parts]) => ({ fill, d: parts.join('') }));
}

/** The sprite turned around a vertical axis. */
export const mirror = (sprite: Sprite): string[] =>
  sprite.map((row) => [...row].reverse().join(''));

export function PixelSprite({
  sprite,
  palette,
  x = 0,
  y = 0,
  className,
}: {
  sprite: Sprite;
  palette: Palette;
  x?: number;
  y?: number;
  className?: string;
}) {
  return (
    <g className={className} shapeRendering="crispEdges">
      {toPaths(sprite, palette, x, y).map((path) => (
        <path key={path.fill} d={path.d} fill={path.fill} />
      ))}
    </g>
  );
}
