import type { AgentImportResult } from '@ea/shared';
import { Download, Upload } from 'lucide-react';
import { type ChangeEvent, useRef, useState } from 'react';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { ApiRequestError } from '../../lib/api';
import { errorMessage } from '../../lib/errors';
import { plural } from '../../lib/format';
import { fetchAgentExport, useImportAgents } from '../../lib/queries';

// Export and import of agents as a JSON file (RF-20). The file never holds
// keys or addresses; what it cannot bring over is said after the import.

/** The server refuses larger requests; said here in words instead of as an error code. */
const MAX_FILE_BYTES = 1024 * 1024;

/** Hands a file to the browser's download, without leaving the page. */
function download(fileName: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function ImportResultDialog({
  result,
  onClose,
}: {
  result: AgentImportResult;
  onClose: () => void;
}) {
  const { imported } = result;
  const withWarnings = imported.filter((agent) => agent.warnings.length > 0).length;
  return (
    <Modal
      title="Agentes importados"
      onClose={onClose}
      footer={
        <Button variant="primary" onClick={onClose}>
          Fechar
        </Button>
      }
    >
      <p>
        {plural(imported.length, 'agente foi criado', 'agentes foram criados')}
        {withWarnings === 0
          ? ', todos como estavam no arquivo.'
          : `. ${plural(withWarnings, 'precisa', 'precisam')} da sua atenção:`}
      </p>
      <ul className="mt-3 space-y-3" aria-label="Agentes importados">
        {imported.map((agent) => (
          <li key={agent.id}>
            <span className="font-semibold">{agent.name}</span>
            {agent.warnings.length > 0 && (
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-dim">
                {agent.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-4 text-sm text-dim">
        Nenhuma ferramenta entra liberada: as que o arquivo trazia pedem a sua aprovação a cada uso,
        até você decidir na tela Ferramentas.
      </p>
    </Modal>
  );
}

export function AgentTransfer({ agentCount }: { agentCount: number }) {
  const notify = useToast();
  const importAgents = useImportAgents();
  const picker = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState<AgentImportResult | null>(null);

  const exportAll = async () => {
    setExporting(true);
    try {
      const document = await fetchAgentExport();
      const day = new Date().toISOString().slice(0, 10);
      download(`agentes-${day}.json`, JSON.stringify(document, null, 2));
      notify(`${plural(document.agents.length, 'agente exportado', 'agentes exportados')}.`);
    } catch (error) {
      notify(errorMessage(error), 'fail');
    } finally {
      setExporting(false);
    }
  };

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
    importAgents.mutate(document, {
      onSuccess: setResult,
      onError: (error) => notify(importProblem(error), 'fail'),
    });
  };

  return (
    <>
      <Button onClick={() => picker.current?.click()} disabled={importAgents.isPending}>
        <Upload className="size-4.5" aria-hidden />
        Importar
      </Button>
      <input
        ref={picker}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        tabIndex={-1}
        aria-label="Arquivo de agentes para importar"
        onChange={(event) => void importFile(event)}
      />
      <Button onClick={() => void exportAll()} disabled={exporting || agentCount === 0}>
        <Download className="size-4.5" aria-hidden />
        Exportar
      </Button>
      {result && <ImportResultDialog result={result} onClose={() => setResult(null)} />}
    </>
  );
}

/** The first thing wrong with the file, when the server said what it was. */
function importProblem(error: unknown): string {
  const issue = error instanceof ApiRequestError ? error.fieldIssues[0] : undefined;
  if (!issue) return errorMessage(error);
  const where = /^agents\.(\d+)\./.exec(issue.path);
  return where
    ? `O arquivo não pôde ser importado. Agente ${Number(where[1]) + 1}: ${issue.message}`
    : `O arquivo não pôde ser importado. ${issue.message}`;
}
