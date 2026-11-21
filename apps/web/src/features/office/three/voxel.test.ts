import {
  ACCESSORIES,
  type Appearance,
  FACIAL_HAIR,
  HAIR_STYLES,
  OUTFITS,
  PATTERNS,
  randomAppearance,
} from '@ea/shared';
import { describe, expect, it } from 'vitest';
import { HEIGHTS } from './view';
import { motionOf, isLively } from './VoxelCharacter';
import { JOINTS, type PartName, poseAt, VOXEL, voxelFigure } from './voxel';

const BASE: Appearance = {
  kind: 'person',
  skin: 'tan',
  hair: 'short',
  hairColor: 'brown',
  outfit: 'tshirt',
  outfitColor: 'violet',
  pants: 'denim',
  accessory: 'none',
  eyes: 'brown',
  facialHair: 'none',
  shoes: 'black',
  pattern: 'plain',
};
const ROBOT = { body: '#5a84ff', roundEyes: true, twoAntennas: false, smile: 1 };
const PARTS: PartName[] = [
  'body',
  'armLeft',
  'armRight',
  'thighLeft',
  'thighRight',
  'shinLeft',
  'shinRight',
];

const signature = (look: Appearance) => JSON.stringify(voxelFigure(look, null).body.voxels);

describe('voxelFigure', () => {
  it('builds every option into sound boxes, with a colour each', () => {
    const looks: Appearance[] = [];
    for (const hair of HAIR_STYLES) looks.push({ ...BASE, hair });
    for (const accessory of ACCESSORIES) looks.push({ ...BASE, accessory });
    for (const facialHair of FACIAL_HAIR) looks.push({ ...BASE, facialHair });
    for (const outfit of OUTFITS) looks.push({ ...BASE, outfit });
    for (const pattern of PATTERNS) looks.push({ ...BASE, pattern });
    let seed = 7;
    const random = () => ((seed = (seed * 16807) % 2147483647) % 10_000) / 10_000;
    for (let index = 0; index < 40; index += 1) looks.push(randomAppearance(random));
    for (const look of looks) {
      for (const robot of [null, ROBOT]) {
        const figure = voxelFigure(look, robot, 'cup');
        for (const name of PARTS) {
          for (const voxel of figure[name].voxels) {
            for (const value of [voxel.x, voxel.y, voxel.z, voxel.w, voxel.h, voxel.d])
              expect(Number.isFinite(value)).toBe(true);
            expect(voxel.w > 0 && voxel.h > 0 && voxel.d > 0).toBe(true);
            expect(voxel.color).toMatch(/^#[0-9a-f]{6}$/i);
          }
        }
      }
    }
  });

  it('shows each hair style, accessory, beard and outfit differently', () => {
    for (const list of [
      HAIR_STYLES.map((hair) => signature({ ...BASE, hair })),
      ACCESSORIES.map((accessory) => signature({ ...BASE, accessory })),
      FACIAL_HAIR.map((facialHair) => signature({ ...BASE, facialHair })),
      OUTFITS.map((outfit) => JSON.stringify(voxelFigure({ ...BASE, outfit }, null))),
    ])
      expect(new Set(list).size).toBe(list.length);
  });

  it('stands as tall as the scene says, head on top, feet on the floor', () => {
    const figure = voxelFigure(BASE, null);
    const top = Math.max(
      ...figure.body.voxels.map((voxel) => figure.body.joint[1] + voxel.y + voxel.h),
    );
    expect(top * VOXEL).toBeGreaterThan(HEIGHTS.character * 0.92);
    expect(top * VOXEL).toBeLessThan(HEIGHTS.character * 1.12);
    const feet = Math.min(
      ...figure.shinLeft.voxels.map((voxel) => JOINTS.hip + figure.shinLeft.joint[1] + voxel.y),
    );
    expect(feet).toBeCloseTo(0, 5);
  });

  it('gives a robot its own head, with lit eyes and antennas', () => {
    const person = voxelFigure(BASE, null);
    const robot = voxelFigure(BASE, ROBOT);
    expect(robot.body.voxels.some((voxel) => voxel.glow)).toBe(true);
    expect(person.body.voxels.some((voxel) => voxel.glow)).toBe(false);
    expect(robot.armLeft.voxels.some((voxel) => voxel.color === ROBOT.body)).toBe(true);
  });

  it('puts what is held in the right hand only', () => {
    const empty = voxelFigure(BASE, null);
    const paper = voxelFigure(BASE, null, 'paper');
    expect(paper.armRight.voxels.length).toBeGreaterThan(empty.armRight.voxels.length);
    expect(paper.armLeft.voxels).toEqual(empty.armLeft.voxels);
  });
});

describe('poseAt', () => {
  it('stands still at time 0, so reduced motion keeps the first pose', () => {
    for (const motion of ['walk', 'type', 'talk', 'wave', 'shake'] as const) {
      expect(poseAt(motion, 0)).toEqual(poseAt(motion, 0));
      expect(Number.isFinite(poseAt(motion, 0).thighLeft)).toBe(true);
    }
    expect(poseAt('walk', 0).thighLeft).toBe(0);
  });

  it('walks with the legs and arms swinging in opposition', () => {
    const pose = poseAt('walk', 0.15);
    expect(pose.thighLeft).not.toBe(0);
    expect(Math.sign(pose.thighLeft)).toBe(-Math.sign(pose.thighRight));
    expect(Math.sign(pose.armLeft[0])).toBe(-Math.sign(pose.thighLeft));
  });

  it('sits with the thighs forward and the shins hanging, and types with the arms on the desk', () => {
    const seated = poseAt('sit', 1);
    expect(seated.thighLeft).toBeCloseTo(-Math.PI / 2);
    expect(seated.shinLeft).toBeCloseTo(Math.PI / 2);
    const typing = poseAt('type', 1);
    expect(typing.armLeft[0]).toBeLessThan(-1);
    expect(typing.armRight[0]).toBeLessThan(-1);
  });

  it('raises a hand to ask for approval', () => {
    expect(poseAt('wave', 1).armLeft[1]).toBeGreaterThan(2);
  });
});

describe('motionOf', () => {
  const request = {
    pose: 'sit',
    facing: 'sw',
    holding: null,
    raisedHand: false,
    activity: null,
  } as const;

  it('follows what the office decided the agent is doing', () => {
    expect(motionOf({ ...request, pose: 'walk' }, false)).toBe('walk');
    expect(motionOf({ ...request, activity: 'typing' }, false)).toBe('type');
    expect(motionOf({ ...request, raisedHand: true }, false)).toBe('wave');
    expect(motionOf(request, true)).toBe('shake');
    expect(motionOf(request, false)).toBe('sit');
    expect(motionOf({ ...request, pose: 'stand', activity: 'talking' }, false)).toBe('talk');
    expect(motionOf({ ...request, pose: 'stand' }, false)).toBe('stand');
    expect(isLively('type')).toBe(true);
    expect(isLively('sit')).toBe(false);
  });
});
