import type { OfficeAgent, OfficeRoom } from '@ea/shared';
import { Link } from 'react-router';
import { AgentAvatar } from '../../components/AgentAvatar';
import { buttonClass } from '../../components/Button';
import { PageHeader } from '../../components/PageHeader';
import { StateLamp } from '../../components/StateLamp';
import { EmptyState, ErrorState, LoadingState } from '../../components/States';
import { AGENT_STATE_ORDER } from '../../lib/agent-state';
import { plural } from '../../lib/format';
import { useOffice } from '../../lib/queries';

function Desk({ agent }: { agent: OfficeAgent }) {
  return (
    <li className="flex items-center gap-3 rounded-md border border-line bg-sheet p-2.5">
      <AgentAvatar agentId={agent.id} dimmed={agent.state === 'inactive'} />
      <div className="min-w-0">
        <p className="truncate font-semibold" title={agent.name}>
          {agent.name}
        </p>
        <StateLamp state={agent.state} />
      </div>
    </li>
  );
}

/** A room drawn as on a floor plan: walls, a door gap and the name on the wall. */
function Room({ room }: { room: OfficeRoom }) {
  const headingId = `room-${room.id ?? 'unassigned'}`;
  return (
    <section
      aria-labelledby={headingId}
      className="relative rounded-sm border-2 border-line-strong bg-ink/80 p-4 pt-6"
    >
      <h2
        id={headingId}
        className="absolute -top-3.5 left-3 max-w-[calc(100%-1.5rem)] truncate bg-ink px-2 text-lg font-bold"
      >
        {room.name}
      </h2>
      {/* Door: a gap in the bottom wall. */}
      <span className="absolute -bottom-0.5 right-6 h-0.5 w-10 bg-ink" aria-hidden />

      <p className="mb-3 text-sm text-dim">
        {room.description || plural(room.agents.length, 'agente', 'agentes')}
      </p>

      {room.agents.length === 0 ? (
        <p className="text-sm text-dim">Sala vazia.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))]">
          {room.agents.map((agent) => (
            <Desk key={agent.id} agent={agent} />
          ))}
        </ul>
      )}
    </section>
  );
}

function Legend() {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1" aria-label="Legenda dos estados">
      {AGENT_STATE_ORDER.map((state) => (
        <li key={state}>
          <StateLamp state={state} />
        </li>
      ))}
    </ul>
  );
}

export function OfficePage() {
  const { data, error, isPending, refetch } = useOffice();

  return (
    <>
      <PageHeader
        title="Escritório"
        description="Cada projeto é uma sala e cada agente ocupa uma mesa."
        actions={<Legend />}
      />

      {isPending && <LoadingState label="Carregando o escritório…" />}

      {error && !data && (
        <ErrorState
          title="Não foi possível carregar o escritório."
          error={error}
          onRetry={() => void refetch()}
        />
      )}

      {data && data.rooms.length === 0 && (
        <div className="plan-grid rounded-lg border border-line">
          <EmptyState
            title="O escritório ainda está vazio."
            action={
              <Link to="/agentes/novo" className={buttonClass('primary')}>
                Criar o primeiro agente
              </Link>
            }
          >
            Cada projeto vira uma sala e cada agente ocupa uma mesa.
          </EmptyState>
        </div>
      )}

      {data && data.rooms.length > 0 && (
        <div className="plan-grid grid gap-x-6 gap-y-9 rounded-lg border border-line p-4 pt-8 sm:p-6 sm:pt-9 md:grid-cols-2">
          {data.rooms.map((room) => (
            <Room key={room.id ?? 'unassigned'} room={room} />
          ))}
        </div>
      )}
    </>
  );
}
