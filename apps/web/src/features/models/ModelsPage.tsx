import {
  type ConnectionTest,
  type Provider,
  PROVIDER_KIND_INFO,
  type ProviderModel,
} from '@ea/shared';
import { CircleCheck, CircleX, Pencil, Plus, RefreshCw, Trash2, Wifi } from 'lucide-react';
import { useState } from 'react';
import { Button, IconButton } from '../../components/Button';
import { Switch } from '../../components/Form';
import { ConfirmDialog } from '../../components/Modal';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '../../components/States';
import { useToast } from '../../components/Toast';
import { errorMessage } from '../../lib/errors';
import { formatCount, plural } from '../../lib/format';
import {
  useDeleteProvider,
  useProviderModels,
  useProviders,
  useSyncModels,
  useTestProvider,
  useUpdateModel,
} from '../../lib/provider-queries';
import { ExternalNotice } from './ExternalNotice';
import { ProviderDialog } from './ProviderDialog';

function ModelRow({ model }: { model: ProviderModel }) {
  const update = useUpdateModel();
  const notify = useToast();

  const toggle = (enabled: boolean) =>
    update.mutate(
      { id: model.id, patch: { enabled } },
      {
        onSuccess: () => notify(`${model.displayName} ${enabled ? 'habilitado' : 'desabilitado'}.`),
        onError: (error) => notify(errorMessage(error), 'fail'),
      },
    );

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2">
      <div className="min-w-0 flex-1 basis-48">
        <p className="truncate font-semibold" title={model.name}>
          {model.displayName}
        </p>
        <p className="text-sm text-dim">
          {model.supportsTools ? 'Aceita ferramentas' : 'Só conversa'}
          {model.agentCount > 0 && `, usado por ${plural(model.agentCount, 'agente', 'agentes')}`}
        </p>
      </div>
      <Switch
        checked={model.enabled}
        onChange={toggle}
        disabled={update.isPending}
        label={`${model.displayName} habilitado`}
      >
        <span className="w-24 text-left text-dim">
          {model.enabled ? 'Habilitado' : 'Desabilitado'}
        </span>
      </Switch>
    </li>
  );
}

function ModelList({ provider }: { provider: Provider }) {
  const { data: models, error, isPending, refetch } = useProviderModels(provider.id);

  if (isPending) return <LoadingState label="Carregando os modelos…" />;
  if (error && !models) {
    return (
      <ErrorState
        title="Não foi possível carregar os modelos."
        error={error}
        onRetry={() => void refetch()}
      />
    );
  }
  if (!models || models.length === 0) {
    return (
      <EmptyState title="Nenhum modelo carregado.">
        Use “Atualizar modelos” para buscar a lista no provedor.
      </EmptyState>
    );
  }
  return (
    <ul className="divide-y divide-line" aria-label={`Modelos de ${provider.name}`}>
      {models.map((model) => (
        <ModelRow key={model.id} model={model} />
      ))}
    </ul>
  );
}

function TestResult({ result }: { result: ConnectionTest }) {
  const Icon = result.ok ? CircleCheck : CircleX;
  return (
    <p role="status" className="flex items-start gap-2 px-4 pb-3 text-sm">
      <Icon
        className={`mt-0.5 size-4.5 shrink-0 ${result.ok ? 'text-ok' : 'text-fail'}`}
        aria-hidden
      />
      <span>
        {result.message}
        {result.ok && (
          <span className="text-dim"> Respondeu em {formatCount(result.latencyMs)} ms.</span>
        )}
      </span>
    </p>
  );
}

interface ProviderCardProps {
  provider: Provider;
  onEdit: (provider: Provider) => void;
  onDelete: (provider: Provider) => void;
}

function ProviderCard({ provider, onEdit, onDelete }: ProviderCardProps) {
  const test = useTestProvider();
  const sync = useSyncModels();
  const notify = useToast();
  const info = PROVIDER_KIND_INFO[provider.kind];
  const headingId = `provider-${provider.id}`;

  const refreshModels = () =>
    sync.mutate(provider.id, {
      onSuccess: (result) => {
        const changes = [
          result.added > 0 && plural(result.added, 'novo', 'novos'),
          result.removed > 0 && plural(result.removed, 'removido', 'removidos'),
        ].filter(Boolean);
        notify(
          `Modelos atualizados: ${plural(result.models.length, 'modelo', 'modelos')}${
            changes.length > 0 ? ` (${changes.join(', ')})` : ''
          }.`,
        );
      },
      onError: (error) => notify(errorMessage(error), 'fail'),
    });

  return (
    <section aria-labelledby={headingId} className="rounded-lg border border-line bg-sheet">
      <header className="flex flex-wrap items-start gap-x-4 gap-y-2 border-b border-line px-4 py-3">
        <div className="min-w-0 flex-1 basis-64">
          <h2 id={headingId} className="truncate text-lg font-semibold">
            {provider.name}
          </h2>
          <p className="text-sm text-dim">
            {info.label}
            {', '}
            <span className={provider.isExternal ? 'text-wait' : 'text-ok'}>
              {provider.isExternal ? 'externo' : 'neste computador'}
            </span>
          </p>
        </div>
        <div className="flex">
          <IconButton label={`Editar ${provider.name}`} onClick={() => onEdit(provider)}>
            <Pencil className="size-4.5" aria-hidden />
          </IconButton>
          <IconButton label={`Excluir ${provider.name}`} onClick={() => onDelete(provider)}>
            <Trash2 className="size-4.5" aria-hidden />
          </IconButton>
        </div>
      </header>

      <dl className="grid gap-x-6 gap-y-2 px-4 py-3 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="text-dim">Endereço</dt>
        <dd className="break-all">{provider.baseUrl}</dd>
        <dt className="text-dim">Chave de API</dt>
        <dd>
          {provider.hasApiKey
            ? `Guardada no cofre do sistema (${provider.apiKeyHint ?? '…'})`
            : info.apiKey === 'none'
              ? 'Não usa'
              : 'Nenhuma'}
        </dd>
        <dt className="text-dim">Em uso</dt>
        <dd>
          {provider.agentCount === 0
            ? 'Nenhum agente usa este provedor'
            : plural(provider.agentCount, 'agente', 'agentes')}
        </dd>
      </dl>

      {provider.isExternal && (
        <div className="px-4 pb-3">
          <ExternalNotice />
        </div>
      )}

      <div className="flex flex-wrap gap-3 px-4 pb-3">
        <Button onClick={() => test.mutate(provider.id)} disabled={test.isPending}>
          <Wifi className="size-4.5" aria-hidden />
          {test.isPending ? 'Testando…' : 'Testar conexão'}
        </Button>
        <Button onClick={refreshModels} disabled={sync.isPending}>
          <RefreshCw className="size-4.5" aria-hidden />
          {sync.isPending ? 'Buscando…' : 'Atualizar modelos'}
        </Button>
      </div>

      {test.data && !test.isPending && <TestResult result={test.data} />}
      {test.error && !test.isPending && (
        <p role="alert" className="px-4 pb-3 text-sm text-fail">
          {errorMessage(test.error)}
        </p>
      )}

      <div className="border-t border-line">
        <h3 className="px-4 pt-3 text-sm font-semibold">
          Modelos
          <span className="ml-2 font-normal text-dim">
            {provider.enabledModelCount} de {provider.modelCount} habilitados
          </span>
        </h3>
        <ModelList provider={provider} />
      </div>
    </section>
  );
}

function DeleteProviderDialog({ provider, onClose }: { provider: Provider; onClose: () => void }) {
  const remove = useDeleteProvider();
  const notify = useToast();
  return (
    <ConfirmDialog
      title={`Excluir ${provider.name}?`}
      confirmLabel="Excluir provedor"
      busy={remove.isPending}
      error={remove.error ? errorMessage(remove.error) : undefined}
      onCancel={onClose}
      onConfirm={() =>
        remove.mutate(provider.id, {
          onSuccess: () => {
            notify(`${provider.name} excluído.`);
            onClose();
          },
        })
      }
    >
      O provedor e a lista de modelos dele são removidos
      {provider.hasApiKey && ', e a chave de API é apagada do cofre do sistema'}. Esta ação não pode
      ser desfeita.
    </ConfirmDialog>
  );
}

export function ModelsPage() {
  const { data: providers, error, isPending, refetch } = useProviders();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Provider | null>(null);
  const [deleting, setDeleting] = useState<Provider | null>(null);

  return (
    <>
      <PageHeader
        title="Modelos"
        description="Os provedores de IA conectados e os modelos que os agentes podem usar."
        actions={
          <Button variant="primary" onClick={() => setAdding(true)}>
            <Plus className="size-4.5" aria-hidden />
            Adicionar provedor
          </Button>
        }
      />

      {isPending && <LoadingState label="Carregando os provedores…" />}

      {error && !providers && (
        <ErrorState
          title="Não foi possível carregar os provedores."
          error={error}
          onRetry={() => void refetch()}
        />
      )}

      {providers?.length === 0 && (
        <div className="rounded-lg border border-line bg-sheet">
          <EmptyState
            title="Nenhum provedor conectado."
            action={
              <Button variant="primary" onClick={() => setAdding(true)}>
                Adicionar o primeiro provedor
              </Button>
            }
          >
            Os agentes precisam de um modelo de IA para trabalhar. Com o Ollama instalado, os
            modelos rodam neste computador, sem custo e sem enviar dados para fora.
          </EmptyState>
        </div>
      )}

      {providers && providers.length > 0 && (
        <div className="space-y-6">
          {providers.map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              onEdit={setEditing}
              onDelete={setDeleting}
            />
          ))}
        </div>
      )}

      {adding && <ProviderDialog onClose={() => setAdding(false)} />}
      {editing && <ProviderDialog provider={editing} onClose={() => setEditing(null)} />}
      {deleting && <DeleteProviderDialog provider={deleting} onClose={() => setDeleting(null)} />}
    </>
  );
}
