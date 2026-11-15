import type { OfficeAgent } from '@ea/shared';
import { describe, expect, it } from 'vitest';
import {
  type Box,
  type Geometry,
  MAX_WALK_SECONDS,
  PANTRY,
  PANTRY_AFTER_MS,
  type Place,
  placeOf,
  RECEPTION,
  route,
  SceneEngine,
  WALK_SPEED,
} from './scene';

const NOW = Date.parse('2026-11-13T12:00:00.000Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();

const agent = (overrides: Partial<OfficeAgent> = {}): OfficeAgent => ({
  id: 'a1',
  name: 'Ana',
  objective: '',
  state: 'idle',
  currentRun: null,
  lastError: null,
  pendingApproval: null,
  delegatingTo: [],
  idleSince: null,
  ...overrides,
});

const everyone = new Set(['a1', 'a2', 'a3']);

describe('placeOf (RF-80)', () => {
  it('keeps at the desk whoever is working, waiting, failed or idle for a short time', () => {
    for (const state of ['working', 'waiting', 'failed'] as const) {
      expect(placeOf(agent({ state }), NOW, everyone)).toEqual({ kind: 'desk' });
    }
    const recent = agent({ idleSince: ago(PANTRY_AFTER_MS - 1000) });
    expect(placeOf(recent, NOW, everyone)).toEqual({ kind: 'desk' });
    expect(placeOf(agent({ idleSince: null }), NOW, everyone)).toEqual({ kind: 'desk' });
  });

  it('sends to the pantry whoever has been idle for a while', () => {
    expect(placeOf(agent({ idleSince: ago(PANTRY_AFTER_MS) }), NOW, everyone)).toEqual({
      kind: 'pantry',
    });
    // The same data gives the same place: a reload changes nothing.
    expect(placeOf(agent({ idleSince: ago(3_600_000) }), NOW + 5000, everyone)).toEqual({
      kind: 'pantry',
    });
  });

  it('puts an inactive agent outside the office', () => {
    expect(placeOf(agent({ state: 'inactive' }), NOW, everyone)).toEqual({ kind: 'outside' });
  });

  it('turns a delegation into a visit to the desk of whoever got the task', () => {
    const delegating = agent({ state: 'working', delegatingTo: ['gone', 'a1', 'a2', 'a3'] });
    // Skips agents that are not in the office, and itself.
    expect(placeOf(delegating, NOW, everyone)).toEqual({ kind: 'visit', hostId: 'a2' });
    // Waiting for the user comes first: the decision is given at the agent's own desk.
    expect(placeOf({ ...delegating, state: 'waiting' }, NOW, everyone)).toEqual({ kind: 'desk' });
  });
});

// A small office: reception and pantry side by side on the first lane, two
// rooms on the second. Each area is 200 wide and 100 high; doors on the right.
const box = (left: number, top: number, width = 200, height = 100): Box => ({
  left,
  top,
  width,
  height,
});
const area = (left: number, top: number) => ({
  door: { x: left + 180, y: top + 20 },
  lane: top - 12,
  floor: box(left, top + 20, 200, 80),
});
const geometry: Geometry = {
  areas: new Map([
    [RECEPTION, area(40, 24)],
    [PANTRY, area(264, 24)],
    ['room-p1', area(40, 148)],
    ['room-p2', area(264, 148)],
  ]),
  desks: new Map([
    ['a1', { area: 'room-p1', box: box(50, 180, 80, 60) }],
    ['a2', { area: 'room-p1', box: box(140, 180, 80, 60) }],
    ['a3', { area: 'room-p2', box: box(274, 180, 80, 60) }],
  ]),
  entrance: { x: 60, y: 120 },
  spineX: 20,
};

const DESK: Place = { kind: 'desk' };
const PANTRY_PLACE: Place = { kind: 'pantry' };
const OUTSIDE: Place = { kind: 'outside' };
const places = (entries: Record<string, Place>) => new Map(Object.entries(entries));
const where = (engine: SceneEngine, id: string) => {
  const found = engine.positions().find((actor) => actor.id === id);
  return found ? { x: Math.round(found.x), y: Math.round(found.y) } : undefined;
};
/** Runs the engine until nobody is walking; returns every position `id` went through. */
function walk(engine: SceneEngine, id: string, stepMs = 50): { x: number; y: number }[] {
  const trail = [];
  for (let steps = 0; engine.moving && steps < 10_000; steps += 1) {
    engine.tick(stepMs);
    const at = where(engine, id);
    if (at) trail.push(at);
  }
  return trail;
}

const A1_DESK = { x: 90, y: 228 };
const A3_DESK = { x: 314, y: 228 };

describe('route', () => {
  it('goes straight to a spot in the same area', () => {
    const from = { area: 'room-p1', point: { x: 90, y: 228 } };
    const to = { area: 'room-p1', point: { x: 180, y: 240 } };
    expect(route(geometry, from, to)).toEqual([to.point]);
  });

  it('leaves by the door and follows the lane to an area on the same row', () => {
    const from = { area: 'room-p1', point: A1_DESK };
    const to = { area: 'room-p2', point: A3_DESK };
    expect(route(geometry, from, to)).toEqual([
      { x: 220, y: 168 },
      { x: 220, y: 136 },
      { x: 444, y: 136 },
      { x: 444, y: 168 },
      A3_DESK,
    ]);
  });

  it('takes the spine between areas on different rows', () => {
    const from = { area: 'room-p2', point: A3_DESK };
    const to = { area: PANTRY, point: { x: 300, y: 118 } };
    expect(route(geometry, from, to)).toEqual([
      { x: 444, y: 168 },
      { x: 444, y: 136 },
      { x: 20, y: 136 },
      { x: 20, y: 12 },
      { x: 444, y: 12 },
      { x: 444, y: 44 },
      { x: 300, y: 118 },
    ]);
  });
});

describe('SceneEngine (RF-80)', () => {
  it('puts everyone straight in place when the page loads', () => {
    const engine = new SceneEngine();
    const changed = engine.sync(
      places({ a1: DESK, a2: PANTRY_PLACE, a3: OUTSIDE }),
      geometry,
      true,
    );
    expect(changed).toBe(true);
    expect(engine.moving).toBe(false);
    expect(engine.view('a1')).toMatchObject({ seated: true, standing: false });
    expect(engine.view('a2')).toMatchObject({ seated: false, standing: true, resting: true });
    expect(engine.view('a3')).toMatchObject({ seated: false, standing: false });
    expect(where(engine, 'a1')).toEqual(A1_DESK);
    expect(where(engine, 'a2')).toEqual({ x: 291, y: 118 });
    // The same call again changes nothing.
    expect(engine.sync(places({ a1: DESK, a2: PANTRY_PLACE, a3: OUTSIDE }), geometry, true)).toBe(
      false,
    );
  });

  it('walks an idle agent from its desk to the pantry, through the doors and the corridor', () => {
    const engine = new SceneEngine();
    engine.sync(places({ a1: DESK }), geometry, true);
    engine.sync(places({ a1: PANTRY_PLACE }), geometry, true);

    // The chair empties as soon as the agent gets up.
    expect(engine.view('a1')).toMatchObject({ seated: false, standing: true, moving: true });
    const trail = walk(engine, 'a1');
    expect(trail.some((point) => point.x === 20)).toBe(true);
    expect(trail.at(-1)).toEqual({ x: 291, y: 118 });
    expect(engine.view('a1')).toMatchObject({ moving: false, resting: true });
    // Every step is short: the character never jumps.
    const jumps = trail.slice(1).map((point, index) => {
      const before = trail[index] as { x: number; y: number };
      return Math.hypot(point.x - before.x, point.y - before.y);
    });
    expect(Math.max(...jumps)).toBeLessThan(WALK_SPEED * 0.05 * 2);
  });

  it('brings a new agent in by the street door and seats it at its desk', () => {
    const engine = new SceneEngine();
    engine.sync(places({ a1: DESK }), geometry, true);
    engine.sync(places({ a1: DESK, a3: DESK }), geometry, true);

    expect(where(engine, 'a3')).toEqual({ x: 60, y: 120 });
    expect(engine.view('a3')).toMatchObject({ seated: false, standing: true, moving: true });
    expect(engine.view('a1')).toMatchObject({ seated: true });
    expect(walk(engine, 'a3').at(-1)).toEqual(A3_DESK);
    expect(engine.view('a3')).toMatchObject({ seated: true, standing: false });
  });

  it('sees a switched-off agent out by the street door', () => {
    const engine = new SceneEngine();
    engine.sync(places({ a1: DESK }), geometry, true);
    engine.sync(places({ a1: OUTSIDE }), geometry, true);
    expect(engine.view('a1')).toMatchObject({ standing: true, moving: true });
    expect(walk(engine, 'a1').at(-1)).toEqual({ x: 60, y: 120 });
    expect(engine.view('a1')).toMatchObject({ seated: false, standing: false });
  });

  it('shows a delegation as a visit and the way back with the result in hand', () => {
    const engine = new SceneEngine();
    engine.sync(places({ a1: DESK, a3: DESK }), geometry, true);
    engine.sync(places({ a1: { kind: 'visit', hostId: 'a3' }, a3: DESK }), geometry, true);
    expect(engine.view('a1')).toMatchObject({ moving: true, carrying: false });
    // Beside the desk of the host, who stays seated.
    expect(walk(engine, 'a1').at(-1)).toEqual({ x: 346, y: 240 });
    expect(engine.view('a1')).toMatchObject({ standing: true, moving: false });
    expect(engine.view('a3')).toMatchObject({ seated: true });

    engine.sync(places({ a1: DESK, a3: DESK }), geometry, true);
    expect(engine.view('a1')).toMatchObject({ moving: true, carrying: true });
    expect(walk(engine, 'a1').at(-1)).toEqual(A1_DESK);
    expect(engine.view('a1')).toMatchObject({ seated: true, carrying: false });
  });

  it('finishes the walk under way before starting the next one', () => {
    const engine = new SceneEngine();
    engine.sync(places({ a1: DESK, a3: DESK }), geometry, true);
    engine.sync(places({ a1: { kind: 'visit', hostId: 'a3' }, a3: DESK }), geometry, true);
    engine.tick(500);
    // The task came back before the visitor arrived.
    engine.sync(places({ a1: DESK, a3: DESK }), geometry, true);
    const trail = walk(engine, 'a1');
    // It still goes all the way to the host's desk (sampled every 50 ms, so "close to").
    const closest = Math.min(...trail.map((point) => Math.hypot(point.x - 346, point.y - 240)));
    expect(closest).toBeLessThan(WALK_SPEED * 0.05);
    expect(trail.at(-1)).toEqual(A1_DESK);
  });

  it('changes places without any walk when motion is reduced', () => {
    const engine = new SceneEngine();
    engine.sync(places({ a1: DESK }), geometry, false);
    engine.sync(places({ a1: PANTRY_PLACE, a2: DESK }), geometry, false);
    expect(engine.moving).toBe(false);
    expect(where(engine, 'a1')).toEqual({ x: 291, y: 118 });
    expect(engine.view('a1')).toMatchObject({ resting: true, moving: false });
    // A new agent is simply at its desk.
    expect(engine.view('a2')).toMatchObject({ seated: true });
  });

  it('gives each agent its own spot at the pantry and keeps it when others leave', () => {
    const engine = new SceneEngine();
    engine.sync(places({ a1: PANTRY_PLACE, a2: PANTRY_PLACE, a3: PANTRY_PLACE }), geometry, true);
    expect(['a1', 'a2', 'a3'].map((id) => where(engine, id))).toEqual([
      { x: 291, y: 118 },
      { x: 321, y: 118 },
      { x: 351, y: 118 },
    ]);
    engine.sync(places({ a1: DESK, a2: PANTRY_PLACE, a3: PANTRY_PLACE }), geometry, false);
    expect(where(engine, 'a2')).toEqual({ x: 321, y: 118 });
    // Whoever comes back takes the spot left free.
    engine.sync(places({ a1: PANTRY_PLACE, a2: PANTRY_PLACE, a3: PANTRY_PLACE }), geometry, false);
    expect(where(engine, 'a1')).toEqual({ x: 291, y: 118 });
  });

  it('follows the page when its layout changes, also in the middle of a walk', () => {
    const engine = new SceneEngine();
    engine.sync(places({ a1: DESK, a2: DESK }), geometry, true);
    engine.sync(places({ a1: PANTRY_PLACE, a2: DESK }), geometry, true);
    engine.tick(1000);

    const moved: Geometry = {
      ...geometry,
      desks: new Map([
        ['a1', { area: 'room-p1', box: box(50, 280, 80, 60) }],
        ['a2', { area: 'room-p1', box: box(140, 280, 80, 60) }],
      ]),
    };
    engine.relayout(moved);
    expect(where(engine, 'a2')).toEqual({ x: 180, y: 328 });
    expect(engine.moving).toBe(true);
    expect(walk(engine, 'a1').at(-1)).toEqual({ x: 291, y: 118 });
  });

  it('forgets agents that are gone and stays put while the page has no geometry', () => {
    const engine = new SceneEngine();
    engine.sync(places({ a1: DESK, a2: DESK }), null, true);
    expect(engine.view('a1')).toMatchObject({ seated: true });
    // Nowhere to walk: the change of place is immediate.
    engine.sync(places({ a1: PANTRY_PLACE }), null, true);
    expect(engine.moving).toBe(false);
    expect(engine.view('a1')).toMatchObject({ resting: true });
    expect(engine.view('a2')).toBeUndefined();
  });

  it('moves thirty agents at once and no walk takes longer than the limit', () => {
    const ids = Array.from({ length: 30 }, (_, index) => `agent-${index}`);
    const wide: Geometry = {
      ...geometry,
      desks: new Map(
        ids.map((id, index) => [
          id,
          {
            area: index % 2 === 0 ? 'room-p1' : 'room-p2',
            box: box(50 + index * 400, 180 + index * 300, 80, 60),
          },
        ]),
      ),
    };
    const engine = new SceneEngine();
    engine.sync(new Map(ids.map((id) => [id, DESK])), wide, true);
    engine.sync(new Map(ids.map((id) => [id, PANTRY_PLACE])), wide, true);
    expect(ids.every((id) => engine.view(id)?.moving)).toBe(true);

    let elapsed = 0;
    while (engine.moving && elapsed < 60_000) {
      engine.tick(16);
      elapsed += 16;
    }
    expect(elapsed).toBeLessThanOrEqual(MAX_WALK_SECONDS * 1000 + 16);
    expect(ids.every((id) => engine.view(id)?.resting)).toBe(true);
    expect(new Set(ids.map((id) => JSON.stringify(where(engine, id)))).size).toBe(30);
  });
});
