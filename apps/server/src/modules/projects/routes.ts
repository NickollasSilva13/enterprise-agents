import { projectCreateSchema, projectUpdateSchema } from '@ea/shared';
import type { FastifyInstance } from 'fastify';
import type { Database } from '../../db/client';
import { idParamSchema, parseInput } from '../../http/error-handler';
import { createProject, deleteProject, listProjects, updateProject } from './service';

export function registerProjectRoutes(app: FastifyInstance, deps: { database: Database }): void {
  const { db } = deps.database;

  app.get('/api/projects', async () => ({ projects: listProjects(db) }));

  app.post('/api/projects', async (request, reply) => {
    const project = createProject(db, parseInput(projectCreateSchema, request.body));
    return reply.status(201).send(project);
  });

  app.patch('/api/projects/:id', async (request) => {
    const { id } = parseInput(idParamSchema, request.params);
    return updateProject(db, id, parseInput(projectUpdateSchema, request.body));
  });

  app.delete('/api/projects/:id', async (request, reply) => {
    const { id } = parseInput(idParamSchema, request.params);
    deleteProject(db, id);
    return reply.status(204).send();
  });
}
