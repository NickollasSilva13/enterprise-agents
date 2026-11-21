import { entranceOf, hashText, type OfficeLayout, type Surroundings } from '@ea/shared';
import { type ReactNode, useId } from 'react';
import { PixelSprite, type Sprite } from '../../../components/pixel-art/pixels';
import { mix } from '../../../components/pixel-art/shade';
import { skyAt, windowLit } from '../daylight';
import { WALL_HEIGHT } from './architecture';
import { Foliage, Tree } from './foliage';
import { type BoxColors, floorPoints, IsoBox, points, project, tones } from './iso';

// What is around the office (Phase 15): an upper floor of an office building,
// a house with its yard and street, or a park. All decoration, drawn around
// the grid: nobody walks there. Drawn in four layers so that what stands in
// front of the office covers it and what is behind does not:
//   SurroundingsBack   sky, far away things, the ground around;
//   PerimeterBack      the outer walls behind the office, over its floor;
//   PerimeterFront     the low outer walls in front;
//   SurroundingsFront  trees and lamps in front of the office.
// Since Phase 23 the building is a glass floor floating over a city at night,
// as in the proposal, and everything follows the clock (`light`, 0 at night
// and 1 by day, from daylight.ts).

type SceneLayout = Pick<OfficeLayout, 'width' | 'height' | 'surroundings' | 'items' | 'areas'>;

/**
 * The surroundings drawn in 2D (Phase 15). One added later for the 3D scene
 * is drawn here as the nearest of these, for browsers without WebGL (Phase
 * 35, D8 of Phase 33): the modern condominium as the residential street; the
 * tropical island and the technological garden (Phase 36) as the park.
 */
type Drawn = 'building' | 'house' | 'park';
const DRAWN: Record<Surroundings, Drawn> = {
  building: 'building',
  house: 'house',
  park: 'park',
  condo: 'house',
  island: 'park',
  techGarden: 'park',
};
type Layout = Omit<SceneLayout, 'surroundings'> & { readonly surroundings: Drawn };
const drawnOf = (layout: SceneLayout): Layout => ({
  ...layout,
  surroundings: DRAWN[layout.surroundings],
});

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

const CLOUD: Sprite = [
  '.....wwwww..........',
  '...wwwwwwwww..wwww..',
  '..wwwwwwwwwwwwwwwwww',
  'wwwwwwwwwwwwwwwwwwww',
  '.wwwwwwwwwwwwwwwwww.',
];

/** How far around the office each kind of surroundings goes, in tiles. */
const MARGIN: Record<Drawn, number> = { building: 0, house: 6, park: 8 };

const DAY_SKY: Record<Drawn, { top: string; bottom: string }> = {
  building: { top: '#7fb6ef', bottom: '#dcecff' },
  house: { top: '#7fb8f0', bottom: '#d6ebff' },
  park: { top: '#86c5e8', bottom: '#e3f4ff' },
};

function Sky({ layout, light }: { layout: Layout; light: number }) {
  const id = useSvgId('sky');
  const { top, bottom } = skyAt(light, undefined, DAY_SKY[layout.surroundings]);
  const { width, height } = layout;
  // Far enough to fill any view of the office.
  const left = project(-60, height + 60).x;
  const right = project(width + 60, -60).x;
  const upper = project(-60, -60, 500).y;
  const lower = project(width + 60, height + 60).y;
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
      {/* Stars at night, clouds by day. */}
      {Array.from({ length: 50 }, (_, index) => {
        const at = project(
          -30 + random() * (width + 60),
          -30 + random() * 12,
          160 + random() * 260,
        );
        return (
          <rect
            key={`s${index}`}
            x={at.x}
            y={at.y}
            width="1.5"
            height="1.5"
            fill="#fff6c9"
            opacity={(0.3 + random() * 0.6) * (1 - light)}
          />
        );
      })}
      {light > 0.3 &&
        Array.from({ length: 6 }, (_, index) => {
          const at = project(-6 + random() * (width + 6), -8 - random() * 6, 160 + random() * 140);
          return (
            <g key={`c${index}`} opacity={light}>
              <PixelSprite
                sprite={CLOUD}
                palette={{ w: '#ffffff' }}
                x={Math.round(at.x)}
                y={Math.round(at.y)}
              />
            </g>
          );
        })}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Building

/** How far below the floor the ground is: the office is the top of a building. */
const GROUND = -46;
/** The thickness of the floor, lit by two neon lines as in the proposal. */
const SLAB = 26;

const TOWER_NIGHT = ['#2a2358', '#30286a', '#382e78', '#2f2766'];
const TOWER_DAY = ['#9ba7cf', '#8794c4', '#7d8bc0', '#90a0cc'];

interface Tower {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly d: number;
  readonly h: number;
  readonly tone: number;
  readonly crown: 'neon' | 'antenna' | 'box';
  /** 0 for the nearest ring, 1 and 2 farther: farther towers fade into the sky. */
  readonly depth: number;
}

/** Each ring of towers: how far from the office, how far apart, how tall. */
const RINGS = [
  { gap: 6, step: 9, low: 70, high: 70 },
  { gap: 14, step: 7, low: 120, high: 90 },
  { gap: 24, step: 7, low: 170, high: 110 },
] as const;

/** How much each ring fades into the colour of the horizon. */
const HAZE = [0, 0.45, 0.75];

/**
 * The towers around the office, as in the proposal: a few close ones with
 * room between them, more behind, and the farthest fading into the sky, so
 * the city gives depth without crowding the office.
 */
function towersOf(layout: Layout): Tower[] {
  const { width, height } = layout;
  const random = seeded('towers');
  const towers: Tower[] = [];
  RINGS.forEach((ring, depth) => {
    const add = (x: number, y: number) => {
      // Leave a gap now and then, so the rings do not read as walls.
      if (random() < 0.35) return;
      towers.push({
        x,
        y,
        w: 2 + Math.floor(random() * 2),
        d: 2 + Math.floor(random() * 2),
        h: ring.low + Math.floor(random() * ring.high),
        tone: Math.floor(random() * TOWER_NIGHT.length),
        crown: (['neon', 'antenna', 'box'] as const)[Math.floor(random() * 3)] ?? 'box',
        depth,
      });
    };
    const edge = -ring.gap - 3;
    const jitter = () => Math.floor(random() * 3);
    for (let x = edge; x < width + ring.gap / 2; x += ring.step + jitter()) add(x, edge - jitter());
    for (let y = edge + ring.step; y < height + ring.gap / 2; y += ring.step + jitter())
      add(edge - jitter(), y);
  });
  // From the farthest to the nearest, so nearer towers cover the others.
  return towers.sort((a, b) => a.x + a.y - (b.x + b.y));
}

/**
 * The windows of a tower in a grid, floor by floor, drawn on its two faces in
 * perspective, lit or not by the hour (D3); one path per colour.
 */
function towerWindows(tower: Tower, light: number): { lit: string; dark: string } {
  const random = seeded(`w${tower.x},${tower.y}`);
  const lit: string[] = [];
  const dark: string[] = [];
  const quad = (corners: [number, number, number][]) =>
    `M${corners
      .map(([x, y, z]) => {
        const p = project(x, y, z);
        return `${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
      })
      .join('L')}z`;
  for (let z = GROUND + 10; z < GROUND + tower.h - 10; z += 9) {
    // A floor is lit or dark as a whole now and then, as offices are.
    const floorBias = random() < 0.25 ? 0.3 : 0;
    for (let u = 0.15; u + 0.3 <= tower.w; u += 0.5) {
      const corners: [number, number, number][] = [
        [tower.x + u, tower.y + tower.d, z],
        [tower.x + u + 0.3, tower.y + tower.d, z],
        [tower.x + u + 0.3, tower.y + tower.d, z + 5],
        [tower.x + u, tower.y + tower.d, z + 5],
      ];
      (windowLit(Math.min(0.99, random() + floorBias), light) ? lit : dark).push(quad(corners));
    }
    for (let v = 0.15; v + 0.3 <= tower.d; v += 0.5) {
      const corners: [number, number, number][] = [
        [tower.x + tower.w, tower.y + v, z],
        [tower.x + tower.w, tower.y + v + 0.3, z],
        [tower.x + tower.w, tower.y + v + 0.3, z + 5],
        [tower.x + tower.w, tower.y + v, z + 5],
      ];
      (windowLit(Math.min(0.99, random() + floorBias), light) ? lit : dark).push(quad(corners));
    }
  }
  return { lit: lit.join(''), dark: dark.join('') };
}

function City({ layout, light }: { layout: Layout; light: number }) {
  const neon = useSvgId('city-neon');
  const horizon = skyAt(light, undefined, DAY_SKY.building).bottom;
  return (
    <g>
      <defs>
        <filter id={neon} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.5" />
        </filter>
      </defs>
      {/* The ground reaches the horizon, under the towers. */}
      <polygon
        points={floorPoints(-60, -60, layout.width + 120, layout.height + 120, GROUND)}
        fill={mix(mix('#1d1840', '#8fa3c4', light), horizon, 0.3)}
      />
      {towersOf(layout).map((tower) => {
        const haze = HAZE[tower.depth] ?? 0;
        const colors = tones(
          mix(mix(TOWER_NIGHT[tower.tone]!, TOWER_DAY[tower.tone]!, light), horizon, haze),
        );
        const windows = towerWindows(tower, light);
        const top = GROUND + tower.h;
        const roof = points([
          [tower.x, tower.y + tower.d, top],
          [tower.x + tower.w, tower.y + tower.d, top],
          [tower.x + tower.w, tower.y, top],
        ]);
        const mast = project(tower.x + tower.w / 2, tower.y + tower.d / 2, top + 22);
        return (
          <g key={`${tower.x},${tower.y}`}>
            <IsoBox
              x={tower.x}
              y={tower.y}
              w={tower.w}
              d={tower.d}
              z={GROUND}
              h={tower.h}
              colors={{ ...colors, edge: undefined }}
            />
            <g opacity={1 - haze}>
              <path d={windows.dark} fill={mix('#231e47', '#c9d6f2', light * 0.6)} />
              <path d={windows.lit} fill="#ffd98a" />
            </g>
            {tower.crown === 'neon' && (
              <g opacity={(1 - light * 0.7) * (1 - haze * 0.6)}>
                <polyline
                  points={roof}
                  fill="none"
                  stroke="#b98cff"
                  strokeWidth="4"
                  filter={`url(#${neon})`}
                />
                <polyline points={roof} fill="none" stroke="#e7d9ff" strokeWidth="1" />
              </g>
            )}
            {tower.crown === 'box' && (
              <IsoBox
                x={tower.x + tower.w * 0.3}
                y={tower.y + tower.d * 0.3}
                w={tower.w * 0.4}
                d={tower.d * 0.4}
                z={top}
                h={10}
                colors={{ ...colors, edge: undefined }}
              />
            )}
            {tower.crown === 'antenna' && (
              <g>
                <IsoBox
                  x={tower.x + tower.w / 2 - 0.05}
                  y={tower.y + tower.d / 2 - 0.05}
                  w={0.1}
                  d={0.1}
                  z={top}
                  h={22}
                  colors={{ ...colors, edge: undefined }}
                />
                <circle cx={mast.x} cy={mast.y} r="1.6" fill="#ff7b9c" opacity={1 - light * 0.5} />
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
}

/**
 * Under the office: the ground close around the building, with trees in
 * volume, lamps, and a lilac glow under the floor, stronger at night.
 */
function Underneath({ layout, light }: { layout: Layout; light: number }) {
  const { width, height } = layout;
  const centre = project(width / 2, height / 2, GROUND);
  const glow = useSvgId('glow');
  return (
    <g>
      <polygon
        points={floorPoints(-6, -6, width + 12, height + 12, GROUND)}
        fill={mix('#151030', '#5f8f63', light)}
      />
      <defs>
        <radialGradient id={glow}>
          <stop offset="0" stopColor="#a77bff" stopOpacity={0.6 - light * 0.4} />
          <stop offset="1" stopColor="#a77bff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse
        cx={centre.x}
        cy={centre.y}
        rx={(width + height) * 10}
        ry={(width + height) * 4.5}
        fill={`url(#${glow})`}
      />
    </g>
  );
}

/**
 * Trees around the foot of the building, in front of it: behind a building
 * this tall they would not be seen.
 */
function GroundTrees({ layout, light }: { layout: Layout; light: number }) {
  const { width, height } = layout;
  const random = seeded('under');
  const trees: { x: number; y: number; size: number }[] = [];
  const spot = (x: number, y: number) => trees.push({ x, y, size: 1.1 + random() * 0.8 });
  for (let x = -2; x < width + 3; x += 2 + random() * 2) spot(x, height + 2.2 + random() * 1.5);
  for (let y = -2; y < height + 3; y += 2 + random() * 2) spot(width + 2.2 + random() * 1.5, y);
  return (
    <g>
      {trees
        .sort((a, b) => a.x + a.y - (b.x + b.y))
        .map((tree, index) => (
          <Tree key={index} x={tree.x} y={tree.y} z={GROUND} size={tree.size} dusk={1 - light} />
        ))}
    </g>
  );
}

/** The thick floor of the building, dark, as the top of a tower. */
function Platform({ layout }: { layout: Layout }) {
  const { width, height } = layout;
  return (
    <IsoBox
      x={0}
      y={0}
      w={width}
      d={height}
      z={-SLAB}
      h={SLAB - 10}
      colors={{ top: '#3d2f72', left: '#2b2156', right: '#211a46', edge: '#140f30' }}
    />
  );
}

/** The two neon lines along the front of the floor, glowing at night (proposal). */
function NeonEdge({ layout, light }: { layout: Layout; light: number }) {
  const blur = useSvgId('neon');
  const { width, height } = layout;
  const line = (z: number) =>
    points([
      [0, height, z],
      [width, height, z],
      [width, 0, z],
    ]);
  const opacity = 1 - light * 0.6;
  return (
    <g opacity={opacity}>
      <defs>
        <filter id={blur} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>
      {[-10, -SLAB].map((z) => (
        <g key={z}>
          <polyline
            points={line(z)}
            fill="none"
            stroke="#b98cff"
            strokeWidth="6"
            filter={`url(#${blur})`}
          />
          <polyline points={line(z)} fill="none" stroke="#e7d9ff" strokeWidth="1.2" />
        </g>
      ))}
    </g>
  );
}

/** Steps down from the entrance to the ground, in front of the floor. */
function Steps({ layout }: { layout: Layout }) {
  const entrance = entranceOf(layout);
  if (!entrance) return null;
  const { height } = layout;
  const colors = tones('#3a2d6e');
  const count = 6;
  return (
    <g>
      {Array.from({ length: count }, (_, step) => (
        <IsoBox
          key={step}
          x={entrance.x - 0.4}
          y={height + 0.1 + step * 0.45}
          w={1.8}
          d={0.45}
          z={GROUND}
          h={-GROUND - 10 - (step * (-GROUND - 10)) / count}
          colors={colors}
        />
      ))}
    </g>
  );
}

/** The panel with the product's mark, large, on the back wall over the reception. */
function LogoPanel({ layout, light }: { layout: Layout; light: number }) {
  const reception = layout.areas.find((area) => area.kind === 'reception');
  const x = reception ? reception.x + reception.width / 2 : layout.width / 2;
  const face = (x0: number, x1: number, z0: number, z1: number) =>
    points([
      [x0, 0.02, z0],
      [x1, 0.02, z0],
      [x1, 0.02, z1],
      [x0, 0.02, z1],
    ]);
  const mark = '#cdb8ff';
  return (
    <g>
      <polygon
        points={face(x - 1.4, x + 1.4, 12, 58)}
        fill="#21194a"
        stroke="#120d2b"
        strokeWidth="0.8"
      />
      <g opacity={0.65 + (1 - light) * 0.35}>
        <polygon
          points={face(x - 0.8, x + 0.8, 20, 50)}
          fill="none"
          stroke={mark}
          strokeWidth="2"
        />
        <polygon points={face(x - 0.03, x + 0.03, 20, 50)} fill={mark} />
        <polygon points={face(x - 0.8, x + 0.8, 34.4, 35.6)} fill={mark} />
        <polygon points={face(x + 0.15, x + 0.65, 38, 47)} fill="#8467ff" />
      </g>
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
function Greenery({ layout, front, light }: { layout: Layout; front: boolean; light: number }) {
  const dusk = 1 - light;
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
    // Trees and bushes in volume, as everything else in the scene (Phase 23).
    const node =
      kind < 0.55 ? (
        <Tree x={x} y={y} z={-4} size={1.5} dusk={dusk} />
      ) : kind < 0.8 ? (
        <Tree x={x} y={y} z={-4} size={1.1} dusk={dusk} />
      ) : (
        <Foliage x={x} y={y} z={-4} size={0.5} dusk={dusk} />
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

export function SurroundingsBack({ layout: scene, light }: { layout: SceneLayout; light: number }) {
  const layout = drawnOf(scene);
  const { width, height, surroundings } = layout;
  const entrance = entranceOf(layout);
  return (
    <g data-surroundings={scene.surroundings} data-light={light.toFixed(2)} aria-hidden>
      <Sky layout={layout} light={light} />
      {surroundings === 'building' && (
        <>
          <City layout={layout} light={light} />
          <Underneath layout={layout} light={light} />
          <Platform layout={layout} />
          <Steps layout={layout} />
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
      {surroundings !== 'building' && <Greenery layout={layout} front={false} light={light} />}
    </g>
  );
}

const GLASS: BoxColors = { top: '#cfe2fb', left: '#bcd5f7', right: '#a9c4ee' };
const MULLION: BoxColors = tones('#eeeaf8');
const HOUSE_WALL: BoxColors = { top: '#a8473b', left: '#f1e4cf', right: '#dccbb0' };

/** The outer walls behind the office, along its back edges. */
export function PerimeterBack({ layout: scene, light }: { layout: SceneLayout; light: number }) {
  const layout = drawnOf(scene);
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
    const tall = surroundings === 'building' ? WALL_HEIGHT + 8 : 30;
    return (
      <g key={key}>
        <g opacity="0.32">
          <IsoBox x={x} y={y} w={w} d={d} h={tall} colors={GLASS} />
        </g>
        {Math.round(x + y) % 3 === 0 && (
          <IsoBox x={x} y={y} w={Math.min(w, 0.1)} d={Math.min(d, 0.1)} h={tall} colors={MULLION} />
        )}
        <IsoBox x={x} y={y} w={w} d={d} z={tall} h={2} colors={MULLION} />
      </g>
    );
  };
  const walls: ReactNode[] = [wall('corner', -0.14, -0.14, 0.14, 0.14)];
  for (let x = 0; x < width; x += 1) walls.push(wall(`n${x}`, x, -0.14, 1, 0.14));
  for (let y = 0; y < height; y += 1) walls.push(wall(`w${y}`, -0.14, y, 0.14, 1));
  return (
    <g aria-hidden>
      {walls}
      {surroundings === 'building' && <LogoPanel layout={layout} light={light} />}
    </g>
  );
}

/** The low outer walls or rails in front of the office. */
export function PerimeterFront({ layout: scene }: { layout: SceneLayout }) {
  const layout = drawnOf(scene);
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

export function SurroundingsFront({
  layout: scene,
  light,
}: {
  layout: SceneLayout;
  light: number;
}) {
  const layout = drawnOf(scene);
  if (layout.surroundings === 'building')
    return (
      <g aria-hidden>
        <NeonEdge layout={layout} light={light} />
        <GroundTrees layout={layout} light={light} />
      </g>
    );
  return (
    <g aria-hidden>
      {layout.surroundings === 'house' && <Fence layout={layout} front />}
      <Greenery layout={layout} front light={light} />
    </g>
  );
}
