import { buildPresetLayout, type OfficeLayout, validateLayout } from '@ea/shared';
import { describe, expect, it } from 'vitest';
import { clampView, fitZoom, visibleRect } from '../viewport';
import {
  areaAt,
  type EditorAction,
  editorReducer,
  initialEditor,
  itemAt,
  toInput,
  wallAt,
} from './editor-state';

const base = (): OfficeLayout => buildPresetLayout('compact', [{ projectId: 'p1', agents: 2 }]);

const run = (layout: OfficeLayout, ...actions: EditorAction[]) =>
  actions.reduce(editorReducer, initialEditor(layout));

describe('office editor state', () => {
  it('adds an area of at least the smallest size, inside the grid, with a door, and selects it', () => {
    const state = run(base(), {
      type: 'add-area',
      kind: 'lounge',
      x: 200,
      y: 0,
      width: 1,
      height: 2,
    });
    const area = state.present.areas.at(-1);
    expect(area).toMatchObject({
      kind: 'lounge',
      width: 3,
      height: 3,
      floor: 'carpet_lilac',
      doors: [{ side: 's', offset: 1 }],
    });
    expect(area?.x).toBe(state.present.width - 3);
    expect(state.selection).toEqual({ kind: 'area', id: area?.id });
    expect(state.dirty).toBe(true);
  });

  it('moves an area with its furniture, and keeps it in the grid', () => {
    const layout = base();
    const room = layout.areas.find((area) => area.kind === 'project')!;
    const inside = layout.items.filter((item) => areaAt(layout, item)?.id === room.id).length;
    const state = run(layout, {
      type: 'move',
      selection: { kind: 'area', id: room.id },
      dx: 0,
      dy: 1,
    });
    const moved = state.present.areas.find((area) => area.id === room.id)!;
    expect(moved.y).toBe(room.y + 1);
    expect(
      state.present.items.filter((item) => areaAt(state.present, item)?.id === room.id),
    ).toHaveLength(inside);
    const far = run(layout, {
      type: 'move',
      selection: { kind: 'area', id: room.id },
      dx: -500,
      dy: 0,
    });
    expect(far.present.areas.find((area) => area.id === room.id)?.x).toBe(0);
  });

  it('places, turns and removes furniture; a mural comes with its text', () => {
    let state = run(base(), { type: 'add-item', kind: 'mural', x: 0, y: 0 });
    const id = state.selection?.id ?? '';
    expect(state.present.items.at(-1)).toMatchObject({
      kind: 'mural',
      facing: 's',
      label: 'Boas ideias!',
    });
    state = editorReducer(state, { type: 'rotate', id });
    expect(state.present.items.at(-1)?.facing).toBe('w');
    state = editorReducer(state, { type: 'remove', selection: { kind: 'item', id } });
    expect(state.present.items.some((item) => item.id === id)).toBe(false);
    expect(state.selection).toBeNull();
  });

  it('opens and closes doors, up to the limit', () => {
    const layout = base();
    const room = layout.areas[0]!;
    let state = run(layout, { type: 'toggle-door', id: room.id, side: 'n', offset: 1 });
    expect(state.present.areas[0]?.doors).toContainEqual({ side: 'n', offset: 1 });
    state = editorReducer(state, { type: 'toggle-door', id: room.id, side: 'n', offset: 1 });
    expect(state.present.areas[0]?.doors).toEqual(room.doors);
    for (const offset of [0, 1, 2, 3, 4]) {
      state = editorReducer(state, { type: 'toggle-door', id: room.id, side: 'w', offset });
    }
    expect(state.present.areas[0]?.doors).toHaveLength(4);
  });

  it('undoes and redoes, and selecting is not a change', () => {
    const layout = base();
    let state = run(layout, { type: 'grid', width: 30, height: 999 });
    expect(state.present).toMatchObject({ width: 30, height: 64 });
    state = editorReducer(state, {
      type: 'select',
      selection: { kind: 'area', id: layout.areas[0]!.id },
    });
    expect(state.past).toHaveLength(1);
    state = editorReducer(state, { type: 'undo' });
    expect(state.present).toBe(layout);
    state = editorReducer(state, { type: 'redo' });
    expect(state.present.width).toBe(30);
    // A new change drops what could be redone.
    state = editorReducer(editorReducer(state, { type: 'undo' }), {
      type: 'grid',
      width: 20,
      height: 20,
    });
    expect(state.future).toEqual([]);
  });

  it('replaces everything with a preset, and loading a saved layout is clean again', () => {
    const preset = buildPresetLayout('spacious', []);
    let state = run(base(), { type: 'replace', layout: preset });
    expect(state.present).toBe(preset);
    expect(state.dirty).toBe(true);
    state = editorReducer(state, { type: 'load', layout: preset });
    expect(state).toMatchObject({ dirty: false, past: [], future: [] });
  });

  it('sends the layout without ids, and a preset stays valid through the editor', () => {
    const input = toInput(base());
    expect(JSON.stringify(input)).not.toContain('preset-');
    expect(validateLayout(input)).toEqual([]);
  });

  it('finds what is on a tile: standing furniture before a rug, then the area', () => {
    const layout = buildPresetLayout('complete', []);
    const sofa = layout.items.find((item) => item.kind === 'sofa')!;
    const rug = layout.items.find((item) => item.kind === 'rug')!;
    expect(itemAt(layout, sofa)?.kind).toBe('sofa');
    expect(itemAt(layout, { x: rug.x + 1, y: rug.y + 1 })?.kind).toBe('rug');
    expect(itemAt(layout, { x: 0, y: 0 })).toBeNull();
    expect(areaAt(layout, { x: 0, y: 0 })).toBeNull();
    expect(areaAt(layout, sofa)?.kind).toBe('lounge');
  });

  it('picks the wall nearest to the pointer on the edge of an area', () => {
    const area = { x: 2, y: 2, width: 4, height: 3 };
    expect(wallAt(area, { x: 3.5, y: 2.2 })).toEqual({ side: 'n', offset: 1 });
    expect(wallAt(area, { x: 5.8, y: 3.5 })).toEqual({ side: 'e', offset: 1 });
    // A corner: the closer side wins.
    expect(wallAt(area, { x: 2.1, y: 4.6 })).toEqual({ side: 'w', offset: 2 });
    expect(wallAt(area, { x: 2.6, y: 4.9 })).toEqual({ side: 's', offset: 0 });
    expect(wallAt(area, { x: 3.5, y: 3.5 })).toBeNull();
  });
});

describe('viewport', () => {
  const bounds = { x: -100, y: -50, width: 400, height: 200 };
  it('fits the office in the box and keeps the centre over it', () => {
    expect(fitZoom(bounds, { width: 800, height: 800 })).toBe(2);
    const view = clampView({ cx: 1000, cy: -1000, zoom: 99 }, bounds, 1);
    expect(view).toEqual({ cx: 300, cy: -50, zoom: 6 });
    expect(visibleRect({ cx: 0, cy: 0, zoom: 2 }, { width: 800, height: 400 })).toEqual({
      x: -200,
      y: -100,
      width: 400,
      height: 200,
    });
  });
});
