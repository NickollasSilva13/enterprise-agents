import { guideSchema, profileSchema, searchQuerySchema } from '@ea/shared';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db/client';
import { parseInput } from '../../http/error-handler';
import { readGuide, readProfile, saveGuide, saveProfile, search } from './service';

// The frame of every screen (Phase 21): global search and the user's card.
export function registerFrameRoutes(app: FastifyInstance, deps: { db: Db }): void {
  const { db } = deps;

  app.get('/api/search', async (request) => {
    const { q } = parseInput(searchQuerySchema, request.query);
    return search(db, q);
  });

  app.get('/api/profile', async () => readProfile(db));

  app.put('/api/profile', async (request) =>
    saveProfile(db, parseInput(profileSchema, request.body)),
  );

  // The first steps and the tips (Phase 32).
  app.get('/api/guide', async () => readGuide(db));

  app.put('/api/guide', async (request) => saveGuide(db, parseInput(guideSchema, request.body)));
}
