import type { Office, OfficeAgent, OfficeRoom } from '@ea/shared';
import { asc } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { projects } from '../../db/schema';
import { listAgentsWithState } from '../agents/repository';

export const UNASSIGNED_ROOM_NAME = 'Sem projeto';

/**
 * The office view: one room per project, with its agents. Agents that belong
 * to no project share a last room, which only exists when it is occupied.
 */
export function getOffice(db: Db): Office {
  const rooms = new Map<string | null, OfficeRoom>();
  for (const project of db.select().from(projects).orderBy(asc(projects.name)).all()) {
    rooms.set(project.id, {
      id: project.id,
      name: project.name,
      description: project.description,
      agents: [],
    });
  }

  const unassigned: OfficeAgent[] = [];
  for (const { agent, state } of listAgentsWithState(db)) {
    const occupant = { id: agent.id, name: agent.name, objective: agent.objective, state };
    const room = agent.projectId === null ? undefined : rooms.get(agent.projectId);
    (room ? room.agents : unassigned).push(occupant);
  }

  const result = [...rooms.values()];
  if (unassigned.length > 0) {
    result.push({ id: null, name: UNASSIGNED_ROOM_NAME, description: '', agents: unassigned });
  }
  return { rooms: result };
}
