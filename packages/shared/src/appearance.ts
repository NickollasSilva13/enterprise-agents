import { z } from 'zod';

// How an agent looks in the office and in its avatar (Phases 14 and 15). Every option
// is a name from a short list, never a free color: the drawing maps each name
// to its palette, so nothing the user sends ends up in an attribute verbatim.

export const CHARACTER_KINDS = ['person', 'robot'] as const;
export const SKIN_TONES = ['porcelain', 'light', 'tan', 'olive', 'brown', 'deep'] as const;
export const HAIR_STYLES = [
  'short',
  'long',
  'curly',
  'bun',
  'spiky',
  'shaved',
  'afro',
  'ponytail',
  'wavy',
] as const;
export const HAIR_COLORS = [
  'black',
  'brown',
  'auburn',
  'blonde',
  'gray',
  'blue',
  'pink',
  'green',
] as const;
export const OUTFITS = ['tshirt', 'hoodie', 'shirt'] as const;
export const OUTFIT_COLORS = [
  'violet',
  'blue',
  'teal',
  'green',
  'yellow',
  'orange',
  'red',
  'pink',
  'gray',
  'black',
] as const;
export const PANTS_COLORS = ['denim', 'black', 'khaki', 'gray'] as const;
export const ACCESSORIES = ['none', 'glasses', 'headset', 'cap'] as const;
// Phase 15: more detail. Each has a default, so looks saved before still parse.
export const EYE_COLORS = ['brown', 'black', 'blue', 'green', 'hazel', 'gray'] as const;
export const FACIAL_HAIR = ['none', 'stubble', 'mustache', 'beard'] as const;
export const SHOE_COLORS = ['black', 'white', 'brown', 'red', 'blue'] as const;
export const PATTERNS = ['plain', 'stripes', 'badge'] as const;

export type CharacterKind = (typeof CHARACTER_KINDS)[number];
export type SkinTone = (typeof SKIN_TONES)[number];
export type HairStyle = (typeof HAIR_STYLES)[number];
export type HairColor = (typeof HAIR_COLORS)[number];
export type Outfit = (typeof OUTFITS)[number];
export type OutfitColor = (typeof OUTFIT_COLORS)[number];
export type PantsColor = (typeof PANTS_COLORS)[number];
export type Accessory = (typeof ACCESSORIES)[number];
export type EyeColor = (typeof EYE_COLORS)[number];
export type FacialHair = (typeof FACIAL_HAIR)[number];
export type ShoeColor = (typeof SHOE_COLORS)[number];
export type Pattern = (typeof PATTERNS)[number];

/** Names shown in the appearance form. */
export const APPEARANCE_LABELS = {
  kind: { person: 'Pessoa', robot: 'Robô' },
  skin: {
    porcelain: 'Muito clara',
    light: 'Clara',
    tan: 'Bronzeada',
    olive: 'Morena clara',
    brown: 'Morena',
    deep: 'Escura',
  },
  hair: {
    short: 'Curto',
    long: 'Longo',
    curly: 'Cacheado',
    bun: 'Coque',
    spiky: 'Espetado',
    shaved: 'Raspado',
    afro: 'Black power',
    ponytail: 'Rabo de cavalo',
    wavy: 'Ondulado',
  },
  hairColor: {
    black: 'Preto',
    brown: 'Castanho',
    auburn: 'Ruivo',
    blonde: 'Loiro',
    gray: 'Grisalho',
    blue: 'Azul',
    pink: 'Rosa',
    green: 'Verde',
  },
  outfit: { tshirt: 'Camiseta', hoodie: 'Moletom', shirt: 'Camisa' },
  outfitColor: {
    violet: 'Violeta',
    blue: 'Azul',
    teal: 'Turquesa',
    green: 'Verde',
    yellow: 'Amarelo',
    orange: 'Laranja',
    red: 'Vermelho',
    pink: 'Rosa',
    gray: 'Cinza',
    black: 'Preto',
  },
  pants: { denim: 'Jeans', black: 'Preta', khaki: 'Cáqui', gray: 'Cinza' },
  accessory: { none: 'Nenhum', glasses: 'Óculos', headset: 'Fone', cap: 'Boné' },
  eyes: {
    brown: 'Castanhos',
    black: 'Pretos',
    blue: 'Azuis',
    green: 'Verdes',
    hazel: 'Mel',
    gray: 'Cinzentos',
  },
  facialHair: { none: 'Nenhuma', stubble: 'Por fazer', mustache: 'Bigode', beard: 'Barba' },
  shoes: { black: 'Pretos', white: 'Brancos', brown: 'Marrons', red: 'Vermelhos', blue: 'Azuis' },
  pattern: { plain: 'Lisa', stripes: 'Listrada', badge: 'Com crachá' },
} as const;

export const appearanceSchema = z.strictObject({
  kind: z.enum(CHARACTER_KINDS),
  skin: z.enum(SKIN_TONES),
  hair: z.enum(HAIR_STYLES),
  hairColor: z.enum(HAIR_COLORS),
  outfit: z.enum(OUTFITS),
  outfitColor: z.enum(OUTFIT_COLORS),
  pants: z.enum(PANTS_COLORS),
  accessory: z.enum(ACCESSORIES),
  eyes: z.enum(EYE_COLORS).default('brown'),
  facialHair: z.enum(FACIAL_HAIR).default('none'),
  shoes: z.enum(SHOE_COLORS).default('black'),
  pattern: z.enum(PATTERNS).default('plain'),
});
export type Appearance = z.infer<typeof appearanceSchema>;

/** Small stable hash (FNV-1a) so the same text always gives the same number. */
export function hashText(text: string): number {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
}

const pick = <T>(list: readonly T[], seed: number): T => list[seed % list.length] as T;

/**
 * The look of an agent that has none chosen: a robot drawn from its id, as
 * every agent looked before Phase 14, so nobody changes face on the update.
 */
export function defaultAppearance(agentId: string): Appearance {
  const seed = hashText(agentId);
  return {
    kind: 'robot',
    skin: pick(SKIN_TONES, seed >>> 2),
    hair: pick(HAIR_STYLES, seed >>> 6),
    hairColor: pick(HAIR_COLORS, seed >>> 9),
    outfit: pick(OUTFITS, seed >>> 12),
    outfitColor: pick(OUTFIT_COLORS, seed >>> 15),
    pants: pick(PANTS_COLORS, seed >>> 19),
    accessory: pick(ACCESSORIES, seed >>> 22),
    eyes: pick(EYE_COLORS, seed >>> 24),
    facialHair: 'none',
    shoes: pick(SHOE_COLORS, seed >>> 26),
    pattern: 'plain',
  };
}

/** A person with every option drawn from `random` (0 to 1), for "Sortear". */
export function randomAppearance(random: () => number): Appearance {
  const choose = <T>(list: readonly T[]): T =>
    list[Math.min(list.length - 1, Math.floor(random() * list.length))] as T;
  return {
    kind: 'person',
    skin: choose(SKIN_TONES),
    hair: choose(HAIR_STYLES),
    hairColor: choose(HAIR_COLORS),
    outfit: choose(OUTFITS),
    outfitColor: choose(OUTFIT_COLORS),
    pants: choose(PANTS_COLORS),
    accessory: choose(ACCESSORIES),
    eyes: choose(EYE_COLORS),
    // Most people drawn at random are clean-shaven.
    facialHair: random() < 0.7 ? 'none' : choose(FACIAL_HAIR),
    shoes: choose(SHOE_COLORS),
    pattern: choose(PATTERNS),
  };
}
