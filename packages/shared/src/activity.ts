import { z } from 'zod';

// Recent activity of the office (Phase 29, D5): what the user would want to
// know happened, from the history the platform already keeps. Each entry
// says what it is; the interface writes the sentence. Names and titles come
// from people and models: untrusted, shown as text.

/** How many entries the feed brings, newest first. */
export const ACTIVITY_LIMIT = 20;

const id = z.string().min(1).max(40);
const at = z.string();

export const activityEntrySchema = z.discriminatedUnion('kind', [
  /** A task reached a "done" stage of its area. */
  z.object({
    kind: z.literal('task_done'),
    id,
    at,
    taskId: id,
    title: z.string(),
    areaName: z.string(),
    /** Who moved it there; null when the user did. */
    agentName: z.string().nullable(),
  }),
  /** A request between areas was delivered to the area that asked (Phase 17). */
  z.object({
    kind: z.literal('delivery'),
    id,
    at,
    taskId: id,
    title: z.string(),
    fromArea: z.string(),
    toArea: z.string(),
  }),
  /** A schedule created a task (Phase 19). */
  z.object({
    kind: z.literal('scheduled'),
    id,
    at,
    taskId: id,
    title: z.string(),
    areaName: z.string(),
  }),
  /** An agent asked to use a tool, or the user answered. */
  z.object({
    kind: z.literal('approval'),
    id,
    at,
    agentName: z.string(),
    toolTitle: z.string(),
    status: z.enum(['pending', 'approved', 'denied', 'cancelled']),
  }),
  /** A run ended in failure or ran out of time. */
  z.object({
    kind: z.literal('failure'),
    id,
    at,
    runId: id,
    agentName: z.string(),
    /** The task the run worked on, if any. */
    taskTitle: z.string().nullable(),
  }),
]);
export type ActivityEntry = z.infer<typeof activityEntrySchema>;

export const activityFeedSchema = z.object({
  entries: z.array(activityEntrySchema).max(ACTIVITY_LIMIT),
});
export type ActivityFeed = z.infer<typeof activityFeedSchema>;
