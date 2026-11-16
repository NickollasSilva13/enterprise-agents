import {
  STAGE_KINDS,
  type StageKind,
  type TransitionActor,
  type Workflow,
  WORKFLOW_LIMITS,
  workflowUpdateSchema,
} from '@ea/shared';
import { ArrowDown, ArrowLeft, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Button, IconButton } from '../../components/Button';
import { SelectField, TextField } from '../../components/Form';
import { PageHeader } from '../../components/PageHeader';
import { Panel } from '../../components/Panel';
import { ErrorState, LoadingState } from '../../components/States';
import { useToast } from '../../components/Toast';
import { errorMessage } from '../../lib/errors';
import { useAgents, useProjects } from '../../lib/queries';
import { useSaveWorkflow, useWorkflow } from '../../lib/task-queries';
import { STAGE_KIND_LABEL } from './TaskBadges';

interface StageDraft {
  key: string;
  name: string;
  kind: StageKind;
  agentId: string | null;
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

let counter = 0;
const draftKey = (prefix: string) => {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
};

function draftOf(workflow: Workflow): { stages: StageDraft[]; transitions: TransitionDraft[] } {
  return {
    stages: workflow.stages.map((stage) => ({
      key: stage.id,
      name: stage.name,
      kind: stage.kind,
      agentId: stage.agentId,
    })),
    transitions: workflow.transitions.map((transition) => ({
      id: transition.id,
      from: transition.fromStageId,
      to: transition.toStageId,
      actor: transition.actor,
    })),
  };
}

/** A flow with no stages yet starts with the smallest useful one. */
function starter(): { stages: StageDraft[]; transitions: TransitionDraft[] } {
  const doing = draftKey('etapa');
  const review = draftKey('etapa');
  const done = draftKey('etapa');
  return {
    stages: [
      { key: doing, name: 'Em andamento', kind: 'agent', agentId: null },
      { key: review, name: 'Sua revisão', kind: 'human', agentId: null },
      { key: done, name: 'Concluído', kind: 'done', agentId: null },
    ],
    transitions: [
      { id: draftKey('passagem'), from: doing, to: review, actor: 'both' },
      { id: draftKey('passagem'), from: review, to: done, actor: 'human' },
      { id: draftKey('passagem'), from: review, to: doing, actor: 'human' },
    ],
  };
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
  const agents = useAgents();
  const save = useSaveWorkflow();
  const notify = useToast();
  const navigate = useNavigate();
  const initial = workflow.stages.length > 0 ? draftOf(workflow) : starter();
  const [stages, setStages] = useState<StageDraft[]>(initial.stages);
  const [transitions, setTransitions] = useState<TransitionDraft[]>(initial.transitions);
  const [problems, setProblems] = useState<string[]>([]);

  const areaAgents = (agents.data ?? []).filter((agent) => agent.projectId === areaId);
  const openTasks = new Map(workflow.stages.map((stage) => [stage.id, stage.openTasks]));
  const nameOf = (key: string) => stages.find((stage) => stage.key === key)?.name || '(sem nome)';

  const patchStage = (key: string, patch: Partial<StageDraft>) =>
    setStages((current) =>
      current.map((stage) => {
        if (stage.key !== key) return stage;
        const next = { ...stage, ...patch };
        return next.kind === 'agent' ? next : { ...next, agentId: null };
      }),
    );
  const moveStage = (index: number, by: -1 | 1) =>
    setStages((current) => {
      const next = [...current];
      const [moved] = next.splice(index, 1);
      if (moved) next.splice(index + by, 0, moved);
      return next;
    });
  const removeStage = (key: string) => {
    setStages((current) => current.filter((stage) => stage.key !== key));
    setTransitions((current) => current.filter((entry) => entry.from !== key && entry.to !== key));
  };
  const patchTransition = (id: string, patch: Partial<TransitionDraft>) =>
    setTransitions((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    );

  const submit = () => {
    const payload = {
      stages: stages.map(({ key, name, kind, agentId }) => ({ key, name, kind, agentId })),
      // From a stage that waits for you or is final, only you move tasks on.
      transitions: transitions.map(({ from, to, actor }) => ({
        from,
        to,
        actor: stages.find((stage) => stage.key === from)?.kind === 'agent' ? actor : 'human',
      })),
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

  return (
    <div className="space-y-6">
      <Panel title="Etapas" aside={`${stages.length} de até ${WORKFLOW_LIMITS.stages}`}>
        {areaAgents.length === 0 && (
          <p className="px-4 pt-3 text-sm text-wait">
            Esta área ainda não tem agentes. Crie agentes e coloque-os no projeto {areaName} para
            escolher quem trabalha em cada etapa.
          </p>
        )}
        <ol className="divide-y divide-line">
          {stages.map((stage, index) => (
            <li
              key={stage.key}
              className="grid gap-3 px-4 py-3 sm:grid-cols-[1fr_10rem_1fr_auto] sm:items-end"
            >
              <TextField
                label={`Etapa ${index + 1}`}
                value={stage.name}
                maxLength={WORKFLOW_LIMITS.stageName}
                onChange={(event) => patchStage(stage.key, { name: event.target.value })}
              />
              <SelectField
                label="Tipo"
                value={stage.kind}
                onChange={(event) =>
                  patchStage(stage.key, { kind: event.target.value as StageKind })
                }
              >
                {STAGE_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {STAGE_KIND_LABEL[kind]}
                  </option>
                ))}
              </SelectField>
              {stage.kind === 'agent' ? (
                <SelectField
                  label="Quem trabalha"
                  value={stage.agentId ?? ''}
                  onChange={(event) =>
                    patchStage(stage.key, { agentId: event.target.value || null })
                  }
                >
                  <option value="">Ninguém (a tarefa para aqui)</option>
                  {areaAgents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                    </option>
                  ))}
                </SelectField>
              ) : (
                <p className="pb-2 text-sm text-dim">
                  {stage.kind === 'human'
                    ? 'A tarefa espera a sua decisão.'
                    : 'A tarefa termina aqui.'}
                </p>
              )}
              <div className="flex">
                <IconButton
                  label={`Subir ${stage.name}`}
                  disabled={index === 0}
                  onClick={() => moveStage(index, -1)}
                >
                  <ArrowUp className="size-4.5" aria-hidden />
                </IconButton>
                <IconButton
                  label={`Descer ${stage.name}`}
                  disabled={index === stages.length - 1}
                  onClick={() => moveStage(index, 1)}
                >
                  <ArrowDown className="size-4.5" aria-hidden />
                </IconButton>
                <IconButton
                  label={`Remover ${stage.name}`}
                  disabled={(openTasks.get(stage.key) ?? 0) > 0}
                  title={(openTasks.get(stage.key) ?? 0) > 0 ? 'A etapa tem tarefas.' : undefined}
                  onClick={() => removeStage(stage.key)}
                >
                  <Trash2 className="size-4.5" aria-hidden />
                </IconButton>
              </div>
            </li>
          ))}
        </ol>
        <div className="px-4 pb-3">
          <Button
            disabled={stages.length >= WORKFLOW_LIMITS.stages}
            onClick={() =>
              setStages((current) => {
                const finalAt = current.findIndex((stage) => stage.kind === 'done');
                const next = [...current];
                const added = {
                  key: draftKey('etapa'),
                  name: '',
                  kind: 'agent' as const,
                  agentId: null,
                };
                next.splice(finalAt === -1 ? next.length : finalAt, 0, added);
                return next;
              })
            }
          >
            <Plus className="size-4.5" aria-hidden />
            Adicionar etapa
          </Button>
        </div>
      </Panel>

      <Panel title="Passagens" aside="De onde para onde uma tarefa pode ir, e quem a leva">
        <ul className="divide-y divide-line">
          {transitions.map((transition) => {
            const fromKind = stages.find((stage) => stage.key === transition.from)?.kind;
            return (
              <li
                key={transition.id}
                className="grid gap-3 px-4 py-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"
              >
                <SelectField
                  label="De"
                  value={transition.from}
                  onChange={(event) => patchTransition(transition.id, { from: event.target.value })}
                >
                  {stages.map((stage) => (
                    <option key={stage.key} value={stage.key}>
                      {nameOf(stage.key)}
                    </option>
                  ))}
                </SelectField>
                <SelectField
                  label="Para"
                  value={transition.to}
                  onChange={(event) => patchTransition(transition.id, { to: event.target.value })}
                >
                  {stages.map((stage) => (
                    <option key={stage.key} value={stage.key}>
                      {nameOf(stage.key)}
                    </option>
                  ))}
                </SelectField>
                <SelectField
                  label="Quem leva"
                  value={fromKind === 'agent' ? transition.actor : 'human'}
                  disabled={fromKind !== 'agent'}
                  hint={fromKind === 'agent' ? undefined : 'Daqui, só você.'}
                  onChange={(event) =>
                    patchTransition(transition.id, { actor: event.target.value as TransitionActor })
                  }
                >
                  {(Object.keys(ACTOR_LABEL) as TransitionActor[]).map((actor) => (
                    <option key={actor} value={actor}>
                      {ACTOR_LABEL[actor]}
                    </option>
                  ))}
                </SelectField>
                <IconButton
                  label={`Remover a passagem de ${nameOf(transition.from)} para ${nameOf(transition.to)}`}
                  onClick={() =>
                    setTransitions((current) =>
                      current.filter((entry) => entry.id !== transition.id),
                    )
                  }
                >
                  <Trash2 className="size-4.5" aria-hidden />
                </IconButton>
              </li>
            );
          })}
        </ul>
        <div className="px-4 py-3">
          <Button
            disabled={stages.length < 2 || transitions.length >= WORKFLOW_LIMITS.transitions}
            onClick={() =>
              setTransitions((current) => [
                ...current,
                {
                  id: draftKey('passagem'),
                  from: stages[0]?.key ?? '',
                  to: stages[1]?.key ?? '',
                  actor: 'both',
                },
              ])
            }
          >
            <Plus className="size-4.5" aria-hidden />
            Adicionar passagem
          </Button>
        </div>
      </Panel>

      {(problems.length > 0 || save.error) && (
        <div role="alert" className="rounded-md border border-fail/60 bg-fail/10 p-3 text-sm">
          {problems.length > 0 ? (
            <ul className="list-disc pl-5">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          ) : (
            errorMessage(save.error)
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        <Button variant="primary" onClick={submit} disabled={save.isPending}>
          {save.isPending ? 'Salvando…' : 'Salvar fluxo'}
        </Button>
        <Link
          to={`/tarefas?area=${encodeURIComponent(areaId)}`}
          className="self-center text-sm text-info underline underline-offset-4"
        >
          Voltar sem salvar
        </Link>
      </div>
    </div>
  );
}

/** Each area's own flow: its stages, who works each one, and the moves allowed (D2). */
export function WorkflowEditorPage() {
  const { areaId } = useParams();
  const workflow = useWorkflow(areaId);
  const projects = useProjects();
  const area = projects.data?.find((project) => project.id === areaId);

  return (
    <>
      <Link
        to={`/tarefas?area=${encodeURIComponent(areaId ?? '')}`}
        className="mb-3 inline-flex items-center gap-1 text-sm text-info underline underline-offset-4"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Quadro
      </Link>
      <PageHeader
        title={area ? `Fluxo de ${area.name}` : 'Fluxo'}
        description="As etapas por onde as tarefas passam, quem trabalha em cada uma e as passagens permitidas. A plataforma só deixa um agente levar uma tarefa pelas passagens que você liberar."
      />
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
