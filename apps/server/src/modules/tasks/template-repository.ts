import type { TemplateContent } from '@ea/shared';
import { and, asc, eq, inArray, ne } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { agentTools, workflowTemplates } from '../../db/schema';

// Workflow templates saved by the user (Phase 18).

export type TemplateRow = typeof workflowTemplates.$inferSelect;

export function savedTemplates(db: Db): TemplateRow[] {
  return db.select().from(workflowTemplates).orderBy(asc(workflowTemplates.name)).all();
}

export function findSavedTemplate(db: Db, templateId: string): TemplateRow | undefined {
  return db.select().from(workflowTemplates).where(eq(workflowTemplates.id, templateId)).get();
}

export function insertTemplate(
  db: Db,
  row: { id: string; name: string; content: TemplateContent },
): void {
  db.insert(workflowTemplates).values(row).run();
}

export function updateTemplateRow(
  db: Db,
  templateId: string,
  patch: { name?: string; content?: TemplateContent },
): void {
  db.update(workflowTemplates)
    .set({ ...patch, updatedAt: new Date().toISOString() })
    .where(eq(workflowTemplates.id, templateId))
    .run();
}

export function deleteTemplateRow(db: Db, templateId: string): void {
  db.delete(workflowTemplates).where(eq(workflowTemplates.id, templateId)).run();
}

/** Tools granted to these agents ("ask" or "allow"); denied ones are left out. */
export function grantedTools(
  db: Db,
  agentIds: readonly string[],
): { agentId: string; toolName: string }[] {
  if (agentIds.length === 0) return [];
  return db
    .select({ agentId: agentTools.agentId, toolName: agentTools.toolName })
    .from(agentTools)
    .where(and(inArray(agentTools.agentId, [...agentIds]), ne(agentTools.permission, 'deny')))
    .orderBy(asc(agentTools.toolName))
    .all();
}
