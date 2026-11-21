import type { Appearance } from '@ea/shared';
import * as THREE from 'three';
import { materialOf } from './Blocks';
import { JOINTS, PART_JOINTS, type PartName, VOXEL } from './voxel';
import { figureKey, lookMeshes, PARTS } from './voxel-meshes';

// Pictures of the agents outside the office, from the same voxel figure the
// office shows: the head and shoulders for avatars, the whole figure for the
// preview of the appearance editor. One renderer, off the page, draws each
// look once; the picture is kept as a PNG `data:` address (the CSP's
// `img-src` allows it), so a list of agents costs no WebGL context per
// avatar. Loaded on demand, apart from the main bundle.

export type Framing = 'bust' | 'full';

interface Shot {
  /** Size of the picture in pixels: enough for the largest use on a dense screen. */
  readonly width: number;
  readonly height: number;
  /** Lowest and highest height framed, in voxels from the soles. */
  readonly bottom: number;
  readonly top: number;
  readonly parts: readonly PartName[];
}

const SHOTS: Readonly<Record<Framing, Shot>> = {
  bust: { width: 192, height: 192, bottom: 18.5, top: 40, parts: ['body', 'armLeft', 'armRight'] },
  // The editor's preview box is 9 × 11 (w-36 h-44).
  full: { width: 288, height: 352, bottom: -2, top: 40, parts: PARTS },
};

/** The figure seen a little from its left and from above, as in the office. */
const YAW = -0.42;
/** The part each part hangs from; the others hang from the figure itself. */
const PARENT: Partial<Record<PartName, PartName>> = {
  shinLeft: 'thighLeft',
  shinRight: 'thighRight',
};
const ELEVATION = 0.16;

let renderer: THREE.WebGLRenderer | null | undefined;

function rendererOf(): THREE.WebGLRenderer | null {
  if (renderer !== undefined) return renderer;
  try {
    const created = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    created.setPixelRatio(1);
    created.setClearColor(0x000000, 0);
    // The same response to light as the office's canvas (React Three Fiber's defaults).
    created.toneMapping = THREE.ACESFilmicToneMapping;
    created.outputColorSpace = THREE.SRGBColorSpace;
    renderer = created;
  } catch {
    renderer = null;
  }
  return renderer;
}

function cameraOf(shot: Shot): THREE.OrthographicCamera {
  const halfHeight = ((shot.top - shot.bottom) / 2) * VOXEL;
  const halfWidth = (halfHeight * shot.width) / shot.height;
  const camera = new THREE.OrthographicCamera(
    -halfWidth,
    halfWidth,
    halfHeight,
    -halfHeight,
    0.1,
    20,
  );
  const middle = ((shot.top + shot.bottom) / 2) * VOXEL;
  const distance = 5;
  camera.position.set(
    Math.sin(YAW) * Math.cos(ELEVATION) * distance,
    middle + Math.sin(ELEVATION) * distance,
    Math.cos(YAW) * Math.cos(ELEVATION) * distance,
  );
  camera.lookAt(0, middle, 0);
  camera.updateProjectionMatrix();
  return camera;
}

function sceneOf(agentId: string, appearance: Appearance | null, shot: Shot): THREE.Scene {
  const scene = new THREE.Scene();
  const meshes = lookMeshes(figureKey(agentId, appearance, null));
  const groups = new Map<PartName, THREE.Group>();
  for (const name of shot.parts) {
    const joint = PART_JOINTS[name];
    const group = new THREE.Group();
    group.position.set(joint[0] * VOXEL, joint[1] * VOXEL, joint[2] * VOXEL);
    group.add(new THREE.Mesh(meshes[name].solid, materialOf('matte')));
    const glow = meshes[name].glow;
    if (glow) group.add(new THREE.Mesh(glow, materialOf('glow')));
    groups.set(name, group);
  }
  // A shin hangs from its thigh, as in the office.
  for (const name of shot.parts) {
    const group = groups.get(name);
    if (!group) continue;
    const parent = PARENT[name];
    (parent ? (groups.get(parent) ?? scene) : scene).add(group);
  }
  scene.add(new THREE.HemisphereLight('#e9e4ff', '#3a3350', 1.6));
  const key = new THREE.DirectionalLight('#fff4e6', 2.4);
  key.position.set(-2, JOINTS.neck * VOXEL + 3, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight('#9d7bff', 1.2);
  rim.position.set(3, JOINTS.neck * VOXEL + 1, -3);
  scene.add(rim);
  return scene;
}

/** Pictures by look and framing; the editor's preview makes one per change, so the oldest go. */
const PICTURES = new Map<string, string>();
const PICTURES_KEPT = 200;

/** The picture of a look as a `data:` address, or null when this browser cannot draw it. */
export function portraitOf(
  agentId: string,
  appearance: Appearance | null,
  framing: Framing = 'bust',
): string | null {
  const key = `${framing}:${figureKey(agentId, appearance, null)}`;
  const kept = PICTURES.get(key);
  if (kept) return kept;
  const target = rendererOf();
  if (!target) return null;
  const shot = SHOTS[framing];
  try {
    target.setSize(shot.width, shot.height, false);
    target.render(sceneOf(agentId, appearance, shot), cameraOf(shot));
    const picture = target.domElement.toDataURL('image/png');
    if (PICTURES.size >= PICTURES_KEPT) {
      const oldest = PICTURES.keys().next();
      if (!oldest.done) PICTURES.delete(oldest.value);
    }
    PICTURES.set(key, picture);
    return picture;
  } catch {
    return null;
  }
}
