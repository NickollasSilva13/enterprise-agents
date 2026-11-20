import type {
  AreaKind,
  Floor,
  ItemKind,
  OfficeArea,
  OfficeItem,
  OfficeLayout,
  OfficePreset,
  Side,
} from './office';
import { OFFICE_LIMITS } from './office';

// Ready-made layouts. The office a user sees before editing anything is the
// "complete" one, built from the projects that exist, so a new project gets
// its room without anyone opening the editor. Ids are derived from the
// position in the layout, so the same input always gives the same layout.

export interface PresetRoom {
  /** Project id, or null for the room of agents without a project. */
  readonly projectId: string | null;
  /** How many agents sit there now. */
  readonly agents: number;
}

interface Block {
  readonly kind: AreaKind;
  readonly name: string | null;
  readonly width: number;
  readonly height: number;
  readonly floor: Floor;
  readonly projectId: string | null;
  readonly door: number;
  readonly items: readonly Omit<OfficeItem, 'id'>[];
}

const thing = (
  kind: ItemKind,
  x: number,
  y: number,
  facing: Side = 's',
  label: string | null = null,
): Omit<OfficeItem, 'id'> => ({ kind, x, y, facing, agentId: null, label, color: 'default' });

const MAX_DESKS_PER_ROW = 8;

/** A room of desks in rows, chairs behind them so faces show, a free column to walk. */
function projectRoom(room: PresetRoom, spare: number, plants: boolean): Block {
  const desks = Math.max(2, room.agents + spare);
  const perRow = Math.min(
    MAX_DESKS_PER_ROW,
    Math.max(2, Math.ceil(desks / Math.ceil(desks / MAX_DESKS_PER_ROW))),
  );
  const rows = Math.ceil(desks / perRow);
  const width = perRow + 2;
  // Per row: an aisle, the chairs, the desks; a last aisle at the bottom, with the door.
  const height = rows * 3 + 1;
  const items: Omit<OfficeItem, 'id'>[] = [];
  let placed = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < perRow && placed < desks; column += 1) {
      items.push(thing('desk', 1 + column, 2 + row * 3, 'n'));
      placed += 1;
    }
  }
  if (plants) items.push(thing('plant_large', width - 1, 0), thing('plant', width - 1, height - 1));
  return {
    kind: 'project',
    name: null,
    width,
    height,
    floor: 'wood',
    projectId: room.projectId,
    door: 0,
    items,
  };
}

function reception(plants: boolean): Block {
  return {
    kind: 'reception',
    name: null,
    width: 7,
    height: 5,
    floor: 'stone',
    projectId: null,
    door: 3,
    items: [
      thing('entrance', 3, 4),
      // The desk of the reception, a chair behind it, and a corner to wait (Phase 26).
      thing('counter', 1, 1, 's'),
      thing('counter', 2, 1, 's'),
      thing('chair', 1, 0, 's'),
      thing('chair', 2, 0, 's'),
      thing('mural', 4, 0, 's', 'Boas ideias!'),
      thing('armchair', 6, 2, 'w'),
      thing('coffee_table', 5, 2),
      thing('armchair', 6, 3, 'w'),
      ...(plants ? [thing('plant_large', 0, 0), thing('plant', 6, 4), thing('plant', 0, 4)] : []),
    ],
  };
}

function pantry(plants: boolean): Block {
  return {
    kind: 'pantry',
    name: null,
    width: 7,
    height: 5,
    floor: 'tile',
    projectId: null,
    door: 3,
    items: [
      thing('fridge', 0, 0),
      thing('counter', 1, 0),
      thing('coffee_machine', 2, 0),
      thing('counter', 3, 0),
      thing('vending_machine', 4, 0),
      thing('water_cooler', 6, 0),
      // Stools at the counter, as in a pantry with a bar (Phase 23).
      thing('bar_stool', 1, 1),
      thing('bar_stool', 2, 1),
      thing('bar_stool', 3, 1),
      thing('coffee_table', 5, 2),
      ...(plants ? [thing('plant', 6, 4), thing('plant_large', 0, 4)] : []),
    ],
  };
}

function meeting(): Block {
  return {
    kind: 'meeting',
    name: null,
    width: 7,
    height: 5,
    floor: 'carpet_blue',
    projectId: null,
    door: 0,
    items: [
      thing('whiteboard', 3, 0),
      thing('wall_tv', 1, 0),
      thing('meeting_table', 2, 2),
      // Chairs all around the table (Phase 26).
      thing('chair', 2, 1, 's'),
      thing('chair', 3, 1, 's'),
      thing('chair', 4, 1, 's'),
      thing('chair', 2, 3, 'n'),
      thing('chair', 3, 3, 'n'),
      thing('chair', 4, 3, 'n'),
      thing('chair', 1, 2, 'e'),
      thing('chair', 5, 2, 'w'),
      thing('plant', 6, 0),
      thing('plant', 6, 4),
    ],
  };
}

function lounge(plants: boolean): Block {
  return {
    kind: 'lounge',
    name: null,
    width: 6,
    height: 5,
    floor: 'carpet_lilac',
    projectId: null,
    door: 0,
    items: [
      // Two sofas around a low table, facing the TV; shelves on the back wall (Phase 26).
      thing('rug', 2, 1),
      thing('bookshelf', 0, 0),
      thing('bookshelf', 1, 0),
      thing('sofa', 1, 1, 'e'),
      thing('coffee_table', 3, 1),
      thing('sofa', 2, 3, 'n'),
      thing('tv', 5, 2, 'w'),
      thing('bean_bag', 4, 1),
      thing('floor_lamp', 5, 4),
      ...(plants ? [thing('plant_large', 5, 0)] : []),
    ],
  };
}

const PRESET_SHAPE: Record<
  OfficePreset,
  { corridor: number; spare: number; plants: boolean; rooms: boolean; rowWidth: number }
> = {
  complete: { corridor: 2, spare: 1, plants: true, rooms: true, rowWidth: 30 },
  compact: { corridor: 2, spare: 0, plants: false, rooms: false, rowWidth: 24 },
  spacious: { corridor: 3, spare: 2, plants: true, rooms: true, rowWidth: 36 },
};

/**
 * Builds a layout: common areas on the first row, then one room per project,
 * wrapped in rows with corridors between them. Every door opens onto the
 * corridor below its area, so everything is reachable. Rooms that do not fit
 * the largest grid are left out; their agents show as "without a desk".
 */
export function buildPresetLayout(
  preset: OfficePreset,
  rooms: readonly PresetRoom[],
): OfficeLayout {
  const shape = PRESET_SHAPE[preset];
  const blocks: Block[] = [reception(shape.plants), pantry(shape.plants)];
  if (shape.rooms) blocks.push(meeting(), lounge(shape.plants));
  for (const room of rooms) blocks.push(projectRoom(room, shape.spare, shape.plants));

  const max = OFFICE_LIMITS.grid.max;
  const gap = shape.corridor;
  const areas: OfficeArea[] = [];
  const items: OfficeItem[] = [];
  let x = gap;
  let y = 1;
  let rowHeight = 0;
  let width: number = OFFICE_LIMITS.grid.min;
  for (const block of blocks) {
    if (x > gap && x + block.width + gap > Math.max(shape.rowWidth, block.width + 2 * gap)) {
      x = gap;
      y += rowHeight + gap;
      rowHeight = 0;
    }
    if (x + block.width + gap > max || y + block.height + gap > max) continue;
    const areaIndex = areas.length;
    areas.push({
      id: `preset-area-${areaIndex}`,
      kind: block.kind,
      name: block.name,
      x,
      y,
      width: block.width,
      height: block.height,
      floor: block.floor,
      projectId: block.projectId,
      doors: [{ side: 's', offset: block.door }],
    });
    for (const item of block.items) {
      items.push({ ...item, id: `preset-item-${items.length}`, x: x + item.x, y: y + item.y });
    }
    if (shape.plants && block.kind === 'project') {
      // A plant in the corridor, beside the room, as in any office.
      const plantX = x + block.width;
      if (plantX < max)
        items.push({ ...thing('plant', plantX, y), id: `preset-item-${items.length}` });
    }
    x += block.width + gap;
    rowHeight = Math.max(rowHeight, block.height);
    width = Math.max(width, x);
  }
  const height = Math.max(OFFICE_LIMITS.grid.min, Math.min(max, y + rowHeight + gap));
  const finalWidth = Math.min(max, width);
  if (shape.plants) {
    // Plants along the front and right edges of the corridor, so the open
    // floor is not left bare (Phase 26); never inside a room, never two together.
    const inArea = (tx: number, ty: number) =>
      areas.some(
        (area) =>
          tx >= area.x && tx < area.x + area.width && ty >= area.y && ty < area.y + area.height,
      );
    const taken = new Set(items.map((item) => `${item.x},${item.y}`));
    const spots: [number, number][] = [];
    for (let tx = 1; tx < finalWidth - 1; tx += 4) spots.push([tx, height - 1]);
    for (let ty = 1; ty < height - 1; ty += 4) spots.push([finalWidth - 1, ty]);
    spots.push([finalWidth - 1, height - 1]);
    for (const [tx, ty] of spots) {
      if (inArea(tx, ty) || taken.has(`${tx},${ty}`)) continue;
      taken.add(`${tx},${ty}`);
      items.push({
        ...thing(tx % 8 === 1 ? 'plant_large' : 'plant', tx, ty),
        id: `preset-item-${items.length}`,
      });
    }
  }
  return { width: finalWidth, height, surroundings: 'building', areas, items };
}
