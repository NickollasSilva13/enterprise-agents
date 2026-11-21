import { footprint, type OfficeAgent, type OfficeLayout, type OfficeProject } from '@ea/shared';
import {
  memo,
  type ReactNode,
  type Ref,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { areaName, Ground, signPoint, wallsByBand } from './art/architecture';
import { useDaylight } from './daylight';
import {
  type Direction,
  type FrameRequest,
  PixelCharacter,
} from '../../components/pixel-art/character';
import { Chair, FlatItem, Furniture, isFlat, type Screen } from './art/furniture';
import { project } from './art/iso';
import {
  PerimeterBack,
  PerimeterFront,
  SurroundingsBack,
  SurroundingsFront,
} from './art/surroundings';
import type { OfficeGeometry, Seat } from './geometry';
import { type ActorView, type Place, placeKey, SceneEngine } from './scene';

// The office drawn in isometric pixel art (Phase 14). The picture is
// decoration: everything it shows also stands in words in the side panel, so
// it is hidden from assistive technology. Characters are moved by writing the
// `transform` attribute of their group once per frame, never through React
// and never with inline style (CSP).

const reducedMotionQuery = (): MediaQueryList | null =>
  typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;

/** The system's "reduce motion" preference, followed while the page is open. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => reducedMotionQuery()?.matches ?? false);
  useEffect(() => {
    const query = reducedMotionQuery();
    if (!query) return;
    const update = () => setReduced(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return reduced;
}

/** Something drawn at an agent's position: the character, its balloon, its 3D model. */
export type SpriteRole = 'body' | 'balloon' | 'model';

/** Puts something at a point of the floor (tiles), lifted to the seat when seated. */
export type Mover = (x: number, y: number, seated: boolean) => void;

export interface OfficeSceneState {
  /** How an agent is drawn now; undefined until the scene has seen it. */
  readonly view: (agentId: string) => ActorView | undefined;
  /** Gives the scene an SVG element of the isometric drawing to keep at an agent's position. */
  readonly sprite: (agentId: string, role: SpriteRole) => (element: SVGGElement | null) => void;
  /** Gives the scene anything to keep at an agent's position (the 3D scene, Phase 24). */
  readonly track: (agentId: string, role: SpriteRole, mover: Mover | null) => void;
}

const SEAT_HEIGHT = 8;

/**
 * Runs the scene. `places` says where each agent should be, and is null
 * while the office has not loaded.
 */
export function useOfficeScene(
  geometry: OfficeGeometry | null,
  places: ReadonlyMap<string, Place> | null,
): OfficeSceneState {
  const [engine] = useState(() => new SceneEngine());
  const [, redraw] = useReducer((count: number) => count + 1, 0);
  const movers = useRef(new Map<string, Map<SpriteRole, Mover>>());
  const frame = useRef(0);
  const reduced = useReducedMotion();

  const apply = useCallback(() => {
    for (const { id, x, y } of engine.positions()) {
      const roles = movers.current.get(id);
      if (!roles) continue;
      const seated = engine.view(id)?.seated ?? false;
      for (const move of roles.values()) move(x, y, seated);
    }
  }, [engine]);

  const run = useCallback(() => {
    if (frame.current !== 0 || !engine.moving) return;
    let last = performance.now();
    const step = (time: number) => {
      // Real time, not frames: where the browser draws rarely (a tab in the
      // background) the walk is choppy but still ends when it should.
      const { moving, changed } = engine.tick(Math.max(0, time - last));
      last = time;
      apply();
      if (changed) redraw();
      frame.current = moving ? requestAnimationFrame(step) : 0;
    };
    frame.current = requestAnimationFrame(step);
  }, [engine, apply]);

  const signature = places
    ? [...places].map(([id, place]) => `${id}=${placeKey(place)}`).join(',')
    : null;

  useLayoutEffect(() => {
    if (!places || !geometry) return;
    if (engine.sync(places, geometry, !reduced)) redraw();
    run();
    // `places` is rebuilt on every render; its content is in `signature`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, geometry, reduced, engine, run]);

  // Elements that have just appeared need their position before the browser paints.
  useLayoutEffect(apply);

  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    },
    [],
  );

  const track = useCallback(
    (agentId: string, role: SpriteRole, mover: Mover | null) => {
      const roles = movers.current.get(agentId) ?? new Map<SpriteRole, Mover>();
      if (mover) roles.set(role, mover);
      else roles.delete(role);
      movers.current.set(agentId, roles);
      // Something that appears between two frames is put in place at once.
      const at = mover ? engine.positions().find((each) => each.id === agentId) : undefined;
      if (mover && at) mover(at.x, at.y, engine.view(agentId)?.seated ?? false);
    },
    [engine],
  );
  const sprite = useCallback(
    (agentId: string, role: SpriteRole) => (element: SVGGElement | null) =>
      track(
        agentId,
        role,
        element
          ? (x, y, seated) => {
              const at = project(x, y, seated ? SEAT_HEIGHT : 0);
              element.setAttribute('transform', `translate(${at.x.toFixed(1)} ${at.y.toFixed(1)})`);
            }
          : null,
      ),
    [track],
  );
  const view = useCallback((agentId: string) => engine.view(agentId), [engine]);
  return { view, sprite, track };
}

// ---------------------------------------------------------------------------
// Drawing

/** The movement of a seated agent, by state (the `desk-*` classes of the theme). */
const SEATED_MOTION: Record<OfficeAgent['state'], { head?: string; body?: string }> = {
  // Working is shown by the typing frames of the character (Phase 22).
  working: {},
  waiting: {},
  failed: { head: 'desk-shake' },
  idle: { body: 'desk-breathe' },
  inactive: {},
};

const SCREEN_OF: Record<OfficeAgent['state'], Screen> = {
  working: 'on',
  waiting: 'alert',
  failed: 'error',
  idle: 'off',
  inactive: 'off',
};

/** A sitter faces the desk, away from the chair's side. */
const SITTER_FACING: Record<Seat['side'], Direction> = { n: 'sw', s: 'ne', w: 'se', e: 'nw' };

const oppositeOf = { n: 's', s: 'n', e: 'w', w: 'e' } as const;

export interface BalloonInfo {
  readonly text: string;
  readonly tone: 'normal' | 'strong';
}

interface SceneProps {
  readonly layout: OfficeLayout;
  readonly projects: readonly OfficeProject[];
  readonly agents: readonly OfficeAgent[];
  readonly geometry: OfficeGeometry;
  readonly places: ReadonlyMap<string, Place>;
  readonly scene: OfficeSceneState;
  readonly balloons: ReadonlyMap<string, BalloonInfo>;
  readonly onAgent: (agent: OfficeAgent) => void;
  readonly svgRef?: Ref<SVGSVGElement>;
  readonly className?: string;
  /** A fixed view, when no viewport moves it. */
  readonly viewBox?: string;
}

/** Furniture and walls by drawing band; changes only with the layout. */
function useStaticBands(layout: OfficeLayout, screens: ReadonlyMap<number, Screen>) {
  return useMemo(() => {
    const { back, front } = wallsByBand(layout);
    const items = new Map<number, ReactNode[]>();
    const add = (band: number, node: ReactNode) => {
      const list = items.get(band) ?? [];
      list.push(node);
      items.set(band, list);
    };
    layout.items.forEach((item, index) => {
      if (isFlat(item.kind)) return;
      // A piece of several tiles is drawn with its front tile.
      const band = Math.max(...footprint(item).map((tile) => tile.x + tile.y));
      add(band, <Furniture key={item.id} item={item} screen={screens.get(index) ?? 'off'} />);
      if (item.kind === 'desk') {
        const chair = { x: item.x, y: item.y };
        const at =
          item.facing === 'n'
            ? { ...chair, y: chair.y - 1 }
            : item.facing === 's'
              ? { ...chair, y: chair.y + 1 }
              : item.facing === 'w'
                ? { ...chair, x: chair.x - 1 }
                : { ...chair, x: chair.x + 1 };
        add(
          at.x + at.y,
          <Chair key={`${item.id}-chair`} x={at.x} y={at.y} facing={oppositeOf[item.facing]} />,
        );
      }
    });
    const last = layout.width + layout.height;
    return { back, items, front, last };
  }, [layout, screens]);
}

/**
 * What is around the office, behind it; drawn again only when the layout or
 * the hour changes (Phase 23: day and night follow the clock).
 */
export const Around = memo(function Around({ layout }: { layout: OfficeLayout }) {
  return <SurroundingsBack layout={layout} light={useDaylight()} />;
});

/** The outer walls behind the office, standing on the edge of its floor. */
export const Perimeter = memo(function Perimeter({ layout }: { layout: OfficeLayout }) {
  return <PerimeterBack layout={layout} light={useDaylight()} />;
});

/** The low outer walls, trees, lamps and the lit edge in front of the office. */
export const AroundFront = memo(function AroundFront({ layout }: { layout: OfficeLayout }) {
  const light = useDaylight();
  return (
    <>
      <PerimeterFront layout={layout} />
      <SurroundingsFront layout={layout} light={light} />
    </>
  );
});

export const Floor = memo(function Floor({ layout }: { layout: OfficeLayout }) {
  return (
    <g>
      <Ground layout={layout} />
      {layout.items
        .filter((item) => isFlat(item.kind))
        .map((item) => (
          <FlatItem key={item.id} item={item} />
        ))}
    </g>
  );
});

/** The signs over the rooms and the text of the murals, in HTML so they read clearly. */
export const Signs = memo(function Signs({
  layout,
  projects,
}: {
  layout: OfficeLayout;
  projects: readonly OfficeProject[];
}) {
  return (
    <g>
      {layout.areas.map((area) => {
        const at = signPoint(area);
        return (
          <foreignObject key={area.id} x={at.x - 90} y={at.y - 22} width="180" height="24">
            <div className="flex h-full items-end justify-center">
              <span className="office-sign max-w-full truncate">{areaName(area, projects)}</span>
            </div>
          </foreignObject>
        );
      })}
      {layout.items
        .filter((item) => item.kind === 'mural' && item.label)
        .map((item) => {
          const turned = item.facing === 'e' || item.facing === 'w';
          const at = project(item.x + (turned ? 0.5 : 1), item.y + (turned ? 1 : 0.5), 22);
          return (
            <foreignObject key={item.id} x={at.x - 40} y={at.y - 10} width="80" height="22">
              <div className="flex h-full items-center justify-center">
                <span className="office-mural">{item.label}</span>
              </div>
            </foreignObject>
          );
        })}
    </g>
  );
});

export function OfficeDrawing({
  layout,
  projects,
  agents,
  geometry,
  places,
  scene,
  balloons,
  onAgent,
  svgRef,
  className,
  viewBox,
}: SceneProps) {
  // A screen is on while its agent is at the desk; the key keeps the memo below stable.
  const screenKey = agents
    .map((agent) => {
      const seat = geometry.seats.get(agent.id);
      return seat && places.get(agent.id)?.kind === 'desk'
        ? `${seat.desk}:${SCREEN_OF[agent.state]}`
        : '';
    })
    .join(',');
  const screens = useMemo(() => {
    const map = new Map<number, Screen>();
    for (const entry of screenKey.split(',')) {
      const [desk, screen] = entry.split(':');
      if (desk && screen) map.set(Number(desk), screen as Screen);
    }
    return map;
  }, [screenKey]);
  const { back, items, front, last } = useStaticBands(layout, screens);

  // Who is drawn in which band: seated agents on their chair, the others where they stand.
  const people = new Map<number, ReactNode[]>();
  for (const agent of agents) {
    const view = scene.view(agent.id);
    const seat = geometry.seats.get(agent.id);
    const seated = view ? view.seated : seat !== undefined;
    if (!seated && !view?.standing) continue;
    const band = seated && seat ? seat.chair.x + seat.chair.y : (view?.band ?? 0);
    const motion = SEATED_MOTION[agent.state];
    const node = (
      <g
        key={agent.id}
        ref={scene.sprite(agent.id, 'body')}
        className="cursor-pointer"
        onClick={() => onAgent(agent)}
        {...(seated
          ? { 'data-sitter': agent.id }
          : { 'data-walker': agent.id, 'data-moving': view?.moving ? 'true' : 'false' })}
      >
        <PixelCharacter
          agentId={agent.id}
          appearance={agent.appearance}
          pose={seated ? 'sit' : view?.moving ? 'walk' : 'stand'}
          facing={seated && seat ? SITTER_FACING[seat.side] : (view?.heading ?? 'sw')}
          holding={view?.carrying ? 'paper' : view?.resting ? 'cup' : null}
          headClass={seated ? motion.head : undefined}
          bodyClass={seated ? motion.body : view?.moving ? 'walker-bob' : undefined}
          raisedHand={seated && agent.state === 'waiting'}
          activity={
            seated && agent.state === 'working' ? 'typing' : view?.talking ? 'talking' : null
          }
        />
      </g>
    );
    const list = people.get(band) ?? [];
    list.push(node);
    people.set(band, list);
  }

  const bands: number[] = [];
  for (let band = -1; band <= last; band += 1) bands.push(band);

  return (
    <svg
      ref={svgRef}
      className={className}
      viewBox={viewBox}
      aria-hidden
      data-office-scene
      preserveAspectRatio="xMidYMid meet"
    >
      <Around layout={layout} />
      <Floor layout={layout} />
      <Perimeter layout={layout} />
      {bands.map((band) => (
        <g key={band}>
          {back.get(band)}
          {items.get(band)}
          {people.get(band)}
          {front.get(band)}
        </g>
      ))}
      <AroundFront layout={layout} />
      <Signs layout={layout} projects={projects} />
      {agents.map((agent) => {
        const balloon = balloons.get(agent.id);
        const view = scene.view(agent.id);
        const drawn = view ? view.seated || view.standing : geometry.seats.has(agent.id);
        if (!balloon || !drawn) return null;
        return (
          <g key={agent.id} ref={scene.sprite(agent.id, 'balloon')}>
            <foreignObject x="-70" y="-82" width="140" height="44" className="overflow-visible">
              <div className="flex h-full items-end justify-center">
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => onAgent(agent)}
                  className={`office-balloon max-w-full px-1.5 py-0.5 text-center text-[7px] leading-tight ${
                    balloon.tone === 'strong' ? 'font-semibold' : ''
                  }`}
                >
                  <span className="line-clamp-2">{balloon.text}</span>
                </button>
              </div>
            </foreignObject>
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// The same decisions, for the 3D scene (Phase 24).

export interface AgentFigure {
  readonly request: FrameRequest;
  readonly seated: boolean;
  readonly moving: boolean;
}

/** How each agent in sight is drawn now; agents out of the office are left out. */
export function figuresOf(
  agents: readonly OfficeAgent[],
  geometry: OfficeGeometry,
  scene: OfficeSceneState,
): Map<string, AgentFigure> {
  const figures = new Map<string, AgentFigure>();
  for (const agent of agents) {
    const view = scene.view(agent.id);
    const seat = geometry.seats.get(agent.id);
    const seated = view ? view.seated : seat !== undefined;
    if (!seated && !view?.standing) continue;
    figures.set(agent.id, {
      seated,
      moving: !seated && (view?.moving ?? false),
      request: {
        pose: seated ? 'sit' : view?.moving ? 'walk' : 'stand',
        facing: seated && seat ? SITTER_FACING[seat.side] : (view?.heading ?? 'sw'),
        holding: view?.carrying ? 'paper' : view?.resting ? 'cup' : null,
        raisedHand: seated && agent.state === 'waiting',
        activity: seated && agent.state === 'working' ? 'typing' : view?.talking ? 'talking' : null,
      },
    });
  }
  return figures;
}

/** The screen of each desk: on while its agent sits there, by the agent's state. */
export function deskScreens(
  agents: readonly OfficeAgent[],
  geometry: OfficeGeometry,
  places: ReadonlyMap<string, Place>,
): Map<number, Screen> {
  const screens = new Map<number, Screen>();
  for (const agent of agents) {
    const seat = geometry.seats.get(agent.id);
    if (seat && places.get(agent.id)?.kind === 'desk')
      screens.set(seat.desk, SCREEN_OF[agent.state]);
  }
  return screens;
}
