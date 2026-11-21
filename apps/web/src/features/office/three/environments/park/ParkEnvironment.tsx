import { entranceOf } from '@ea/shared';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { mix } from '../../../../../components/pixel-art/shade';
import { GROUND } from '../../approach';
import { LightPools, PieceMeshes, type PoolOfLight, Water } from '../scenery';
import { shadeOf } from '../pieces';
import type { EnvironmentDefinition, EnvironmentProps } from '../types';
import { parkPieces } from './build';
import { heightAt, outside, type ParkPlan, parkPlan, type Point, shoreDistance } from './plan';

// The park around the office (Phase 33): the lawn rising in soft mounds, the
// lake with its rippling water, and every tree, bench and lamp of the plan,
// merged by surface. At night the lamps cast pools of light on the grass;
// those pools are drawn, not lights, so nothing of the park lights the office.

/** Ground tiles per vertex of the detailed lawn. */
const STEP = 0.5;

const GRASS = ['#5aa04a', '#67ad4f', '#4f9445', '#73b556'] as const;
const NIGHT_GRASS = '#1f2c46';

/** Distance from a point to the segment from a to b. */
function segmentDistance(x: number, y: number, a: Point, b: Point): number {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const length = vx * vx + vy * vy;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * vx + (y - a.y) * vy) / length));
  return Math.hypot(x - a.x - vx * t, y - a.y - vy * t);
}

function terrainGeometry(plan: ParkPlan, dusk: number): THREE.BufferGeometry {
  const x0 = -plan.reach;
  const y0 = -plan.reach;
  const columns = Math.round((plan.width + plan.reach * 2) / STEP);
  const rows = Math.round((plan.height + plan.reach * 2) / STEP);
  const positions = new Float32Array((columns + 1) * (rows + 1) * 3);
  const colors = new Float32Array((columns + 1) * (rows + 1) * 3);
  const color = new THREE.Color();
  const vertices = (columns + 1) * (rows + 1);
  const at = (column: number, row: number) => row * (columns + 1) + column;
  const span = (from: number, to: number, origin: number, last: number) => [
    Math.max(0, Math.floor((from - origin) / STEP)),
    Math.min(last, Math.ceil((to - origin) / STEP)),
  ];
  // Each path and each tree marks only the points near it, instead of every
  // point asking every path and every tree (Phase 37: a third of a second
  // less before the first frame). The colours come out the same.
  const worn = new Float32Array(vertices).fill(Number.POSITIVE_INFINITY);
  for (const path of plan.paths) {
    const reach = path.width / 2 + 0.45;
    for (let k = 1; k < path.line.length; k += 1) {
      const a = path.line[k - 1];
      const b = path.line[k];
      if (!a || !b) continue;
      const [c0 = 0, c1 = 0] = span(
        Math.min(a.x, b.x) - reach,
        Math.max(a.x, b.x) + reach,
        x0,
        columns,
      );
      const [r0 = 0, r1 = 0] = span(
        Math.min(a.y, b.y) - reach,
        Math.max(a.y, b.y) + reach,
        y0,
        rows,
      );
      for (let row = r0; row <= r1; row += 1)
        for (let column = c0; column <= c1; column += 1) {
          const distance =
            segmentDistance(x0 + column * STEP, y0 + row * STEP, a, b) - path.width / 2;
          const index = at(column, row);
          if (distance < (worn[index] ?? Number.POSITIVE_INFINITY)) worn[index] = distance;
        }
    }
  }
  // The shade of each tree on the points under it, in the order of the trees.
  const shade: (number[] | undefined)[] = new Array<number[] | undefined>(vertices);
  for (const tree of plan.trees) {
    const radius = tree.size * 1.1;
    const [c0 = 0, c1 = 0] = span(tree.x - radius, tree.x + radius, x0, columns);
    const [r0 = 0, r1 = 0] = span(tree.y - radius, tree.y + radius, y0, rows);
    for (let row = r0; row <= r1; row += 1)
      for (let column = c0; column <= c1; column += 1) {
        const near = Math.hypot(tree.x - (x0 + column * STEP), tree.y - (y0 + row * STEP)) / radius;
        if (near >= 1) continue;
        const index = at(column, row);
        (shade[index] ??= []).push(0.22 * (1 - near));
      }
  }
  for (let row = 0; row <= rows; row += 1)
    for (let column = 0; column <= columns; column += 1) {
      const x = x0 + column * STEP;
      const y = y0 + row * STEP;
      const index = row * (columns + 1) + column;
      const z = heightAt(plan, x, y);
      positions.set([x, z, y], index * 3);
      // Patches of greener and yellower grass.
      const patch = Math.sin(x * 0.37 + y * 0.11) + Math.cos(y * 0.29 - x * 0.07) * 0.8;
      let hex: string = GRASS[Math.abs(Math.floor(patch * 1.6 + 3)) % GRASS.length] ?? '#5aa04a';
      hex = mix(hex, GRASS[(column + row) % 2 === 0 ? 1 : 2] ?? hex, 0.25);
      // Worn at the edge of the paths.
      const path = worn[index] ?? Number.POSITIVE_INFINITY;
      if (path < 0.45) hex = mix(hex, '#9a9b62', 0.45 * (1 - Math.max(0, path) / 0.45));
      // Sand and pebbles at the shore, darker under the water.
      const shore = shoreDistance(plan.lake, x, y);
      if (shore < 0.6) hex = mix(hex, '#cdbb8a', Math.min(1, (0.6 - shore) / 0.4));
      if (shore < -0.2) hex = mix('#cdbb8a', '#3d5f5a', Math.min(1, (-0.2 - shore) / 1.2));
      // The shade under the trees, baked into the grass.
      for (const amount of shade[index] ?? []) hex = shadeOf(hex, amount);
      // Under the floating floor, a little darker.
      if (outside(plan, x, y) < 0.6) hex = shadeOf(hex, 0.2);
      color.set(mix(hex, NIGHT_GRASS, dusk * 0.48));
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

/** The lawn beyond the detailed ground, out to where the haze hides it, with a hole where that ground is. */
function farLawnGeometry(plan: ParkPlan): THREE.BufferGeometry {
  const far = 200;
  const outline = new THREE.Shape();
  outline.moveTo(-far, -far);
  outline.lineTo(far + plan.width, -far);
  outline.lineTo(far + plan.width, far + plan.height);
  outline.lineTo(-far, far + plan.height);
  outline.closePath();
  const inner = plan.reach - 0.25;
  const hole = new THREE.Path();
  hole.moveTo(-inner, -inner);
  hole.lineTo(-inner, plan.height + inner);
  hole.lineTo(plan.width + inner, plan.height + inner);
  hole.lineTo(plan.width + inner, -inner);
  hole.closePath();
  outline.holes.push(hole);
  const geometry = new THREE.ShapeGeometry(outline);
  // The shape is drawn on x and y; the ground lies on x and z.
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, GROUND, 0);
  return geometry;
}

/** The pools of lamplight: the lamps, and the gazebo at night. */
function poolsOf(plan: ParkPlan): PoolOfLight[] {
  return [
    ...plan.lamps.map((lamp) => ({
      x: lamp.x,
      y: lamp.y,
      z: heightAt(plan, lamp.x, lamp.y),
      r: 1.6,
    })),
    {
      x: plan.gazebo.x,
      y: plan.gazebo.y,
      z: heightAt(plan, plan.gazebo.x, plan.gazebo.y) + 0.32,
      r: 2.4,
    },
  ];
}

function ParkScene({ layout, light, reduced }: EnvironmentProps) {
  const dusk = 1 - light;
  // The park depends only on the size of the floor and where its entrance is.
  const entrance = entranceOf(layout);
  const key = `${layout.width}x${layout.height}@${entrance ? `${entrance.x},${entrance.y}` : '-'}`;
  const plan = useMemo(
    () => parkPlan(layout),
    // The key stands for the size and the entrance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  const terrain = useMemo(() => terrainGeometry(plan, dusk), [plan, dusk]);
  useEffect(() => () => terrain.dispose(), [terrain]);
  const pieces = useMemo(() => parkPieces(plan, dusk), [plan, dusk]);
  const farLawn = useMemo(() => farLawnGeometry(plan), [plan]);
  useEffect(() => () => farLawn.dispose(), [farLawn]);
  const pools = useMemo(() => poolsOf(plan), [plan]);
  const lake = useMemo(() => {
    const xs = plan.lake.lobes.flatMap((lobe) => [lobe.x - lobe.rx, lobe.x + lobe.rx]);
    const ys = plan.lake.lobes.flatMap((lobe) => [lobe.y - lobe.ry, lobe.y + lobe.ry]);
    const x0 = Math.min(...xs) - 1.5;
    const x1 = Math.max(...xs) + 1.5;
    const y0 = Math.min(...ys) - 1.5;
    const y1 = Math.max(...ys) + 1.5;
    return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: x1 - x0, d: y1 - y0 };
  }, [plan]);
  return (
    <group>
      {/* The far lawn, under the detailed one, out to where the haze hides it. */}
      <mesh geometry={farLawn}>
        <meshStandardMaterial
          side={THREE.DoubleSide}
          color={mix('#5f9f4c', NIGHT_GRASS, dusk * 0.55)}
          roughness={0.95}
        />
      </mesh>
      <mesh geometry={terrain} receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.95} />
      </mesh>
      <Water
        x={lake.x}
        y={lake.y}
        w={lake.w}
        d={lake.d}
        level={plan.lake.level}
        color={mix('#3f93b5', '#1b2c5c', dusk)}
        reduced={reduced}
      />
      <PieceMeshes pieces={pieces} layout={layout} />
      <LightPools spots={pools} dusk={dusk} />
    </group>
  );
}

export const PARK: EnvironmentDefinition = {
  sky: {
    night: { top: '#0d0a26', bottom: '#3a2878' },
    day: { top: '#7cbcf0', bottom: '#e4f4ff' },
    clouds: 9,
  },
  fog: { start: 6, depth: 40 },
  Scene: ParkScene,
};
