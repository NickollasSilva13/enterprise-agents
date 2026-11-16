import {
  nextOccurrence,
  SCHEDULE_LIMITS,
  type Schedule,
  type ScheduleInput,
  type ScheduleOutcome,
  type ScheduleRule,
  scheduleRuleSchema,
  type ScheduleUpdate,
} from '@ea/shared';
import { AppError, ConflictError, NotFoundError, ValidationError } from '../../core/errors';
import type { Db } from '../../db/client';
import { newId } from '../../db/ids';
import { recordAudit } from '../audit/service';
import { findArea } from '../tasks/repository';
import { createTask, type TasksContext } from '../tasks/service';
import {
  countSchedules,
  deleteScheduleRow,
  dueSchedules,
  findSchedule,
  insertSchedule,
  type ScheduleRow,
  scheduleRows,
  taskBrief,
  updateSchedule,
} from './repository';

// Scheduled tasks (Phase 19). A schedule creates a task on its area's board
// when due (D1); only the user makes schedules, never an agent (D4). The
// clock that calls `fireDue` is in scheduler.ts.

const toIso = (date: Date | null) => (date ? date.toISOString() : null);

const formatLocal = (date: Date) =>
  new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);

/** A stored rule read back through the schema: what is stored is never trusted blindly. */
function ruleOf(row: ScheduleRow): ScheduleRule | null {
  const parsed = scheduleRuleSchema.safeParse(row.rule);
  return parsed.success ? parsed.data : null;
}

function toSchedule(db: Db, row: ScheduleRow, areaName: string): Schedule | null {
  const rule = ruleOf(row);
  if (!rule) return null;
  return {
    id: row.id,
    areaId: row.projectId,
    areaName,
    title: row.title,
    description: row.description,
    acceptance: row.acceptance,
    priority: row.priority,
    rule,
    enabled: row.enabled,
    nextRunAt: row.nextRunAt,
    lastRunAt: row.lastRunAt,
    lastOutcome: row.lastOutcome,
    lastTaskId: row.lastTaskId,
    lastTaskTitle: row.lastTaskId ? (taskBrief(db, row.lastTaskId)?.title ?? null) : null,
    createdAt: row.createdAt,
  };
}

export function listSchedules(db: Db): Schedule[] {
  return scheduleRows(db).flatMap(
    ({ schedule, areaName }) => toSchedule(db, schedule, areaName) ?? [],
  );
}

function scheduleOf(db: Db, scheduleId: string): Schedule {
  const row = findSchedule(db, scheduleId);
  const area = row ? findArea(db, row.projectId) : undefined;
  const schedule = row && area ? toSchedule(db, row, area.name) : null;
  if (!schedule) throw new NotFoundError('Agendamento não encontrado.');
  return schedule;
}

/** When an enabled rule is due next; a single time already past is refused. */
function nextFor(rule: ScheduleRule, enabled: boolean, now: Date): string | null {
  if (!enabled) return null;
  const next = nextOccurrence(rule, now);
  if (!next) {
    throw new ValidationError([{ path: 'rule.at', message: 'Escolha um horário no futuro.' }]);
  }
  return next.toISOString();
}

export function createSchedule(db: Db, input: ScheduleInput, now = new Date()): Schedule {
  if (!findArea(db, input.areaId)) {
    throw new ValidationError([{ path: 'areaId', message: 'Escolha uma área que existe.' }]);
  }
  if (countSchedules(db) >= SCHEDULE_LIMITS.max) {
    throw new ConflictError(
      'too_many_schedules',
      `Você já tem ${SCHEDULE_LIMITS.max} agendamentos. Exclua algum antes.`,
    );
  }
  const id = newId();
  insertSchedule(db, {
    id,
    projectId: input.areaId,
    title: input.title,
    description: input.description,
    acceptance: input.acceptance,
    priority: input.priority,
    rule: input.rule,
    enabled: input.enabled,
    nextRunAt: nextFor(input.rule, input.enabled, now),
  });
  recordAudit(db, {
    actor: 'user',
    action: 'schedule.created',
    target: id,
    details: { area: input.areaId, kind: input.rule.kind, enabled: input.enabled },
  });
  return scheduleOf(db, id);
}

/**
 * Changing the rule, or resuming, counts from now: times missed while
 * paused are not made up for (D3 is about the server being off).
 */
export function editSchedule(
  db: Db,
  scheduleId: string,
  patch: ScheduleUpdate,
  now = new Date(),
): Schedule {
  const row = findSchedule(db, scheduleId);
  if (!row) throw new NotFoundError('Agendamento não encontrado.');
  const rule = patch.rule ?? ruleOf(row);
  if (!rule) throw new ConflictError('broken_schedule', 'Este agendamento está danificado.');
  const enabled = patch.enabled ?? row.enabled;
  const timing =
    patch.rule !== undefined || patch.enabled !== undefined
      ? { nextRunAt: nextFor(rule, enabled, now) }
      : {};
  updateSchedule(db, row.id, { ...patch, ...timing });
  recordAudit(db, {
    actor: 'user',
    action: 'schedule.updated',
    target: row.id,
    details: { fields: Object.keys(patch) },
  });
  return scheduleOf(db, row.id);
}

export function deleteSchedule(db: Db, scheduleId: string): void {
  const row = findSchedule(db, scheduleId);
  if (!row) throw new NotFoundError('Agendamento não encontrado.');
  deleteScheduleRow(db, row.id);
  recordAudit(db, {
    actor: 'user',
    action: 'schedule.deleted',
    target: row.id,
    details: { title: row.title },
  });
}

/**
 * One time of a schedule: a task on the board, unless the one it made last
 * is still open (D4). `due` is the time it was due, for the history; null
 * when the user asked for it now.
 */
function fire(
  ctx: TasksContext,
  row: ScheduleRow,
  now: Date,
  due: Date | null,
): { outcome: ScheduleOutcome; taskId: string | null } {
  const previous = row.lastTaskId ? taskBrief(ctx.db, row.lastTaskId) : undefined;
  if (previous && (previous.state === 'open' || previous.state === 'pending')) {
    return { outcome: 'skipped', taskId: previous.id };
  }
  let note: string;
  if (due === null) {
    note = `Criada pelo agendamento "${row.title}", a seu pedido.`;
  } else {
    note = `Criada pelo agendamento "${row.title}", marcado para ${formatLocal(due)}.`;
    if (now.getTime() - due.getTime() > SCHEDULE_LIMITS.lateAfterMs) {
      note += ` A plataforma estava desligada nesse horário; criada às ${formatLocal(now)}.`;
    }
  }
  try {
    const task = createTask(
      ctx,
      row.projectId,
      {
        title: row.title,
        description: row.description,
        acceptance: row.acceptance,
        priority: row.priority,
      },
      { scheduleId: row.id, actor: due === null ? 'user' : 'system', note },
    );
    return { outcome: 'created', taskId: task.id };
  } catch (error) {
    // The area lost its flow, for instance. Recorded on the schedule; the
    // clock goes on with the others.
    if (error instanceof AppError) return { outcome: 'failed', taskId: row.lastTaskId };
    throw error;
  }
}

function record(
  ctx: TasksContext,
  row: ScheduleRow,
  now: Date,
  result: { outcome: ScheduleOutcome; taskId: string | null },
  manual: boolean,
): void {
  updateSchedule(ctx.db, row.id, {
    lastRunAt: now.toISOString(),
    lastOutcome: result.outcome,
    lastTaskId: result.taskId,
  });
  recordAudit(ctx.db, {
    actor: manual ? 'user' : 'system',
    action: manual ? 'schedule.run_now' : 'schedule.fired',
    target: row.id,
    details: { outcome: result.outcome, task: result.taskId },
  });
}

/** "Criar agora": a task now, without moving the next time. */
export function runScheduleNow(ctx: TasksContext, scheduleId: string, now = new Date()): Schedule {
  const row = findSchedule(ctx.db, scheduleId);
  if (!row) throw new NotFoundError('Agendamento não encontrado.');
  record(ctx, row, now, fire(ctx, row, now, null), true);
  return scheduleOf(ctx.db, row.id);
}

/**
 * Every schedule whose time has come. However many times were missed while
 * the server was off, each schedule makes one task, and its next time counts
 * from now (D3). Returns how many schedules were due.
 */
export function fireDue(ctx: TasksContext, now = new Date()): number {
  const due = dueSchedules(ctx.db, now.toISOString());
  for (const row of due) {
    const rule = ruleOf(row);
    const nextRunAt = rule ? toIso(nextOccurrence(rule, now)) : null;
    // The next time is written first: whatever happens below, this time is
    // not taken again.
    updateSchedule(ctx.db, row.id, { nextRunAt });
    if (!rule || row.nextRunAt === null) continue;
    record(ctx, row, now, fire(ctx, row, now, new Date(row.nextRunAt)), false);
  }
  return due.length;
}
