import { type ItemColor, ITEM_KIND_INFO, type OfficeItem, type Side } from '@ea/shared';
import type { ReactNode } from 'react';
import { Foliage } from './foliage';
import { type BoxColors, floorPoints, IsoBox, project, tones } from './iso';

// The furniture of the catalog (`ITEM_KINDS`), drawn from isometric boxes and
// a few pixel sprites. Each piece is drawn in its own frame, facing +y
// ("south"), and turned to the item's facing by `frameOf`. Since Phase 23 the
// pieces have the dark outline and the tones of the characters, a size that
// matches them, and a colour the user may pick for the soft pieces.

type Item = Pick<OfficeItem, 'kind' | 'x' | 'y' | 'facing'> & {
  readonly color?: ItemColor;
};

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly d: number;
}

/** A point of the item's own frame (u across, v toward its front) on the grid. */
function pointOf(item: Item): (u: number, v: number) => [number, number] {
  const { w, d } = ITEM_KIND_INFO[item.kind].size;
  return (u, v) => {
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
}

/**
 * Maps a rectangle in the item's own frame (u across, v toward its front,
 * within its size facing south) to the grid.
 */
function frameOf(item: Item): (u: number, v: number, du: number, dv: number) => Rect {
  const map = pointOf(item);
  return (u, v, du, dv) => {
    const [ax, ay] = map(u, v);
    const [bx, by] = map(u + du, v + dv);
    return { x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), d: Math.abs(by - ay) };
  };
}

/** Whether the front of something facing `side` is seen by the viewer. */
export const facesViewer = (side: Side) => side === 's' || side === 'e';

/** The face of a box that is the item's front, when the viewer sees it. */
const withFront = (item: Item, colors: BoxColors, front: string): BoxColors =>
  item.facing === 's'
    ? { ...colors, left: front }
    : item.facing === 'e'
      ? { ...colors, right: front }
      : colors;

const WOOD = tones('#c98d5a');
const WOOD_DARK = tones('#7d5639');
const METAL = tones('#4b4566');
const WHITE = tones('#ece8f6');
const SILVER = tones('#c9c6d8');
const POT = tones('#e9e4f2');
const GLASS = tones('#a9cdf0');
const GREEN_WALL = tones('#4f9f45');
const MACHINE = tones('#3a3264');

/** The colour of each choice, and of "default" for each kind that can change it. */
const COLOR_OF: Record<Exclude<ItemColor, 'default'>, string> = {
  orange: '#f0973f',
  violet: '#8a6cff',
  blue: '#4f86e8',
  teal: '#2fb5a5',
  green: '#5cbf6a',
  pink: '#f07bb6',
  gray: '#8d93a8',
};

const DEFAULT_COLOR: Partial<Record<OfficeItem['kind'], string>> = {
  sofa: COLOR_OF.orange,
  armchair: '#5468a8',
  bean_bag: COLOR_OF.orange,
  chair: '#3d3757',
  counter: '#ece8f6',
  rug: '#7a63c9',
  bar_stool: '#c98d5a',
};

export const colorOf = (item: Item): string =>
  item.color && item.color !== 'default'
    ? COLOR_OF[item.color]
    : (DEFAULT_COLOR[item.kind] ?? '#8d93a8');

export type Screen = 'off' | 'on' | 'alert' | 'error';
export const SCREEN_COLOR: Record<Screen, string> = {
  off: '#2b2840',
  on: '#7ce0ff',
  alert: '#ffc24b',
  error: '#ff7b72',
};

/** A pot with leaves in volume (Phase 23, after review: no flat sprite). */
function Plant({ item, large }: { item: Item; large: boolean }) {
  const pot = large ? 0.26 : 0.3;
  const height = large ? 9 : 7;
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
      <Foliage
        x={item.x + 0.5}
        y={item.y + 0.5}
        z={height}
        size={large ? 0.78 : 0.6}
        tall={large ? 1.5 : 1.1}
      />
    </g>
  );
}

function box(rect: Rect, z: number, h: number, colors: BoxColors, className?: string) {
  return <IsoBox {...rect} z={z} h={h} colors={colors} className={className} />;
}

/** A chair whose sitter faces `facing`; the back is on the other side. */
export function Chair({
  x,
  y,
  facing,
  color = 'default',
}: {
  x: number;
  y: number;
  facing: Side;
  color?: ItemColor;
}) {
  const item: Item = { kind: 'chair', x, y, facing, color };
  const frame = frameOf(item);
  const seat = tones(colorOf(item));
  return (
    <g>
      {box(frame(0.44, 0.44, 0.12, 0.12), 0, 6, METAL)}
      {box(frame(0.24, 0.24, 0.52, 0.52), 6, 2, seat)}
      {box(frame(0.24, 0.16, 0.52, 0.08), 8, 10, seat)}
    </g>
  );
}

function Desk({ item, screen }: { item: Item; screen: Screen }) {
  const frame = frameOf(item);
  // Facing is the side of the chair: the screen looks toward it, from the far edge.
  const monitor = frame(0.42, 0.12, 0.44, 0.07);
  const screenColors: BoxColors = facesViewer(item.facing)
    ? withFront(item, METAL, SCREEN_COLOR[screen])
    : tones('#b3abc9');
  return (
    <g>
      {box(frame(0.06, 0.1, 0.06, 0.8), 0, 12, METAL)}
      {box(frame(0.88, 0.1, 0.06, 0.8), 0, 12, METAL)}
      {box(frame(0.02, 0.04, 0.96, 0.92), 12, 2, WOOD)}
      {box(frame(0.6, 0.18, 0.08, 0.05), 14, 2, METAL)}
      <IsoBox {...monitor} z={16} h={9} colors={screenColors} />
      {/* A laptop beside the monitor, as on the desks of the proposal. */}
      {box(frame(0.1, 0.5, 0.28, 0.2), 14, 0.6, tones('#d6d2e4'))}
      {box(frame(0.1, 0.46, 0.28, 0.04), 14.6, 4, withFront(item, METAL, '#9fe7ff'))}
    </g>
  );
}

function Sofa({ item }: { item: Item }) {
  const frame = frameOf(item);
  const { w } = ITEM_KIND_INFO[item.kind].size;
  const colors = tones(colorOf(item));
  return (
    <g>
      {box(frame(0.04, 0.08, w - 0.08, 0.84), 0, 7, colors)}
      {box(frame(0.04, 0.08, w - 0.08, 0.24), 7, 9, colors)}
      {box(frame(0.04, 0.32, 0.18, 0.6), 7, 4, colors)}
      {box(frame(w - 0.22, 0.32, 0.18, 0.6), 7, 4, colors)}
    </g>
  );
}

function Shelf({ item }: { item: Item }) {
  const frame = frameOf(item);
  const books = ['#ef5b5b', '#3f8cff', '#f3c94e', '#5ec46d', '#8064ff', '#f07bb6'];
  return (
    <g>
      {box(frame(0.06, 0.1, 0.88, 0.8), 0, 36, WOOD_DARK)}
      {[4, 14, 24].map((z, row) =>
        books
          .slice(row, row + 3)
          .map((color, index) => (
            <g key={`${z}-${color}`}>
              {box(frame(0.12 + index * 0.26, 0.82, 0.22, 0.1), z, 7, tones(color))}
            </g>
          )),
      )}
    </g>
  );
}

/** A machine of snacks: a dark body with a lit window of coloured rows. */
function Vending({ item }: { item: Item }) {
  const frame = frameOf(item);
  const snacks = ['#ff7b72', '#ffc24b', '#5fe3a1', '#7cc4ff'];
  return (
    <g>
      {box(frame(0.1, 0.12, 0.8, 0.76), 0, 34, MACHINE)}
      {facesViewer(item.facing) &&
        snacks.map((color, row) => (
          <g key={color}>{box(frame(0.18, 0.86, 0.46, 0.04), 12 + row * 5, 3, tones(color))}</g>
        ))}
      {facesViewer(item.facing) && box(frame(0.7, 0.86, 0.12, 0.04), 16, 6, tones('#b9a8ff'))}
    </g>
  );
}

/** A screen on the wall with a chart, as in the proposal's meeting room. */
function WallTv({ item }: { item: Item }) {
  const frame = frameOf(item);
  const at = pointOf(item);
  const seen = facesViewer(item.facing);
  const chart = [0.18, 0.32, 0.46, 0.6, 0.74, 0.86].map((u, index) => {
    const [x, y] = at(u, 0.1);
    const p = project(x, y, 20 + [2, 5, 4, 8, 7, 10][index]!);
    return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
  });
  return (
    <g>
      {box(frame(0.08, 0.02, 0.84, 0.08), 17, 15, withFront(item, METAL, '#1c2a4a'))}
      {seen && <polyline points={chart.join(' ')} fill="none" stroke="#5fe3ff" strokeWidth="1" />}
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
      return <Chair x={item.x} y={item.y} facing={item.facing} color={item.color} />;
    case 'plant':
      return <Plant item={item} large={false} />;
    case 'plant_large':
      return <Plant item={item} large />;
    case 'sofa':
    case 'armchair':
      return <Sofa item={item} />;
    case 'coffee_table':
      return (
        <g>
          {box(frame(0.45, 0.45, 0.1, 0.1), 0, 6, WOOD_DARK)}
          {box(frame(0.12, 0.12, 0.76, 0.76), 6, 2, WOOD_DARK)}
        </g>
      );
    case 'meeting_table':
      return (
        <g>
          {box(frame(0.3, 0.4, 0.15, 0.2), 0, 11, METAL)}
          {box(frame(2.55, 0.4, 0.15, 0.2), 0, 11, METAL)}
          {box(frame(0.05, 0.1, 2.9, 0.8), 11, 2, WOOD)}
          {box(frame(1.3, 0.35, 0.4, 0.3), 13, 0.6, tones('#2b2840'))}
        </g>
      );
    case 'bookshelf':
      return <Shelf item={item} />;
    case 'counter':
      return (
        <g>
          {box(frame(0, 0.06, 1, 0.88), 0, 12, tones(colorOf(item)))}
          {box(frame(0, 0.02, 1, 0.96), 12, 1.5, WOOD)}
        </g>
      );
    case 'coffee_machine':
      return (
        <g>
          {box(frame(0, 0.06, 1, 0.88), 0, 12, WHITE)}
          {box(frame(0, 0.02, 1, 0.96), 12, 1.5, WOOD)}
          {box(frame(0.25, 0.25, 0.5, 0.45), 13.5, 11, tones('#2f2a45'))}
          {box(frame(0.4, 0.7, 0.2, 0.08), 16, 2, tones('#ff7b72'))}
        </g>
      );
    case 'water_cooler':
      return (
        <g>
          {box(frame(0.26, 0.26, 0.48, 0.48), 0, 16, WHITE)}
          {box(frame(0.3, 0.3, 0.4, 0.4), 16, 10, GLASS)}
        </g>
      );
    case 'bean_bag': {
      const colors = tones(colorOf(item));
      return (
        <g>
          {box(frame(0.12, 0.12, 0.76, 0.76), 0, 5, colors)}
          {box(frame(0.2, 0.15, 0.6, 0.3), 5, 4, colors)}
        </g>
      );
    }
    case 'tv':
      return (
        <g>
          {box(frame(0.1, 0.2, 0.8, 0.6), 0, 8, WOOD_DARK)}
          {box(frame(0.12, 0.42, 0.76, 0.08), 8, 15, withFront(item, METAL, '#4fd1ff'))}
        </g>
      );
    case 'whiteboard':
      return (
        <g>
          {box(frame(0.12, 0.45, 0.06, 0.1), 0, 12, METAL)}
          {box(frame(0.82, 0.45, 0.06, 0.1), 0, 12, METAL)}
          {box(frame(0.06, 0.45, 0.88, 0.08), 12, 16, WHITE)}
        </g>
      );
    case 'mural':
      return box(frame(0.02, 0.35, 1.96, 0.3), 0, 34, GREEN_WALL);
    case 'vending_machine':
      return <Vending item={item} />;
    case 'fridge':
      return (
        <g>
          {box(frame(0.12, 0.14, 0.76, 0.74), 0, 32, SILVER)}
          {facesViewer(item.facing) && box(frame(0.14, 0.88, 0.72, 0.02), 20, 0.8, METAL)}
          {facesViewer(item.facing) && box(frame(0.72, 0.89, 0.06, 0.03), 22, 7, METAL)}
        </g>
      );
    case 'bar_stool':
      return (
        <g>
          {box(frame(0.45, 0.45, 0.1, 0.1), 0, 10, METAL)}
          {box(frame(0.28, 0.28, 0.44, 0.44), 10, 2, tones(colorOf(item)))}
        </g>
      );
    case 'wall_tv':
      return <WallTv item={item} />;
    case 'glass_partition':
      return (
        <g>
          <g opacity="0.45">{box(frame(0, 0.44, 1, 0.12), 0, 30, GLASS)}</g>
          {box(frame(0, 0.44, 1, 0.12), 30, 1.5, WHITE)}
          {box(frame(0, 0.44, 0.06, 0.12), 0, 30, WHITE)}
        </g>
      );
    case 'floor_lamp': {
      const head = project(item.x + 0.5, item.y + 0.5, 30);
      return (
        <g>
          {box(frame(0.4, 0.4, 0.2, 0.2), 0, 1, METAL)}
          {box(frame(0.47, 0.47, 0.06, 0.06), 1, 26, METAL)}
          {box(frame(0.3, 0.3, 0.4, 0.4), 26, 6, tones('#ffe3a3'))}
          <circle cx={head.x} cy={head.y} r="12" fill="#ffe8a3" opacity="0.18" />
        </g>
      );
    }
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
    const colors = tones(colorOf(item));
    return (
      <g>
        <polygon
          points={floorPoints(x + 0.05, y + 0.05, width - 0.1, depth - 0.1, 0.2)}
          fill={colors.left}
          stroke={colors.edge}
          strokeWidth="0.6"
        />
        <polygon
          points={floorPoints(x + 0.25, y + 0.25, width - 0.5, depth - 0.5, 0.3)}
          fill={colors.top}
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
