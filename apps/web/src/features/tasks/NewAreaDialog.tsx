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
import { TemplateDetails } from './TemplateDetails';
import { FormError } from '../../components/Notice';

const GROUPS = [
  { origin: 'builtin', label: 'Modelos prontos' },
  { origin: 'user', label: 'Seus modelos' },
] as const;

/** Creates an area from a template: the area, its agents and its stages (D7, Phase 18). */
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
          notify(`Área "${name.trim()}" criada com o modelo ${chosenTemplate.name}.`);
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
            label="Modelo de fluxo"
            value={chosenTemplate.id}
            onChange={(event) => setTemplateId(event.target.value)}
          >
            {GROUPS.map(({ origin, label }) => {
              const group = templates.data?.filter((template) => template.origin === origin) ?? [];
              return (
                group.length > 0 && (
                  <optgroup key={origin} label={label}>
                    {group.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </optgroup>
                )
              );
            })}
          </SelectField>
          <div className="rounded-md border border-line p-3">
            <TemplateDetails template={chosenTemplate} />
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
            <FormError>{errorMessage(create.error)}</FormError>
          )}
        </form>
      )}
    </Modal>
  );
}
