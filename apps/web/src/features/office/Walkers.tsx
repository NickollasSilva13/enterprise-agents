import {
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from 'react';
import { AgentHead, agentLook } from '../../components/AgentAvatar';
import {
  type ActorView,
  type AreaGeometry,
  type Box,
  type Geometry,
  type Place,
  placeKey,
  SceneEngine,
} from './scene';

// The characters that walk around the office (RF-80), drawn on a layer over
// the rooms. Decoration only: where each agent is also stands in words at its
// desk and in the common areas, so the layer is hidden from assistive
// technology and lets clicks through.
//
// Positions are written straight to the `transform` attribute of each
// character, once per frame, without going through React and without any
// inline style (CSP).

/** Half of the gap between the rows of areas: the middle of the corridor. */
const LANE_OFFSET = 12;

/** Reads from the page where the doors, floors and desks are, relative to `root`. */
export function measure(root: HTMLElement): Geometry {
  const origin = root.getBoundingClientRect();
  const boxOf = (element: Element): Box => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left - origin.left,
      top: rect.top - origin.top,
      width: rect.width,
      height: rect.height,
    };
  };
  const footOf = (element: Element) => {
    const box = boxOf(element);
    return { x: box.left + box.width / 2, y: box.top + box.height };
  };

  const areas = new Map<string, AreaGeometry>();
  let leftmost = Number.POSITIVE_INFINITY;
  for (const element of root.querySelectorAll<HTMLElement>('[data-area]')) {
    const door = element.querySelector('[data-door]');
    const floor = element.querySelector('[data-floor]');
    if (!door || !floor) continue;
    const box = boxOf(element);
    leftmost = Math.min(leftmost, box.left);
    areas.set(element.dataset.area ?? '', {
      door: footOf(door),
      lane: box.top - LANE_OFFSET,
      floor: boxOf(floor),
    });
  }

  const desks = new Map<string, { area: string; box: Box }>();
  for (const element of root.querySelectorAll<HTMLElement>('[data-seat]')) {
    const area = element.closest<HTMLElement>('[data-area]')?.dataset.area;
    if (area !== undefined) desks.set(element.dataset.seat ?? '', { area, box: boxOf(element) });
  }

  const entrance = root.querySelector('[data-entrance]');
  return {
    areas,
    desks,
    entrance: entrance ? footOf(entrance) : null,
    spineX: Number.isFinite(leftmost) ? leftmost / 2 : 0,
  };
}

const reducedMotionQuery = (): MediaQueryList | null =>
  typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;

/** The system's "reduce motion" preference, followed while the page is open. */
function useReducedMotion(): boolean {
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

export interface OfficeScene {
  /** How an agent is drawn now; undefined until the scene has seen it. */
  readonly view: (agentId: string) => ActorView | undefined;
  /** Gives the scene the element of a character, so it can be moved. */
  readonly sprite: (agentId: string) => (element: SVGGElement | null) => void;
}

/**
 * Runs the scene over the element in `root`. `places` says where each agent
 * should be, and is null while the office has not loaded.
 */
export function useOfficeScene(
  root: RefObject<HTMLElement | null>,
  places: ReadonlyMap<string, Place> | null,
): OfficeScene {
  const [engine] = useState(() => new SceneEngine());
  const [, redraw] = useReducer((count: number) => count + 1, 0);
  const sprites = useRef(new Map<string, SVGGElement>());
  const frame = useRef(0);
  const reduced = useReducedMotion();

  const apply = useCallback(() => {
    for (const { id, x, y } of engine.positions()) {
      sprites.current
        .get(id)
        ?.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
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
    if (!places || !root.current) return;
    if (engine.sync(places, measure(root.current), !reduced)) redraw();
    run();
    // `places` is rebuilt on every render; its content is in `signature`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, reduced, engine, root, run]);

  // Characters that have just appeared on the layer need their position
  // before the browser paints.
  useLayoutEffect(apply);

  const loaded = signature !== null;
  useEffect(() => {
    const element = root.current;
    if (!element || !loaded || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      engine.relayout(measure(element));
      apply();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [loaded, engine, root, apply]);

  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    },
    [],
  );

  const sprite = useCallback(
    (agentId: string) => (element: SVGGElement | null) => {
      if (element) sprites.current.set(agentId, element);
      else sprites.current.delete(agentId);
    },
    [],
  );
  const view = useCallback((agentId: string) => engine.view(agentId), [engine]);
  return { view, sprite };
}

const INK = '#0f1826';
const LEG = '#26334f';
const PAPER = '#e8eef8';

/** A character on its feet, drawn around the point where it stands. */
function Character({ agentId, view }: { agentId: string; view: ActorView }) {
  const look = agentLook(agentId);
  return (
    // The class sits on an inner group: the outer one is moved by `transform`.
    <g className={view.moving ? 'walker-bob' : undefined}>
      <ellipse cx="0" cy="0" rx="13" ry="3.5" fill={INK} opacity="0.4" />
      <rect
        x="-8"
        y="-15"
        width="6"
        height="15"
        rx="2.5"
        fill={LEG}
        className={view.moving ? 'walker-leg-a' : undefined}
      />
      <rect
        x="2"
        y="-15"
        width="6"
        height="15"
        rx="2.5"
        fill={LEG}
        className={view.moving ? 'walker-leg-b' : undefined}
      />
      <rect x="-16" y="-34" width="6" height="16" rx="3" fill={look.body} />
      <rect x="10" y="-34" width="6" height="16" rx="3" fill={look.body} />
      <rect x="-11" y="-37" width="22" height="25" rx="7" fill={look.body} />
      <rect x="-11" y="-37" width="22" height="25" rx="7" fill={INK} opacity="0.18" />
      {view.carrying && (
        <g>
          <rect x="6" y="-30" width="13" height="16" rx="1.5" fill={PAPER} />
          <path d="M9 -26 h7 M9 -22 h7 M9 -18 h4" stroke={INK} strokeWidth="1.2" opacity="0.6" />
        </g>
      )}
      {view.resting && (
        <g>
          <rect x="11" y="-25" width="8" height="8" rx="1.5" fill={PAPER} />
          <path
            d="M19 -23 h1.6 a1.8 1.8 0 0 1 0 3.6 h-1.6"
            stroke={PAPER}
            strokeWidth="1.2"
            fill="none"
          />
          <path
            d="M13.5 -27 q-1.5 -2 0 -4 M16.5 -27 q-1.5 -2 0 -4"
            stroke={PAPER}
            strokeWidth="1"
            strokeLinecap="round"
            fill="none"
            className="desk-steam"
          />
        </g>
      )}
      <g transform="translate(-16 -66) scale(0.8)">
        <AgentHead look={look} />
      </g>
    </g>
  );
}

/** The layer with every agent that is away from its chair. */
export function Walkers({ agentIds, scene }: { agentIds: readonly string[]; scene: OfficeScene }) {
  return (
    <svg
      className="pointer-events-none absolute inset-0 size-full overflow-visible"
      aria-hidden
      data-walkers
    >
      {agentIds.map((id) => {
        const view = scene.view(id);
        if (!view?.standing) return null;
        return (
          <g
            key={id}
            ref={scene.sprite(id)}
            data-walker={id}
            data-moving={view.moving ? 'true' : 'false'}
          >
            <Character agentId={id} view={view} />
          </g>
        );
      })}
    </svg>
  );
}
