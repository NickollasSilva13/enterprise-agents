import { buildNav, buildPresetLayout, canStep, type OfficeAgent } from '@ea/shared';
import { describe, expect, it } from 'vitest';
import { buildGeometry } from './geometry';
import {
  type Geometry,
  headingOf,
  LOUNGE_AFTER_MS,
  MAX_WALK_SECONDS,
  PANTRY_AFTER_MS,
  type Place,
  placeOf,
  placesOf,
  type Point,
  SceneEngine,
  WALK_SPEED,
} from './scene';

const NOW = Date.parse('2026-11-14T12:00:00.000Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();

const agent = (overrides: Partial<OfficeAgent> & { id: string }): OfficeAgent => ({
  name: overrides.id,
  objective: '',
  projectId: 'p1',
  appearance: null,
  state: 'idle',
  currentRun: null,
  lastError: null,
  pendingApproval: null,
  delegatingTo: [],
  idleSince: null,
  ...overrides,
});

const FULL = { meeting: true, lounge: true };
const BARE = { meeting: false, lounge: false };
const none = new Set<string>();

describe('placeOf (RF-80)', () => {
  const present = new Set(['a', 'b']);
  it('sends idle agents to the pantry, then to the lounge when there is one', () => {
    const at = (idleFor: number, features = FULL) =>
      placeOf(agent({ id: 'a', idleSince: ago(idleFor) }), NOW, present, none, features).kind;
    expect(at(PANTRY_AFTER_MS - 1)).toBe('desk');
    expect(at(PANTRY_AFTER_MS)).toBe('pantry');
    expect(at(LOUNGE_AFTER_MS)).toBe('lounge');
    expect(at(LOUNGE_AFTER_MS, BARE)).toBe('pantry');
  });

  it('keeps inactive agents outside, and failing or waiting ones at the desk', () => {
    expect(placeOf(agent({ id: 'a', state: 'inactive' }), NOW, present, none, FULL).kind).toBe(
      'outside',
    );
    expect(placeOf(agent({ id: 'a', state: 'failed' }), NOW, present, none, FULL).kind).toBe(
      'desk',
    );
    expect(placeOf(agent({ id: 'a', state: 'waiting' }), NOW, present, none, FULL).kind).toBe(
      'desk',
    );
  });

  it('turns a delegation into a meeting, or a visit without a meeting room', () => {
    const delegator = agent({ id: 'a', state: 'working', delegatingTo: ['b'] });
    expect(placeOf(delegator, NOW, present, none, FULL)).toEqual({ kind: 'meeting' });
    expect(placeOf(delegator, NOW, present, none, BARE)).toEqual({ kind: 'visit', hostId: 'b' });
    const helper = agent({ id: 'b', state: 'working' });
    expect(placeOf(helper, NOW, present, new Set(['b']), FULL)).toEqual({ kind: 'meeting' });
    expect(placeOf(helper, NOW, present, new Set(['b']), BARE)).toEqual({ kind: 'desk' });
    // Delegating to someone not in the office (or to itself) is no visit.
    expect(
      placeOf(
        agent({ id: 'a', state: 'working', delegatingTo: ['x', 'a'] }),
        NOW,
        present,
        none,
        BARE,
      ).kind,
    ).toBe('desk');
  });

  it('puts agents without a desk at the reception, and finds who is helping whom', () => {
    const places = placesOf(
      [
        agent({ id: 'a', state: 'working', delegatingTo: ['b'] }),
        agent({ id: 'b', state: 'working' }),
        agent({ id: 'c' }),
        agent({ id: 'd', state: 'inactive' }),
      ],
      NOW,
      FULL,
      new Set(['a', 'b', 'd']),
    );
    expect(Object.fromEntries([...places].map(([id, place]) => [id, place.kind]))).toEqual({
      a: 'meeting',
      b: 'meeting',
      c: 'lobby',
      d: 'outside',
    });
  });
});

/** A straight line of spots: desk at x = 0, pantry at x = 10, outside at x = 20. */
function lineGeometry(): Geometry {
  const x: Record<string, number> = {
    desk: 0,
    pantry: 10,
    outside: 20,
    lounge: 30,
    meeting: 40,
    lobby: 18,
  };
  return {
    spot: (_id: string, place: Place, slot: number): Point | null =>
      place.kind === 'visit' ? { x: 5, y: slot } : { x: x[place.kind] ?? 0, y: slot },
    path: (_from: Point, to: Point) => [to],
  };
}

const places = (entries: Record<string, Place['kind']>) =>
  new Map(Object.entries(entries).map(([id, kind]) => [id, { kind } as Place]));

describe('SceneEngine', () => {
  it('puts everyone in place at once on the first sync', () => {
    const engine = new SceneEngine();
    engine.sync(places({ a: 'desk', b: 'pantry', c: 'outside' }), lineGeometry(), true);
    expect(engine.moving).toBe(false);
    expect(engine.view('a')).toMatchObject({ seated: true, standing: false });
    expect(engine.view('b')).toMatchObject({ seated: false, standing: true, resting: true });
    expect(engine.view('c')).toMatchObject({ seated: false, standing: false });
  });

  it('walks to the new place, at walking speed, and sits on arrival', () => {
    const engine = new SceneEngine();
    const geometry = lineGeometry();
    engine.sync(places({ a: 'desk' }), geometry, true);
    engine.sync(places({ a: 'pantry' }), geometry, true);
    expect(engine.view('a')).toMatchObject({ moving: true, standing: true, seated: false });
    engine.tick(1000);
    expect(engine.positions()[0]?.x).toBeCloseTo(WALK_SPEED);
    engine.tick(10_000);
    expect(engine.view('a')).toMatchObject({ moving: false, resting: true });
    engine.sync(places({ a: 'desk' }), geometry, true);
    engine.tick(10_000);
    expect(engine.view('a')).toMatchObject({ seated: true });
  });

  it('never walks for more than the longest walk', () => {
    const engine = new SceneEngine();
    const geometry = lineGeometry();
    engine.sync(places({ a: 'desk' }), geometry, true);
    engine.sync(places({ a: 'meeting' }), geometry, true);
    engine.tick(MAX_WALK_SECONDS * 1000);
    expect(engine.moving).toBe(false);
  });

  it('changes place without walking when motion is reduced', () => {
    const engine = new SceneEngine();
    const geometry = lineGeometry();
    engine.sync(places({ a: 'desk' }), geometry, false);
    engine.sync(places({ a: 'outside' }), geometry, false);
    expect(engine.moving).toBe(false);
    expect(engine.positions()[0]?.x).toBe(20);
  });

  it('brings newcomers in by the street door, after the first sync', () => {
    const engine = new SceneEngine();
    const geometry = lineGeometry();
    engine.sync(places({ a: 'desk' }), geometry, true);
    engine.sync(places({ a: 'desk', b: 'desk' }), geometry, true);
    expect(engine.view('b')?.moving).toBe(true);
    expect(engine.positions().find((each) => each.id === 'b')?.x).toBe(20);
  });

  it('gives each one at a shared place a spot of its own', () => {
    const engine = new SceneEngine();
    engine.sync(places({ a: 'pantry', b: 'pantry', c: 'pantry' }), lineGeometry(), true);
    expect(engine.positions().map((each) => each.y)).toEqual([0, 1, 2]);
  });

  it('comes back from a meeting with the result in hand', () => {
    const engine = new SceneEngine();
    const geometry = lineGeometry();
    engine.sync(places({ a: 'meeting' }), geometry, true);
    engine.sync(places({ a: 'desk' }), geometry, true);
    expect(engine.view('a')).toMatchObject({ moving: true, carrying: true });
  });

  it('reports a change when a walker turns or reaches another drawing band', () => {
    const engine = new SceneEngine();
    const geometry: Geometry = {
      spot: (_id, place) => (place.kind === 'desk' ? { x: 0.5, y: 0.5 } : { x: 0.5, y: 5.5 }),
      path: (from, to) => [{ x: from.x, y: to.y }, to],
    };
    engine.sync(places({ a: 'pantry' }), geometry, true);
    engine.sync(places({ a: 'desk' }), geometry, true);
    // Walking toward -y, up and to the right on screen.
    expect(engine.view('a')?.heading).toBe('ne');
    const first = engine.view('a')?.band;
    const { changed } = engine.tick(500);
    expect(changed).toBe(true);
    expect(engine.view('a')?.band).not.toBe(first);
  });
});

describe('headingOf', () => {
  it('looks the way of the step, along the grid', () => {
    expect(headingOf(1, 0)).toBe('se');
    expect(headingOf(-1, 0)).toBe('nw');
    expect(headingOf(0, 1)).toBe('sw');
    expect(headingOf(0, -1)).toBe('ne');
  });
});

describe('buildGeometry on a real layout', () => {
  const layout = buildPresetLayout('complete', [{ projectId: 'p1', agents: 2 }]);
  const geometry = buildGeometry(layout, [
    { id: 'a', projectId: 'p1' },
    { id: 'b', projectId: 'p1' },
    { id: 'c', projectId: 'nowhere' },
  ]);

  it('seats agents at the desks of their project, and not the others', () => {
    expect([...geometry.seats.keys()]).toEqual(['a', 'b']);
    expect(geometry.spot('a', { kind: 'desk' }, 0)).toEqual({
      x: (geometry.seats.get('a')?.chair.x ?? 0) + 0.5,
      y: (geometry.seats.get('a')?.chair.y ?? 0) + 0.5,
    });
    expect(geometry.spot('c', { kind: 'desk' }, 0)).toBeNull();
    expect(geometry.features).toEqual({ meeting: true, lounge: true });
  });

  it('has spots in every common room and beside a colleague’s chair', () => {
    for (const kind of ['pantry', 'lounge', 'meeting', 'lobby', 'outside'] as const) {
      expect(geometry.spot('a', { kind }, 0), kind).not.toBeNull();
    }
    const beside = geometry.spot('a', { kind: 'visit', hostId: 'b' }, 0);
    const chair = geometry.seats.get('b')?.chair;
    expect(
      beside && chair && Math.abs(beside.x - 0.5 - chair.x) + Math.abs(beside.y - 0.5 - chair.y),
    ).toBe(1);
  });

  it('walks from the street door to a desk by allowed steps only', () => {
    const from = geometry.spot('a', { kind: 'outside' }, 0);
    const to = geometry.spot('a', { kind: 'desk' }, 0);
    expect(from && to).toBeTruthy();
    const path = geometry.path(from as Point, to as Point);
    expect(path.at(-1)).toEqual(to);
    const nav = buildNav(layout);
    const tiles = [from as Point, ...path].map((point) => ({
      x: Math.floor(point.x),
      y: Math.floor(point.y),
    }));
    for (let index = 1; index < tiles.length; index += 1) {
      expect(canStep(nav, tiles[index - 1]!, tiles[index]!)).toBe(true);
    }
  });
});
