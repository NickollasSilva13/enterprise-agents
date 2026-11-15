import type { Office, OfficeAgent } from '@ea/shared';

// The living office (RF-80). Everything here is presentation: where each
// agent is comes only from the state the server already reports, so a reload
// puts everyone back in the same place. Nothing is stored.
//
// Two parts, both free of the DOM so they can be tested as plain functions:
//   placeOf      decides where an agent should be;
//   SceneEngine  walks each character from where it is to where it should be.

/** How long an agent stays at its desk with nothing to do before going for a coffee. */
export const PANTRY_AFTER_MS = 2 * 60_000;

export type Place =
  | { readonly kind: 'desk' }
  | { readonly kind: 'pantry' }
  | { readonly kind: 'outside' }
  | { readonly kind: 'visit'; readonly hostId: string };

export const placeKey = (place: Place): string =>
  place.kind === 'visit' ? `visit:${place.hostId}` : place.kind;

/** Where an agent should be right now. `present` holds the ids of every agent in the office. */
export function placeOf(agent: OfficeAgent, now: number, present: ReadonlySet<string>): Place {
  if (agent.state === 'inactive') return { kind: 'outside' };
  if (agent.state === 'working') {
    // A delegation is a visit: the agent waits at the desk of whoever is doing the task.
    const hostId = agent.delegatingTo.find((id) => id !== agent.id && present.has(id));
    if (hostId !== undefined) return { kind: 'visit', hostId };
  }
  if (agent.state === 'idle' && agent.idleSince !== null) {
    const idleFor = now - Date.parse(agent.idleSince);
    if (idleFor >= PANTRY_AFTER_MS) return { kind: 'pantry' };
  }
  return { kind: 'desk' };
}

export function placesOf(office: Office, now: number): Map<string, Place> {
  const agents = office.rooms.flatMap((room) => room.agents);
  const present = new Set(agents.map((agent) => agent.id));
  return new Map(agents.map((agent) => [agent.id, placeOf(agent, now, present)]));
}

// ---------------------------------------------------------------------------
// Geometry: measured from the page by the component, in pixels.

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Box {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface AreaGeometry {
  /** Foot of the door on the area's wall. */
  readonly door: Point;
  /** Height of the corridor lane that runs along that wall. */
  readonly lane: number;
  readonly floor: Box;
}

export interface Geometry {
  readonly areas: ReadonlyMap<string, AreaGeometry>;
  readonly desks: ReadonlyMap<string, { readonly area: string; readonly box: Box }>;
  /** The street door, in the reception. */
  readonly entrance: Point | null;
  /** The corridor that joins every lane. */
  readonly spineX: number;
}

export const RECEPTION = 'reception';
export const PANTRY = 'pantry';

const PANTRY_SPACING = 30;
const PANTRY_ROW_STEP = 16;
const VISITOR_SPACING = 16;
const SAME_LANE_TOLERANCE = 4;

interface Spot {
  readonly area: string;
  readonly point: Point;
}

/** The point a character stands on at a place; null while the page has no such place. */
function spotOf(geometry: Geometry, agentId: string, place: Place, slot: number): Spot | null {
  switch (place.kind) {
    case 'desk': {
      const desk = geometry.desks.get(agentId);
      if (!desk) return null;
      const { box } = desk;
      return {
        area: desk.area,
        point: { x: box.left + box.width / 2, y: box.top + box.height * 0.8 },
      };
    }
    case 'visit': {
      const desk = geometry.desks.get(place.hostId);
      if (!desk) return null;
      const { box } = desk;
      const x = Math.max(box.left + 12, box.left + box.width * 0.9 - slot * VISITOR_SPACING);
      return { area: desk.area, point: { x, y: box.top + box.height } };
    }
    case 'pantry': {
      const area = geometry.areas.get(PANTRY);
      if (!area) return null;
      const { floor } = area;
      const perRow = Math.max(1, Math.floor((floor.width - 24) / PANTRY_SPACING));
      return {
        area: PANTRY,
        point: {
          x: floor.left + 12 + PANTRY_SPACING / 2 + (slot % perRow) * PANTRY_SPACING,
          y: floor.top + floor.height - 6 - Math.floor(slot / perRow) * PANTRY_ROW_STEP,
        },
      };
    }
    case 'outside':
      return geometry.entrance && geometry.areas.has(RECEPTION)
        ? { area: RECEPTION, point: geometry.entrance }
        : null;
  }
}

/**
 * The points to walk through from one spot to another, the last being the
 * destination. Between two areas the way is: out by the door, along the lane
 * to the spine, along the spine to the other lane, and in by the other door.
 * Areas on the same lane skip the spine.
 */
export function route(geometry: Geometry, from: Spot, to: Spot): Point[] {
  if (from.area === to.area) return [to.point];
  const a = geometry.areas.get(from.area);
  const b = geometry.areas.get(to.area);
  if (!a || !b) return [to.point];
  const sameLane = Math.abs(a.lane - b.lane) < SAME_LANE_TOLERANCE;
  return [
    a.door,
    { x: a.door.x, y: a.lane },
    ...(sameLane
      ? []
      : [
          { x: geometry.spineX, y: a.lane },
          { x: geometry.spineX, y: b.lane },
        ]),
    { x: b.door.x, y: b.lane },
    b.door,
    to.point,
  ];
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

function pointAt(path: readonly Point[], distance: number): Point {
  let left = distance;
  for (let index = 1; index < path.length; index += 1) {
    const a = path[index - 1] as Point;
    const b = path[index] as Point;
    const segment = Math.hypot(b.x - a.x, b.y - a.y);
    if (left <= segment && segment > 0) {
      const t = left / segment;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    left -= segment;
  }
  return path.at(-1) ?? { x: 0, y: 0 };
}

// ---------------------------------------------------------------------------
// The engine.

/** Pixels per second. */
export const WALK_SPEED = 150;
/** No walk takes longer than this: long ways are walked faster. */
export const MAX_WALK_SECONDS = 7;

interface Leg {
  readonly from: Place;
  readonly fromSlot: number;
  readonly to: Place;
  readonly toSlot: number;
}

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
  /** Coming back from a visit, with the result in hand. */
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
}

const OUTSIDE: Place = { kind: 'outside' };

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
    this.relayout(geometry);
    return changed;
  }

  /** The page changed size or shape: everyone keeps their place on the new layout. */
  relayout(geometry: Geometry | null): void {
    this.geometry = geometry;
    for (const actor of this.actors.values()) {
      if (actor.legs.length === 0) {
        this.settle(actor);
        continue;
      }
      const path = this.pathOf(actor);
      if (!path) {
        this.settle(actor);
        continue;
      }
      const length = lengthOf(path);
      actor.traveled = actor.length > 0 ? (actor.traveled / actor.length) * length : 0;
      actor.path = path;
      actor.length = length;
      this.position(actor);
    }
  }

  /** Advances every walk by `elapsedMs`. */
  tick(elapsedMs: number): { moving: boolean; changed: boolean } {
    let changed = false;
    for (const actor of this.actors.values()) {
      if (actor.legs.length === 0) continue;
      actor.traveled += (actor.speed * elapsedMs) / 1000;
      if (actor.traveled >= actor.length) {
        this.settle(actor);
        changed = true;
      } else {
        this.position(actor);
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
      standing: moving || kind === 'pantry' || kind === 'visit',
      moving,
      carrying: moving && actor.carrying,
      resting: !moving && kind === 'pantry',
    };
  }

  positions(): { id: string; x: number; y: number }[] {
    return [...this.actors.values()].map(({ id, x, y }) => ({ id, x, y }));
  }

  private send(actor: Actor, target: Place, animate: boolean): void {
    const slot = this.freeSlot(target, actor.id);
    const leg: Leg = { from: actor.at, fromSlot: actor.slot, to: target, toSlot: slot };
    actor.carrying = actor.at.kind === 'visit' && target.kind === 'desk';
    actor.at = target;
    actor.slot = slot;
    if (!animate) return this.settle(actor);

    // A walk already under way is finished first, then the new one follows.
    actor.legs.push(leg);
    const path = this.pathOf(actor);
    const length = path ? lengthOf(path) : 0;
    if (!path || length - actor.traveled < 1) return this.settle(actor);
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
    const spot = this.geometry && spotOf(this.geometry, actor.id, actor.at, actor.slot);
    if (spot) {
      actor.x = spot.point.x;
      actor.y = spot.point.y;
    }
  }

  private position(actor: Actor): void {
    const point = pointAt(actor.path, actor.traveled);
    actor.x = point.x;
    actor.y = point.y;
  }

  /** The whole way of an actor's pending legs; null when a place is not on the page. */
  private pathOf(actor: Actor): Point[] | null {
    const { geometry } = this;
    const first = actor.legs[0];
    if (!geometry || !first) return null;
    const start = spotOf(geometry, actor.id, first.from, first.fromSlot);
    if (!start) return null;
    const path = [start.point];
    for (const leg of actor.legs) {
      const from = spotOf(geometry, actor.id, leg.from, leg.fromSlot);
      const to = spotOf(geometry, actor.id, leg.to, leg.toSlot);
      if (!from || !to) return null;
      path.push(...route(geometry, from, to));
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
