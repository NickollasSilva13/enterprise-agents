import { type Project, PROJECT_LIMITS } from '@ea/shared';
import { Pencil, Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Button, IconButton } from '../../components/Button';
import { TextAreaField, TextField } from '../../components/Form';
import { ConfirmDialog, Modal } from '../../components/Modal';
import { Panel } from '../../components/Panel';
import { EmptyState, ErrorState, LoadingState } from '../../components/States';
import { useToast } from '../../components/Toast';
import { errorMessage, fieldErrors } from '../../lib/errors';
import { plural } from '../../lib/format';
import {
  useCreateProject,
  useDeleteProject,
  useProjects,
  useUpdateProject,
} from '../../lib/queries';

function NewProjectForm() {
  const [name, setName] = useState('');
  const create = useCreateProject();
  const notify = useToast();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate(
      { name, description: '' },
      {
        onSuccess: (project) => {
          setName('');
          notify(`Projeto "${project.name}" criado.`);
        },
      },
    );
  };

  const error = create.error
    ? (fieldErrors(create.error).name ?? errorMessage(create.error))
    : undefined;

  return (
    <form onSubmit={submit} className="flex flex-wrap items-start gap-3 border-t border-line p-4">
      <div className="min-w-0 flex-1 basis-56">
        <TextField
          label="Novo projeto"
          placeholder="Nome do projeto"
          value={name}
          maxLength={PROJECT_LIMITS.name}
          onChange={(event) => {
            setName(event.target.value);
            create.reset();
          }}
          error={error}
        />
      </div>
      <Button type="submit" className="sm:mt-6" disabled={create.isPending || name.trim() === ''}>
        Criar projeto
      </Button>
    </form>
  );
}

function EditProjectDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description);
  const update = useUpdateProject();
  const notify = useToast();
  const errors = fieldErrors(update.error);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    update.mutate(
      { id: project.id, patch: { name, description } },
      {
        onSuccess: () => {
          notify('Projeto salvo.');
          onClose();
        },
      },
    );
  };

  return (
    <Modal
      title="Editar projeto"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form="edit-project" disabled={update.isPending}>
            Salvar projeto
          </Button>
        </>
      }
    >
      <form id="edit-project" onSubmit={submit} className="space-y-4">
        <TextField
          label="Nome"
          value={name}
          maxLength={PROJECT_LIMITS.name}
          onChange={(event) => setName(event.target.value)}
          error={errors.name}
        />
        <TextAreaField
          label="Descrição"
          rows={3}
          value={description}
          maxLength={PROJECT_LIMITS.description}
          onChange={(event) => setDescription(event.target.value)}
          error={errors.description}
          hint="Aparece na sala do projeto, no Escritório."
        />
        {update.error && Object.keys(errors).length === 0 && (
          <p role="alert" className="text-sm text-fail">
            {errorMessage(update.error)}
          </p>
        )}
      </form>
    </Modal>
  );
}

function DeleteProjectDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const remove = useDeleteProject();
  const notify = useToast();
  return (
    <ConfirmDialog
      title={`Excluir o projeto "${project.name}"?`}
      confirmLabel="Excluir projeto"
      busy={remove.isPending}
      error={remove.error ? errorMessage(remove.error) : undefined}
      onCancel={onClose}
      onConfirm={() =>
        remove.mutate(project.id, {
          onSuccess: () => {
            notify(`Projeto "${project.name}" excluído.`);
            onClose();
          },
        })
      }
    >
      {project.agentCount === 0
        ? 'O projeto não tem agentes.'
        : `${plural(project.agentCount, 'agente continua existindo e fica', 'agentes continuam existindo e ficam')} sem projeto.`}
    </ConfirmDialog>
  );
}

/** Projects group agents; each one is a room in the office. */
export function ProjectsPanel() {
  const { data: projects, error, isPending, refetch } = useProjects();
  const [editing, setEditing] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState<Project | null>(null);

  return (
    <Panel title="Projetos" aside={projects && plural(projects.length, 'projeto', 'projetos')}>
      {isPending && <LoadingState label="Carregando os projetos…" />}
      {error && !projects && (
        <ErrorState
          title="Não foi possível carregar os projetos."
          error={error}
          onRetry={() => void refetch()}
        />
      )}
      {projects?.length === 0 && (
        <EmptyState title="Nenhum projeto ainda.">
          Projetos agrupam agentes. Cada projeto vira uma sala no Escritório.
        </EmptyState>
      )}
      {projects && projects.length > 0 && (
        <ul className="divide-y divide-line">
          {projects.map((project) => (
            <li key={project.id} className="flex items-center gap-3 px-4 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{project.name}</p>
                <p className="truncate text-sm text-dim">
                  {plural(project.agentCount, 'agente', 'agentes')}
                  {project.description && `. ${project.description}`}
                </p>
              </div>
              <IconButton
                label={`Editar o projeto ${project.name}`}
                onClick={() => setEditing(project)}
              >
                <Pencil className="size-4.5" aria-hidden />
              </IconButton>
              <IconButton
                label={`Excluir o projeto ${project.name}`}
                onClick={() => setDeleting(project)}
              >
                <Trash2 className="size-4.5" aria-hidden />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      {projects && <NewProjectForm />}

      {editing && <EditProjectDialog project={editing} onClose={() => setEditing(null)} />}
      {deleting && <DeleteProjectDialog project={deleting} onClose={() => setDeleting(null)} />}
    </Panel>
  );
}
