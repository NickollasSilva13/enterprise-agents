import type { OfficeLayout } from '@ea/shared';
import { useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { type SkyColors, skyAt } from '../daylight';
import { GROUND, logoBlocks, seeded, stepBlocks } from './approach';
import { Blocks } from './Blocks';

// Around the 3D office whatever the environment (Phase 25; since Phase 34
// the city is its own environment): the sky of each environment, and the
// steps, the glow under the floor and the mark, which belong to the office.
// Everything follows the clock (`light`, 0 at night and 1 by day).

/** The sky of an environment by night and by day (Phase 33): a gradient, with stars at night and clouds by day. */
export interface SkyPalette {
  readonly night: SkyColors;
  readonly day: SkyColors;
  /** How many soft clouds cross the day sky. */
  readonly clouds: number;
}

/** The colour things fade into far away: the bottom of the sky. */
export const horizonAt = (light: number, palette: SkyPalette) =>
  skyAt(light, palette.night, palette.day).bottom;

/** The sky as the background of the drawing: a gradient, with stars at night. */
export function Sky({ light, palette }: { light: number; palette: SkyPalette }) {
  const scene = useThree((state) => state.scene);
  const invalidate = useThree((state) => state.invalidate);
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext('2d');
    if (context) {
      const { top, bottom } = skyAt(light, palette.night, palette.day);
      const gradient = context.createLinearGradient(0, 0, 0, 512);
      gradient.addColorStop(0, top);
      gradient.addColorStop(1, bottom);
      context.fillStyle = gradient;
      context.fillRect(0, 0, 512, 512);
      const random = seeded('stars');
      context.fillStyle = '#fff6c9';
      for (let index = 0; index < 120; index += 1) {
        context.globalAlpha = (0.25 + random() * 0.6) * (1 - light);
        const size = random() < 0.15 ? 2 : 1;
        context.fillRect(random() * 512, random() * 300, size, size);
      }
      // Clouds: a few overlapping soft ellipses each, faint and gone at night.
      const drift = seeded('clouds');
      for (let cloud = 0; cloud < palette.clouds; cloud += 1) {
        const cx = drift() * 512;
        const cy = 40 + drift() * 220;
        const span = 50 + drift() * 70;
        for (let puff = 0; puff < 6; puff += 1) {
          const px = cx + (drift() - 0.5) * span;
          const py = cy + (drift() - 0.5) * span * 0.18;
          const radius = span * (0.18 + drift() * 0.16);
          const soft = context.createRadialGradient(px, py, 0, px, py, radius);
          soft.addColorStop(0, `rgba(255,255,255,${0.55 * light})`);
          soft.addColorStop(1, 'rgba(255,255,255,0)');
          context.globalAlpha = 1;
          context.fillStyle = soft;
          context.fillRect(px - radius, py - radius, radius * 2, radius * 2);
        }
      }
    }
    const result = new THREE.CanvasTexture(canvas);
    result.colorSpace = THREE.SRGBColorSpace;
    return result;
  }, [light, palette]);
  useEffect(() => {
    scene.background = texture;
    invalidate();
    return () => {
      scene.background = null;
      texture.dispose();
    };
  }, [scene, texture, invalidate]);
  return null;
}

// ---------------------------------------------------------------------------
// The steps, the glow under the floor and the mark

function glowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (context) {
    const gradient = context.createRadialGradient(128, 128, 0, 128, 128, 128);
    gradient.addColorStop(0, 'rgba(180,130,255,0.9)');
    gradient.addColorStop(0.5, 'rgba(140,90,240,0.35)');
    gradient.addColorStop(1, 'rgba(120,80,220,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 256, 256);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * What belongs to the office whatever is around it: the steps down from the
 * entrance, the glow under the floor and the panel with the mark (Phase 33,
 * D2: the environment never changes these).
 */
export function Approach({ layout, light }: { layout: OfficeLayout; light: number }) {
  const { width, height } = layout;
  const glow = useMemo(glowTexture, []);
  useEffect(() => () => glow.dispose(), [glow]);
  const dusk = 1 - light;
  const steps = useMemo(() => stepBlocks(layout), [layout]);
  const logo = useMemo(() => logoBlocks(layout), [layout]);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[width / 2, GROUND + 0.01, height / 2]}>
        <planeGeometry args={[(width + height) * 0.95, (width + height) * 0.95]} />
        <meshBasicMaterial
          map={glow}
          transparent
          opacity={0.08 + dusk * 0.32}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <Blocks blocks={steps} castShadow receiveShadow />
      <Blocks blocks={logo} />
    </group>
  );
}
