import type { EyeColor, HairColor, OutfitColor, PantsColor, ShoeColor, SkinTone } from '@ea/shared';

// Colours of the pixel art. Every option a user can pick for an agent is a
// name in `@ea/shared`; only here does a name become a colour.

/** Light and shadow of each option. */
type Shade = readonly [light: string, shadow: string];

export const SKIN: Record<SkinTone, Shade> = {
  porcelain: ['#f8dfcb', '#e6c0a6'],
  light: ['#f0c9a4', '#d8a780'],
  tan: ['#dba174', '#be8358'],
  olive: ['#c08a5c', '#a06f45'],
  brown: ['#8f5b3b', '#74472d'],
  deep: ['#5e3b27', '#472a1b'],
};

export const HAIR: Record<HairColor, Shade> = {
  black: ['#2b2533', '#18141e'],
  brown: ['#5d3d27', '#432a1a'],
  auburn: ['#a8492b', '#7f331d'],
  blonde: ['#ecc66a', '#c9a148'],
  gray: ['#c3c3cf', '#9393a3'],
  blue: ['#5a84ff', '#3b5ccc'],
  pink: ['#ff86ba', '#da5f96'],
  green: ['#4cc68e', '#309a6b'],
};

export const OUTFIT: Record<OutfitColor, Shade> = {
  violet: ['#8064ff', '#5d42d8'],
  blue: ['#3f8cff', '#2b67c7'],
  teal: ['#2cb7a7', '#1e897d'],
  green: ['#5ec46d', '#3f9a4e'],
  yellow: ['#f3c94e', '#cfa230'],
  orange: ['#ff9b4f', '#d9762f'],
  red: ['#ef5b5b', '#c43f3f'],
  pink: ['#f27bb9', '#cc5a95'],
  gray: ['#a0a8ba', '#78819b'],
  black: ['#36324a', '#221f30'],
};

export const PANTS: Record<PantsColor, Shade> = {
  denim: ['#3d5d9c', '#2c4577'],
  black: ['#2a2733', '#18161f'],
  khaki: ['#c4aa7a', '#a08a5e'],
  gray: ['#717588', '#575a6a'],
};

export const EYES: Record<EyeColor, Shade> = {
  brown: ['#6b3e1f', '#3d2312'],
  black: ['#26202e', '#120f17'],
  blue: ['#3f86e0', '#1f4f99'],
  green: ['#3f9a55', '#22663a'],
  hazel: ['#a97a2c', '#6e4c16'],
  gray: ['#8b93a6', '#5b6275'],
};

export const SHOES: Record<ShoeColor, Shade> = {
  black: ['#2a2233', '#16121c'],
  white: ['#eeeaf6', '#bdb6cf'],
  brown: ['#6e4429', '#4b2d1a'],
  red: ['#d94848', '#9c2c2c'],
  blue: ['#3d63c9', '#273f8a'],
};

/** Highlight of the hair and of the skin: a light pixel or two, as 16-bit art does. */
export const lighten = (hex: string, amount = 0.25): string => {
  const value = Number.parseInt(hex.slice(1), 16);
  const channel = (shift: number) => {
    const c = (value >> shift) & 0xff;
    return Math.round(c + (255 - c) * amount)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(16)}${channel(8)}${channel(0)}`;
};

/** Fixed colours of the drawing. */
export const INK = '#1d1530';
export const SHOE = '#2a2233';
export const PAPER = '#f4f1ff';
export const MOUTH = '#b5524a';
export const LENS = '#bfe3ff';
export const GEAR = '#3a3350';
