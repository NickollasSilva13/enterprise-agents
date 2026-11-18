import {
  areaFromTemplateSchema,
  areaLinkInputSchema,
  areaLinkUpdateSchema,
  requestRefuseSchema,
  taskRequestSchema,
  taskCommentSchema,
  taskCreateSchema,
  taskMoveSchema,
  taskUpdateSchema,
  templateExportSchema,
  templateFromAreaSchema,
  templateUpdateSchema,
  workflowUpdateSchema,
} from '@ea/shared';
import type { FastifyInstance } from 'fastify';
import { idParamSchema, parseInput } from '../../http/error-handler';
import {
  approveRequest,
  cancelTask,
  createAreaLink,
  deleteAreaLink,
  listAreaLinks,
  listRequests,
  refuseRequest,
  requestFromTask,
  updateAreaLink,
  commentTask,
  createAreaFromTemplate,
  createTask,
  editTask,
  getBoard,
  getTaskDetail,
  getWorkflow,
  listWaiting,
  moveTask,
  resumeTask,
  saveWorkflow,
  type TasksContext,
} from './service';
import {
  deleteTemplate,
  exportTemplate,
  importTemplate,
  listTemplates,
  saveTemplateFromArea,
  updateTemplate,
} from './templates';

// Areas are projects (Phase 16, D1): their workflow and board live under
// /api/areas/:id, and tasks under /api/tasks.
export function registerTaskRoutes(app: FastifyInstance, deps: { tasks: TasksContext }): void {
  const { tasks } = deps;
  const { db } = tasks;

  app.get('/api/workflow-templates', async () => ({ templates: listTemplates(db) }));

  // The user's own templates (Phase 18): saved from an area, or from a file.
  app.post('/api/workflow-templates', async (request, reply) => {
    const saved = saveTemplateFromArea(
      db,
      tasks.registry,
      parseInput(templateFromAreaSchema, request.body),
    );
    return reply.status(201).send(saved);
  });

  app.post('/api/workflow-templates/import', async (request, reply) => {
    const result = importTemplate(
      db,
      tasks.registry,
      parseInput(templateExportSchema, request.body),
    );
    return reply.status(201).send(result);
  });

  app.get('/api/workflow-templates/:id/export', async (request) => {
    const { id } = parseInput(idParamSchema, request.params);
    return exportTemplate(db, id);
  });

  app.patch('/api/workflow-templates/:id', async (request) => {
    const { id } = parseInput(idParamSchema, request.params);
    return updateTemplate(db, id, parseInput(templateUpdateSchema, request.body));
  });

  app.delete('/api/workflow-templates/:id', async (request, reply) => {
    const { id } = parseInput(idParamSchema, request.params);
    deleteTemplate(db, id);
    return reply.status(204).send();
  });

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

  // Requests between areas (Phase 17).
  app.get('/api/area-links', async () => listAreaLinks(db));

  app.post('/api/area-links', async (request, reply) => {
    const link = createAreaLink(db, parseInput(areaLinkInputSchema, request.body));
    return reply.status(201).send(link);
  });

  app.patch('/api/area-links/:id', async (request) => {
    const { id } = parseInput(idParamSchema, request.params);
    return updateAreaLink(db, id, parseInput(areaLinkUpdateSchema, request.body).requiresApproval);
  });

  app.delete('/api/area-links/:id', async (request, reply) => {
    const { id } = parseInput(idParamSchema, request.params);
    deleteAreaLink(db, id);
    return reply.status(204).send();
  });

  app.get('/api/requests', async () => listRequests(db));

  app.post('/api/tasks/:id/requests', async (request, reply) => {
    const { id } = parseInput(idParamSchema, request.params);
    const child = requestFromTask(tasks, id, parseInput(taskRequestSchema, request.body));
    return reply.status(201).send(child);
  });

  app.post('/api/tasks/:id/approve-request', async (request) => {
    const { id } = parseInput(idParamSchema, request.params);
    return approveRequest(tasks, id);
  });

  app.post('/api/tasks/:id/refuse-request', async (request) => {
    const { id } = parseInput(idParamSchema, request.params);
    return refuseRequest(tasks, id, parseInput(requestRefuseSchema, request.body).note);
  });
}
