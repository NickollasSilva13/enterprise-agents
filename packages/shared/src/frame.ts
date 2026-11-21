import { z } from 'zod';
import { appearanceSchema } from './appearance';
import { TASK_STATES } from './enums';

// The frame around every screen (Phase 21): the global search and the user's
// own card ("Você").

export const SEARCH_LIMITS = { query: 100, perGroup: 5 } as const;

export const searchQuerySchema = z.strictObject({
  q: z
    .string()
    .trim()
    .min(1, 'Digite o que procurar.')
    .max(SEARCH_LIMITS.query, `Use até ${SEARCH_LIMITS.query} caracteres.`),
});

/**
 * Text as the search compares it: no case and no accents, so "relatorio"
 * finds "Relatório". Shared so the screens the interface searches by itself
 * match the same way as what the server searches.
 */
export function searchKey(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/**
 * How well `text` answers `query`, or null when it does not: 0 when it starts
 * with the query, 1 when a word in it does, 2 when it only contains it.
 */
export function searchRank(text: string, query: string): number | null {
  const key = searchKey(text);
  const wanted = searchKey(query.trim());
  if (wanted === '') return null;
  if (key.startsWith(wanted)) return 0;
  const at = key.indexOf(wanted);
  if (at < 0) return null;
  return /[\p{L}\p{N}]/u.test(key[at - 1] ?? '') ? 2 : 1;
}

export const searchResultsSchema = z.object({
  agents: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      areaName: z.string().nullable(),
    }),
  ),
  areas: z.array(z.object({ id: z.string(), name: z.string(), description: z.string() })),
  tasks: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      areaName: z.string(),
      state: z.enum(TASK_STATES),
    }),
  ),
});
export type SearchResults = z.infer<typeof searchResultsSchema>;

export const PROFILE_LIMITS = { name: 40 } as const;

/** The user's card: both optional; without a name the card says "Você". */
export const profileSchema = z.strictObject({
  name: z
    .string()
    .trim()
    .max(PROFILE_LIMITS.name, `Use até ${PROFILE_LIMITS.name} caracteres.`)
    .transform((name) => (name === '' ? null : name))
    .nullable(),
  appearance: appearanceSchema.nullable(),
});
export type Profile = z.infer<typeof profileSchema>;

export const EMPTY_PROFILE: Profile = { name: null, appearance: null };
