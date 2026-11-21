import type { Approval } from '@ea/shared';
import { Link } from 'react-router';
import { ApprovalCard } from '../../components/ApprovalCard';
import { buttonClass } from '../../components/Button';
import { PageHeader } from '../../components/PageHeader';
import { Panel } from '../../components/Panel';
import { EmptyState, ErrorState, LoadingState } from '../../components/States';
import { StatusPill } from '../../components/StatusPill';
import { formatDateTime, plural } from '../../lib/format';
import type { Tone } from '../../lib/tone';
import { useRequests, useWaitingTasks } from '../../lib/task-queries';
import { useApprovals } from '../../lib/tool-queries';
import { TaskStatus } from '../tasks/TaskBadges';
import { LINK } from '../../components/TextLink';
import { Tip } from '../../components/Tip';

const OUTCOME: Record<Approval['status'], { label: string; tone: Tone; why?: string }> = {
  pending: { label: 'Pendente', tone: 'wait' },
  approved: { label: 'Aprovada', tone: 'ok' },
  denied: { label: 'Negada', tone: 'fail' },
  cancelled: {
    label: 'Retirada',
    tone: 'idle',
    why: 'A execução terminou antes da resposta.',
  },
};

function DecidedList({ approvals }: { approvals: readonly Approval[] }) {
  return (
    <ul className="divide-y divide-line">
      {approvals.map((approval) => (
        <li key={approval.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-2.5">
          <p className="min-w-0 flex-1 basis-56">
            <span className="font-semibold">{approval.agentName}</span>
            <span className="text-dim"> · {approval.toolTitle}</span>
            {approval.reason && (
              <span className="block text-sm text-dim">Motivo: {approval.reason}</span>
            )}
          </p>
          <p className="text-sm text-dim">
            <StatusPill tone={OUTCOME[approval.status].tone}>
              {OUTCOME[approval.status].label}
            </StatusPill>
            {OUTCOME[approval.status].why && <> {OUTCOME[approval.status].why}</>}
          </p>
          <p className="text-sm text-dim">
            {formatDateTime(approval.decidedAt ?? approval.createdAt)} ·{' '}
            <Link to={`/logs/${approval.runId}`} className={LINK}>
              Execução
            </Link>
          </p>
        </li>
      ))}
    </ul>
  );
}

/** Board tasks that wait for the user: in a stage of theirs, or stopped (Phase 16). */
function WaitingTasks() {
  const waiting = useWaitingTasks();
  if (!waiting.data || waiting.data.length === 0) return null;
  return (
    <Panel
      title="Tarefas esperando você"
      aside={plural(waiting.data.length, 'tarefa', 'tarefas')}
      className="mb-6"
    >
      <ul className="divide-y divide-line">
        {waiting.data.map((task) => (
          <li key={task.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-2.5">
            <p className="min-w-0 flex-1 basis-56">
              <Link to={`/tarefas/${task.id}`} className={`font-semibold ${LINK}`}>
                {task.title}
              </Link>
              <span className="text-dim">
                {' '}
                · {task.areaName} · {task.stageName}
              </span>
              {task.attention && <span className="block text-sm text-dim">{task.attention}</span>}
            </p>
            <TaskStatus task={task} />
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** Requests between areas that wait for the user's approval before reaching the other board (Phase 17). */
function PendingRequests() {
  const requests = useRequests();
  const pending = requests.data?.filter((request) => request.state === 'pending') ?? [];
  if (pending.length === 0) return null;
  return (
    <Panel
      title="Pedidos entre áreas esperando você"
      aside={plural(pending.length, 'pedido', 'pedidos')}
      className="mb-6"
    >
      <ul className="divide-y divide-line">
        {pending.map((request) => (
          <li key={request.id} className="px-4 py-2.5">
            <Link to={`/tarefas/${request.id}`} className={`font-semibold ${LINK}`}>
              {request.title}
            </Link>
            <span className="text-dim">
              {' '}
              · {request.fromAreaName} → {request.toAreaName}
            </span>
          </li>
        ))}
      </ul>
      <p className="border-t border-line px-4 py-2.5 text-sm">
        <Link to="/tarefas/pedidos" className={LINK}>
          Aprovar ou recusar em Pedidos entre áreas
        </Link>
      </p>
    </Panel>
  );
}

/** The queue of actions waiting for the user, and what was decided before (RF-54). */
export function ApprovalsPage() {
  const pending = useApprovals('pending');
  const decided = useApprovals('decided');

  return (
    <>
      <PageHeader
        title="Aprovações"
        description="Ações que um agente quer fazer e que esperam a sua decisão. A execução fica parada até você responder."
      />

      <Tip id="approvals-wait" className="mb-6">
        Enquanto você não responde, a execução do agente fica parada esperando. Nada do que está
        aqui acontece sem a sua decisão.
      </Tip>

      <WaitingTasks />
      <PendingRequests />

      {pending.isPending && <LoadingState label="Carregando as aprovações…" />}
      {pending.error && !pending.data && (
        <ErrorState
          title="Não foi possível carregar as aprovações."
          error={pending.error}
          onRetry={() => void pending.refetch()}
        />
      )}

      {pending.data && (
        <div className="space-y-6">
          <section aria-label="Aprovações pendentes">
            {pending.data.length === 0 ? (
              <div className="rounded-xl border border-line bg-sheet">
                <EmptyState
                  title="Nada esperando por você."
                  action={
                    <Link to="/ferramentas" className={buttonClass()}>
                      Ver as ferramentas dos agentes
                    </Link>
                  }
                >
                  Quando um agente pedir uma ferramenta marcada como “Pede aprovação”, o pedido
                  aparece aqui, com os argumentos exatos. Em Ferramentas você escolhe o que cada
                  agente pode usar sozinho e o que passa por você.
                </EmptyState>
              </div>
            ) : (
              <>
                <p className="mb-3 text-sm text-dim">
                  {plural(pending.data.length, 'ação esperando', 'ações esperando')} a sua decisão.
                </p>
                <ul className="space-y-4">
                  {pending.data.map((approval) => (
                    <li key={approval.id}>
                      <ApprovalCard approval={approval} />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          {decided.data && decided.data.length > 0 && (
            <Panel title="Decisões recentes" aside={`${decided.data.length} mais recentes`}>
              <DecidedList approvals={decided.data} />
            </Panel>
          )}
        </div>
      )}
    </>
  );
}
