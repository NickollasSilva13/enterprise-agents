import { ITEM_KIND_INFO, type OfficeItem, type Side } from '@ea/shared';
import type { ReactNode } from 'react';
import { type BoxColors, floorPoints, IsoBox, project, shades } from './iso';
import { PixelSprite, type Sprite } from '../../../components/pixel-art/pixels';

// The furniture of the catalog (`ITEM_KINDS`), drawn from isometric boxes and
// a few pixel sprites. Each piece is drawn in its own frame, facing +y
// ("south"), and turned to the item's facing by `frameOf`.

type Item = Pick<OfficeItem, 'kind' | 'x' | 'y' | 'facing'>;

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly d: number;
}

/**
 * Maps a rectangle in the item's own frame (u across, v toward its front,
 * within its size facing south) to the grid.
 */
function frameOf(item: Item): (u: number, v: number, du: number, dv: number) => Rect {
  const { w, d } = ITEM_KIND_INFO[item.kind].size;
  const map = (u: number, v: number): [number, number] => {
    switch (item.facing) {
      case 's':
        return [item.x + u, item.y + v];
      case 'n':
        return [item.x + w - u, item.y + d - v];
      case 'e':
        return [item.x + v, item.y + w - u];
      case 'w':
        return [item.x + d - v, item.y + u];
    }
  };
  return (u, v, du, dv) => {
    const [ax, ay] = map(u, v);
    const [bx, by] = map(u + du, v + dv);
    return { x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), d: Math.abs(by - ay) };
  };
}

/** Whether the front of something facing `side` is seen by the viewer. */
export const facesViewer = (side: Side) => side === 's' || side === 'e';

const WOOD = shades('#d9a877', '#b9875a', '#9c6e46');
const WOOD_DARK = shades('#8d6142', '#6f4a31', '#5a3b27');
const METAL = shades('#5a5470', '#433e57', '#363146');
/** The back of a monitor: lighter than its frame, so it does not read as a chair. */
const MONITOR_BACK = shades('#b3abc9', '#9c93b8', '#867da3');
const WHITE = shades('#f4f1fb', '#d9d2ea', '#c2b9d8');
const CHAIR = shades('#4a4466', '#38324f', '#2c2740');
const POT = shades('#c97a55', '#a95f3f', '#8c4c31');
const SOFA = shades('#f2a541', '#d9892a', '#bf741e');
const NAVY = shades('#5468a8', '#41528a', '#33416f');
const GLASS = shades('#bfe3ff', '#8ec8f2', '#79b3df');
const GREEN_WALL = shades('#5bab4a', '#3f8a35', '#33732b');

export type Screen = 'off' | 'on' | 'alert' | 'error';
const SCREEN_COLOR: Record<Screen, string> = {
  off: '#2b2840',
  on: '#7ce0ff',
  alert: '#ffc24b',
  error: '#ff7b72',
};

const LEAVES: Sprite = [
  '.....g.g......',
  '...g.gGg..g...',
  '..gGgGGGg.Gg..',
  '.gGGGgGGGgGGg.',
  'gGGlGGGlGGGGg.',
  '.gGGGlGGGlGGGg',
  'gGlGGGgGGGGlg.',
  '.gGGgGGGlGGGg.',
  '..gGGGgGGGgg..',
  '...ggGGGgg....',
];

const BIG_LEAVES: Sprite = [
  '......g..g......',
  '....g.gGgGg.g...',
  '...gGgGGGGGgGg..',
  '..gGGGlGGGlGGGg.',
  '.gGGlGGGgGGGGGg.',
  'gGGGGGgGGGlGGGGg',
  '.gGlGGGGGgGGGlg.',
  'gGGGgGGlGGGGGGGg',
  '.gGGGGGGGgGlGGg.',
  'gGlGGgGGGGGGGGGg',
  '.gGGGGlGGGgGGGg.',
  '..gGGGGGGGGGGg..',
  '...ggGGgGGgg....',
];

const LEAF_PALETTE = { g: '#2f7a3d', G: '#4fae4f', l: '#8fdc6a' };

function Plant({ item, large }: { item: Item; large: boolean }) {
  const pot = large ? 0.24 : 0.3;
  const height = large ? 10 : 7;
  const base = project(item.x + 0.5, item.y + 0.5, height);
  const sprite = large ? BIG_LEAVES : LEAVES;
  const width = sprite[0]?.length ?? 0;
  return (
    <g>
      <IsoBox
        x={item.x + pot}
        y={item.y + pot}
        w={1 - 2 * pot}
        d={1 - 2 * pot}
        h={height}
        colors={POT}
      />
      <PixelSprite
        sprite={sprite}
        palette={LEAF_PALETTE}
        x={base.x - width / 2}
        y={base.y - sprite.length + 3}
      />
    </g>
  );
}

function box(rect: Rect, z: number, h: number, colors: BoxColors, className?: string) {
  return <IsoBox {...rect} z={z} h={h} colors={colors} className={className} />;
}

/** A chair whose sitter faces `facing`; the back is on the other side. */
export function Chair({ x, y, facing }: { x: number; y: number; facing: Side }) {
  const frame = frameOf({ kind: 'chair', x, y, facing });
  return (
    <g>
      {box(frame(0.42, 0.42, 0.16, 0.16), 0, 6, METAL)}
      {box(frame(0.22, 0.22, 0.56, 0.56), 6, 2, CHAIR)}
      {box(frame(0.22, 0.14, 0.56, 0.08), 8, 9, CHAIR)}
    </g>
  );
}

function Desk({ item, screen }: { item: Item; screen: Screen }) {
  const frame = frameOf(item);
  // Facing is the side of the chair: the screen looks toward it, from the far edge.
  const monitor = frame(0.45, 0.12, 0.4, 0.07);
  const screenColors: BoxColors = facesViewer(item.facing)
    ? item.facing === 's'
      ? { ...METAL, left: SCREEN_COLOR[screen] }
      : { ...METAL, right: SCREEN_COLOR[screen] }
    : MONITOR_BACK;
  return (
    <g>
      {box(frame(0.06, 0.08, 0.06, 0.84), 0, 10, METAL)}
      {box(frame(0.55, 0.12, 0.38, 0.76), 0, 10, WHITE)}
      {box(frame(0.02, 0.04, 0.96, 0.92), 10, 2, WHITE)}
      {box(frame(0.6, 0.18, 0.1, 0.05), 12, 2, METAL)}
      <IsoBox {...monitor} z={14} h={8} colors={screenColors} />
      {box(frame(0.1, 0.55, 0.35, 0.18), 12, 0.6, METAL)}
    </g>
  );
}

function Sofa({ item, colors }: { item: Item; colors: BoxColors }) {
  const frame = frameOf(item);
  const { w } = ITEM_KIND_INFO[item.kind].size;
  return (
    <g>
      {box(frame(0.04, 0.08, w - 0.08, 0.84), 0, 6, colors)}
      {box(frame(0.04, 0.08, w - 0.08, 0.22), 6, 8, colors)}
      {box(frame(0.04, 0.3, 0.16, 0.62), 6, 4, colors)}
      {box(frame(w - 0.2, 0.3, 0.16, 0.62), 6, 4, colors)}
    </g>
  );
}

function Shelf({ item }: { item: Item }) {
  const frame = frameOf(item);
  const books = ['#ef5b5b', '#3f8cff', '#f3c94e', '#5ec46d', '#8064ff'];
  return (
    <g>
      {box(frame(0.08, 0.1, 0.84, 0.8), 0, 30, WOOD_DARK)}
      {[4, 13, 22].map((z, row) =>
        books
          .slice(row, row + 3)
          .map((color, index) => (
            <g key={`${z}-${color}`}>
              {box(frame(0.14 + index * 0.24, 0.84, 0.2, 0.1), z, 6, shades(color, color, color))}
            </g>
          )),
      )}
    </g>
  );
}

/** One piece of furniture, by kind. Flat items (rugs, the entrance) are drawn with the floor. */
export function Furniture({ item, screen = 'off' }: { item: Item; screen?: Screen }): ReactNode {
  const frame = frameOf(item);
  switch (item.kind) {
    case 'desk':
      return <Desk item={item} screen={screen} />;
    case 'chair':
      return <Chair x={item.x} y={item.y} facing={item.facing} />;
    case 'plant':
      return <Plant item={item} large={false} />;
    case 'plant_large':
      return <Plant item={item} large />;
    case 'sofa':
    case 'armchair':
      return <Sofa item={item} colors={item.kind === 'sofa' ? SOFA : NAVY} />;
    case 'coffee_table':
      return (
        <g>
          {box(frame(0.45, 0.45, 0.1, 0.1), 0, 6, WOOD_DARK)}
          {box(frame(0.15, 0.15, 0.7, 0.7), 6, 2, WOOD)}
        </g>
      );
    case 'meeting_table':
      return (
        <g>
          {box(frame(0.3, 0.4, 0.15, 0.2), 0, 10, METAL)}
          {box(frame(2.55, 0.4, 0.15, 0.2), 0, 10, METAL)}
          {box(frame(0.05, 0.12, 2.9, 0.76), 10, 2, WOOD)}
        </g>
      );
    case 'bookshelf':
      return <Shelf item={item} />;
    case 'counter':
      return (
        <g>
          {box(frame(0, 0.05, 1, 0.9), 0, 11, WHITE)}
          {box(frame(0, 0.02, 1, 0.96), 11, 1.5, WOOD_DARK)}
        </g>
      );
    case 'coffee_machine':
      return (
        <g>
          {box(frame(0, 0.05, 1, 0.9), 0, 11, WHITE)}
          {box(frame(0, 0.02, 1, 0.96), 11, 1.5, WOOD_DARK)}
          {box(frame(0.25, 0.25, 0.5, 0.45), 12.5, 10, METAL)}
          {box(frame(0.4, 0.7, 0.2, 0.08), 15, 2, shades('#ff7b72', '#ff7b72', '#ff7b72'))}
        </g>
      );
    case 'water_cooler':
      return (
        <g>
          {box(frame(0.25, 0.25, 0.5, 0.5), 0, 14, WHITE)}
          {box(frame(0.3, 0.3, 0.4, 0.4), 14, 10, GLASS)}
        </g>
      );
    case 'bean_bag':
      return (
        <g>
          {box(frame(0.12, 0.12, 0.76, 0.76), 0, 5, SOFA)}
          {box(frame(0.2, 0.15, 0.6, 0.3), 5, 4, SOFA)}
        </g>
      );
    case 'tv': {
      const screenColors: BoxColors = facesViewer(item.facing)
        ? item.facing === 's'
          ? { ...METAL, left: '#4fd1ff' }
          : { ...METAL, right: '#4fd1ff' }
        : METAL;
      return (
        <g>
          {box(frame(0.1, 0.2, 0.8, 0.6), 0, 7, WOOD)}
          {box(frame(0.12, 0.42, 0.76, 0.08), 7, 14, screenColors)}
        </g>
      );
    }
    case 'whiteboard':
      return (
        <g>
          {box(frame(0.12, 0.45, 0.06, 0.1), 0, 10, METAL)}
          {box(frame(0.82, 0.45, 0.06, 0.1), 0, 10, METAL)}
          {box(frame(0.06, 0.45, 0.88, 0.08), 10, 14, WHITE)}
        </g>
      );
    case 'mural':
      return box(frame(0.02, 0.35, 1.96, 0.3), 0, 30, GREEN_WALL);
    case 'rug':
    case 'entrance':
      return null;
  }
}

/** Items lying on the floor, drawn before anything stands on it. */
export function FlatItem({ item }: { item: Item }): ReactNode {
  if (item.kind === 'rug') {
    const { x, y } = item;
    const turned = item.facing === 'e' || item.facing === 'w';
    const { w, d } = ITEM_KIND_INFO.rug.size;
    const [width, depth] = turned ? [d, w] : [w, d];
    return (
      <g>
        <polygon
          points={floorPoints(x + 0.05, y + 0.05, width - 0.1, depth - 0.1, 0.2)}
          fill="#7a63c9"
        />
        <polygon
          points={floorPoints(x + 0.2, y + 0.2, width - 0.4, depth - 0.4, 0.3)}
          fill="#9a86e0"
        />
      </g>
    );
  }
  if (item.kind === 'entrance') {
    return (
      <g>
        <polygon points={floorPoints(item.x + 0.05, item.y + 0.1, 0.9, 0.8, 0.2)} fill="#4b3d86" />
        <polygon points={floorPoints(item.x + 0.25, item.y + 0.3, 0.5, 0.4, 0.3)} fill="#7c5cff" />
      </g>
    );
  }
  return null;
}

/** Whether an item is drawn with the floor rather than among the things that stand. */
export const isFlat = (kind: OfficeItem['kind']) => kind === 'rug' || kind === 'entrance';
