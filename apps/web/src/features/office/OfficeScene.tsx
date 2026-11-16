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
import { type Direction, PixelCharacter } from '../../components/pixel-art/character';
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

/** Something drawn at an agent's position: the character, its balloon, its dot on the minimap. */
export type SpriteRole = 'body' | 'balloon' | 'dot';

export interface OfficeSceneState {
  /** How an agent is drawn now; undefined until the scene has seen it. */
  readonly view: (agentId: string) => ActorView | undefined;
  /** Gives the scene an element to keep at an agent's position. */
  readonly sprite: (agentId: string, role: SpriteRole) => (element: SVGGElement | null) => void;
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
  const sprites = useRef(new Map<string, Map<SpriteRole, SVGGElement>>());
  const frame = useRef(0);
  const reduced = useReducedMotion();

  const apply = useCallback(() => {
    for (const { id, x, y } of engine.positions()) {
      const roles = sprites.current.get(id);
      if (!roles) continue;
      const view = engine.view(id);
      const lift = view?.seated ? SEAT_HEIGHT : 0;
      const at = project(x, y, lift);
      const transform = `translate(${at.x.toFixed(1)} ${at.y.toFixed(1)})`;
      for (const element of roles.values()) element.setAttribute('transform', transform);
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

  const sprite = useCallback(
    (agentId: string, role: SpriteRole) => (element: SVGGElement | null) => {
      const roles = sprites.current.get(agentId) ?? new Map<SpriteRole, SVGGElement>();
      if (element) roles.set(role, element);
      else roles.delete(role);
      sprites.current.set(agentId, roles);
    },
    [],
  );
  const view = useCallback((agentId: string) => engine.view(agentId), [engine]);
  return { view, sprite };
}

// ---------------------------------------------------------------------------
// Drawing

/** The movement of a seated agent, by state (the `desk-*` classes of the theme). */
const SEATED_MOTION: Record<OfficeAgent['state'], { head?: string; body?: string }> = {
  working: { body: 'desk-type-a' },
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

/** What is around the office, behind it; drawn once per layout. */
export const Around = memo(function Around({ layout }: { layout: OfficeLayout }) {
  return <SurroundingsBack layout={layout} />;
});

/** The outer walls behind the office, standing on the edge of its floor. */
export const Perimeter = memo(function Perimeter({ layout }: { layout: OfficeLayout }) {
  return <PerimeterBack layout={layout} />;
});

/** The low outer walls, trees and lamps in front of the office. */
export const AroundFront = memo(function AroundFront({ layout }: { layout: OfficeLayout }) {
  return (
    <>
      <PerimeterFront layout={layout} />
      <SurroundingsFront layout={layout} />
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
