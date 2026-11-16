import { z } from 'zod';

// The office layout (Phase 14): a grid of tiles with areas (rooms with walls
// and doors) and furniture on it. The layout is configuration the user edits;
// where each agent stands at a given moment is never stored (RF-80).
//
// Tiles: x grows to the right-down and y to the left-down of the isometric
// picture. Walls run along the edges of an area; a door is a gap in one edge.

export const OFFICE_LIMITS = {
  grid: { min: 12, max: 64 },
  areas: 40,
  items: 800,
  doors: 4,
  areaSize: { min: 3 },
  areaName: 40,
  label: 40,
} as const;

export const AREA_KINDS = ['reception', 'pantry', 'project', 'focus', 'meeting', 'lounge'] as const;
export type AreaKind = (typeof AREA_KINDS)[number];

export interface AreaKindInfo {
  readonly label: string;
  /** What the area is for, in the editor. */
  readonly hint: string;
  /** How many the layout must have: exactly one, at most one, or any number. */
  readonly count: 'one' | 'optional-one' | 'any';
  /** Agents can have desks here. */
  readonly desks: boolean;
}

export const AREA_KIND_INFO: Record<AreaKind, AreaKindInfo> = {
  reception: {
    label: 'Recepção',
    hint: 'Entrada do escritório. Agente inativo fica fora, pela entrada.',
    count: 'one',
    desks: false,
  },
  pantry: {
    label: 'Copa',
    hint: 'Quem está sem tarefa há 2 minutos vem tomar um café.',
    count: 'one',
    desks: false,
  },
  project: {
    label: 'Sala de projeto',
    hint: 'Mesas dos agentes do projeto vinculado.',
    count: 'any',
    desks: true,
  },
  focus: {
    label: 'Sala de foco',
    hint: 'Como a sala de projeto, com outra decoração.',
    count: 'any',
    desks: true,
  },
  meeting: {
    label: 'Sala de reunião',
    hint: 'Durante uma delegação, quem delegou e quem recebeu a tarefa se encontram aqui.',
    count: 'optional-one',
    desks: false,
  },
  lounge: {
    label: 'Descompressão',
    hint: 'Quem está sem tarefa há 10 minutos sai da copa e vem descansar.',
    count: 'optional-one',
    desks: false,
  },
};

export const FLOORS = [
  'wood',
  'tile',
  'stone',
  'carpet_lilac',
  'carpet_blue',
  'carpet_green',
] as const;
export type Floor = (typeof FLOORS)[number];
export const FLOOR_LABELS: Record<Floor, string> = {
  wood: 'Madeira',
  tile: 'Ladrilho',
  stone: 'Pedra',
  carpet_lilac: 'Carpete lilás',
  carpet_blue: 'Carpete azul',
  carpet_green: 'Carpete verde',
};

/** What is around the office (Phase 15): it is drawn, and nobody walks there. */
export const SURROUNDINGS = ['building', 'house', 'park'] as const;
export type Surroundings = (typeof SURROUNDINGS)[number];
export const SURROUNDINGS_INFO: Record<Surroundings, { label: string; hint: string }> = {
  building: {
    label: 'Andar de prédio',
    hint: 'Fachada de vidro, os andares de baixo e a cidade ao fundo.',
  },
  house: { label: 'Casa', hint: 'Quintal com cerca, árvores, calçada e rua.' },
  park: { label: 'Parque', hint: 'Gramado, caminhos, árvores, lago e bancos.' },
};

export const SIDES = ['n', 'e', 's', 'w'] as const;
export type Side = (typeof SIDES)[number];

export const ITEM_KINDS = [
  'desk',
  'entrance',
  'plant',
  'plant_large',
  'sofa',
  'armchair',
  'coffee_table',
  'meeting_table',
  'chair',
  'bookshelf',
  'counter',
  'coffee_machine',
  'water_cooler',
  'bean_bag',
  'tv',
  'whiteboard',
  'mural',
  'rug',
] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export interface ItemKindInfo {
  readonly label: string;
  /** Tiles taken with the item facing north or south; east and west swap them. */
  readonly size: { readonly w: number; readonly d: number };
  /** Whether characters must walk around it. */
  readonly blocks: boolean;
  /** Only one in the whole layout. */
  readonly unique?: boolean;
  /** Carries a short text the user writes. */
  readonly hasLabel?: boolean;
}

export const ITEM_KIND_INFO: Record<ItemKind, ItemKindInfo> = {
  desk: { label: 'Mesa de trabalho', size: { w: 1, d: 1 }, blocks: true },
  entrance: { label: 'Entrada', size: { w: 1, d: 1 }, blocks: false, unique: true },
  plant: { label: 'Planta', size: { w: 1, d: 1 }, blocks: true },
  plant_large: { label: 'Planta grande', size: { w: 1, d: 1 }, blocks: true },
  sofa: { label: 'Sofá', size: { w: 2, d: 1 }, blocks: true },
  armchair: { label: 'Poltrona', size: { w: 1, d: 1 }, blocks: true },
  coffee_table: { label: 'Mesa de centro', size: { w: 1, d: 1 }, blocks: true },
  meeting_table: { label: 'Mesa de reunião', size: { w: 3, d: 1 }, blocks: true },
  chair: { label: 'Cadeira', size: { w: 1, d: 1 }, blocks: true },
  bookshelf: { label: 'Estante', size: { w: 1, d: 1 }, blocks: true },
  counter: { label: 'Bancada', size: { w: 1, d: 1 }, blocks: true },
  coffee_machine: { label: 'Cafeteira', size: { w: 1, d: 1 }, blocks: true },
  water_cooler: { label: 'Bebedouro', size: { w: 1, d: 1 }, blocks: true },
  bean_bag: { label: 'Pufe', size: { w: 1, d: 1 }, blocks: true },
  tv: { label: 'TV e videogame', size: { w: 1, d: 1 }, blocks: true },
  whiteboard: { label: 'Quadro branco', size: { w: 1, d: 1 }, blocks: true },
  mural: { label: 'Mural', size: { w: 2, d: 1 }, blocks: true, hasLabel: true },
  rug: { label: 'Tapete', size: { w: 2, d: 2 }, blocks: false },
};

const coordinate = z.number().int().min(0).max(OFFICE_LIMITS.grid.max);
const id = z.string().min(1).max(40);

export const doorSchema = z.strictObject({
  side: z.enum(SIDES),
  /** Tile along that side, counted from the area's corner (left or top). */
  offset: z.number().int().min(0).max(OFFICE_LIMITS.grid.max),
});
export type Door = z.infer<typeof doorSchema>;

const areaFields = {
  kind: z.enum(AREA_KINDS),
  /** Null: the project's name, or the kind's name. */
  name: z
    .string()
    .trim()
    .min(1, 'Informe o nome da área.')
    .max(OFFICE_LIMITS.areaName, `O nome pode ter até ${OFFICE_LIMITS.areaName} caracteres.`)
    .nullable(),
  x: coordinate,
  y: coordinate,
  width: z.number().int().min(OFFICE_LIMITS.areaSize.min).max(OFFICE_LIMITS.grid.max),
  height: z.number().int().min(OFFICE_LIMITS.areaSize.min).max(OFFICE_LIMITS.grid.max),
  floor: z.enum(FLOORS),
  /** Project whose agents sit here; null for agents without a project. */
  projectId: id.nullable(),
  doors: z
    .array(doorSchema)
    .min(1, 'Toda área precisa de uma porta.')
    .max(OFFICE_LIMITS.doors, `Uma área pode ter até ${OFFICE_LIMITS.doors} portas.`),
};

const itemFields = {
  kind: z.enum(ITEM_KINDS),
  x: coordinate,
  y: coordinate,
  /** For a desk, the side its chair is on. */
  facing: z.enum(SIDES),
  /** For a desk: the agent it belongs to; null means free for the room's agents. */
  agentId: id.nullable(),
  /** For a mural: what is written on it. */
  label: z
    .string()
    .trim()
    .max(OFFICE_LIMITS.label, `O texto pode ter até ${OFFICE_LIMITS.label} caracteres.`)
    .nullable(),
};

const gridSize = z
  .number()
  .int()
  .min(OFFICE_LIMITS.grid.min, `A grade precisa de pelo menos ${OFFICE_LIMITS.grid.min} ladrilhos.`)
  .max(OFFICE_LIMITS.grid.max, `A grade pode ter até ${OFFICE_LIMITS.grid.max} ladrilhos.`);

/** A layout as the client sends it: the server gives the ids. */
export const officeLayoutInputSchema = z.strictObject({
  width: gridSize,
  height: gridSize,
  surroundings: z.enum(SURROUNDINGS).default('building'),
  areas: z
    .array(z.strictObject(areaFields))
    .max(OFFICE_LIMITS.areas, `O escritório pode ter até ${OFFICE_LIMITS.areas} áreas.`),
  items: z
    .array(z.strictObject(itemFields))
    .max(OFFICE_LIMITS.items, `O escritório pode ter até ${OFFICE_LIMITS.items} móveis.`),
});
export type OfficeLayoutInput = z.infer<typeof officeLayoutInputSchema>;

export const officeAreaSchema = z.object({ id, ...areaFields });
export type OfficeArea = z.infer<typeof officeAreaSchema>;
export const officeItemSchema = z.object({ id, ...itemFields });
export type OfficeItem = z.infer<typeof officeItemSchema>;

export const officeLayoutSchema = z.object({
  width: z.number().int(),
  height: z.number().int(),
  // A server from before Phase 15 sends no surroundings: its offices were in a building.
  surroundings: z.enum(SURROUNDINGS).default('building'),
  areas: z.array(officeAreaSchema),
  items: z.array(officeItemSchema),
});
export type OfficeLayout = z.infer<typeof officeLayoutSchema>;

/** What the layout functions need: ids are optional, so an input layout works too. */
export interface LayoutShape {
  readonly width: number;
  readonly height: number;
  readonly areas: readonly (Omit<OfficeArea, 'id'> & { readonly id?: string })[];
  readonly items: readonly (Omit<OfficeItem, 'id'> & { readonly id?: string })[];
}

/** A layout as the client sends it: the same, without the ids the server gives. */
export function layoutInputOf(layout: OfficeLayout): OfficeLayoutInput {
  return {
    width: layout.width,
    height: layout.height,
    surroundings: layout.surroundings,
    areas: layout.areas.map((area) => ({
      kind: area.kind,
      name: area.name,
      x: area.x,
      y: area.y,
      width: area.width,
      height: area.height,
      floor: area.floor,
      projectId: area.projectId,
      doors: area.doors,
    })),
    items: layout.items.map((item) => ({
      kind: item.kind,
      x: item.x,
      y: item.y,
      facing: item.facing,
      agentId: item.agentId,
      label: item.label,
    })),
  };
}

export const OFFICE_PRESETS = ['complete', 'compact', 'spacious'] as const;
export type OfficePreset = (typeof OFFICE_PRESETS)[number];
export const OFFICE_PRESET_INFO: Record<OfficePreset, { label: string; hint: string }> = {
  complete: {
    label: 'Completo',
    hint: 'Recepção, copa, sala de reunião, descompressão e uma sala por projeto.',
  },
  compact: { label: 'Compacto', hint: 'Só recepção, copa e as salas dos projetos.' },
  spacious: { label: 'Amplo', hint: 'Como o completo, com mais espaço e mais plantas.' },
};
