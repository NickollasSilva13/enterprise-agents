import { z } from 'zod';

/**
 * The tips of Phase 32 (D5), each shown once where it helps until the user
 * closes it. A new tip gets its id here and its text where it is shown.
 */
export const TIP_IDS = [
  'office-pick',
  'board-move',
  'tools-locked',
  'approvals-wait',
  'schedules-no-repeat',
] as const;
export type TipId = (typeof TIP_IDS)[number];

/**
 * What the user chose about the first steps (D2, D3): whether the checklist
 * was put aside and which tips were closed. Whether each step is done is never
 * stored: it is read from the data.
 */
export const guideSchema = z.strictObject({
  skipped: z.boolean(),
  dismissedTips: z
    .array(z.enum(TIP_IDS))
    .max(TIP_IDS.length)
    .transform((tips) => [...new Set(tips)]),
});
export type Guide = z.infer<typeof guideSchema>;

export const EMPTY_GUIDE: Guide = { skipped: false, dismissedTips: [] };

/** The steps of the first-use checklist (D1), in order. */
export const GUIDE_STEPS = ['provider', 'model', 'area', 'task'] as const;
export type GuideStep = (typeof GUIDE_STEPS)[number];

/** What the server answers: the choices above, and which steps the data shows done. */
export const guideStateSchema = z.object({
  skipped: z.boolean(),
  dismissedTips: z.array(z.enum(TIP_IDS)),
  done: z.object({
    provider: z.boolean(),
    model: z.boolean(),
    area: z.boolean(),
    task: z.boolean(),
  }),
});
export type GuideState = z.infer<typeof guideStateSchema>;
