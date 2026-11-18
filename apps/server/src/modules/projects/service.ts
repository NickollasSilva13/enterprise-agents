import type { Project, ProjectCreate, ProjectUpdate } from '@ea/shared';
import { and, asc, count, eq, isNull } from 'drizzle-orm';
import { ConflictError, NotFoundError } from '../../core/errors';
import type { Db } from '../../db/client';
import { newId } from '../../db/ids';
import { agents, projects, tasks } from '../../db/schema';

const sameName = (a: string, b: string) =>
  a.toLocaleLowerCase('pt-BR') === b.toLocaleLowerCase('pt-BR');

function assertNameIsFree(db: Db, name: string, exceptId?: string): void {
  const taken = db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .all()
    .some((project) => project.id !== exceptId && sameName(project.name, name));
  if (taken) throw new ConflictError('name_taken', 'Já existe um projeto com esse nome.');
}

export function listProjects(db: Db): Project[] {
  const agentCounts = new Map(
    db
      .select({ projectId: agents.projectId, total: count() })
      .from(agents)
      .where(isNull(agents.deletedAt))
      .groupBy(agents.projectId)
      .all()
      .map((row) => [row.projectId, row.total]),
  );
  return db
    .select()
    .from(projects)
    .orderBy(asc(projects.name))
    .all()
    .map((project) => ({ ...project, agentCount: agentCounts.get(project.id) ?? 0 }));
}

export function getProject(db: Db, id: string): Project {
  const project = listProjects(db).find((entry) => entry.id === id);
  if (!project) throw new NotFoundError('Projeto não encontrado.');
  return project;
}

export function createProject(db: Db, input: ProjectCreate): Project {
  assertNameIsFree(db, input.name);
  const id = newId();
  db.insert(projects)
    .values({ id, ...input })
    .run();
  return getProject(db, id);
}

export function updateProject(db: Db, id: string, patch: ProjectUpdate): Project {
  getProject(db, id);
  if (patch.name !== undefined) assertNameIsFree(db, patch.name, id);
  db.update(projects)
    .set({ ...patch, updatedAt: new Date().toISOString() })
    .where(eq(projects.id, id))
    .run();
  return getProject(db, id);
}

/** Removes the project. Its agents stay, without a project (foreign key "set null"). */
export function deleteProject(db: Db, id: string): void {
  getProject(db, id);
  // Its tasks and their history stay readable: an area with tasks is kept (Phase 16).
  if (db.select({ id: tasks.id }).from(tasks).where(eq(tasks.projectId, id)).get()) {
    throw new ConflictError(
      'area_has_tasks',
      'Esta área tem tarefas no quadro, e o histórico delas é mantido. Ela não pode ser excluída.',
    );
  }
  db.transaction((tx) => {
    // Deleted agents keep no link either, so a later restore cannot point nowhere.
    tx.update(agents)
      .set({ projectId: null })
      .where(and(eq(agents.projectId, id)))
      .run();
    tx.delete(projects).where(eq(projects.id, id)).run();
  });
}
