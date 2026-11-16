import {
  type AreaKind,
  type Floor,
  footprint,
  type ItemKind,
  layoutInputOf,
  OFFICE_LIMITS,
  type OfficeArea,
  type OfficeItem,
  type OfficeLayout,
  type OfficeLayoutInput,
  type Side,
  type Tile,
} from '@ea/shared';

// The office editor's state (Phase 14), as a reducer with undo and redo.
// Pure: the page only turns pointer and keyboard input into these actions.

export type Selection = { readonly kind: 'area' | 'item'; readonly id: string } | null;

export interface EditorState {
  readonly present: OfficeLayout;
  readonly past: readonly OfficeLayout[];
  readonly future: readonly OfficeLayout[];
  readonly selection: Selection;
  /** Whether there are changes not saved yet. */
  readonly dirty: boolean;
}

export type EditorAction =
  | { readonly type: 'load'; readonly layout: OfficeLayout }
  | { readonly type: 'replace'; readonly layout: OfficeLayout }
  | { readonly type: 'grid'; readonly width: number; readonly height: number }
  | {
      readonly type: 'add-area';
      readonly kind: AreaKind;
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
    }
  | {
      readonly type: 'update-area';
      readonly id: string;
      readonly patch: Partial<Omit<OfficeArea, 'id'>>;
    }
  | { readonly type: 'add-item'; readonly kind: ItemKind; readonly x: number; readonly y: number }
  | {
      readonly type: 'update-item';
      readonly id: string;
      readonly patch: Partial<Omit<OfficeItem, 'id'>>;
    }
  | { readonly type: 'rotate'; readonly id: string }
  | {
      readonly type: 'move';
      readonly selection: NonNullable<Selection>;
      readonly dx: number;
      readonly dy: number;
    }
  | { readonly type: 'remove'; readonly selection: NonNullable<Selection> }
  | {
      readonly type: 'toggle-door';
      readonly id: string;
      readonly side: Side;
      readonly offset: number;
    }
  | { readonly type: 'select'; readonly selection: Selection }
  | { readonly type: 'saved' }
  | { readonly type: 'undo' }
  | { readonly type: 'redo' };

/** How many steps can be undone. */
const HISTORY = 100;

let counter = 0;
/** An id for something made in the editor; the server gives the real ones on save. */
export const localId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(counter += 1)}`;

export const DEFAULT_FLOOR: Record<AreaKind, Floor> = {
  reception: 'stone',
  pantry: 'tile',
  project: 'wood',
  focus: 'carpet_blue',
  meeting: 'carpet_blue',
  lounge: 'carpet_lilac',
};

const TURN: Record<Side, Side> = { s: 'w', w: 'n', n: 'e', e: 's' };

export const initialEditor = (layout: OfficeLayout): EditorState => ({
  present: layout,
  past: [],
  future: [],
  selection: null,
  dirty: false,
});

/** Keeps a number of tiles within the grid. */
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function change(
  state: EditorState,
  present: OfficeLayout,
  selection: Selection = state.selection,
): EditorState {
  if (present === state.present) return state;
  return {
    present,
    past: [...state.past, state.present].slice(-HISTORY),
    future: [],
    selection,
    dirty: true,
  };
}

const mapArea = (layout: OfficeLayout, id: string, update: (area: OfficeArea) => OfficeArea) => ({
  ...layout,
  areas: layout.areas.map((area) => (area.id === id ? update(area) : area)),
});

const mapItem = (layout: OfficeLayout, id: string, update: (item: OfficeItem) => OfficeItem) => ({
  ...layout,
  items: layout.items.map((item) => (item.id === id ? update(item) : item)),
});

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  const layout = state.present;
  switch (action.type) {
    case 'load':
      return initialEditor(action.layout);
    case 'replace':
      return change(state, action.layout, null);
    case 'saved':
      return { ...state, dirty: false };
    case 'grid': {
      const { min, max } = OFFICE_LIMITS.grid;
      return change(state, {
        ...layout,
        width: clamp(Math.round(action.width), min, max),
        height: clamp(Math.round(action.height), min, max),
      });
    }
    case 'add-area': {
      const width = Math.max(OFFICE_LIMITS.areaSize.min, action.width);
      const height = Math.max(OFFICE_LIMITS.areaSize.min, action.height);
      const area: OfficeArea = {
        id: localId('area'),
        kind: action.kind,
        name: null,
        x: clamp(action.x, 0, layout.width - width),
        y: clamp(action.y, 0, layout.height - height),
        width,
        height,
        floor: DEFAULT_FLOOR[action.kind],
        projectId: null,
        doors: [{ side: 's', offset: Math.floor(width / 2) }],
      };
      return change(
        state,
        { ...layout, areas: [...layout.areas, area] },
        { kind: 'area', id: area.id },
      );
    }
    case 'update-area':
      return change(
        state,
        mapArea(layout, action.id, (area) => ({ ...area, ...action.patch })),
      );
    case 'add-item': {
      const item: OfficeItem = {
        id: localId('item'),
        kind: action.kind,
        x: action.x,
        y: action.y,
        facing: action.kind === 'desk' ? 'n' : 's',
        agentId: null,
        label: action.kind === 'mural' ? 'Boas ideias!' : null,
      };
      return change(
        state,
        { ...layout, items: [...layout.items, item] },
        { kind: 'item', id: item.id },
      );
    }
    case 'update-item':
      return change(
        state,
        mapItem(layout, action.id, (item) => ({ ...item, ...action.patch })),
      );
    case 'rotate':
      return change(
        state,
        mapItem(layout, action.id, (item) => ({ ...item, facing: TURN[item.facing] })),
      );
    case 'move': {
      const { selection, dx, dy } = action;
      if (dx === 0 && dy === 0) return state;
      if (selection.kind === 'item') {
        return change(
          state,
          mapItem(layout, selection.id, (item) => ({
            ...item,
            x: clamp(item.x + dx, 0, layout.width - 1),
            y: clamp(item.y + dy, 0, layout.height - 1),
          })),
        );
      }
      // An area takes its furniture along.
      const area = layout.areas.find((each) => each.id === selection.id);
      if (!area) return state;
      const mx = clamp(area.x + dx, 0, layout.width - area.width) - area.x;
      const my = clamp(area.y + dy, 0, layout.height - area.height) - area.y;
      if (mx === 0 && my === 0) return state;
      const inside = (tile: Tile) =>
        tile.x >= area.x &&
        tile.x < area.x + area.width &&
        tile.y >= area.y &&
        tile.y < area.y + area.height;
      return change(state, {
        ...layout,
        areas: layout.areas.map((each) =>
          each.id === area.id ? { ...each, x: each.x + mx, y: each.y + my } : each,
        ),
        items: layout.items.map((item) =>
          inside(item) ? { ...item, x: item.x + mx, y: item.y + my } : item,
        ),
      });
    }
    case 'remove': {
      const { selection } = action;
      const next =
        selection.kind === 'item'
          ? { ...layout, items: layout.items.filter((item) => item.id !== selection.id) }
          : { ...layout, areas: layout.areas.filter((area) => area.id !== selection.id) };
      return change(state, next, null);
    }
    case 'toggle-door':
      return change(
        state,
        mapArea(layout, action.id, (area) => {
          const has = area.doors.some(
            (door) => door.side === action.side && door.offset === action.offset,
          );
          if (has) {
            return {
              ...area,
              doors: area.doors.filter(
                (door) => !(door.side === action.side && door.offset === action.offset),
              ),
            };
          }
          if (area.doors.length >= OFFICE_LIMITS.doors) return area;
          return { ...area, doors: [...area.doors, { side: action.side, offset: action.offset }] };
        }),
      );
    case 'select':
      return { ...state, selection: action.selection };
    case 'undo': {
      const previous = state.past.at(-1);
      if (!previous) return state;
      return {
        present: previous,
        past: state.past.slice(0, -1),
        future: [state.present, ...state.future],
        selection: null,
        dirty: true,
      };
    }
    case 'redo': {
      const next = state.future[0];
      if (!next) return state;
      return {
        present: next,
        past: [...state.past, state.present],
        future: state.future.slice(1),
        selection: null,
        dirty: true,
      };
    }
  }
}

/** What the server takes: the layout without ids. */
export const toInput = (layout: OfficeLayout): OfficeLayoutInput => layoutInputOf(layout);

/** The furniture on a tile, the standing kind first; null when there is none. */
export function itemAt(layout: OfficeLayout, tile: Tile): OfficeItem | null {
  let flat: OfficeItem | null = null;
  for (let index = layout.items.length - 1; index >= 0; index -= 1) {
    const item = layout.items[index] as OfficeItem;
    if (!footprint(item).some((each) => each.x === tile.x && each.y === tile.y)) continue;
    if (item.kind !== 'rug' && item.kind !== 'entrance') return item;
    flat ??= item;
  }
  return flat;
}

export function areaAt(layout: OfficeLayout, tile: Tile): OfficeArea | null {
  return (
    layout.areas.find(
      (area) =>
        tile.x >= area.x &&
        tile.x < area.x + area.width &&
        tile.y >= area.y &&
        tile.y < area.y + area.height,
    ) ?? null
  );
}

/**
 * The wall of `area` nearest to a point inside it, when that point is on its
 * edge row or column; null in the middle of the area. `point` is in tiles,
 * with fractions, so a corner tile picks the side the pointer is closest to.
 */
export function wallAt(
  area: Pick<OfficeArea, 'x' | 'y' | 'width' | 'height'>,
  point: { x: number; y: number },
): { side: Side; offset: number } | null {
  const tile = { x: Math.floor(point.x), y: Math.floor(point.y) };
  const candidates: { side: Side; offset: number; distance: number }[] = [];
  if (tile.y === area.y)
    candidates.push({ side: 'n', offset: tile.x - area.x, distance: point.y - area.y });
  if (tile.y === area.y + area.height - 1)
    candidates.push({
      side: 's',
      offset: tile.x - area.x,
      distance: area.y + area.height - point.y,
    });
  if (tile.x === area.x)
    candidates.push({ side: 'w', offset: tile.y - area.y, distance: point.x - area.x });
  if (tile.x === area.x + area.width - 1)
    candidates.push({
      side: 'e',
      offset: tile.y - area.y,
      distance: area.x + area.width - point.x,
    });
  candidates.sort((a, b) => a.distance - b.distance);
  const best = candidates[0];
  return best ? { side: best.side, offset: best.offset } : null;
}
