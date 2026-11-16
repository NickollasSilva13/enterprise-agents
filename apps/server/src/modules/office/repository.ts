import { doorSchema, type OfficeLayout, type OfficeLayoutInput } from '@ea/shared';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../../db/client';
import { newId } from '../../db/ids';
import { officeAreas, officeItems, settings } from '../../db/schema';

/** Grid size of the saved layout. Its presence means the user has saved one. */
export const LAYOUT_KEY = 'office.layout';

const layoutMetaSchema = z.object({ width: z.number().int(), height: z.number().int() });
const doorsSchema = z.array(doorSchema);

/** The layout the user saved, or null while the office uses the automatic one. */
export function readStoredLayout(db: Db): OfficeLayout | null {
  const row = db.select().from(settings).where(eq(settings.key, LAYOUT_KEY)).get();
  const meta = layoutMetaSchema.safeParse(row?.value);
  if (!meta.success) return null;
  const areas = db
    .select()
    .from(officeAreas)
    .orderBy(asc(officeAreas.position))
    .all()
    .map((area) => ({
      id: area.id,
      kind: area.kind,
      name: area.name,
      x: area.x,
      y: area.y,
      width: area.width,
      height: area.height,
      floor: area.floor,
      projectId: area.projectId,
      // A malformed list would only come from a hand-edited database: the area keeps no door.
      doors: doorsSchema.safeParse(area.doors).data ?? [],
    }));
  const items = db
    .select()
    .from(officeItems)
    .orderBy(asc(officeItems.position))
    .all()
    .map((item) => ({
      id: item.id,
      kind: item.kind,
      x: item.x,
      y: item.y,
      facing: item.facing,
      agentId: item.agentId,
      label: item.label,
    }));
  return { ...meta.data, areas, items };
}

/** Replaces the whole layout at once. */
export function writeLayout(db: Db, layout: OfficeLayoutInput): void {
  db.transaction((tx) => {
    tx.delete(officeItems).run();
    tx.delete(officeAreas).run();
    if (layout.areas.length > 0) {
      tx.insert(officeAreas)
        .values(layout.areas.map((area, position) => ({ ...area, id: newId(), position })))
        .run();
    }
    if (layout.items.length > 0) {
      tx.insert(officeItems)
        .values(layout.items.map((item, position) => ({ ...item, id: newId(), position })))
        .run();
    }
    const value = { width: layout.width, height: layout.height };
    const updatedAt = new Date().toISOString();
    tx.insert(settings)
      .values({ key: LAYOUT_KEY, value, updatedAt })
      .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt } })
      .run();
  });
}

/** Forgets the saved layout: the office goes back to the automatic one. */
export function clearLayout(db: Db): void {
  db.transaction((tx) => {
    tx.delete(officeItems).run();
    tx.delete(officeAreas).run();
    tx.delete(settings).where(eq(settings.key, LAYOUT_KEY)).run();
  });
}
