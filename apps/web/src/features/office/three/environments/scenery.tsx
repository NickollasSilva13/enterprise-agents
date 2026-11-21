import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mergedPieces, surfaceMaterial } from './meshes';
import { GROUND } from '../approach';
import type { Piece } from './pieces';

// Parts of a scene every environment can use (Phase 35, from the park of
// Phase 33): the pieces merged into a few meshes, water that ripples, and
// the pools of lamplight drawn on the ground at night (drawn, not lights, so
// nothing reaches the office).

/** A tileable pattern of little waves, as a normal map. */
function rippleTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (context) {
    const image = context.createImageData(size, size);
    const wave = (x: number, y: number) =>
      Math.sin(((x + y * 0.5) / size) * Math.PI * 2 * 3) * 0.6 +
      Math.sin(((y - x * 0.3) / size) * Math.PI * 2 * 5) * 0.4 +
      Math.sin(((x * 0.7 + y) / size) * Math.PI * 2 * 7) * 0.25;
    for (let y = 0; y < size; y += 1)
      for (let x = 0; x < size; x += 1) {
        const dx = wave(x + 1, y) - wave(x - 1, y);
        const dy = wave(x, y + 1) - wave(x, y - 1);
        const offset = (y * size + x) * 4;
        image.data[offset] = 128 + dx * 60;
        image.data[offset + 1] = 128 + dy * 60;
        image.data[offset + 2] = 255;
        image.data[offset + 3] = 255;
      }
    context.putImageData(image, 0, 0);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/** A soft round light for the grass under a lamp at night. */
function poolTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (context) {
    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255,214,150,0.9)');
    gradient.addColorStop(0.45, 'rgba(255,190,120,0.35)');
    gradient.addColorStop(1, 'rgba(255,170,100,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Moves the ripples on the frames the scene draws anyway (people walking,
 * typing, talking), unless motion is reduced. It asks for no frame of its
 * own: redrawing the whole scene, shadows and effects included, a dozen
 * times a second just for the water slowed the page down (Phase 34).
 */
function Ripples({ texture, reduced }: { texture: THREE.Texture; reduced: boolean }) {
  useFrame(({ clock }) => {
    if (reduced) return;
    const t = clock.getElapsedTime();
    texture.offset.set(t * 0.012, t * 0.007);
  });
  return null;
}

/**
 * The pieces of an environment, merged by surface. Only those near the office,
 * inside the box the sun's shadows cover (as `Lights` sets it), and standing
 * up from the ground cast shadows: a merged mesh is never culled, so far
 * pieces would cost the shadow pass every frame for shadows nobody sees.
 */
export function PieceMeshes({
  pieces,
  layout,
}: {
  pieces: readonly Piece[];
  layout: { readonly width: number; readonly height: number };
}) {
  const { width, height } = layout;
  const meshes = useMemo(() => {
    const reach = (width + height) * 0.75;
    const near = (piece: Piece) =>
      piece.h > 0.12 &&
      Math.abs(piece.x - width / 2) < reach &&
      Math.abs(piece.y - height / 2) < reach;
    return [
      ...mergedPieces(pieces.filter(near)).map((mesh) => ({ ...mesh, casts: true })),
      ...mergedPieces(pieces.filter((piece) => !near(piece))).map((mesh) => ({
        ...mesh,
        casts: false,
      })),
    ];
  }, [pieces, width, height]);
  useEffect(
    () => () => {
      for (const { geometry } of meshes) geometry.dispose();
    },
    [meshes],
  );
  return (
    <>
      {meshes.map(({ surface, geometry, casts }) => {
        const solid = surface !== 'glow';
        return (
          <mesh
            key={`${surface}-${casts ? 'near' : 'far'}`}
            geometry={geometry}
            material={surfaceMaterial(surface)}
            castShadow={solid && casts}
            receiveShadow={solid}
          />
        );
      })}
    </>
  );
}

/** A still or rippling surface of water over a rectangle, in tiles. */
export function Water({
  x,
  y,
  w,
  d,
  level,
  color,
  reduced,
  opacity = 0.9,
}: {
  x: number;
  y: number;
  w: number;
  d: number;
  level: number;
  color: string;
  reduced: boolean;
  opacity?: number;
}) {
  const ripples = useMemo(rippleTexture, []);
  useEffect(() => () => ripples.dispose(), [ripples]);
  useEffect(() => {
    ripples.repeat.set(w / 3, d / 3);
  }, [ripples, w, d]);
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[x, level, y]}>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial
          color={color}
          roughness={0.08}
          metalness={0.25}
          normalMap={ripples}
          normalScale={new THREE.Vector2(0.35, 0.35)}
          envMapIntensity={2.2}
          transparent
          opacity={opacity}
        />
      </mesh>
      <Ripples texture={ripples} reduced={reduced} />
    </>
  );
}

export interface PoolOfLight {
  readonly x: number;
  readonly y: number;
  /** Height of the ground under it. */
  readonly z: number;
  /** Radius, in tiles. */
  readonly r: number;
}

/** Lamplight on the ground at night, one quad each, merged; nothing by day. */
export function LightPools({ spots, dusk }: { spots: readonly PoolOfLight[]; dusk: number }) {
  const texture = useMemo(poolTexture, []);
  const geometry = useMemo(() => {
    const parts = spots.map((spot) => {
      const quad = new THREE.PlaneGeometry(spot.r * 2, spot.r * 2);
      quad.rotateX(-Math.PI / 2);
      quad.translate(spot.x, spot.z + 0.06, spot.y);
      return quad;
    });
    const merged = mergeGeometries(parts) ?? new THREE.BufferGeometry();
    for (const part of parts) part.dispose();
    return merged;
  }, [spots]);
  useEffect(
    () => () => {
      texture.dispose();
      geometry.dispose();
    },
    [texture, geometry],
  );
  if (dusk <= 0.35) return null;
  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial
        map={texture}
        transparent
        opacity={Math.min(1, (dusk - 0.35) * 1.6) * 0.7}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
}

/** A lawn under everything, out to where the haze hides it. */
export function Lawn({ color }: { color: string }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, GROUND - 0.025, 0]} receiveShadow>
      <planeGeometry args={[500, 500]} />
      <meshStandardMaterial color={color} roughness={0.95} />
    </mesh>
  );
}
