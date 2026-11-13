import type { DashboardAlert, DashboardSummary, RecentRun, RunStatus } from '@ea/shared';
import { CircleAlert, Info, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router';
import { type Column, DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { Panel } from '../../components/Panel';
import { type Stat, StatBoard } from '../../components/StatBoard';
import { EmptyState, ErrorState, LoadingState, PlannedNote } from '../../components/States';
import {
  formatCount,
  formatDateTime,
  formatDuration,
  formatPercent,
  formatTime,
  plural,
} from '../../lib/format';
import { useDashboardSummary } from '../../lib/queries';

const RUN_STATUS: Record<RunStatus, { label: string; tone: string }> = {
  queued: { label: 'Na fila', tone: 'text-dim' },
  running: { label: 'Em andamento', tone: 'text-ok' },
  waiting_approval: { label: 'Aguardando aprovação', tone: 'text-wait' },
  completed: { label: 'Concluída', tone: 'text-chalk' },
  failed: { label: 'Falhou', tone: 'text-fail' },
  cancelled: { label: 'Cancelada', tone: 'text-dim' },
  timed_out: { label: 'Tempo esgotado', tone: 'text-fail' },
  interrupted: { label: 'Interrompida', tone: 'text-dim' },
};

const RUN_COLUMNS: readonly Column<RecentRun>[] = [
  { header: 'Agente', cell: (run) => run.agentName },
  {
    header: 'Estado',
    cell: (run) => (
      <span className={RUN_STATUS[run.status].tone}>{RUN_STATUS[run.status].label}</span>
    ),
  },
  { header: 'Início', cell: (run) => formatDateTime(run.createdAt), wideOnly: true },
  { header: 'Duração', cell: (run) => formatDuration(run.durationMs), align: 'right' },
];

function alertText(alert: DashboardAlert): string {
  switch (alert.kind) {
    case 'failed_agents':
      return `${plural(alert.count, 'agente falhou', 'agentes falharam')} na última execução.`;
    case 'pending_approvals':
      return `${plural(alert.count, 'ação espera', 'ações esperam')} a sua aprovação.`;
    case 'agents_without_model':
      return `${plural(alert.count, 'agente ativo está', 'agentes ativos estão')} sem modelo e não pode trabalhar.`;
    case 'no_provider':
      return 'Nenhum provedor de modelos conectado. Os agentes precisam de um para trabalhar.';
  }
}

const ALERT_ICON = {
  error: { icon: CircleAlert, tone: 'text-fail' },
  warning: { icon: TriangleAlert, tone: 'text-wait' },
  info: { icon: Info, tone: 'text-info' },
} as const;

function Alerts({ alerts }: { alerts: readonly DashboardAlert[] }) {
  if (alerts.length === 0) {
    return <EmptyState title="Nada pede a sua atenção agora." />;
  }
  return (
    <ul className="divide-y divide-line">
      {alerts.map((alert) => {
        const { icon: Icon, tone } = ALERT_ICON[alert.severity];
        return (
          <li key={alert.kind} className="flex gap-3 px-4 py-3 text-sm">
            <Icon className={`mt-0.5 size-4.5 shrink-0 ${tone}`} aria-hidden />
            <div>
              <p>{alertText(alert)}</p>
              {alert.kind === 'no_provider' && (
                <Link
                  to="/modelos"
                  className="mt-1 inline-block text-info underline underline-offset-4"
                >
                  Conectar um provedor
                </Link>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function agentStats({ agents }: DashboardSummary): Stat[] {
  return [
    { label: 'Agentes cadastrados', value: formatCount(agents.total) },
    { label: 'Ativos', value: formatCount(agents.active) },
    { label: 'Inativos', value: formatCount(agents.inactive) },
    {
      label: 'Com falha',
      value: formatCount(agents.failed),
      tone: agents.failed > 0 ? 'fail' : 'neutral',
    },
  ];
}

function runStats({ runs }: DashboardSummary): Stat[] {
  const day = runs.last24h;
  return [
    {
      label: 'Execuções em andamento',
      value: formatCount(runs.active),
      tone: runs.active > 0 ? 'ok' : 'neutral',
    },
    {
      label: 'Aguardando aprovação',
      value: formatCount(runs.waitingApproval),
      tone: runs.waitingApproval > 0 ? 'wait' : 'neutral',
    },
    { label: 'Concluídas em 24 h', value: formatCount(day.completed) },
    { label: 'Taxa de sucesso em 24 h', value: formatPercent(day.successRate) },
    { label: 'Duração média em 24 h', value: formatDuration(day.averageDurationMs) },
    { label: 'Tokens em 24 h', value: formatCount(day.inputTokens + day.outputTokens) },
  ];
}

export function DashboardPage() {
  const { data, error, isPending, refetch } = useDashboardSummary();

  return (
    <>
      <PageHeader
        title="Painel"
        description={data ? `Atualizado às ${formatTime(data.generatedAt)}` : undefined}
      />

      {isPending && <LoadingState label="Carregando o painel…" />}

      {error && !data && (
        <ErrorState
          title="Não foi possível carregar o painel."
          error={error}
          onRetry={() => void refetch()}
        />
      )}

      {data && (
        <div className="space-y-6">
          <StatBoard label="Agentes" stats={agentStats(data)} />
          <StatBoard label="Execuções" stats={runStats(data)} />

          <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <Panel
              title="Execuções recentes"
              aside={plural(data.recentRuns.length, 'execução', 'execuções')}
            >
              {data.recentRuns.length === 0 ? (
                <EmptyState title="Nenhuma execução ainda.">
                  <p>Cada vez que um agente trabalhar, a execução aparece aqui.</p>
                  <div className="mt-2">
                    <PlannedNote phase={7}>Executar agentes ainda não é possível.</PlannedNote>
                  </div>
                </EmptyState>
              ) : (
                <DataTable
                  caption="Execuções recentes"
                  columns={RUN_COLUMNS}
                  rows={data.recentRuns}
                  rowKey={(run) => run.id}
                />
              )}
            </Panel>

            <Panel title="Alertas">
              <Alerts alerts={data.alerts} />
            </Panel>
          </div>

          <Panel title="Atividade dos agentes">
            <div className="px-4 py-4">
              <PlannedNote phase={7}>
                O que cada agente está fazendo, passo a passo e em tempo real.
              </PlannedNote>
            </div>
          </Panel>
        </div>
      )}
    </>
  );
}
