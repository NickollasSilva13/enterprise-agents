import {
  AREA_KIND_INFO,
  AREA_KINDS,
  type AreaKind,
  ITEM_KIND_INFO,
  type LayoutShape,
  type Side,
} from './office';

// Pure functions over a layout: which tiles can be walked, the way between
// two tiles, whether a layout is sound, and which desk is whose. The server
// uses them to refuse a bad layout; the page, to draw, walk and edit.

export interface Tile {
  readonly x: number;
  readonly y: number;
}

const STEP: Record<Side, Tile> = {
  n: { x: 0, y: -1 },
  s: { x: 0, y: 1 },
  w: { x: -1, y: 0 },
  e: { x: 1, y: 0 },
};

export const stepTo = (tile: Tile, side: Side): Tile => ({
  x: tile.x + STEP[side].x,
  y: tile.y + STEP[side].y,
});

type AnyArea = LayoutShape['areas'][number];
type AnyItem = LayoutShape['items'][number];

/** Tiles an item takes, by its kind and facing. */
export function footprint(item: Pick<AnyItem, 'kind' | 'x' | 'y' | 'facing'>): Tile[] {
  const { w, d } = ITEM_KIND_INFO[item.kind].size;
  const turned = item.facing === 'e' || item.facing === 'w';
  const width = turned ? d : w;
  const depth = turned ? w : d;
  const tiles: Tile[] = [];
  for (let dy = 0; dy < depth; dy += 1) {
    for (let dx = 0; dx < width; dx += 1) tiles.push({ x: item.x + dx, y: item.y + dy });
  }
  return tiles;
}

/** Where the person at a desk sits. */
export const chairOf = (desk: Pick<AnyItem, 'x' | 'y' | 'facing'>): Tile =>
  stepTo(desk, desk.facing);

/** The tile inside the area where a door is, and the tile outside it leads to. */
export function doorTiles(
  area: AnyArea,
  door: AnyArea['doors'][number],
): { inside: Tile; outside: Tile } {
  const right = area.x + area.width - 1;
  const bottom = area.y + area.height - 1;
  const inside =
    door.side === 'n'
      ? { x: area.x + door.offset, y: area.y }
      : door.side === 's'
        ? { x: area.x + door.offset, y: bottom }
        : door.side === 'w'
          ? { x: area.x, y: area.y + door.offset }
          : { x: right, y: area.y + door.offset };
  return { inside, outside: stepTo(inside, door.side) };
}

/** How long the side of an area is, in tiles. */
export const sideLength = (area: AnyArea, side: Side): number =>
  side === 'n' || side === 's' ? area.width : area.height;

/** The walkable map of a layout, built once and reused. */
export interface NavGrid {
  readonly width: number;
  readonly height: number;
  /** Area index of each tile, -1 for the corridor. */
  readonly areaOf: Int16Array;
  readonly blocked: Uint8Array;
  /** Edges a door opens, as "x,y>x,y" in both directions. */
  readonly doors: ReadonlySet<string>;
}

const edgeKey = (a: Tile, b: Tile) => `${a.x},${a.y}>${b.x},${b.y}`;

export function buildNav(layout: LayoutShape): NavGrid {
  const { width, height } = layout;
  const areaOf = new Int16Array(width * height).fill(-1);
  layout.areas.forEach((area, index) => {
    for (let y = area.y; y < Math.min(height, area.y + area.height); y += 1) {
      for (let x = area.x; x < Math.min(width, area.x + area.width); x += 1) {
        if (areaOf[y * width + x] === -1) areaOf[y * width + x] = index;
      }
    }
  });
  const blocked = new Uint8Array(width * height);
  for (const item of layout.items) {
    if (!ITEM_KIND_INFO[item.kind].blocks) continue;
    for (const tile of footprint(item)) {
      if (tile.x < width && tile.y < height) blocked[tile.y * width + tile.x] = 1;
    }
  }
  const doors = new Set<string>();
  for (const area of layout.areas) {
    for (const door of area.doors) {
      const { inside: a, outside: b } = doorTiles(area, door);
      doors.add(edgeKey(a, b));
      doors.add(edgeKey(b, a));
    }
  }
  return { width, height, areaOf, blocked, doors };
}

export const inGrid = (nav: Pick<NavGrid, 'width' | 'height'>, tile: Tile): boolean =>
  tile.x >= 0 && tile.y >= 0 && tile.x < nav.width && tile.y < nav.height;

export const areaIndexAt = (nav: NavGrid, tile: Tile): number =>
  inGrid(nav, tile) ? (nav.areaOf[tile.y * nav.width + tile.x] ?? -1) : -1;

export const isFree = (nav: NavGrid, tile: Tile): boolean =>
  inGrid(nav, tile) && nav.blocked[tile.y * nav.width + tile.x] === 0;

/** Whether one step from `a` to its neighbour `b` is allowed: no furniture, no wall. */
export function canStep(nav: NavGrid, a: Tile, b: Tile): boolean {
  if (!isFree(nav, b)) return false;
  if (areaIndexAt(nav, a) === areaIndexAt(nav, b)) return true;
  return nav.doors.has(edgeKey(a, b));
}

const SIDE_LIST: readonly Side[] = ['n', 'e', 's', 'w'];

/** Every tile reachable from `start`, as indexes, with the tile each was reached from. */
function explore(nav: NavGrid, start: Tile, goal?: Tile): Int32Array {
  const from = new Int32Array(nav.width * nav.height).fill(-2);
  if (!inGrid(nav, start)) return from;
  const startIndex = start.y * nav.width + start.x;
  from[startIndex] = -1;
  const queue = [startIndex];
  for (let head = 0; head < queue.length; head += 1) {
    const index = queue[head] as number;
    const tile = { x: index % nav.width, y: Math.floor(index / nav.width) };
    if (goal && tile.x === goal.x && tile.y === goal.y) break;
    for (const side of SIDE_LIST) {
      const next = stepTo(tile, side);
      if (!inGrid(nav, next)) continue;
      const nextIndex = next.y * nav.width + next.x;
      if (from[nextIndex] !== -2 || !canStep(nav, tile, next)) continue;
      from[nextIndex] = index;
      queue.push(nextIndex);
    }
  }
  return from;
}

/**
 * The shortest walk from one tile to another, both included; null when there
 * is none. The start may be blocked (a chair is free, but someone may stand
 * on a rug); every other step must be allowed.
 */
export function findPath(nav: NavGrid, start: Tile, goal: Tile): Tile[] | null {
  if (!inGrid(nav, start) || !inGrid(nav, goal)) return null;
  const from = explore(nav, start, goal);
  let index = goal.y * nav.width + goal.x;
  if (from[index] === -2) return null;
  const path: Tile[] = [];
  while (index !== -1) {
    path.push({ x: index % nav.width, y: Math.floor(index / nav.width) });
    index = from[index] as number;
  }
  return path.reverse();
}

/** Free tiles of an area that can be reached from `start`, row by row. */
export function standingTiles(
  nav: NavGrid,
  layout: LayoutShape,
  areaIndex: number,
  start: Tile,
): Tile[] {
  const area = layout.areas[areaIndex];
  if (!area) return [];
  const reach = explore(nav, start);
  const tiles: Tile[] = [];
  for (let y = area.y + area.height - 1; y >= area.y; y -= 1) {
    for (let x = area.x; x < area.x + area.width; x += 1) {
      const tile = { x, y };
      if (!inGrid(nav, tile) || areaIndexAt(nav, tile) !== areaIndex) continue;
      if (reach[y * nav.width + x] !== -2) tiles.push(tile);
    }
  }
  return tiles;
}

/** The first area of a kind, or -1. */
export const areaOfKind = (layout: LayoutShape, kind: AreaKind): number =>
  layout.areas.findIndex((area) => area.kind === kind);

/** The street door: the entrance item, where agents come in and go out. */
export function entranceOf(layout: Pick<LayoutShape, 'items'>): Tile | null {
  const entrance = layout.items.find((item) => item.kind === 'entrance');
  return entrance ? { x: entrance.x, y: entrance.y } : null;
}

// ---------------------------------------------------------------------------
// Validation

export interface LayoutIssue {
  readonly message: string;
  readonly area?: number;
  readonly item?: number;
}

const areaLabel = (area: AnyArea, index: number) =>
  `${area.name ?? AREA_KIND_INFO[area.kind].label} (área ${index + 1})`;
const itemLabel = (item: AnyItem, index: number) =>
  `${ITEM_KIND_INFO[item.kind].label} (móvel ${index + 1})`;

/** Everything wrong with a layout, in words for the user; empty when it is sound. */
export function validateLayout(layout: LayoutShape): LayoutIssue[] {
  const issues: LayoutIssue[] = [];
  const nav = buildNav(layout);

  for (const kind of AREA_KINDS) {
    const { count, label } = AREA_KIND_INFO[kind];
    const total = layout.areas.filter((area) => area.kind === kind).length;
    if (count === 'one' && total !== 1) {
      issues.push({ message: `O escritório precisa de exatamente uma área "${label}".` });
    }
    if (count === 'optional-one' && total > 1) {
      issues.push({ message: `O escritório pode ter só uma área "${label}".` });
    }
  }

  layout.areas.forEach((area, index) => {
    const name = areaLabel(area, index);
    if (area.x + area.width > layout.width || area.y + area.height > layout.height) {
      issues.push({ area: index, message: `${name} passa da borda da grade.` });
    }
    layout.areas.slice(0, index).forEach((other, otherIndex) => {
      const overlaps =
        area.x < other.x + other.width &&
        other.x < area.x + area.width &&
        area.y < other.y + other.height &&
        other.y < area.y + area.height;
      if (overlaps) {
        issues.push({
          area: index,
          message: `${name} se sobrepõe a ${areaLabel(other, otherIndex)}.`,
        });
      }
    });
    if (area.projectId !== null && !AREA_KIND_INFO[area.kind].desks) {
      issues.push({ area: index, message: `${name} não tem mesas e não pode ter projeto.` });
    }
    const seen = new Set<string>();
    for (const door of area.doors) {
      const key = `${door.side}${door.offset}`;
      if (seen.has(key)) {
        issues.push({ area: index, message: `${name} tem duas portas no mesmo lugar.` });
      }
      seen.add(key);
      if (door.offset >= sideLength(area, door.side)) {
        issues.push({ area: index, message: `${name} tem uma porta fora da parede.` });
        continue;
      }
      const { outside } = doorTiles(area, door);
      if (!inGrid(nav, outside) || areaIndexAt(nav, outside) !== -1) {
        issues.push({
          area: index,
          message: `${name} tem uma porta que não dá para o corredor.`,
        });
      }
    }
  });

  const occupied = new Map<string, number>();
  const chairs = new Map<string, number>();
  const owners = new Map<string, number>();
  layout.items.forEach((item, index) => {
    const info = ITEM_KIND_INFO[item.kind];
    const name = itemLabel(item, index);
    const tiles = footprint(item);
    if (tiles.some((tile) => !inGrid(nav, tile))) {
      issues.push({ item: index, message: `${name} passa da borda da grade.` });
      return;
    }
    const areas = new Set(tiles.map((tile) => areaIndexAt(nav, tile)));
    if (areas.size > 1) {
      issues.push({ item: index, message: `${name} atravessa uma parede.` });
    }
    const areaIndex = areaIndexAt(nav, tiles[0] as Tile);
    const area = layout.areas[areaIndex];
    if (info.blocks) {
      for (const tile of tiles) {
        const key = `${tile.x},${tile.y}`;
        const other = occupied.get(key);
        if (other !== undefined) {
          issues.push({
            item: index,
            message: `${name} ocupa o mesmo lugar que ${itemLabel(layout.items[other] as AnyItem, other)}.`,
          });
          break;
        }
        occupied.set(key, index);
      }
    }
    if (item.label !== null && !info.hasLabel) {
      issues.push({ item: index, message: `${name} não leva texto.` });
    }
    if (item.agentId !== null && item.kind !== 'desk') {
      issues.push({ item: index, message: `${name} não pode ter dono.` });
    }
    if (item.kind === 'entrance' && area?.kind !== 'reception') {
      issues.push({ item: index, message: 'A entrada precisa ficar dentro da recepção.' });
    }
    if (item.kind === 'desk') {
      if (!area || !AREA_KIND_INFO[area.kind].desks) {
        issues.push({
          item: index,
          message: `${name} precisa ficar numa sala de projeto ou de foco.`,
        });
      }
      const chair = chairOf(item);
      if (!inGrid(nav, chair) || areaIndexAt(nav, chair) !== areaIndex) {
        issues.push({ item: index, message: `${name} não tem lugar para a cadeira.` });
      } else {
        const key = `${chair.x},${chair.y}`;
        if (chairs.has(key)) {
          issues.push({ item: index, message: `${name} divide a cadeira com outra mesa.` });
        }
        chairs.set(key, index);
      }
      if (item.agentId !== null) {
        if (owners.has(item.agentId)) {
          issues.push({ item: index, message: 'Um agente não pode ter duas mesas.' });
        }
        owners.set(item.agentId, index);
      }
    }
  });
  for (const kind of ['entrance'] as const) {
    const total = layout.items.filter((item) => item.kind === kind).length;
    if (total !== 1) issues.push({ message: 'O escritório precisa de exatamente uma entrada.' });
  }

  // Everything must be reachable from the street door.
  const entrance = entranceOf(layout);
  if (entrance && issues.length === 0) {
    const reach = explore(nav, entrance);
    const reached = (tile: Tile) => reach[tile.y * nav.width + tile.x] !== -2;
    layout.areas.forEach((area, index) => {
      let any = false;
      for (let y = area.y; y < area.y + area.height && !any; y += 1) {
        for (let x = area.x; x < area.x + area.width && !any; x += 1) any = reached({ x, y });
      }
      if (!any) {
        issues.push({
          area: index,
          message: `Não há como chegar a ${areaLabel(area, index)} a partir da entrada.`,
        });
      }
    });
    layout.items.forEach((item, index) => {
      if (item.kind !== 'desk') return;
      const chair = chairOf(item);
      if (!isFree(nav, chair) || !reached(chair)) {
        issues.push({
          item: index,
          message: `Não há como chegar à cadeira de ${itemLabel(item, index)}.`,
        });
      }
    });
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Desks

export interface DeskSeeker {
  readonly id: string;
  readonly projectId: string | null;
}

/**
 * Which desk (item index) each agent sits at. A desk with an owner is the
 * owner's; everyone else takes, in the order given, the first free desk in a
 * room of their project (rooms with no project for agents with none). Agents
 * left without a desk are not in the result.
 */
export function assignDesks(
  layout: LayoutShape,
  agents: readonly DeskSeeker[],
): Map<string, number> {
  const present = new Set(agents.map((agent) => agent.id));
  const result = new Map<string, number>();
  const taken = new Set<number>();
  layout.items.forEach((item, index) => {
    if (item.kind !== 'desk' || item.agentId === null || !present.has(item.agentId)) return;
    if (result.has(item.agentId)) return;
    result.set(item.agentId, index);
    taken.add(index);
  });
  const nav = buildNav(layout);
  const roomOf = (index: number) => {
    const item = layout.items[index] as AnyItem;
    return layout.areas[areaIndexAt(nav, item)];
  };
  for (const agent of agents) {
    if (result.has(agent.id)) continue;
    const desk = layout.items.findIndex((item, index) => {
      if (item.kind !== 'desk' || taken.has(index)) return false;
      if (item.agentId !== null && present.has(item.agentId)) return false;
      const room = roomOf(index);
      return (
        room !== undefined && AREA_KIND_INFO[room.kind].desks && room.projectId === agent.projectId
      );
    });
    if (desk === -1) continue;
    result.set(agent.id, desk);
    taken.add(desk);
  }
  return result;
}
