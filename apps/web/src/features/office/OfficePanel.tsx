import type { OfficeAgent } from '@ea/shared';
import { ArrowRight, Hand } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { AgentCard } from '../../components/AgentCard';
import { Button, buttonClass } from '../../components/Button';
import { byUrgency, runFacts } from './activity';
import type { BalloonInfo } from './OfficeScene';
import type { Place } from './scene';
import { TONES } from '../../lib/tone';

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
    case 'room':
      return 'Levando um pedido a outra área';
  }
}

export const conversationPath = (agent: OfficeAgent) =>
  `/agentes/${agent.id}/conversa${agent.currentRun?.conversationId ? `/${agent.currentRun.conversationId}` : ''}`;

/**
 * The team of the office (RF-07, RF-80, Phase 29): a card per agent, who
 * needs the user first, with where it is, what it is doing and the decision
 * it waits for. It is what the picture shows, for anyone who does not see
 * the picture. Pointing at a card lights the agent in the scene; picking an
 * agent in the scene lights its card and brings it into view (D3).
 */
export function OfficePanel({
  agents,
  places,
  seated,
  rooms,
  balloons,
  onDecide,
  now,
  selected,
  onHighlight,
}: {
  agents: readonly OfficeAgent[];
  places: ReadonlyMap<string, Place>;
  /** Which agents are sitting at their desk right now (they may still be walking to it). */
  seated: (agentId: string) => boolean;
  /** Name of the room of each agent's desk. */
  rooms: ReadonlyMap<string, string>;
  balloons: ReadonlyMap<string, BalloonInfo>;
  onDecide: (approvalId: string) => void;
  /** The page's clock, for how long each run has been going. */
  now: number;
  /** The agent picked in the scene. */
  selected: string | null;
  /** The card pointed at or focused, to light the agent in the scene; null when none. */
  onHighlight: (agentId: string | null) => void;
}) {
  const names = new Map(agents.map((agent) => [agent.id, agent.name]));
  const present = agents.filter((agent) => places.get(agent.id)?.kind !== 'outside').length;
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (!selected) return;
    const card = [...(list.current?.querySelectorAll('[data-agent]') ?? [])].find(
      (element) => element.getAttribute('data-agent') === selected,
    );
    card?.scrollIntoView?.({ block: 'nearest' });
  }, [selected]);
  return (
    <section aria-labelledby="office-people" className="flex min-h-0 flex-1 flex-col">
      <h2 id="office-people" className="flex items-center gap-2 px-4 pt-3 pb-2 font-bold">
        <span className={`size-2.5 rounded-full ${TONES.ok.dot}`} aria-hidden />
        Agentes no escritório ({present})
      </h2>
      {agents.length === 0 ? (
        <div className="flex-1 px-4 pb-4">
          <p className="text-sm text-dim">
            Ninguém ainda. Cada agente criado ganha uma mesa na sala do seu projeto.
          </p>
          <Link to="/agentes/novo" className={`${buttonClass('primary')} mt-3 w-full`}>
            Criar o primeiro agente
          </Link>
        </div>
      ) : (
        // The list scrolls when the team is long: it takes the keyboard focus so it can (WCAG 2.1.1).
        <ul ref={list} tabIndex={0} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-2">
          {byUrgency(agents).map((agent) => {
            const place: Place = places.get(agent.id) ?? { kind: 'desk' };
            const approval = agent.pendingApproval;
            return (
              <li
                key={agent.id}
                data-agent={agent.id}
                data-place={place.kind === 'visit' ? `visit:${place.hostId}` : place.kind}
                data-seated={seated(agent.id) ? 'true' : 'false'}
                onMouseEnter={() => onHighlight(agent.id)}
                onMouseLeave={() => onHighlight(null)}
                onFocus={() => onHighlight(agent.id)}
                onBlur={() => onHighlight(null)}
              >
                <AgentCard
                  agentId={agent.id}
                  name={agent.name}
                  role={whereabouts(place, names, rooms.get(agent.id) ?? null)}
                  appearance={agent.appearance}
                  state={agent.state}
                  activity={balloons.get(agent.id)?.text ?? null}
                  meta={runFacts(agent, now)}
                  to={conversationPath(agent)}
                  selected={selected === agent.id}
                />
                {approval && (
                  <Button
                    variant="primary"
                    className="mt-1 w-full"
                    onClick={() => onDecide(approval.id)}
                    aria-label={`Decidir o pedido de ${agent.name}`}
                  >
                    <Hand className="size-4" aria-hidden />
                    Decidir
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <Link
        to="/agentes"
        className={`flex items-center justify-center gap-1.5 border-t border-line px-4 py-2.5 text-sm font-semibold hover:text-chalk ${TONES.info.text}`}
      >
        Ver todos os agentes
        <ArrowRight className="size-4" aria-hidden />
      </Link>
    </section>
  );
}
