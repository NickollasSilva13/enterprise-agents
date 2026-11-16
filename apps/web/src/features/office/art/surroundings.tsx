import { entranceOf, hashText, type OfficeLayout, type Surroundings } from '@ea/shared';
import { type ReactNode, useId } from 'react';
import { PixelSprite, type Sprite } from '../../../components/pixel-art/pixels';
import { type BoxColors, floorPoints, IsoBox, points, project } from './iso';

// What is around the office (Phase 15): an upper floor of an office building,
// a house with its yard and street, or a park. All decoration, drawn around
// the grid: nobody walks there. Drawn in four layers so that what stands in
// front of the office covers it and what is behind does not:
//   SurroundingsBack   sky, far away things, the ground around;
//   PerimeterBack      the outer walls behind the office, over its floor;
//   PerimeterFront     the low outer walls in front;
//   SurroundingsFront  trees and lamps in front of the office.

type Layout = Pick<OfficeLayout, 'width' | 'height' | 'surroundings' | 'items'>;

/** A small seeded random source, so the same layout always gets the same trees. */
function seeded(seed: string): () => number {
  let state = hashText(seed) || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 10_000) / 10_000;
  };
}

/** A safe id for `url(#…)` from React's `useId`. */
const useSvgId = (name: string) => `${name}-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

const TREE: Sprite = [
  '........gggggg........',
  '.....gggGGGGGGggg.....',
  '....gGGGGlGGGGGGGg....',
  '...gGGlGGGGGGGlGGGg...',
  '..gGGGGGGGGGGGGGGGGg..',
  '..gGGGGGlGGGGGGGGGGg..',
  '.gGGlGGGGGGGGlGGGGGGg.',
  '.gGGGGGGGGGGGGGGGlGGg.',
  'gGGGGGGGlGGGGGGGGGGGGg',
  'gGGlGGGGGGGGGGlGGGGGGg',
  'gGGGGGGGGGGGGGGGGGGGGg',
  '.gGGGGGlGGGGGGGGGGGGg.',
  '.gGGGGGGGGGGlGGGGGGGg.',
  '..gGGGGGGGGGGGGGGGGg..',
  '...ggGGGGGGGGGGGGgg...',
  '.....gggGGGGGGggg.....',
  '........ggttgg........',
  '.........tttT.........',
  '.........tttT.........',
  '.........tttT.........',
  '.........tttT.........',
  '........ttttTT........',
];

const PINE: Sprite = [
  '......g......',
  '.....gGg.....',
  '....gGlGg....',
  '...gGGGGGg...',
  '....gGGGg....',
  '...gGGlGGg...',
  '..gGGGGGGGg..',
  '...gGGGGGg...',
  '..gGGGlGGGg..',
  '.gGGGGGGGGGg.',
  'gGGGGGlGGGGGg',
  '.....tTt.....',
  '.....tTt.....',
];

const TREE_PALETTE = { g: '#2f7a3d', G: '#4fae4f', l: '#8fdc6a', t: '#7a5233', T: '#5a3b24' };
const FLOWERS_PALETTE = { r: '#ff6f91', y: '#ffd166', w: '#ffffff', v: '#b28dff', g: '#3f9a4e' };
const FLOWERS: Sprite = ['r.y.w.v', '.g.g.g.', 'y.v.r.w', '.g.g.g.'];

const CLOUD: Sprite = [
  '.....wwwww..........',
  '...wwwwwwwww..wwww..',
  '..wwwwwwwwwwwwwwwwww',
  'wwwwwwwwwwwwwwwwwwww',
  '.wwwwwwwwwwwwwwwwww.',
];

/** A sprite standing on a tile point, its bottom middle there, drawn `scale` times its pixels. */
function Standing({
  sprite,
  palette,
  x,
  y,
  scale = 2,
}: {
  sprite: Sprite;
  palette: Record<string, string>;
  x: number;
  y: number;
  scale?: number;
}) {
  const at = project(x, y);
  const width = sprite[0]?.length ?? 0;
  return (
    <g transform={`translate(${Math.round(at.x)} ${Math.round(at.y)}) scale(${scale})`}>
      <PixelSprite
        sprite={sprite}
        palette={palette}
        x={-Math.round(width / 2)}
        y={-sprite.length}
      />
    </g>
  );
}

/** How far around the office each kind of surroundings goes, in tiles. */
const MARGIN: Record<Surroundings, number> = { building: 0, house: 6, park: 8 };

const SKY: Record<Surroundings, readonly [string, string]> = {
  building: ['#1f1a4a', '#7a64c9'],
  house: ['#7fb8f0', '#d6ebff'],
  park: ['#86c5e8', '#e3f4ff'],
};

function Sky({ layout }: { layout: Layout }) {
  const id = useSvgId('sky');
  const [top, bottom] = SKY[layout.surroundings];
  const { width, height } = layout;
  // Far enough to fill any view of the office.
  const left = project(-40, height + 40).x;
  const right = project(width + 40, -40).x;
  const upper = project(-40, -40, 400).y;
  const lower = project(width + 40, height + 40).y;
  const random = seeded(`sky-${layout.surroundings}`);
  return (
    <g>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={top} />
          <stop offset="1" stopColor={bottom} />
        </linearGradient>
      </defs>
      <rect x={left} y={upper} width={right - left} height={lower - upper} fill={`url(#${id})`} />
      {layout.surroundings === 'building'
        ? Array.from({ length: 40 }, (_, index) => {
            const at = project(
              -20 + random() * (width + 40),
              -20 + random() * 10,
              120 + random() * 200,
            );
            return (
              <rect
                key={index}
                x={at.x}
                y={at.y}
                width="1.5"
                height="1.5"
                fill="#fff6c9"
                opacity={0.4 + random() * 0.6}
              />
            );
          })
        : Array.from({ length: 6 }, (_, index) => {
            const at = project(
              -6 + random() * (width + 6),
              -8 - random() * 6,
              140 + random() * 120,
            );
            return (
              <PixelSprite
                key={index}
                sprite={CLOUD}
                palette={{ w: '#ffffff' }}
                x={Math.round(at.x)}
                y={Math.round(at.y)}
              />
            );
          })}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Building

const TOWER_COLORS: BoxColors[] = [
  { top: '#3a3170', left: '#2a2357', right: '#211b47' },
  { top: '#40377a', left: '#302864', right: '#251f50' },
  { top: '#352d68', left: '#29224f', right: '#1d183f' },
];

/** Lit and dark windows on the two faces of a box. */
function Windows({
  x,
  y,
  w,
  d,
  z,
  h,
  seed,
}: {
  x: number;
  y: number;
  w: number;
  d: number;
  z: number;
  h: number;
  seed: string;
}) {
  const random = seeded(seed);
  const lights: ReactNode[] = [];
  for (let level = z + 8; level < z + h - 6; level += 10) {
    for (let step = 0.25; step < w; step += 0.5) {
      const at = project(x + step, y + d, level);
      lights.push(
        <rect
          key={`l${level}-${step}`}
          x={at.x - 2}
          y={at.y - 4}
          width="4"
          height="5"
          fill={random() < 0.45 ? '#ffd98a' : '#2b2552'}
        />,
      );
    }
    for (let step = 0.25; step < d; step += 0.5) {
      const at = project(x + w, y + step, level);
      lights.push(
        <rect
          key={`r${level}-${step}`}
          x={at.x - 2}
          y={at.y - 4}
          width="4"
          height="5"
          fill={random() < 0.35 ? '#f4c66f' : '#231e47'}
        />,
      );
    }
  }
  return <g>{lights}</g>;
}

function City({ layout }: { layout: Layout }) {
  const random = seeded('city');
  const towers: ReactNode[] = [];
  const { width, height } = layout;
  // Behind the office: a row beyond its back corner on each side.
  const spots: [number, number][] = [];
  for (let x = -10; x < width + 4; x += 4) spots.push([x, -12 - Math.floor(random() * 4)]);
  for (let y = -6; y < height + 4; y += 4) spots.push([-12 - Math.floor(random() * 4), y]);
  spots.forEach(([x, y], index) => {
    const w = 2 + Math.floor(random() * 2);
    const d = 2 + Math.floor(random() * 2);
    const h = 80 + Math.floor(random() * 160);
    const colors = TOWER_COLORS[index % TOWER_COLORS.length] as BoxColors;
    towers.push(
      <g key={`${x},${y}`}>
        <IsoBox x={x} y={y} w={w} d={d} z={-160} h={h + 160} colors={colors} />
        <Windows x={x} y={y} w={w} d={d} z={-40} h={h + 40} seed={`${x},${y}`} />
      </g>,
    );
  });
  // Farther towers first, so nearer ones cover them.
  return <g>{towers.reverse()}</g>;
}

/** The floors below this one: the building's facade going down out of view. */
function Facade({ layout }: { layout: Layout }) {
  const { width, height } = layout;
  const colors: BoxColors = { top: '#4d417f', left: '#5b4d96', right: '#483c7c' };
  const bands: ReactNode[] = [];
  for (let level = -24; level > -200; level -= 30) {
    bands.push(
      <polygon
        key={`l${level}`}
        points={points([
          [0, height, level],
          [width, height, level],
          [width, height, level - 16],
          [0, height, level - 16],
        ])}
        fill="#9fd2ff"
        opacity="0.55"
      />,
      <polygon
        key={`r${level}`}
        points={points([
          [width, 0, level],
          [width, height, level],
          [width, height, level - 16],
          [width, 0, level - 16],
        ])}
        fill="#86bfef"
        opacity="0.5"
      />,
    );
  }
  return (
    <g>
      <IsoBox x={0} y={0} w={width} d={height} z={-210} h={200} colors={colors} />
      {bands}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Ground around a house or in a park

function Lawn({ layout, color, line }: { layout: Layout; color: string; line: string }) {
  const margin = MARGIN[layout.surroundings];
  const { width, height } = layout;
  const random = seeded(`lawn-${layout.surroundings}`);
  const tufts: ReactNode[] = [];
  for (let index = 0; index < 160; index += 1) {
    const x = -margin + random() * (width + 2 * margin);
    const y = -margin + random() * (height + 2 * margin);
    if (x > -0.5 && x < width + 0.5 && y > -0.5 && y < height + 0.5) continue;
    const at = project(x, y);
    tufts.push(<rect key={index} x={at.x} y={at.y - 1} width="2" height="1" fill={line} />);
  }
  return (
    <g>
      <IsoBox
        x={-margin}
        y={-margin}
        w={width + 2 * margin}
        d={height + 2 * margin}
        z={-14}
        h={10}
        colors={{ top: color, left: '#6b4b32', right: '#573c28' }}
      />
      {tufts}
    </g>
  );
}

/** A path of tiles at ground level, from one tile to another along x then y. */
function Path({
  from,
  to,
  color,
}: {
  from: [number, number];
  to: [number, number];
  color: string;
}) {
  const [ax, ay] = from;
  const [bx, by] = to;
  return (
    <g>
      <polygon
        points={floorPoints(Math.min(ax, bx), ay, Math.abs(bx - ax) + 1, 1, -3.7)}
        fill={color}
      />
      <polygon
        points={floorPoints(bx, Math.min(ay, by), 1, Math.abs(by - ay) + 1, -3.7)}
        fill={color}
      />
    </g>
  );
}

function Street({ layout }: { layout: Layout }) {
  const margin = MARGIN.house;
  const { width, height } = layout;
  const y = height + margin;
  const dashes: ReactNode[] = [];
  for (let x = -margin; x < width + margin; x += 2) {
    dashes.push(
      <polygon key={x} points={floorPoints(x + 0.3, y + 2.4, 1, 0.2, -3.5)} fill="#f5e7a1" />,
    );
  }
  return (
    <g>
      <IsoBox
        x={-margin - 2}
        y={y}
        w={width + 2 * margin + 4}
        d={1}
        z={-14}
        h={11}
        colors={{ top: '#cfc6d9', left: '#a59cb3', right: '#938aa3' }}
      />
      <IsoBox
        x={-margin - 2}
        y={y + 1}
        w={width + 2 * margin + 4}
        d={4}
        z={-14}
        h={10}
        colors={{ top: '#4a4458', left: '#3a3546', right: '#302c3a' }}
      />
      {dashes}
    </g>
  );
}

function Fence({ layout, front }: { layout: Layout; front: boolean }) {
  const margin = MARGIN.house;
  const { width, height } = layout;
  const posts: ReactNode[] = [];
  const colors: BoxColors = { top: '#fbf7ee', left: '#e7dfcf', right: '#d3c9b6' };
  const gate = entranceOf(layout)?.x ?? -1;
  if (!front) {
    for (let x = -margin; x < width + margin; x += 0.5)
      posts.push(
        <IsoBox key={`n${x}`} x={x} y={-margin} w={0.12} d={0.12} z={-4} h={12} colors={colors} />,
      );
    for (let y = -margin; y < height + margin; y += 0.5)
      posts.push(
        <IsoBox key={`w${y}`} x={-margin} y={y} w={0.12} d={0.12} z={-4} h={12} colors={colors} />,
      );
  } else {
    for (let x = -margin; x < width + margin; x += 0.5) {
      if (Math.abs(x - gate - 0.25) < 1) continue;
      posts.push(
        <IsoBox
          key={`s${x}`}
          x={x}
          y={height + margin - 0.12}
          w={0.12}
          d={0.12}
          z={-4}
          h={12}
          colors={colors}
        />,
      );
    }
    for (let y = -margin; y < height + margin; y += 0.5)
      posts.push(
        <IsoBox
          key={`e${y}`}
          x={width + margin - 0.12}
          y={y}
          w={0.12}
          d={0.12}
          z={-4}
          h={12}
          colors={colors}
        />,
      );
  }
  return <g>{posts}</g>;
}

function Pond({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <polygon points={floorPoints(x, y, 4, 3, -3.6)} fill="#e8d9a8" />
      <polygon points={floorPoints(x + 0.25, y + 0.25, 3.5, 2.5, -3.4)} fill="#4f9bd9" />
      <polygon
        points={floorPoints(x + 0.8, y + 0.7, 1.2, 0.5, -3.3)}
        fill="#9fd2ff"
        opacity="0.8"
      />
    </g>
  );
}

function Bench({ x, y }: { x: number; y: number }) {
  const wood: BoxColors = { top: '#c08a5c', left: '#9c6e46', right: '#80583a' };
  return (
    <g>
      <IsoBox x={x} y={y + 0.3} w={1.2} d={0.4} z={-4} h={6} colors={wood} />
      <IsoBox x={x} y={y + 0.2} w={1.2} d={0.1} z={2} h={6} colors={wood} />
    </g>
  );
}

function Lamp({ x, y }: { x: number; y: number }) {
  const head = project(x + 0.05, y + 0.05, 34);
  return (
    <g>
      <IsoBox
        x={x}
        y={y}
        w={0.1}
        d={0.1}
        z={-4}
        h={36}
        colors={{ top: '#3a3350', left: '#2b2540', right: '#211c33' }}
      />
      <circle cx={head.x} cy={head.y} r="3" fill="#ffe8a3" />
      <circle cx={head.x} cy={head.y} r="7" fill="#ffe8a3" opacity="0.25" />
    </g>
  );
}

/** Trees, bushes and lamps around the office: behind it (`front` false) or in front. */
function Greenery({ layout, front }: { layout: Layout; front: boolean }) {
  const margin = MARGIN[layout.surroundings];
  const { width, height } = layout;
  const random = seeded(`green-${layout.surroundings}`);
  const things: { x: number; y: number; node: ReactNode }[] = [];
  const count = layout.surroundings === 'park' ? 60 : 36;
  for (let index = 0; index < count; index += 1) {
    const x = -margin + 0.5 + random() * (width + 2 * margin - 1);
    const y = -margin + 0.5 + random() * (height + 2 * margin - 1);
    // Keep clear of the office and of the paths in front of it.
    if (x > -1.5 && x < width + 1.5 && y > -1.5 && y < height + 1.5) continue;
    const kind = random();
    const node =
      kind < 0.55 ? (
        <Standing sprite={TREE} palette={TREE_PALETTE} x={x} y={y} />
      ) : kind < 0.8 ? (
        <Standing sprite={PINE} palette={TREE_PALETTE} x={x} y={y} />
      ) : (
        <Standing sprite={FLOWERS} palette={FLOWERS_PALETTE} x={x} y={y} />
      );
    things.push({ x, y, node });
  }
  if (layout.surroundings === 'park') {
    for (const [x, y] of [
      [-3, height + 2],
      [width + 2, -3],
      [width + 2, height + 3],
    ] as const) {
      things.push({ x, y, node: <Lamp x={x} y={y} /> });
    }
    things.push({
      x: width + 3,
      y: Math.floor(height / 2),
      node: <Bench x={width + 3} y={Math.floor(height / 2)} />,
    });
    things.push({ x: 2, y: height + 4, node: <Bench x={2} y={height + 4} /> });
  }
  // In front of the office means past its front edges; draw from the back.
  const isFront = (thing: { x: number; y: number }) => thing.x >= width || thing.y >= height;
  return (
    <g>
      {things
        .filter((thing) => isFront(thing) === front)
        .sort((a, b) => a.x + a.y - (b.x + b.y))
        .map((thing, index) => (
          <g key={index}>{thing.node}</g>
        ))}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Layers

export function SurroundingsBack({ layout }: { layout: Layout }) {
  const { width, height, surroundings } = layout;
  const entrance = entranceOf(layout);
  return (
    <g data-surroundings={surroundings} aria-hidden>
      <Sky layout={layout} />
      {surroundings === 'building' && (
        <>
          <City layout={layout} />
          <Facade layout={layout} />
        </>
      )}
      {surroundings === 'house' && (
        <>
          <Lawn layout={layout} color="#76c25e" line="#5ea94a" />
          <Street layout={layout} />
          <Fence layout={layout} front={false} />
          {entrance && (
            <Path
              from={[entrance.x, height]}
              to={[entrance.x, height + MARGIN.house - 1]}
              color="#d8cbb0"
            />
          )}
        </>
      )}
      {surroundings === 'park' && (
        <>
          <Lawn layout={layout} color="#6cbf6a" line="#54a556" />
          <polygon points={floorPoints(-2, -2, width + 4, height + 4, -3.8)} fill="#e6d6a8" />
          {entrance && (
            <Path
              from={[entrance.x, height]}
              to={[entrance.x, height + MARGIN.park - 1]}
              color="#e6d6a8"
            />
          )}
          <Pond x={-MARGIN.park + 1} y={height + 2} />
        </>
      )}
      {surroundings !== 'building' && <Greenery layout={layout} front={false} />}
    </g>
  );
}

const GLASS: BoxColors = { top: '#5f74b8', left: '#b9d8f5', right: '#a3c6ea' };
const MULLION: BoxColors = { top: '#6b5c9e', left: '#5a4c8a', right: '#4a3e76' };
const HOUSE_WALL: BoxColors = { top: '#a8473b', left: '#f1e4cf', right: '#dccbb0' };

/** The outer walls behind the office, along its back edges. */
export function PerimeterBack({ layout }: { layout: Layout }) {
  const { width, height, surroundings } = layout;
  const wall = (key: string, x: number, y: number, w: number, d: number) => {
    if (surroundings === 'house') {
      return (
        <g key={key}>
          <IsoBox x={x} y={y} w={w} d={d} h={42} colors={HOUSE_WALL} />
          {/* A window every other tile, on the face toward the room. */}
          {(w > d ? Math.floor(x) % 2 === 0 : Math.floor(y) % 2 === 0) && (
            <polygon
              points={
                w > d
                  ? points([
                      [x + 0.2, y + d, 14],
                      [x + 0.8, y + d, 14],
                      [x + 0.8, y + d, 32],
                      [x + 0.2, y + d, 32],
                    ])
                  : points([
                      [x + w, y + 0.2, 14],
                      [x + w, y + 0.8, 14],
                      [x + w, y + 0.8, 32],
                      [x + w, y + 0.2, 32],
                    ])
              }
              fill="#a9d6ff"
              stroke="#ffffff"
              strokeWidth="1"
            />
          )}
        </g>
      );
    }
    const tall = surroundings === 'building' ? 48 : 30;
    return (
      <g key={key}>
        <g opacity="0.5">
          <IsoBox x={x} y={y} w={w} d={d} h={tall} colors={GLASS} />
        </g>
        <IsoBox x={x} y={y} w={Math.min(w, 0.06)} d={Math.min(d, 0.06)} h={tall} colors={MULLION} />
        <IsoBox x={x} y={y} w={w} d={d} z={tall} h={2} colors={MULLION} />
      </g>
    );
  };
  const walls: ReactNode[] = [wall('corner', -0.14, -0.14, 0.14, 0.14)];
  for (let x = 0; x < width; x += 1) walls.push(wall(`n${x}`, x, -0.14, 1, 0.14));
  for (let y = 0; y < height; y += 1) walls.push(wall(`w${y}`, -0.14, y, 0.14, 1));
  return <g aria-hidden>{walls}</g>;
}

/** The low outer walls or rails in front of the office. */
export function PerimeterFront({ layout }: { layout: Layout }) {
  const { width, height, surroundings } = layout;
  const entrance = entranceOf(layout);
  const colors = surroundings === 'house' ? HOUSE_WALL : MULLION;
  const low = surroundings === 'house' ? 6 : 4;
  const rails: ReactNode[] = [];
  for (let x = 0; x < width; x += 1) {
    if (surroundings !== 'building' && entrance && x === entrance.x) continue;
    rails.push(<IsoBox key={`s${x}`} x={x} y={height} w={1} d={0.14} h={low} colors={colors} />);
  }
  for (let y = 0; y < height; y += 1)
    rails.push(<IsoBox key={`e${y}`} x={width} y={y} w={0.14} d={1} h={low} colors={colors} />);
  return <g aria-hidden>{rails}</g>;
}

export function SurroundingsFront({ layout }: { layout: Layout }) {
  if (layout.surroundings === 'building') return null;
  return (
    <g aria-hidden>
      {layout.surroundings === 'house' && <Fence layout={layout} front />}
      <Greenery layout={layout} front />
    </g>
  );
}
