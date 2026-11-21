import type { Approval, OfficeAgent } from '@ea/shared';
import { Bell, CalendarPlus, ListPlus, PencilRuler, UserPlus } from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ActivityFeed } from '../../components/ActivityFeed';
import { ApprovalCard } from '../../components/ApprovalCard';
import { Button, buttonClass } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { PageHeader } from '../../components/PageHeader';
import { QuickAction } from '../../components/QuickAction';
import { ErrorState, LoadingState } from '../../components/States';
import { useActivity, useOffice } from '../../lib/queries';
import { useApprovals } from '../../lib/tool-queries';
import { areaName, sceneBounds } from './art/architecture';
import { buildGeometry } from './geometry';
import { IndicatorRow } from '../indicators/IndicatorRow';
import { activityOf } from './activity';
import { OfficePanel } from './OfficePanel';
import { useDaylight } from './daylight';
import {
  type BalloonInfo,
  deskScreens,
  figuresOf,
  OfficeDrawing,
  useOfficeScene,
  useReducedMotion,
} from './OfficeScene';
import { placesOf } from './scene';
import { OfficeOverlay } from './three/OfficeOverlay';
import { hasWebGL, useElementSize } from './three/support';
import { officeView } from './three/view';
import { TONES } from '../../lib/tone';
import { FirstSteps, useFirstStepsOpen } from '../guide/FirstSteps';
import { Tip } from '../../components/Tip';

/** The 3D scene and three.js are loaded only when the office opens (Phase 24, D1). */
const OfficeCanvas = lazy(() => import('./three/OfficeCanvas'));

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

type SideTab = 'team' | 'activity';

const SIDE_TABS: readonly { readonly id: SideTab; readonly label: string }[] = [
  { id: 'team', label: 'Time' },
  { id: 'activity', label: 'Atividade' },
];

/** What happened lately in the office (Phase 29, D5). */
function RecentActivity() {
  const activity = useActivity();
  return (
    <section aria-labelledby="office-activity" className="flex min-h-0 flex-1 flex-col">
      <h2 id="office-activity" className="px-4 pt-3 pb-2 font-bold">
        Atividade recente
      </h2>
      {/* Scrolls when there is a lot: it takes the keyboard focus so it can (WCAG 2.1.1). */}
      <div
        tabIndex={0}
        aria-labelledby="office-activity"
        className="min-h-0 flex-1 overflow-y-auto px-2 pb-2"
      >
        <ActivityFeed
          label="Atividade recente"
          status={
            activity.data
              ? { kind: 'ready', items: activity.data.map(activityOf) }
              : activity.error
                ? { kind: 'error', error: activity.error, onRetry: () => void activity.refetch() }
                : { kind: 'loading' }
          }
          emptyText="Tarefas concluídas, entregas entre áreas, agendamentos, pedidos de aprovação e falhas aparecem aqui."
        />
      </div>
    </section>
  );
}

/**
 * The next things to do from the office (Phase 29, D6): off, with the reason,
 * when not possible yet. At the foot of the side column since Phase 30 (D4).
 */
function QuickActions({ hasAreas }: { hasAreas: boolean }) {
  const noArea = hasAreas ? undefined : 'Crie uma área primeiro, em Tarefas.';
  return (
    <section
      aria-labelledby="office-quick"
      className="shrink-0 border-t border-line px-3 pt-2 pb-2"
    >
      <h2 id="office-quick" className="mb-1.5 text-sm font-bold">
        Ações rápidas
      </h2>
      <div className="grid gap-1.5">
        <QuickAction
          icon={ListPlus}
          label="Criar tarefa"
          description="No quadro de uma área."
          to="/tarefas?nova=1"
          disabledReason={noArea}
          compact
        />
        <QuickAction
          icon={UserPlus}
          label="Novo agente"
          description="Com nome, objetivo e modelo."
          to="/agentes/novo"
          compact
        />
        <QuickAction
          icon={CalendarPlus}
          label="Agendar tarefa"
          description="Uma vez ou repetindo."
          to="/tarefas/agendamentos?novo=1"
          disabledReason={noArea}
          compact
        />
      </div>
    </section>
  );
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

export function OfficePage() {
  const { data, error, isPending, refetch } = useOffice();
  const { data: approvals } = useApprovals();
  const [deciding, setDeciding] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [pointed, setPointed] = useState<string | null>(null);
  const [tab, setTab] = useState<SideTab>('team');
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

  const [webgl] = useState(hasWebGL);
  const stage = useElementSize();
  const light = useDaylight();
  const reduced = useReducedMotion();
  const firstSteps = useFirstStepsOpen();
  const bounds = useMemo(() => (layout ? sceneBounds(layout) : null), [layout]);
  const size = stage.size;
  const view = useMemo(
    () => (layout && size ? officeView(layout, size.width, size.height) : null),
    [layout, size],
  );

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

  // An agent picked in the scene lights its card; pointing at a card lights the agent (D3).
  const pick = (agent: OfficeAgent) => {
    setSelected(agent.id);
    setTab('team');
  };
  const lit = pointed ?? selected;
  const figures = geometry ? figuresOf(agents, geometry, scene) : new Map<string, never>();
  const pending = approvals?.filter((approval) => approval.status === 'pending').length ?? 0;

  return (
    <>
      <PageHeader
        title="Escritório"
        description="Cada área tem a sua sala e cada agente, a sua mesa. Clique num agente na cena para achar o cartão dele; o cartão abre a conversa."
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
                  className={`absolute -top-1 -right-1 grid min-w-5 place-items-center rounded-full px-1 text-xs font-bold text-ink ${TONES.fail.dot}`}
                  aria-hidden
                >
                  {pending}
                </span>
              )}
            </Link>
          </div>
        }
      />

      <Tip id="office-pick" className="mb-3">
        Clique num agente na cena para destacar o cartão dele à direita; passar o mouse num cartão
        acende o agente na cena.
      </Tip>

      {isPending && <LoadingState label="Carregando o escritório…" />}

      {error && !data && (
        <ErrorState
          title="Não foi possível carregar o escritório."
          error={error}
          onRetry={() => void refetch()}
        />
      )}

      {data && layout && geometry && places && bounds && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_21rem]">
          <div className="min-w-0 space-y-4">
            <div
              ref={stage.ref}
              data-office-scene={webgl ? '' : undefined}
              className="office-stage relative h-[min(46dvh,44rem)] min-h-80 overflow-hidden rounded-xl border border-line"
            >
              {webgl ? (
                view && (
                  <>
                    <Suspense fallback={null}>
                      <OfficeCanvas
                        layout={layout}
                        agents={agents}
                        scene={scene}
                        looks={new Map([...figures].map(([id, figure]) => [id, figure.request]))}
                        screens={deskScreens(agents, geometry, places)}
                        view={view}
                        light={light}
                        reduced={reduced}
                        lit={lit}
                      />
                    </Suspense>
                    <OfficeOverlay
                      layout={layout}
                      projects={data.projects}
                      agents={agents}
                      figures={figures}
                      balloons={balloons}
                      view={view}
                      light={light}
                      scene={scene}
                      onAgent={pick}
                      lit={lit}
                    />
                  </>
                )
              ) : (
                <OfficeDrawing
                  className="absolute inset-0 size-full select-none"
                  viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`}
                  layout={layout}
                  projects={data.projects}
                  agents={agents}
                  geometry={geometry}
                  places={places}
                  scene={scene}
                  balloons={balloons}
                  onAgent={pick}
                />
              )}
            </div>
            <IndicatorRow />
          </div>

          <aside
            aria-label="Time e atividade"
            className="surface-glass rounded-xl border border-line lg:relative"
          >
            {/* On a wide screen the column is as tall as the scene and the quick actions beside it. */}
            <div className="flex min-h-0 flex-col lg:absolute lg:inset-0">
              {/* A new installation's first steps (Phase 32), above the team, until done or put aside. */}
              <FirstSteps className="m-2 mb-0 max-h-3/5 shrink-0 overflow-y-auto" />
              {/* On a phone the team and the activity take turns under the scene (D8). */}
              <div role="tablist" aria-label="Mostrar" className="flex gap-1 p-2 lg:hidden">
                {SIDE_TABS.map((each) => (
                  <button
                    key={each.id}
                    type="button"
                    role="tab"
                    id={`office-tab-${each.id}`}
                    aria-selected={tab === each.id}
                    aria-controls={`office-panel-${each.id}`}
                    onClick={() => setTab(each.id)}
                    className={`min-h-10 flex-1 rounded-lg px-3 text-sm font-semibold ${
                      tab === each.id ? 'bg-accent text-white' : 'text-chalk hover:bg-sheet-raised'
                    }`}
                  >
                    {each.label}
                  </button>
                ))}
              </div>
              <div
                id="office-panel-team"
                className={`min-h-0 flex-col overflow-hidden lg:flex lg:flex-[3] ${tab === 'team' ? 'flex flex-1' : 'hidden'}`}
              >
                <OfficePanel
                  agents={agents}
                  places={places}
                  seated={(id) => scene.view(id)?.seated ?? places.get(id)?.kind === 'desk'}
                  rooms={rooms}
                  balloons={balloons}
                  onDecide={setDeciding}
                  now={now}
                  selected={selected}
                  onHighlight={setPointed}
                />
              </div>
              <div
                id="office-panel-activity"
                className={`min-h-0 flex-col overflow-hidden border-line lg:flex lg:flex-[2] lg:border-t ${
                  tab === 'activity' ? 'flex flex-1' : 'hidden'
                }`}
              >
                <RecentActivity />
              </div>
              {/* While the first steps are open they are the way forward: the quick actions wait. */}
              {!firstSteps && <QuickActions hasAreas={data.projects.length > 0} />}
            </div>
          </aside>
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
