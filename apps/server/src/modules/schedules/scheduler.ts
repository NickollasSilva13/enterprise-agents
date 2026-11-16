import type { TasksContext } from '../tasks/service';
import { nextDueAt } from './repository';
import { fireDue } from './service';

// The clock of scheduled tasks (Phase 19, D5): one timer, set for the next
// schedule due. It never waits more than an hour at a time, so a clock
// changed by hand or a machine waking from sleep is noticed soon.

const MAX_WAIT_MS = 60 * 60 * 1000;

export interface Scheduler {
  /** Fires what is already due (the server may have been off) and sets the timer. */
  start(): void;
  /** Sets the timer again after a schedule changed. */
  refresh(): void;
  stop(): void;
}

export function createScheduler(
  ctx: TasksContext,
  logWarning: (context: Record<string, unknown>, message: string) => void,
  now: () => Date = () => new Date(),
): Scheduler {
  let timer: NodeJS.Timeout | undefined;
  let running = false;

  const arm = () => {
    clearTimeout(timer);
    timer = undefined;
    if (!running) return;
    const next = nextDueAt(ctx.db);
    if (next === null) return;
    const wait = Math.min(Math.max(new Date(next).getTime() - now().getTime(), 0), MAX_WAIT_MS);
    timer = setTimeout(tick, wait);
    // The timer alone never keeps the process alive.
    timer.unref();
  };

  const tick = () => {
    try {
      fireDue(ctx, now());
    } catch (error) {
      logWarning({ err: error }, 'Falha ao criar as tarefas agendadas.');
    }
    arm();
  };

  return {
    start() {
      running = true;
      tick();
    },
    refresh: arm,
    stop() {
      running = false;
      clearTimeout(timer);
      timer = undefined;
    },
  };
}
