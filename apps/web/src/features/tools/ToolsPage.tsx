import type { AgentTools, ToolInfo, ToolPermission } from '@ea/shared';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { RiskBadge } from '../../components/ApprovalCard';
import { Button, buttonClass } from '../../components/Button';
import { SelectField, Switch } from '../../components/Form';
import { ConfirmDialog } from '../../components/Modal';
import { PageHeader } from '../../components/PageHeader';
import { Panel } from '../../components/Panel';
import { EmptyState, ErrorState, LoadingState } from '../../components/States';
import { useToast } from '../../components/Toast';
import { errorMessage } from '../../lib/errors';
import { useAgents } from '../../lib/queries';
import {
  useAgentTools,
  useSetAgentTools,
  useSetToolEnabled,
  useTools,
} from '../../lib/tool-queries';
import { LINK } from '../../components/TextLink';
import { FormError, Notice } from '../../components/Notice';
import { Tip } from '../../components/Tip';

const PERMISSIONS: { value: ToolPermission; label: string; hint: string }[] = [
  { value: 'deny', label: 'Bloqueada', hint: 'O agente não pode usar.' },
  { value: 'ask', label: 'Pede aprovação', hint: 'Cada uso espera a sua decisão.' },
  { value: 'allow', label: 'Permitida', hint: 'O agente usa sem perguntar.' },
];

/** The catalogue: what exists, how risky it is, and the installation-wide switch. */
function ToolCatalogue({ tools }: { tools: readonly ToolInfo[] }) {
  const setEnabled = useSetToolEnabled();
  const notify = useToast();
  const [confirming, setConfirming] = useState<ToolInfo | null>(null);

  const change = (tool: ToolInfo, enabled: boolean) =>
    setEnabled.mutate(
      { name: tool.name, enabled },
      {
        onSuccess: () => {
          setConfirming(null);
          notify(`“${tool.title}” ${enabled ? 'ligada' : 'desligada'} nesta instalação.`);
        },
        onError: (error) => {
          if (!enabled) notify(errorMessage(error), 'fail');
        },
      },
    );

  return (
    <>
      <ul className="divide-y divide-line">
        {tools.map((tool) => (
          <li key={tool.name} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
            <div className="min-w-0 flex-1 basis-64">
              <p className="flex flex-wrap items-center gap-2 font-semibold">
                {tool.title}
                <RiskBadge risk={tool.risk} />
              </p>
              <p className="text-sm text-dim">{tool.summary}</p>
              {tool.maxPermission === 'ask' && (
                <p className="text-sm text-dim">
                  Nunca roda sem aprovação: cada uso espera a sua decisão.
                </p>
              )}
            </div>
            {tool.offByDefault ? (
              <Switch
                checked={tool.enabled}
                onChange={(enabled) => (enabled ? setConfirming(tool) : change(tool, false))}
                disabled={setEnabled.isPending}
                label={`${tool.title} ligada nesta instalação`}
              >
                <span className="w-20 text-left text-dim">
                  {tool.enabled ? 'Ligada' : 'Desligada'}
                </span>
              </Switch>
            ) : (
              <span className="text-sm text-dim">Sempre disponível</span>
            )}
          </li>
        ))}
      </ul>

      {confirming && (
        <ConfirmDialog
          title={`Ligar “${confirming.title}”?`}
          confirmLabel="Ligar"
          busy={setEnabled.isPending}
          error={setEnabled.error ? errorMessage(setEnabled.error) : undefined}
          onConfirm={() => change(confirming, true)}
          onCancel={() => {
            setEnabled.reset();
            setConfirming(null);
          }}
        >
          <p>
            Um script aprovado roda com o seu usuário do sistema e não fica isolado do resto do
            computador. Ligar a ferramenta não a libera para ninguém: ainda é preciso concedê-la a
            um agente, e cada execução vai pedir a sua aprovação, mostrando o script e os
            argumentos.
          </p>
        </ConfirmDialog>
      )}
    </>
  );
}

function PermissionRow({
  tool,
  value,
  onChange,
}: {
  tool: ToolInfo;
  value: ToolPermission;
  onChange: (permission: ToolPermission) => void;
}) {
  return (
    <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <legend className="sr-only">{tool.title}</legend>
      <div className="min-w-0 flex-1 basis-56" aria-hidden>
        <p className="font-semibold">{tool.title}</p>
        <p className="text-sm text-dim">
          {tool.enabled
            ? tool.summary
            : 'Desligada nesta instalação: não funciona até ser ligada no catálogo acima.'}
        </p>
      </div>
      <div className="flex flex-wrap gap-1">
        {PERMISSIONS.map((option) => {
          const unavailable = option.value === 'allow' && tool.maxPermission !== 'allow';
          const checked = value === option.value;
          return (
            <label
              key={option.value}
              title={
                unavailable ? 'Ferramentas de risco alto sempre pedem aprovação.' : option.hint
              }
              className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm ${
                checked ? 'border-glow bg-sheet-raised text-chalk' : 'border-line text-dim'
              } ${unavailable ? 'cursor-not-allowed opacity-50' : 'hover:text-chalk'}`}
            >
              <input
                type="radio"
                name={`permission-${tool.name}`}
                value={option.value}
                checked={checked}
                disabled={unavailable}
                onChange={() => onChange(option.value)}
                className="accent-info"
              />
              {option.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** The permissions of one agent, edited as a whole and saved with one button. */
function AgentPermissions({ tools, saved }: { tools: readonly ToolInfo[]; saved: AgentTools }) {
  const save = useSetAgentTools();
  const notify = useToast();
  const stored = new Map(saved.grants.map((grant) => [grant.toolName, grant.permission]));
  const [draft, setDraft] = useState<Record<string, ToolPermission>>({});
  const valueOf = (tool: ToolInfo) => draft[tool.name] ?? stored.get(tool.name) ?? 'deny';
  const dirty = tools.some((tool) => valueOf(tool) !== (stored.get(tool.name) ?? 'deny'));

  const submit = () =>
    save.mutate(
      {
        agentId: saved.agentId,
        grants: tools.map((tool) => ({ toolName: tool.name, permission: valueOf(tool) })),
      },
      {
        onSuccess: () => {
          setDraft({});
          notify('Permissões salvas.');
        },
      },
    );

  return (
    <>
      {saved.modelSupportsTools === false && (
        <Notice tone="wait" role="status" className="m-4">
          O modelo deste agente não aceita ferramentas: as permissões ficam guardadas, mas só passam
          a valer com um modelo que aceite.{' '}
          <Link to={`/agentes/${saved.agentId}`} className={LINK}>
            Trocar o modelo
          </Link>
        </Notice>
      )}
      {saved.modelSupportsTools === null && (
        <Notice tone="wait" role="status" className="m-4">
          Este agente ainda não tem um modelo.{' '}
          <Link to={`/agentes/${saved.agentId}`} className={LINK}>
            Escolher um modelo
          </Link>
        </Notice>
      )}

      <div className="divide-y divide-line">
        {tools.map((tool) => (
          <PermissionRow
            key={tool.name}
            tool={tool}
            value={valueOf(tool)}
            onChange={(permission) =>
              setDraft((current) => ({ ...current, [tool.name]: permission }))
            }
          />
        ))}
      </div>

      <div className="space-y-3 border-t border-line px-4 py-3">
        <div className="text-sm">
          <p className="text-dim">
            Pasta de trabalho deste agente (as ferramentas de arquivo não saem dela):
          </p>
          <p className="break-all font-mono text-xs">{saved.workspacePath}</p>
        </div>
        {save.error && <FormError>{errorMessage(save.error)}</FormError>}
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" onClick={submit} disabled={!dirty || save.isPending}>
            Salvar permissões
          </Button>
          {dirty && (
            <Button variant="ghost" onClick={() => setDraft({})} disabled={save.isPending}>
              Descartar alterações
            </Button>
          )}
        </div>
      </div>
    </>
  );
}

/** Tools and who may use them (RF-16, RF-50 to RF-55). */
export function ToolsPage() {
  const tools = useTools();
  const agents = useAgents();
  const [params, setParams] = useSearchParams();
  const selected = params.get('agente') ?? '';
  const agent = agents.data?.find((candidate) => candidate.id === selected);
  const agentTools = useAgentTools(agent?.id);

  return (
    <>
      <PageHeader
        title="Ferramentas"
        description="O que os agentes podem fazer além de conversar. Tudo começa bloqueado: cada agente só usa o que você liberar aqui."
      />

      <Tip id="tools-locked" className="mb-4">
        Tudo começa bloqueado: um agente só usa a ferramenta que você liberar para ele, e as de
        risco alto sempre pedem a sua aprovação.
      </Tip>

      {tools.isPending && <LoadingState label="Carregando as ferramentas…" />}
      {tools.error && !tools.data && (
        <ErrorState
          title="Não foi possível carregar as ferramentas."
          error={tools.error}
          onRetry={() => void tools.refetch()}
        />
      )}

      {tools.data && (
        <div className="space-y-6">
          <Panel title="Catálogo" aside={`${tools.data.length} ferramentas`}>
            <ToolCatalogue tools={tools.data} />
          </Panel>

          <Panel title="Permissões por agente">
            {agents.data && agents.data.length === 0 ? (
              <EmptyState
                title="Nenhum agente ainda."
                action={
                  <Link to="/agentes/novo" className={buttonClass('primary')}>
                    Criar um agente
                  </Link>
                }
              >
                As permissões são dadas agente por agente.
              </EmptyState>
            ) : (
              <>
                <div className="max-w-md px-4 py-3">
                  <SelectField
                    label="Agente"
                    value={agent?.id ?? ''}
                    onChange={(event) =>
                      setParams(event.target.value ? { agente: event.target.value } : {}, {
                        replace: true,
                      })
                    }
                  >
                    <option value="">Escolha um agente…</option>
                    {agents.data?.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </SelectField>
                </div>
                {agent && agentTools.isPending && (
                  <LoadingState label="Carregando as permissões…" />
                )}
                {agent && agentTools.error && !agentTools.data && (
                  <ErrorState
                    title="Não foi possível carregar as permissões."
                    error={agentTools.error}
                    onRetry={() => void agentTools.refetch()}
                  />
                )}
                {agent && agentTools.data && (
                  <div className="border-t border-line">
                    {/* The key discards unsaved choices when another agent is picked. */}
                    <AgentPermissions key={agent.id} tools={tools.data} saved={agentTools.data} />
                  </div>
                )}
              </>
            )}
          </Panel>
        </div>
      )}
    </>
  );
}
