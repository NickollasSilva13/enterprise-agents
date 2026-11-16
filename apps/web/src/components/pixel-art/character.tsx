import { type Appearance, defaultAppearance, type HairStyle, type Outfit } from '@ea/shared';
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
import { layer, type Palette, PixelSprite, type Sprite } from './pixels';
import { AgentHead, agentLook } from './robot';

// The agents as 16-bit pixel art characters (Phase 15), seen in 3/4 as the
// isometric office is. Two views are drawn, facing down-left ("sw") and
// up-left ("nw"); the other two directions are those mirrored. A character
// is built from layers: head, hair, face, accessory, torso, pattern and legs,
// each coloured by the options the user picked. Original art: no sprite of
// any game is copied.

export const CHARACTER_WIDTH = 20;
/** Rows above the head, for tall hair (afro, bun, spikes). */
const HEADROOM = 4;
export const CHARACTER_HEIGHT = HEADROOM + 36;
/** The rows down to the hips: what shows of a seated character. */
export const SEATED_HEIGHT = HEADROOM + 26;
/** Characters are drawn a little smaller than their pixels, to match the furniture. */
export const CHARACTER_SCALE = 0.8;

export type Direction = 'sw' | 'se' | 'nw' | 'ne';
export type Pose = 'stand' | 'walk' | 'sit';

/**
 * A sprite of the full character height, with `rows` from `start` (0 is the
 * top of the head, negative goes up into the headroom). Short rows are
 * padded with transparency.
 */
function place(start: number, rows: readonly string[]): string[] {
  const sprite = Array.from({ length: CHARACTER_HEIGHT }, () => '.'.repeat(CHARACTER_WIDTH));
  rows.forEach((row, index) => {
    const at = start + index + HEADROOM;
    if (at >= 0 && at < CHARACTER_HEIGHT) sprite[at] = row.padEnd(CHARACTER_WIDTH, '.');
  });
  return sprite;
}

// ---------------------------------------------------------------------------
// Head

const HEAD = place(1, [
  '......XXXXXXX',
  '....XXSSSSSSSXX',
  '...XSSSSSSSSSSSX',
  '..XSSSSSSSSSSSSSX',
  '..XSSSSSSSSSSSSSX',
  '.XSbbSSSbbSSSSSssX',
  '.XSSSSSSSSSSSSSssX',
  '.XSeWSSSeWSSSXsSsX',
  '.XSeeSSSeeSSSXsSsX',
  '.XSSSSSSSSSSSSXssX',
  '.XSSSsSSSSSSSSSssX',
  '..XSSSSSSSSSSSSsX',
  '..XSSMMMSSSSSSssX',
  '...XSSSSSSSSSssX',
  '....XXsSSSSsXX',
  '......XXXXXX',
]);

/** The back of a head: hair all over, the ear and the nape showing. */
const HEAD_BACK = place(1, [
  '......XXXXXXX',
  '....XXHHHHHHHXX',
  '...XHHjjHHHHHHHX',
  '..XHHjHHHHHHHHHHX',
  '..XHHHHHHHHHHHHHX',
  '.XHHHHHHHHHHHHHhhX',
  '.XHHHHHHHHHHHHHhhX',
  '.XHHHHHHHHHHHXsShX',
  '.XHHHHHHHHHHHXsShX',
  '.XhHHHHHHHHHHHXhhX',
  '.XhhHHHHHHHHHHhhhX',
  '..XhhHHHHHHHHhhhX',
  '..XShhhhhhhhhhhSX',
  '...XSSSSSSSSSSSX',
  '....XXsSSSSsXX',
  '......XXXXXX',
]);

/** A shaved head from behind: skin with a dark shadow of hair on top. */
const HEAD_BACK_SHAVED = place(1, [
  '......XXXXXXX',
  '....XXhhhhhhhXX',
  '...XhhhhhhhhhhhX',
  '..XhhhhhhhhhhhhhX',
  '..XhhhhhhhhhhhhhX',
  '.XShhhhhhhhhhhhssX',
  '.XSSSSSSSSSSSSSssX',
  '.XSSSSSSSSSSSXsSsX',
  '.XSSSSSSSSSSSXsSsX',
  '.XSSSSSSSSSSSSXssX',
  '.XSSSSSSSSSSSSSssX',
  '..XSSSSSSSSSSSSsX',
  '..XSSSSSSSSSSSssX',
  '...XSSSSSSSSSssX',
  '....XXsSSSSsXX',
  '......XXXXXX',
]);

/** Top of the head shared by most styles. */
const CAP_OF_HAIR = [
  '......XXXXXXX',
  '....XXHHHHHHHXX',
  '...XHHjjHHHHHHHX',
  '..XHHjHHHHHHHHHHX',
  '..XHHHHHHHHHHHHHX',
];

interface HairSprites {
  /** Over the face, seen from the front. */
  readonly front: Sprite;
  /** Over the back of the head. */
  readonly back: Sprite | null;
}

const HAIR_STYLE: Record<HairStyle, HairSprites> = {
  short: {
    front: place(1, [...CAP_OF_HAIR, '.XHHhHhhHHhHHHHHhX', '............HHHhhX']),
    back: null,
  },
  long: {
    front: place(1, [
      ...CAP_OF_HAIR,
      '.XHHhHhhHHhHHHHHhX',
      '.XH.........HHHhhX',
      '.XH..........HHhhX',
      '.XH..........HHhhX',
      '.XH..........HHhhX',
      '.XH..........HhhX',
      '.XH..........HhhX',
      '..X..........HhhX',
      '............XHhhX',
      '............XhhX',
      '.............XX',
    ]),
    back: place(12, [
      '..XhhHHHHHHHHhhhX',
      '..XHHHHHHHHHHHhhX',
      '...XHHHHHHHHHhhX',
      '...XhHHHHHHHHhX',
      '....XhhHHHHhhX',
      '.....XXXXXXXX',
    ]),
  },
  curly: {
    front: place(-1, [
      '.....X.XX.X.X',
      '....XHXHHXHXHX',
      '...XHHHHHHHHHXX',
      '..XHjHHHHHHHHHHX',
      '..XHHjHHHHHHHHHHX',
      '.XHHHHHHHHHHHHHHHX',
      '.XHHHHHHHHHHHHHHHX',
      '.XHHhHHhHHhHHHHHhX',
      '.XHh.........HHhhX',
      '..Hh..........HhX',
    ]),
    back: place(-1, ['.....X.XX.X.X', '....XHXHHXHXHX', '...XHHHHHHHHHXX']),
  },
  bun: {
    front: place(-3, [
      '.......XXXX',
      '......XHHjhX',
      '......XHHHhX',
      '.......XXXX',
      ...CAP_OF_HAIR,
      '.XHHhHhhHHhHHHHHhX',
      '............HHHhhX',
    ]),
    back: place(-3, ['.......XXXX', '......XHHjhX', '......XHHHhX', '.......XXXX']),
  },
  spiky: {
    front: place(-2, [
      '.....X..X..X..X',
      '....XHXXHXXHXXHX',
      '....XHHHHHHHHHHX',
      ...CAP_OF_HAIR,
      '.XHHhHhhHHhHHHHHhX',
      '............HHHhhX',
    ]),
    back: place(-2, ['.....X..X..X..X', '....XHXXHXXHXXHX', '....XHHHHHHHHHHX']),
  },
  shaved: {
    front: place(1, ['......XXXXXXX', '....XXhhhhhhhXX', '...XhhhhhhhhhhhX', '..XhSSSSSSSSShhhX']),
    back: null,
  },
  afro: {
    front: place(-3, [
      '.....XXXXXXXXX',
      '...XXHHHHHHHHHXX',
      '..XHHHjHHHHHHHHHX',
      '.XHHjHHHHHHHHHHHHX',
      'XHHHHHHHHHHHHHHHHHX',
      'XHHHHHHHHHHHHHHHHHX',
      'XHHHHHHHHHHHHHHHHHX',
      'XHHHHHHHHHHHHHHHHHX',
      'XHHHHHHHHHHHHHHHHHX',
      'XHHhHhhHHhHHHHHHhhX',
      'XHh.........HHHHhhX',
      'XHh..........HHhhhX',
      'XHh..........HHhhhX',
      'XHh..........HHhhX',
      '.Xh..........HhhhX',
      '..X...........hhX',
    ]),
    back: place(-3, [
      '.....XXXXXXXXX',
      '...XXHHHHHHHHHXX',
      '..XHHHjHHHHHHHHHX',
      '.XHHjHHHHHHHHHHHHX',
      'XHHHHHHHHHHHHHHHHHX',
      'XHHHHHHHHHHHHHHHHHX',
      'XHHHHHHHHHHHHHHHHHX',
      'XHHHHHHHHHHHHHHHHHX',
      'XHHHHHHHHHHHHHHHHHX',
      'XHHHHHHHHHHHHHHHhhX',
      'XHHHHHHHHHHHHHHHhhX',
      'XhHHHHHHHHHHHHHhhhX',
      'XhhHHHHHHHHHHHhhhhX',
      'XhhhHHHHHHHHHhhhhX',
      '.XhhhhhhhhhhhhhhX',
      '..XXXXXXXXXXXXXX',
    ]),
  },
  ponytail: {
    front: place(1, [
      ...CAP_OF_HAIR,
      '.XHHhHhhHHhHHHHHhXX',
      '............HHHhXHX',
      '................XHX',
      '................XhX',
      '................XhX',
      '.................X',
    ]),
    back: place(9, ['.......XHHX', '.......XHhX', '.......XHhX', '.......XhhX', '........XX']),
  },
  wavy: {
    front: place(1, [
      ...CAP_OF_HAIR,
      '.XHhHHhHHhHHHHHHhX',
      '.XHh........HHHhhX',
      '.XH..........HHhhX',
      '.Xh..........HhhX',
      '..h...........hX',
    ]),
    back: place(12, ['..XhHHhHHhHHhhhX', '...XhHhhHhhHhX', '....XXXXXXXXX']),
  },
};

const FACIAL_HAIR: Record<Appearance['facialHair'], Sprite | null> = {
  none: null,
  stubble: place(11, ['...h.h.h.h.h', '....h.h...h.h', '.....h.h.h']),
  mustache: place(12, ['....hHHHh']),
  beard: place(11, [
    '..XH.........HH',
    '..XHHhSSSShHHHX',
    '..XHHMMMHHHHHHX',
    '...XHHHHHHHHHX',
    '....XXHHHHHXX',
  ]),
};

const ACCESSORY_FRONT: Record<Appearance['accessory'], Sprite | null> = {
  none: null,
  glasses: place(7, ['..GGGG.GGGG.GG', '..GL.G.GL.G', '..G..GGG..G', '..GGGG.GGGG']),
  headset: place(1, [
    '......GGGGGGG',
    '....GG.......GG',
    '...G...........G',
    '',
    '',
    '',
    '.............GGGG',
    '.............GggG',
    '.............GggG',
    '..........GGGGGG',
    '.......GGG',
  ]),
  cap: place(0, [
    '......CCCCCCC',
    '....CCCCCCCCCCC',
    '...CCcCCCCCCCCCC',
    '..CCCCCCCCCCCCCCC',
    'cccccccCCCCCCCCCC',
    '.cccccc',
  ]),
};

const ACCESSORY_BACK: Record<Appearance['accessory'], Sprite | null> = {
  none: null,
  glasses: place(8, ['.............GG']),
  headset: place(1, [
    '......GGGGGGG',
    '....GG.......GG',
    '...G...........G',
    '',
    '',
    '',
    '.............GGGG',
    '.............GggG',
    '.............GggG',
  ]),
  cap: place(0, [
    '......CCCCCCC',
    '....CCCCCCCCCCC',
    '...CCcCCCCCCCCCC',
    '..CCCCCCCCCCCCCCC',
    '..ccCCCCCCCCCCCc',
  ]),
};

// ---------------------------------------------------------------------------
// Body

const TORSO: Record<Outfit, Sprite> = {
  tshirt: place(16, [
    '......XXXXXX',
    '....XXOOSSOOXX',
    '...XOOOOSOOOOoX',
    '..XOOOOOOOOOOooX',
    '..XOXOOOOOOOOooX',
    '.XOOXOOOOOOOOooX',
    '.XSSXOOOOOOOOooX',
    '.XSSXOOOOOOOOooX',
    '.XSsXOOOOOOOOooX',
    '..XX.XooooooooX',
    '.....XPPPPPPPqX',
  ]),
  hoodie: place(16, [
    '....XXXXXXXXX',
    '...XOOOOOOOOoX',
    '...XOODOOODOoX',
    '..XOOODOOODOooX',
    '..XOXOOOOOOOooX',
    '.XOOXOOOOOOOooX',
    '.XOOXOOooooOooX',
    '.XOOXOOOOOOOooX',
    '.XSsXOOOOOOOooX',
    '..XX.XooooooooX',
    '.....XPPPPPPPqX',
  ]),
  shirt: place(16, [
    '......XXXXXX',
    '....XXDDSSDDXX',
    '...XOODDSDDOOoX',
    '..XOOOODDOOOOooX',
    '..XOXOOODOOOOooX',
    '.XOOXOOOOOOOOooX',
    '.XOOXOOODOOOOooX',
    '.XOOXOOOOOOOOooX',
    '.XSsXOOODOOOOooX',
    '..XX.XooooooooX',
    '.....XPPPPPPPqX',
  ]),
};

/** From behind every outfit is plain: no collar, no buttons, no strings. */
const torsoBack = (outfit: Outfit): string[] =>
  TORSO[outfit].map((row, index) => {
    // The collar rows lose their skin and white details; the hands keep their skin.
    const collar = index >= HEADROOM + 16 && index < HEADROOM + 19;
    return collar ? row.replace(/[DS]/g, 'O') : row.replace(/D/g, 'O');
  });

const PATTERN: Record<Appearance['pattern'], Sprite | null> = {
  plain: null,
  stripes: place(19, ['.....QQQQQQQQ', '', '.....QQQQQQQQ', '', '.....QQQQQQQQ']),
  badge: place(19, ['.........DDD', '.........DQD']),
};

const LEGS_STAND = place(26, [
  '.....XPPPPPPPqX',
  '.....XPPPXPPPqX',
  '.....XPPPXPPqqX',
  '.....XPPPXPPqqX',
  '.....XPPPXPPqqX',
  '.....XPPqXPqqqX',
  '....XKKKKXKKKkX',
  '....XkkkkXkkkkX',
  '.....XXXXXXXXXX',
]);

/** Two steps of a walk: the near leg forward, then the far one. */
const LEGS_STEP_A = place(26, [
  '.....XPPPPPPPqX',
  '.....XPPPXPPPqX',
  '....XPPPX.XPPqX',
  '....XPPPX.XPqqX',
  '...XPPPX..XPqqX',
  '...XPPqX..XPqqX',
  '..XKKKKX.XKKKkX',
  '..XkkkkX.XkkkkX',
  '...XXXX...XXXX',
]);

const LEGS_STEP_B = place(26, [
  '.....XPPPPPPPqX',
  '.....XPPPXPPPqX',
  '.....XPPPXXPPPqX',
  '.....XPPPX.XPPqX',
  '.....XPPPX..XPPqX',
  '.....XPPqX..XPqqX',
  '....XKKKKX.XKKKkX',
  '....XkkkkX.XkkkkX',
  '.....XXXX...XXXX',
]);

/** A raised hand, for an agent waiting for the user. */
const RAISED_HAND = place(9, ['XSX', 'XSX', 'XOX', 'XOX', 'XOX', 'XOX', 'XOX']);

/** Every sprite of the character, for the tests that check their shape. */
export const ALL_SPRITES: readonly Sprite[] = [
  HEAD,
  HEAD_BACK,
  HEAD_BACK_SHAVED,
  ...Object.values(HAIR_STYLE).flatMap((style) =>
    style.back ? [style.front, style.back] : [style.front],
  ),
  ...Object.values(FACIAL_HAIR).flatMap((sprite) => (sprite ? [sprite] : [])),
  ...Object.values(ACCESSORY_FRONT).flatMap((sprite) => (sprite ? [sprite] : [])),
  ...Object.values(ACCESSORY_BACK).flatMap((sprite) => (sprite ? [sprite] : [])),
  ...Object.values(TORSO),
  ...Object.values(PATTERN).flatMap((sprite) => (sprite ? [sprite] : [])),
  LEGS_STAND,
  LEGS_STEP_A,
  LEGS_STEP_B,
  RAISED_HAND,
];

function paletteOf(look: Appearance, robotBody: string | null): Palette {
  const [skin, skinShadow] = SKIN[look.skin];
  const [hair, hairShadow] = HAIR[look.hairColor];
  const [outfit, outfitShadow] = robotBody ? [robotBody, robotBody] : OUTFIT[look.outfitColor];
  const [pants, pantsShadow] = robotBody ? [GEAR, GEAR] : PANTS[look.pants];
  const [shoe, shoeShadow] = SHOES[look.shoes];
  const [iris] = EYES[look.eyes];
  return {
    X: INK,
    S: robotBody ? GEAR : skin,
    s: robotBody ? GEAR : skinShadow,
    e: iris,
    W: '#ffffff',
    b: hairShadow,
    M: MOUTH,
    H: hair,
    h: hairShadow,
    j: lighten(hair, 0.35),
    O: outfit,
    o: outfitShadow,
    D: PAPER,
    Q: look.pattern === 'badge' ? '#ff7b72' : lighten(outfit, 0.55),
    P: pants,
    q: pantsShadow,
    K: shoe,
    k: shoeShadow,
    G: GEAR,
    g: '#7a7194',
    L: LENS,
    C: outfit,
    c: outfitShadow,
  };
}

/** The layers of a person's head for a view: base, hair, face, accessory. */
function headOf(look: Appearance, back: boolean): string[] {
  const style = HAIR_STYLE[look.hair];
  if (back) {
    const base = look.hair === 'shaved' ? HEAD_BACK_SHAVED : HEAD_BACK;
    return layer(base, style.back, ACCESSORY_BACK[look.accessory]);
  }
  return layer(HEAD, style.front, FACIAL_HAIR[look.facialHair], ACCESSORY_FRONT[look.accessory]);
}

export interface CharacterProps {
  readonly agentId: string;
  readonly appearance: Appearance | null;
  readonly pose: Pose;
  readonly facing?: Direction;
  /** Something in the hand: the result of a delegation, or a coffee. */
  readonly holding?: 'paper' | 'cup' | null;
  /** Class of the head, for the movement of the agent's state. */
  readonly headClass?: string;
  /** Class of the body. */
  readonly bodyClass?: string;
  readonly raisedHand?: boolean;
}

/**
 * A character drawn with its feet at (0, 0), or its hips when seated. The
 * walk alternates two leg frames with the `pixel-frame-*` classes (CSS only).
 */
export function PixelCharacter({
  agentId,
  appearance,
  pose,
  facing = 'sw',
  holding = null,
  headClass,
  bodyClass,
  raisedHand = false,
}: CharacterProps) {
  const look = appearance ?? defaultAppearance(agentId);
  const robot = look.kind === 'robot' ? agentLook(agentId) : null;
  const palette = paletteOf(look, robot?.body ?? null);
  const back = facing === 'nw' || facing === 'ne';
  const mirrored = facing === 'se' || facing === 'ne';
  const torso = layer(
    back ? torsoBack(look.outfit) : TORSO[look.outfit],
    back || robot ? null : PATTERN[look.pattern],
  );
  const left = -CHARACTER_WIDTH / 2;
  const top = pose === 'sit' ? -SEATED_HEIGHT : -CHARACTER_HEIGHT;
  return (
    <g transform={`scale(${mirrored ? -CHARACTER_SCALE : CHARACTER_SCALE} ${CHARACTER_SCALE})`}>
      {pose !== 'sit' && <ellipse cx="0" cy="0" rx="8" ry="2.5" fill={INK} opacity="0.3" />}
      <g className={bodyClass}>
        {pose === 'stand' && <PixelSprite sprite={LEGS_STAND} palette={palette} x={left} y={top} />}
        {pose === 'walk' && (
          <>
            <PixelSprite
              sprite={LEGS_STEP_A}
              palette={palette}
              x={left}
              y={top}
              className="pixel-frame-a"
            />
            <PixelSprite
              sprite={LEGS_STEP_B}
              palette={palette}
              x={left}
              y={top}
              className="pixel-frame-b"
            />
          </>
        )}
        <PixelSprite
          sprite={pose === 'sit' ? torso.slice(0, SEATED_HEIGHT) : torso}
          palette={palette}
          x={left}
          y={top}
        />
        {raisedHand && (
          <PixelSprite
            sprite={RAISED_HAND}
            palette={palette}
            x={left + 15}
            y={top}
            className="desk-wave"
          />
        )}
        {holding === 'paper' && (
          <g shapeRendering="crispEdges">
            <rect x={left - 1} y={top + HEADROOM + 21} width="5" height="6" fill={PAPER} />
            <rect x={left} y={top + HEADROOM + 22} width="3" height="1" fill={INK} opacity="0.5" />
            <rect x={left} y={top + HEADROOM + 24} width="3" height="1" fill={INK} opacity="0.5" />
          </g>
        )}
        {holding === 'cup' && (
          <g shapeRendering="crispEdges">
            <rect x={left} y={top + HEADROOM + 22} width="4" height="4" fill={PAPER} />
            <rect x={left + 4} y={top + HEADROOM + 23} width="1" height="2" fill={PAPER} />
            <path
              d={`M${left + 1} ${top + HEADROOM + 20} v-2 M${left + 3} ${top + HEADROOM + 20} v-2`}
              stroke={PAPER}
              strokeWidth="0.7"
              className="desk-steam"
            />
          </g>
        )}
      </g>
      <g className={headClass}>
        {robot ? (
          <g transform={`translate(${left + 1} ${top + HEADROOM}) scale(0.45)`}>
            <AgentHead look={robot} />
          </g>
        ) : (
          <PixelSprite sprite={headOf(look, back)} palette={palette} x={left} y={top} />
        )}
      </g>
    </g>
  );
}

/** Just the head and shoulders, for avatars, in a 20 by 22 box. */
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
      <g transform="translate(1 1) scale(0.45)">
        <AgentHead look={robot} />
      </g>
    );
  }
  const palette = paletteOf(look, null);
  // From the top of the tallest hair to the shoulders.
  const sprite = layer(TORSO[look.outfit], PATTERN[look.pattern], headOf(look, false)).slice(
    1,
    1 + 22,
  );
  return <PixelSprite sprite={sprite} palette={palette} x={0} y={0} />;
}

/** The box of a bust, for the avatar's `viewBox`. */
export const BUST_VIEWBOX = '0 0 20 22';
