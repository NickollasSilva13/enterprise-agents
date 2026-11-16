import { describe, expect, it } from 'vitest';
import { appearanceSchema, defaultAppearance, randomAppearance } from './appearance';
import type { LayoutShape, OfficeArea, OfficeItem } from './office';
import {
  assignDesks,
  buildNav,
  canStep,
  chairOf,
  entranceOf,
  findPath,
  footprint,
  standingTiles,
  validateLayout,
} from './office-grid';
import { buildPresetLayout } from './office-presets';
import { officeSchema } from './api';
import { layoutInputOf, OFFICE_PRESETS, officeLayoutInputSchema } from './office';

const area = (fields: Partial<OfficeArea> & Pick<OfficeArea, 'kind' | 'x' | 'y'>): OfficeArea => ({
  id: `${fields.kind}-${fields.x}-${fields.y}`,
  name: null,
  width: 4,
  height: 4,
  floor: 'wood',
  projectId: null,
  doors: [{ side: 's', offset: 0 }],
  ...fields,
});

const item = (fields: Partial<OfficeItem> & Pick<OfficeItem, 'kind' | 'x' | 'y'>): OfficeItem => ({
  id: `${fields.kind}-${fields.x}-${fields.y}`,
  facing: 's',
  agentId: null,
  label: null,
  ...fields,
});

/** Reception at the left, pantry in the middle, a project room at the right; corridor below. */
function smallOffice(): LayoutShape {
  return {
    width: 16,
    height: 12,
    areas: [
      area({ kind: 'reception', x: 0, y: 0 }),
      area({ kind: 'pantry', x: 5, y: 0 }),
      area({ kind: 'project', x: 10, y: 0, width: 5, projectId: 'p1' }),
    ],
    items: [
      item({ kind: 'entrance', x: 1, y: 3 }),
      item({ kind: 'desk', x: 11, y: 2, facing: 'n' }),
      item({ kind: 'desk', x: 12, y: 2, facing: 'n' }),
    ],
  };
}

describe('the walkable map', () => {
  it('lets characters cross a wall only by a door', () => {
    const nav = buildNav(smallOffice());
    // Reception (0..3) to the corridor below (y = 4): the door is at x = 0.
    expect(canStep(nav, { x: 0, y: 3 }, { x: 0, y: 4 })).toBe(true);
    expect(canStep(nav, { x: 1, y: 3 }, { x: 1, y: 4 })).toBe(false);
    expect(canStep(nav, { x: 0, y: 4 }, { x: 0, y: 3 })).toBe(true);
    // Between rooms, along x, there is a wall and no door.
    expect(canStep(nav, { x: 3, y: 1 }, { x: 4, y: 1 })).toBe(false);
  });

  it('keeps characters off furniture, but not off rugs', () => {
    const layout = smallOffice();
    const nav = buildNav({
      ...layout,
      items: [...layout.items, item({ kind: 'rug', x: 6, y: 1 })],
    });
    expect(canStep(nav, { x: 11, y: 1 }, { x: 11, y: 2 })).toBe(false);
    expect(canStep(nav, { x: 6, y: 0 }, { x: 6, y: 1 })).toBe(true);
  });

  it('finds the shortest way through the doors, both ends included', () => {
    const nav = buildNav(smallOffice());
    const path = findPath(nav, { x: 1, y: 3 }, { x: 11, y: 1 });
    expect(path?.[0]).toEqual({ x: 1, y: 3 });
    expect(path?.at(-1)).toEqual({ x: 11, y: 1 });
    // Out by the reception door, in by the room door.
    expect(path).toContainEqual({ x: 0, y: 4 });
    expect(path).toContainEqual({ x: 10, y: 4 });
    for (let index = 1; index < (path?.length ?? 0); index += 1) {
      const [a, b] = [path![index - 1]!, path![index]!];
      expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y)).toBe(1);
      expect(canStep(nav, a, b)).toBe(true);
    }
  });

  it('has no way to a closed room', () => {
    const layout = smallOffice();
    const closed = {
      ...layout,
      areas: layout.areas.map((each) =>
        each.kind === 'project' ? { ...each, doors: [{ side: 'n' as const, offset: 0 }] } : each,
      ),
    };
    // The door on the north side opens onto the edge of the grid.
    expect(findPath(buildNav(closed), { x: 1, y: 3 }, { x: 11, y: 1 })).toBeNull();
  });

  it('lists the reachable free tiles of an area, front rows first', () => {
    const layout = smallOffice();
    const nav = buildNav(layout);
    const tiles = standingTiles(nav, layout, 1, entranceOf(layout)!);
    expect(tiles).toHaveLength(16);
    expect(tiles[0]).toEqual({ x: 5, y: 3 });
  });

  it('turns furniture with its facing', () => {
    expect(footprint({ kind: 'sofa', x: 2, y: 2, facing: 's' })).toEqual([
      { x: 2, y: 2 },
      { x: 3, y: 2 },
    ]);
    expect(footprint({ kind: 'sofa', x: 2, y: 2, facing: 'e' })).toEqual([
      { x: 2, y: 2 },
      { x: 2, y: 3 },
    ]);
    expect(chairOf({ x: 4, y: 4, facing: 'w' })).toEqual({ x: 3, y: 4 });
  });
});

describe('validation', () => {
  it('accepts a sound layout and every preset', () => {
    expect(validateLayout(smallOffice())).toEqual([]);
    for (const preset of OFFICE_PRESETS) {
      const layout = buildPresetLayout(preset, [
        { projectId: 'a', agents: 30 },
        { projectId: 'b', agents: 0 },
        { projectId: null, agents: 3 },
      ]);
      expect(validateLayout(layout), preset).toEqual([]);
    }
  });

  const messages = (layout: LayoutShape) => validateLayout(layout).map((issue) => issue.message);

  it('requires one reception, one pantry and one entrance', () => {
    const layout = smallOffice();
    expect(
      messages({
        ...layout,
        areas: layout.areas.filter((each) => each.kind !== 'pantry'),
        items: layout.items.filter((each) => each.kind !== 'entrance'),
      }),
    ).toEqual([
      'O escritório precisa de exatamente uma área "Copa".',
      'O escritório precisa de exatamente uma entrada.',
    ]);
  });

  it('refuses overlapping areas and doors that do not open onto the corridor', () => {
    const layout = smallOffice();
    const issues = validateLayout({
      ...layout,
      areas: [
        ...layout.areas,
        area({ kind: 'meeting', x: 2, y: 2, doors: [{ side: 'n', offset: 9 }] }),
      ],
    });
    expect(issues).toContainEqual({
      area: 3,
      message: 'Sala de reunião (área 4) se sobrepõe a Recepção (área 1).',
    });
    expect(issues).toContainEqual({
      area: 3,
      message: 'Sala de reunião (área 4) tem uma porta fora da parede.',
    });
  });

  it('refuses furniture on furniture, across walls, and desks without a free chair', () => {
    const layout = smallOffice();
    const issues = messages({
      ...layout,
      items: [
        ...layout.items,
        item({ kind: 'plant', x: 11, y: 2 }),
        item({ kind: 'sofa', x: 3, y: 1 }),
        item({ kind: 'desk', x: 13, y: 0, facing: 'n' }),
        item({ kind: 'desk', x: 2, y: 1 }),
      ],
    });
    expect(issues).toEqual([
      'Planta (móvel 4) ocupa o mesmo lugar que Mesa de trabalho (móvel 2).',
      'Sofá (móvel 5) atravessa uma parede.',
      'Mesa de trabalho (móvel 6) não tem lugar para a cadeira.',
      'Mesa de trabalho (móvel 7) precisa ficar numa sala de projeto ou de foco.',
    ]);
  });

  it('refuses a room that cannot be reached and a chair walled in', () => {
    const layout = smallOffice();
    const walledIn = messages({
      ...layout,
      items: [
        ...layout.items,
        item({ kind: 'plant', x: 10, y: 1 }),
        item({ kind: 'plant', x: 11, y: 0 }),
        item({ kind: 'plant', x: 12, y: 1 }),
      ],
    });
    // The third plant stands on the chair of the next desk, which is left out too.
    expect(walledIn).toEqual([
      'Não há como chegar à cadeira de Mesa de trabalho (móvel 2).',
      'Não há como chegar à cadeira de Mesa de trabalho (móvel 3).',
    ]);

    const closed = messages({
      ...layout,
      areas: layout.areas.map((each) =>
        each.kind === 'pantry' ? { ...each, doors: [{ side: 's' as const, offset: 1 }] } : each,
      ),
      items: [...layout.items, item({ kind: 'plant', x: 6, y: 3 })],
    });
    expect(closed).toEqual(['Não há como chegar a Copa (área 2) a partir da entrada.']);
  });

  it('allows one desk per agent and owners only on desks', () => {
    const layout = smallOffice();
    const issues = messages({
      ...layout,
      items: layout.items.map((each) =>
        each.kind === 'entrance' ? { ...each, agentId: 'a1' } : { ...each, agentId: 'a2' },
      ),
    });
    expect(issues).toEqual([
      'Entrada (móvel 1) não pode ter dono.',
      'Um agente não pode ter duas mesas.',
    ]);
  });
});

describe('desks', () => {
  it('gives owners their desk and everyone else the first free one of their project', () => {
    const layout = smallOffice();
    const owned = {
      ...layout,
      items: layout.items.map((each, index) => (index === 2 ? { ...each, agentId: 'b' } : each)),
    };
    const desks = assignDesks(owned, [
      { id: 'a', projectId: 'p1' },
      { id: 'b', projectId: 'p1' },
      { id: 'c', projectId: 'p1' },
      { id: 'd', projectId: null },
    ]);
    expect([...desks]).toEqual([
      ['b', 2],
      ['a', 1],
    ]);
  });

  it('frees the desk of an owner who is no longer in the office', () => {
    const layout = smallOffice();
    const owned = {
      ...layout,
      items: layout.items.map((each, index) => (index === 1 ? { ...each, agentId: 'gone' } : each)),
    };
    expect([...assignDesks(owned, [{ id: 'a', projectId: 'p1' }])]).toEqual([['a', 1]]);
  });

  it('seats every agent of the automatic layout, with a spare desk per room', () => {
    const layout = buildPresetLayout('complete', [{ projectId: 'a', agents: 30 }]);
    const agents = Array.from({ length: 31 }, (_, index) => ({ id: `${index}`, projectId: 'a' }));
    expect(assignDesks(layout, agents).size).toBe(31);
    expect(assignDesks(layout, [...agents, { id: 'x', projectId: 'a' }]).size).toBe(31);
    expect(chairOf(layout.items.find((each) => each.kind === 'desk')!)).toBeDefined();
  });
});

describe('Phase 15 contract', () => {
  it('fills the new options of a look saved before them', () => {
    const old = {
      kind: 'person',
      skin: 'tan',
      hair: 'short',
      hairColor: 'black',
      outfit: 'tshirt',
      outfitColor: 'teal',
      pants: 'denim',
      accessory: 'none',
    };
    expect(appearanceSchema.parse(old)).toEqual({
      ...old,
      eyes: 'brown',
      facialHair: 'none',
      shoes: 'black',
      pattern: 'plain',
    });
    expect(appearanceSchema.safeParse({ ...old, eyes: 'purple' }).success).toBe(false);
  });

  // Defect seen in use: the interface rebuilt for Phase 15 refused the answer of
  // a server still running Phase 14, which has no surroundings, and the office
  // did not open.
  it('reads the office of a server from before Phase 15', () => {
    const older: Record<string, unknown> = { ...buildPresetLayout('compact', []) };
    delete older.surroundings;
    const answer = officeSchema.parse({
      layout: older,
      customized: true,
      projects: [],
      agents: [
        {
          id: 'a1',
          name: 'Ana',
          objective: '',
          projectId: null,
          appearance: {
            kind: 'person',
            skin: 'tan',
            hair: 'short',
            hairColor: 'black',
            outfit: 'tshirt',
            outfitColor: 'teal',
            pants: 'denim',
            accessory: 'none',
          },
          state: 'idle',
          currentRun: null,
          lastError: null,
          pendingApproval: null,
          delegatingTo: [],
          idleSince: null,
        },
      ],
    });
    expect(answer.layout.surroundings).toBe('building');
    expect(answer.agents[0]?.appearance).toMatchObject({ eyes: 'brown', pattern: 'plain' });
  });

  it('puts the office in a building unless told otherwise', () => {
    const layout = buildPresetLayout('compact', []);
    expect(layout.surroundings).toBe('building');
    const without: Record<string, unknown> = { ...layoutInputOf(layout) };
    delete without.surroundings;
    expect(officeLayoutInputSchema.parse(without).surroundings).toBe('building');
    expect(officeLayoutInputSchema.parse({ ...without, surroundings: 'park' }).surroundings).toBe(
      'park',
    );
    expect(officeLayoutInputSchema.safeParse({ ...without, surroundings: 'moon' }).success).toBe(
      false,
    );
  });
});

describe('appearance', () => {
  it('draws the same robot from the same id', () => {
    expect(defaultAppearance('agent-1')).toEqual(defaultAppearance('agent-1'));
    expect(defaultAppearance('agent-1').kind).toBe('robot');
  });

  it('draws a person from any random source', () => {
    expect(randomAppearance(() => 0)).toMatchObject({ kind: 'person', skin: 'porcelain' });
    expect(randomAppearance(() => 0.9999)).toMatchObject({ kind: 'person', accessory: 'cap' });
  });
});
