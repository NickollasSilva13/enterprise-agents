import type { SystemInfo } from '@ea/shared';
import { PageHeader } from '../../components/PageHeader';
import { Panel } from '../../components/Panel';
import { ErrorState, LoadingState } from '../../components/States';
import { formatDateTime } from '../../lib/format';
import { useSystemInfo } from '../../lib/queries';
import { ProfilePanel } from './ProfilePanel';

const ENVIRONMENTS: Record<SystemInfo['environment'], string> = {
  production: 'Uso normal',
  development: 'Desenvolvimento',
  test: 'Teste',
};

const rows = (info: SystemInfo): [label: string, value: string][] => [
  ['Versão', info.version],
  ['Endereço', info.address],
  ['Modo', ENVIRONMENTS[info.environment]],
  ['Iniciado em', formatDateTime(info.startedAt)],
  ['Pasta de dados', info.dataDir],
  ['Banco de dados', info.databasePath],
  ['Execuções simultâneas', String(info.maxConcurrentRuns)],
  [
    'Chaves de API',
    info.secretStore === 'os'
      ? 'Guardadas no cofre de credenciais do sistema'
      : 'Só na memória: perdidas ao encerrar (modo de teste)',
  ],
  ['Node.js', `${info.nodeVersion} (${info.platform})`],
];

export function SettingsPage() {
  const { data, error, isPending, refetch } = useSystemInfo();

  return (
    <>
      <PageHeader
        title="Configurações"
        description="Seu perfil e como esta instalação está configurada."
      />

      <ProfilePanel />

      <Panel title="Sistema" className="max-w-3xl">
        {isPending && <LoadingState label="Carregando as configurações…" />}
        {error && !data && (
          <ErrorState
            title="Não foi possível carregar as configurações."
            error={error}
            onRetry={() => void refetch()}
          />
        )}
        {data && (
          <dl className="divide-y divide-line">
            {rows(data).map(([label, value]) => (
              <div key={label} className="gap-4 px-4 py-2.5 sm:grid sm:grid-cols-[13rem_1fr]">
                <dt className="text-sm text-dim">{label}</dt>
                <dd className="break-all">{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </Panel>

      <p className="mt-4 max-w-3xl text-sm text-dim">
        Para mudar a porta, a pasta de dados ou o limite de execuções, edite o arquivo{' '}
        <code className="text-chalk">.env</code> na pasta do projeto e reinicie a aplicação. O
        servidor só aceita conexões deste computador, e isso não é configurável.
      </p>
    </>
  );
}
