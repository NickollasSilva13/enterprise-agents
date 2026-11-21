import { desc, eq, isNull } from 'drizzle-orm';
import type { Db } from '../../db/client';
import {
  agents,
  models,
  projects,
  providers,
  settings,
  tasks,
  workflowStages,
} from '../../db/schema';

// Reads behind the frame of every screen (Phase 21): what the global search
// looks through, and the user's card kept in `settings`.

export function searchableAgents(db: Db) {
  return (
    db
      .select({
        id: agents.id,
        name: agents.name,
        description: agents.description,
        areaName: projects.name,
      })
      .from(agents)
      .leftJoin(projects, eq(agents.projectId, projects.id))
      // A deleted agent is gone from every list.
      .where(isNull(agents.deletedAt))
      .all()
  );
}

export function searchableAreas(db: Db) {
  return db
    .select({ id: projects.id, name: projects.name, description: projects.description })
    .from(projects)
    .all();
}

/** Every task, newest first: only the columns the search shows. */
export function searchableTasks(db: Db) {
  return db
    .select({ id: tasks.id, title: tasks.title, state: tasks.state, areaName: projects.name })
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .orderBy(desc(tasks.id))
    .all();
}

const PROFILE_KEY = 'profile';
/** The first steps and the tips (Phase 32). */
const GUIDE_KEY = 'guide';

function readSetting(db: Db, key: string): unknown {
  return db.select().from(settings).where(eq(settings.key, key)).get()?.value ?? null;
}

function writeSetting(db: Db, key: string, value: unknown): void {
  const updatedAt = new Date().toISOString();
  db.insert(settings)
    .values({ key, value, updatedAt })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt } })
    .run();
}

export const readProfileValue = (db: Db): unknown => readSetting(db, PROFILE_KEY);
export const writeProfileValue = (db: Db, value: unknown): void =>
  writeSetting(db, PROFILE_KEY, value);
/** Which first steps the data shows done (Phase 32, D1): nothing about them is stored. */
export function guideProgress(db: Db) {
  return {
    provider: db.select({ id: providers.id }).from(providers).limit(1).get() !== undefined,
    model:
      db.select({ id: models.id }).from(models).where(eq(models.enabled, true)).limit(1).get() !==
      undefined,
    area: db.select({ id: workflowStages.id }).from(workflowStages).limit(1).get() !== undefined,
    task: db.select({ id: tasks.id }).from(tasks).limit(1).get() !== undefined,
  };
}

export const readGuideValue = (db: Db): unknown => readSetting(db, GUIDE_KEY);
export const writeGuideValue = (db: Db, value: unknown): void => writeSetting(db, GUIDE_KEY, value);
