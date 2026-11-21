import type { OfficeAgent, OfficeLayout } from '@ea/shared';
import { Canvas, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { FrameRequest } from '../../../components/pixel-art/character';
import { mix } from '../../../components/pixel-art/shade';
import { CORRIDOR, FLOOR } from '../art/architecture';
import type { Screen } from '../art/furniture';
import type { OfficeSceneState } from '../OfficeScene';
import { Blocks } from './Blocks';
import { Effects, Reflections } from './Effects';
import { type Block, chairBlocks, itemBlocks, wallPieces } from './model';
import { City, horizonAt, Sky, Street } from './Surroundings';
import { cameraDirection, HEIGHTS, type OfficeView } from './view';
import { isLively, motionOf, VoxelCharacter } from './VoxelCharacter';

// The office in 3D (Phase 24, D1): React Three Fiber over three.js. This file
// is loaded only when the office opens. It draws; the SVG layer over it
// (OfficeOverlay) carries the words, the clicks and the marks the tests read.
// Positions come from the same engine as the SVG office, through `track`;
// since Phase 27 the agents are voxel characters (VoxelCharacter.tsx).

export interface OfficeCanvasProps {
  readonly layout: OfficeLayout;
  readonly agents: readonly OfficeAgent[];
  readonly scene: OfficeSceneState;
  /** How each agent is drawn now (pose, facing, what it holds). */
  readonly looks: ReadonlyMap<string, FrameRequest>;
  /** The screen of each desk (index in the layout's items). */
  readonly screens: ReadonlyMap<number, Screen>;
  readonly view: OfficeView;
  readonly light: number;
  readonly reduced: boolean;
  /** The agent picked in the scene or pointed at in its card, lit by a ring (Phase 29, D3). */
  readonly lit: string | null;
}

/** Keeps the camera on the view computed by `officeView`, which the SVG layer also uses. */
export function CameraRig({ view }: { view: OfficeView }) {
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);
  useLayoutEffect(() => {
    if (!(camera instanceof THREE.OrthographicCamera)) return;
    // Our own frustum: the library would otherwise reset it on resize.
    camera.manual = true;
    camera.left = -view.width / 2;
    camera.right = view.width / 2;
    camera.top = view.height / 2;
    camera.bottom = -view.height / 2;
    camera.zoom = view.zoom;
    camera.near = 0.1;
    camera.far = 400;
    const [tx, ty, tz] = view.target;
    const [dx, dy, dz] = view.direction;
    camera.position.set(tx + dx * 100, ty + dy * 100, tz + dz * 100);
    camera.up.set(0, 1, 0);
    camera.lookAt(tx, ty, tz);
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, view, invalidate]);
  return null;
}

/** The thick floor of the building, the corridor and the floor of each room. */
export function Floors({ layout }: { layout: OfficeLayout }) {
  const { width, height } = layout;
  const lines = useMemo(() => {
    const points: number[] = [];
    for (let x = 1; x < width; x += 1) points.push(x, 0.012, 0, x, 0.012, height);
    for (let y = 1; y < height; y += 1) points.push(0, 0.012, y, width, 0.012, y);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    return geometry;
  }, [width, height]);
  useEffect(() => () => lines.dispose(), [lines]);
  const blocks = useMemo((): Block[] => {
    const neon = '#c9a8ff';
    return [
      {
        x: 0,
        y: 0,
        z: -HEIGHTS.slab,
        w: width,
        d: height,
        h: HEIGHTS.slab - 0.03,
        color: '#2b2156',
      },
      // The rim of the floor, lit from inside as in the proposal.
      {
        x: 0,
        y: height - 0.02,
        z: -0.05,
        w: width,
        d: 0.04,
        h: 0.05,
        color: '#b48cff',
        glow: true,
      },
      {
        x: width - 0.02,
        y: 0,
        z: -0.05,
        w: 0.04,
        d: height,
        h: 0.05,
        color: '#b48cff',
        glow: true,
      },
      { x: 0, y: 0, z: -0.02, w: width, d: height, h: 0.02, color: CORRIDOR.fill, finish: 'gloss' },
      ...layout.areas.map((area) => ({
        x: area.x,
        y: area.y,
        z: -0.01,
        w: area.width,
        d: area.height,
        h: 0.02,
        color: FLOOR[area.floor].fill,
        finish:
          area.floor === 'tile' || area.floor === 'stone' ? ('gloss' as const) : ('matte' as const),
      })),
      // The neon along the front edges of the floor, as in the proposal.
      ...[-0.12, -HEIGHTS.slab + 0.06].flatMap((z) => [
        { x: 0, y: height, z, w: width, d: 0.03, h: 0.03, color: neon, glow: true },
        { x: width, y: 0, z, w: 0.03, d: height, h: 0.03, color: neon, glow: true },
      ]),
    ];
  }, [layout.areas, width, height]);
  return (
    <group>
      <Blocks blocks={blocks} receiveShadow />
      <lineSegments geometry={lines}>
        <lineBasicMaterial color="#9d8fc4" transparent opacity={0.2} />
      </lineSegments>
    </group>
  );
}

const PANE = '#bcd5f7';
const FRAME = '#eeeaf8';

export function Walls({ layout }: { layout: OfficeLayout }) {
  const blocks = useMemo(
    () =>
      wallPieces(layout).flatMap((piece): Block[] => [
        { ...piece, z: 0, color: PANE, opacity: piece.h < HEIGHTS.wall ? 0.26 : 0.36 },
        { ...piece, z: piece.h, h: 0.045, color: FRAME },
        ...(piece.post
          ? [
              {
                ...piece,
                w: Math.min(piece.w, 0.05),
                d: Math.min(piece.d, 0.05),
                z: 0,
                color: FRAME,
              },
            ]
          : []),
      ]),
    [layout],
  );
  return <Blocks blocks={blocks} castShadow />;
}

export function Furniture({
  layout,
  screens,
}: {
  layout: OfficeLayout;
  screens: ReadonlyMap<number, Screen>;
}) {
  // Everything but the screens is built once per layout: rebuilding all the
  // furniture each time a screen turns on would stall 30 walking agents.
  const fixed = useMemo(() => {
    const all: Block[] = [];
    for (const item of layout.items) {
      all.push(...itemBlocks(item).filter((part) => !part.live));
      if (item.kind === 'desk') {
        const step = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] }[item.facing];
        const opposite = { n: 's', s: 'n', w: 'e', e: 'w' } as const;
        all.push(
          ...chairBlocks(item.x + (step[0] ?? 0), item.y + (step[1] ?? 0), opposite[item.facing]),
        );
      }
    }
    return all;
  }, [layout]);
  const live = useMemo(
    () =>
      layout.items.flatMap((item, index) =>
        itemBlocks(item, screens.get(index) ?? 'off').filter((part) => part.live),
      ),
    [layout, screens],
  );
  return (
    <>
      <Blocks blocks={fixed} castShadow receiveShadow />
      <Blocks blocks={live} />
    </>
  );
}

/** Frames per second of the gentle motions of seated or standing characters. */
const LIVELY_FPS = 24;

/** Redraws now and then while some character is animated (typing, talking, waving). */
function Ticker({ active }: { active: boolean }) {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => invalidate(), 1000 / LIVELY_FPS);
    return () => clearInterval(timer);
  }, [active, invalidate]);
  return null;
}

/**
 * The light of the floor: a key light from the upper left that casts the
 * shadows of the furniture, a purple ambient and a sky light, warmer by day.
 */
export function Lights({ layout, light }: { layout: OfficeLayout; light: number }) {
  const key = useRef<THREE.DirectionalLight>(null);
  const { width, height } = layout;
  useLayoutEffect(() => {
    const sun = key.current;
    if (!sun) return;
    const reach = (width + height) * 0.75;
    sun.target.position.set(width / 2, 0, height / 2);
    sun.target.updateMatrixWorld();
    const shadow = sun.shadow.camera;
    shadow.left = -reach;
    shadow.right = reach;
    shadow.top = reach;
    shadow.bottom = -reach;
    shadow.near = 0.5;
    shadow.far = reach * 4;
    shadow.updateProjectionMatrix();
  }, [width, height]);
  const night = 1 - light;
  return (
    <>
      <ambientLight color={mix('#6f5cff', '#ffffff', light)} intensity={0.4 + light * 0.25} />
      <hemisphereLight
        args={[mix('#b9a8ff', '#dcecff', light), mix('#1d1440', '#6d7a9a', light), 0.9]}
      />
      <directionalLight
        ref={key}
        position={[width / 2 - width * 0.6, (width + height) * 0.9, height / 2 + height * 0.2]}
        intensity={0.85 + light * 0.55}
        color={mix('#d9ccff', '#fff2dc', light)}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      {/* A cold fill from the right, the blue of the glass in the proposal. */}
      <directionalLight
        position={[width + 8, 6, -4]}
        intensity={0.35 + night * 0.4}
        color="#7fa8ff"
      />
    </>
  );
}

/** Things far behind the office fade into the horizon, as in the proposal; the office never does. */
export function Fog({
  view,
  layout,
  light,
}: {
  view: OfficeView;
  layout: OfficeLayout;
  light: number;
}) {
  const scene = useThree((state) => state.scene);
  const [dx, dy, dz] = cameraDirection();
  const [tx, ty, tz] = view.target;
  // Distance from the camera (100 tiles out from the target) to the farthest corner of the office.
  const depth = (x: number, z: number) => 100 - ((x - tx) * dx + (0 - ty) * dy + (z - tz) * dz);
  const near = Math.max(depth(0, 0), depth(layout.width, 0), depth(0, layout.height)) + 4;
  const color = horizonAt(light);
  useLayoutEffect(() => {
    scene.fog = new THREE.Fog(color, near, near + 30);
    return () => {
      scene.fog = null;
    };
  }, [scene, color, near]);
  return null;
}

export default function OfficeCanvas({
  layout,
  agents,
  scene,
  looks,
  screens,
  view,
  light,
  reduced,
  lit,
}: OfficeCanvasProps) {
  // A new map arrives on every render of the page; the furniture is rebuilt only when a screen changes.
  const screenKey = [...screens].map(([desk, screen]) => `${desk}:${screen}`).join(',');
  const stableScreens = useMemo(
    () => screens,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [screenKey],
  );
  const animated =
    !reduced &&
    agents.some((agent) => {
      const look = looks.get(agent.id);
      return look !== undefined && isLively(motionOf(look, agent.state === 'failed'));
    });
  return (
    <Canvas
      orthographic
      shadows
      frameloop="demand"
      dpr={[1, 2]}
      gl={{ antialias: true }}
      className="absolute inset-0"
      aria-hidden
    >
      <CameraRig view={view} />
      <Sky light={light} />
      <Fog view={view} layout={layout} light={light} />
      <Reflections strength={0.22 + light * 0.08} />
      <Lights layout={layout} light={light} />
      <City layout={layout} light={light} />
      <Street layout={layout} light={light} />
      <Floors layout={layout} />
      <Furniture layout={layout} screens={stableScreens} />
      {agents.map((agent) => {
        const look = looks.get(agent.id);
        return look ? (
          <VoxelCharacter
            key={agent.id}
            agent={agent}
            request={look}
            scene={scene}
            reduced={reduced}
            lit={lit === agent.id}
          />
        ) : null;
      })}
      <Walls layout={layout} />
      <Effects bloom={0.12 + (1 - light) * 0.5} />
      <Ticker active={animated} />
    </Canvas>
  );
}
