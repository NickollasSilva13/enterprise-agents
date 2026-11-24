import type { Board, TaskSummary, WorkflowStage } from '@ea/shared';
import { MoveRight, Plus, Workflow } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Button, buttonClass } from '../../components/Button';
import { SelectField } from '../../components/Form';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '../../components/States';
import { plural } from '../../lib/format';
import { useProjects } from '../../lib/queries';
import { useAddressFlag } from '../../lib/address-flag';
import { useBoard } from '../../lib/task-queries';
import { type TaskMoves, movesOf } from './moves';
import { MoveTaskDialog } from './MoveTaskDialog';
import { NewAreaDialog } from './NewAreaDialog';
import { NewTaskDialog } from './NewTaskDialog';
import { PriorityBadge, STAGE_KIND_LABEL, TaskStatus } from './TaskBadges';
import { Tip } from '../../components/Tip';
import { TasksTabs } from './TasksTabs';

/** A move the user started from the board, waiting for the confirmation. */
interface PendingMove {
  task: TaskSummary;
  targets: readonly WorkflowStage[];
  initial?: string;
}

interface TaskCardProps {
  task: TaskSummary;
  moves: TaskMoves;
  dragged: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onMove: () => void;
}

function TaskCard({ task, moves, dragged, onDragStart, onDragEnd, onMove }: TaskCardProps) {
  const movable = moves.kind === 'open';
  return (
    <li
      data-task={task.id}
      // Native drag and drop (D1): on a touch screen it never starts, and the
      // "Mover para…" button below is the way there and for the keyboard (D2).
      draggable={movable}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', task.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={`rounded-lg border border-line bg-sheet-raised shadow-lift transition-colors hover:border-line-strong ${
        movable ? 'cursor-grab active:cursor-grabbing' : ''
      } ${dragged ? 'opacity-50' : ''}`}
    >
      <Link to={`/tarefas/${task.id}`} draggable={false} className="block px-3 pt-2.5 pb-2">
        <span className="flex items-start justify-between gap-2">
          <span className="font-semibold">{task.title}</span>
          <PriorityBadge task={task} />
        </span>
        <span className="mt-1.5 block">
          <TaskStatus task={task} />
        </span>
      </Link>
      {movable && (
        <div className="border-t border-line px-1.5 py-1">
          <button
            type="button"
            onClick={onMove}
            aria-label={`Mover "${task.title}" para outra etapa`}
            className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-sm text-dim hover:bg-sheet-raised hover:text-chalk"
          >
            <MoveRight className="size-4" aria-hidden />
            Mover para…
          </button>
        </div>
      )}
    </li>
  );
}

interface ColumnProps {
  stage: WorkflowStage;
  tasks: readonly TaskSummary[];
  /** While a card is dragged: whether it may land here; null when nothing is dragged. */
  accepts: boolean | null;
  onDrop: () => void;
  children: ReactNode;
}

function Column({ stage, tasks, accepts, onDrop, children }: ColumnProps) {
  const titleId = `stage-${stage.id}`;
  const [over, setOver] = useState(false);
  const frame =
    accepts === null
      ? 'border-line'
      : accepts
        ? `border-glow ${over ? 'bg-sheet-raised' : ''}`
        : 'border-line opacity-50';
  return (
    <section
      aria-labelledby={titleId}
      data-stage={stage.id}
      data-accepts={accepts === null ? undefined : String(accepts)}
      onDragOver={(event) => {
        // Only a stage the flow allows takes the card: elsewhere the browser
        // shows "not allowed" and dropping does nothing.
        if (!accepts) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        if (accepts) onDrop();
      }}
      className={`rounded-xl border bg-sheet transition-[opacity,border-color,background-color] ${frame}`}
    >
      <header className="border-b border-line px-3 py-2">
        <h2 id={titleId} className="font-semibold">
          {stage.name}
        </h2>
        <p className="text-sm text-dim">
          {stage.kind === 'agent'
            ? stage.roleName
              ? `Papel ${stage.roleName}`
              : 'Sem papel'
            : STAGE_KIND_LABEL[stage.kind]}{' '}
          · {plural(tasks.length, 'tarefa', 'tarefas')}
        </p>
      </header>
      {tasks.length > 0 ? (
        <ul className="space-y-2 p-3" aria-label={`Tarefas em ${stage.name}`}>
          {children}
        </ul>
      ) : (
        // An empty column still needs room to drop a card on.
        <p className="px-3 py-4 text-sm text-dim">Nenhuma tarefa aqui.</p>
      )}
    </section>
  );
}

function BoardView({ board }: { board: Board }) {
  // "Criar tarefa" in the office's quick actions opens the form here (Phase 29, D6).
  const [params, setParams] = useSearchParams();
  const [adding, setAdding] = useState(params.get('nova') === '1');
  const stopAdding = () => {
    setAdding(false);
    if (params.has('nova'))
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.delete('nova');
          return next;
        },
        { replace: true },
      );
  };
  const { stages } = board.workflow;
  const [dragged, setDragged] = useState<TaskSummary | null>(null);
  const [moving, setMoving] = useState<PendingMove | null>(null);
  const draggedMoves = dragged ? movesOf(board.workflow, dragged) : null;
  const accepts = (stage: WorkflowStage) =>
    draggedMoves === null
      ? null
      : draggedMoves.kind === 'open' && draggedMoves.targets.some(({ id }) => id === stage.id);

  if (stages.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-sheet">
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
      <Tip id="board-move" className="mb-4">
        Arraste um cartão até outra etapa, ou use "Mover para…" no cartão. Só aceitam o cartão as
        etapas que o fluxo permite, e nada muda antes de você confirmar.
      </Tip>
      <div className="grid gap-4 md:auto-cols-[minmax(15rem,1fr)] md:grid-flow-col md:overflow-x-auto md:pb-2">
        {stages.map((stage) => {
          const tasks = board.tasks.filter((task) => task.stageId === stage.id);
          return (
            <Column
              key={stage.id}
              stage={stage}
              tasks={tasks}
              accepts={accepts(stage)}
              onDrop={() => {
                if (dragged && draggedMoves?.kind === 'open') {
                  setMoving({ task: dragged, targets: draggedMoves.targets, initial: stage.id });
                }
                setDragged(null);
              }}
            >
              {tasks.map((task) => {
                const moves = movesOf(board.workflow, task);
                return (
                  <TaskCard
                    key={task.id}
                    task={task}
                    moves={moves}
                    dragged={dragged?.id === task.id}
                    onDragStart={() => setDragged(task)}
                    onDragEnd={() => setDragged(null)}
                    onMove={() => {
                      if (moves.kind === 'open') setMoving({ task, targets: moves.targets });
                    }}
                  />
                );
              })}
            </Column>
          );
        })}
      </div>
      {adding && <NewTaskDialog areaId={board.area.id} onClose={stopAdding} />}
      {moving && (
        <MoveTaskDialog
          task={moving.task}
          targets={moving.targets}
          {...(moving.initial ? { initial: moving.initial } : {})}
          onClose={() => setMoving(null)}
        />
      )}
    </>
  );
}

/** The board of an area: a column per stage of its flow (Phase 16). */
export function TasksPage() {
  const projects = useProjects();
  const [params, setParams] = useSearchParams();
  // "Criar uma área" in the first steps opens the form here (Phase 32).
  const [creatingArea, setCreatingArea] = useAddressFlag('nova-area');
  const areaId = params.get('area') ?? projects.data?.[0]?.id;
  const board = useBoard(areaId);

  return (
    <>
      <TasksTabs />
      <PageHeader
        title="Tarefas"
        description="O quadro de cada área. Quando uma tarefa chega à etapa de um agente, ele trabalha nela e a passa adiante pelas regras do fluxo."
        actions={
          <Button onClick={() => setCreatingArea(true)}>
            <Plus className="size-4.5" aria-hidden />
            Nova área a partir de modelo
          </Button>
        }
      />

      {projects.isPending && <LoadingState label="Carregando as áreas…" />}
      {projects.error && (
        <ErrorState title="Não foi possível carregar as áreas." error={projects.error} />
      )}
      {projects.data?.length === 0 && (
        <div className="rounded-xl border border-line bg-sheet">
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
