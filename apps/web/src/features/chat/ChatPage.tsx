import {
  type Agent,
  type ChatMessageView,
  type ConversationDetail,
  type ConversationSummary,
  MESSAGE_LIMITS,
  type RunSummary,
} from '@ea/shared';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, MessageSquarePlus, Send, Settings, Square, Trash2 } from 'lucide-react';
import { type FormEvent, Fragment, type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { AgentAvatar } from '../../components/AgentAvatar';
import { ApprovalCard } from '../../components/ApprovalCard';
import { IconButton } from '../../components/Button';
import { Markdown } from '../../components/Markdown';
import { ConfirmDialog } from '../../components/Modal';
import { StateLamp } from '../../components/StateLamp';
import { ErrorState, LoadingState } from '../../components/States';
import { useToast } from '../../components/Toast';
import { errorMessage } from '../../lib/errors';
import { type RunStream, useRunStream } from '../../lib/events';
import {
  formatClock,
  formatCount,
  formatDay,
  formatDuration,
  formatWhen,
  plural,
} from '../../lib/format';
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
import { LINK } from '../../components/TextLink';
import { FormError, Notice } from '../../components/Notice';
import { TONES } from '../../lib/tone';

const chatPath = (agentId: string, conversationId?: string) =>
  `/agentes/${agentId}/conversa${conversationId ? `/${conversationId}` : ''}`;

/** A square icon link of the chat's bars (back, settings, new conversation). */
const BAR_LINK =
  'grid size-10 shrink-0 place-items-center rounded-full text-dim transition-colors hover:bg-sheet-raised hover:text-chalk';

/*
 * The chat reads like a messaging app (Phase 38): your messages on the right
 * in the accent, the agent's on the left on a raised surface, each with its
 * time, and the day written once above the messages of that day.
 */
const BUBBLE = 'max-w-[min(40rem,85%)] rounded-2xl px-3.5 pt-2 pb-1.5 shadow-lift';
const AGENT_BUBBLE = `${BUBBLE} rounded-bl-md border border-line bg-sheet-raised`;
const USER_BUBBLE = `${BUBBLE} rounded-br-md bg-accent-strong text-white`;

function Bubble({ message }: { message: ChatMessageView }) {
  const fromUser = message.role === 'user';
  return (
    <li className={`flex ${fromUser ? 'justify-end' : 'justify-start'}`}>
      <div className={fromUser ? USER_BUBBLE : AGENT_BUBBLE}>
        <p className="sr-only">{fromUser ? 'Você:' : 'Agente:'}</p>
        {fromUser ? (
          <p className="whitespace-pre-wrap break-words">{message.text}</p>
        ) : (
          <Markdown text={message.text} />
        )}
        <p className={`mt-0.5 text-right text-xs ${fromUser ? 'text-white/85' : 'text-dim'}`}>
          <time dateTime={message.createdAt}>{formatClock(message.createdAt)}</time>
        </p>
      </div>
    </li>
  );
}

/** The day of the messages below it, once per day, as a pill in the middle. */
function DayMark({ iso }: { iso: string }) {
  return (
    <li className="flex justify-center py-1">
      <span className="rounded-full border border-line bg-sheet px-3 py-0.5 text-xs font-medium text-dim">
        {formatDay(iso)}
      </span>
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
    <li className="pl-1 text-xs text-dim">
      {problem && (
        <p
          role={failed ? 'alert' : undefined}
          className={`text-sm ${failed ? TONES.fail.text : ''}`}
        >
          {problem}
        </p>
      )}
      <p>
        {facts.join(' · ')}
        {facts.length > 0 && ' · '}
        <Link to={`/logs/${run.id}`} className={LINK}>
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

/** Three dots that take turns, as someone typing; still with reduced motion. */
function TypingDots({ className }: { className: string }) {
  return (
    <span aria-hidden className="inline-flex items-center gap-1">
      {['', '[animation-delay:200ms]', '[animation-delay:400ms]'].map((delay) => (
        <span key={delay} className={`size-1.5 animate-lamp rounded-full ${className} ${delay}`} />
      ))}
    </span>
  );
}

/** The answer being written right now, with its steps as they happen. */
function LiveAnswer({ stream, run }: { stream: RunStream; run: RunSummary | undefined }) {
  const status = stream.status ?? run?.status ?? 'queued';
  const tone = TONES[status === 'waiting_approval' ? 'wait' : 'ok'];
  return (
    <li className="flex justify-start">
      <div className={AGENT_BUBBLE}>
        <p className="sr-only">Agente:</p>
        {stream.text !== '' && <Markdown text={stream.text} />}
        <p role="status" className={`flex items-center gap-2 py-0.5 text-sm ${tone.text}`}>
          <TypingDots className={tone.dot} />
          {activityText(status, stream)}
        </p>
        {stream.steps.length > 0 && (
          <details className="mt-1 mb-1 text-sm">
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

const dayOf = (iso: string) => new Date(iso).toDateString();

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
    <ol aria-label="Mensagens" className="mx-auto max-w-4xl space-y-2">
      {detail.messages.map((message, index) => {
        const run = message.runId ? runsById.get(message.runId) : undefined;
        const closesRun =
          run && run.id !== detail.activeRunId && lastOfRun.get(run.id) === message.id;
        const previous = detail.messages[index - 1];
        const newDay = !previous || dayOf(previous.createdAt) !== dayOf(message.createdAt);
        return (
          <Fragment key={message.id}>
            {newDay && <DayMark iso={message.createdAt} />}
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
  agent,
  conversations,
  currentId,
  onOpen,
  onDelete,
}: {
  agent: Agent;
  conversations: readonly ConversationSummary[];
  currentId: string | undefined;
  onOpen: () => void;
  onDelete: (conversation: ConversationSummary) => void;
}) {
  if (conversations.length === 0) {
    return (
      <div className="px-4 py-6 text-sm text-dim">
        <p>Nenhuma conversa ainda.</p>
        <p className="mt-1">A primeira mensagem que você enviar abre uma.</p>
      </div>
    );
  }
  return (
    <ul aria-label="Conversas" className="space-y-0.5 p-2">
      {conversations.map((conversation) => {
        const current = conversation.id === currentId;
        return (
          <li
            key={conversation.id}
            className={`group flex items-center gap-1 rounded-xl pr-1 transition-colors ${
              current ? 'bg-sheet-raised' : 'hover:bg-sheet-raised/60'
            }`}
          >
            <Link
              to={chatPath(agent.id, conversation.id)}
              onClick={onOpen}
              aria-current={current ? 'page' : undefined}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-xl py-2.5 pl-2.5"
            >
              <AgentAvatar
                agentId={agent.id}
                appearance={agent.appearance}
                size={44}
                dimmed={!agent.enabled}
                round
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className={`truncate ${current ? 'font-semibold' : 'font-medium'}`}>
                    {conversation.title || 'Conversa sem título'}
                  </span>
                  <time dateTime={conversation.updatedAt} className="shrink-0 text-xs text-dim">
                    {formatWhen(conversation.updatedAt)}
                  </time>
                </span>
                <span className="block truncate text-sm text-dim">
                  {agent.name} · {plural(conversation.messageCount, 'mensagem', 'mensagens')}
                </span>
              </span>
            </Link>
            {/* Side by side, shown on hover and focus; when the list stands alone, always there. */}
            <IconButton
              label={`Excluir a conversa "${conversation.title}"`}
              onClick={() => onDelete(conversation)}
              className="xl:opacity-0 xl:group-hover:opacity-100 xl:focus-visible:opacity-100"
            >
              <Trash2 className="size-4" aria-hidden />
            </IconButton>
          </li>
        );
      })}
    </ul>
  );
}

/** Why the agent cannot answer, with the way out; null when it can. */
function blockedNotice(agent: Agent) {
  if (!agent.enabled) {
    return (
      <>
        Este agente está inativo e não responde.{' '}
        <Link to="/agentes" className={LINK}>
          Ativar na lista de agentes
        </Link>
      </>
    );
  }
  if (!agent.modelId) {
    return (
      <>
        Este agente ainda não tem um modelo.{' '}
        <Link to={`/agentes/${agent.id}`} className={LINK}>
          Escolher um modelo
        </Link>
      </>
    );
  }
  return null;
}

/** The round button at the end of the composer: send, or stop the answer being written. */
const ROUND_BUTTON =
  'grid size-11 shrink-0 place-items-center rounded-full transition-[background-color,transform] active:scale-95 disabled:pointer-events-none disabled:opacity-50';

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
    <form onSubmit={submit} className="space-y-2 border-t border-line bg-sheet px-3 py-3 sm:px-4">
      {blocked && (
        <Notice tone="wait" role="status">
          {blocked}
        </Notice>
      )}
      {send.error && <FormError>{errorMessage(send.error)}</FormError>}
      {cancel.error && <FormError>{errorMessage(cancel.error)}</FormError>}
      <div className="flex items-end gap-2">
        <label htmlFor="chat-message" className="sr-only">
          Mensagem
        </label>
        {/* The field grows with the text (field-sizing), up to a few lines, then scrolls. */}
        <textarea
          id="chat-message"
          rows={1}
          maxLength={MESSAGE_LIMITS.content}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          disabled={blocked !== null}
          placeholder={busy ? 'Aguarde a resposta ou interrompa…' : `Mensagem para ${agent.name}`}
          className="max-h-40 min-h-11 w-full flex-1 resize-none rounded-3xl border border-line bg-ink px-4 py-2.5 text-chalk transition-[border-color,box-shadow] [field-sizing:content] placeholder:text-dim hover:border-chalk/40 focus:border-glow focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-accent)_35%,transparent)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
        />
        {busy ? (
          <button
            type="button"
            aria-label="Interromper"
            title="Interromper a resposta"
            onClick={() => cancel.mutate(activeRunId)}
            disabled={cancel.isPending}
            className={`${ROUND_BUTTON} ${TONES.fail.dot} text-ink hover:bg-chalk`}
          >
            <Square className="size-4 fill-current" aria-hidden />
          </button>
        ) : (
          <button
            type="submit"
            aria-label="Enviar"
            title="Enviar (Enter)"
            disabled={content === '' || blocked !== null || send.isPending}
            className={`${ROUND_BUTTON} bg-accent text-white shadow-lift hover:bg-accent-strong`}
          >
            <Send className="size-5 -translate-x-px translate-y-px" aria-hidden />
          </button>
        )}
      </div>
      {model?.isExternal && (
        <p className="px-1 text-xs text-dim">
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

/** The bar over the messages: who you are talking to, how it is, and the ways out. */
function ChatHeader({ agent, onShowList }: { agent: Agent; onShowList: () => void }) {
  return (
    <header className="flex min-h-16 items-center gap-2 border-b border-line bg-sheet px-2 py-2 sm:gap-3 sm:px-3">
      <Link
        to="/agentes"
        aria-label="Voltar para os agentes"
        title="Voltar para os agentes"
        className={`${BAR_LINK} hidden xl:grid`}
      >
        <ArrowLeft className="size-5" aria-hidden />
      </Link>
      {/* Below 1280 px the list and the chat take turns, as in a messaging app on a phone. */}
      <button
        type="button"
        onClick={onShowList}
        aria-label="Ver as conversas"
        title="Ver as conversas"
        className={`${BAR_LINK} xl:hidden`}
      >
        <ArrowLeft className="size-5" aria-hidden />
      </button>
      <AgentAvatar
        agentId={agent.id}
        appearance={agent.appearance}
        size={42}
        dimmed={!agent.enabled}
        round
      />
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-lg leading-tight font-semibold">{agent.name}</h1>
        <p className="flex min-w-0 items-center gap-x-2 text-sm text-dim">
          <StateLamp state={agent.state} />
          <span className="truncate">· {agent.modelName ?? 'sem modelo'}</span>
        </p>
      </div>
      <Link
        to={`/agentes/${agent.id}`}
        aria-label={`Configurar ${agent.name}`}
        title="Configurar"
        className={BAR_LINK}
      >
        <Settings className="size-5" aria-hidden />
      </Link>
    </header>
  );
}

function Chat({ agent, conversationId }: { agent: Agent; conversationId: string | undefined }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const conversations = useConversations(agent.id);
  const conversation = useConversation(conversationId);
  const [deleting, setDeleting] = useState<ConversationSummary | null>(null);
  // Below 1280 px only: whether the list is shown instead of the chat.
  const [listOpen, setListOpen] = useState(false);

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
      {/* One window, as tall as the screen (on a phone, edge to edge under the top bar): the list on the left, the chat on the right. */}
      <div className="-mx-4 -mt-6 -mb-12 flex h-[calc(100dvh-3.5rem)] min-h-[26rem] overflow-hidden bg-sheet sm:mx-0 sm:my-0 sm:h-[calc(100dvh-8rem)] sm:rounded-xl sm:border sm:border-line sm:shadow-lift lg:h-[calc(100dvh-8.5rem)]">
        <aside
          aria-label="Lista de conversas"
          className={`${listOpen ? 'flex' : 'hidden'} w-full min-w-0 flex-col xl:flex xl:w-88 xl:shrink-0 xl:border-r xl:border-line`}
        >
          <header className="flex min-h-16 items-center justify-between gap-2 border-b border-line px-4">
            <h2 className="text-lg font-semibold">Conversas</h2>
            <Link
              to={chatPath(agent.id)}
              onClick={() => setListOpen(false)}
              aria-label="Nova conversa"
              title="Nova conversa"
              className={BAR_LINK}
            >
              <MessageSquarePlus className="size-5" aria-hidden />
            </Link>
          </header>
          {/* The list scrolls on its own; reachable by keyboard (axe). */}
          <div className="min-h-0 flex-1 overflow-y-auto" tabIndex={0}>
            {conversations.isPending ? (
              <LoadingState label="Carregando as conversas…" />
            ) : (
              <ConversationList
                agent={agent}
                conversations={list}
                currentId={conversationId}
                onOpen={() => setListOpen(false)}
                onDelete={setDeleting}
              />
            )}
          </div>
        </aside>

        <section
          aria-label={`Conversa com ${agent.name}`}
          className={`${listOpen ? 'hidden' : 'flex'} min-w-0 flex-1 flex-col xl:flex`}
        >
          <ChatHeader agent={agent} onShowList={() => setListOpen(true)} />
          <div className="min-h-0 flex-1 overflow-y-auto bg-ink px-3 py-4 sm:px-6" tabIndex={0}>
            {conversationId === undefined && (
              <div className="grid h-full place-items-center py-10 text-center">
                <div className="flex flex-col items-center">
                  <AgentAvatar
                    agentId={agent.id}
                    appearance={agent.appearance}
                    size={80}
                    dimmed={!agent.enabled}
                    round
                  />
                  <p className="mt-4 text-lg font-semibold">Nova conversa com {agent.name}</p>
                  <p className="mt-1 max-w-sm text-sm text-dim">
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

  if (agent) {
    return <Chat key={conversationId ?? 'new'} agent={agent} conversationId={conversationId} />;
  }

  return (
    <>
      <header className="mb-4 flex items-center gap-3">
        <Link
          to="/agentes"
          aria-label="Voltar para os agentes"
          title="Voltar para os agentes"
          className={BAR_LINK}
        >
          <ArrowLeft className="size-5" aria-hidden />
        </Link>
        <h1 className="text-2xl font-bold">Conversa</h1>
      </header>
      {isPending && <LoadingState label="Carregando o agente…" />}
      {error && !agents && (
        <ErrorState
          title="Não foi possível carregar o agente."
          error={error}
          onRetry={() => void refetch()}
        />
      )}
      {agents && (
        <div className="rounded-xl border border-line bg-sheet p-5">
          <p className="font-semibold">Agente não encontrado.</p>
          <p className="mt-1 text-sm text-dim">
            Ele pode ter sido excluído. As execuções antigas continuam nos{' '}
            <Link to="/logs" className={LINK}>
              logs
            </Link>
            .
          </p>
        </div>
      )}
    </>
  );
}
