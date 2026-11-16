import {
  areaIndexAt,
  areaOfKind,
  assignDesks,
  buildNav,
  chairOf,
  type DeskSeeker,
  entranceOf,
  findPath,
  isFree,
  type NavGrid,
  type OfficeLayout,
  type Side,
  standingTiles,
  stepTo,
  type Tile,
} from '@ea/shared';
import type { Geometry, OfficeFeatures, Place, Point } from './scene';

// The layout seen by the scene: where each agent sits, where people stand in
// the common rooms, and the way between two points. Built once per layout.

export interface Seat {
  /** Index of the desk in the layout's items. */
  readonly desk: number;
  readonly chair: Tile;
  /** The side of the desk the chair is on. */
  readonly side: Side;
}

export interface OfficeGeometry extends Geometry {
  readonly nav: NavGrid;
  readonly seats: ReadonlyMap<string, Seat>;
  readonly features: OfficeFeatures;
}

const center = (tile: Tile): Point => ({ x: tile.x + 0.5, y: tile.y + 0.5 });
const tileOf = (point: Point): Tile => ({ x: Math.floor(point.x), y: Math.floor(point.y) });
const SIDES: readonly Side[] = ['s', 'e', 'w', 'n'];

export function buildGeometry(layout: OfficeLayout, agents: readonly DeskSeeker[]): OfficeGeometry {
  const nav = buildNav(layout);
  const seats = new Map<string, Seat>();
  for (const [agentId, desk] of assignDesks(layout, agents)) {
    const item = layout.items[desk];
    if (item) seats.set(agentId, { desk, chair: chairOf(item), side: item.facing });
  }
  const chairs = new Set(
    layout.items.filter((item) => item.kind === 'desk').map((item) => key(chairOf(item))),
  );
  const entrance = entranceOf(layout);
  const standing = new Map<number, Tile[]>();
  /** Free tiles of an area, in front first, without the chairs of desks. */
  const standIn = (area: number): Tile[] => {
    let tiles = standing.get(area);
    if (!tiles) {
      tiles = entrance
        ? standingTiles(nav, layout, area, entrance).filter(
            (tile) => !chairs.has(key(tile)) && !(tile.x === entrance.x && tile.y === entrance.y),
          )
        : [];
      standing.set(area, tiles);
    }
    return tiles;
  };
  const pick = (tiles: readonly Tile[], slot: number): Point | null => {
    const tile = tiles[slot % Math.max(1, tiles.length)];
    return tile ? center(tile) : null;
  };
  const inKind = (kind: Parameters<typeof areaOfKind>[1], slot: number) => {
    const area = areaOfKind(layout, kind);
    return area === -1 ? null : pick(standIn(area), slot);
  };

  return {
    nav,
    seats,
    features: {
      meeting: areaOfKind(layout, 'meeting') !== -1,
      lounge: areaOfKind(layout, 'lounge') !== -1,
    },
    spot(agentId: string, place: Place, slot: number): Point | null {
      switch (place.kind) {
        case 'desk': {
          const seat = seats.get(agentId);
          return seat ? center(seat.chair) : null;
        }
        case 'outside':
          return entrance ? center(entrance) : null;
        case 'lobby':
          return inKind('reception', slot);
        case 'pantry':
        case 'lounge':
        case 'meeting':
          return inKind(place.kind, slot);
        case 'visit': {
          const seat = seats.get(place.hostId);
          if (!seat) return null;
          // Beside the host's chair, in the same room; else anywhere free in it.
          const area = areaIndexAt(nav, seat.chair);
          const beside = SIDES.map((side) => stepTo(seat.chair, side)).filter(
            (tile) =>
              isFree(nav, tile) && areaIndexAt(nav, tile) === area && !chairs.has(key(tile)),
          );
          return beside.length > 0 ? pick(beside, slot) : pick(standIn(area), slot);
        }
      }
    },
    path(from: Point, to: Point): Point[] {
      const tiles = findPath(nav, tileOf(from), tileOf(to));
      if (!tiles) return [to];
      return [...tiles.slice(1, -1).map(center), to];
    },
  };
}

function key(tile: Tile): string {
  return `${tile.x},${tile.y}`;
}
