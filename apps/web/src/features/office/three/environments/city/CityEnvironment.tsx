import { entranceOf, type OfficeLayout } from '@ea/shared';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mix } from '../../../../../components/pixel-art/shade';
import { GROUND, seeded } from '../../approach';
import { Blocks } from '../../Blocks';
import type { Block } from '../../model';
import type { SkyPalette } from '../../Surroundings';
import { inkOf } from '../kit';
import { Lawn, LightPools, PieceMeshes } from '../scenery';
import { townPieces } from '../town';
import type { EnvironmentDefinition, EnvironmentProps } from '../types';
import { cityPlan, type Tower, towersOf } from './plan';

// The city around the 3D office (Phase 25), an environment since Phase 34 and
// redrawn after Phase 38: the towers with their lit windows rising behind,
// and at street level the square, the avenues, the shops, the trees, the
// lamps and the cars of `cityPlan`. Everything follows the clock (`light`, 0
// at night and 1 by day).

export const CITY_SKY: SkyPalette = {
  night: { top: '#0d0a26', bottom: '#3a2878' },
  day: { top: '#7fb6ef', bottom: '#dcecff' },
  clouds: 5,
};

/** Windows per tile across a facade, and floor height in tiles. */
const WINDOWS_PER_TILE = 2.4;
const FLOOR = 0.26;
/** The facade picture: 8 windows across, 16 floors up. */
const COLUMNS = 8;
const ROWS = 16;
const CELL = 32;

/**
 * The facade pattern: `map` is the wall with its dark glass, `lights` the
 * windows that are lit (warm or cold), some whole floors at once, as offices.
 */
function facadeTextures(): { map: THREE.CanvasTexture; lights: THREE.CanvasTexture } {
  const make = () => {
    const canvas = document.createElement('canvas');
    canvas.width = COLUMNS * CELL;
    canvas.height = ROWS * CELL;
    return canvas;
  };
  const wall = make();
  const glow = make();
  const walls = wall.getContext('2d');
  const glows = glow.getContext('2d');
  const random = seeded('facade');
  if (walls && glows) {
    walls.fillStyle = '#ffffff';
    walls.fillRect(0, 0, wall.width, wall.height);
    glows.fillStyle = '#000000';
    glows.fillRect(0, 0, glow.width, glow.height);
    for (let row = 0; row < ROWS; row += 1) {
      const wholeFloor = random() < 0.15;
      for (let column = 0; column < COLUMNS; column += 1) {
        const x = column * CELL + 7;
        const y = row * CELL + 7;
        walls.fillStyle = '#5a5f8c';
        walls.fillRect(x, y, CELL - 12, CELL - 10);
        if (wholeFloor || random() < 0.3) {
          glows.fillStyle = random() < 0.8 ? '#ffd27a' : '#9fd8ff';
          glows.fillRect(x, y, CELL - 12, CELL - 10);
        }
      }
    }
  }
  const finish = (canvas: HTMLCanvasElement) => {
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  };
  return { map: finish(wall), lights: finish(glow) };
}

const TOWER_NIGHT = ['#4a4088', '#544a96', '#3f3878', '#5b4f9e'];
const TOWER_DAY = ['#b8c2e6', '#a9b5df', '#c4cdeb', '#9fadd8'];

/** A tower's box with its facades mapped to whole windows and floors; the roof is plain wall. */
function towerGeometry(tower: Tower, light: number): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  geometry.scale(tower.w, tower.h, tower.d);
  geometry.translate(tower.x + tower.w / 2, GROUND + tower.h / 2, tower.y + tower.d / 2);
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
  // Faces of a box: +x, -x, +y, -y, +z, -z, four corners each.
  const across = [tower.d, tower.d, 0, 0, tower.w, tower.w];
  for (let face = 0; face < 6; face += 1) {
    for (let corner = 0; corner < 4; corner += 1) {
      const index = face * 4 + corner;
      const width = across[face] ?? 0;
      if (width === 0) {
        uv.setXY(index, 0.005, 0.005);
        continue;
      }
      uv.setXY(
        index,
        (uv.getX(index) * width * WINDOWS_PER_TILE + tower.shift) / COLUMNS,
        (uv.getY(index) * tower.h) / FLOOR / ROWS,
      );
    }
  }
  const tint = new THREE.Color(
    mix(TOWER_NIGHT[tower.tone] ?? '#4a4088', TOWER_DAY[tower.tone] ?? '#b8c2e6', light),
  );
  const position = geometry.getAttribute('position');
  const count = position.count;
  const colors = new Float32Array(count * 3);
  const shaded = new THREE.Color();
  // Darker at the foot, as the street's shade and the haze between towers; lighter up top.
  for (let index = 0; index < count; index += 1) {
    const rise = (position.getY(index) - GROUND) / tower.h;
    shaded.copy(tint).multiplyScalar(0.62 + rise * 0.45);
    shaded.toArray(colors, index * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

/** What crowns a tower: a neon outline, an antenna with its red light, or a machine room. */
function crownBlocks(tower: Tower, light: number): Block[] {
  const top = GROUND + tower.h;
  const tone = mix(TOWER_NIGHT[tower.tone] ?? '#4a4088', TOWER_DAY[tower.tone] ?? '#b8c2e6', light);
  const neon = mix('#c08cff', '#9b8cd8', light);
  switch (tower.crown) {
    case 'neon':
      return [
        {
          x: tower.x,
          y: tower.y + tower.d - 0.04,
          z: top - 0.05,
          w: tower.w,
          d: 0.06,
          h: 0.06,
          color: neon,
          glow: true,
        },
        {
          x: tower.x + tower.w - 0.04,
          y: tower.y,
          z: top - 0.05,
          w: 0.06,
          d: tower.d,
          h: 0.06,
          color: neon,
          glow: true,
        },
      ];
    case 'antenna':
      return [
        {
          x: tower.x + tower.w / 2 - 0.03,
          y: tower.y + tower.d / 2 - 0.03,
          z: top,
          w: 0.06,
          d: 0.06,
          h: 1,
          color: '#2b2550',
        },
        {
          x: tower.x + tower.w / 2 - 0.07,
          y: tower.y + tower.d / 2 - 0.07,
          z: top + 1,
          w: 0.14,
          d: 0.14,
          h: 0.14,
          color: '#ff5a7a',
          glow: true,
          shape: 'ball',
        },
      ];
    case 'box':
      return [
        {
          x: tower.x + tower.w * 0.25,
          y: tower.y + tower.d * 0.25,
          z: top,
          w: tower.w * 0.5,
          d: tower.d * 0.5,
          h: 0.35,
          color: tone,
        },
      ];
    case 'tier':
      return [
        {
          x: tower.x + tower.w * 0.15,
          y: tower.y + tower.d * 0.15,
          z: top,
          w: tower.w * 0.7,
          d: tower.d * 0.7,
          h: 0.9,
          color: tone,
        },
        {
          x: tower.x + tower.w * 0.3,
          y: tower.y + tower.d * 0.3,
          z: top + 0.9,
          w: tower.w * 0.4,
          d: tower.d * 0.4,
          h: 0.6,
          color: tone,
        },
      ];
    case 'none':
      return [];
  }
}

/** The foot of a tower: a lobby of glass, warm at night, under a stone band. */
function podiumBlocks(tower: Tower, light: number): Block[] {
  const stone = mix('#2e2950', '#d9d4cc', light);
  return [
    {
      x: tower.x - 0.12,
      y: tower.y - 0.12,
      z: GROUND,
      w: tower.w + 0.24,
      d: tower.d + 0.24,
      h: 0.75,
      // Warm by night without the bloom: a whole lit floor at every foot would glare.
      color: mix('#b0844f', '#7f9bbf', light),
    },
    {
      x: tower.x - 0.16,
      y: tower.y - 0.16,
      z: GROUND + 0.75,
      w: tower.w + 0.32,
      d: tower.d + 0.32,
      h: 0.22,
      color: stone,
    },
  ];
}

export function City({ layout, light }: { layout: OfficeLayout; light: number }) {
  const towers = useMemo(() => towersOf(layout), [layout]);
  const textures = useMemo(facadeTextures, []);
  useEffect(
    () => () => {
      textures.map.dispose();
      textures.lights.dispose();
    },
    [textures],
  );
  const { geometry, material } = useMemo(() => {
    const parts = towers.map((tower) => towerGeometry(tower, light));
    const merged = mergeGeometries(parts) ?? new THREE.BufferGeometry();
    for (const part of parts) part.dispose();
    const facade = new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: textures.map,
      emissiveMap: textures.lights,
      emissive: new THREE.Color('#ffffff'),
      // By day only a few windows show; at night they glow enough for the bloom.
      emissiveIntensity: 0.05 + (1 - light) * 0.85,
      roughness: 0.6,
      metalness: 0.15,
    });
    return { geometry: merged, material: facade };
  }, [towers, light, textures]);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  const crowns = useMemo(
    () =>
      towers.flatMap((tower) => [
        ...crownBlocks(tower, light),
        ...(tower.ring < 2 ? podiumBlocks(tower, light) : []),
      ]),
    [towers, light],
  );
  return (
    <group>
      <mesh geometry={geometry} material={material} />
      <Blocks blocks={crowns} />
    </group>
  );
}

/** The streets at the foot of the office: the square, avenues, shops, trees, lamps and cars. */
function Streets({ layout, light }: { layout: OfficeLayout; light: number }) {
  const dusk = 1 - light;
  // The streets depend only on the size of the floor and where its entrance is.
  const entrance = entranceOf(layout);
  const key = `${layout.width}x${layout.height}@${entrance ? `${entrance.x},${entrance.y}` : '-'}`;
  const plan = useMemo(
    () => cityPlan(layout),
    // The key stands for the size and the entrance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  // The windows change with the light, minute by minute at dusk.
  const pieces = useMemo(() => townPieces(plan.things, dusk, light), [plan, dusk, light]);
  const pools = useMemo(
    () => plan.lamps.map((lamp) => ({ x: lamp.x, y: lamp.y, z: GROUND, r: 1.8 })),
    [plan],
  );
  return (
    <group>
      <Lawn color={inkOf(dusk).tone(PAVEMENT_FAR)} />
      <PieceMeshes pieces={pieces} layout={layout} />
      <LightPools spots={pools} dusk={dusk} />
    </group>
  );
}

/** The ground of the far blocks, under the towers. */
const PAVEMENT_FAR = '#aaa59b';

function CityScene({ layout, light }: EnvironmentProps) {
  return (
    <>
      <City layout={layout} light={light} />
      <Streets layout={layout} light={light} />
    </>
  );
}

export const CITY: EnvironmentDefinition = {
  sky: CITY_SKY,
  fog: { start: 6, depth: 46 },
  Scene: CityScene,
};
