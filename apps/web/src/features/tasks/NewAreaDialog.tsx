import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../../components/Button';
import { SelectField, TextField } from '../../components/Form';
import { Modal } from '../../components/Modal';
import { ErrorState, LoadingState } from '../../components/States';
import { useToast } from '../../components/Toast';
import { errorMessage, fieldErrors } from '../../lib/errors';
import { useModels } from '../../lib/queries';
import { useCreateAreaFromTemplate, useWorkflowTemplates } from '../../lib/task-queries';

/** Creates an area from a ready-made flow: the area, its agents and its stages (D7). */
export function NewAreaDialog({ onClose }: { onClose: () => void }) {
  const templates = useWorkflowTemplates();
  const models = useModels();
  const create = useCreateAreaFromTemplate();
  const navigate = useNavigate();
  const notify = useToast();
  const [templateId, setTemplateId] = useState('');
  const [name, setName] = useState('');
  const [modelId, setModelId] = useState('');

  const chosenTemplate =
    templates.data?.find((template) => template.id === templateId) ?? templates.data?.[0];
  const usableModels = models.data ?? [];
  const chosenModel = modelId || usableModels[0]?.id || '';
  const errors = create.error ? fieldErrors(create.error) : {};

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!chosenTemplate) return;
    create.mutate(
      { templateId: chosenTemplate.id, name, modelId: chosenModel },
      {
        onSuccess: (created) => {
          notify(`Área "${name.trim()}" criada com o fluxo de ${chosenTemplate.name}.`);
          onClose();
          void navigate(`/tarefas?area=${encodeURIComponent(created.areaId)}`);
        },
      },
    );
  };

  return (
    <Modal
      title="Nova área a partir de um modelo"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button
            variant="primary"
            type="submit"
            form="new-area"
            disabled={create.isPending || !chosenTemplate || !chosenModel}
          >
            {create.isPending ? 'Criando…' : 'Criar área'}
          </Button>
        </>
      }
    >
      {(templates.isPending || models.isPending) && <LoadingState label="Carregando os modelos…" />}
      {templates.error && (
        <ErrorState title="Não foi possível carregar os fluxos prontos." error={templates.error} />
      )}
      {chosenTemplate && (
        <form id="new-area" onSubmit={submit} className="space-y-4">
          <SelectField
            label="Fluxo pronto"
            value={chosenTemplate.id}
            onChange={(event) => setTemplateId(event.target.value)}
          >
            {templates.data?.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </SelectField>
          <div className="rounded-md border border-line p-3 text-sm">
            <p>{chosenTemplate.description}</p>
            <p className="mt-2 font-semibold">Etapas</p>
            <p className="text-dim">
              {chosenTemplate.stages.map((stage) => stage.name).join(' → ')}
            </p>
            <p className="mt-2 font-semibold">Agentes criados</p>
            <ul className="text-dim">
              {chosenTemplate.roles.map((role) => (
                <li key={role.name}>
                  {role.name}: {role.objective}
                </li>
              ))}
            </ul>
            <p className="mt-2 font-semibold">Boas práticas</p>
            <ul className="list-disc pl-5 text-dim">
              {chosenTemplate.practices.map((practice) => (
                <li key={practice}>{practice}</li>
              ))}
            </ul>
          </div>
          <TextField
            label="Nome da área"
            value={name}
            onChange={(event) => setName(event.target.value)}
            error={errors.name}
            required
          />
          <SelectField
            label="Modelo de IA dos agentes"
            value={chosenModel}
            onChange={(event) => setModelId(event.target.value)}
            error={errors.modelId}
            hint={
              usableModels.length === 0
                ? 'Nenhum modelo habilitado. Habilite um na tela Modelos.'
                : 'Todos começam com este modelo; troque depois em cada agente.'
            }
          >
            {usableModels.map((model) => (
              <option key={model.id} value={model.id}>
                {model.displayName} ({model.providerName})
              </option>
            ))}
          </SelectField>
          <p className="text-sm text-dim">
            As ferramentas sugeridas para cada agente começam como “Pede aprovação”: libere na tela
            Ferramentas o que quiser deixar automático.
          </p>
          {create.error && !errors.name && !errors.modelId && (
            <p role="alert" className="text-sm text-fail">
              {errorMessage(create.error)}
            </p>
          )}
        </form>
      )}
    </Modal>
  );
}
