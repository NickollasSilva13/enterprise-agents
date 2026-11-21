import type { OfficeAgent } from '@ea/shared';
import { useFrame, useThree } from '@react-three/fiber';
import { type ReactNode, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { FrameRequest } from '../../../components/pixel-art/character';
import type { OfficeSceneState } from '../OfficeScene';
import { GLOW, materialOf } from './Blocks';
import { HEIGHTS } from './view';
import { JOINTS, type Motion, PART_JOINTS, type PartName, poseAt, VOXEL } from './voxel';
import { figureKey, lookMeshes, type PartMeshes } from './voxel-meshes';

// A voxel character in the 3D office (Phase 27): the parts of `voxelFigure`
// as meshes in nested groups (the shins hang from the thighs), turned every
// frame by `poseAt`. Characters of the same look share their geometry
// (`voxel-meshes.ts`).

/** The ring of a lit character, flat on the floor, in the glow colour of the scene. */
const RING = (() => {
  const geometry = new THREE.RingGeometry(0.34, 0.42, 40).rotateX(-Math.PI / 2);
  const tint = new THREE.Color('#b48cff').multiplyScalar(GLOW);
  const colors = new Float32Array(geometry.getAttribute('position').count * 3);
  for (let index = 0; index < colors.length / 3; index += 1) tint.toArray(colors, index * 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
})();

/** Which way a character turns to face each screen direction (+z faces down-left, `sw`). */
const YAW: Record<FrameRequest['facing'], number> = {
  sw: 0,
  se: Math.PI / 2,
  ne: Math.PI,
  nw: -Math.PI / 2,
};

/** The motion of a character, from what the office decided it is doing. */
export function motionOf(request: FrameRequest, failed: boolean): Motion {
  if (request.pose === 'walk') return 'walk';
  if (request.pose === 'sit') {
    if (request.raisedHand) return 'wave';
    if (request.activity === 'typing') return 'type';
    if (failed) return 'shake';
    return 'sit';
  }
  return request.activity === 'talking' ? 'talk' : 'stand';
}

/** Whether a motion keeps moving when nobody walks (typing, talking, waving, shaking). */
export const isLively = (motion: Motion) =>
  motion !== 'stand' && motion !== 'sit' && motion !== 'walk';

/** How far the origin of a seated character sits above the floor: the back of its thighs on the cushion. */
const SEATED_ORIGIN = HEIGHTS.seat + 0.01 + 2 * VOXEL - JOINTS.hip * VOXEL;

function Part({
  geometry,
  joint,
  children,
  partRef,
}: {
  geometry: PartMeshes;
  joint: readonly [number, number, number];
  children?: ReactNode;
  partRef: (group: THREE.Group | null) => void;
}) {
  return (
    <group ref={partRef} position={[joint[0] * VOXEL, joint[1] * VOXEL, joint[2] * VOXEL]}>
      <mesh geometry={geometry.solid} material={materialOf('matte')} castShadow receiveShadow />
      {geometry.glow && <mesh geometry={geometry.glow} material={materialOf('glow')} />}
      {children}
    </group>
  );
}

export function VoxelCharacter({
  agent,
  request,
  scene,
  reduced,
  lit = false,
}: {
  agent: OfficeAgent;
  request: FrameRequest;
  scene: OfficeSceneState;
  reduced: boolean;
  /** Picked or pointed at: a ring of light on the floor around the feet (Phase 29, D3). */
  lit?: boolean;
}) {
  const root = useRef<THREE.Group>(null);
  const lift = useRef<THREE.Group>(null);
  const parts = useRef(new Map<PartName, THREE.Group>());
  const invalidate = useThree((state) => state.invalidate);
  const holding = request.holding;
  const key = figureKey(agent.id, agent.appearance, holding);
  const meshes = useMemo(() => lookMeshes(key), [key]);
  const motion = motionOf(request, agent.state === 'failed');
  const seated = request.pose === 'sit';

  useLayoutEffect(() => {
    scene.track(agent.id, 'model', (x, y) => {
      root.current?.position.set(x, 0, y);
      invalidate();
    });
    return () => scene.track(agent.id, 'model', null);
  }, [agent.id, scene, invalidate]);

  useFrame(({ clock }) => {
    const pose = poseAt(motion, reduced ? 0 : clock.elapsedTime, holding !== null);
    const turn = (name: PartName, x: number, z = 0) =>
      parts.current.get(name)?.rotation.set(x, 0, z);
    turn('armLeft', pose.armLeft[0], pose.armLeft[1]);
    turn('armRight', pose.armRight[0], pose.armRight[1]);
    turn('thighLeft', pose.thighLeft);
    turn('thighRight', pose.thighRight);
    turn('shinLeft', pose.shinLeft);
    turn('shinRight', pose.shinRight);
    parts.current.get('body')?.rotation.set(pose.bodyPitch, pose.bodyYaw, 0);
    lift.current?.position.set(0, (seated ? SEATED_ORIGIN : 0) + pose.bob * VOXEL, 0);
  });

  const partRef = (name: PartName) => (group: THREE.Group | null) => {
    if (group) parts.current.set(name, group);
    else parts.current.delete(name);
  };
  useEffect(() => invalidate(), [lit, invalidate]);
  return (
    <group ref={root} rotation={[0, YAW[request.facing], 0]}>
      {lit && <mesh geometry={RING} material={materialOf('glow')} position={[0, 0.02, 0]} />}
      <group ref={lift}>
        <Part geometry={meshes.body} joint={PART_JOINTS.body} partRef={partRef('body')} />
        <Part geometry={meshes.armLeft} joint={PART_JOINTS.armLeft} partRef={partRef('armLeft')} />
        <Part
          geometry={meshes.armRight}
          joint={PART_JOINTS.armRight}
          partRef={partRef('armRight')}
        />
        <Part
          geometry={meshes.thighLeft}
          joint={PART_JOINTS.thighLeft}
          partRef={partRef('thighLeft')}
        >
          <Part
            geometry={meshes.shinLeft}
            joint={PART_JOINTS.shinLeft}
            partRef={partRef('shinLeft')}
          />
        </Part>
        <Part
          geometry={meshes.thighRight}
          joint={PART_JOINTS.thighRight}
          partRef={partRef('thighRight')}
        >
          <Part
            geometry={meshes.shinRight}
            joint={PART_JOINTS.shinRight}
            partRef={partRef('shinRight')}
          />
        </Part>
      </group>
    </group>
  );
}
