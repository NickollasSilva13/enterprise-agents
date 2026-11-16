import type { AgentExport, AgentImportResult } from '@ea/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { json, makeAgent, renderApp } from '../../test/render';

const agent = makeAgent({ id: 'a1', name: 'Triagem' });

const exported: AgentExport = {
  format: 'enterprise-agents/agents',
  version: 1,
  exportedAt: '2026-11-14T12:00:00.000Z',
  agents: [
    {
      name: 'Triagem',
      description: '',
      objective: '',
      systemPrompt: 'Responda em uma linha.',
      temperature: 0.7,
      maxOutputTokens: 4096,
      maxSteps: 20,
      maxDurationSeconds: 300,
      maxTotalTokens: null,
      enabled: true,
      appearance: null,
      project: null,
      model: null,
      tools: [],
    },
  ],
};

const api = (agents = [agent]) => ({
  '/api/agents': { agents },
  '/api/projects': { projects: [] },
});

const picker = () => screen.getByLabelText('Arquivo de agentes para importar');
const choose = (content: string, name = 'agentes.json') =>
  fireEvent.change(picker(), {
    target: { files: [new File([content], name, { type: 'application/json' })] },
  });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('exporting agents (RF-20)', () => {
  it('saves every agent to a dated JSON file', async () => {
    // jsdom has no object URLs and does not download: both are observed instead.
    const blobs: Blob[] = [];
    URL.createObjectURL = vi.fn((blob: Blob) => {
      blobs.push(blob);
      return 'blob:teste';
    });
    const revoked = vi.fn();
    URL.revokeObjectURL = revoked;
    const clicked: { download: string; href: string }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push({ download: this.download, href: this.href });
    });

    renderApp('/agentes', { ...api(), '/api/agents/export': exported });
    // The button is off until the list says there is something to export.
    await screen.findByRole('list', { name: 'Agentes' });
    fireEvent.click(screen.getByRole('button', { name: 'Exportar' }));

    expect(await screen.findByText('1 agente exportado.')).toBeTruthy();
    expect(clicked).toHaveLength(1);
    expect(clicked[0]?.download).toMatch(/^agentes-\d{4}-\d{2}-\d{2}\.json$/);
    expect(JSON.parse(await (blobs[0] as Blob).text())).toEqual(exported);
    expect(revoked).toHaveBeenCalledWith('blob:teste');
    // The temporary link does not stay on the page.
    expect(document.querySelector('a[download]')).toBeNull();
  });

  it('has nothing to export without agents, but can still import', async () => {
    renderApp('/agentes', api([]));
    await screen.findByText('Nenhum agente ainda.');
    expect(screen.getByRole('button', { name: 'Exportar' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Importar' }).hasAttribute('disabled')).toBe(false);
  });

  it('says so when the export fails', async () => {
    renderApp('/agentes', {
      ...api(),
      '/api/agents/export': () => json(500, { code: 'internal_error', message: 'Erro interno.' }),
    });
    // The button is off until the list says there is something to export.
    await screen.findByRole('list', { name: 'Agentes' });
    fireEvent.click(screen.getByRole('button', { name: 'Exportar' }));
    expect(await screen.findByText('Erro interno.')).toBeTruthy();
  });
});

describe('importing agents (RF-20)', () => {
  it('sends the file as it is and shows what was created and what changed', async () => {
    const result: AgentImportResult = {
      imported: [
        {
          id: 'n1',
          name: 'Triagem (importado)',
          nameInFile: 'Triagem',
          warnings: [
            'Já existia um agente chamado "Triagem"; este entrou como "Triagem (importado)".',
            '"Escrever arquivo" estava permitida no arquivo e entrou como "pede aprovação". Libere-a na tela Ferramentas, se quiser.',
          ],
        },
        { id: 'n2', name: 'Resumidor', nameInFile: 'Resumidor', warnings: [] },
      ],
    };
    const { writes } = renderApp('/agentes', {
      ...api(),
      'POST /api/agents/import': () => json(201, result),
    });
    await screen.findByRole('list', { name: 'Agentes' });
    choose(JSON.stringify(exported));

    const dialog = within(await screen.findByRole('dialog', { name: 'Agentes importados' }));
    expect(dialog.getByText(/2 agentes foram criados\. 1 precisa da sua atenção:/)).toBeTruthy();
    const items = within(dialog.getByRole('list', { name: 'Agentes importados' }));
    expect(items.getByText('Triagem (importado)')).toBeTruthy();
    expect(items.getByText('Resumidor')).toBeTruthy();
    expect(items.getByText(/Já existia um agente chamado "Triagem"/)).toBeTruthy();
    expect(dialog.getByText(/Nenhuma ferramenta entra liberada/)).toBeTruthy();
    expect(writes()).toEqual([{ method: 'POST', url: '/api/agents/import', body: exported }]);

    fireEvent.click(dialog.getByRole('button', { name: 'Fechar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('says that everything came as it was when there is nothing to warn about', async () => {
    renderApp('/agentes', {
      ...api(),
      'POST /api/agents/import': () =>
        json(201, {
          imported: [{ id: 'n2', name: 'Resumidor', nameInFile: 'Resumidor', warnings: [] }],
        }),
    });
    await screen.findByRole('list', { name: 'Agentes' });
    choose(JSON.stringify(exported));
    const dialog = within(await screen.findByRole('dialog'));
    expect(dialog.getByText('1 agente foi criado, todos como estavam no arquivo.')).toBeTruthy();
  });

  it('refuses, without calling the server, a file that is not JSON or is too large', async () => {
    const { writes } = renderApp('/agentes', api());
    await screen.findByRole('list', { name: 'Agentes' });

    choose('isto não é json');
    expect(await screen.findByText('Este arquivo não é um JSON válido.')).toBeTruthy();

    choose('x'.repeat(1024 * 1024 + 1));
    expect(await screen.findByText('O arquivo é grande demais: o limite é de 1 MB.')).toBeTruthy();
    expect(writes()).toEqual([]);
  });

  it('shows what the server found wrong with the file, and where', async () => {
    renderApp('/agentes', {
      ...api(),
      'POST /api/agents/import': (request: { body: unknown }) =>
        (request.body as { format?: string }).format === 'outra-coisa'
          ? json(400, {
              code: 'validation_error',
              message: 'Dados inválidos.',
              details: [
                {
                  path: 'format',
                  message: 'Este não é um arquivo de agentes do Enterprise Agents.',
                },
              ],
            })
          : json(400, {
              code: 'validation_error',
              message: 'Dados inválidos.',
              details: [{ path: 'agents.1.temperature', message: 'Temperatura: o máximo é 2.' }],
            }),
    });
    await screen.findByRole('list', { name: 'Agentes' });

    choose(JSON.stringify({ format: 'outra-coisa' }));
    expect(
      await screen.findByText(
        'O arquivo não pôde ser importado. Este não é um arquivo de agentes do Enterprise Agents.',
      ),
    ).toBeTruthy();

    choose(JSON.stringify(exported));
    expect(
      await screen.findByText(
        'O arquivo não pôde ser importado. Agente 2: Temperatura: o máximo é 2.',
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
