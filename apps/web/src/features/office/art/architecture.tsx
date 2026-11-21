import {
  AREA_KIND_INFO,
  type Floor,
  type OfficeArea,
  type OfficeLayout,
  type OfficeProject,
} from '@ea/shared';
import type { ReactNode } from 'react';
import { type BoxColors, floorPoints, IsoBox, project, tones } from './iso';

// Floors and walls. Back walls (north and west edges) are tall; front walls
// (south and east) are low, so nothing in a room is hidden behind them, as in
// a cutaway drawing. A door is a gap in a wall. Since Phase 23 every room is
// walled in glass with light frames, as in the proposal, and the walls are
// tall enough for the 32-bit characters.

export const WALL_HEIGHT = 52;
/** Front walls are glass too, lower and clearer, so nothing behind them is hidden. */
export const LOW_WALL = 20;
export const THICK = 0.12;

/** Translucent panes, a light post at each tile and a light rail on top. */
const PANE: BoxColors = { top: '#cfe2fb', left: '#bcd5f7', right: '#a9c4ee' };
const FRAME = tones('#eeeaf8');
const PANE_OPACITY = 0.38;

export const FLOOR: Record<
  Floor,
  { fill: string; line: string; pattern: 'planks' | 'tiles' | 'none' }
> = {
  wood: { fill: '#c99a6b', line: '#ae8053', pattern: 'planks' },
  tile: { fill: '#ece5f6', line: '#d3c8e6', pattern: 'tiles' },
  stone: { fill: '#bdb5cf', line: '#a39bb8', pattern: 'tiles' },
  carpet_lilac: { fill: '#9583cb', line: '#8572bd', pattern: 'none' },
  carpet_blue: { fill: '#7591d6', line: '#6682c8', pattern: 'none' },
  carpet_green: { fill: '#75b892', line: '#64a681', pattern: 'none' },
};

export const CORRIDOR = { fill: '#e1d8f4', line: '#cbbfe6' };

/** Lines across a rectangle of tiles: every tile both ways, or planks along x. */
function patternPath(
  area: { x: number; y: number; width: number; height: number },
  planks: boolean,
): string {
  const parts: string[] = [];
  const line = (ax: number, ay: number, bx: number, by: number) => {
    const a = project(ax, ay);
    const b = project(bx, by);
    parts.push(`M${a.x} ${a.y}L${b.x} ${b.y}`);
  };
  const { x, y, width, height } = area;
  const stepY = planks ? 0.5 : 1;
  for (let row = y + stepY; row < y + height; row += stepY) line(x, row, x + width, row);
  if (!planks)
    for (let column = x + 1; column < x + width; column += 1) line(column, y, column, y + height);
  return parts.join('');
}

/** The ground: a slab with the corridor on it, and the floor of each area. */
export function Ground({ layout }: { layout: OfficeLayout }) {
  const { width, height } = layout;
  return (
    <g>
      <IsoBox
        x={0}
        y={0}
        w={width}
        d={height}
        z={-10}
        h={10}
        colors={{ top: CORRIDOR.fill, left: '#6f5f9c', right: '#5a4c86' }}
      />
      <path
        d={patternPath({ x: 0, y: 0, width, height }, false)}
        stroke={CORRIDOR.line}
        strokeWidth="0.6"
      />
      {layout.areas.map((area) => {
        const floor = FLOOR[area.floor];
        return (
          <g key={area.id} data-area-floor={area.id}>
            <polygon
              points={floorPoints(area.x, area.y, area.width, area.height)}
              fill={floor.fill}
            />
            {floor.pattern !== 'none' && (
              <path
                d={patternPath(area, floor.pattern === 'planks')}
                stroke={floor.line}
                strokeWidth="0.6"
              />
            )}
          </g>
        );
      })}
    </g>
  );
}

/**
 * The walls of every area, by drawing band: `back` walls are drawn before
 * whatever stands on the tiles of that band, `front` walls after.
 */
export function wallsByBand(layout: OfficeLayout): {
  back: Map<number, ReactNode[]>;
  front: Map<number, ReactNode[]>;
} {
  const back = new Map<number, ReactNode[]>();
  const front = new Map<number, ReactNode[]>();
  const add = (map: Map<number, ReactNode[]>, band: number, node: ReactNode) => {
    const list = map.get(band) ?? [];
    list.push(node);
    map.set(band, list);
  };
  for (const area of layout.areas) {
    const door = (side: 'n' | 's' | 'w' | 'e', offset: number) =>
      area.doors.some((each) => each.side === side && each.offset === offset);
    // A post every other tile: wide panes, as in the proposal.
    const wall = (key: string, x: number, y: number, w: number, d: number, h: number) => (
      <g key={key}>
        <g opacity={h === LOW_WALL ? PANE_OPACITY * 0.6 : PANE_OPACITY}>
          <IsoBox x={x} y={y} w={w} d={d} h={h} colors={PANE} />
        </g>
        {Math.round(x + y) % 2 === 0 && (
          <IsoBox x={x} y={y} w={Math.min(w, THICK)} d={Math.min(d, THICK)} h={h} colors={FRAME} />
        )}
        <IsoBox x={x} y={y} w={w} d={d} z={h} h={1.5} colors={FRAME} />
      </g>
    );
    const right = area.x + area.width;
    const bottom = area.y + area.height;
    add(
      back,
      area.x + area.y,
      wall(`${area.id}-corner`, area.x - THICK, area.y - THICK, THICK, THICK, WALL_HEIGHT),
    );
    for (let offset = 0; offset < area.width; offset += 1) {
      const x = area.x + offset;
      if (!door('n', offset))
        add(
          back,
          x + area.y,
          wall(`${area.id}-n${offset}`, x, area.y - THICK, 1, THICK, WALL_HEIGHT),
        );
      if (!door('s', offset))
        add(front, x + bottom - 1, wall(`${area.id}-s${offset}`, x, bottom, 1, THICK, LOW_WALL));
    }
    for (let offset = 0; offset < area.height; offset += 1) {
      const y = area.y + offset;
      if (!door('w', offset))
        add(
          back,
          area.x + y,
          wall(`${area.id}-w${offset}`, area.x - THICK, y, THICK, 1, WALL_HEIGHT),
        );
      if (!door('e', offset))
        add(front, right - 1 + y, wall(`${area.id}-e${offset}`, right, y, THICK, 1, LOW_WALL));
    }
  }
  return { back, front };
}

/** The name on an area's sign: its own, its project's, or its kind's. */
export function areaName(
  area: Pick<OfficeArea, 'name' | 'kind' | 'projectId'>,
  projects: readonly OfficeProject[],
): string {
  if (area.name) return area.name;
  if (AREA_KIND_INFO[area.kind].desks) {
    if (area.projectId === null) return 'Sem projeto';
    return (
      projects.find((each) => each.id === area.projectId)?.name ?? AREA_KIND_INFO[area.kind].label
    );
  }
  return AREA_KIND_INFO[area.kind].label;
}

/** Where an area's sign hangs: over the middle of its back wall. */
export const signPoint = (area: Pick<OfficeArea, 'x' | 'y' | 'width'>) =>
  project(area.x + area.width / 2, area.y, WALL_HEIGHT + 6);

/** Tiles of surroundings shown around the office when it is seen whole. */
const AROUND = 2;

/**
 * The rectangle of user units the office takes on screen, with a little of
 * its surroundings; they go on beyond it, for panning.
 */
export function sceneBounds(layout: Pick<OfficeLayout, 'width' | 'height'>) {
  const left = project(-AROUND, layout.height + AROUND).x;
  const right = project(layout.width + AROUND, -AROUND).x;
  const top = project(-AROUND, -AROUND, WALL_HEIGHT + 40).y;
  const bottom = project(layout.width + AROUND, layout.height + AROUND).y + 16;
  return { x: left, y: top, width: right - left, height: bottom - top };
}
