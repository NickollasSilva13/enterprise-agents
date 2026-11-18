import type { OfficeAgent } from '@ea/shared';

// The living office (RF-80). Everything here is presentation: where each
// agent is comes only from the state the server already reports, so a reload
// puts everyone back in the same place. Nothing is stored.
//
// Two parts, both free of the DOM so they can be tested as plain functions:
//   placeOf      decides where an agent should be;
//   SceneEngine  walks each character from where it is to where it should be,
//                in tile coordinates, along the ways the layout allows.

/** How long an agent stays at its desk with nothing to do before going for a coffee. */
export const PANTRY_AFTER_MS = 2 * 60_000;
/** How long before it leaves the pantry to rest in the lounge, when the office has one. */
export const LOUNGE_AFTER_MS = 10 * 60_000;

export type Place =
  | { readonly kind: 'desk' }
  | { readonly kind: 'pantry' }
  | { readonly kind: 'lounge' }
  | { readonly kind: 'meeting' }
  | { readonly kind: 'outside' }
  /** At the reception: the agent has no desk in the layout. */
  | { readonly kind: 'lobby' }
  | { readonly kind: 'visit'; readonly hostId: string }
  /** In the room of another area, taking it a request (Phase 17). */
  | { readonly kind: 'room'; readonly areaId: string };

export const placeKey = (place: Place): string =>
  place.kind === 'visit'
    ? `visit:${place.hostId}`
    : place.kind === 'room'
      ? `room:${place.areaId}`
      : place.kind;

/** Which rooms with a behaviour of their own the layout has. */
export interface OfficeFeatures {
  readonly meeting: boolean;
  readonly lounge: boolean;
  /** Areas (projects) that have a room in the layout. */
  readonly rooms?: ReadonlySet<string>;
}

/**
 * Where an agent should be right now. `present` holds the ids of every agent
 * in the office; `helping` the ids of agents doing a task someone present
 * delegated to them.
 */
export function placeOf(
  agent: OfficeAgent,
  now: number,
  present: ReadonlySet<string>,
  helping: ReadonlySet<string>,
  features: OfficeFeatures,
): Place {
  if (agent.state === 'inactive') return { kind: 'outside' };
  // Taking a request to another area: off to its room for a moment, if it has one.
  const visit = agent.visit;
  if (visit && now < Date.parse(visit.until) && features.rooms?.has(visit.areaId)) {
    return { kind: 'room', areaId: visit.areaId };
  }
  if (agent.state === 'working') {
    // A delegation is a meeting, or a visit to the desk of whoever does the task.
    const hostId = agent.delegatingTo.find((id) => id !== agent.id && present.has(id));
    if (hostId !== undefined)
      return features.meeting ? { kind: 'meeting' } : { kind: 'visit', hostId };
    if (features.meeting && helping.has(agent.id)) return { kind: 'meeting' };
  }
  if (agent.state === 'idle' && agent.idleSince !== null) {
    const idleFor = now - Date.parse(agent.idleSince);
    if (features.lounge && idleFor >= LOUNGE_AFTER_MS) return { kind: 'lounge' };
    if (idleFor >= PANTRY_AFTER_MS) return { kind: 'pantry' };
  }
  return { kind: 'desk' };
}

/**
 * Where every agent should be. Agents the layout has no desk for wait at the
 * reception instead of their desk.
 */
export function placesOf(
  agents: readonly OfficeAgent[],
  now: number,
  features: OfficeFeatures,
  seated: ReadonlySet<string>,
): Map<string, Place> {
  const present = new Set(agents.map((agent) => agent.id));
  const helping = new Set<string>();
  for (const agent of agents) {
    if (agent.state !== 'working') continue;
    for (const id of agent.delegatingTo) if (id !== agent.id) helping.add(id);
  }
  return new Map(
    agents.map((agent) => {
      const place = placeOf(agent, now, present, helping, features);
      return [agent.id, place.kind === 'desk' && !seated.has(agent.id) ? { kind: 'lobby' } : place];
    }),
  );
}

// ---------------------------------------------------------------------------
// Geometry: what the engine needs to know of the layout.

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Geometry {
  /** The point a character stands on at a place; null while the layout has no such place. */
  spot(agentId: string, place: Place, slot: number): Point | null;
  /** The points to walk through from one point to another, the last being `to`. */
  path(from: Point, to: Point): Point[];
}

function lengthOf(path: readonly Point[]): number {
  let total = 0;
  for (let index = 1; index < path.length; index += 1) {
    const a = path[index - 1] as Point;
    const b = path[index] as Point;
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}

/** The point at `distance` along the path, and the direction of that stretch. */
function pointAt(
  path: readonly Point[],
  distance: number,
): { point: Point; dx: number; dy: number } {
  let left = distance;
  for (let index = 1; index < path.length; index += 1) {
    const a = path[index - 1] as Point;
    const b = path[index] as Point;
    const segment = Math.hypot(b.x - a.x, b.y - a.y);
    if (left <= segment && segment > 0) {
      const t = left / segment;
      return {
        point: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t },
        dx: b.x - a.x,
        dy: b.y - a.y,
      };
    }
    left -= segment;
  }
  return { point: path.at(-1) ?? { x: 0, y: 0 }, dx: 0, dy: 1 };
}

// ---------------------------------------------------------------------------
// The engine.

/** Tiles per second. */
export const WALK_SPEED = 3.2;
/** No walk takes longer than this: long ways are walked faster. */
export const MAX_WALK_SECONDS = 7;

interface Leg {
  readonly from: Place;
  readonly fromSlot: number;
  readonly to: Place;
  readonly toSlot: number;
}

/**
 * Which way a character looks on screen: down-left (+y), down-right (+x),
 * up-left (-x) or up-right (-y).
 */
export type Heading = 'sw' | 'se' | 'nw' | 'ne';

interface Actor {
  readonly id: string;
  /** Where it is, or where it is going when `legs` is not empty. */
  at: Place;
  /** Which standing spot it has at a place shared with others. */
  slot: number;
  /** What is left to walk; empty when it has arrived. */
  legs: Leg[];
  path: Point[];
  length: number;
  traveled: number;
  speed: number;
  x: number;
  y: number;
  /** The way it walks. */
  heading: Heading;
  /** Coming back from a visit or a meeting, with the result in hand. */
  carrying: boolean;
}

export interface ActorView {
  /** Sitting at its own desk. */
  readonly seated: boolean;
  /** Drawn as a standing character, away from its chair. */
  readonly standing: boolean;
  readonly moving: boolean;
  readonly carrying: boolean;
  /** Having a coffee at the pantry. */
  readonly resting: boolean;
  readonly heading: Heading;
  /** Drawing order: characters on a higher band are in front. */
  readonly band: number;
}

const OUTSIDE: Place = { kind: 'outside' };

/** The way of a stretch of walk; steps on the grid go along one axis. */
export const headingOf = (dx: number, dy: number): Heading =>
  Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'se' : 'nw') : dy > 0 ? 'sw' : 'ne';

export const bandOf = (x: number, y: number): number => Math.floor(x) + Math.floor(y);

export class SceneEngine {
  private readonly actors = new Map<string, Actor>();
  private geometry: Geometry | null = null;
  private started = false;

  /**
   * Brings the cast in line with where each agent should be. Agents seen in
   * the first call are put straight in place (the page has just loaded);
   * later arrivals come in by the street door. With `animate` off (the
   * "reduce motion" preference) every change is a change of place, no walk.
   * Returns whether anything the page draws from `view` has changed.
   */
  sync(targets: ReadonlyMap<string, Place>, geometry: Geometry | null, animate: boolean): boolean {
    const relaid = geometry !== this.geometry;
    this.geometry = geometry;
    let changed = false;
    for (const id of [...this.actors.keys()]) {
      if (targets.has(id)) continue;
      this.actors.delete(id);
      changed = true;
    }
    for (const [id, target] of targets) {
      const actor = this.actors.get(id);
      if (!actor) {
        const walksIn = this.started && animate && target.kind !== 'outside';
        const fresh: Actor = {
          id,
          at: walksIn ? OUTSIDE : target,
          slot: 0,
          legs: [],
          path: [],
          length: 0,
          traveled: 0,
          speed: WALK_SPEED,
          x: 0,
          y: 0,
          heading: 'sw',
          carrying: false,
        };
        if (!walksIn) fresh.slot = this.freeSlot(target, id);
        this.actors.set(id, fresh);
        this.settle(fresh);
        if (walksIn) this.send(fresh, target, true);
        changed = true;
      } else if (placeKey(actor.at) !== placeKey(target)) {
        this.send(actor, target, animate);
        changed = true;
      }
    }
    this.started = true;
    if (relaid) {
      // A new layout: whoever is standing still takes its place on it at once.
      for (const actor of this.actors.values()) if (actor.legs.length === 0) this.settle(actor);
      changed = true;
    }
    return changed;
  }

  /** Advances every walk by `elapsedMs`. `changed` says whether any `view` changed. */
  tick(elapsedMs: number): { moving: boolean; changed: boolean } {
    let changed = false;
    for (const actor of this.actors.values()) {
      if (actor.legs.length === 0) continue;
      const band = bandOf(actor.x, actor.y);
      const heading = actor.heading;
      actor.traveled += (actor.speed * elapsedMs) / 1000;
      if (actor.traveled >= actor.length) {
        this.settle(actor);
        changed = true;
      } else {
        this.position(actor);
        if (band !== bandOf(actor.x, actor.y) || heading !== actor.heading) changed = true;
      }
    }
    return { moving: this.moving, changed };
  }

  get moving(): boolean {
    for (const actor of this.actors.values()) if (actor.legs.length > 0) return true;
    return false;
  }

  view(id: string): ActorView | undefined {
    const actor = this.actors.get(id);
    if (!actor) return undefined;
    const moving = actor.legs.length > 0;
    const { kind } = actor.at;
    return {
      seated: !moving && kind === 'desk',
      standing: moving || (kind !== 'desk' && kind !== 'outside'),
      moving,
      carrying: moving && actor.carrying,
      resting: !moving && kind === 'pantry',
      heading: moving ? actor.heading : 'sw',
      band: bandOf(actor.x, actor.y),
    };
  }

  positions(): { id: string; x: number; y: number }[] {
    return [...this.actors.values()].map(({ id, x, y }) => ({ id, x, y }));
  }

  private send(actor: Actor, target: Place, animate: boolean): void {
    const slot = this.freeSlot(target, actor.id);
    const leg: Leg = { from: actor.at, fromSlot: actor.slot, to: target, toSlot: slot };
    const from = actor.at.kind;
    actor.carrying = (from === 'visit' || from === 'meeting') && target.kind === 'desk';
    actor.at = target;
    actor.slot = slot;
    if (!animate) return this.settle(actor);

    // A walk already under way is finished first, then the new one follows.
    actor.legs.push(leg);
    const path = this.pathOf(actor);
    const length = path ? lengthOf(path) : 0;
    if (!path || length - actor.traveled < 0.05) return this.settle(actor);
    actor.path = path;
    actor.length = length;
    actor.speed = Math.max(WALK_SPEED, (length - actor.traveled) / MAX_WALK_SECONDS);
    this.position(actor);
  }

  private settle(actor: Actor): void {
    actor.legs = [];
    actor.path = [];
    actor.length = 0;
    actor.traveled = 0;
    actor.carrying = false;
    actor.heading = 'sw';
    const spot = this.geometry?.spot(actor.id, actor.at, actor.slot);
    if (spot) {
      actor.x = spot.x;
      actor.y = spot.y;
    }
  }

  private position(actor: Actor): void {
    const { point, dx, dy } = pointAt(actor.path, actor.traveled);
    actor.x = point.x;
    actor.y = point.y;
    actor.heading = headingOf(dx, dy);
  }

  /** The whole way of an actor's pending legs; null when a place is not in the layout. */
  private pathOf(actor: Actor): Point[] | null {
    const { geometry } = this;
    const first = actor.legs[0];
    if (!geometry || !first) return null;
    const start = geometry.spot(actor.id, first.from, first.fromSlot);
    if (!start) return null;
    const path = [start];
    for (const leg of actor.legs) {
      const from = geometry.spot(actor.id, leg.from, leg.fromSlot);
      const to = geometry.spot(actor.id, leg.to, leg.toSlot);
      if (!from || !to) return null;
      path.push(...geometry.path(from, to));
    }
    return path;
  }

  /** The lowest standing spot nobody else has at a shared place. */
  private freeSlot(place: Place, agentId: string): number {
    if (place.kind === 'desk' || place.kind === 'outside') return 0;
    const key = placeKey(place);
    const taken = new Set<number>();
    for (const other of this.actors.values()) {
      if (other.id !== agentId && placeKey(other.at) === key) taken.add(other.slot);
    }
    let slot = 0;
    while (taken.has(slot)) slot += 1;
    return slot;
  }
}
