import type { Approval, Office, OfficeAgent, OfficeRoom } from '@ea/shared';
import { Hand } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { hashId } from '../../components/AgentAvatar';
import { ApprovalCard } from '../../components/ApprovalCard';
import { Button, buttonClass } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { PageHeader } from '../../components/PageHeader';
import { StateLamp } from '../../components/StateLamp';
import { EmptyState, ErrorState, LoadingState } from '../../components/States';
import { AGENT_STATE_ORDER } from '../../lib/agent-state';
import { plural } from '../../lib/format';
import { useOffice } from '../../lib/queries';
import { useApprovals } from '../../lib/tool-queries';
import { Doorway, PantryCounter, ReceptionCounter, StreetDoor } from './CommonAreas';
import { DeskScene, WallDecor } from './DeskScene';
import { PANTRY, type Place, placeKey, placesOf, RECEPTION } from './scene';
import { type OfficeScene, useOfficeScene, Walkers } from './Walkers';

/** Who is working for whom right now (RF-09). */
interface Delegations {
  /** Agent id to the names of the agents it handed a task to. */
  readonly targets: ReadonlyMap<string, string[]>;
  /** Agent id to the name of the agent whose task it is doing. */
  readonly delegators: ReadonlyMap<string, string>;
}

function delegationsOf(office: Office): Delegations {
  const agents = office.rooms.flatMap((room) => room.agents);
  const names = new Map(agents.map((agent) => [agent.id, agent.name]));
  const targets = new Map<string, string[]>();
  const delegators = new Map<string, string>();
  for (const agent of agents) {
    for (const to of agent.delegatingTo) {
      const name = names.get(to);
      if (!name) continue;
      targets.set(agent.id, [...(targets.get(agent.id) ?? []), name]);
      delegators.set(to, agent.name);
    }
  }
  return { targets, delegators };
}

/** What the agent would say about what it is doing; null when there is nothing to say. */
function balloonText(agent: OfficeAgent, delegations: Delegations): string | null {
  const helpers = delegations.targets.get(agent.id);
  const delegator = delegations.delegators.get(agent.id);
  switch (agent.state) {
    case 'working':
      if (helpers) return `Pedi ajuda a ${helpers.join(' e ')} e aguardo a resposta`;
      if (agent.currentRun?.status === 'queued') return 'Na fila, já começo…';
      if (delegator) {
        return agent.currentRun?.prompt
          ? `Tarefa de ${delegator}: “${agent.currentRun.prompt}”`
          : `Fazendo uma tarefa de ${delegator}`;
      }
      return agent.currentRun?.prompt
        ? `Respondendo: “${agent.currentRun.prompt}”`
        : 'Trabalhando…';
    case 'waiting':
      return agent.pendingApproval
        ? `Posso usar “${agent.pendingApproval.toolTitle}”?`
        : 'Preciso da sua aprovação';
    case 'failed':
      return agent.lastError ?? 'A última execução falhou';
    default:
      return null;
  }
}

const BALLOON_TONE: Partial<Record<OfficeAgent['state'], string>> = {
  waiting: 'font-semibold',
  failed: 'font-semibold',
};

const nameList = new Intl.ListFormat('pt-BR', { type: 'conjunction' });

/** Where the agent is when it is not at its desk, in words; null when there is nothing to add. */
function whereabouts(place: Place, agentNames: ReadonlyMap<string, string>): string | null {
  if (place.kind === 'pantry') return 'Na copa';
  if (place.kind === 'visit') return `Na mesa de ${agentNames.get(place.hostId) ?? 'outro agente'}`;
  return null;
}

interface SceneProps {
  readonly delegations: Delegations;
  readonly places: ReadonlyMap<string, Place>;
  readonly agentNames: ReadonlyMap<string, string>;
  readonly scene: OfficeScene;
  readonly onDecide: (approvalId: string) => void;
}

/** A workstation with its agent. The whole desk opens the conversation (RF-08). */
function Desk({
  agent,
  delegations,
  places,
  agentNames,
  scene,
  onDecide,
}: SceneProps & { agent: OfficeAgent }) {
  const balloon = balloonText(agent, delegations);
  const conversation = agent.currentRun?.conversationId;
  const approval = agent.pendingApproval;
  const place: Place = places.get(agent.id) ?? { kind: 'desk' };
  // The chair fills only when the character has walked all the way back (RF-80).
  const seated = scene.view(agent.id)?.seated ?? place.kind === 'desk';
  const away = whereabouts(place, agentNames);
  return (
    <li data-desk={agent.id} data-place={placeKey(place)} data-seated={seated ? 'true' : 'false'}>
      <Link
        to={`/agentes/${agent.id}/conversa${conversation ? `/${conversation}` : ''}`}
        title={`Conversar com ${agent.name}`}
        className="block rounded-lg p-1.5 transition-colors hover:bg-chalk/10"
      >
        {/* Fixed height, so desks line up whether or not the agent is saying something. */}
        <span className="flex h-12 items-end justify-center pb-1.5">
          {balloon && (
            <span
              className={`office-balloon max-w-full px-2 py-1 text-center text-xs leading-tight ${
                BALLOON_TONE[agent.state] ?? ''
              }`}
            >
              {/* The clamp is on an inner element so it cuts neither the padding nor the tail. */}
              <span className="line-clamp-2">{balloon}</span>
            </span>
          )}
        </span>
        <span className="block" data-seat={agent.id}>
          <DeskScene agentId={agent.id} state={agent.state} seated={seated} />
        </span>
        <span className="mt-1 block truncate text-center font-semibold">{agent.name}</span>
        <span className="flex justify-center">
          <StateLamp state={agent.state} />
        </span>
        {away && <span className="block truncate text-center text-xs text-dim">{away}</span>}
      </Link>
      {/* Outside the link: answering is an action of its own, not a way into the chat. */}
      {approval && (
        <div className="mt-1 flex justify-center">
          <Button
            variant="primary"
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
}

/**
 * A part of the office: a wall with its name and a door to the corridor, and
 * a floor. Characters find the door and the floor by the `data-` marks.
 */
function Area({
  areaKey,
  name,
  detail,
  decor,
  floorClass,
  children,
}: {
  areaKey: string;
  name: string;
  detail: ReactNode;
  decor?: ReactNode;
  floorClass: string;
  children: ReactNode;
}) {
  const headingId = `area-${areaKey}`;
  return (
    <section
      aria-labelledby={headingId}
      data-area={areaKey}
      className="flex flex-col overflow-hidden rounded-lg border-2 border-line-strong"
    >
      <div className="office-wall flex items-end justify-between gap-3 px-4 pt-2.5">
        <div className="min-w-0 pb-2.5">
          <h2 id={headingId} className="truncate text-lg font-bold">
            {name}
          </h2>
          <p className="truncate text-sm text-dim">{detail}</p>
        </div>
        <div className="flex shrink-0 items-end gap-3">
          {decor && <div className="pb-2.5">{decor}</div>}
          <Doorway />
        </div>
      </div>
      {/* The floor takes what is left of the row, so every area in it ends at the same line. */}
      <div data-floor className={`office-floor flex-1 ${floorClass}`}>
        {children}
      </div>
    </section>
  );
}

/** A room: the project's name on the wall and a floor with the desks. */
function Room({ room, ...sceneProps }: SceneProps & { room: OfficeRoom }) {
  return (
    <Area
      areaKey={`room-${room.id ?? 'unassigned'}`}
      name={room.name}
      detail={
        <>
          {room.description && <span>{room.description}</span>}
          {room.description && ' · '}
          <span>{plural(room.agents.length, 'agente', 'agentes')}</span>
        </>
      }
      decor={<WallDecor seed={hashId(room.id ?? room.name)} />}
      floorClass="min-h-40 p-3 sm:p-4"
    >
      {room.agents.length === 0 ? (
        <p className={NOTE}>Sala vazia. Agentes deste projeto aparecem aqui.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-x-2 gap-y-3 sm:grid-cols-[repeat(auto-fill,minmax(10rem,1fr))]">
          {room.agents.map((agent) => (
            <Desk key={agent.id} agent={agent} {...sceneProps} />
          ))}
        </ul>
      )}
    </Area>
  );
}

const NOTE = 'rounded-md bg-ink/60 px-3 py-2 text-sm text-dim';

/** The way in and out: inactive agents are outside, new ones come in through here (RF-80). */
function Reception({ outside }: { outside: readonly string[] }) {
  return (
    <Area
      areaKey={RECEPTION}
      name="Recepção"
      detail="Entrada do escritório"
      floorClass="flex min-h-28 flex-wrap items-end justify-between gap-3 p-3 sm:flex-nowrap sm:p-4"
    >
      <StreetDoor />
      {/* On a narrow screen the note has a line of its own, above the furniture. */}
      <p
        className={`order-first min-w-0 basis-full self-start sm:order-none sm:basis-auto ${NOTE}`}
      >
        {outside.length === 0
          ? 'Ninguém fora do escritório.'
          : `Fora do escritório: ${nameList.format(outside)}.`}
      </p>
      <ReceptionCounter />
    </Area>
  );
}

/** Where agents with nothing to do for a while go for a coffee (RF-80). */
function Pantry({ resting }: { resting: readonly string[] }) {
  return (
    <Area
      areaKey={PANTRY}
      name="Copa"
      detail="Pausa de quem está sem tarefa"
      floorClass="flex min-h-60 flex-wrap content-start items-start justify-between gap-3 p-3 sm:min-h-44 sm:flex-nowrap sm:p-4"
    >
      <p className={`min-w-0 basis-full sm:basis-auto ${NOTE}`}>
        {resting.length === 0 ? 'Ninguém na copa agora.' : `Na copa: ${nameList.format(resting)}.`}
      </p>
      <div className="ml-auto">
        <PantryCounter />
      </div>
    </Area>
  );
}

/** How often the page checks whether someone has been idle long enough to leave the desk. */
const CLOCK_MS = 10_000;

/** The clock of the page: who has been idle for a while is found by comparing with it. */
function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/** The decision an agent is waiting for, answered without leaving the office (RF-09). */
function DecisionDialog({
  approval,
  onClose,
}: {
  approval: Approval | undefined;
  onClose: () => void;
}) {
  return (
    <Modal
      title="Decidir o pedido"
      onClose={onClose}
      footer={<Button onClick={onClose}>Fechar</Button>}
    >
      {approval ? (
        <ApprovalCard approval={approval} context="chat" />
      ) : (
        <p className="text-dim">Este pedido já foi respondido ou retirado.</p>
      )}
    </Modal>
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
  const { data: approvals } = useApprovals();
  const [deciding, setDeciding] = useState<string | null>(null);
  const delegations = delegationsOf(data ?? { rooms: [] });

  const now = useNow(CLOCK_MS);
  const floor = useRef<HTMLDivElement>(null);
  const agents = (data?.rooms ?? []).flatMap((room) => room.agents);
  const agentNames = new Map(agents.map((agent) => [agent.id, agent.name]));
  // Null while there is nothing to show: the scene starts with the first real office.
  const places = data && data.rooms.length > 0 ? placesOf(data, now) : null;
  const scene = useOfficeScene(floor, places);
  const namesAt = (kind: Place['kind']) =>
    agents.filter((agent) => places?.get(agent.id)?.kind === kind).map((agent) => agent.name);

  return (
    <>
      <PageHeader
        title="Escritório"
        description="Cada projeto é uma sala e cada agente tem a sua mesa. Quem fica sem tarefa vai à copa, quem delega visita a mesa do colega e agente inativo fica fora. Clique em um agente para conversar; quando um deles pedir aprovação, decida ali mesmo."
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

      {data && places && (
        <div
          ref={floor}
          className="office-corridor relative grid gap-6 rounded-lg py-6 pr-3 pl-9 sm:pr-6 xl:grid-cols-2"
        >
          <Reception outside={namesAt('outside')} />
          <Pantry resting={namesAt('pantry')} />
          {data.rooms.map((room) => (
            <Room
              key={room.id ?? 'unassigned'}
              room={room}
              delegations={delegations}
              places={places}
              agentNames={agentNames}
              scene={scene}
              onDecide={setDeciding}
            />
          ))}
          <Walkers agentIds={[...places.keys()]} scene={scene} />
        </div>
      )}

      {deciding && (
        <DecisionDialog
          approval={approvals?.find((approval) => approval.id === deciding)}
          onClose={() => setDeciding(null)}
        />
      )}
    </>
  );
}
