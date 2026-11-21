import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GLOW } from '../Blocks';
import type { Piece, Surface } from './pieces';

// Pieces into as few meshes as possible (Phase 33, D6): every piece of the
// same surface merged into one geometry, coloured per vertex, with the
// shading baked in: a foot darker than the top, and foliage lit a little more
// from the sky above. A whole park costs a handful of draw calls.

const unitCache = new Map<string, THREE.BufferGeometry>();
/** Scratch matrices for placing a piece, reused piece after piece. */
const PLACE = new THREE.Matrix4();
const TURN = new THREE.Matrix4();

function unit(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let geometry = unitCache.get(key);
  if (!geometry) {
    const made = make();
    geometry = made.index ? made.toNonIndexed() : made;
    for (const name of Object.keys(geometry.attributes))
      if (name !== 'position' && name !== 'normal') geometry.deleteAttribute(name);
    unitCache.set(key, geometry);
  }
  return geometry;
}

/** A small hash in [0, 1) of a rounded position, so shared corners move together. */
function jitterOf(x: number, y: number, z: number, seed: number): number {
  const key =
    (Math.round(x * 1000) * 73_856_093) ^
    (Math.round(y * 1000) * 19_349_663) ^
    (Math.round(z * 1000) * 83_492_791) ^
    seed;
  return ((key >>> 0) % 1000) / 1000;
}

/** A triangular prism one unit across: base at -0.5, ridge along x at 0.5 up. */
function gableGeometry(): THREE.BufferGeometry {
  const l = -0.5;
  const r = 0.5;
  // Corners: front and back eaves at each end, and the ridge at each end.
  const corner = {
    lf: [l, -0.5, 0.5],
    lb: [l, -0.5, -0.5],
    lt: [l, 0.5, 0],
    rf: [r, -0.5, 0.5],
    rb: [r, -0.5, -0.5],
    rt: [r, 0.5, 0],
  } as const;
  const faces: (keyof typeof corner)[][] = [
    // Front slope, back slope, the two gable ends, the bottom.
    ['lf', 'rf', 'rt'],
    ['lf', 'rt', 'lt'],
    ['rb', 'lb', 'lt'],
    ['rb', 'lt', 'rt'],
    ['lb', 'lf', 'lt'],
    ['rf', 'rb', 'rt'],
    ['lb', 'rb', 'rf'],
    ['lb', 'rf', 'lf'],
  ];
  const positions = faces.flatMap((face) => face.flatMap((name) => [...corner[name]]));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** The shape of a piece, one unit across, standing on its centre (from -0.5 to 0.5 up). */
function shapeOf(piece: Piece): THREE.BufferGeometry {
  const sides = piece.sides ?? 12;
  switch (piece.shape ?? 'box') {
    case 'soft': {
      const radius = Math.min(0.05, Math.min(piece.w, piece.h, piece.d) * 0.3);
      const geometry = new RoundedBoxGeometry(piece.w, piece.h, piece.d, 1, radius);
      for (const name of Object.keys(geometry.attributes))
        if (name !== 'position' && name !== 'normal') geometry.deleteAttribute(name);
      // Back to one unit, so all shapes scale the same way below.
      return geometry.scale(1 / piece.w, 1 / piece.h, 1 / piece.d);
    }
    case 'ball':
      return unit('ball', () => new THREE.SphereGeometry(0.5, 14, 10)).clone();
    case 'drum':
      return unit(`drum${sides}`, () => new THREE.CylinderGeometry(0.5, 0.5, 1, sides)).clone();
    case 'cone':
      return unit(`cone${sides}`, () => new THREE.ConeGeometry(0.5, 1, sides)).clone();
    case 'dot':
      return unit('dot', () => new THREE.IcosahedronGeometry(0.5, 0)).clone();
    case 'blob': {
      const geometry = unit('blob', () => new THREE.IcosahedronGeometry(0.5, 1)).clone();
      const position = geometry.getAttribute('position') as THREE.BufferAttribute;
      const seed = piece.seed ?? 0;
      for (let index = 0; index < position.count; index += 1) {
        const x = position.getX(index);
        const y = position.getY(index);
        const z = position.getZ(index);
        const k = 0.86 + jitterOf(x, y, z, seed) * 0.28;
        position.setXYZ(index, x * k, y * k, z * k);
      }
      geometry.computeVertexNormals();
      return geometry;
    }
    case 'gable':
      return unit('gable', gableGeometry).clone();
    case 'box':
      return unit('box', () => new THREE.BoxGeometry(1, 1, 1)).clone();
  }
}

/** One piece in world coordinates (tile x → x, height → y, tile y → z), with its colours baked. */
export function pieceGeometry(piece: Piece): THREE.BufferGeometry {
  const geometry = shapeOf(piece);
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const normal = geometry.getAttribute('normal') as THREE.BufferAttribute;
  const glow = piece.surface === 'glow';
  const base = new THREE.Color(piece.color).multiplyScalar(glow ? GLOW : 1);
  const shade = glow ? 0 : (piece.shade ?? 0.18);
  const sky = piece.surface === 'facet';
  const colors = new Float32Array(position.count * 3);
  const tint = new THREE.Color();
  for (let index = 0; index < position.count; index += 1) {
    const up = Math.min(1, Math.max(0, position.getY(index) + 0.5));
    let k = 1 - shade * (1 - up);
    if (sky) k *= 0.86 + 0.18 * Math.max(0, normal.getY(index));
    tint
      .copy(base)
      .multiplyScalar(k)
      .toArray(colors, index * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  // Size, foot on the ground, lean, turn and place in one pass over the
  // vertices instead of five (Phase 37: the park is merged twice as fast).
  PLACE.makeTranslation(piece.x, piece.z, piece.y)
    .multiply(TURN.makeRotationY(piece.yaw ?? 0))
    .multiply(TURN.makeRotationX(piece.tilt ?? 0))
    .multiply(TURN.makeTranslation(0, piece.h / 2, 0))
    .multiply(TURN.makeScale(piece.w, piece.h, piece.d));
  geometry.applyMatrix4(PLACE);
  return geometry;
}

/** The pieces merged by surface. */
export function mergedPieces(
  pieces: readonly Piece[],
): { readonly surface: Surface; readonly geometry: THREE.BufferGeometry }[] {
  const groups = new Map<Surface, THREE.BufferGeometry[]>();
  for (const piece of pieces) {
    // A piece of no size draws nothing, and its degenerate faces are best not sent at all.
    if (piece.w < 1e-4 || piece.d < 1e-4 || piece.h < 1e-4) continue;
    const surface = piece.surface ?? 'matte';
    const list = groups.get(surface) ?? [];
    list.push(pieceGeometry(piece));
    groups.set(surface, list);
  }
  return [...groups].map(([surface, parts]) => {
    const geometry = mergeGeometries(parts) ?? new THREE.BufferGeometry();
    for (const part of parts) part.dispose();
    geometry.computeBoundingSphere();
    return { surface, geometry };
  });
}

function newMaterial(surface: Surface): THREE.Material {
  if (surface === 'glow') return new THREE.MeshBasicMaterial({ vertexColors: true, fog: true });
  return new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: surface === 'facet',
    roughness: surface === 'gloss' ? 0.3 : 0.86,
    metalness: 0,
  });
}

/** One material per surface for every environment, never disposed (as the office's `Blocks`). */
const MATERIALS = new Map<Surface, THREE.Material>();

export function surfaceMaterial(surface: Surface): THREE.Material {
  let material = MATERIALS.get(surface);
  if (!material) {
    material = newMaterial(surface);
    MATERIALS.set(surface, material);
  }
  return material;
}
