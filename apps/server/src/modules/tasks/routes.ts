import {
  areaFromTemplateSchema,
  taskCommentSchema,
  taskCreateSchema,
  taskMoveSchema,
  taskUpdateSchema,
  workflowUpdateSchema,
} from '@ea/shared';
import type { FastifyInstance } from 'fastify';
import { idParamSchema, parseInput } from '../../http/error-handler';
import {
  cancelTask,
  commentTask,
  createAreaFromTemplate,
  createTask,
  editTask,
  getBoard,
  getTaskDetail,
  getWorkflow,
  listTemplates,
  listWaiting,
  moveTask,
  resumeTask,
  saveWorkflow,
  type TasksContext,
} from './service';

// Areas are projects (Phase 16, D1): their workflow and board live under
// /api/areas/:id, and tasks under /api/tasks.
export function registerTaskRoutes(app: FastifyInstance, deps: { tasks: TasksContext }): void {
  const { tasks } = deps;
  const { db } = tasks;

  app.get('/api/workflow-templates', async () => ({ templates: listTemplates() }));

  app.post('/api/areas/from-template', async (request, reply) => {
    const created = createAreaFromTemplate(tasks, parseInput(areaFromTemplateSchema, request.body));
    return reply.status(201).send(created);
  });

  app.get('/api/areas/:id/workflow', async (request) => {
    const { id } = parseInput(idParamSchema, request.params);
    return getWorkflow(db, id);
  });

  app.put('/api/areas/:id/workflow', async (request) => {
    const { id } = parseInput(idParamSchema, request.params);
    return saveWorkflow(tasks, id, parseInput(workflowUpdateSchema, request.body));
  });

  app.get('/api/areas/:id/board', async (request) => {
    const { id } = parseInput(idParamSchema, request.params);
    return getBoard(db, id);
  });

  app.post('/api/areas/:id/tasks', async (request, reply) => {
    const { id } = parseInput(idParamSchema, request.params);
    const task = createTask(tasks, id, parseInput(taskCreateSchema, request.body));
    return reply.status(201).send(task);
  });

  // Before /api/tasks/:id, so "waiting" is not read as an id.
  app.get('/api/tasks/waiting', async () => listWaiting(db));

  app.get('/api/tasks/:id', async (request) => {
    const { id } = parseInput(idParamSchema, request.params);
    return getTaskDetail(db, id);
  });

  app.patch('/api/tasks/:id', async (request) => {
    const { id } = parseInput(idParamSchema, request.params);
    return editTask(tasks, id, parseInput(taskUpdateSchema, request.body));
  });

  app.post('/api/tasks/:id/move', async (request) => {
    const { id } = parseInput(idParamSchema, request.params);
    const input = parseInput(taskMoveSchema, request.body);
    return moveTask(tasks, id, input.toStageId, input.note);
  });

  app.post('/api/tasks/:id/comments', async (request) => {
    const { id } = parseInput(idParamSchema, request.params);
    return commentTask(tasks, id, parseInput(taskCommentSchema, request.body).text);
  });

  app.post('/api/tasks/:id/cancel', async (request) => {
    const { id } = parseInput(idParamSchema, request.params);
    return cancelTask(tasks, id);
  });

  app.post('/api/tasks/:id/resume', async (request) => {
    const { id } = parseInput(idParamSchema, request.params);
    return resumeTask(tasks, id);
  });
}
