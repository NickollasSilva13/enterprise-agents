import type { Board, TaskSummary, WorkflowStage } from '@ea/shared';
import { ArrowLeftRight, LayoutTemplate, Plus, Workflow } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Button, buttonClass } from '../../components/Button';
import { SelectField } from '../../components/Form';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '../../components/States';
import { plural } from '../../lib/format';
import { useProjects } from '../../lib/queries';
import { useBoard } from '../../lib/task-queries';
import { NewAreaDialog } from './NewAreaDialog';
import { NewTaskDialog } from './NewTaskDialog';
import { PriorityBadge, STAGE_KIND_LABEL, TaskStatus } from './TaskBadges';

function TaskCard({ task }: { task: TaskSummary }) {
  return (
    <li>
      <Link
        to={`/tarefas/${task.id}`}
        data-task={task.id}
        className="block rounded-md border border-line bg-ink px-3 py-2 hover:border-line-strong"
      >
        <span className="flex items-start justify-between gap-2">
          <span className="font-semibold">{task.title}</span>
          <PriorityBadge task={task} />
        </span>
        <TaskStatus task={task} />
      </Link>
    </li>
  );
}

function Column({ stage, tasks }: { stage: WorkflowStage; tasks: readonly TaskSummary[] }) {
  const titleId = `stage-${stage.id}`;
  return (
    <section aria-labelledby={titleId} className="rounded-lg border border-line bg-sheet">
      <header className="border-b border-line px-3 py-2">
        <h2 id={titleId} className="font-semibold">
          {stage.name}
        </h2>
        <p className="text-sm text-dim">
          {stage.kind === 'agent'
            ? (stage.agentName ?? 'Sem responsável')
            : STAGE_KIND_LABEL[stage.kind]}{' '}
          · {plural(tasks.length, 'tarefa', 'tarefas')}
        </p>
      </header>
      {tasks.length > 0 && (
        <ul className="space-y-2 p-3" aria-label={`Tarefas em ${stage.name}`}>
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </ul>
      )}
    </section>
  );
}

function BoardView({ board }: { board: Board }) {
  const [adding, setAdding] = useState(false);
  const { stages } = board.workflow;
  if (stages.length === 0) {
    return (
      <div className="rounded-lg border border-line bg-sheet">
        <EmptyState
          title="Esta área ainda não tem fluxo."
          action={
            <Link to={`/tarefas/fluxo/${board.area.id}`} className={buttonClass('primary')}>
              Montar o fluxo
            </Link>
          }
        >
          Defina as etapas por onde as tarefas passam e quem trabalha em cada uma.
        </EmptyState>
      </div>
    );
  }
  return (
    <>
      <div className="mb-4 flex flex-wrap gap-3">
        <Button variant="primary" onClick={() => setAdding(true)}>
          <Plus className="size-4.5" aria-hidden />
          Nova tarefa
        </Button>
        <Link to={`/tarefas/fluxo/${board.area.id}`} className={buttonClass()}>
          <Workflow className="size-4.5" aria-hidden />
          Editar fluxo
        </Link>
      </div>
      <div className="grid gap-4 md:auto-cols-[minmax(15rem,1fr)] md:grid-flow-col md:overflow-x-auto md:pb-2">
        {stages.map((stage) => (
          <Column
            key={stage.id}
            stage={stage}
            tasks={board.tasks.filter((task) => task.stageId === stage.id)}
          />
        ))}
      </div>
      {adding && <NewTaskDialog areaId={board.area.id} onClose={() => setAdding(false)} />}
    </>
  );
}

/** The board of an area: a column per stage of its flow (Phase 16). */
export function TasksPage() {
  const projects = useProjects();
  const [params, setParams] = useSearchParams();
  const [creatingArea, setCreatingArea] = useState(false);
  const areaId = params.get('area') ?? projects.data?.[0]?.id;
  const board = useBoard(areaId);

  return (
    <>
      <PageHeader
        title="Tarefas"
        description="O quadro de cada área. Quando uma tarefa chega à etapa de um agente, ele trabalha nela e a passa adiante pelas regras do fluxo."
        actions={
          <div className="flex flex-wrap gap-3">
            <Link to="/tarefas/pedidos" className={buttonClass()}>
              <ArrowLeftRight className="size-4.5" aria-hidden />
              Pedidos entre áreas
            </Link>
            <Link to="/tarefas/modelos" className={buttonClass()}>
              <LayoutTemplate className="size-4.5" aria-hidden />
              Modelos de fluxo
            </Link>
            <Button onClick={() => setCreatingArea(true)}>
              <Plus className="size-4.5" aria-hidden />
              Nova área a partir de modelo
            </Button>
          </div>
        }
      />

      {projects.isPending && <LoadingState label="Carregando as áreas…" />}
      {projects.error && (
        <ErrorState title="Não foi possível carregar as áreas." error={projects.error} />
      )}
      {projects.data?.length === 0 && (
        <div className="rounded-lg border border-line bg-sheet">
          <EmptyState
            title="Nenhuma área ainda."
            action={
              <Button variant="primary" onClick={() => setCreatingArea(true)}>
                Criar uma área a partir de um modelo
              </Button>
            }
          >
            Uma área é um time: agentes, um fluxo de trabalho e um quadro de tarefas. Comece por um
            fluxo pronto, com boas práticas, e ajuste depois.
          </EmptyState>
        </div>
      )}

      {projects.data && projects.data.length > 0 && (
        <div className="mb-4 max-w-sm">
          <SelectField
            label="Área"
            value={areaId ?? ''}
            onChange={(event) => setParams({ area: event.target.value })}
          >
            {projects.data.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </SelectField>
        </div>
      )}

      {areaId && board.isPending && <LoadingState label="Carregando o quadro…" />}
      {board.error && !board.data && (
        <ErrorState
          title="Não foi possível carregar o quadro."
          error={board.error}
          onRetry={() => void board.refetch()}
        />
      )}
      {board.data && <BoardView board={board.data} />}

      {creatingArea && <NewAreaDialog onClose={() => setCreatingArea(false)} />}
    </>
  );
}
