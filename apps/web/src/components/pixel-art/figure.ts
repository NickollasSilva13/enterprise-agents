import type { Appearance, HairStyle, Outfit } from '@ea/shared';
import { layer, mirror } from './pixels';

// The 32-bit characters (Phase 22) as masks: one character per pixel naming
// a material, shaded later by `shade.ts`. Shapes are built from ellipses and
// strokes on a 32 × 64 grid instead of being typed pixel by pixel, so every
// option keeps the same proportions. After the user's review (2026-11-19)
// they follow the isometric social-game genre the user pointed to: a head of
// about a third of the height, a long torso and legs, arms apart from the
// body, a small face, a dark outline. Original art: no sprite of any game is
// copied, and the head, face and clothes are our own shapes.
//
// Two views are drawn, down-left ("sw", the face toward the viewer) and
// up-left ("nw", the back); the others are those mirrored. What has a side
// (the hand that holds, the raised hand, the badge, the microphone) is added
// after mirroring, on the side it belongs to (D3).

export const FIGURE_WIDTH = 32;
export const FIGURE_HEIGHT = 64;
/** The row of the hips: what shows of a seated character is above it. */
export const HIPS = 44;

export type Direction = 'sw' | 'se' | 'nw' | 'ne';
export type Pose = 'stand' | 'walk' | 'sit';
export type Activity = 'typing' | 'talking' | null;
export type Holding = 'paper' | 'cup' | null;

/** How a robot looks, decided by its agent's id (robot.tsx). */
export interface RobotTraits {
  readonly roundEyes: boolean;
  readonly twoAntennas: boolean;
  readonly smile: number;
}

export interface FigureSpec {
  readonly look: Appearance;
  /** Present for a robot: its head replaces the person's head and hair. */
  readonly robot: RobotTraits | null;
  readonly facing: Direction;
  readonly pose: Pose;
  /** Frame of the animation: 0 to 3 for a walk, 0 or 1 for typing, talking or waving. */
  readonly frame: number;
  readonly holding: Holding;
  readonly raisedHand: boolean;
  readonly activity: Activity;
}

export type Side = 'left' | 'right';

/** Whether the view shows the back. */
export const isBack = (facing: Direction) => facing === 'nw' || facing === 'ne';
const isMirrored = (facing: Direction) => facing === 'se' || facing === 'ne';

/**
 * The side of the screen where the character's own right (or left) hand is.
 * Facing the viewer (sw, se) their right is on the viewer's left; seen from
 * behind (nw, ne) it is on the right, as for the viewer.
 */
export function screenSideOf(facing: Direction, hand: 'right' | 'left'): Side {
  const right: Side = isBack(facing) ? 'right' : 'left';
  return hand === 'right' ? right : right === 'left' ? 'right' : 'left';
}

/** The arm in front of the body: the one on the left in the drawn views. */
const nearSideOf = (facing: Direction): Side => (isMirrored(facing) ? 'right' : 'left');

// ---------------------------------------------------------------------------
// A mask to paint on

class Mask {
  private readonly px: string[][] = Array.from({ length: FIGURE_HEIGHT }, () =>
    Array.from({ length: FIGURE_WIDTH }, () => '.'),
  );

  set(x: number, y: number, pixel: string): this {
    const row = this.px[y];
    if (row && x >= 0 && x < FIGURE_WIDTH) row[x] = pixel;
    return this;
  }

  get(x: number, y: number): string {
    return this.px[y]?.[x] ?? '.';
  }

  /** Paints every pixel whose centre passes `inside`. */
  fill(inside: (x: number, y: number) => boolean, pixel: string): this {
    for (let y = 0; y < FIGURE_HEIGHT; y += 1)
      for (let x = 0; x < FIGURE_WIDTH; x += 1) if (inside(x, y)) this.set(x, y, pixel);
    return this;
  }

  rect(x: number, y: number, width: number, height: number, pixel: string): this {
    for (let dy = 0; dy < height; dy += 1)
      for (let dx = 0; dx < width; dx += 1) this.set(x + dx, y + dy, pixel);
    return this;
  }

  /** A thick stroke from one point to another, as an arm or a leg. */
  stroke(x0: number, y0: number, x1: number, y1: number, width: number, pixel: string): this {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let step = 0; step <= steps; step += 1) {
      const x = Math.round(x0 + ((x1 - x0) * step) / steps);
      const y = Math.round(y0 + ((y1 - y0) * step) / steps);
      this.rect(x - Math.floor(width / 2), y, width, 1, pixel);
    }
    return this;
  }

  rows(): string[] {
    return this.px.map((row) => row.join(''));
  }
}

/** Inside a superellipse (a rounded box when `exp` is above 2), by pixel centre. */
const ellipse =
  (cx: number, cy: number, rx: number, ry: number, exp = 2) =>
  (x: number, y: number) =>
    Math.abs((x + 0.5 - cx) / rx) ** exp + Math.abs((y + 0.5 - cy) / ry) ** exp <= 1;

// ---------------------------------------------------------------------------
// Head: rows 6 to 23, a third of the height

const HEAD_CX = 15;
const HEAD_CY = 15;
const inHead = ellipse(HEAD_CX, HEAD_CY, 8, 9.2, 2.2);
/** One pixel all around the head: the volume of hair. */
const inHeadRim = ellipse(HEAD_CX, HEAD_CY - 0.6, 9, 9.9, 2.2);
const inEar = ellipse(22.6, 16.5, 1.6, 2.2);

function headFront(): Mask {
  const mask = new Mask().fill(inHead, 'S').fill(inEar, 'S');
  mask.set(22, 16, 's');
  // Small eyes looking the way the face turns: the pupil on the left.
  for (const x of [10, 14]) mask.rect(x, 15, 1, 2, 'E').rect(x + 1, 15, 1, 2, 'W');
  mask.rect(10, 13, 2, 1, 'b').rect(14, 13, 2, 1, 'b');
  // The nose, a step out on the side the face looks to.
  mask.set(7, 17, 'S').set(8, 18, 's');
  mask.rect(10, 20, 3, 1, 'M');
  return mask;
}

function headBack(): Mask {
  const mask = new Mask().fill(inHead, 'S').fill(inEar, 'S');
  mask.set(22, 16, 's');
  return mask;
}

const neck = (mask: Mask) => mask.rect(13, 23, 5, 3, 's');

// ---------------------------------------------------------------------------
// Hair: a cap over the head, then what each style adds

const hairlineFront = (x: number, y: number) =>
  y <= 11 ||
  (y === 12 && x % 3 !== 1 && x > 8 && x < 19) ||
  (x <= 8 && y <= 14) ||
  (x >= 18 && y <= 17);

function capFront(mask: Mask): void {
  mask.fill(
    (x, y) =>
      (inHeadRim(x, y) && y <= 18 && !inHead(x, y) && !inEar(x, y)) ||
      (inHead(x, y) && hairlineFront(x, y)),
    'H',
  );
  mask.rect(10, 7, 3, 1, 'j');
}

function capBack(mask: Mask, nape = 21): void {
  mask.fill(
    (x, y) => (inHeadRim(x, y) || inHead(x, y)) && y <= nape && !(inEar(x, y) && y >= 14),
    'H',
  );
  mask.rect(10, 7, 3, 1, 'j');
  for (let x = 7; x <= 22; x += 1) if (inHead(x, nape)) mask.set(x, nape, 'h');
}

interface HairLayers {
  /** Painted before the body: what falls behind the shoulders. */
  readonly behind: Mask | null;
  /** Painted over the head. */
  readonly over: Mask;
}

const inAfro = ellipse(HEAD_CX, 12.5, 11.5, 10);

function hairOf(style: HairStyle, back: boolean): HairLayers {
  const over = new Mask();
  let behind: Mask | null = null;
  const cap = () => (back ? capBack(over) : capFront(over));

  switch (style) {
    case 'short':
      cap();
      break;
    case 'shaved':
      // Only a shadow of hair on the top of the head.
      over.fill((x, y) => inHead(x, y) && y <= (back ? 13 : 9), 'h');
      break;
    case 'long':
      behind = new Mask().fill(
        (x, y) => ellipse(HEAD_CX, 24, 10, 12)(x, y) && y >= 14 && y <= 34,
        'h',
      );
      cap();
      if (back) over.fill((x, y) => y >= 18 && y <= 33 && ellipse(HEAD_CX, 23, 8.5, 11)(x, y), 'H');
      else
        over.fill(
          (x, y) =>
            y >= 11 &&
            y <= 31 &&
            (x <= 8 || (x >= 19 && x <= 23)) &&
            ellipse(HEAD_CX, 21, 10, 12)(x, y),
          'H',
        );
      break;
    case 'wavy': {
      const wave = (y: number) => Math.round(Math.sin(y / 2));
      behind = new Mask().fill(
        (x, y) => ellipse(HEAD_CX, 20, 10, 9)(x, y) && y >= 14 && y <= 27,
        'h',
      );
      cap();
      if (back)
        over.fill(
          (x, y) => y >= 18 && y <= 27 + wave(x) && ellipse(HEAD_CX, 19, 8.5, 9)(x, y),
          'H',
        );
      else
        over.fill(
          (x, y) =>
            y >= 11 &&
            y <= 26 &&
            (x <= 8 + wave(y) || (x >= 19 + wave(y) && x <= 23)) &&
            ellipse(HEAD_CX, 18, 10, 10)(x, y),
          'H',
        );
      break;
    }
    case 'curly': {
      const bumpy = (x: number, y: number) =>
        ellipse(HEAD_CX, 13.5, 10, 10.2)(x, y) && !(y < 8 && (x + y) % 4 === 0);
      if (back) over.fill((x, y) => bumpy(x, y) && y <= 21, 'H');
      else {
        over.fill((x, y) => bumpy(x, y) && (y <= 11 || x <= 7 || (x >= 19 && y <= 19)), 'H');
        for (const x of [10, 13, 16]) over.fill(ellipse(x + 0.5, 12.5, 1.4, 1.3), 'H');
      }
      over.rect(10, 6, 2, 1, 'j').rect(15, 5, 2, 1, 'j');
      break;
    }
    case 'bun':
      cap();
      over.fill(ellipse(HEAD_CX, 4, 3.4, 3.2), 'H');
      over.rect(14, 2, 2, 1, 'j');
      break;
    case 'spiky':
      cap();
      for (const [x, top] of [
        [9, 4],
        [12, 1],
        [15, 0],
        [18, 1],
        [21, 4],
      ] as const) {
        for (let y = top; y <= 8; y += 1) {
          const half = Math.floor(((y - top) / (8 - top)) * 2);
          over.rect(x - half, y, half * 2 + 1, 1, 'H');
        }
      }
      break;
    case 'afro':
      behind = new Mask().fill((x, y) => inAfro(x, y) && y >= 14, 'h');
      over.fill((x, y) => inAfro(x, y) && (back || y <= 11 || x <= 7 || x >= 20), 'H');
      over.rect(9, 5, 3, 1, 'j');
      break;
    case 'ponytail':
      cap();
      behind = back
        ? new Mask().fill(ellipse(HEAD_CX, 27, 2.2, 6.5), 'H')
        : new Mask().fill(ellipse(23.2, 23, 2.2, 6.5), 'H');
      break;
  }
  return { behind, over };
}

// ---------------------------------------------------------------------------
// Face and accessories

function facialHairOf(kind: Appearance['facialHair']): Mask | null {
  if (kind === 'none') return null;
  const mask = new Mask();
  const mouth = (x: number, y: number) => y === 20 && x >= 10 && x <= 12;
  if (kind === 'stubble')
    mask.fill(
      (x, y) => inHead(x, y) && y >= 19 && x <= 19 && (x + y) % 2 === 0 && !mouth(x, y),
      'h',
    );
  if (kind === 'mustache') mask.rect(9, 19, 5, 1, 'H');
  if (kind === 'beard') {
    mask.fill((x, y) => inHead(x, y) && y >= 18 && x <= 19 && !mouth(x, y), 'H');
    mask.rect(10, 20, 3, 1, 'M');
  }
  return mask;
}

function accessoryOf(kind: Appearance['accessory'], back: boolean): Mask | null {
  const mask = new Mask();
  switch (kind) {
    case 'none':
      return null;
    case 'glasses':
      if (back) return mask.rect(20, 15, 2, 1, 'G');
      for (const x of [9, 13]) {
        mask.rect(x, 14, 4, 1, 'G').rect(x, 17, 4, 1, 'G');
        mask.rect(x, 15, 1, 2, 'G').rect(x + 3, 15, 1, 2, 'G');
      }
      return mask.rect(17, 15, 4, 1, 'G');
    case 'headset':
      mask.fill(
        (x, y) =>
          y <= 14 &&
          ellipse(HEAD_CX, HEAD_CY - 0.5, 9.8, 10.4)(x, y) &&
          !ellipse(HEAD_CX, HEAD_CY - 0.5, 8.8, 9.4)(x, y),
        'G',
      );
      mask.rect(20, 14, 4, 5, 'G').rect(21, 15, 2, 3, 'g');
      return mask;
    case 'cap':
      mask.fill((x, y) => (inHeadRim(x, y) || inHead(x, y)) && y <= 10, 'C');
      mask.rect(10, 6, 3, 1, 'j');
      if (back) mask.rect(9, 10, 13, 1, 'c');
      // The visor points the way the face looks.
      else mask.rect(3, 10, 9, 2, 'c');
      return mask;
  }
}

// ---------------------------------------------------------------------------
// Robot head (D5): the same traits as before, in pixels, front and back

function robotHead(traits: RobotTraits, back: boolean): Mask {
  const mask = new Mask();
  for (const x of traits.twoAntennas ? [11, 19] : [15]) {
    mask.rect(x, 2, 1, 4, 'G');
    mask.fill(ellipse(x + 0.5, 1.8, 1.5, 1.5), 'R');
  }
  mask.fill(ellipse(HEAD_CX, 15, 9, 9.2, 3.4), 'R');
  mask.fill(ellipse(23.8, 16, 1.8, 2.2), 'G');
  mask.set(23, 16, 'g');
  if (back) {
    mask.rect(9, 10, 12, 1, 'r').rect(9, 20, 12, 1, 'r');
    mask.rect(9, 10, 1, 11, 'r').rect(20, 10, 1, 11, 'r');
    for (const [x, y] of [
      [11, 12],
      [18, 12],
      [11, 18],
      [18, 18],
    ] as const)
      mask.set(x, y, 'G');
    return mask;
  }
  // The screen of the face, turned to the left as a face is.
  mask.fill(ellipse(13, 15.5, 6.6, 5, 4), 'N');
  if (traits.roundEyes)
    for (const x of [10, 14]) mask.rect(x, 13, 2, 3, 'n').rect(x - 1, 14, 4, 1, 'n');
  else for (const x of [9, 13]) mask.rect(x, 14, 3, 2, 'n');
  if (traits.smile === 0) mask.rect(10, 18, 5, 1, 'n');
  if (traits.smile === 1) mask.rect(10, 19, 5, 1, 'n').set(9, 18, 'n').set(15, 18, 'n');
  if (traits.smile === 2) mask.rect(10, 18, 5, 2, 'n');
  return mask;
}

// ---------------------------------------------------------------------------
// Body: torso from row 25 to the hips, legs down to the feet at row 63

type Clothes = Outfit | 'plain';

/** The torso without arms: chest, collar and the top of the trousers. */
function torsoOf(outfit: Clothes, back: boolean, pattern: Appearance['pattern']): Mask {
  const mask = new Mask();
  mask.rect(11, 25, 10, 1, 'O').rect(10, 26, 12, 15, 'O');
  mask.rect(10, 41, 12, 1, 'o');
  mask.rect(10, 42, 12, 3, 'P');
  if (!back) {
    if (outfit === 'tshirt') mask.rect(13, 25, 5, 1, 'S').rect(14, 26, 3, 1, 'S');
    if (outfit === 'shirt') {
      mask.rect(12, 25, 2, 2, 'D').rect(17, 25, 2, 2, 'D').rect(14, 25, 3, 1, 'S');
      mask.rect(15, 27, 1, 13, 'o');
      for (const y of [29, 32, 35]) mask.set(15, y, 'D');
    }
    if (outfit === 'hoodie') {
      mask.rect(13, 27, 1, 4, 'D').rect(17, 27, 1, 4, 'D');
      mask.rect(11, 34, 10, 1, 'o').rect(11, 35, 1, 3, 'o').rect(20, 35, 1, 3, 'o');
    }
  } else if (outfit === 'hoodie') {
    // The hood, folded on the back.
    mask.fill(ellipse(15.5, 27.5, 5, 3), 'o');
  }
  if (pattern === 'stripes')
    for (const y of [30, 33, 36])
      for (let x = 10; x <= 21; x += 1) if (mask.get(x, y) === 'O') mask.set(x, y, 'Q');
  return mask;
}

/** The hood behind the neck, drawn before the head. */
const hoodOf = (outfit: Clothes) =>
  outfit === 'hoodie' ? new Mask().fill(ellipse(15.5, 24.5, 6.5, 2.6), 'O') : null;

interface LegFrame {
  /** Foot of the near and far leg: horizontal offset and lift. */
  readonly near: readonly [dx: number, lift: number];
  readonly far: readonly [dx: number, lift: number];
}

/** Four frames of a walk toward the left: contact, passing, contact, passing. */
export const WALK: readonly LegFrame[] = [
  { near: [-3, 0], far: [2, 0] },
  { near: [-1, 0], far: [1, 2] },
  { near: [3, 0], far: [-1, 1] },
  { near: [0, 2], far: [0, 0] },
];
const STAND: LegFrame = { near: [0, 0], far: [0, 0] };

function legsOf(frame: LegFrame): Mask {
  const mask = new Mask();
  const leg = (hip: number, [dx, lift]: readonly [number, number]) => {
    const ankle = 59 - lift;
    mask.stroke(hip, 44, hip + dx, ankle, 5, 'P');
    // A sturdy shoe, its toe toward the way the figure looks.
    mask.rect(hip + dx - 4, ankle + 1, 7, 3, 'K');
    mask.rect(hip + dx - 4, ankle + 4, 7, 1, 'k');
  };
  leg(19, frame.far);
  leg(12, frame.near);
  mask.rect(10, 42, 12, 3, 'P');
  return mask;
}

type ArmPose =
  | { readonly kind: 'hang'; readonly swing: number }
  | { readonly kind: 'raised'; readonly wave: boolean }
  | { readonly kind: 'hold' }
  | { readonly kind: 'type'; readonly up: boolean }
  | { readonly kind: 'talk'; readonly up: boolean };

/** Shoulder of each side of the screen. */
const SHOULDER: Record<Side, number> = { left: 9, right: 22 };
const SHOULDER_Y = 26;

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** An arm on one side of the screen. Returns where the hand is, for what it holds. */
function arm(mask: Mask, side: Side, pose: ArmPose, sleeve: 'short' | 'long'): Point {
  const out = side === 'left' ? -1 : 1;
  const sx = SHOULDER[side];
  let hand: Point;
  switch (pose.kind) {
    case 'hang':
      hand = { x: sx + out + pose.swing, y: 39 };
      break;
    case 'raised':
      // Waving: the hand goes out and back, two frames.
      hand = { x: sx + out * (pose.wave ? 4 : 2), y: 12 };
      break;
    case 'hold':
      // The forearm comes forward: the hand at the edge of the body, at the waist.
      hand = { x: sx + out, y: 34 };
      break;
    case 'type':
      hand = { x: sx - out * 3 - 2, y: pose.up ? 33 : 34 };
      break;
    case 'talk':
      // An open hand in front of the chest, going up and down as one speaks.
      hand = { x: sx - out * 2, y: pose.up ? 29 : 31 };
      break;
  }
  const reach = sleeve === 'short' ? 0.35 : 0.85;
  const elbowY = SHOULDER_Y + Math.round((hand.y - SHOULDER_Y) * reach);
  const elbowX = Math.round(sx + (hand.x - sx) * reach);
  mask.stroke(sx, SHOULDER_Y, hand.x, hand.y, 3, 'S');
  mask.stroke(sx, SHOULDER_Y, elbowX, elbowY, 4, 'A');
  mask.rect(hand.x - 1, hand.y, 3, 3, 'S');
  return hand;
}

function held(mask: Mask, what: Exclude<Holding, null>, hand: Point): void {
  if (what === 'cup') {
    mask.rect(hand.x - 2, hand.y - 4, 4, 5, 'U');
    mask.rect(hand.x - 2, hand.y - 4, 4, 1, 'y');
    mask.set(hand.x + 2, hand.y - 2, 'U');
    // Steam, still: wisps over the cup.
    mask
      .set(hand.x - 1, hand.y - 6, 'v')
      .set(hand.x, hand.y - 7, 'v')
      .set(hand.x + 1, hand.y - 6, 'v');
  } else {
    mask.rect(hand.x - 3, hand.y - 5, 6, 7, 'Y');
    for (const dy of [-3, -1, 1]) mask.rect(hand.x - 2, hand.y + dy, 4, 1, 'y');
  }
}

// ---------------------------------------------------------------------------
// The whole figure

/** Where the hands of a figure are, by side of the screen; for the tests. */
export function handsOf(spec: FigureSpec): Record<Side, Point> {
  return compose(spec).hands;
}

/** The mask of a character for one view, pose and frame. */
export function figureMask(spec: FigureSpec): string[] {
  return compose(spec).rows;
}

/**
 * Parts that depend only on a few options (a hair style, an outfit, a leg
 * frame), built once and kept: 30 agents starting to walk, or turning, would
 * otherwise build the same shapes hundreds of times in one frame (the scene
 * test of 30 walkers caught it). The options are few, so this stays small.
 */
const PARTS = new Map<string, string[] | null>();
/** Arms, by side, pose and sleeve, with where their hand ends up. */
const ARMS = new Map<string, { rows: string[]; hand: Point }>();

function part(key: string, mirrored: boolean, build: () => Mask | null): string[] | null {
  const full = `${key}|${mirrored ? 'm' : ''}`;
  if (!PARTS.has(full)) {
    const mask = build();
    PARTS.set(full, mask ? (mirrored ? mirror(mask.rows()) : mask.rows()) : null);
  }
  return PARTS.get(full) ?? null;
}

function compose(spec: FigureSpec): { rows: string[]; hands: Record<Side, Point> } {
  const { look, robot, facing, pose, frame, holding, raisedHand, activity } = spec;
  const back = isBack(facing);
  const mirrored = isMirrored(facing);
  const view = back ? 'back' : 'front';

  // Mirrored with the body: what is the same on both sides.
  const hairBehind = robot
    ? null
    : part(`hair-behind:${look.hair}:${view}`, mirrored, () => hairOf(look.hair, back).behind);
  const hairOver = robot
    ? null
    : part(`hair:${look.hair}:${view}`, mirrored, () => hairOf(look.hair, back).over);
  const head = robot
    ? part(`robot:${JSON.stringify(robot)}:${view}`, mirrored, () => robotHead(robot, back))
    : part(`head:${view}`, mirrored, () => (back ? headBack() : headFront()));
  const legFrame = pose === 'walk' ? frame % WALK.length : -1;
  const legs = part(`legs:${legFrame}`, mirrored, () => legsOf(WALK[legFrame] ?? STAND));
  // A robot wears no clothes: a plain body, arms of one piece.
  const outfit: Clothes = robot ? 'plain' : look.outfit;
  const sleeve = outfit === 'tshirt' ? 'short' : 'long';
  const pattern = robot ? 'plain' : look.pattern;
  const torso = part(`torso:${outfit}:${view}:${pattern}`, mirrored, () =>
    torsoOf(outfit, back, pattern),
  );
  const hood = part(`hood:${outfit}`, mirrored, () => hoodOf(outfit));
  const neckRows = part('neck', mirrored, () => neck(new Mask()));
  const beard =
    back || robot
      ? null
      : part(`beard:${look.facialHair}`, mirrored, () => facialHairOf(look.facialHair));
  const accessory = robot
    ? null
    : part(`accessory:${look.accessory}:${view}`, mirrored, () =>
        accessoryOf(look.accessory, back),
      );

  // On a side of its own: the arms, the badge, the microphone, what is held.
  const near = nearSideOf(facing);
  const far: Side = near === 'left' ? 'right' : 'left';
  const handSide = screenSideOf(facing, 'right');
  const armPose = (side: Side): ArmPose => {
    if (raisedHand && side === handSide) return { kind: 'raised', wave: frame % 2 === 1 };
    if (holding && side === handSide) return { kind: 'hold' };
    if (activity === 'typing') return { kind: 'type', up: (frame % 2 === 0) === (side === 'left') };
    if (activity === 'talking' && side === near) return { kind: 'talk', up: frame % 2 === 0 };
    if (pose === 'walk') {
      // Arms swing against the legs: the near arm back when the near leg is forward.
      const swing = [2, 1, -2, -1][frame % 4] ?? 0;
      return { kind: 'hang', swing: side === near ? swing : -swing };
    }
    return { kind: 'hang', swing: 0 };
  };
  const hands = {} as Record<Side, Point>;
  const armOf = (side: Side): string[] | null => {
    const pose = armPose(side);
    const key = `arm:${side}:${JSON.stringify(pose)}:${sleeve}`;
    const built =
      ARMS.get(key) ??
      (() => {
        const mask = new Mask();
        const hand = arm(mask, side, pose, sleeve);
        const value = { rows: mask.rows(), hand };
        ARMS.set(key, value);
        return value;
      })();
    hands[side] = built.hand;
    return built.rows;
  };
  const farArm = armOf(far);
  const nearArm = armOf(near);
  // A raised far arm goes up beside the head: draw it last.
  const raisedFar = raisedHand && handSide === far;

  const badgeX =
    !robot && !back && look.pattern === 'badge'
      ? screenSideOf(facing, 'left') === 'right'
        ? 17
        : 12
      : null;
  const badge =
    badgeX === null
      ? null
      : part(`badge:${badgeX}`, false, () =>
          new Mask().rect(badgeX, 29, 3, 3, 'B').set(badgeX + 1, 29, 'D'),
        );
  // The microphone hangs from the left ear, seen only on the side of that ear.
  const earSide: Side = mirrored ? 'left' : 'right';
  const mic =
    !robot && !back && look.accessory === 'headset' && screenSideOf(facing, 'left') === earSide
      ? part(`mic:${earSide}`, false, () => {
          const ear = earSide === 'right' ? 21 : 10;
          const toward = earSide === 'right' ? -1 : 1;
          return new Mask()
            .stroke(ear, 18, ear + toward * 7, 20, 1, 'G')
            .set(ear + toward * 8, 20, 'g');
        })
      : null;
  const hand = hands[handSide];
  const item = holding
    ? part(`held:${holding}:${hand.x}:${hand.y}`, false, () => {
        const mask = new Mask();
        held(mask, holding, hand);
        return mask;
      })
    : null;

  const rows = layer(
    hairBehind,
    raisedFar ? null : farArm,
    pose === 'sit' ? null : legs,
    hood,
    neckRows,
    torso,
    badge,
    nearArm,
    head,
    hairOver,
    beard,
    accessory,
    mic,
    raisedFar ? farArm : null,
    item,
  );
  // `layer` leaves out what is transparent at the end of a row: back to the full box.
  const full = Array.from({ length: FIGURE_HEIGHT }, (_, y) =>
    (rows[y] ?? '').padEnd(FIGURE_WIDTH, '.'),
  );
  return { rows: pose === 'sit' ? full.slice(0, HIPS) : full, hands };
}
