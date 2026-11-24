import {
  STAGE_KINDS,
  type StageKind,
  type TransitionActor,
  type Workflow,
  WORKFLOW_LIMITS,
  workflowUpdateSchema,
} from '@ea/shared';
import {
  ArrowLeft,
  ArrowRight,
  LayoutTemplate,
  Play,
  Plus,
  RotateCcw,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Button, IconButton } from '../../components/Button';
import { SelectField, TextAreaField, TextField } from '../../components/Form';
import { Modal } from '../../components/Modal';
import { PageHeader } from '../../components/PageHeader';
import { Panel } from '../../components/Panel';
import { ErrorState, LoadingState } from '../../components/States';
import { StatusPill } from '../../components/StatusPill';
import { useToast } from '../../components/Toast';
import { errorMessage, fieldErrors } from '../../lib/errors';
import { useProjects } from '../../lib/queries';
import { useSaveTemplate, useSaveWorkflow, useWorkflow } from '../../lib/task-queries';
import { STAGE_KIND_LABEL } from './TaskBadges';
import { BACK_LINK, LINK } from '../../components/TextLink';
import { FormError, Notice } from '../../components/Notice';
import { FlowGraph, FlowLegend } from './FlowGraph';
import {
  exitsOf,
  type FlowRole,
  type FlowStage,
  type FlowTransition,
  flowSentences,
  flowWarnings,
  type Orientation,
  whoWorks,
} from './flow-graph';

// The flow of a team (Phase 16; drawn since Phase 39, D5): the stages as
// cards joined by arrows, a panel for the stage picked, the flow in words,
// what needs attention, a pretend task walked through it, and the team's roles.

interface StageDraft {
  key: string;
  name: string;
  kind: StageKind;
  roleKey: string | null;
}

interface RoleDraft {
  key: string;
  name: string;
}

interface TransitionDraft {
  id: string;
  from: string;
  to: string;
  actor: TransitionActor;
}

const ACTOR_LABEL: Record<TransitionActor, string> = {
  agent: 'O agente da etapa',
  human: 'Só você',
  both: 'O agente ou você',
};

const KIND_HELP: Record<StageKind, string> = {
  agent: 'Um agente do papel escolhido trabalha e passa adiante.',
  human: 'A tarefa espera você decidir para onde vai.',
  done: 'A tarefa termina aqui.',
};

let counter = 0;
const draftKey = (prefix: string) => {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
};

interface Draft {
  roles: RoleDraft[];
  stages: StageDraft[];
  transitions: TransitionDraft[];
}

function draftOf(workflow: Workflow): Draft {
  return {
    roles: workflow.roles.map((role) => ({ key: role.id, name: role.name })),
    stages: workflow.stages.map((stage) => ({
      key: stage.id,
      name: stage.name,
      kind: stage.kind,
      roleKey: stage.roleId,
    })),
    transitions: workflow.transitions.map((transition) => ({
      id: transition.id,
      from: transition.fromStageId,
      to: transition.toStageId,
      actor: transition.actor,
    })),
  };
}

/** A flow with no stages yet starts with the smallest useful one, and the roles the team has. */
function starter(workflow: Workflow): Draft {
  const doing = draftKey('etapa');
  const review = draftKey('etapa');
  const done = draftKey('etapa');
  const roles = workflow.roles.map((role) => ({ key: role.id, name: role.name }));
  return {
    roles,
    stages: [
      { key: doing, name: 'Em andamento', kind: 'agent', roleKey: roles[0]?.key ?? null },
      { key: review, name: 'Sua revisão', kind: 'human', roleKey: null },
      { key: done, name: 'Concluído', kind: 'done', roleKey: null },
    ],
    transitions: [
      { id: draftKey('passagem'), from: doing, to: review, actor: 'both' },
      { id: draftKey('passagem'), from: review, to: done, actor: 'human' },
      { id: draftKey('passagem'), from: review, to: doing, actor: 'human' },
    ],
  };
}

/** Wide screens draw the flow across; phones, down the page (D5). */
function useOrientation(): Orientation {
  const query = '(min-width: 640px)';
  const read = () =>
    typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : true;
  const [wide, setWide] = useState(read);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia(query);
    const change = () => setWide(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  return wide ? 'row' : 'column';
}

function Editor({
  areaId,
  areaName,
  workflow,
}: {
  areaId: string;
  areaName: string;
  workflow: Workflow;
}) {
  const save = useSaveWorkflow();
  const notify = useToast();
  const navigate = useNavigate();
  const orientation = useOrientation();
  const [draft, setDraft] = useState<Draft>(() =>
    workflow.stages.length > 0 ? draftOf(workflow) : starter(workflow),
  );
  const [selected, setSelected] = useState<string | null>(() => draft.stages[0]?.key ?? null);
  const [simulation, setSimulation] = useState<{ at: string; log: string[] } | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const { roles, stages, transitions } = draft;

  const openTasks = new Map(workflow.stages.map((stage) => [stage.id, stage.openTasks]));
  const members = new Map(workflow.roles.map((role) => [role.id, role.agents] as const));
  const flowRoles: FlowRole[] = roles.map((role) => ({
    key: role.key,
    name: role.name || '(sem nome)',
    agents: members.get(role.key) ?? [],
  }));
  const flowStages: FlowStage[] = stages.map((stage) => ({
    key: stage.key,
    name: stage.name,
    kind: stage.kind,
    role: stage.roleKey,
  }));
  // From a stage that waits for you or is final, only you move tasks on.
  const effective = transitions.map((transition) => ({
    ...transition,
    actor:
      stages.find((stage) => stage.key === transition.from)?.kind === 'agent'
        ? transition.actor
        : ('human' as const),
  }));
  const warnings = flowWarnings(flowStages, effective, flowRoles);
  const sentences = flowSentences(flowStages, effective, flowRoles);
  const stage = stages.find((entry) => entry.key === selected);
  const nameOf = (key: string) => stages.find((entry) => entry.key === key)?.name || '(sem nome)';

  const update = (change: (current: Draft) => Draft) => {
    setDraft(change);
    setSimulation(null);
  };
  const patchStage = (key: string, patch: Partial<StageDraft>) =>
    update((current) => ({
      ...current,
      stages: current.stages.map((entry) => {
        if (entry.key !== key) return entry;
        const next = { ...entry, ...patch };
        return next.kind === 'agent' ? next : { ...next, roleKey: null };
      }),
    }));
  const moveStage = (key: string, by: -1 | 1) =>
    update((current) => {
      const index = current.stages.findIndex((entry) => entry.key === key);
      const next = [...current.stages];
      const [moved] = next.splice(index, 1);
      if (moved) next.splice(Math.max(0, Math.min(next.length, index + by)), 0, moved);
      return { ...current, stages: next };
    });
  const removeStage = (key: string) => {
    update((current) => ({
      ...current,
      stages: current.stages.filter((entry) => entry.key !== key),
      transitions: current.transitions.filter((entry) => entry.from !== key && entry.to !== key),
    }));
    setSelected(null);
  };
  const addStage = () => {
    const key = draftKey('etapa');
    update((current) => {
      // A new stage goes before the end, linked from the stage before it and to the end.
      const finalAt = current.stages.findIndex((entry) => entry.kind === 'done');
      const at = finalAt === -1 ? current.stages.length : finalAt;
      const before = current.stages[at - 1];
      const end = current.stages[at];
      const next = [...current.stages];
      next.splice(at, 0, {
        key,
        name: `Etapa ${current.stages.length + 1}`,
        kind: 'agent',
        roleKey: null,
      });
      return {
        ...current,
        stages: next,
        transitions: [
          ...current.transitions,
          ...(before
            ? [{ id: draftKey('passagem'), from: before.key, to: key, actor: 'both' as const }]
            : []),
          ...(end
            ? [{ id: draftKey('passagem'), from: key, to: end.key, actor: 'both' as const }]
            : []),
        ],
      };
    });
    setSelected(key);
  };
  const patchTransition = (id: string, patch: Partial<TransitionDraft>) =>
    update((current) => ({
      ...current,
      transitions: current.transitions.map((entry) =>
        entry.id === id ? { ...entry, ...patch } : entry,
      ),
    }));
  const addRole = (name: string, forStage?: string) => {
    const key = draftKey('papel');
    update((current) => ({
      ...current,
      roles: [...current.roles, { key, name }],
      stages: forStage
        ? current.stages.map((entry) =>
            entry.key === forStage ? { ...entry, roleKey: key } : entry,
          )
        : current.stages,
    }));
  };

  const submit = () => {
    const payload = {
      roles: roles.map(({ key, name }) => ({ key, name })),
      stages: stages.map(({ key, name, kind, roleKey }) => ({ key, name, kind, roleKey })),
      transitions: effective.map(({ from, to, actor }) => ({ from, to, actor })),
    };
    const parsed = workflowUpdateSchema.safeParse(payload);
    if (!parsed.success) {
      setProblems([...new Set(parsed.error.issues.map((issue) => issue.message))]);
      return;
    }
    setProblems([]);
    save.mutate(
      { areaId, workflow: parsed.data },
      {
        onSuccess: () => {
          notify(`Fluxo de ${areaName} salvo.`);
          void navigate(`/tarefas?area=${encodeURIComponent(areaId)}`);
        },
      },
    );
  };

  const startSimulation = () => {
    const [first] = stages;
    if (!first) return;
    setSelected(null);
    setSimulation({
      at: first.key,
      log: [`A tarefa chega em ${first.name}: ${whoWorks(flowStages[0]!, flowRoles)}.`],
    });
  };

  return (
    <div className="space-y-6">
      {warnings.length > 0 && (
        <Notice tone="wait" icon={<TriangleAlert className="size-4" aria-hidden />}>
          <p className="font-semibold">Pontos de atenção no fluxo</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {warnings.map((warning) => (
              <li key={warning.text}>
                {warning.stage ? (
                  <button
                    type="button"
                    className={LINK}
                    onClick={() => {
                      setSimulation(null);
                      setSelected(warning.stage);
                    }}
                  >
                    {warning.text}
                  </button>
                ) : (
                  warning.text
                )}
              </li>
            ))}
          </ul>
        </Notice>
      )}

      <Panel title="Fluxo" aside={`${stages.length} de até ${WORKFLOW_LIMITS.stages} etapas`}>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
          <Button onClick={addStage} disabled={stages.length >= WORKFLOW_LIMITS.stages}>
            <Plus className="size-4.5" aria-hidden />
            Etapa
          </Button>
          <Button onClick={startSimulation} disabled={stages.length === 0}>
            <Play className="size-4.5" aria-hidden />
            Simular uma tarefa
          </Button>
          <p className="text-sm text-dim">Clique numa etapa para editar.</p>
        </div>
        <div
          className="overflow-auto px-2 py-3"
          tabIndex={0}
          role="region"
          aria-label="Desenho do fluxo"
        >
          <FlowGraph
            stages={flowStages}
            transitions={effective}
            roles={flowRoles}
            orientation={orientation}
            selected={simulation ? null : selected}
            current={simulation?.at ?? null}
            onSelect={(key) => {
              setSimulation(null);
              setSelected(key);
            }}
            label={`Fluxo de ${areaName}: ${stages.map((entry) => entry.name).join(', ')}`}
          />
        </div>
        <div className="border-t border-line px-4 py-2.5">
          <FlowLegend />
        </div>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        {simulation ? (
          <SimulationPanel
            stages={flowStages}
            transitions={effective}
            roles={flowRoles}
            state={simulation}
            onMove={(next) => setSimulation(next)}
            onRestart={startSimulation}
            onClose={() => setSimulation(null)}
          />
        ) : stage ? (
          <Panel title={`Etapa: ${stage.name || '(sem nome)'}`}>
            <div className="space-y-5 p-4">
              <TextField
                label="Nome da etapa"
                value={stage.name}
                maxLength={WORKFLOW_LIMITS.stageName}
                onChange={(event) => patchStage(stage.key, { name: event.target.value })}
              />
              <fieldset>
                <legend className="mb-2 text-sm font-semibold">Quem age nesta etapa</legend>
                <div className="grid gap-2 sm:grid-cols-3">
                  {STAGE_KINDS.map((kind) => (
                    <label key={kind} className={CARD}>
                      <input
                        type="radio"
                        name={`tipo-${stage.key}`}
                        className={RADIO}
                        checked={stage.kind === kind}
                        onChange={() => patchStage(stage.key, { kind })}
                      />
                      <span className="leading-tight">
                        <span className="block font-semibold">{STAGE_KIND_LABEL[kind]}</span>
                        <span className="block text-xs text-dim">{KIND_HELP[kind]}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              {stage.kind === 'agent' && (
                <div className="space-y-2">
                  <SelectField
                    label="Papel que atende a etapa"
                    value={stage.roleKey ?? ''}
                    onChange={(event) =>
                      patchStage(stage.key, { roleKey: event.target.value || null })
                    }
                    hint="Todo agente da equipe com este papel pode pegar as tarefas daqui: com mais agentes, mais tarefas andam ao mesmo tempo."
                  >
                    <option value="">Sem papel (as tarefas param aqui)</option>
                    {roles.map((role) => (
                      <option key={role.key} value={role.key}>
                        {role.name || '(sem nome)'}
                      </option>
                    ))}
                  </SelectField>
                  <div>
                    <Button onClick={() => addRole(stage.name || 'Novo papel', stage.key)}>
                      <Plus className="size-4.5" aria-hidden />
                      Novo papel para esta etapa
                    </Button>
                  </div>
                  <RoleMembers agents={members.get(stage.roleKey ?? '') ?? []} />
                </div>
              )}
              <fieldset className="space-y-2">
                <legend className="mb-1 text-sm font-semibold">Daqui a tarefa pode ir para</legend>
                {effective.filter((entry) => entry.from === stage.key).length === 0 && (
                  <p className="text-sm text-dim">Nenhuma etapa: a tarefa para aqui.</p>
                )}
                <ul className="space-y-2">
                  {effective
                    .filter((entry) => entry.from === stage.key)
                    .map((transition) => (
                      <li
                        key={transition.id}
                        className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_auto]"
                      >
                        <SelectField
                          label="Etapa"
                          value={transition.to}
                          onChange={(event) =>
                            patchTransition(transition.id, { to: event.target.value })
                          }
                        >
                          {stages
                            .filter((entry) => entry.key !== stage.key)
                            .map((entry) => (
                              <option key={entry.key} value={entry.key}>
                                {nameOf(entry.key)}
                              </option>
                            ))}
                        </SelectField>
                        <SelectField
                          label="Quem leva"
                          value={transition.actor}
                          disabled={stage.kind !== 'agent'}
                          onChange={(event) =>
                            patchTransition(transition.id, {
                              actor: event.target.value as TransitionActor,
                            })
                          }
                        >
                          {(Object.keys(ACTOR_LABEL) as TransitionActor[]).map((actor) => (
                            <option key={actor} value={actor}>
                              {ACTOR_LABEL[actor]}
                            </option>
                          ))}
                        </SelectField>
                        <IconButton
                          label={`Remover a passagem de ${nameOf(stage.key)} para ${nameOf(transition.to)}`}
                          onClick={() =>
                            update((current) => ({
                              ...current,
                              transitions: current.transitions.filter(
                                (entry) => entry.id !== transition.id,
                              ),
                            }))
                          }
                        >
                          <Trash2 className="size-4.5" aria-hidden />
                        </IconButton>
                      </li>
                    ))}
                </ul>
                <div>
                  <Button
                    disabled={
                      stages.length < 2 || transitions.length >= WORKFLOW_LIMITS.transitions
                    }
                    onClick={() => {
                      const used = new Set(
                        transitions
                          .filter((entry) => entry.from === stage.key)
                          .map((entry) => entry.to),
                      );
                      const index = stages.findIndex((entry) => entry.key === stage.key);
                      const target =
                        stages.slice(index + 1).find((entry) => !used.has(entry.key)) ??
                        stages.find((entry) => entry.key !== stage.key && !used.has(entry.key)) ??
                        stages.find((entry) => entry.key !== stage.key);
                      if (!target) return;
                      update((current) => ({
                        ...current,
                        transitions: [
                          ...current.transitions,
                          {
                            id: draftKey('passagem'),
                            from: stage.key,
                            to: target.key,
                            actor: stage.kind === 'agent' ? 'both' : 'human',
                          },
                        ],
                      }));
                    }}
                  >
                    <ArrowRight className="size-4.5" aria-hidden />
                    Ligar a outra etapa
                  </Button>
                </div>
              </fieldset>
              <div className="flex flex-wrap gap-2 border-t border-line pt-4">
                <Button
                  onClick={() => moveStage(stage.key, -1)}
                  disabled={stages[0]?.key === stage.key}
                >
                  <ArrowLeft className="size-4.5" aria-hidden />
                  Mover antes
                </Button>
                <Button
                  onClick={() => moveStage(stage.key, 1)}
                  disabled={stages[stages.length - 1]?.key === stage.key}
                >
                  Mover depois
                  <ArrowRight className="size-4.5" aria-hidden />
                </Button>
                <Button
                  onClick={() => removeStage(stage.key)}
                  disabled={(openTasks.get(stage.key) ?? 0) > 0}
                  title={(openTasks.get(stage.key) ?? 0) > 0 ? 'A etapa tem tarefas.' : undefined}
                >
                  <Trash2 className="size-4.5" aria-hidden />
                  Remover etapa
                </Button>
              </div>
            </div>
          </Panel>
        ) : (
          <Panel title="Etapa">
            <p className="p-4 text-sm text-dim">
              Clique numa etapa do desenho para mudar o nome, quem age nela e para onde a tarefa
              pode ir.
            </p>
          </Panel>
        )}

        <div className="space-y-6">
          <Panel title="Em palavras">
            <ol className="list-decimal space-y-1.5 py-3 pr-4 pl-9 text-sm">
              {sentences.map((sentence, index) => (
                <li key={`${index}-${sentence}`}>{sentence}</li>
              ))}
            </ol>
          </Panel>
          <Panel title="Papéis da equipe" aside={`${roles.length} de até ${WORKFLOW_LIMITS.roles}`}>
            <div className="space-y-3 p-4">
              <p className="text-sm text-dim">
                Um papel é um posto de trabalho da equipe. Para pôr um agente num papel, edite o
                agente em{' '}
                <Link to="/agentes" className={LINK}>
                  Agentes
                </Link>{' '}
                (Função na empresa).
              </p>
              <ul className="space-y-3">
                {roles.map((role, index) => (
                  <li key={role.key} className="grid items-end gap-2 sm:grid-cols-[1fr_auto]">
                    <TextField
                      label={`Papel ${index + 1}`}
                      value={role.name}
                      maxLength={WORKFLOW_LIMITS.roleName}
                      hint={
                        (members.get(role.key) ?? []).map((agent) => agent.name).join(', ') ||
                        'Nenhum agente ainda.'
                      }
                      onChange={(event) =>
                        update((current) => ({
                          ...current,
                          roles: current.roles.map((entry) =>
                            entry.key === role.key ? { ...entry, name: event.target.value } : entry,
                          ),
                        }))
                      }
                    />
                    <IconButton
                      label={`Remover o papel ${role.name}`}
                      title="Os agentes do papel ficam na equipe, sem papel."
                      onClick={() =>
                        update((current) => ({
                          ...current,
                          roles: current.roles.filter((entry) => entry.key !== role.key),
                          stages: current.stages.map((entry) =>
                            entry.roleKey === role.key ? { ...entry, roleKey: null } : entry,
                          ),
                        }))
                      }
                    >
                      <Trash2 className="size-4.5" aria-hidden />
                    </IconButton>
                  </li>
                ))}
              </ul>
              <div>
                <Button
                  disabled={roles.length >= WORKFLOW_LIMITS.roles}
                  onClick={() => addRole(`Papel ${roles.length + 1}`)}
                >
                  <Plus className="size-4.5" aria-hidden />
                  Adicionar papel
                </Button>
              </div>
            </div>
          </Panel>
        </div>
      </div>

      {(problems.length > 0 || save.error) && (
        <Notice tone="fail" role="alert">
          {problems.length > 0 ? (
            <ul className="list-disc pl-5">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          ) : (
            errorMessage(save.error)
          )}
        </Notice>
      )}
      <div className="flex flex-wrap gap-3">
        <Button variant="primary" onClick={submit} disabled={save.isPending}>
          {save.isPending ? 'Salvando…' : 'Salvar fluxo'}
        </Button>
        <Link
          to={`/tarefas?area=${encodeURIComponent(areaId)}`}
          className={`self-center text-sm ${LINK}`}
        >
          Voltar sem salvar
        </Link>
      </div>
    </div>
  );
}

const CARD =
  'relative flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-line bg-sheet px-3 py-2 text-sm transition-colors hover:border-line-strong has-[:checked]:border-glow has-[:checked]:bg-sheet-raised has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-glow';
const RADIO = 'absolute inset-0 size-full cursor-pointer opacity-0';

/** The agents of a role, each free or busy. */
function RoleMembers({ agents }: { agents: readonly { name: string; busy: boolean }[] }) {
  if (agents.length === 0) {
    return (
      <p className="text-sm text-dim">
        Ninguém tem este papel ainda: dê o papel a um agente em Agentes.
      </p>
    );
  }
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Agentes do papel">
      {agents.map((agent) => (
        <li key={agent.name}>
          <StatusPill tone={agent.busy ? 'wait' : 'ok'}>
            {agent.name} · {agent.busy ? 'ocupado' : 'livre'}
          </StatusPill>
        </li>
      ))}
    </ul>
  );
}

/**
 * "Simular uma tarefa" (D5): walks a pretend task through the flow, one
 * choice at a time, showing who would work it at each stage. Nothing runs.
 */
function SimulationPanel({
  stages,
  transitions,
  roles,
  state,
  onMove,
  onRestart,
  onClose,
}: {
  stages: readonly FlowStage[];
  transitions: readonly FlowTransition[];
  roles: readonly FlowRole[];
  state: { at: string; log: string[] };
  onMove: (next: { at: string; log: string[] }) => void;
  onRestart: () => void;
  onClose: () => void;
}) {
  const here = stages.find((stage) => stage.key === state.at);
  const exits = exitsOf(state.at, stages, transitions);
  return (
    <Panel title="Simulação" aside="Nenhum agente é chamado">
      <div className="space-y-4 p-4">
        <ol className="list-decimal space-y-1 pl-5 text-sm" aria-label="Passos da simulação">
          {state.log.map((line, index) => (
            <li key={`${index}-${line}`}>{line}</li>
          ))}
        </ol>
        {here?.kind === 'done' ? (
          <Notice tone="ok">Concluída em {state.log.length - 1} passagem(ns).</Notice>
        ) : exits.length === 0 ? (
          <Notice tone="wait">
            {here?.name ?? 'Esta etapa'} não tem saída: a tarefa ficaria parada aqui.
          </Notice>
        ) : (
          <div className="space-y-2">
            <p className="text-sm font-semibold">
              {here?.kind === 'agent' ? 'O agente termina e passa para:' : 'Você decide:'}
            </p>
            <div className="flex flex-wrap gap-2">
              {exits.map(({ transition, stage, back }) => (
                <Button
                  key={transition.id}
                  onClick={() =>
                    onMove({
                      at: stage.key,
                      log: [
                        ...state.log,
                        `${back ? 'Devolvida para' : 'Passa para'} ${stage.name}: ${whoWorks(stage, roles)}.`,
                      ],
                    })
                  }
                >
                  {back ? 'Devolver para' : 'Passar para'} {stage.name}
                </Button>
              ))}
            </div>
          </div>
        )}
        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          <Button onClick={onRestart}>
            <RotateCcw className="size-4.5" aria-hidden />
            Recomeçar
          </Button>
          <Button onClick={onClose}>Sair da simulação</Button>
        </div>
      </div>
    </Panel>
  );
}

/**
 * Saves the area's flow as it is saved now, with the agents on its stages,
 * as a template of the user (Phase 18, D3). Unsaved changes in the editor do
 * not go along.
 */
function SaveTemplateDialog({
  area,
  onClose,
}: {
  area: { id: string; name: string; description: string };
  onClose: () => void;
}) {
  const save = useSaveTemplate();
  const notify = useToast();
  const [name, setName] = useState(area.name);
  const [description, setDescription] = useState(area.description);
  const [practices, setPractices] = useState('');
  const errors = save.error ? fieldErrors(save.error) : {};
  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate(
      {
        areaId: area.id,
        name,
        description,
        practices: practices
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean),
      },
      {
        onSuccess: (saved) => {
          notify(`Modelo "${saved.name}" salvo.`);
          onClose();
        },
      },
    );
  };
  return (
    <Modal
      title="Salvar como modelo"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form="save-template" disabled={save.isPending}>
            {save.isPending ? 'Salvando…' : 'Salvar modelo'}
          </Button>
        </>
      }
    >
      <form id="save-template" onSubmit={submit} className="space-y-4">
        <p className="text-sm text-dim">
          O modelo guarda o fluxo como está salvo agora: as etapas, as passagens e os papéis, cada
          um com as instruções, o acesso à pasta da área e o nome das ferramentas do primeiro agente
          que o tem. Não guarda o modelo de IA, tarefas, arquivos nem permissões: ao aplicar, toda
          ferramenta pede aprovação.
        </p>
        <TextField
          label="Nome do modelo"
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={errors.name}
          required
        />
        <TextAreaField
          label="Descrição"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          error={errors.description}
          rows={3}
        />
        <TextAreaField
          label="Boas práticas"
          hint="Uma por linha. Aparecem para quem escolher o modelo."
          value={practices}
          onChange={(event) => setPractices(event.target.value)}
          error={errors.practices}
          rows={3}
        />
        {save.error && !errors.name && !errors.description && !errors.practices && (
          <FormError>{errorMessage(save.error)}</FormError>
        )}
        <p className="text-sm">
          <Link to="/tarefas/modelos" className={LINK}>
            Ver os modelos de fluxo
          </Link>
        </p>
      </form>
    </Modal>
  );
}

/** Each team's own flow: its stages, the role on each, and the moves allowed (D2). */
export function WorkflowEditorPage() {
  const { areaId } = useParams();
  const workflow = useWorkflow(areaId);
  const projects = useProjects();
  const area = projects.data?.find((project) => project.id === areaId);
  const [savingTemplate, setSavingTemplate] = useState(false);

  return (
    <>
      <Link to={`/tarefas?area=${encodeURIComponent(areaId ?? '')}`} className={BACK_LINK}>
        <ArrowLeft className="size-4" aria-hidden />
        Quadro
      </Link>
      <PageHeader
        title={area ? `Fluxo de ${area.name}` : 'Fluxo'}
        description="As etapas por onde as tarefas passam, o papel que atende cada uma e para onde a tarefa pode ir. A plataforma só deixa um agente levar uma tarefa pelas setas que você liberar."
        actions={
          area && (
            <Button onClick={() => setSavingTemplate(true)}>
              <LayoutTemplate className="size-4.5" aria-hidden />
              Salvar como modelo
            </Button>
          )
        }
      />
      {savingTemplate && area && (
        <SaveTemplateDialog area={area} onClose={() => setSavingTemplate(false)} />
      )}
      {(workflow.isPending || projects.isPending) && <LoadingState label="Carregando o fluxo…" />}
      {workflow.error && (
        <ErrorState title="Não foi possível carregar o fluxo." error={workflow.error} />
      )}
      {workflow.data && areaId && (
        <Editor areaId={areaId} areaName={area?.name ?? ''} workflow={workflow.data} />
      )}
    </>
  );
}
