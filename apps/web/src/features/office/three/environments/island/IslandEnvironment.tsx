import { entranceOf } from '@ea/shared';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { mix } from '../../../../../components/pixel-art/shade';
import { GROUND } from '../../approach';
import { LightPools, PieceMeshes, Water } from '../scenery';
import { townPieces } from '../town';
import type { EnvironmentDefinition, EnvironmentProps } from '../types';
import { coastDistance, type IslandShape, islandHeight, islandPlan, SAND } from './plan';

// The tropical island around the office (Phase 36): sand round the floor,
// the beach going down into clear water over a sandy shelf, the deep sea
// beyond, palms, the pier with its bungalows, the bar and the torches.

/** Ground tiles per vertex of the island and the shelf around it. */
const STEP = 0.5;
const REACH = 26;

function islandGeometry(shape: IslandShape, dusk: number): THREE.BufferGeometry {
  const columns = Math.round((shape.width + REACH * 2) / STEP);
  const rows = Math.round((shape.height + REACH * 2) / STEP);
  const positions = new Float32Array((columns + 1) * (rows + 1) * 3);
  const colors = new Float32Array((columns + 1) * (rows + 1) * 3);
  const color = new THREE.Color();
  for (let row = 0; row <= rows; row += 1)
    for (let column = 0; column <= columns; column += 1) {
      const x = -REACH + column * STEP;
      const y = -REACH + row * STEP;
      const index = row * (columns + 1) + column;
      positions.set([x, islandHeight(shape, x, y), y], index * 3);
      const coast = coastDistance(shape, x, y);
      const ripple = Math.sin(x * 0.9 + y * 0.4) * 0.04;
      let hex: string;
      if (coast < -5) hex = mix('#8cc565', SAND, Math.min(1, Math.max(0, (coast + 7) / 2)));
      else if (coast < -0.5) hex = SAND;
      else if (coast < 0.4) hex = mix(SAND, '#cdb47c', (coast + 0.5) / 0.9);
      else hex = mix('#bfe6cf', '#1d6f93', Math.min(1, (coast - 0.4) / 9));
      color.set(mix(hex, '#1f2c46', dusk * 0.5)).offsetHSL(0, 0, ripple);
      color.toArray(colors, index * 3);
    }
  const indices: number[] = [];
  for (let row = 0; row < rows; row += 1)
    for (let column = 0; column < columns; column += 1) {
      const a = row * (columns + 1) + column;
      const b = a + 1;
      const c = a + columns + 1;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function IslandScene({ layout, light, reduced }: EnvironmentProps) {
  const dusk = 1 - light;
  // The island depends only on the size of the floor and where its entrance is.
  const entrance = entranceOf(layout);
  const key = `${layout.width}x${layout.height}@${entrance ? `${entrance.x},${entrance.y}` : '-'}`;
  const plan = useMemo(
    () => islandPlan(layout),
    // The key stands for the size and the entrance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  const ground = useMemo(() => islandGeometry(plan.shape, dusk), [plan, dusk]);
  useEffect(() => () => ground.dispose(), [ground]);
  const pieces = useMemo(() => townPieces(plan.things, dusk, light), [plan, dusk, light]);
  const pools = useMemo(
    () => plan.torches.map((torch) => ({ ...torch, z: GROUND, r: 1.3 })),
    [plan],
  );
  return (
    <group>
      {/* The deep sea floor beyond the island's shelf. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, GROUND - 1.7, 0]}>
        <planeGeometry args={[500, 500]} />
        <meshStandardMaterial color={mix('#165a80', '#0b1a3a', dusk)} roughness={1} />
      </mesh>
      <mesh geometry={ground} receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.95} />
      </mesh>
      <Water
        x={layout.width / 2}
        y={layout.height / 2}
        w={300}
        d={300}
        level={plan.level}
        color={mix('#33c1d6', '#173d70', dusk)}
        reduced={reduced}
        opacity={0.62}
      />
      <PieceMeshes pieces={pieces} layout={layout} />
      <LightPools spots={pools} dusk={dusk} />
    </group>
  );
}

export const ISLAND: EnvironmentDefinition = {
  sky: {
    night: { top: '#0d0a26', bottom: '#3a2878' },
    day: { top: '#5fb4f2', bottom: '#e8f8ff' },
    clouds: 8,
  },
  fog: { start: 8, depth: 40 },
  Scene: IslandScene,
};
