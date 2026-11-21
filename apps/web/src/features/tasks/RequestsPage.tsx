import type { AreaLink, RequestSummary } from '@ea/shared';
import { Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Link } from 'react-router';
import { Button, IconButton } from '../../components/Button';
import { SelectField, Switch } from '../../components/Form';
import { ConfirmDialog } from '../../components/Modal';
import { PageHeader } from '../../components/PageHeader';
import { TasksTabs } from './TasksTabs';
import { Panel } from '../../components/Panel';
import { EmptyState, ErrorState, LoadingState } from '../../components/States';
import { useToast } from '../../components/Toast';
import { errorMessage } from '../../lib/errors';
import { formatDateTime } from '../../lib/format';
import { useProjects } from '../../lib/queries';
import {
  useAreaLinks,
  useCreateAreaLink,
  useDecideRequest,
  useDeleteAreaLink,
  useRequests,
  useUpdateAreaLink,
} from '../../lib/task-queries';
import { LINK } from '../../components/TextLink';
import { FormError } from '../../components/Notice';

// Requests between areas (Phase 17): what is open now, and the rules saying
// which area may ask which (D2). Without a rule, no request is accepted.

function RequestItem({ request }: { request: RequestSummary }) {
  const decide = useDecideRequest();
  const notify = useToast();
  return (
    <li className="space-y-2 px-4 py-3 text-sm" data-request={request.id}>
      <p>
        <Link to={`/tarefas/${encodeURIComponent(request.id)}`} className={`font-semibold ${LINK}`}>
          {request.title}
        </Link>
      </p>
      <p className="text-dim">
        {request.fromAreaName} → {request.toAreaName}, pela tarefa{' '}
        <Link to={`/tarefas/${encodeURIComponent(request.parentTaskId)}`} className={LINK}>
          {request.parentTitle}
        </Link>{' '}
        · {formatDateTime(request.createdAt)}
      </p>
      {request.state === 'pending' ? (
        <div className="flex flex-wrap gap-3">
          <Button
            variant="primary"
            disabled={decide.isPending}
            onClick={() =>
              decide.mutate(
                { taskId: request.id, approve: true },
                { onSuccess: () => notify('Pedido aprovado.') },
              )
            }
          >
            Aprovar
          </Button>
          <Button
            disabled={decide.isPending}
            onClick={() =>
              decide.mutate(
                { taskId: request.id, approve: false },
                { onSuccess: () => notify('Pedido recusado.') },
              )
            }
          >
            Recusar
          </Button>
        </div>
      ) : (
        <p>Em andamento, na etapa "{request.stageName}".</p>
      )}
      {decide.error && <FormError>{errorMessage(decide.error)}</FormError>}
    </li>
  );
}

function OpenRequests() {
  const requests = useRequests();
  if (requests.isPending) return <LoadingState label="Carregando os pedidos…" />;
  if (requests.error) {
    return <ErrorState title="Não foi possível carregar os pedidos." error={requests.error} />;
  }
  const pending = requests.data.filter((request) => request.state === 'pending');
  const working = requests.data.filter((request) => request.state !== 'pending');
  return (
    <div className="space-y-6">
      <Panel title="Esperando sua aprovação">
        {pending.length > 0 ? (
          <ul className="divide-y divide-line">
            {pending.map((request) => (
              <RequestItem key={request.id} request={request} />
            ))}
          </ul>
        ) : (
          <p className="px-4 py-3 text-sm text-dim">Nenhum pedido esperando você.</p>
        )}
      </Panel>
      <Panel title="Em andamento">
        {working.length > 0 ? (
          <ul className="divide-y divide-line">
            {working.map((request) => (
              <RequestItem key={request.id} request={request} />
            ))}
          </ul>
        ) : (
          <p className="px-4 py-3 text-sm text-dim">Nenhum pedido em andamento.</p>
        )}
      </Panel>
    </div>
  );
}

function NewRule({ areas }: { areas: readonly { id: string; name: string }[] }) {
  const create = useCreateAreaLink();
  const notify = useToast();
  const [from, setFrom] = useState(areas[0]?.id ?? '');
  const [to, setTo] = useState(areas[1]?.id ?? '');
  const [requiresApproval, setRequiresApproval] = useState(true);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate(
      { fromAreaId: from, toAreaId: to, requiresApproval },
      { onSuccess: () => notify('Regra criada.') },
    );
  };
  return (
    <form onSubmit={submit} className="space-y-3 border-t border-line px-4 py-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField label="A área" value={from} onChange={(event) => setFrom(event.target.value)}>
          {areas.map((area) => (
            <option key={area.id} value={area.id}>
              {area.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="pode pedir trabalho a"
          value={to}
          onChange={(event) => setTo(event.target.value)}
        >
          {areas.map((area) => (
            <option key={area.id} value={area.id}>
              {area.name}
            </option>
          ))}
        </SelectField>
      </div>
      <Switch
        checked={requiresApproval}
        onChange={setRequiresApproval}
        label="Exigir minha aprovação para cada pedido"
      >
        Exigir minha aprovação para cada pedido
      </Switch>
      {create.error && <FormError>{errorMessage(create.error)}</FormError>}
      <Button variant="primary" type="submit" disabled={create.isPending || from === to}>
        Criar regra
      </Button>
    </form>
  );
}

function RuleItem({ link }: { link: AreaLink }) {
  const update = useUpdateAreaLink();
  const remove = useDeleteAreaLink();
  const notify = useToast();
  const [removing, setRemoving] = useState(false);
  const name = `${link.fromAreaName} → ${link.toAreaName}`;
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
      <span className="font-semibold">{name}</span>
      <span className="flex items-center gap-3">
        <Switch
          checked={link.requiresApproval}
          disabled={update.isPending}
          onChange={(requiresApproval) => update.mutate({ linkId: link.id, requiresApproval })}
          label={`Aprovação para ${name}`}
        >
          Com aprovação
        </Switch>
        <IconButton label={`Remover a regra ${name}`} onClick={() => setRemoving(true)}>
          <Trash2 className="size-4.5" aria-hidden />
        </IconButton>
      </span>
      {(update.error ?? remove.error) && (
        <FormError className="w-full">{errorMessage(update.error ?? remove.error)}</FormError>
      )}
      {removing && (
        <ConfirmDialog
          title={`Remover a regra ${name}?`}
          confirmLabel="Remover"
          busy={remove.isPending}
          onCancel={() => setRemoving(false)}
          onConfirm={() =>
            remove.mutate(link.id, {
              onSuccess: () => {
                setRemoving(false);
                notify('Regra removida.');
              },
            })
          }
        >
          Novos pedidos de {link.fromAreaName} para {link.toAreaName} passam a ser recusados. Os
          pedidos já feitos continuam.
        </ConfirmDialog>
      )}
    </li>
  );
}

function Rules() {
  const links = useAreaLinks();
  const projects = useProjects();
  if (links.isPending || projects.isPending) return <LoadingState label="Carregando as regras…" />;
  const error = links.error ?? projects.error;
  if (error || !links.data || !projects.data) {
    return <ErrorState title="Não foi possível carregar as regras." error={error} />;
  }
  return (
    <Panel title="Quem pode pedir a quem">
      {links.data.length > 0 ? (
        <ul className="divide-y divide-line">
          {links.data.map((link) => (
            <RuleItem key={link.id} link={link} />
          ))}
        </ul>
      ) : (
        <EmptyState title="Nenhuma regra ainda.">
          Sem uma regra, nenhuma área pode pedir trabalho a outra: nem os agentes nem você.
        </EmptyState>
      )}
      {projects.data.length >= 2 ? (
        <NewRule areas={projects.data} />
      ) : (
        <p className="border-t border-line px-4 py-3 text-sm text-dim">
          É preciso ter pelo menos duas áreas para criar uma regra.
        </p>
      )}
    </Panel>
  );
}

export function RequestsPage() {
  return (
    <>
      <TasksTabs />
      <PageHeader
        title="Pedidos entre áreas"
        description="Uma área pede trabalho a outra: o pedido vira uma tarefa no quadro dela, e a tarefa que pediu espera a entrega. Os arquivos vão e voltam como cópias."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <OpenRequests />
        <Rules />
      </div>
    </>
  );
}
