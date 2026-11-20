import { ACTIVITY_LIMIT, type ActivityEntry, type ActivityFeed } from '@ea/shared';
import type { Db } from '../../db/client';
import type { ToolRegistry } from '../../tools/registry';
import { approvalsMade, deliveries, failedRuns, scheduledTasks, tasksDone } from './repository';

/**
 * The office's recent activity (Phase 29, D5): finished tasks, deliveries
 * between areas, tasks created by a schedule, tool requests and failed runs,
 * newest first, at most `ACTIVITY_LIMIT` in all.
 */
export function recentActivity(db: Db, registry: ToolRegistry): ActivityFeed {
  const limit = ACTIVITY_LIMIT;
  const entries: ActivityEntry[] = [
    ...tasksDone(db, limit).map((row): ActivityEntry => ({
      kind: 'task_done',
      ...row,
      agentName: row.agentName ?? null,
    })),
    ...deliveries(db, limit).map((row): ActivityEntry => ({ kind: 'delivery', ...row })),
    ...scheduledTasks(db, limit).map((row): ActivityEntry => ({ kind: 'scheduled', ...row })),
    ...approvalsMade(db, limit).map((row): ActivityEntry => ({
      kind: 'approval',
      id: row.id,
      at: row.at,
      agentName: row.agentName,
      toolTitle: registry.get(row.toolName)?.title ?? row.toolName,
      status: row.status,
    })),
    ...failedRuns(db, limit).flatMap((row): ActivityEntry[] =>
      row.at === null
        ? []
        : [
            {
              kind: 'failure',
              id: row.id,
              at: row.at,
              runId: row.id,
              agentName: row.agentName,
              taskTitle: row.taskTitle ?? null,
            },
          ],
    ),
  ];
  // Times are ISO strings of one format, so they sort as text; ids break ties.
  entries.sort((a, b) => (a.at === b.at ? b.id.localeCompare(a.id) : b.at.localeCompare(a.at)));
  return { entries: entries.slice(0, limit) };
}
