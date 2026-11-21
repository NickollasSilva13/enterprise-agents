import type { Appearance } from '@ea/shared';
import {
  EYES,
  HAIR,
  INK,
  lighten,
  LENS,
  MOUTH,
  OUTFIT,
  PANTS,
  PAPER,
  SHOES,
  SKIN,
} from '../../../components/pixel-art/palette';
import { HEIGHTS } from './view';

// The agents as voxel characters (Phase 27), built from the same appearance
// options as the 32-bit sprites, so nobody has to choose a look again. A
// character is a few parts that move on their own (torso with the head, two
// arms, two thighs and two shins), each a list of boxes in voxels around its
// joint. Kept apart from three.js so it is tested without a GPU. Original art.

/** Voxels from the soles to the top of the head. */
const TALL = 37;
/** Size of a voxel, in tiles: the character stands `HEIGHTS.character` tall. */
export const VOXEL = HEIGHTS.character / TALL;

export interface Voxel {
  /** Corner and size, in voxels, around the joint of its part. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
  readonly h: number;
  readonly d: number;
  readonly color: string;
  /** Gives its own light: a robot's eyes and antenna. */
  readonly glow?: boolean;
}

export type PartName =
  'body' | 'armLeft' | 'armRight' | 'thighLeft' | 'thighRight' | 'shinLeft' | 'shinRight';

export interface Part {
  /** Where its joint is, in voxels, in the frame of its parent (the shins hang from the thighs). */
  readonly joint: readonly [number, number, number];
  readonly voxels: readonly Voxel[];
}

export type VoxelFigure = Readonly<Record<PartName, Part>>;

export interface RobotLook {
  readonly body: string;
  readonly roundEyes: boolean;
  readonly twoAntennas: boolean;
  readonly smile: number;
}

/** The joints, in voxels from the floor under the feet; the character faces +z. */
export const JOINTS = {
  hip: 15,
  knee: 7.5,
  shoulder: 24.5,
  neck: 26,
} as const;

/** Where each part hangs, in voxels: from the floor, or from its thigh for a shin. */
export const PART_JOINTS: Readonly<Record<PartName, readonly [number, number, number]>> = {
  body: [0, JOINTS.hip, 0],
  armLeft: [6.1, JOINTS.shoulder, 0],
  armRight: [-6.1, JOINTS.shoulder, 0],
  thighLeft: [2.2, JOINTS.hip, 0],
  thighRight: [-2.2, JOINTS.hip, 0],
  shinLeft: [0, JOINTS.knee - JOINTS.hip, 0],
  shinRight: [0, JOINTS.knee - JOINTS.hip, 0],
};

const box = (
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  color: string,
  glow = false,
): Voxel => (glow ? { x, y, z, w, h, d, color, glow } : { x, y, z, w, h, d, color });

const darker = (hex: string, amount: number) => {
  const value = Number.parseInt(hex.slice(1), 16);
  const channel = (shift: number) =>
    Math.round(((value >> shift) & 255) * (1 - amount))
      .toString(16)
      .padStart(2, '0');
  return `#${channel(16)}${channel(8)}${channel(0)}`;
};

/** The head and hair of a person, around the neck joint (y 0 is the neck). */
function personHead(look: Appearance): Voxel[] {
  const skin = SKIN[look.skin][0];
  const shade = SKIN[look.skin][1];
  const hair = HAIR[look.hairColor][0];
  const hairDark = HAIR[look.hairColor][1];
  const iris = EYES[look.eyes][0];
  const voxels: Voxel[] = [
    box(-1.5, -0.5, -1.5, 3, 1.5, 3, shade),
    // The head: a big rounded block, its face on +z.
    box(-5, 1, -4.5, 10, 9, 9, skin),
    box(-4.5, 0.5, -4, 9, 0.5, 8, shade),
    box(-0.6, 4, 4.5, 1.2, 1.4, 0.6, shade),
    // Eyes: white, iris and a spark; brows of the hair colour.
    box(1, 5, 4.5, 2.2, 2.2, 0.4, '#ffffff'),
    box(-3.2, 5, 4.5, 2.2, 2.2, 0.4, '#ffffff'),
    box(1.5, 5, 4.6, 1.4, 1.8, 0.4, iris),
    box(-2.9, 5, 4.6, 1.4, 1.8, 0.4, iris),
    box(1.6, 6.2, 4.75, 0.5, 0.5, 0.3, '#ffffff'),
    box(-2.8, 6.2, 4.75, 0.5, 0.5, 0.3, '#ffffff'),
    box(1, 7.6, 4.5, 2.4, 0.5, 0.3, hairDark),
    box(-3.4, 7.6, 4.5, 2.4, 0.5, 0.3, hairDark),
    box(-1.2, 2.6, 4.5, 2.4, 0.6, 0.3, MOUTH),
    box(2.8, 3.6, 4.5, 1.4, 0.8, 0.2, lighten(MOUTH, 0.55)),
    box(-4.2, 3.6, 4.5, 1.4, 0.8, 0.2, lighten(MOUTH, 0.55)),
    // Ears.
    box(5, 4, -0.8, 0.6, 2, 1.6, shade),
    box(-5.6, 4, -0.8, 0.6, 2, 1.6, shade),
  ];
  const top = (extra = 0) => box(-5.5, 8.5, -5, 11, 2.5 + extra, 10, hair);
  const back = (down: number) => box(-5.5, down, -5.2, 11, 11 - down, 1, hair);
  const sides = (down: number) => [
    box(5, down, -5, 0.6, 10.5 - down, 7, hair),
    box(-5.6, down, -5, 0.6, 10.5 - down, 7, hair),
  ];
  const fringe = box(-5.2, 8, 4.4, 8, 1.6, 1, hairDark);
  switch (look.hair) {
    case 'shaved':
      voxels.push(box(-5.2, 9.5, -4.8, 10.4, 0.7, 9.6, darker(hair, 0.1)));
      break;
    case 'short':
      voxels.push(top(), back(4), ...sides(6), fringe);
      break;
    case 'long':
      voxels.push(top(), back(-5), ...sides(-2), fringe);
      break;
    case 'wavy':
      voxels.push(top(), back(-4), ...sides(-1), fringe);
      for (const y of [-3, 0, 3]) {
        voxels.push(
          box(5.4, y, -4, 0.8, 1.6, 5, hairDark),
          box(-6.2, y, -4, 0.8, 1.6, 5, hairDark),
        );
      }
      break;
    case 'curly':
      voxels.push(back(3), ...sides(5));
      for (const x of [-5, -2.5, 0, 2.5]) {
        for (const z of [-4.5, -2, 0.5, 3])
          voxels.push(
            box(
              x,
              8.5 + ((x + z) % 2 === 0 ? 0.8 : 0),
              z,
              2.6,
              2.6,
              2.6,
              (x + z) % 3 === 0 ? hairDark : hair,
            ),
          );
      }
      break;
    case 'afro':
      voxels.push(
        box(-7, 4, -6.5, 14, 9, 11, hair),
        box(-6, 12.5, -5.5, 12, 1.5, 9, hair),
        box(-6.5, 3, -6.8, 13, 2, 3, hairDark),
      );
      break;
    case 'bun':
      voxels.push(
        top(),
        back(4),
        ...sides(6),
        fringe,
        box(-2, 11, -2.5, 4, 3, 4, hair),
        box(-1.5, 13.5, -2, 3, 0.8, 3, hairDark),
      );
      break;
    case 'ponytail':
      voxels.push(
        top(),
        back(4),
        ...sides(6),
        fringe,
        box(-1.2, -2, -6.6, 2.4, 9, 1.6, hair),
        box(-1.6, 6, -6.4, 3.2, 1.4, 1.2, hairDark),
      );
      break;
    case 'spiky':
      voxels.push(top(-1), back(4), ...sides(6));
      for (const [x, z, tall] of [
        [-4.5, -3, 3],
        [-1.5, -3.5, 4],
        [1.5, -3, 3.5],
        [-3, 0, 4.5],
        [0, 0.5, 5],
        [3, 0, 4],
        [-1.5, 3, 3],
        [1.8, 3, 3.2],
      ] as const) {
        voxels.push(box(x, 10, z, 2, tall, 2, hair));
      }
      break;
  }
  switch (look.facialHair) {
    case 'stubble':
      voxels.push(box(-4.5, 1, 4.45, 9, 3.2, 0.2, darker(skin, 0.18)));
      break;
    case 'mustache':
      voxels.push(box(-2, 3.2, 4.5, 4, 0.8, 0.5, hair));
      break;
    case 'beard':
      voxels.push(
        box(-5, 0.6, 3.6, 10, 3, 1.5, hair),
        box(-2, 3.2, 4.5, 4, 0.8, 0.6, hair),
        box(-1.2, 2.5, 4.9, 2.4, 0.7, 0.4, MOUTH),
      );
      break;
    case 'none':
      break;
  }
  return voxels;
}

/** A robot's head: a metal box with a screen for a face, eyes and mouth lit, antennas on top. */
function robotHead(robot: RobotLook): Voxel[] {
  const metal = robot.body;
  const glow = lighten(robot.body, 0.55);
  const eye = robot.roundEyes ? 1.6 : 2.2;
  const voxels: Voxel[] = [
    box(-1.5, -0.5, -1.5, 3, 1.5, 3, '#3a3350'),
    box(-5, 1, -4.5, 10, 9, 9, metal),
    box(-4.2, 2, 4.5, 8.4, 7, 0.4, '#151024'),
    box(1, 5, 4.9, eye, eye, 0.3, glow, true),
    box(-1 - eye, 5, 4.9, eye, eye, 0.3, glow, true),
    box(-2, 3, 4.9, 4, 0.6 + robot.smile * 0.3, 0.3, glow, true),
    box(5, 3.5, -1.5, 0.8, 3, 3, '#3a3350'),
    box(-5.8, 3.5, -1.5, 0.8, 3, 3, '#3a3350'),
  ];
  const antenna = (x: number) => [
    box(x - 0.3, 10, -0.3, 0.6, 3, 0.6, '#3a3350'),
    box(x - 0.8, 13, -0.8, 1.6, 1.6, 1.6, glow, true),
  ];
  voxels.push(...(robot.twoAntennas ? [...antenna(-2.5), ...antenna(2.5)] : antenna(0)));
  return voxels;
}

/** What is in the hand: the result of a delegation, or a coffee. */
function heldThing(holding: 'paper' | 'cup' | null): Voxel[] {
  if (holding === 'paper')
    return [box(-1.8, -11, 1, 3.6, 0.3, 4, PAPER), box(-1.2, -10.8, 1.6, 2.4, 0.2, 0.4, '#9c94b8')];
  if (holding === 'cup')
    return [
      box(-1.2, -11.5, 1.2, 2.4, 2.6, 2.4, '#f4f1ff'),
      box(-0.8, -9, 1.6, 1.6, 0.3, 1.6, '#6b3e1f'),
    ];
  return [];
}

/**
 * A whole character. `robot` is present for robots, whose head and body
 * colour replace the person's; `holding` puts something in the right hand.
 */
export function voxelFigure(
  look: Appearance,
  robot: RobotLook | null,
  holding: 'paper' | 'cup' | null = null,
): VoxelFigure {
  const skin = robot ? '#3a3350' : SKIN[look.skin][0];
  const cloth = robot ? robot.body : OUTFIT[look.outfitColor][0];
  const clothDark = robot ? darker(robot.body, 0.25) : OUTFIT[look.outfitColor][1];
  const pants = robot ? '#3a3350' : PANTS[look.pants][0];
  const pantsDark = robot ? '#2b2540' : PANTS[look.pants][1];
  const shoe = robot ? '#2b2540' : SHOES[look.shoes][0];
  const sole = robot ? '#1d1934' : SHOES[look.shoes][1];
  const sleeve = robot || look.outfit !== 'tshirt';

  const torso: Voxel[] = [
    // Hips and belt, then the chest, a little wider at the shoulders.
    box(-4.5, -1.5, -2.5, 9, 3, 5, pants),
    box(-4.6, 1.2, -2.6, 9.2, 0.8, 5.2, robot ? '#2b2540' : INK),
    box(-5, 2, -2.6, 10, 8.5, 5.2, cloth),
    box(-5.5, 7.5, -2.8, 11, 2.5, 5.6, cloth),
    box(-5, 2, -2.7, 10, 0.6, 5.4, clothDark),
  ];
  if (!robot) {
    if (look.outfit === 'hoodie') {
      torso.push(
        box(-3, 3, 2.55, 6, 2.6, 0.4, clothDark),
        box(-4, 8.5, -3.8, 8, 2.8, 1.4, clothDark),
        box(-1.2, 6, 2.6, 0.4, 3, 0.3, '#f4f1ff'),
        box(0.8, 6, 2.6, 0.4, 3, 0.3, '#f4f1ff'),
      );
    }
    if (look.outfit === 'shirt') {
      torso.push(
        box(-2.5, 9.4, 2.55, 2.2, 1.2, 0.5, '#f4f1ff'),
        box(0.3, 9.4, 2.55, 2.2, 1.2, 0.5, '#f4f1ff'),
        ...[3.5, 5.5, 7.5].map((y) => box(-0.3, y, 2.62, 0.6, 0.6, 0.3, clothDark)),
      );
    }
    if (look.pattern === 'stripes')
      for (const y of [3, 5, 7])
        torso.push(box(-5.05, y, -2.65, 10.1, 0.8, 5.3, lighten(cloth, 0.45)));
    if (look.pattern === 'badge')
      torso.push(
        box(1.5, 7, 2.6, 2, 1.4, 0.4, '#ff7b72'),
        box(1.8, 7.3, 2.9, 1.4, 0.8, 0.2, '#f4f1ff'),
      );
  }
  const head = robot ? robotHead(robot) : personHead(look);
  const neck = JOINTS.neck - JOINTS.hip;
  const body: Voxel[] = [...torso, ...head.map((voxel) => ({ ...voxel, y: voxel.y + neck }))];
  if (!robot) {
    const top = neck + 10;
    switch (look.accessory) {
      case 'glasses':
        body.push(
          box(0.6, neck + 4.6, 4.9, 3, 3, 0.25, INK),
          box(-3.6, neck + 4.6, 4.9, 3, 3, 0.25, INK),
          box(1, neck + 5, 5, 2.2, 2.2, 0.2, LENS),
          box(-3.2, neck + 5, 5, 2.2, 2.2, 0.2, LENS),
          box(-0.6, neck + 6.2, 4.9, 1.2, 0.4, 0.25, INK),
        );
        break;
      case 'headset':
        body.push(
          box(-6, top - 0.5, -0.6, 12, 0.8, 1.2, INK),
          box(5.2, neck + 3.5, -1.5, 1.2, 3.5, 3, INK),
          box(-6.4, neck + 3.5, -1.5, 1.2, 3.5, 3, INK),
          box(5.6, neck + 2.5, 1.5, 0.5, 0.5, 3, INK),
          box(4.2, neck + 2.4, 4.2, 1.2, 1, 0.8, '#ff7b72'),
        );
        break;
      case 'cap':
        body.push(
          box(-5.8, top - 1.5, -5.2, 11.6, 3, 10.4, cloth),
          box(-4.5, top - 1.6, 4.8, 9, 0.6, 3.5, clothDark),
          box(-0.8, top + 1.4, -0.8, 1.6, 0.5, 1.6, clothDark),
        );
        break;
      case 'none':
        break;
    }
  }

  const arm = (side: 1 | -1): Voxel[] => {
    const voxels: Voxel[] = [
      box(-1.6, -3.5, -1.6, 3.2, 3.5, 3.2, cloth),
      box(-1.5, -8.5, -1.5, 3, 5, 3, sleeve ? cloth : skin),
      box(-1.5, -4, -1.6, 3, 0.6, 3.2, clothDark),
      box(-1.4, -10.5, -1.3, 2.8, 2, 2.6, skin),
    ];
    if (side === -1) voxels.push(...heldThing(holding));
    return voxels;
  };
  const thigh = (): Voxel[] => [
    box(-1.9, -JOINTS.hip + JOINTS.knee, -2, 3.8, JOINTS.hip - JOINTS.knee, 4, pants),
  ];
  const shin = (): Voxel[] => [
    box(-1.8, -JOINTS.knee + 1.8, -1.8, 3.6, JOINTS.knee - 1.8, 3.6, pantsDark),
    box(-2, -JOINTS.knee, -2, 4, 1.9, 5.4, shoe),
    box(-2.05, -JOINTS.knee, -2.05, 4.1, 0.6, 5.5, sole),
  ];
  return {
    body: { joint: PART_JOINTS.body, voxels: body },
    armLeft: { joint: PART_JOINTS.armLeft, voxels: arm(1) },
    armRight: { joint: PART_JOINTS.armRight, voxels: arm(-1) },
    thighLeft: { joint: PART_JOINTS.thighLeft, voxels: thigh() },
    thighRight: { joint: PART_JOINTS.thighRight, voxels: thigh() },
    shinLeft: { joint: PART_JOINTS.shinLeft, voxels: shin() },
    shinRight: { joint: PART_JOINTS.shinRight, voxels: shin() },
  };
}

// ---------------------------------------------------------------------------
// Poses

export type Motion = 'stand' | 'walk' | 'sit' | 'type' | 'talk' | 'wave' | 'shake';

/** Turns of each joint, in radians, about x (forward is negative) and z; the lift of the whole body. */
export interface Pose {
  readonly armLeft: readonly [number, number];
  readonly armRight: readonly [number, number];
  readonly thighLeft: number;
  readonly thighRight: number;
  readonly shinLeft: number;
  readonly shinRight: number;
  /** Turn of the head and torso about the vertical (a shake), and their nod. */
  readonly bodyYaw: number;
  readonly bodyPitch: number;
  /** Up and down of the whole character, in voxels (the bob of a step). */
  readonly bob: number;
}

const STILL: Pose = {
  armLeft: [0, 0.06],
  armRight: [0, -0.06],
  thighLeft: 0,
  thighRight: 0,
  shinLeft: 0,
  shinRight: 0,
  bodyYaw: 0,
  bodyPitch: 0,
  bob: 0,
};

/**
 * The pose of a motion at time `t` (seconds): a pure function, so the
 * animation is tested without drawing and stops at the first pose when
 * motion is reduced (`t` 0).
 */
export function poseAt(motion: Motion, t: number, holding = false): Pose {
  const swing = Math.sin(t * 9);
  const seated = {
    ...STILL,
    thighLeft: -Math.PI / 2,
    thighRight: -Math.PI / 2,
    shinLeft: Math.PI / 2,
    shinRight: Math.PI / 2,
  };
  switch (motion) {
    case 'stand':
      return holding ? { ...STILL, armRight: [-0.7, -0.06] } : STILL;
    case 'walk':
      return {
        ...STILL,
        armLeft: [-swing * 0.55, 0.06],
        armRight: holding ? [-0.7, -0.06] : [swing * 0.55, -0.06],
        thighLeft: swing * 0.6,
        thighRight: -swing * 0.6,
        shinLeft: Math.max(0, -swing) * 0.7,
        shinRight: Math.max(0, swing) * 0.7,
        bob: Math.abs(Math.cos(t * 9)) * 0.6,
      };
    case 'sit':
      return seated;
    case 'type': {
      const tap = Math.sin(t * 14) * 0.08;
      return {
        ...seated,
        armLeft: [-1.2 + tap, 0.18],
        armRight: [-1.2 - tap, -0.18],
        bodyPitch: 0.06,
      };
    }
    case 'talk':
      return {
        ...STILL,
        armLeft: [-0.5 + Math.sin(t * 4) * 0.25, 0.3],
        bodyPitch: Math.sin(t * 6) * 0.05,
      };
    case 'wave':
      return { ...seated, armLeft: [-0.2, 2.6 + Math.sin(t * 8) * 0.35] };
    case 'shake':
      return { ...seated, bodyYaw: Math.sin(t * 10) * 0.25 };
  }
}
