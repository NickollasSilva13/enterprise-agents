import { type Appearance, defaultAppearance } from '@ea/shared';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { FrameRequest } from '../../../components/pixel-art/character';
import { agentLook } from '../../../components/pixel-art/robot';
import { GLOW } from './Blocks';
import { type PartName, VOXEL, type Voxel, type VoxelFigure, voxelFigure } from './voxel';

// The geometry of a voxel character, shared by the office scene (Phase 27)
// and the portraits outside it, so both show the same figure. Plain three.js,
// without React Three Fiber: the portraits load it apart from the scene.

export const PARTS: readonly PartName[] = [
  'body',
  'armLeft',
  'armRight',
  'thighLeft',
  'thighRight',
  'shinLeft',
  'shinRight',
];

export interface PartMeshes {
  readonly solid: THREE.BufferGeometry;
  readonly glow: THREE.BufferGeometry | null;
}

/** Boxes of one part merged into one geometry per surface, in tiles, coloured per vertex. */
function meshesOf(voxels: readonly Voxel[]): PartMeshes {
  const build = (list: readonly Voxel[], brightness: number) => {
    if (list.length === 0) return null;
    const parts = list.map((voxel) => {
      const geometry = new THREE.BoxGeometry(voxel.w * VOXEL, voxel.h * VOXEL, voxel.d * VOXEL);
      geometry.translate(
        (voxel.x + voxel.w / 2) * VOXEL,
        (voxel.y + voxel.h / 2) * VOXEL,
        (voxel.z + voxel.d / 2) * VOXEL,
      );
      geometry.deleteAttribute('uv');
      const tint = new THREE.Color(voxel.color).multiplyScalar(brightness);
      const colors = new Float32Array(geometry.getAttribute('position').count * 3);
      for (let index = 0; index < colors.length / 3; index += 1) tint.toArray(colors, index * 3);
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      return geometry;
    });
    const merged = mergeGeometries(parts) ?? new THREE.BufferGeometry();
    for (const part of parts) part.dispose();
    return merged;
  };
  return {
    solid:
      build(
        voxels.filter((voxel) => !voxel.glow),
        1,
      ) ?? new THREE.BufferGeometry(),
    glow: build(
      voxels.filter((voxel) => voxel.glow),
      GLOW,
    ),
  };
}

/**
 * Geometry by look, shared by every character that looks the same and kept
 * for the session: a handful of looks, each a few thousand vertices.
 */
const FIGURES = new Map<string, Readonly<Record<PartName, PartMeshes>>>();
const FIGURES_KEPT = 120;

function figureMeshes(
  key: string,
  figure: () => VoxelFigure,
): Readonly<Record<PartName, PartMeshes>> {
  const cached = FIGURES.get(key);
  if (cached) return cached;
  const built = figure();
  const meshes = Object.fromEntries(
    PARTS.map((name) => [name, meshesOf(built[name].voxels)]),
  ) as Record<PartName, PartMeshes>;
  if (FIGURES.size >= FIGURES_KEPT) {
    const oldest = FIGURES.keys().next();
    if (!oldest.done) {
      for (const part of Object.values(FIGURES.get(oldest.value) ?? {})) {
        part.solid.dispose();
        part.glow?.dispose();
      }
      FIGURES.delete(oldest.value);
    }
  }
  FIGURES.set(key, meshes);
  return meshes;
}

/** The key of a figure: who, how they look and what they hold. */
export const figureKey = (
  agentId: string,
  appearance: Appearance | null,
  holding: FrameRequest['holding'],
) => JSON.stringify([agentId, appearance, holding]);

/** The meshes of the figure with `key` (from `figureKey`), built once. */
export function lookMeshes(key: string): Readonly<Record<PartName, PartMeshes>> {
  return figureMeshes(key, () => {
    const [id, chosen, held] = JSON.parse(key) as [
      string,
      Appearance | null,
      FrameRequest['holding'],
    ];
    const look = chosen ?? defaultAppearance(id);
    const robot = look.kind === 'robot' ? agentLook(id) : null;
    return voxelFigure(look, robot, held);
  });
}
