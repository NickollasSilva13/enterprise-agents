import type { Approval, OfficeAgent } from '@ea/shared';
import { Bell, Bot, LocateFixed, PencilRuler, ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ApprovalCard } from '../../components/ApprovalCard';
import { Button, buttonClass } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { PageHeader } from '../../components/PageHeader';
import { ErrorState, LoadingState } from '../../components/States';
import { useOffice } from '../../lib/queries';
import { useApprovals } from '../../lib/tool-queries';
import { areaName, sceneBounds } from './art/architecture';
import { buildGeometry } from './geometry';
import { Minimap } from './Minimap';
import { conversationPath, OfficePanel } from './OfficePanel';
import { type BalloonInfo, OfficeDrawing, useOfficeScene } from './OfficeScene';
import { placesOf } from './scene';
import { useViewport } from './viewport';

/** Who is working for whom right now (RF-09). */
interface Delegations {
  /** Agent id to the names of the agents it handed a task to. */
  readonly targets: ReadonlyMap<string, string[]>;
  /** Agent id to the name of the agent whose task it is doing. */
  readonly delegators: ReadonlyMap<string, string>;
}

function delegationsOf(agents: readonly OfficeAgent[]): Delegations {
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
export function balloonOf(agent: OfficeAgent, delegations: Delegations): BalloonInfo | null {
  const helpers = delegations.targets.get(agent.id);
  const delegator = delegations.delegators.get(agent.id);
  const say = (text: string, tone: BalloonInfo['tone'] = 'normal') => ({ text, tone });
  switch (agent.state) {
    case 'working':
      if (helpers) return say(`Pedi ajuda a ${helpers.join(' e ')} e aguardo a resposta`);
      if (agent.currentRun?.status === 'queued') return say('Na fila, já começo…');
      if (delegator) {
        return say(
          agent.currentRun?.prompt
            ? `Tarefa de ${delegator}: “${agent.currentRun.prompt}”`
            : `Fazendo uma tarefa de ${delegator}`,
        );
      }
      return say(
        agent.currentRun?.prompt ? `Respondendo: “${agent.currentRun.prompt}”` : 'Trabalhando…',
      );
    case 'waiting':
      return say(
        agent.pendingApproval
          ? `Posso usar “${agent.pendingApproval.toolTitle}”?`
          : 'Preciso da sua aprovação',
        'strong',
      );
    case 'failed':
      return say(agent.lastError ?? 'A última execução falhou', 'strong');
    default:
      return null;
  }
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

const BAR_BUTTON =
  'grid size-11 place-items-center rounded-full text-chalk transition-colors hover:bg-sheet-raised';

export function OfficePage() {
  const { data, error, isPending, refetch } = useOffice();
  const { data: approvals } = useApprovals();
  const [deciding, setDeciding] = useState<string | null>(null);
  const navigate = useNavigate();
  const now = useNow(CLOCK_MS);

  const agents = useMemo(() => data?.agents ?? [], [data]);
  // Every read of the server brings a new object: the layout is kept while its content is the same,
  // so the view and the walks are not reset by a refresh.
  const layoutKey = data ? JSON.stringify(data.layout) : '';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const layout = useMemo(() => data?.layout ?? null, [layoutKey]);
  // The geometry follows the layout and who has a desk; a new state alone keeps it.
  const seatKey = agents.map((agent) => `${agent.id}:${agent.projectId ?? ''}`).join(',');
  const geometry = useMemo(
    () => (layout ? buildGeometry(layout, agents) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layout, seatKey],
  );
  const places =
    geometry && data
      ? placesOf(agents, now, geometry.features, new Set(geometry.seats.keys()))
      : null;
  const scene = useOfficeScene(geometry, places);

  const stage = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const bounds = useMemo(() => (layout ? sceneBounds(layout) : null), [layout]);
  const viewport = useViewport(stage, svg, bounds);

  const delegations = delegationsOf(agents);
  const balloons = new Map<string, BalloonInfo>();
  for (const agent of agents) {
    const balloon = balloonOf(agent, delegations);
    if (balloon) balloons.set(agent.id, balloon);
  }
  const rooms = new Map<string, string>();
  if (layout && geometry && data) {
    for (const [agentId, seat] of geometry.seats) {
      const area =
        layout.areas[geometry.nav.areaOf[seat.chair.y * geometry.nav.width + seat.chair.x] ?? -1];
      if (area) rooms.set(agentId, areaName(area, data.projects));
    }
  }

  const openAgent = (agent: OfficeAgent) => {
    if (viewport.dragged()) return;
    if (agent.pendingApproval) setDeciding(agent.pendingApproval.id);
    else void navigate(conversationPath(agent));
  };
  const pending = approvals?.filter((approval) => approval.status === 'pending').length ?? 0;

  return (
    <>
      <PageHeader
        title="Escritório"
        description="Cada projeto tem a sua sala e cada agente, a sua mesa. Quem fica sem tarefa vai à copa, quem delega reúne-se com quem recebeu a tarefa e agente inativo fica fora. Clique em um agente para conversar."
        actions={
          <div className="flex items-center gap-2">
            <Link to="/escritorio/editar" className={buttonClass('secondary')}>
              <PencilRuler className="size-4" aria-hidden />
              Editar escritório
            </Link>
            <Link
              to="/aprovacoes"
              className="relative grid size-11 place-items-center rounded-full border border-line-strong text-chalk hover:bg-sheet-raised"
              aria-label={`Aprovações pendentes: ${pending}`}
              title="Aprovações pendentes"
            >
              <Bell className="size-5" aria-hidden />
              {pending > 0 && (
                <span
                  className="absolute -top-1 -right-1 grid min-w-5 place-items-center rounded-full bg-fail px-1 text-xs font-bold text-ink"
                  aria-hidden
                >
                  {pending}
                </span>
              )}
            </Link>
          </div>
        }
      />

      {isPending && <LoadingState label="Carregando o escritório…" />}

      {error && !data && (
        <ErrorState
          title="Não foi possível carregar o escritório."
          error={error}
          onRetry={() => void refetch()}
        />
      )}

      {data && layout && geometry && places && bounds && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_19rem]">
          <div
            ref={stage}
            className="office-stage relative h-[min(68dvh,44rem)] min-h-80 overflow-hidden rounded-xl border border-line"
          >
            <OfficeDrawing
              svgRef={svg}
              className="absolute inset-0 size-full touch-none select-none"
              layout={layout}
              projects={data.projects}
              agents={agents}
              geometry={geometry}
              places={places}
              scene={scene}
              balloons={balloons}
              onAgent={openAgent}
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-3">
              <div
                role="toolbar"
                aria-label="Ações do escritório"
                className="pointer-events-auto flex items-center gap-1 rounded-full border border-line-strong bg-ink/90 p-1.5 shadow-lg"
              >
                <button
                  type="button"
                  className={BAR_BUTTON}
                  onClick={viewport.zoomIn}
                  aria-label="Aproximar"
                  title="Aproximar"
                >
                  <ZoomIn className="size-5" aria-hidden />
                </button>
                <button
                  type="button"
                  className={BAR_BUTTON}
                  onClick={viewport.zoomOut}
                  aria-label="Afastar"
                  title="Afastar"
                >
                  <ZoomOut className="size-5" aria-hidden />
                </button>
                <button
                  type="button"
                  className={BAR_BUTTON}
                  onClick={viewport.fit}
                  aria-label="Mostrar o escritório inteiro"
                  title="Mostrar o escritório inteiro"
                >
                  <LocateFixed className="size-5" aria-hidden />
                </button>
                <Link
                  to="/agentes/novo"
                  className={BAR_BUTTON}
                  aria-label="Novo agente"
                  title="Novo agente"
                >
                  <Bot className="size-5" aria-hidden />
                </Link>
                <Link
                  to="/escritorio/editar"
                  className={BAR_BUTTON}
                  aria-label="Editar o escritório"
                  title="Editar o escritório"
                >
                  <PencilRuler className="size-5" aria-hidden />
                </Link>
              </div>
            </div>
            <Minimap
              className="absolute right-3 bottom-3 hidden md:block"
              layout={layout}
              bounds={bounds}
              agents={agents}
              scene={scene}
              viewport={viewport}
            />
          </div>
          <div className="lg:h-[min(68dvh,44rem)] lg:min-h-80">
            <OfficePanel
              agents={agents}
              places={places}
              seated={(id) => scene.view(id)?.seated ?? places.get(id)?.kind === 'desk'}
              rooms={rooms}
              balloons={balloons}
              onDecide={setDeciding}
            />
            {agents.length === 0 && (
              <Link to="/agentes/novo" className={`${buttonClass('primary')} mt-3 w-full`}>
                Criar o primeiro agente
              </Link>
            )}
          </div>
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
