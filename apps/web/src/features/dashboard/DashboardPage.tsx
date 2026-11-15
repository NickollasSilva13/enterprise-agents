import type { ActivityItem, DashboardAlert, DashboardSummary, RecentRun } from '@ea/shared';
import { CircleAlert, Info, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router';
import { type Column, DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { Panel } from '../../components/Panel';
import { type Stat, StatBoard } from '../../components/StatBoard';
import { EmptyState, ErrorState, LoadingState } from '../../components/States';
import {
  formatCount,
  formatDateTime,
  formatDuration,
  formatPercent,
  formatTime,
  plural,
} from '../../lib/format';
import { useDashboardSummary } from '../../lib/queries';
import { RUN_STATUS } from '../../lib/run-labels';

const RUN_COLUMNS: readonly Column<RecentRun>[] = [
  {
    header: 'Agente',
    cell: (run) => (
      <Link to={`/logs/${run.id}`} className="underline-offset-4 hover:underline">
        {run.agentName}
      </Link>
    ),
  },
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
    case 'provider_unreachable':
      return `${plural(alert.count, 'agente não conseguiu', 'agentes não conseguiram')} falar com o provedor do modelo na última execução.`;
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
              {alert.kind === 'provider_unreachable' && (
                <Link
                  to="/modelos"
                  className="mt-1 inline-block text-info underline underline-offset-4"
                >
                  Testar a conexão
                </Link>
              )}
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

/** What an activity item says, after the agent's name (RF-04). */
function activityText(item: ActivityItem): { text: string; tone: string } {
  if (item.kind === 'started') return { text: 'começou a trabalhar', tone: 'text-ok' };
  switch (item.status) {
    case 'completed':
      return { text: 'concluiu a execução', tone: 'text-chalk' };
    case 'failed':
      return { text: 'falhou na execução', tone: 'text-fail' };
    case 'timed_out':
      return { text: 'passou do tempo máximo', tone: 'text-fail' };
    case 'cancelled':
      return { text: 'foi interrompido por você', tone: 'text-dim' };
    case 'interrupted':
      return { text: 'foi interrompido pelo encerramento do servidor', tone: 'text-dim' };
    default:
      return { text: 'encerrou a execução', tone: 'text-dim' };
  }
}

function Activity({ items }: { items: readonly ActivityItem[] }) {
  if (items.length === 0) {
    return (
      <EmptyState title="Nenhuma atividade ainda.">
        O que os agentes começam e terminam aparece aqui, do mais recente para o mais antigo.
      </EmptyState>
    );
  }
  return (
    <ol className="divide-y divide-line" aria-label="Atividade dos agentes">
      {items.map((item) => {
        const { text, tone } = activityText(item);
        return (
          <li key={item.id} className="flex flex-wrap items-baseline gap-x-3 px-4 py-2.5 text-sm">
            <time dateTime={item.at} className="w-20 shrink-0 text-dim">
              {formatTime(item.at)}
            </time>
            <p className="min-w-0 flex-1">
              <Link to={`/logs/${item.runId}`} className="font-semibold hover:underline">
                {item.agentName}
              </Link>{' '}
              <span className={tone}>{text}</span>
            </p>
          </li>
        );
      })}
    </ol>
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
                  Cada vez que um agente trabalhar, a execução aparece aqui. Para começar, abra um
                  agente e envie uma mensagem.
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
            <Activity items={data.activity} />
          </Panel>
        </div>
      )}
    </>
  );
}
