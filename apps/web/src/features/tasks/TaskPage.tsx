import {
  type LinkedTask,
  REQUEST_LIMITS,
  TASK_LIMITS,
  type TaskDetail,
  type TaskEvent,
} from '@ea/shared';
import { ArrowLeft } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button } from '../../components/Button';
import { SelectField, TextAreaField, TextField } from '../../components/Form';
import { Markdown } from '../../components/Markdown';
import { ConfirmDialog } from '../../components/Modal';
import { PageHeader } from '../../components/PageHeader';
import { Panel } from '../../components/Panel';
import { ErrorState, LoadingState } from '../../components/States';
import { useToast } from '../../components/Toast';
import { errorMessage } from '../../lib/errors';
import { formatCount, formatDateTime } from '../../lib/format';
import {
  useCommentTask,
  useDecideRequest,
  useMoveTask,
  useRequestFromTask,
  useTask,
  useTaskAction,
} from '../../lib/task-queries';
import { PriorityBadge, TaskStatus } from './TaskBadges';

function who(event: TaskEvent): string {
  if (event.actor === 'user') return 'Você';
  if (event.actor === 'agent') return event.agentName ?? 'Agente';
  return 'Plataforma';
}

function whatHappened(event: TaskEvent): string {
  switch (event.kind) {
    case 'created':
      return `criou a tarefa em "${event.toStageName ?? ''}"`;
    case 'edited':
      return 'editou a tarefa';
    case 'moved':
      return `passou de "${event.fromStageName ?? ''}" para "${event.toStageName ?? ''}"`;
    case 'commented':
      return 'comentou';
    case 'run_started':
      return `${event.agentName ?? 'Um agente'} começou a trabalhar em "${event.toStageName ?? ''}"`;
    case 'run_finished':
      return 'execução encerrada';
    case 'stopped':
      return 'parou a tarefa';
    case 'resumed':
      return 'retomou a tarefa';
    case 'cancelled':
      return 'cancelou a tarefa';
    case 'requested':
      return 'pediu trabalho a outra área';
    case 'request_approved':
      return 'aprovou o pedido';
    case 'request_refused':
      return 'recusou o pedido';
    case 'delivered':
      return 'registrou uma entrega';
  }
}

function History({ events }: { events: readonly TaskEvent[] }) {
  return (
    <ol className="divide-y divide-line" aria-label="Histórico da tarefa">
      {events.map((event) => (
        <li key={event.id} className="px-4 py-3">
          <p className="text-sm">
            <span className="font-semibold">{who(event)}</span> {whatHappened(event)}
            <span className="text-dim"> · {formatDateTime(event.createdAt)}</span>
            {event.runId && (
              <>
                {' · '}
                <Link
                  to={`/logs/${event.runId}`}
                  className="text-info underline underline-offset-4"
                >
                  Execução
                </Link>
              </>
            )}
          </p>
          {/* Notes and comments come from people and models: rendered as Markdown, never as HTML. */}
          {event.text && (
            <div className="mt-1 text-sm">
              <Markdown text={event.text} />
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

function MoveForm({ detail }: { detail: TaskDetail }) {
  const move = useMoveTask();
  const notify = useToast();
  const [target, setTarget] = useState(detail.moves[0]?.stageId ?? '');
  const [note, setNote] = useState('');
  const chosen = detail.moves.find((option) => option.stageId === target) ?? detail.moves[0];

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!chosen) return;
    move.mutate(
      { taskId: detail.task.id, toStageId: chosen.stageId, note },
      {
        onSuccess: () => {
          setNote('');
          notify(`Tarefa passada para "${chosen.stageName}".`);
        },
      },
    );
  };

  if (detail.task.state === 'pending') {
    return (
      <p className="px-4 py-3 text-sm text-dim">
        Este pedido entra no quadro quando você o aprovar.
      </p>
    );
  }
  if (detail.task.working) {
    return (
      <p className="px-4 py-3 text-sm text-dim">
        Um agente está trabalhando nesta tarefa. Ela pode ser movida quando ele terminar, ou depois
        de interromper a execução.
      </p>
    );
  }
  if (detail.moves.length === 0) {
    return <p className="px-4 py-3 text-sm text-dim">O fluxo não tem passagem sua daqui.</p>;
  }
  return (
    <form onSubmit={submit} className="space-y-3 px-4 py-3">
      <SelectField
        label="Para a etapa"
        value={chosen?.stageId ?? ''}
        onChange={(event) => setTarget(event.target.value)}
      >
        {detail.moves.map((option) => (
          <option key={option.stageId} value={option.stageId}>
            {option.stageName}
          </option>
        ))}
      </SelectField>
      <TextAreaField
        label="Nota para quem vem depois"
        rows={3}
        value={note}
        maxLength={TASK_LIMITS.note}
        onChange={(event) => setNote(event.target.value)}
        hint="Opcional. Ao devolver uma tarefa, diga o que precisa mudar."
      />
      {move.error && (
        <p role="alert" className="text-sm text-fail">
          {errorMessage(move.error)}
        </p>
      )}
      <Button variant="primary" type="submit" disabled={move.isPending}>
        {move.isPending ? 'Movendo…' : 'Mover'}
      </Button>
    </form>
  );
}

function CommentForm({ taskId }: { taskId: string }) {
  const comment = useCommentTask();
  const [text, setText] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    comment.mutate({ taskId, text }, { onSuccess: () => setText('') });
  };
  return (
    <form onSubmit={submit} className="space-y-3 border-t border-line px-4 py-3">
      <TextAreaField
        label="Comentar"
        rows={2}
        value={text}
        maxLength={TASK_LIMITS.comment}
        onChange={(event) => setText(event.target.value)}
        hint="O próximo agente que trabalhar na tarefa lê os comentários."
      />
      {comment.error && (
        <p role="alert" className="text-sm text-fail">
          {errorMessage(comment.error)}
        </p>
      )}
      <Button type="submit" disabled={comment.isPending || text.trim() === ''}>
        Comentar
      </Button>
    </form>
  );
}

function Situation({ detail }: { detail: TaskDetail }) {
  const { task } = detail;
  const action = useTaskAction();
  const notify = useToast();
  const [cancelling, setCancelling] = useState(false);
  return (
    <Panel title="Situação">
      <dl className="grid gap-x-6 gap-y-2 px-4 py-3 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="text-dim">Etapa</dt>
        <dd>{task.stageName}</dd>
        <dt className="text-dim">Andamento</dt>
        <dd>
          <TaskStatus task={task} />
        </dd>
        <dt className="text-dim">Execuções</dt>
        <dd>
          {formatCount(task.runCount)} de até {formatCount(TASK_LIMITS.maxRuns)}
        </dd>
        <dt className="text-dim">Voltas</dt>
        <dd>
          {formatCount(task.returns)} de até {formatCount(TASK_LIMITS.maxReturns)}
        </dd>
      </dl>
      {task.attention && (
        <p
          role="status"
          className="mx-4 mb-3 rounded-md border border-wait/60 bg-wait/10 p-3 text-sm"
        >
          {task.attention}
        </p>
      )}
      {task.state === 'pending' && <RequestDecision detail={detail} />}
      {task.state === 'open' && (
        <div className="flex flex-wrap gap-3 px-4 pb-3">
          {task.attention && (
            <Button
              variant="primary"
              disabled={action.isPending}
              onClick={() =>
                action.mutate(
                  { taskId: task.id, action: 'resume' },
                  { onSuccess: () => notify('Tarefa retomada.') },
                )
              }
            >
              Retomar
            </Button>
          )}
          <Button onClick={() => setCancelling(true)}>Cancelar tarefa</Button>
        </div>
      )}
      {action.error && (
        <p role="alert" className="px-4 pb-3 text-sm text-fail">
          {errorMessage(action.error)}
        </p>
      )}
      {cancelling && (
        <ConfirmDialog
          title={`Cancelar "${task.title}"?`}
          confirmLabel="Cancelar tarefa"
          busy={action.isPending}
          onCancel={() => setCancelling(false)}
          onConfirm={() =>
            action.mutate(
              { taskId: task.id, action: 'cancel' },
              {
                onSuccess: () => {
                  setCancelling(false);
                  notify('Tarefa cancelada.');
                },
              },
            )
          }
        >
          A tarefa sai do quadro e, se um agente estiver trabalhando nela, a execução é
          interrompida. O histórico é mantido.
        </ConfirmDialog>
      )}
    </Panel>
  );
}

function RequestDecision({ detail }: { detail: TaskDetail }) {
  const decide = useDecideRequest();
  const notify = useToast();
  const [note, setNote] = useState('');
  const from = detail.parent?.areaName ?? 'outra área';
  return (
    <div className="space-y-3 px-4 pb-3">
      <p role="status" className="rounded-md border border-wait/60 bg-wait/10 p-3 text-sm">
        Pedido da área {from}. Ele só entra no quadro desta área depois da sua aprovação.
      </p>
      <TextAreaField
        label="Motivo, se recusar"
        rows={2}
        value={note}
        maxLength={TASK_LIMITS.note}
        onChange={(event) => setNote(event.target.value)}
        hint="Vai para o histórico da tarefa que pediu."
      />
      <div className="flex flex-wrap gap-3">
        <Button
          variant="primary"
          disabled={decide.isPending}
          onClick={() =>
            decide.mutate(
              { taskId: detail.task.id, approve: true },
              { onSuccess: () => notify('Pedido aprovado.') },
            )
          }
        >
          Aprovar pedido
        </Button>
        <Button
          disabled={decide.isPending}
          onClick={() =>
            decide.mutate(
              { taskId: detail.task.id, approve: false, note },
              { onSuccess: () => notify('Pedido recusado.') },
            )
          }
        >
          Recusar
        </Button>
      </div>
      {decide.error && (
        <p role="alert" className="text-sm text-fail">
          {errorMessage(decide.error)}
        </p>
      )}
    </div>
  );
}

const LINKED_STATE: Record<LinkedTask['state'], string> = {
  pending: 'esperando aprovação',
  open: 'em andamento',
  done: 'entregue',
  cancelled: 'cancelado',
};

function LinkedTaskItem({ task }: { task: LinkedTask }) {
  return (
    <li className="px-4 py-3 text-sm">
      <Link to={`/tarefas/${encodeURIComponent(task.id)}`} className="font-semibold text-info">
        {task.title}
      </Link>
      <p className="text-dim">
        Área {task.areaName} · {LINKED_STATE[task.state]}
        {task.state === 'open' && ` em "${task.stageName}"`}
      </p>
    </li>
  );
}

function RequestForm({ detail }: { detail: TaskDetail }) {
  const send = useRequestFromTask();
  const notify = useToast();
  const [areaId, setAreaId] = useState(detail.requestTargets[0]?.areaId ?? '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState('');
  const target =
    detail.requestTargets.find((entry) => entry.areaId === areaId) ?? detail.requestTargets[0];

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!target) return;
    send.mutate(
      {
        taskId: detail.task.id,
        request: {
          toAreaId: target.areaId,
          title,
          description,
          files: files
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line !== ''),
        },
      },
      {
        onSuccess: () => {
          setTitle('');
          setDescription('');
          setFiles('');
          notify(
            target.requiresApproval
              ? `Pedido enviado à área ${target.areaName}. Ele espera a sua aprovação.`
              : `Pedido criado no quadro da área ${target.areaName}.`,
          );
        },
      },
    );
  };

  return (
    <form onSubmit={submit} className="space-y-3 border-t border-line px-4 py-3">
      <SelectField
        label="Pedir à área"
        value={target?.areaId ?? ''}
        onChange={(event) => setAreaId(event.target.value)}
      >
        {detail.requestTargets.map((entry) => (
          <option key={entry.areaId} value={entry.areaId}>
            {entry.areaName}
          </option>
        ))}
      </SelectField>
      <TextField
        label="O que pedir"
        value={title}
        maxLength={TASK_LIMITS.title}
        onChange={(event) => setTitle(event.target.value)}
      />
      <TextAreaField
        label="Detalhes"
        rows={3}
        value={description}
        maxLength={TASK_LIMITS.description}
        onChange={(event) => setDescription(event.target.value)}
      />
      <TextAreaField
        label="Arquivos para mandar junto"
        rows={2}
        value={files}
        onChange={(event) => setFiles(event.target.value)}
        hint={`Opcional. Um caminho da pasta da área por linha (até ${REQUEST_LIMITS.paths}); uma cópia vai com o pedido.`}
      />
      {send.error && (
        <p role="alert" className="text-sm text-fail">
          {errorMessage(send.error)}
        </p>
      )}
      <Button variant="primary" type="submit" disabled={send.isPending || title.trim() === ''}>
        {send.isPending ? 'Enviando…' : 'Enviar pedido'}
      </Button>
    </form>
  );
}

function Requests({ detail }: { detail: TaskDetail }) {
  const canAsk = detail.task.state === 'open' && detail.requestTargets.length > 0;
  return (
    <Panel title="Pedidos a outras áreas">
      {detail.children.length > 0 ? (
        <ul className="divide-y divide-line">
          {detail.children.map((child) => (
            <LinkedTaskItem key={child.id} task={child} />
          ))}
        </ul>
      ) : (
        <p className="px-4 py-3 text-sm text-dim">Nenhum pedido feito por esta tarefa.</p>
      )}
      {canAsk ? (
        <RequestForm detail={detail} />
      ) : (
        detail.task.state === 'open' && (
          <p className="border-t border-line px-4 py-3 text-sm text-dim">
            Esta área ainda não pode pedir trabalho a nenhuma outra.{' '}
            <Link to="/tarefas/pedidos" className="text-info underline underline-offset-4">
              Criar uma regra
            </Link>
          </p>
        )
      )}
    </Panel>
  );
}

export function TaskPage() {
  const { taskId } = useParams();
  const { data, error, isPending, refetch } = useTask(taskId);

  if (isPending) return <LoadingState label="Carregando a tarefa…" />;
  if (error && !data) {
    return (
      <ErrorState
        title="Não foi possível carregar a tarefa."
        error={error}
        onRetry={() => void refetch()}
      />
    );
  }
  if (!data) return null;
  const { task } = data;

  return (
    <>
      <Link
        to={`/tarefas?area=${encodeURIComponent(task.areaId)}`}
        className="mb-3 inline-flex items-center gap-1 text-sm text-info underline underline-offset-4"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Quadro de {task.areaName}
      </Link>
      <PageHeader title={task.title} actions={<PriorityBadge task={task} />} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Panel title="Pedido">
            <div className="space-y-3 px-4 py-3 text-sm">
              {task.description ? (
                <Markdown text={task.description} />
              ) : (
                <p className="text-dim">Sem descrição.</p>
              )}
              <h3 className="font-semibold">Critérios de aceite</h3>
              {task.acceptance ? (
                <Markdown text={task.acceptance} />
              ) : (
                <p className="text-dim">Nenhum critério informado.</p>
              )}
            </div>
          </Panel>
          <Panel title="Histórico">
            <History events={data.events} />
            {task.state !== 'cancelled' && <CommentForm taskId={task.id} />}
          </Panel>
        </div>
        <div className="space-y-6">
          <Situation detail={data} />
          {data.parent && (
            <Panel title="Pedido de outra área">
              <ul>
                <LinkedTaskItem task={data.parent} />
              </ul>
            </Panel>
          )}
          {task.state !== 'cancelled' && (
            <Panel title="Mover">
              <MoveForm key={task.stageId} detail={data} />
            </Panel>
          )}
          {task.state !== 'cancelled' && <Requests detail={data} />}
        </div>
      </div>
    </>
  );
}
