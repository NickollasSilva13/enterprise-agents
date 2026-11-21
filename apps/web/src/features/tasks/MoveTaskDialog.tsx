import { TASK_LIMITS, type TaskSummary, type WorkflowStage } from '@ea/shared';
import { type FormEvent, useState } from 'react';
import { Button } from '../../components/Button';
import { SelectField, TextAreaField } from '../../components/Form';
import { Modal } from '../../components/Modal';
import { FormError } from '../../components/Notice';
import { useToast } from '../../components/Toast';
import { errorMessage } from '../../lib/errors';
import { useMoveTask } from '../../lib/task-queries';

interface MoveTaskDialogProps {
  task: TaskSummary;
  targets: readonly WorkflowStage[];
  /** The stage the card was dropped on; the first one the flow allows otherwise. */
  initial?: string;
  onClose: () => void;
}

/**
 * Confirms a move started on the board, by dragging a card or by its
 * "Mover para…" button (Phase 31, D1 and D2), with the same optional note as
 * the task's own "Mover" panel. Nothing moves until the user confirms, so a
 * card let go over "Concluído" by mistake delivers nothing.
 */
export function MoveTaskDialog({ task, targets, initial, onClose }: MoveTaskDialogProps) {
  const move = useMoveTask();
  const notify = useToast();
  const [target, setTarget] = useState(initial ?? targets[0]?.id ?? '');
  const [note, setNote] = useState('');
  const chosen = targets.find((stage) => stage.id === target) ?? targets[0];

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (!chosen || move.isPending) return;
    move.mutate(
      { taskId: task.id, toStageId: chosen.id, note },
      {
        onSuccess: () => {
          notify(`Tarefa passada para "${chosen.name}".`);
          onClose();
        },
      },
    );
  };

  return (
    <Modal
      title={`Mover "${task.title}"`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={() => submit()} disabled={move.isPending}>
            {move.isPending ? 'Movendo…' : 'Mover'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-dim">Está em "{task.stageName}".</p>
        <SelectField
          label="Para a etapa"
          value={chosen?.id ?? ''}
          onChange={(event) => setTarget(event.target.value)}
        >
          {targets.map((stage) => (
            <option key={stage.id} value={stage.id}>
              {stage.name}
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
        {move.error && <FormError>{errorMessage(move.error)}</FormError>}
      </form>
    </Modal>
  );
}
