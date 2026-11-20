import { type Agent, AGENT_STATES, type AgentState } from '@ea/shared';
import { Copy, History, MessageSquare, Pencil, Plus, Trash2, Wrench } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Link } from 'react-router';
import { AgentCard } from '../../components/AgentCard';
import { Button, buttonClass, IconButton } from '../../components/Button';
import { SelectField, Switch, TextField } from '../../components/Form';
import { ConfirmDialog } from '../../components/Modal';
import { PageHeader } from '../../components/PageHeader';
import { Panel } from '../../components/Panel';
import { EmptyState, ErrorState, LoadingState } from '../../components/States';
import { useToast } from '../../components/Toast';
import { AGENT_STATE_STYLES } from '../../lib/agent-state';
import { errorMessage } from '../../lib/errors';
import { plural } from '../../lib/format';
import { useAgents, useDeleteAgent, useDuplicateAgent, useUpdateAgent } from '../../lib/queries';
import { AgentTransfer } from './AgentTransfer';
import { ProjectsPanel } from './ProjectsPanel';

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-BR');

function matches(agent: Agent, search: string, state: AgentState | 'all'): boolean {
  if (state !== 'all' && agent.state !== state) return false;
  const term = normalize(search.trim());
  if (term === '') return true;
  return [agent.name, agent.description, agent.projectName ?? '', agent.modelName ?? ''].some(
    (text) => normalize(text).includes(term),
  );
}

function AgentRow({ agent, onDelete }: { agent: Agent; onDelete: (agent: Agent) => void }) {
  const update = useUpdateAgent();
  const duplicate = useDuplicateAgent();
  const notify = useToast();

  const toggle = (enabled: boolean) =>
    update.mutate(
      { id: agent.id, patch: { enabled } },
      {
        onSuccess: () => notify(`${agent.name} ${enabled ? 'ativado' : 'desativado'}.`),
        onError: (error) => notify(errorMessage(error), 'fail'),
      },
    );

  const copy = () =>
    duplicate.mutate(agent.id, {
      onSuccess: (created) => notify(`Cópia criada: ${created.name}.`),
      onError: (error) => notify(errorMessage(error), 'fail'),
    });

  const iconLink = (to: string, label: string, title: string, icon: ReactNode) => (
    <Link
      to={to}
      aria-label={label}
      title={title}
      className="grid size-10 place-items-center rounded-md text-dim hover:bg-sheet-raised hover:text-chalk"
    >
      {icon}
    </Link>
  );

  return (
    <li>
      <AgentCard
        agentId={agent.id}
        name={agent.name}
        role={`${agent.projectName ?? 'Sem projeto'} · ${agent.modelName ?? 'sem modelo de IA'}`}
        appearance={agent.appearance}
        state={agent.state}
        // Only what the user must fix shows here: the list does not follow runs.
        {...(agent.modelName
          ? {}
          : { activity: 'Sem modelo de IA: escolha um para ele poder trabalhar.' })}
        {...(agent.description ? { meta: agent.description } : {})}
        to={`/agentes/${agent.id}`}
        dimmed={!agent.enabled}
        actions={
          <>
            <Switch
              checked={agent.enabled}
              onChange={toggle}
              disabled={update.isPending}
              label={`${agent.name} ativo`}
            >
              <span className="text-dim">{agent.enabled ? 'Ativo' : 'Desligado'}</span>
            </Switch>
            <span className="ml-auto flex flex-wrap">
              {iconLink(
                `/agentes/${agent.id}/conversa`,
                `Conversar com ${agent.name}`,
                'Conversar',
                <MessageSquare className="size-4.5" aria-hidden />,
              )}
              {iconLink(
                `/logs?agente=${agent.id}`,
                `Histórico de ${agent.name}`,
                'Histórico de execuções',
                <History className="size-4.5" aria-hidden />,
              )}
              {iconLink(
                `/ferramentas?agente=${agent.id}`,
                `Ferramentas de ${agent.name}`,
                'Ferramentas e permissões',
                <Wrench className="size-4.5" aria-hidden />,
              )}
              {iconLink(
                `/agentes/${agent.id}`,
                `Editar ${agent.name}`,
                'Editar',
                <Pencil className="size-4.5" aria-hidden />,
              )}
              <IconButton
                label={`Duplicar ${agent.name}`}
                onClick={copy}
                disabled={duplicate.isPending}
              >
                <Copy className="size-4.5" aria-hidden />
              </IconButton>
              <IconButton label={`Excluir ${agent.name}`} onClick={() => onDelete(agent)}>
                <Trash2 className="size-4.5" aria-hidden />
              </IconButton>
            </span>
          </>
        }
      />
    </li>
  );
}

function DeleteAgentDialog({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const remove = useDeleteAgent();
  const notify = useToast();
  return (
    <ConfirmDialog
      title={`Excluir ${agent.name}?`}
      confirmLabel="Excluir agente"
      busy={remove.isPending}
      error={remove.error ? errorMessage(remove.error) : undefined}
      onCancel={onClose}
      onConfirm={() =>
        remove.mutate(agent.id, {
          onSuccess: () => {
            notify(`${agent.name} excluído.`);
            onClose();
          },
        })
      }
    >
      O agente some das listas e não pode mais ser executado. O histórico de execuções dele é
      mantido. Esta ação não pode ser desfeita.
    </ConfirmDialog>
  );
}

export function AgentsPage() {
  const { data: agents, error, isPending, refetch } = useAgents();
  const [search, setSearch] = useState('');
  const [state, setState] = useState<AgentState | 'all'>('all');
  const [deleting, setDeleting] = useState<Agent | null>(null);

  const visible = agents?.filter((agent) => matches(agent, search, state)) ?? [];

  return (
    <>
      <PageHeader
        title="Agentes"
        description="Cada agente tem um objetivo, instruções e limites próprios."
        actions={
          <div className="flex flex-wrap gap-2">
            <AgentTransfer agentCount={agents?.length ?? 0} />
            <Link to="/agentes/novo" className={buttonClass('primary')}>
              <Plus className="size-4.5" aria-hidden />
              Novo agente
            </Link>
          </div>
        }
      />

      <div className="space-y-6">
        <Panel
          title="Seus agentes"
          aside={
            agents &&
            (visible.length === agents.length
              ? plural(agents.length, 'agente', 'agentes')
              : `${visible.length} de ${plural(agents.length, 'agente', 'agentes')}`)
          }
        >
          {isPending && <LoadingState label="Carregando os agentes…" />}

          {error && !agents && (
            <ErrorState
              title="Não foi possível carregar os agentes."
              error={error}
              onRetry={() => void refetch()}
            />
          )}

          {agents?.length === 0 && (
            <EmptyState
              title="Nenhum agente ainda."
              action={
                <Link to="/agentes/novo" className={buttonClass('primary')}>
                  Criar o primeiro agente
                </Link>
              }
            >
              Um agente precisa de um nome para existir. O resto pode ser ajustado depois.
            </EmptyState>
          )}

          {agents && agents.length > 0 && (
            <>
              <div className="grid gap-3 border-b border-line p-4 sm:grid-cols-[1fr_14rem]">
                <TextField
                  label="Buscar"
                  type="search"
                  placeholder="Nome, projeto ou modelo"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                <SelectField
                  label="Estado"
                  value={state}
                  onChange={(event) => setState(event.target.value as AgentState | 'all')}
                >
                  <option value="all">Todos</option>
                  {AGENT_STATES.map((option) => (
                    <option key={option} value={option}>
                      {AGENT_STATE_STYLES[option].label}
                    </option>
                  ))}
                </SelectField>
              </div>

              {visible.length === 0 ? (
                <EmptyState
                  title="Nenhum agente corresponde aos filtros."
                  action={
                    <Button
                      onClick={() => {
                        setSearch('');
                        setState('all');
                      }}
                    >
                      Limpar a busca
                    </Button>
                  }
                />
              ) : (
                <ul className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Agentes">
                  {visible.map((agent) => (
                    <AgentRow key={agent.id} agent={agent} onDelete={setDeleting} />
                  ))}
                </ul>
              )}
            </>
          )}
        </Panel>

        <ProjectsPanel />
      </div>

      {deleting && <DeleteAgentDialog agent={deleting} onClose={() => setDeleting(null)} />}
    </>
  );
}
