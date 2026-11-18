import { scheduleInputSchema, scheduleUpdateSchema } from '@ea/shared';
import type { FastifyInstance } from 'fastify';
import { idParamSchema, parseInput } from '../../http/error-handler';
import type { TasksContext } from '../tasks/service';
import type { Scheduler } from './scheduler';
import {
  createSchedule,
  deleteSchedule,
  editSchedule,
  listSchedules,
  runScheduleNow,
} from './service';

// Scheduled tasks (Phase 19). Every change sets the clock again.
export function registerScheduleRoutes(
  app: FastifyInstance,
  deps: { tasks: TasksContext; scheduler: Scheduler },
): void {
  const { tasks, scheduler } = deps;
  const { db } = tasks;
  const idOf = (params: unknown) => parseInput(idParamSchema, params).id;

  app.get('/api/schedules', async () => ({ schedules: listSchedules(db) }));

  app.post('/api/schedules', async (request, reply) => {
    const created = createSchedule(db, parseInput(scheduleInputSchema, request.body));
    scheduler.refresh();
    return reply.status(201).send(created);
  });

  app.patch('/api/schedules/:id', async (request) => {
    const updated = editSchedule(
      db,
      idOf(request.params),
      parseInput(scheduleUpdateSchema, request.body),
    );
    scheduler.refresh();
    return updated;
  });

  app.delete('/api/schedules/:id', async (request, reply) => {
    deleteSchedule(db, idOf(request.params));
    scheduler.refresh();
    return reply.status(204).send();
  });

  // "Criar agora": a task now, without moving the next time.
  app.post('/api/schedules/:id/run', async (request) =>
    runScheduleNow(tasks, idOf(request.params)),
  );
}
