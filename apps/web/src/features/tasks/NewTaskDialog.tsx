import { TASK_LIMITS } from '@ea/shared';
import { type FormEvent, useState } from 'react';
import { Button } from '../../components/Button';
import { SelectField, TextAreaField, TextField } from '../../components/Form';
import { Modal } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { errorMessage, fieldErrors } from '../../lib/errors';
import { useCreateTask } from '../../lib/task-queries';

export function NewTaskDialog({ areaId, onClose }: { areaId: string; onClose: () => void }) {
  const create = useCreateTask();
  const notify = useToast();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [acceptance, setAcceptance] = useState('');
  const [priority, setPriority] = useState<'normal' | 'high'>('normal');
  const errors = create.error ? fieldErrors(create.error) : {};

  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate(
      { areaId, task: { title, description, acceptance, priority } },
      {
        onSuccess: (task) => {
          notify(`Tarefa "${task.title}" criada em ${task.stageName}.`);
          onClose();
        },
      },
    );
  };

  return (
    <Modal
      title="Nova tarefa"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form="new-task" disabled={create.isPending}>
            {create.isPending ? 'Criando…' : 'Criar tarefa'}
          </Button>
        </>
      }
    >
      <form id="new-task" onSubmit={submit} className="space-y-4">
        <TextField
          label="Título"
          value={title}
          maxLength={TASK_LIMITS.title}
          onChange={(event) => setTitle(event.target.value)}
          error={errors.title}
          required
        />
        <TextAreaField
          label="Descrição"
          rows={4}
          value={description}
          maxLength={TASK_LIMITS.description}
          onChange={(event) => setDescription(event.target.value)}
          error={errors.description}
          hint="O pedido como você o faria a uma pessoa: contexto, objetivo, restrições."
        />
        <TextAreaField
          label="Critérios de aceite"
          rows={3}
          value={acceptance}
          maxLength={TASK_LIMITS.acceptance}
          onChange={(event) => setAcceptance(event.target.value)}
          error={errors.acceptance}
          hint="Como saber que ficou pronto. Um por linha ajuda quem testa."
        />
        <SelectField
          label="Prioridade"
          value={priority}
          onChange={(event) => setPriority(event.target.value === 'high' ? 'high' : 'normal')}
        >
          <option value="normal">Normal</option>
          <option value="high">Alta (passa à frente na fila do agente)</option>
        </SelectField>
        <p className="text-sm text-dim">
          A tarefa começa na primeira etapa do fluxo. Se ela for de um agente, ele começa a
          trabalhar assim que estiver livre.
        </p>
        {create.error && Object.keys(errors).length === 0 && (
          <p role="alert" className="text-sm text-fail">
            {errorMessage(create.error)}
          </p>
        )}
      </form>
    </Modal>
  );
}
