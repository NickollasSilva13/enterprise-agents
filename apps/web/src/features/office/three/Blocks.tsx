import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Block } from './model';

// Volumes drawn as few meshes as possible (Phase 24): everything with the
// same surface merged into one geometry, coloured per vertex. Since Phase 25
// each surface is its own material: matte, polished (reflects the room a
// little), glass (reflections and a blue tint) and lit (brighter than white,
// so the bloom catches it: neon, screens, lamps).

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_BALL = new THREE.SphereGeometry(0.5, 18, 14);
const UNIT_DRUM = new THREE.CylinderGeometry(0.5, 0.5, 1, 18);

/** How much brighter than its colour a lit block is: above 1 is what the bloom picks up. */
export const GLOW = 2.6;

const UNIT_LEAF = new THREE.SphereGeometry(0.5, 8, 5);

/** The shape of a block at its size, centred on the origin. */
function shapeOf(block: Block): THREE.BufferGeometry {
  const { w, d, h, shape = 'box' } = block;
  if (shape === 'soft') {
    // Rounded at its real size, so a thin top and a thick cushion both keep round edges.
    const radius = Math.min(0.05, Math.min(w, h, d) * 0.3);
    return new RoundedBoxGeometry(w, h, d, 1, radius);
  }
  const unit =
    shape === 'ball'
      ? UNIT_BALL
      : shape === 'drum'
        ? UNIT_DRUM
        : shape === 'leaf'
          ? UNIT_LEAF
          : UNIT_BOX;
  return unit.clone().scale(w, h, d);
}

/** One volume in world coordinates (tile x → x, height → y, tile y → z). */
export function geometryOf(block: Block, brightness = 1): THREE.BufferGeometry {
  const { x, y, z, w, d, h, color, roll = 0, pitch = 0, yaw = 0 } = block;
  // Rounded boxes come without the `uv` names of the others in the same order; only position, normal and colour are kept.
  // Rounded boxes are already unindexed; asking again only fills the console with warnings.
  const shape = shapeOf(block);
  const geometry = shape.index ? shape.toNonIndexed() : shape;
  if (geometry !== shape) shape.dispose();
  for (const name of Object.keys(geometry.attributes))
    if (name !== 'position' && name !== 'normal') geometry.deleteAttribute(name);
  if (roll) geometry.rotateZ(roll);
  if (pitch) geometry.rotateX(pitch);
  if (yaw) geometry.rotateY(yaw);
  geometry.translate(x + w / 2, z + h / 2, y + d / 2);
  const tint = new THREE.Color(color).multiplyScalar(brightness);
  const count = geometry.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) tint.toArray(colors, index * 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

export type Surface = 'matte' | 'gloss' | 'glow' | `glass:${number}`;

const surfaceOf = (block: Block): Surface =>
  block.glow
    ? 'glow'
    : (block.opacity ?? 1) < 1
      ? `glass:${block.opacity ?? 1}`
      : (block.finish ?? 'matte');

function newMaterial(surface: Surface): THREE.Material {
  if (surface === 'glow') return new THREE.MeshBasicMaterial({ vertexColors: true, fog: true });
  if (surface.startsWith('glass:')) {
    const opacity = Number(surface.slice('glass:'.length));
    return new THREE.MeshPhysicalMaterial({
      vertexColors: true,
      transparent: true,
      opacity,
      roughness: 0.08,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.1,
      envMapIntensity: 1.6,
      emissive: new THREE.Color('#2a3c8a'),
      emissiveIntensity: 0.55,
      depthWrite: false,
    });
  }
  return new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: surface === 'gloss' ? 0.32 : 0.78,
    metalness: surface === 'gloss' ? 0.08 : 0,
  });
}

/**
 * One material per surface, shared by every group of blocks and never
 * disposed: there are only a handful, and disposing one when a group is
 * rebuilt (a screen turning on) would throw its compiled shader away and
 * stall the next frame while it compiles again.
 */
const MATERIALS = new Map<Surface, THREE.Material>();

export function materialOf(surface: Surface): THREE.Material {
  let material = MATERIALS.get(surface);
  if (!material) {
    material = newMaterial(surface);
    MATERIALS.set(surface, material);
  }
  return material;
}

export function Blocks({
  blocks,
  castShadow = false,
  receiveShadow = false,
}: {
  blocks: readonly Block[];
  castShadow?: boolean;
  receiveShadow?: boolean;
}) {
  const meshes = useMemo(() => {
    const groups = new Map<Surface, Block[]>();
    for (const block of blocks) {
      const surface = surfaceOf(block);
      groups.set(surface, [...(groups.get(surface) ?? []), block]);
    }
    return [...groups].map(([surface, members]) => {
      const parts = members.map((block) => geometryOf(block, surface === 'glow' ? GLOW : 1));
      const geometry = mergeGeometries(parts) ?? new THREE.BufferGeometry();
      for (const part of parts) part.dispose();
      return { surface, geometry, material: materialOf(surface) };
    });
  }, [blocks]);
  useEffect(
    () => () => {
      for (const { geometry } of meshes) geometry.dispose();
    },
    [meshes],
  );
  return (
    <group>
      {meshes.map(({ surface, geometry, material }) => {
        // Glass and light neither cast shadows nor darken under them.
        const solid = surface === 'matte' || surface === 'gloss';
        return (
          <mesh
            key={surface}
            geometry={geometry}
            material={material}
            castShadow={castShadow && solid}
            receiveShadow={receiveShadow && solid}
            renderOrder={solid ? 0 : 1}
          />
        );
      })}
    </group>
  );
}
