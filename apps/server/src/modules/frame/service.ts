import {
  EMPTY_GUIDE,
  EMPTY_PROFILE,
  type Guide,
  type GuideState,
  guideSchema,
  type Profile,
  profileSchema,
  SEARCH_LIMITS,
  type SearchResults,
  searchRank,
} from '@ea/shared';
import type { Db } from '../../db/client';
import {
  guideProgress,
  readGuideValue,
  readProfileValue,
  searchableAgents,
  searchableAreas,
  searchableTasks,
  writeGuideValue,
  writeProfileValue,
} from './repository';

/**
 * The best `SEARCH_LIMITS.perGroup` of `items` for `query`: by how well the
 * text answers it (searchRank), then by `tieBreak`, then in the given order.
 * Comparing in JavaScript instead of SQL LIKE is what makes accents and case
 * not matter, and keeps `%` and `_` plain letters.
 */
function best<T>(
  items: readonly T[],
  textOf: (item: T) => string,
  query: string,
  tieBreak: (item: T) => number = () => 0,
): T[] {
  return items
    .flatMap((item, order) => {
      const rank = searchRank(textOf(item), query);
      return rank === null ? [] : [{ item, rank, tie: tieBreak(item), order }];
    })
    .sort((a, b) => a.rank - b.rank || a.tie - b.tie || a.order - b.order)
    .slice(0, SEARCH_LIMITS.perGroup)
    .map(({ item }) => item);
}

/** Global search (Phase 21, D3): agents, areas and tasks, by name or title. */
export function search(db: Db, query: string): SearchResults {
  return {
    agents: best(searchableAgents(db), (agent) => agent.name, query),
    areas: best(searchableAreas(db), (area) => area.name, query),
    // Tasks still under way come before the finished ones, newest first.
    tasks: best(
      searchableTasks(db),
      (task) => task.title,
      query,
      (task) => (task.state === 'open' || task.state === 'pending' ? 0 : 1),
    ),
  };
}

/** The user's card (D5). What is stored is checked again when read. */
export function readProfile(db: Db): Profile {
  const parsed = profileSchema.safeParse(readProfileValue(db));
  return parsed.success ? parsed.data : EMPTY_PROFILE;
}

export function saveProfile(db: Db, profile: Profile): Profile {
  writeProfileValue(db, profile);
  return profile;
}

/** The first steps put aside and the tips closed (Phase 32, D3), checked again when read. */
function storedGuide(db: Db): Guide {
  const parsed = guideSchema.safeParse(readGuideValue(db));
  return parsed.success ? parsed.data : EMPTY_GUIDE;
}

/** The choices, with the steps the data shows done. */
export function readGuide(db: Db): GuideState {
  return { ...storedGuide(db), done: guideProgress(db) };
}

export function saveGuide(db: Db, guide: Guide): GuideState {
  writeGuideValue(db, guide);
  return readGuide(db);
}
