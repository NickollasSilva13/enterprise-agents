import type { TemplateImportResult, WorkflowTemplateSummary } from '@ea/shared';
import { ArrowLeft, Download, Pencil, Trash2, Upload } from 'lucide-react';
import { type ChangeEvent, type FormEvent, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Button, IconButton } from '../../components/Button';
import { TextAreaField, TextField } from '../../components/Form';
import { ConfirmDialog, Modal } from '../../components/Modal';
import { PageHeader } from '../../components/PageHeader';
import { Panel } from '../../components/Panel';
import { EmptyState, ErrorState, LoadingState } from '../../components/States';
import { useToast } from '../../components/Toast';
import { ApiRequestError } from '../../lib/api';
import { download } from '../../lib/download';
import { errorMessage, fieldErrors } from '../../lib/errors';
import {
  fetchTemplateExport,
  useDeleteTemplate,
  useImportTemplate,
  useUpdateTemplate,
  useWorkflowTemplates,
} from '../../lib/task-queries';
import { TemplateDetails } from './TemplateDetails';
import { BACK_LINK } from '../../components/TextLink';
import { FormError } from '../../components/Notice';

// The catalogue of workflow templates (Phase 18): the ready-made ones and the
// user's own, saved from an area or imported from a file. A template is
// applied from "Nova área a partir de modelo" on the board.

/** The server refuses larger requests; said here in words instead of as an error code. */
const MAX_FILE_BYTES = 1024 * 1024;

const lines = (text: string) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

function EditDialog({
  template,
  onClose,
}: {
  template: WorkflowTemplateSummary;
  onClose: () => void;
}) {
  const update = useUpdateTemplate();
  const notify = useToast();
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description);
  const [practices, setPractices] = useState(template.practices.join('\n'));
  const errors = update.error ? fieldErrors(update.error) : {};
  const submit = (event: FormEvent) => {
    event.preventDefault();
    update.mutate(
      {
        templateId: template.id,
        patch: { name, description, practices: lines(practices) },
      },
      {
        onSuccess: () => {
          notify('Modelo atualizado.');
          onClose();
        },
      },
    );
  };
  return (
    <Modal
      title={`Editar o modelo ${template.name}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form="edit-template" disabled={update.isPending}>
            Salvar
          </Button>
        </>
      }
    >
      <form id="edit-template" onSubmit={submit} className="space-y-4">
        <TextField
          label="Nome"
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
          hint="Uma por linha."
          value={practices}
          onChange={(event) => setPractices(event.target.value)}
          error={errors.practices}
          rows={4}
        />
        <p className="text-sm text-dim">
          Para mudar as etapas ou os agentes, crie uma área a partir deste modelo, ajuste o fluxo e
          salve-o de novo como modelo.
        </p>
        {update.error && !errors.name && !errors.description && !errors.practices && (
          <FormError>{errorMessage(update.error)}</FormError>
        )}
      </form>
    </Modal>
  );
}

function TemplateItem({ template }: { template: WorkflowTemplateSummary }) {
  const remove = useDeleteTemplate();
  const notify = useToast();
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const own = template.origin === 'user';

  const exportFile = async () => {
    try {
      const file = await fetchTemplateExport(template.id);
      const slug = template.name
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      download(`modelo-${slug || 'fluxo'}.json`, JSON.stringify(file, null, 2));
      notify(`Modelo "${template.name}" exportado.`);
    } catch (error) {
      notify(errorMessage(error), 'fail');
    }
  };

  return (
    <li className="space-y-3 px-4 py-4" data-template={template.id}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold">{template.name}</h3>
        <span className="flex items-center gap-1">
          <IconButton label={`Exportar ${template.name}`} onClick={() => void exportFile()}>
            <Download className="size-4.5" aria-hidden />
          </IconButton>
          {own && (
            <>
              <IconButton label={`Editar ${template.name}`} onClick={() => setEditing(true)}>
                <Pencil className="size-4.5" aria-hidden />
              </IconButton>
              <IconButton label={`Excluir ${template.name}`} onClick={() => setRemoving(true)}>
                <Trash2 className="size-4.5" aria-hidden />
              </IconButton>
            </>
          )}
        </span>
      </div>
      <TemplateDetails template={template} />
      {remove.error && <FormError>{errorMessage(remove.error)}</FormError>}
      {editing && <EditDialog template={template} onClose={() => setEditing(false)} />}
      {removing && (
        <ConfirmDialog
          title={`Excluir o modelo ${template.name}?`}
          confirmLabel="Excluir"
          busy={remove.isPending}
          onCancel={() => setRemoving(false)}
          onConfirm={() =>
            remove.mutate(template.id, {
              onSuccess: () => {
                setRemoving(false);
                notify('Modelo excluído.');
              },
            })
          }
        >
          As áreas já criadas a partir dele continuam como estão.
        </ConfirmDialog>
      )}
    </li>
  );
}

function ImportResultDialog({
  result,
  onClose,
}: {
  result: TemplateImportResult;
  onClose: () => void;
}) {
  return (
    <Modal
      title="Modelo importado"
      onClose={onClose}
      footer={
        <Button variant="primary" onClick={onClose}>
          Fechar
        </Button>
      }
    >
      <p>
        O modelo <span className="font-semibold">{result.template.name}</span> foi criado
        {result.warnings.length === 0 ? ', como estava no arquivo.' : '. Veja o que mudou:'}
      </p>
      {result.warnings.length > 0 && (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-dim" aria-label="Avisos">
          {result.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-sm text-dim">
        Confira os agentes e o acesso deles à pasta da área antes de usar o modelo. Nenhuma
        ferramenta entra liberada: todas pedem a sua aprovação a cada uso, até você decidir na tela
        Ferramentas.
      </p>
    </Modal>
  );
}

/** The first thing wrong with the file, when the server said what it was. */
function importProblem(error: unknown): string {
  const issue = error instanceof ApiRequestError ? error.fieldIssues[0] : undefined;
  return issue
    ? `O arquivo não pôde ser importado. ${issue.message}`
    : `O arquivo não pôde ser importado. ${errorMessage(error)}`;
}

function ImportButton() {
  const importTemplate = useImportTemplate();
  const notify = useToast();
  const picker = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<TemplateImportResult | null>(null);

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Cleared, so choosing the same file again is still a change.
    event.target.value = '';
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      notify('O arquivo é grande demais: o limite é de 1 MB.', 'fail');
      return;
    }
    let document: unknown;
    try {
      document = JSON.parse(await file.text());
    } catch {
      notify('Este arquivo não é um JSON válido.', 'fail');
      return;
    }
    importTemplate.mutate(document, {
      onSuccess: setResult,
      onError: (error) => notify(importProblem(error), 'fail'),
    });
  };

  return (
    <>
      <Button onClick={() => picker.current?.click()} disabled={importTemplate.isPending}>
        <Upload className="size-4.5" aria-hidden />
        Importar modelo
      </Button>
      <input
        ref={picker}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        tabIndex={-1}
        aria-label="Arquivo de modelo para importar"
        onChange={(event) => void importFile(event)}
      />
      {result && <ImportResultDialog result={result} onClose={() => setResult(null)} />}
    </>
  );
}

export function TemplatesPage() {
  const templates = useWorkflowTemplates();
  const builtin = templates.data?.filter((template) => template.origin === 'builtin') ?? [];
  const own = templates.data?.filter((template) => template.origin === 'user') ?? [];
  return (
    <>
      <Link to="/tarefas" className={BACK_LINK}>
        <ArrowLeft className="size-4" aria-hidden />
        Tarefas
      </Link>
      <PageHeader
        title="Modelos de fluxo"
        description="Fluxos prontos para criar uma área com etapas, agentes e boas práticas. Um modelo leva etapas, passagens, papéis e instruções; nunca chaves, endereços, modelos de IA ou permissões liberadas."
        actions={<ImportButton />}
      />
      {templates.isPending && <LoadingState label="Carregando os modelos…" />}
      {templates.error && (
        <ErrorState title="Não foi possível carregar os modelos." error={templates.error} />
      )}
      {templates.data && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Seus modelos">
            {own.length > 0 ? (
              <ul className="divide-y divide-line">
                {own.map((template) => (
                  <TemplateItem key={template.id} template={template} />
                ))}
              </ul>
            ) : (
              <EmptyState title="Nenhum modelo seu ainda.">
                Na tela de fluxo de uma área, use “Salvar como modelo”, ou importe um arquivo.
              </EmptyState>
            )}
          </Panel>
          <Panel title="Modelos prontos">
            <ul className="divide-y divide-line">
              {builtin.map((template) => (
                <TemplateItem key={template.id} template={template} />
              ))}
            </ul>
          </Panel>
        </div>
      )}
    </>
  );
}
