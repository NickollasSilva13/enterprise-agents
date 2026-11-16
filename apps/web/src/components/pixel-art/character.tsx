import { type Appearance, defaultAppearance, type HairStyle, type Outfit } from '@ea/shared';
import { AgentHead, agentLook } from './robot';
import { GEAR, HAIR, INK, LENS, MOUTH, OUTFIT, PANTS, PAPER, SHOE, SKIN } from './palette';
import { layer, type Palette, PixelSprite, type Sprite } from './pixels';

// The agents of the office as pixel art characters, built from layers: a
// body, an outfit, a hair style and an accessory, each with the colours the
// user picked (Phase 14). 12 by 24 pixels, feet at the bottom middle.

export const CHARACTER_WIDTH = 12;
export const CHARACTER_HEIGHT = 24;
/** Rows of the character that show above a desk when it is seated. */
export const SEATED_HEIGHT = 18;

const HEAD: Sprite = [
  '............',
  '............',
  '...XXXXXX...',
  '..XSSSSSSX..',
  '..XSSSSSSX..',
  '..XSSSSSSX..',
  '..XSESSESX..',
  '..XSSSSSSX..',
  '..XsSMMSsX..',
  '...XsSSsX...',
  '....XSSX....',
];

/** The back of a head: hair all over. */
const HEAD_BACK: Sprite = [
  '............',
  '............',
  '...XXXXXX...',
  '..XHHHHHHX..',
  '..XHHHHHHX..',
  '..XHHHHHHX..',
  '..XHHHHHHX..',
  '..XHHHHHHX..',
  '..XhHHHHhX..',
  '...XhHHhX...',
  '....XSSX....',
];

const PAD = Array.from({ length: 11 }, () => '............');

const TORSO: Record<Outfit, Sprite> = {
  tshirt: [
    ...PAD,
    '...XOSSOX...',
    '..XOOSSOOX..',
    '.XOOOOOOOOX.',
    '.XOXOOOOXOX.',
    '.XSXOOOOXSX.',
    '.XSXooooXSX.',
    '..XXPPPPXX..',
  ],
  hoodie: [
    ...PAD,
    '..XOOOOOOX..',
    '..XODOODOX..',
    '.XOODOODOOX.',
    '.XOXOOOOXOX.',
    '.XOXooooXOX.',
    '.XSXooooXSX.',
    '..XXPPPPXX..',
  ],
  shirt: [
    ...PAD,
    '...XDSSDX...',
    '..XODDDDOX..',
    '.XOOODOOOOX.',
    '.XOXODOOXOX.',
    '.XOXOOOOXOX.',
    '.XSXoDooXSX.',
    '..XXPPPPXX..',
  ],
};

/** Without the details of the front: seen from behind, every outfit is plain. */
const torsoBack = (outfit: Outfit): string[] =>
  TORSO[outfit].map((row, y) => (y < 14 ? row.replace(/[DS]/g, 'O') : row.replace(/D/g, 'o')));

const LEG_A: Sprite = [
  ...PAD,
  ...Array.from({ length: 7 }, () => '............'),
  '...XPP......',
  '...XPP......',
  '...XPp......',
  '...XPp......',
  '..XKKK......',
  '..XXXX......',
];

const LEG_B: Sprite = [
  ...PAD,
  ...Array.from({ length: 7 }, () => '............'),
  '......PPX...',
  '......PPX...',
  '......pPX...',
  '......pPX...',
  '......KKKX..',
  '......XXXX..',
];

const HAIR_FRONT: Record<HairStyle, Sprite> = {
  short: ['............', '...hhhhhh...', '..hHHHHHHh..', '..HHHHHHHH..', '..H......H..'],
  long: [
    '............',
    '...hhhhhh...',
    '..hHHHHHHh..',
    '.hHHHHHHHHh.',
    '.HH......HH.',
    '.HH......HH.',
    '.HH......HH.',
    '.HH......HH.',
    '.Hh......hH.',
    '.hh......hh.',
  ],
  curly: [
    '...h.hh.h...',
    '..hHhHHhHh..',
    '.hHHHHHHHHh.',
    '.HHHHHHHHHH.',
    '.HH......HH.',
    '.h........h.',
  ],
  bun: ['.....hh.....', '....hHHh....', '..hhHHHHhh..', '..HHHHHHHH..', '..H......H..'],
  spiky: ['..h.h.h.h...', '..HhHhHhHh..', '..HHHHHHHH..', '..HHHHHHHH..', '..H......H..'],
  shaved: ['............', '............', '...hhhhhh...', '..h......h..'],
};

/** What shows of each style from behind, over the back of the head. */
const HAIR_BACK: Partial<Record<HairStyle, Sprite>> = {
  long: [...PAD.slice(0, 9), '..XHHHHHHX..', '..XHHHHHHX..', '...XHHHHX...'],
  curly: HAIR_FRONT.curly,
  bun: HAIR_FRONT.bun,
  spiky: HAIR_FRONT.spiky,
};

const GLASSES: Sprite = [...PAD.slice(0, 6), '..XLEXXELX..'];
const HEADSET: Sprite = [
  '............',
  '............',
  '...GGGGGG...',
  '..G......G..',
  '..G......G..',
  '.GG......GG.',
  '.GG......GG.',
  '..........G.',
  '........GG..',
];
const HEADSET_BACK: Sprite = HEADSET.slice(0, 7);
const CAP: Sprite = ['............', '...CCCCCC...', '..CCCCCCCC..', '..CCCCCCCCcc'];
const CAP_BACK: Sprite = ['............', '...CCCCCC...', '..CCCCCCCC..', '..cCCCCCCc..'];

/** A raised hand, over the right arm, for an agent waiting for the user. */
export const RAISED_HAND: Sprite = [
  '..........XS',
  '..........XS',
  '.........XOX',
  '.........XOX',
  '.........XOX',
];

export type Pose = 'stand' | 'walk' | 'sit';
export type Facing = 'front' | 'back';

function paletteOf(look: Appearance, robotBody: string | null): Palette {
  const [skin, skinShadow] = SKIN[look.skin];
  const [hair, hairShadow] = HAIR[look.hairColor];
  const [outfit, outfitShadow] = robotBody ? [robotBody, robotBody] : OUTFIT[look.outfitColor];
  const [pants, pantsShadow] = robotBody ? [GEAR, GEAR] : PANTS[look.pants];
  return {
    X: INK,
    S: robotBody ? GEAR : skin,
    s: robotBody ? GEAR : skinShadow,
    E: INK,
    M: MOUTH,
    H: hair,
    h: hairShadow,
    O: outfit,
    o: outfitShadow,
    D: PAPER,
    P: pants,
    p: pantsShadow,
    K: SHOE,
    L: LENS,
    G: GEAR,
    C: outfit,
    c: outfitShadow,
  };
}

function headLayers(look: Appearance, facing: Facing): string[] {
  if (facing === 'back') {
    const accessory =
      look.accessory === 'headset' ? HEADSET_BACK : look.accessory === 'cap' ? CAP_BACK : null;
    return layer(HEAD_BACK, HAIR_BACK[look.hair], accessory);
  }
  const accessory =
    look.accessory === 'glasses'
      ? GLASSES
      : look.accessory === 'headset'
        ? HEADSET
        : look.accessory === 'cap'
          ? CAP
          : null;
  // A cap sits over the hair; long hair still falls below it.
  return layer(HEAD, HAIR_FRONT[look.hair], accessory);
}

export interface CharacterProps {
  readonly agentId: string;
  readonly appearance: Appearance | null;
  readonly pose: Pose;
  readonly facing?: Facing;
  /** Something in the hand: the result of a delegation, or a coffee. */
  readonly holding?: 'paper' | 'cup' | null;
  /** Class of the head, for the movement of the agent's state. */
  readonly headClass?: string;
  /** Class of the body. */
  readonly bodyClass?: string;
  readonly raisedHand?: boolean;
}

/**
 * A character drawn with its feet at (0, 0). Seated, only the part above the
 * hips is drawn, and (0, 0) is where the hips are.
 */
export function PixelCharacter({
  agentId,
  appearance,
  pose,
  facing = 'front',
  holding = null,
  headClass,
  bodyClass,
  raisedHand = false,
}: CharacterProps) {
  const look = appearance ?? defaultAppearance(agentId);
  const robot = look.kind === 'robot' ? agentLook(agentId) : null;
  const palette = paletteOf(look, robot?.body ?? null);
  const torso = facing === 'back' ? torsoBack(look.outfit) : TORSO[look.outfit];
  // Seated, the hips (row 18) are the anchor; standing, the feet (row 24).
  const top = pose === 'sit' ? -SEATED_HEIGHT : -CHARACTER_HEIGHT;
  const left = -CHARACTER_WIDTH / 2;
  return (
    <g>
      {pose !== 'sit' && <ellipse cx="0" cy="0" rx="6" ry="2" fill={INK} opacity="0.35" />}
      <g className={bodyClass}>
        {pose !== 'sit' && (
          <>
            <PixelSprite
              sprite={LEG_A}
              palette={palette}
              x={left}
              y={top}
              className={pose === 'walk' ? 'pixel-leg-a' : undefined}
            />
            <PixelSprite
              sprite={LEG_B}
              palette={palette}
              x={left}
              y={top}
              className={pose === 'walk' ? 'pixel-leg-b' : undefined}
            />
          </>
        )}
        <PixelSprite sprite={torso} palette={palette} x={left} y={top} />
        {raisedHand && (
          <PixelSprite
            sprite={RAISED_HAND}
            palette={palette}
            x={left + 1}
            y={top + 7}
            className="desk-wave"
          />
        )}
        {holding === 'paper' && (
          <g shapeRendering="crispEdges">
            <rect x={left + 9} y={top + 13} width="4" height="5" fill={PAPER} />
            <rect x={left + 10} y={top + 14} width="2" height="1" fill={INK} opacity="0.5" />
          </g>
        )}
        {holding === 'cup' && (
          <g shapeRendering="crispEdges">
            <rect x={left + 9} y={top + 14} width="3" height="3" fill={PAPER} />
            <rect x={left + 12} y={top + 15} width="1" height="1" fill={PAPER} />
            <path
              d={`M${left + 10} ${top + 12} v-2 M${left + 11.5} ${top + 12} v-2`}
              stroke={PAPER}
              strokeWidth="0.6"
              className="desk-steam"
            />
          </g>
        )}
      </g>
      <g className={headClass}>
        {robot ? (
          <g transform={`translate(${left - 1} ${top - 2}) scale(0.35)`}>
            <AgentHead look={robot} />
          </g>
        ) : (
          <PixelSprite sprite={headLayers(look, facing)} palette={palette} x={left} y={top} />
        )}
      </g>
    </g>
  );
}

/** Just the head and shoulders, for avatars, in a 12 by 12 box. */
export function PixelBust({
  agentId,
  appearance,
}: {
  agentId: string;
  appearance: Appearance | null;
}) {
  const look = appearance ?? defaultAppearance(agentId);
  const robot = look.kind === 'robot' ? agentLook(agentId) : null;
  if (robot) {
    return (
      <g transform="scale(0.3)">
        <AgentHead look={robot} />
      </g>
    );
  }
  const palette = paletteOf(look, null);
  const sprite = layer(headLayers(look, 'front'), TORSO[look.outfit]).slice(1, 14);
  return <PixelSprite sprite={sprite} palette={palette} x={0} y={-0.5} />;
}
