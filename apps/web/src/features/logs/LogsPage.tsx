import { RUN_STATUSES, type RunStatus, type RunSummary } from '@ea/shared';
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Button } from '../../components/Button';
import { type Column, DataTable } from '../../components/DataTable';
import { SelectField } from '../../components/Form';
import { PageHeader } from '../../components/PageHeader';
import { Panel } from '../../components/Panel';
import { EmptyState, ErrorState, LoadingState } from '../../components/States';
import { formatCount, formatDateTime, formatDuration, NO_VALUE, plural } from '../../lib/format';
import { useAgents } from '../../lib/queries';
import { RUN_STATUS, totalTokens } from '../../lib/run-labels';
import { type RunFilters, useRuns } from '../../lib/run-queries';

const PERIODS = [
  { value: '24h', label: 'Últimas 24 horas', hours: 24 },
  { value: '7d', label: 'Últimos 7 dias', hours: 24 * 7 },
  { value: '30d', label: 'Últimos 30 dias', hours: 24 * 30 },
] as const;

const COLUMNS: readonly Column<RunSummary>[] = [
  {
    header: 'Início',
    cell: (run) => (
      <Link to={`/logs/${run.id}`} className="text-info underline underline-offset-4">
        {formatDateTime(run.createdAt)}
      </Link>
    ),
  },
  {
    header: 'Agente',
    cell: (run) => (
      <>
        {run.agentName}
        {run.agentDeleted && <span className="text-dim"> (excluído)</span>}
      </>
    ),
  },
  {
    header: 'Estado',
    cell: (run) => (
      <span className={RUN_STATUS[run.status].tone}>{RUN_STATUS[run.status].label}</span>
    ),
  },
  { header: 'Duração', cell: (run) => formatDuration(run.durationMs), align: 'right' },
  {
    header: 'Tokens',
    cell: (run) => (totalTokens(run) > 0 ? formatCount(totalTokens(run)) : NO_VALUE),
    align: 'right',
    wideOnly: true,
  },
];

const isStatus = (value: string | null): value is RunStatus =>
  RUN_STATUSES.some((status) => status === value);

/**
 * Every run of every agent, newest first (RF-71). The filters live in the
 * address, so a filtered view can be linked to: the agent list links here
 * with `?agente=<id>` for the history of one agent (RF-19).
 */
export function LogsPage() {
  const [params, setParams] = useSearchParams();
  const agentId = params.get('agente') ?? '';
  const status = params.get('estado');
  const period = PERIODS.find((option) => option.value === params.get('periodo'));
  const { data: agents } = useAgents();

  const setFilter = (name: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value === '') next.delete(name);
    else next.set(name, value);
    setParams(next, { replace: true });
  };

  // The start of the period is fixed when the filter changes, not on every
  // render; otherwise each render would be a different query.
  const from = useMemo(
    () => (period ? new Date(Date.now() - period.hours * 3_600_000).toISOString() : undefined),
    [period],
  );
  const filters: RunFilters = {
    ...(agentId ? { agentId } : {}),
    ...(isStatus(status) ? { status } : {}),
    ...(from ? { from } : {}),
  };
  const runs = useRuns(filters);
  const rows = runs.data?.pages.flatMap((page) => page.runs) ?? [];
  const filtered = agentId !== '' || isStatus(status) || period !== undefined;

  return (
    <>
      <PageHeader
        title="Logs"
        description="O registro de cada execução. Abra uma para ver o passo a passo."
      />

      <Panel
        title="Execuções"
        aside={
          runs.data &&
          `${plural(rows.length, 'execução', 'execuções')}${runs.hasNextPage ? ' ou mais' : ''}`
        }
      >
        <div className="grid gap-3 border-b border-line p-4 sm:grid-cols-3">
          <SelectField
            label="Agente"
            value={agentId}
            onChange={(event) => setFilter('agente', event.target.value)}
          >
            <option value="">Todos</option>
            {agents?.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
            {/* An agent that was deleted still has history: keep the filter visible. */}
            {agentId !== '' && agents && !agents.some((agent) => agent.id === agentId) && (
              <option value={agentId}>Agente excluído</option>
            )}
          </SelectField>
          <SelectField
            label="Estado"
            value={isStatus(status) ? status : ''}
            onChange={(event) => setFilter('estado', event.target.value)}
          >
            <option value="">Todos</option>
            {RUN_STATUSES.map((option) => (
              <option key={option} value={option}>
                {RUN_STATUS[option].label}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Período"
            value={period?.value ?? ''}
            onChange={(event) => setFilter('periodo', event.target.value)}
          >
            <option value="">Todo o histórico</option>
            {PERIODS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectField>
        </div>

        {runs.isPending && <LoadingState label="Carregando as execuções…" />}

        {runs.error && !runs.data && (
          <ErrorState
            title="Não foi possível carregar as execuções."
            error={runs.error}
            onRetry={() => void runs.refetch()}
          />
        )}

        {runs.data && rows.length === 0 && (
          <EmptyState
            title={
              filtered ? 'Nenhuma execução corresponde aos filtros.' : 'Nenhuma execução ainda.'
            }
          >
            {!filtered && 'Cada mensagem enviada a um agente cria uma execução, que aparece aqui.'}
          </EmptyState>
        )}

        {rows.length > 0 && (
          <>
            <DataTable caption="Execuções" columns={COLUMNS} rows={rows} rowKey={(run) => run.id} />
            {runs.hasNextPage && (
              <div className="border-t border-line p-3 text-center">
                <Button
                  onClick={() => void runs.fetchNextPage()}
                  disabled={runs.isFetchingNextPage}
                >
                  Carregar mais antigas
                </Button>
              </div>
            )}
          </>
        )}
      </Panel>
    </>
  );
}
