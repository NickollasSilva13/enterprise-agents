import type { OfficeAgent } from '@ea/shared';
import { ArrowRight, Hand } from 'lucide-react';
import { Link } from 'react-router';
import { AgentAvatar } from '../../components/AgentAvatar';
import { Button } from '../../components/Button';
import { StateLamp } from '../../components/StateLamp';
import type { BalloonInfo } from './OfficeScene';
import type { Place } from './scene';

/** Where the agent is, in words. */
export function whereabouts(
  place: Place,
  names: ReadonlyMap<string, string>,
  room: string | null,
): string {
  switch (place.kind) {
    case 'desk':
      return room ? `Na mesa, em ${room}` : 'Na mesa';
    case 'pantry':
      return 'Na copa';
    case 'lounge':
      return 'Na descompressão';
    case 'meeting':
      return 'Na sala de reunião';
    case 'visit':
      return `Na mesa de ${names.get(place.hostId) ?? 'outro agente'}`;
    case 'outside':
      return 'Fora do escritório';
    case 'lobby':
      return 'Sem mesa no layout: espera na recepção';
  }
}

export const conversationPath = (agent: OfficeAgent) =>
  `/agentes/${agent.id}/conversa${agent.currentRun?.conversationId ? `/${agent.currentRun.conversationId}` : ''}`;

/**
 * The people of the office in words (RF-07, RF-80): who is where, doing what,
 * and the decision each one is waiting for. It is what the picture shows, for
 * anyone who does not see the picture.
 */
export function OfficePanel({
  agents,
  places,
  seated,
  rooms,
  balloons,
  onDecide,
}: {
  agents: readonly OfficeAgent[];
  places: ReadonlyMap<string, Place>;
  /** Which agents are sitting at their desk right now (they may still be walking to it). */
  seated: (agentId: string) => boolean;
  /** Name of the room of each agent's desk. */
  rooms: ReadonlyMap<string, string>;
  balloons: ReadonlyMap<string, BalloonInfo>;
  onDecide: (approvalId: string) => void;
}) {
  const names = new Map(agents.map((agent) => [agent.id, agent.name]));
  const present = agents.filter((agent) => places.get(agent.id)?.kind !== 'outside').length;
  return (
    <section
      aria-labelledby="office-people"
      className="flex min-h-0 flex-col rounded-xl border border-line bg-sheet/95 shadow-lg lg:h-full"
    >
      <h2 id="office-people" className="flex items-center gap-2 px-4 pt-3 pb-2 font-bold">
        <span className="size-2.5 rounded-full bg-ok" aria-hidden />
        Agentes no escritório ({present})
      </h2>
      {agents.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-dim">
          Ninguém ainda. Cada agente criado ganha uma mesa na sala do seu projeto.
        </p>
      ) : (
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-2">
          {agents.map((agent) => {
            const place: Place = places.get(agent.id) ?? { kind: 'desk' };
            const balloon = balloons.get(agent.id);
            const approval = agent.pendingApproval;
            return (
              <li
                key={agent.id}
                data-agent={agent.id}
                data-place={place.kind === 'visit' ? `visit:${place.hostId}` : place.kind}
                data-seated={seated(agent.id) ? 'true' : 'false'}
                className="rounded-lg hover:bg-sheet-raised"
              >
                <Link
                  to={conversationPath(agent)}
                  title={`Conversar com ${agent.name}`}
                  className="flex items-start gap-3 rounded-lg px-2 py-2"
                >
                  <AgentAvatar
                    agentId={agent.id}
                    appearance={agent.appearance}
                    size={36}
                    dimmed={agent.state === 'inactive'}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{agent.name}</span>
                    <StateLamp state={agent.state} />
                    <span className="block truncate text-xs text-dim">
                      {whereabouts(place, names, rooms.get(agent.id) ?? null)}
                    </span>
                    {balloon && (
                      <span
                        className={`mt-0.5 line-clamp-2 text-xs ${balloon.tone === 'strong' ? 'font-semibold' : 'text-dim'}`}
                      >
                        {balloon.text}
                      </span>
                    )}
                  </span>
                </Link>
                {approval && (
                  <div className="px-2 pb-2">
                    <Button
                      variant="primary"
                      className="w-full"
                      onClick={() => onDecide(approval.id)}
                      aria-label={`Decidir o pedido de ${agent.name}`}
                    >
                      <Hand className="size-4" aria-hidden />
                      Decidir
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <Link
        to="/agentes"
        className="flex items-center justify-center gap-1.5 border-t border-line px-4 py-2.5 text-sm font-semibold text-info hover:text-chalk"
      >
        Ver todos os agentes
        <ArrowRight className="size-4" aria-hidden />
      </Link>
    </section>
  );
}
