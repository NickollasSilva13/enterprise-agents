import {
  type Agent,
  type ChatMessageView,
  type ConversationDetail,
  type ConversationSummary,
  MESSAGE_LIMITS,
  type RunSummary,
} from '@ea/shared';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Send, Settings, Square, Trash2 } from 'lucide-react';
import { type FormEvent, Fragment, type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { AgentAvatar } from '../../components/AgentAvatar';
import { ApprovalCard } from '../../components/ApprovalCard';
import { Button, buttonClass, IconButton } from '../../components/Button';
import { Markdown } from '../../components/Markdown';
import { ConfirmDialog } from '../../components/Modal';
import { StateLamp } from '../../components/StateLamp';
import { ErrorState, LoadingState } from '../../components/States';
import { useToast } from '../../components/Toast';
import { errorMessage } from '../../lib/errors';
import { type RunStream, useRunStream } from '../../lib/events';
import { formatCount, formatDateTime, formatDuration, plural } from '../../lib/format';
import { useAgents, useModels } from '../../lib/queries';
import { endReasonText, RUN_STATUS, totalTokens } from '../../lib/run-labels';
import {
  useCancelRun,
  useConversation,
  useConversations,
  useDeleteConversation,
  useSendMessage,
} from '../../lib/run-queries';
import { useApprovals } from '../../lib/tool-queries';
import { RunTimeline } from '../logs/RunTimeline';

const chatPath = (agentId: string, conversationId?: string) =>
  `/agentes/${agentId}/conversa${conversationId ? `/${conversationId}` : ''}`;

function Bubble({ message }: { message: ChatMessageView }) {
  const fromUser = message.role === 'user';
  return (
    <li className={`flex ${fromUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[min(42rem,92%)] rounded-lg border px-3.5 py-2.5 ${
          fromUser ? 'border-line-strong bg-sheet-raised' : 'border-line bg-sheet'
        }`}
      >
        <p className="sr-only">{fromUser ? 'Você:' : 'Agente:'}</p>
        {fromUser ? (
          <p className="whitespace-pre-wrap break-words">{message.text}</p>
        ) : (
          <Markdown text={message.text} />
        )}
      </div>
    </li>
  );
}

/** What happened to the run that answered a message: how it ended and what it cost. */
function RunNote({ run }: { run: RunSummary }) {
  const failed = run.status === 'failed' || run.status === 'timed_out';
  const problem =
    run.status === 'completed' && run.endReason === 'completed'
      ? null
      : (run.errorMessage ?? endReasonText(run.endReason));
  const facts = [
    run.status === 'completed' ? null : RUN_STATUS[run.status].label,
    run.durationMs === null ? null : formatDuration(run.durationMs),
    totalTokens(run) > 0 ? `${formatCount(totalTokens(run))} tokens` : null,
  ].filter(Boolean);

  return (
    <li className="text-sm text-dim">
      {problem && (
        <p role={failed ? 'alert' : undefined} className={failed ? 'text-fail' : ''}>
          {problem}
        </p>
      )}
      <p>
        {facts.join(' · ')}
        {facts.length > 0 && ' · '}
        <Link to={`/logs/${run.id}`} className="text-info underline underline-offset-4">
          Ver passos
        </Link>
      </p>
    </li>
  );
}

const stepText = (value: unknown) => (typeof value === 'string' ? value : null);

/** What the agent is doing at this moment, from its status and its latest step. */
function activityText(status: RunSummary['status'], stream: RunStream): string {
  if (status === 'queued') return 'Na fila, aguardando a vez…';
  if (status === 'waiting_approval') return 'Aguardando a sua aprovação…';
  const last = stream.steps.at(-1);
  if (last?.type === 'tool_call_requested' || last?.type === 'approval_decided') {
    const tool = stepText(last.payload.toolTitle) ?? stepText(last.payload.tool);
    return tool ? `Usando a ferramenta “${tool}”…` : 'Usando uma ferramenta…';
  }
  if (last?.type === 'delegation_started') {
    return `Aguardando ${stepText(last.payload.agentName) ?? 'outro agente'}, que recebeu uma tarefa…`;
  }
  return 'Escrevendo…';
}

/** The answer being written right now, with its steps as they happen. */
function LiveAnswer({ stream, run }: { stream: RunStream; run: RunSummary | undefined }) {
  const status = stream.status ?? run?.status ?? 'queued';
  const waiting = status === 'waiting_approval';
  return (
    <li className="flex justify-start">
      <div className="max-w-[min(42rem,92%)] rounded-lg border border-ok/50 bg-sheet px-3.5 py-2.5">
        <p className="sr-only">Agente:</p>
        {stream.text !== '' && <Markdown text={stream.text} />}
        <p
          role="status"
          className={`flex items-center gap-2 text-sm ${waiting ? 'text-wait' : 'text-ok'}`}
        >
          <span
            className={`size-2 animate-lamp rounded-full ${waiting ? 'bg-wait' : 'bg-ok'}`}
            aria-hidden
          />
          {activityText(status, stream)}
        </p>
        {stream.steps.length > 0 && (
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer text-dim">
              {plural(stream.steps.length, 'passo', 'passos')} até agora
            </summary>
            <div className="mt-2">
              <RunTimeline steps={stream.steps} label="Passos da execução em andamento" />
            </div>
          </details>
        )}
      </div>
    </li>
  );
}

function Transcript({ detail, stream }: { detail: ConversationDetail; stream: RunStream }) {
  const runsById = new Map(detail.runs.map((run) => [run.id, run]));
  const end = useRef<HTMLLIElement>(null);
  // Decisions asked by this run, or by an agent it delegated to (UC-05).
  const { data: pending } = useApprovals();
  const approvals = detail.activeRunId
    ? (pending ?? []).filter((approval) => approval.originRunId === detail.activeRunId)
    : [];

  // Keep the newest text in view while the answer grows.
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [detail.messages.length, stream.text, detail.activeRunId, approvals.length]);

  // A run is closed after its last message: the note goes there.
  const lastOfRun = new Map<string, string>();
  for (const message of detail.messages) {
    if (message.runId) lastOfRun.set(message.runId, message.id);
  }

  return (
    <ol aria-label="Mensagens" className="space-y-3">
      {detail.messages.map((message) => {
        const run = message.runId ? runsById.get(message.runId) : undefined;
        const closesRun =
          run && run.id !== detail.activeRunId && lastOfRun.get(run.id) === message.id;
        return (
          <Fragment key={message.id}>
            <Bubble message={message} />
            {closesRun && <RunNote run={run} />}
          </Fragment>
        );
      })}
      {detail.activeRunId && <LiveAnswer stream={stream} run={runsById.get(detail.activeRunId)} />}
      {approvals.map((approval) => (
        <li key={approval.id}>
          <ApprovalCard approval={approval} context="chat" />
        </li>
      ))}
      <li ref={end} aria-hidden />
    </ol>
  );
}

function ConversationList({
  agentId,
  conversations,
  currentId,
  onDelete,
}: {
  agentId: string;
  conversations: readonly ConversationSummary[];
  currentId: string | undefined;
  onDelete: (conversation: ConversationSummary) => void;
}) {
  if (conversations.length === 0) {
    return <p className="px-3 py-2 text-sm text-dim">Nenhuma conversa ainda.</p>;
  }
  return (
    <ul aria-label="Conversas" className="space-y-1">
      {conversations.map((conversation) => (
        <li key={conversation.id} className="flex items-center gap-1">
          <Link
            to={chatPath(agentId, conversation.id)}
            aria-current={conversation.id === currentId ? 'page' : undefined}
            className={`min-w-0 flex-1 rounded-md px-3 py-2 text-sm ${
              conversation.id === currentId
                ? 'bg-sheet-raised font-semibold text-chalk'
                : 'text-dim hover:bg-sheet hover:text-chalk'
            }`}
          >
            <span className="block truncate">{conversation.title || 'Conversa sem título'}</span>
            <span className="block text-xs font-normal text-dim">
              {formatDateTime(conversation.updatedAt)}
            </span>
          </Link>
          <IconButton
            label={`Excluir a conversa "${conversation.title}"`}
            onClick={() => onDelete(conversation)}
          >
            <Trash2 className="size-4" aria-hidden />
          </IconButton>
        </li>
      ))}
    </ul>
  );
}

/** Why the agent cannot answer, with the way out; null when it can. */
function blockedNotice(agent: Agent) {
  if (!agent.enabled) {
    return (
      <>
        Este agente está inativo e não responde.{' '}
        <Link to="/agentes" className="text-info underline underline-offset-4">
          Ativar na lista de agentes
        </Link>
      </>
    );
  }
  if (!agent.modelId) {
    return (
      <>
        Este agente ainda não tem um modelo.{' '}
        <Link to={`/agentes/${agent.id}`} className="text-info underline underline-offset-4">
          Escolher um modelo
        </Link>
      </>
    );
  }
  return null;
}

function Composer({
  agent,
  conversationId,
  activeRunId,
}: {
  agent: Agent;
  conversationId: string | undefined;
  activeRunId: string | null;
}) {
  const [draft, setDraft] = useState('');
  const send = useSendMessage(agent.id);
  const cancel = useCancelRun();
  const navigate = useNavigate();
  const { data: models } = useModels();
  const model = models?.find((option) => option.id === agent.modelId);
  const blocked = blockedNotice(agent);
  const busy = activeRunId !== null;
  const content = draft.trim();

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (content === '' || busy || blocked || send.isPending) return;
    send.mutate(
      { ...(conversationId ? { conversationId } : {}), content },
      {
        onSuccess: (accepted) => {
          setDraft('');
          if (!conversationId) {
            void navigate(chatPath(agent.id, accepted.conversationId), { replace: true });
          }
        },
      },
    );
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends; Shift+Enter breaks the line, as in most chat tools.
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <form onSubmit={submit} className="space-y-2 border-t border-line p-3 sm:p-4">
      {blocked && (
        <p role="status" className="text-sm text-wait">
          {blocked}
        </p>
      )}
      {send.error && (
        <p role="alert" className="text-sm text-fail">
          {errorMessage(send.error)}
        </p>
      )}
      {cancel.error && (
        <p role="alert" className="text-sm text-fail">
          {errorMessage(cancel.error)}
        </p>
      )}
      <div className="flex items-end gap-2">
        <label htmlFor="chat-message" className="sr-only">
          Mensagem
        </label>
        <textarea
          id="chat-message"
          rows={2}
          maxLength={MESSAGE_LIMITS.content}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          disabled={blocked !== null}
          placeholder={busy ? 'Aguarde a resposta ou interrompa…' : `Escreva para ${agent.name}`}
          className="max-h-48 min-h-11 w-full flex-1 resize-y rounded-md border border-line-strong bg-ink px-3 py-2 text-chalk placeholder:text-dim disabled:cursor-not-allowed disabled:opacity-60"
        />
        {busy ? (
          <Button
            variant="danger"
            onClick={() => cancel.mutate(activeRunId)}
            disabled={cancel.isPending}
          >
            <Square className="size-4" aria-hidden />
            Interromper
          </Button>
        ) : (
          <Button
            type="submit"
            variant="primary"
            disabled={content === '' || blocked !== null || send.isPending}
          >
            <Send className="size-4" aria-hidden />
            Enviar
          </Button>
        )}
      </div>
      {model?.isExternal && (
        <p className="text-xs text-dim">
          Modelo externo: o prompt de sistema, o objetivo do agente e todas as mensagens desta
          conversa são enviados a {model.providerName}.
        </p>
      )}
    </form>
  );
}

function DeleteConversationDialog({
  conversation,
  onClose,
  onDeleted,
}: {
  conversation: ConversationSummary;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const remove = useDeleteConversation();
  const notify = useToast();
  return (
    <ConfirmDialog
      title="Excluir esta conversa?"
      confirmLabel="Excluir conversa"
      busy={remove.isPending}
      error={remove.error ? errorMessage(remove.error) : undefined}
      onCancel={onClose}
      onConfirm={() =>
        remove.mutate(conversation.id, {
          onSuccess: () => {
            notify('Conversa excluída.');
            onDeleted();
          },
        })
      }
    >
      As mensagens de “{conversation.title}” são apagadas. As execuções continuam nos logs. Esta
      ação não pode ser desfeita.
    </ConfirmDialog>
  );
}

function Chat({ agent, conversationId }: { agent: Agent; conversationId: string | undefined }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const conversations = useConversations(agent.id);
  const conversation = useConversation(conversationId);
  const [deleting, setDeleting] = useState<ConversationSummary | null>(null);

  const detail = conversationId ? conversation.data : undefined;
  const activeRunId = detail?.activeRunId ?? null;
  const stream = useRunStream(activeRunId, () => {
    for (const queryKey of [['conversations'], ['runs'], ['dashboard'], ['office'], ['agents']]) {
      void queryClient.invalidateQueries({ queryKey });
    }
  });

  const list = conversations.data ?? [];

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="rounded-lg border border-line bg-sheet p-2 lg:self-start">
          <details open={list.length > 0 || undefined} className="group lg:hidden">
            <summary className="cursor-pointer px-2 py-1.5 text-sm font-semibold">
              Conversas ({list.length})
            </summary>
            <div className="mt-1">
              <ConversationList
                agentId={agent.id}
                conversations={list}
                currentId={conversationId}
                onDelete={setDeleting}
              />
            </div>
          </details>
          <div className="hidden lg:block">
            <h2 className="px-3 py-2 text-sm font-semibold">Conversas</h2>
            <ConversationList
              agentId={agent.id}
              conversations={list}
              currentId={conversationId}
              onDelete={setDeleting}
            />
          </div>
        </aside>

        <section
          aria-label={`Conversa com ${agent.name}`}
          className="flex min-h-[26rem] min-w-0 flex-col rounded-lg border border-line bg-ink"
        >
          <div className="flex-1 p-3 sm:p-4">
            {conversationId === undefined && (
              <div className="grid h-full place-items-center py-10 text-center">
                <div>
                  <AgentAvatar
                    agentId={agent.id}
                    appearance={agent.appearance}
                    size={64}
                    dimmed={!agent.enabled}
                  />
                  <p className="mt-3 font-semibold">Nova conversa com {agent.name}</p>
                  <p className="mt-1 max-w-prose text-sm text-dim">
                    {agent.objective || 'Envie a primeira mensagem para começar.'}
                  </p>
                </div>
              </div>
            )}
            {conversationId !== undefined && conversation.isPending && (
              <LoadingState label="Carregando a conversa…" />
            )}
            {conversationId !== undefined && conversation.error && !detail && (
              <ErrorState
                title="Não foi possível carregar a conversa."
                error={conversation.error}
                onRetry={() => void conversation.refetch()}
              />
            )}
            {detail && <Transcript detail={detail} stream={stream} />}
          </div>
          <Composer agent={agent} conversationId={conversationId} activeRunId={activeRunId} />
        </section>
      </div>

      {deleting && (
        <DeleteConversationDialog
          conversation={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            const wasOpen = deleting.id === conversationId;
            setDeleting(null);
            if (wasOpen) void navigate(chatPath(agent.id), { replace: true });
          }}
        />
      )}
    </>
  );
}

export function ChatPage() {
  const { id, conversationId } = useParams();
  const { data: agents, error, isPending, refetch } = useAgents();
  const agent = agents?.find((entry) => entry.id === id);

  return (
    <>
      <header className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-3">
        <Link
          to="/agentes"
          aria-label="Voltar para os agentes"
          title="Voltar para os agentes"
          className="grid size-10 shrink-0 place-items-center rounded-md text-dim hover:bg-sheet-raised hover:text-chalk"
        >
          <ArrowLeft className="size-5" aria-hidden />
        </Link>
        {agent && (
          <AgentAvatar agentId={agent.id} appearance={agent.appearance} dimmed={!agent.enabled} />
        )}
        <div className="min-w-0 flex-1 basis-40">
          <h1 className="truncate text-2xl font-bold tracking-tight">
            {agent ? agent.name : 'Conversa'}
          </h1>
          {agent && (
            <p className="flex flex-wrap items-center gap-x-3 text-sm text-dim">
              <StateLamp state={agent.state} />
              <span>{agent.modelName ?? 'sem modelo'}</span>
            </p>
          )}
        </div>
        {agent && (
          <div className="flex flex-wrap gap-2">
            <Link to={chatPath(agent.id)} className={buttonClass('secondary')}>
              <Plus className="size-4.5" aria-hidden />
              Nova conversa
            </Link>
            <Link
              to={`/agentes/${agent.id}`}
              aria-label={`Configurar ${agent.name}`}
              title="Configurar"
              className="grid size-10 place-items-center rounded-md text-dim hover:bg-sheet-raised hover:text-chalk"
            >
              <Settings className="size-4.5" aria-hidden />
            </Link>
          </div>
        )}
      </header>

      {isPending && <LoadingState label="Carregando o agente…" />}
      {error && !agents && (
        <ErrorState
          title="Não foi possível carregar o agente."
          error={error}
          onRetry={() => void refetch()}
        />
      )}
      {agents && !agent && (
        <div className="rounded-lg border border-line bg-sheet p-5">
          <p className="font-semibold">Agente não encontrado.</p>
          <p className="mt-1 text-sm text-dim">
            Ele pode ter sido excluído. As execuções antigas continuam nos{' '}
            <Link to="/logs" className="text-info underline underline-offset-4">
              logs
            </Link>
            .
          </p>
        </div>
      )}
      {agent && (
        <Chat key={conversationId ?? 'new'} agent={agent} conversationId={conversationId} />
      )}
    </>
  );
}
