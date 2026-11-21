import { z } from 'zod';

// The indicators of the office (Phase 30, D1): four figures computed from the
// history on every read, each with a daily series of the last days for its
// small chart. Days are those of this machine's clock (D2).

/** How many days the series and the "last days" figures cover. */
export const INDICATOR_DAYS = 7;

const count = z.number().int().nonnegative();
/** One value per day, oldest first; null for a day with nothing to measure. */
const series = z.array(z.number().nullable()).length(INDICATOR_DAYS);

export const indicatorsSchema = z.object({
  /** Tasks that entered a "done" stage of their area today, and yesterday. */
  doneToday: z.object({ today: count, yesterday: count, series }),
  /** Mean time from creation to completion of the tasks completed in the last days, in ms. */
  meanTaskTime: z.object({ ms: z.number().nonnegative().nullable(), tasks: count, series }),
  /** Share of the runs that ended in the last days without failing (0 to 1). */
  runsWithoutFailure: z.object({
    rate: z.number().min(0).max(1).nullable(),
    runs: count,
    series,
  }),
  /** Tasks completed in the last days, and in the days before them. */
  doneThisWeek: z.object({ week: count, previousWeek: count, series }),
  generatedAt: z.string(),
});
export type Indicators = z.infer<typeof indicatorsSchema>;
