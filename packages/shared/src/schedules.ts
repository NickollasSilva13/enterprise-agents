import { z } from 'zod';
import { TASK_PRIORITIES } from './enums';
import { taskCreateSchema } from './tasks';

// Scheduled tasks (Phase 19). A schedule creates a task on an area's board at
// set times; the task then follows the area's flow like any other (D1).
// Times are the local time of this machine (D2).

export const SCHEDULE_KINDS = ['once', 'daily', 'weekly', 'monthly'] as const;
export type ScheduleKind = (typeof SCHEDULE_KINDS)[number];

/** What happened the last time a schedule was due. */
export const SCHEDULE_OUTCOMES = ['created', 'skipped', 'failed'] as const;
export type ScheduleOutcome = (typeof SCHEDULE_OUTCOMES)[number];

export const SCHEDULE_LIMITS = {
  /** Schedules in all (D4). */
  max: 50,
  /** A due time this much in the past makes the task "late" in its history (D3). */
  lateAfterMs: 60_000,
} as const;

const id = z.string().min(1).max(40);

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Informe a hora no formato HH:MM.');

const localDateTime = z
  .string()
  .regex(
    /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d$/,
    'Informe a data e a hora.',
  );

export const scheduleRuleSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('once'), at: localDateTime }),
  z.strictObject({ kind: z.literal('daily'), time }),
  z.strictObject({
    kind: z.literal('weekly'),
    /** 0 is Sunday, as in `Date.getDay()`. */
    days: z
      .array(z.number().int().min(0).max(6))
      .min(1, 'Escolha pelo menos um dia da semana.')
      .max(7)
      .refine((days) => new Set(days).size === days.length, 'Há um dia repetido.'),
    time,
  }),
  z.strictObject({
    kind: z.literal('monthly'),
    /** In a month without this day, the last day of the month. */
    day: z.number().int().min(1, 'Escolha um dia de 1 a 31.').max(31, 'Escolha um dia de 1 a 31.'),
    time,
  }),
]);
export type ScheduleRule = z.infer<typeof scheduleRuleSchema>;

const clock = (value: string): [number, number] => {
  const [hours = 0, minutes = 0] = value.split(':').map(Number);
  return [hours, minutes];
};

const daysIn = (year: number, month: number) => new Date(year, month + 1, 0).getDate();

/**
 * The first time the rule is due strictly after `after`, in local time, or
 * null when it never is again (a single time already past). Pure: the server
 * decides with it, and the tests check it without a clock.
 */
export function nextOccurrence(rule: ScheduleRule, after: Date): Date | null {
  if (rule.kind === 'once') {
    const [date = '', hhmm = ''] = rule.at.split('T');
    const [year = 0, month = 1, day = 1] = date.split('-').map(Number);
    const [hours, minutes] = clock(hhmm);
    const at = new Date(year, month - 1, day, hours, minutes);
    return at.getTime() > after.getTime() ? at : null;
  }
  const [hours, minutes] = clock(rule.time);
  if (rule.kind === 'monthly') {
    for (let offset = 0; offset < 3; offset += 1) {
      const year = after.getFullYear();
      const month = after.getMonth() + offset;
      const first = new Date(year, month, 1);
      const day = Math.min(rule.day, daysIn(first.getFullYear(), first.getMonth()));
      const candidate = new Date(first.getFullYear(), first.getMonth(), day, hours, minutes);
      if (candidate.getTime() > after.getTime()) return candidate;
    }
    return null;
  }
  // Daily and weekly: the next 8 days always hold one.
  for (let offset = 0; offset <= 8; offset += 1) {
    const candidate = new Date(
      after.getFullYear(),
      after.getMonth(),
      after.getDate() + offset,
      hours,
      minutes,
    );
    if (candidate.getTime() <= after.getTime()) continue;
    if (rule.kind === 'daily' || rule.days.includes(candidate.getDay())) return candidate;
  }
  return null;
}

const taskFields = taskCreateSchema.pick({
  title: true,
  description: true,
  acceptance: true,
  priority: true,
});

export const scheduleInputSchema = taskFields.extend({
  areaId: id,
  rule: scheduleRuleSchema,
  enabled: z.boolean().default(true),
});
export type ScheduleInput = z.infer<typeof scheduleInputSchema>;
export type ScheduleInputValue = z.input<typeof scheduleInputSchema>;

/** The area of a schedule does not change: make another one instead. */
export const scheduleUpdateSchema = z
  .strictObject({
    title: taskFields.shape.title.optional(),
    description: taskFields.shape.description.unwrap().optional(),
    acceptance: taskFields.shape.acceptance.unwrap().optional(),
    priority: z.enum(TASK_PRIORITIES).optional(),
    rule: scheduleRuleSchema.optional(),
    enabled: z.boolean().optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, 'Nada para alterar.');
export type ScheduleUpdate = z.infer<typeof scheduleUpdateSchema>;

export const scheduleSchema = z.object({
  id,
  areaId: id,
  areaName: z.string(),
  title: z.string(),
  description: z.string(),
  acceptance: z.string(),
  priority: z.enum(TASK_PRIORITIES),
  rule: scheduleRuleSchema,
  enabled: z.boolean(),
  /** Null while paused, or when a single time has passed. */
  nextRunAt: z.string().nullable(),
  lastRunAt: z.string().nullable(),
  lastOutcome: z.enum(SCHEDULE_OUTCOMES).nullable(),
  /** The task created last, or the one still open when a time was skipped. */
  lastTaskId: id.nullable(),
  lastTaskTitle: z.string().nullable(),
  createdAt: z.string(),
});
export type Schedule = z.infer<typeof scheduleSchema>;

export const schedulesSchema = z.object({ schedules: z.array(scheduleSchema) });
