import { type Appearance, defaultAppearance } from '@ea/shared';
import { useMemo } from 'react';
import {
  type Activity,
  type Direction,
  FIGURE_HEIGHT,
  type FigureSpec,
  FIGURE_WIDTH,
  figureMask,
  HIPS,
  type Holding,
  type Pose,
  type RobotTraits,
} from './figure';
import {
  EYES,
  GEAR,
  HAIR,
  INK,
  LENS,
  lighten,
  MOUTH,
  OUTFIT,
  PANTS,
  PAPER,
  SHOES,
  SKIN,
} from './palette';
import { agentLook } from './robot';
import type { PixelPath } from './pixels';
import { colorPaths, type Materials, mix, ramp, shade } from './shade';

// The agents as 32-bit pixel art characters (Phase 22), seen in 3/4 as the
// isometric office is. The figure is built as a mask (figure.ts) and shaded
// with three to four tones per material (shade.ts). Original art.

export type { Activity, Direction, Holding, Pose } from './figure';

export const CHARACTER_WIDTH = FIGURE_WIDTH;
export const CHARACTER_HEIGHT = FIGURE_HEIGHT;
/** The rows down to the hips: what shows of a seated character. */
export const SEATED_HEIGHT = HIPS;
/**
 * Twice the pixels of the 16-bit characters at the same height on screen
 * (D2): 64 rows at 0.5 are the 40 rows at 0.8 of before.
 */
export const CHARACTER_SCALE = 0.5;

/** The colours of each material of a look; a robot's body takes its own colour. */
export function materialsOf(look: Appearance, robotBody: string | null): Materials {
  const skin = SKIN[look.skin];
  const hair = HAIR[look.hairColor];
  const outfit = robotBody
    ? ([robotBody, mix(robotBody, INK, 0.3)] as const)
    : OUTFIT[look.outfitColor];
  const gear = [GEAR, mix(GEAR, INK, 0.4)] as const;
  const skinRamp = ramp(robotBody ? gear : skin);
  const hairRamp = ramp(hair);
  const outfitRamp = ramp(outfit);
  const pantsRamp = ramp(robotBody ? gear : PANTS[look.pants]);
  const shoeRamp = ramp(robotBody ? gear : SHOES[look.shoes]);
  const gearRamp = ramp(gear);
  const detailRamp = ramp([PAPER, '#c9c2e0']);
  return {
    S: { id: 'skin', ramp: skinRamp },
    s: { id: 'skin', ramp: skinRamp, tone: 'shadow' },
    H: { id: 'hair', ramp: hairRamp },
    h: { id: 'hair', ramp: hairRamp, tone: 'shadow' },
    j: { id: 'hair', ramp: hairRamp, tone: 'light' },
    b: { id: 'brow', flat: hairRamp.outline },
    E: { id: 'lash', flat: mix(hair[1], INK, 0.6) },
    e: { id: 'iris', flat: EYES[look.eyes][0] },
    W: { id: 'spark', flat: '#ffffff' },
    u: { id: 'blush', flat: mix(skin[0], '#ff6f91', 0.3) },
    M: { id: 'mouth', flat: MOUTH },
    O: { id: 'outfit', ramp: outfitRamp },
    o: { id: 'outfit', ramp: outfitRamp, tone: 'shadow' },
    A: { id: 'sleeve', ramp: outfitRamp },
    C: { id: 'cap', ramp: outfitRamp },
    c: { id: 'cap', ramp: outfitRamp, tone: 'shadow' },
    D: { id: 'detail', ramp: detailRamp },
    Q: { id: 'pattern', flat: lighten(outfit[0], 0.55) },
    B: { id: 'badge', flat: '#ff7b72' },
    P: { id: 'pants', ramp: pantsRamp },
    K: { id: 'shoe', ramp: shoeRamp },
    k: { id: 'shoe', ramp: shoeRamp, tone: 'shadow' },
    G: { id: 'gear', ramp: gearRamp },
    g: { id: 'gear-light', flat: '#7a7194' },
    L: { id: 'lens', flat: LENS },
    R: { id: 'robot', ramp: outfitRamp },
    r: { id: 'robot', ramp: outfitRamp, tone: 'shadow' },
    N: { id: 'screen', flat: '#151024' },
    n: { id: 'glow', flat: robotBody ? lighten(robotBody, 0.45) : '#ffffff' },
    Y: { id: 'paper', flat: PAPER },
    y: { id: 'ink', flat: '#9c94b8' },
    U: { id: 'cup', flat: '#f4f1ff' },
    v: { id: 'steam', flat: '#d9d3ee' },
  };
}

/**
 * Frames already drawn, by everything that changes them. A walker turning a
 * corner comes back to views it has had; the scene re-reads the office every
 * few seconds with new objects of the same looks. Kept to a bound so a long
 * session does not grow it forever.
 */
const FRAMES = new Map<string, PixelPath[]>();
const FRAMES_KEPT = 1500;

function drawFrame(spec: FigureSpec, robotBody: string | null, x: number, y: number): PixelPath[] {
  const key = JSON.stringify([spec, robotBody, x, y]);
  const cached = FRAMES.get(key);
  if (cached) return cached;
  const paths = colorPaths(shade(figureMask(spec), materialsOf(spec.look, robotBody)), x, y);
  if (FRAMES.size >= FRAMES_KEPT) {
    const oldest = FRAMES.keys().next().value;
    if (oldest !== undefined) FRAMES.delete(oldest);
  }
  FRAMES.set(key, paths);
  return paths;
}

/** How many frames each animation has (D6). */
function framesOf(pose: Pose, activity: Activity, raisedHand: boolean): number {
  if (pose === 'walk') return 4;
  return activity || raisedHand ? 2 : 1;
}

/** The class that shows frame `index` of an animation in turn (theme.css). */
function frameClass(
  pose: Pose,
  activity: Activity,
  raisedHand: boolean,
  index: number,
  count: number,
): string | undefined {
  if (count === 1) return undefined;
  const name =
    pose === 'walk' ? 'walk' : raisedHand ? 'wave' : activity === 'typing' ? 'type' : 'talk';
  // Only the first frame stays when motion is reduced.
  return `pixel-${name}-${index + 1}${index > 0 ? ' pixel-alt' : ''}`;
}

function robotOf(look: Appearance, agentId: string): (RobotTraits & { body: string }) | null {
  return look.kind === 'robot' ? agentLook(agentId) : null;
}

interface FigureLook {
  readonly look: Appearance;
  readonly robot: (RobotTraits & { body: string }) | null;
}

/**
 * The look to draw, kept while its content is the same: the scene passes a
 * new object on every read of the office, and drawing is costly.
 */
function useFigureLook(agentId: string, appearance: Appearance | null): FigureLook {
  const key = JSON.stringify([agentId, appearance]);
  return useMemo(() => {
    const [id, chosen] = JSON.parse(key) as [string, Appearance | null];
    const look = chosen ?? defaultAppearance(id);
    return { look, robot: robotOf(look, id) };
  }, [key]);
}

export interface CharacterProps {
  readonly agentId: string;
  readonly appearance: Appearance | null;
  readonly pose: Pose;
  readonly facing?: Direction;
  /** Something in the hand: the result of a delegation, or a coffee. */
  readonly holding?: Holding;
  /** Class of the whole figure, for the movement of the agent's state. */
  readonly bodyClass?: string;
  /** Class of the head's movement; kept for the shake of a failure. */
  readonly headClass?: string;
  readonly raisedHand?: boolean;
  /** Typing at the desk, or talking in a meeting (D6). */
  readonly activity?: Activity;
}

/**
 * A character drawn with its feet at (0, 0), or its hips when seated. Frames
 * of an animation are stacked and shown in turn by CSS classes alone.
 */
export function PixelCharacter({
  agentId,
  appearance,
  pose,
  facing = 'sw',
  holding = null,
  bodyClass,
  headClass,
  raisedHand = false,
  activity = null,
}: CharacterProps) {
  const figure = useFigureLook(agentId, appearance);
  const count = framesOf(pose, activity, raisedHand);
  const frames = useMemo(() => {
    const { look, robot } = figure;
    return Array.from({ length: count }, (_, frame) =>
      drawFrame(
        { look, robot, facing, pose, frame, holding, raisedHand, activity },
        robot?.body ?? null,
        -CHARACTER_WIDTH / 2,
        pose === 'sit' ? -SEATED_HEIGHT : -CHARACTER_HEIGHT,
      ),
    );
  }, [figure, facing, pose, holding, raisedHand, activity, count]);

  return (
    <g transform={`scale(${CHARACTER_SCALE})`}>
      {pose !== 'sit' && <ellipse cx="0" cy="0" rx="13" ry="4" fill={INK} opacity="0.3" />}
      <g className={bodyClass}>
        <g className={headClass}>
          {frames.map((paths, index) => (
            <g
              key={index}
              className={frameClass(pose, activity, raisedHand, index, count)}
              shapeRendering="crispEdges"
            >
              {paths.map((path) => (
                <path key={path.fill} d={path.d} fill={path.fill} />
              ))}
            </g>
          ))}
        </g>
      </g>
    </g>
  );
}

export interface FrameRequest {
  readonly pose: Pose;
  readonly facing: Direction;
  readonly holding: Holding;
  readonly raisedHand: boolean;
  readonly activity: Activity;
}

/** Rows of the bust: from above the tallest hair down to the shoulders. */
const BUST_TOP = 3;
const BUST_ROWS = 26;
/** The columns of the head and shoulders: the figure is narrower than its box. */
const BUST_LEFT = 4;
const BUST_WIDTH = 24;

/** Just the head and shoulders, for avatars. */
export function PixelBust({
  agentId,
  appearance,
}: {
  agentId: string;
  appearance: Appearance | null;
}) {
  const figure = useFigureLook(agentId, appearance);
  const paths = useMemo(() => {
    const { look, robot } = figure;
    return colorPaths(
      shade(
        figureMask({
          look,
          robot,
          facing: 'sw',
          pose: 'sit',
          frame: 0,
          holding: null,
          raisedHand: false,
          activity: null,
        }).slice(BUST_TOP, BUST_TOP + BUST_ROWS),
        materialsOf(look, robot?.body ?? null),
      ),
    );
  }, [figure]);
  return (
    <g shapeRendering="crispEdges">
      {paths.map((path) => (
        <path key={path.fill} d={path.d} fill={path.fill} />
      ))}
    </g>
  );
}

/** The box of a bust, for the avatar's `viewBox`. */
export const BUST_VIEWBOX = `${BUST_LEFT} 0 ${BUST_WIDTH} ${BUST_ROWS}`;

/** One frame of a character, still: for the reference page and the tests. */
export function PixelStill({
  agentId,
  appearance,
  facing = 'sw',
  pose = 'stand',
  frame = 0,
  holding = null,
  raisedHand = false,
  activity = null,
}: Omit<CharacterProps, 'bodyClass' | 'headClass' | 'pose'> & {
  readonly pose?: Pose;
  readonly frame?: number;
}) {
  const look = appearance ?? defaultAppearance(agentId);
  const robot = robotOf(look, agentId);
  const paths = colorPaths(
    shade(
      figureMask({ look, robot, facing, pose, frame, holding, raisedHand, activity }),
      materialsOf(look, robot?.body ?? null),
    ),
  );
  return (
    <g shapeRendering="crispEdges">
      {paths.map((path) => (
        <path key={path.fill} d={path.d} fill={path.fill} />
      ))}
    </g>
  );
}
