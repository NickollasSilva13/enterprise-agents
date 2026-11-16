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
): Omit<OfficeItem, 'id'> => ({ kind, x, y, facing, agentId: null, label });

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
      thing('counter', 1, 1, 's'),
      thing('counter', 2, 1, 's'),
      thing('mural', 4, 0, 's', 'Boas ideias!'),
      ...(plants ? [thing('plant_large', 0, 0), thing('plant', 6, 4)] : []),
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
      thing('counter', 1, 0),
      thing('coffee_machine', 2, 0),
      thing('counter', 3, 0),
      thing('counter', 4, 0),
      thing('water_cooler', 6, 0),
      thing('coffee_table', 5, 2),
      ...(plants ? [thing('plant', 0, 0)] : []),
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
      thing('meeting_table', 2, 2),
      thing('chair', 2, 1, 's'),
      thing('chair', 4, 1, 's'),
      thing('plant', 6, 0),
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
      thing('rug', 2, 1),
      thing('sofa', 2, 0),
      thing('tv', 5, 1, 'w'),
      thing('bookshelf', 0, 0),
      thing('bean_bag', 4, 3),
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
  return { width: Math.min(max, width), height, areas, items };
}
