import type { RunSummary, RunTreeNode } from '@ea/shared';
import { ArrowLeft, Square } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { ApprovalCard } from '../../components/ApprovalCard';
import { Button } from '../../components/Button';
import { Panel } from '../../components/Panel';
import { ErrorState, LoadingState } from '../../components/States';
import { errorMessage } from '../../lib/errors';
import { formatCount, formatDateTime, formatDuration, NO_VALUE } from '../../lib/format';
import { endReasonText, isActiveRun, RUN_STATUS } from '../../lib/run-labels';
import { useCancelRun, useRunDetail } from '../../lib/run-queries';
import { useApprovals } from '../../lib/tool-queries';
import { RunTimeline } from './RunTimeline';

const TRIGGERS: Record<RunSummary['trigger'], string> = {
  chat: 'Mensagem no chat',
  manual: 'Execução manual',
  delegation: 'Delegação de outro agente',
  task: 'Tarefa do quadro',
};

function Facts({ run }: { run: RunSummary }) {
  const facts: [string, string][] = [
    ['Origem', TRIGGERS[run.trigger]],
    ['Criada em', formatDateTime(run.createdAt)],
    ['Iniciada em', run.startedAt ? formatDateTime(run.startedAt) : NO_VALUE],
    ['Duração', formatDuration(run.durationMs)],
    ['Tokens de entrada', formatCount(run.inputTokens)],
    ['Tokens de saída', formatCount(run.outputTokens)],
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 p-4 text-sm sm:grid-cols-3">
      {facts.map(([label, value]) => (
        <div key={label}>
          <dt className="text-dim">{label}</dt>
          <dd className="font-semibold">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

const INDENT = ['', 'ml-6', 'ml-12', 'ml-18', 'ml-24'];

/** The delegation tree: who asked whom, and how each run ended (RF-62). */
function RunTree({ nodes, currentId }: { nodes: readonly RunTreeNode[]; currentId: string }) {
  return (
    <ul aria-label="Árvore de execução" className="space-y-2 p-4 text-sm">
      {nodes.map(({ run, depth }) => {
        const current = run.id === currentId;
        return (
          <li
            key={run.id}
            className={`${INDENT[Math.min(depth, INDENT.length - 1)]} flex flex-wrap items-baseline gap-x-3 rounded-md border px-3 py-2 ${
              current ? 'border-info bg-sheet-raised' : 'border-line'
            }`}
          >
            <span className="font-semibold">
              {depth > 0 && <span aria-hidden>↳ </span>}
              {run.agentName}
            </span>
            <span className={RUN_STATUS[run.status].tone}>{RUN_STATUS[run.status].label}</span>
            <span className="text-dim">
              {depth === 0 ? 'iniciada por você' : 'tarefa delegada'} ·{' '}
              {formatDuration(run.durationMs)}
            </span>
            {current ? (
              <span className="ml-auto text-dim" aria-current="true">
                Você está aqui
              </span>
            ) : (
              <Link
                to={`/logs/${run.id}`}
                className="ml-auto text-info underline underline-offset-4"
                aria-label={`Abrir a execução de ${run.agentName}`}
              >
                Abrir
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** One run, step by step (RF-33, RF-34, UC-07). Refreshes by itself while it is active. */
export function RunDetailPage() {
  const { runId } = useParams();
  const { data, error, isPending, refetch } = useRunDetail(runId);
  const cancel = useCancelRun();
  const { data: pending } = useApprovals();
  const run = data?.run;
  const approvals = (pending ?? []).filter((approval) => approval.runId === runId);
  const failed = run?.status === 'failed' || run?.status === 'timed_out';

  return (
    <>
      <header className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-3">
        <Link
          to="/logs"
          aria-label="Voltar para os logs"
          title="Voltar para os logs"
          className="grid size-10 shrink-0 place-items-center rounded-md text-dim hover:bg-sheet-raised hover:text-chalk"
        >
          <ArrowLeft className="size-5" aria-hidden />
        </Link>
        <div className="min-w-0 flex-1 basis-52">
          <h1 className="truncate text-2xl font-bold tracking-tight">
            {run ? `Execução de ${run.agentName}` : 'Execução'}
          </h1>
          {run && (
            <p className="text-sm">
              <span className={RUN_STATUS[run.status].tone}>{RUN_STATUS[run.status].label}</span>
              {run.agentDeleted && <span className="text-dim"> · agente excluído</span>}
            </p>
          )}
        </div>
        {run && isActiveRun(run.status) && (
          <Button
            variant="danger"
            onClick={() => cancel.mutate(run.id)}
            disabled={cancel.isPending}
          >
            <Square className="size-4" aria-hidden />
            Interromper
          </Button>
        )}
      </header>

      {isPending && <LoadingState label="Carregando a execução…" />}

      {error && !data && (
        <ErrorState
          title="Não foi possível carregar a execução."
          error={error}
          onRetry={() => void refetch()}
        />
      )}

      {cancel.error && (
        <p role="alert" className="mb-4 text-sm text-fail">
          {errorMessage(cancel.error)}
        </p>
      )}

      {data && run && (
        <div className="space-y-6">
          {(run.errorMessage || (run.endReason && run.endReason !== 'completed')) && (
            <div
              role={failed ? 'alert' : undefined}
              className={`rounded-lg border p-4 ${failed ? 'border-fail' : 'border-line bg-sheet'}`}
            >
              <p className={`font-semibold ${failed ? 'text-fail' : ''}`}>
                {run.errorMessage ?? endReasonText(run.endReason)}
              </p>
              {run.errorMessage && run.endReason && (
                <p className="mt-1 text-sm text-dim">{endReasonText(run.endReason)}</p>
              )}
            </div>
          )}

          {approvals.map((approval) => (
            <ApprovalCard key={approval.id} approval={approval} context="chat" />
          ))}

          <Panel
            title="Resumo"
            aside={
              run.conversationId &&
              !run.agentDeleted && (
                <Link
                  to={`/agentes/${run.agentId}/conversa/${run.conversationId}`}
                  className="text-info underline underline-offset-4"
                >
                  Abrir a conversa
                </Link>
              )
            }
          >
            <Facts run={run} />
          </Panel>

          {data.tree.length > 1 && (
            <Panel title="Delegações" aside={`${formatCount(data.tree.length)} execuções ligadas`}>
              <RunTree nodes={data.tree} currentId={run.id} />
            </Panel>
          )}

          <Panel title="Passos" aside={`${formatCount(data.steps.length)} registrados`}>
            <div className="p-4">
              {data.steps.length === 0 ? (
                <p className="text-sm text-dim">
                  {isActiveRun(run.status)
                    ? 'A execução ainda não começou.'
                    : 'Esta execução não registrou passos.'}
                </p>
              ) : (
                <RunTimeline steps={data.steps} label="Passos da execução" />
              )}
            </div>
          </Panel>
        </div>
      )}
    </>
  );
}
