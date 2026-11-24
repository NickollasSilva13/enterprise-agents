import {
  type Agent,
  AGENT_LIMITS,
  type ModelOption,
  type Team,
  type WorkflowTemplateSummary,
} from '@ea/shared';
import { type FormEvent, type ReactNode, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { AgentAvatar } from '../../components/AgentAvatar';
import { Button, buttonClass } from '../../components/Button';
import { SelectField, Switch, TextAreaField, TextField } from '../../components/Form';
import { PageHeader } from '../../components/PageHeader';
import { StateLamp } from '../../components/StateLamp';
import { ErrorState, LoadingState } from '../../components/States';
import { useToast } from '../../components/Toast';
import { errorMessage, fieldErrors } from '../../lib/errors';
import { formatCount } from '../../lib/format';
import { useAgent, useCreateAgent, useModels, useUpdateAgent } from '../../lib/queries';
import { useCreateAreaFromTemplate, useTeams, useWorkflowTemplates } from '../../lib/task-queries';
import { useSetAgentTools } from '../../lib/tool-queries';
import { AppearanceFields } from './AppearanceFields';
import { type AgentFormErrors, type AgentFormValues, parseForm, toFormValues } from './agent-form';
import { FunctionFields } from './FunctionFields';
import { type FunctionValues, initialFunction, type RoleSuggestion, rolesFor } from './team-role';
import { LINK } from '../../components/TextLink';
import { FormError } from '../../components/Notice';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="rounded-xl border border-line bg-sheet p-4">
      <legend className="px-1 text-base font-semibold">{title}</legend>
      <div className="space-y-4">{children}</div>
    </fieldset>
  );
}

interface AgentFormProps {
  agent?: Agent;
  models: readonly ModelOption[];
  teams: readonly Team[];
  templates: readonly WorkflowTemplateSummary[];
}

function AgentForm({ agent, models, teams, templates }: AgentFormProps) {
  const [values, setValues] = useState<AgentFormValues>(() => toFormValues(agent));
  const [role, setRole] = useState<FunctionValues>(() => initialFunction(agent, teams));
  const [errors, setErrors] = useState<AgentFormErrors>({});
  const [newTeamError, setNewTeamError] = useState<string>();
  // What the last role chosen filled in, so choosing another replaces only that.
  const filled = useRef<RoleSuggestion | null>(null);
  const create = useCreateAgent();
  const update = useUpdateAgent();
  const createTeam = useCreateAreaFromTemplate();
  const setTools = useSetAgentTools();
  const navigate = useNavigate();
  const notify = useToast();

  const saving = create.isPending || update.isPending || createTeam.isPending;
  const failure = create.error ?? update.error ?? createTeam.error;
  // A failure that is not about one field is shown next to the buttons.
  const generalError =
    failure && Object.keys(fieldErrors(failure)).length === 0 ? errorMessage(failure) : undefined;

  const set = <K extends keyof AgentFormValues>(field: K, value: AgentFormValues[K]) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const text = (
    field: Exclude<keyof AgentFormValues, 'enabled' | 'appearance' | 'areaAccess'>,
  ) => ({
    value: values[field],
    error: errors[field],
    onChange: (event: { target: { value: string } }) => set(field, event.target.value),
  });

  const roleOptions = rolesFor(role, teams, templates, agent?.id ?? null);
  const hasTeam = role.team.kind !== 'none';

  /**
   * Choosing a role fills in what its template suggests, where the user has
   * not written anything else: objective, instructions and area access.
   */
  const chooseRole = (next: FunctionValues) => {
    setRole(next);
    setNewTeamError(undefined);
    const suggestion =
      roleOptions.find((option) => option.key === next.roleKey)?.suggestion ??
      rolesFor(next, teams, templates, agent?.id ?? null).find(
        (option) => option.key === next.roleKey,
      )?.suggestion ??
      null;
    const before = filled.current;
    if (!suggestion || next.roleKey === role.roleKey) return;
    setValues((current) => ({
      ...current,
      objective:
        current.objective.trim() === '' || current.objective === before?.objective
          ? suggestion.objective
          : current.objective,
      systemPrompt:
        current.systemPrompt.trim() === '' || current.systemPrompt === before?.systemPrompt
          ? suggestion.systemPrompt
          : current.systemPrompt,
      areaAccess: agent ? current.areaAccess : suggestion.areaAccess,
    }));
    filled.current = suggestion;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = parseForm({
      ...values,
      projectId: role.team.kind === 'existing' ? role.team.areaId : hasTeam ? 'nova' : '',
    });
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    if (role.team.kind === 'new' && role.team.name.trim() === '') {
      setNewTeamError('Dê um nome à nova equipe.');
      return;
    }
    try {
      // A new team is made first, from its template, without other agents (D2).
      let projectId = role.team.kind === 'existing' ? role.team.areaId : null;
      let roleId = role.team.kind === 'existing' ? role.roleKey : null;
      if (role.team.kind === 'new' && role.templateId) {
        const team = await createTeam.mutateAsync({
          templateId: role.templateId,
          name: role.team.name.trim(),
          withAgents: false,
        });
        projectId = team.areaId;
        roleId = team.roles.find((entry) => entry.key === role.roleKey)?.id ?? null;
        // If saving the agent fails now, trying again joins this team instead of making another.
        setRole({ ...role, team: { kind: 'existing', areaId: team.areaId }, roleKey: roleId });
      }
      const fields = { ...parsed.agent, projectId, roleId };
      if (agent) {
        const saved = await update.mutateAsync({ id: agent.id, patch: fields });
        notify(`${saved.name} salvo.`);
      } else {
        const saved = await create.mutateAsync(fields);
        // The tools the role suggests come along, each asking first (C-15).
        const tools = roleOptions.find((option) => option.key === role.roleKey)?.suggestion?.tools;
        if (tools && tools.length > 0) {
          await setTools.mutateAsync({
            agentId: saved.id,
            grants: tools.map((toolName) => ({ toolName, permission: 'ask' as const })),
          });
        }
        notify(`${saved.name} criado.`);
      }
      void navigate('/agentes');
    } catch (error) {
      const fields = fieldErrors(error);
      if (role.team.kind === 'new' && createTeam.error && 'name' in fields) {
        setNewTeamError(fields.name);
      }
      setErrors(fields);
    }
  };

  // The agent's current model may have been disabled since it was chosen.
  const missingModel = agent?.modelId && !models.some((model) => model.id === agent.modelId);
  const selectedModel = models.find((model) => model.id === values.modelId);
  const errorCount = Object.values(errors).filter(Boolean).length;

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="max-w-3xl space-y-6">
      <Section title="Identidade">
        <TextField label="Nome" maxLength={AGENT_LIMITS.name} required {...text('name')} />
        <TextField
          label="Descrição"
          maxLength={AGENT_LIMITS.description}
          hint="Uma linha para reconhecer o agente nas listas."
          {...text('description')}
        />
        <TextAreaField
          label="Objetivo"
          rows={3}
          maxLength={AGENT_LIMITS.objective}
          hint="O que este agente deve alcançar."
          {...text('objective')}
        />
        <Switch
          checked={values.enabled}
          onChange={(enabled) => set('enabled', enabled)}
          label="Agente ativo"
        >
          {values.enabled ? 'Ativo: pode ser executado' : 'Inativo: não pode ser executado'}
        </Switch>
      </Section>

      <Section title="Função na empresa">
        <p className="text-sm text-dim">
          Escolha o fluxo de trabalho, a equipe e o papel. Agentes do mesmo papel dividem as tarefas
          da etapa: quanto mais agentes, mais tarefas andam ao mesmo tempo.
        </p>
        <FunctionFields
          values={role}
          onChange={chooseRole}
          teams={teams}
          templates={templates}
          agentId={agent?.id ?? null}
          newTeamError={newTeamError}
        />
        <SelectField
          label="Pasta compartilhada da equipe"
          value={hasTeam ? values.areaAccess : 'none'}
          disabled={!hasTeam}
          onChange={(event) =>
            set('areaAccess', event.target.value as AgentFormValues['areaAccess'])
          }
          hint={
            hasTeam
              ? 'Onde os agentes da equipe trocam arquivos, pelo prefixo "area/". Ler e escrever ainda dependem das ferramentas de arquivo liberadas.'
              : 'Escolha uma equipe: a pasta compartilhada é da equipe.'
          }
        >
          <option value="none">Sem acesso</option>
          <option value="read">Só ler</option>
          <option value="write">Ler e escrever</option>
        </SelectField>
      </Section>

      <Section title="Aparência">
        <AppearanceFields
          agentId={agent?.id ?? 'novo-agente'}
          value={values.appearance}
          onChange={(appearance) => set('appearance', appearance)}
        />
      </Section>

      <Section title="Instruções">
        <TextAreaField
          label="Prompt de sistema"
          rows={10}
          maxLength={AGENT_LIMITS.systemPrompt}
          className="font-mono text-sm"
          hint={`Enviado ao modelo no início de toda conversa. ${formatCount(values.systemPrompt.length)} de ${formatCount(AGENT_LIMITS.systemPrompt)} caracteres.`}
          {...text('systemPrompt')}
        />
      </Section>

      <Section title="Modelo">
        <SelectField
          label="Modelo de IA"
          disabled={models.length === 0 && !missingModel}
          hint={
            selectedModel?.isExternal
              ? `${selectedModel.providerName} é um serviço externo: as instruções e as conversas deste agente serão enviadas a ele.`
              : models.length === 0
                ? 'Nenhum modelo disponível. Sem modelo, o agente não pode ser executado.'
                : 'Sem modelo, o agente não pode ser executado.'
          }
          {...text('modelId')}
        >
          <option value="">Sem modelo</option>
          {missingModel && <option value={agent.modelId ?? ''}>Modelo atual (indisponível)</option>}
          {models.map((model) => (
            <option key={model.id} value={model.id}>
              {model.displayName} ({model.providerName})
            </option>
          ))}
        </SelectField>
        {models.length === 0 && (
          <p className="text-sm">
            <Link to="/modelos" className={LINK}>
              Conectar um provedor de modelos
            </Link>
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Temperatura"
            inputMode="decimal"
            hint={`De ${AGENT_LIMITS.temperature.min} a ${AGENT_LIMITS.temperature.max}. Valores baixos dão respostas mais previsíveis.`}
            {...text('temperature')}
          />
          <TextField
            label="Tokens por resposta"
            inputMode="numeric"
            hint="Tamanho máximo de cada resposta do modelo."
            {...text('maxOutputTokens')}
          />
        </div>
      </Section>

      <Section title="Limites de execução">
        <p className="text-sm text-dim">
          Uma execução que passa de qualquer limite é encerrada, mesmo que o agente não tenha
          terminado.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            label="Passos por execução"
            inputMode="numeric"
            hint={`De ${AGENT_LIMITS.maxSteps.min} a ${AGENT_LIMITS.maxSteps.max}.`}
            {...text('maxSteps')}
          />
          <TextField
            label="Tempo por execução (segundos)"
            inputMode="numeric"
            hint={`De ${AGENT_LIMITS.maxDurationSeconds.min} a ${formatCount(AGENT_LIMITS.maxDurationSeconds.max)}.`}
            {...text('maxDurationSeconds')}
          />
          <TextField
            label="Tokens por execução"
            inputMode="numeric"
            placeholder="Sem limite"
            hint="Deixe vazio para não limitar."
            {...text('maxTotalTokens')}
          />
        </div>
      </Section>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" disabled={saving}>
          {agent ? 'Salvar alterações' : 'Criar agente'}
        </Button>
        <Link to="/agentes" className={buttonClass('secondary')}>
          Cancelar
        </Link>
        {(errorCount > 0 || generalError) && (
          <FormError>
            {generalError ??
              (errorCount === 1
                ? 'Corrija o campo destacado.'
                : `Corrija os ${errorCount} campos destacados.`)}
          </FormError>
        )}
      </div>
    </form>
  );
}

/** Create (`/agentes/novo`) or edit (`/agentes/:id`) an agent. */
export function AgentFormPage() {
  const { id } = useParams();
  const agent = useAgent(id);
  const teams = useTeams();
  const templates = useWorkflowTemplates();
  const models = useModels();

  const error = agent.error ?? teams.error ?? templates.error ?? models.error;
  const loading =
    (id !== undefined && agent.isPending) ||
    teams.isPending ||
    templates.isPending ||
    models.isPending;
  const title = id === undefined ? 'Novo agente' : (agent.data?.name ?? 'Agente');

  return (
    <>
      <PageHeader
        title={title}
        description={
          agent.data ? (
            <span className="flex items-center gap-3">
              <AgentAvatar
                agentId={agent.data.id}
                appearance={agent.data.appearance}
                size={28}
                dimmed={!agent.data.enabled}
              />
              <StateLamp state={agent.data.state} />
            </span>
          ) : (
            id === undefined && 'Só o nome é obrigatório. O resto pode ser ajustado depois.'
          )
        }
      />

      {loading && !error && <LoadingState label="Carregando o agente…" />}

      {error && (
        <ErrorState
          title={
            agent.error
              ? 'Não foi possível abrir este agente.'
              : 'Não foi possível carregar o formulário.'
          }
          error={error}
          onRetry={() => {
            void agent.refetch();
            void teams.refetch();
            void templates.refetch();
            void models.refetch();
          }}
        />
      )}

      {!loading && !error && teams.data && templates.data && models.data && (
        <div className="space-y-6">
          <AgentForm
            key={agent.data?.id ?? 'new'}
            {...(agent.data ? { agent: agent.data } : {})}
            models={models.data}
            teams={teams.data}
            templates={templates.data}
          />
          {agent.data && (
            <section className="max-w-3xl rounded-xl border border-line bg-sheet p-4">
              <h2 className="text-base font-semibold">Histórico de atividades</h2>
              <p className="mt-1 text-sm text-dim">
                As conversas ficam no chat do agente; cada execução, com seus passos, fica nos logs.
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                <Link
                  to={`/agentes/${agent.data.id}/conversa`}
                  className={buttonClass('secondary')}
                >
                  Abrir as conversas
                </Link>
                <Link to={`/logs?agente=${agent.data.id}`} className={buttonClass('secondary')}>
                  Ver as execuções
                </Link>
              </div>
            </section>
          )}
        </div>
      )}
    </>
  );
}
