import type { AgentTools, Approval, ToolInfo } from '@ea/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { json, makeAgent, renderApp } from '../../test/render';

const tool = (overrides: Partial<ToolInfo> & { name: string; title: string }): ToolInfo => ({
  summary: `Resumo de ${overrides.title}.`,
  risk: 'low',
  maxPermission: 'allow',
  offByDefault: false,
  enabled: true,
  ...overrides,
});

const tools: ToolInfo[] = [
  tool({ name: 'read_file', title: 'Ler arquivo' }),
  tool({ name: 'write_file', title: 'Escrever arquivo', risk: 'medium' }),
  tool({
    name: 'run_script',
    title: 'Executar script',
    risk: 'high',
    maxPermission: 'ask',
    offByDefault: true,
    enabled: false,
  }),
];

const agentTools: AgentTools = {
  agentId: 'a1',
  workspacePath: 'C:\\dados\\workspaces\\a1',
  modelSupportsTools: true,
  grants: [{ toolName: 'read_file', permission: 'allow' }],
};

const api = (overrides: Record<string, unknown> = {}) => ({
  '/api/tools': { tools },
  '/api/agents': { agents: [makeAgent({ id: 'a1', name: 'Triagem' })] },
  '/api/agents/a1/tools': agentTools,
  ...overrides,
});

const chosen = (group: HTMLElement) =>
  within(group)
    .getAllByRole<HTMLInputElement>('radio')
    .find((radio) => radio.checked)
    ?.closest('label')?.textContent;

describe('ToolsPage', () => {
  it('shows the catalogue with risk and the script tool switched off (RF-50, RF-52)', async () => {
    renderApp('/ferramentas', api());

    const catalogue = within(await screen.findByRole('region', { name: 'Catálogo' }));
    expect(catalogue.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Ler arquivoRisco baixoResumo de Ler arquivo.Sempre disponível',
      'Escrever arquivoRisco médioResumo de Escrever arquivo.Sempre disponível',
      'Executar scriptRisco altoResumo de Executar script.Nunca roda sem aprovação: cada uso espera a sua decisão.Desligada',
    ]);
    expect(
      catalogue
        .getByRole('switch', { name: 'Executar script ligada nesta instalação' })
        .getAttribute('aria-checked'),
    ).toBe('false');
  });

  it('asks before switching the script tool on, explaining the risk (C-20)', async () => {
    const view = renderApp(
      '/ferramentas',
      api({
        'PATCH /api/tools/run_script': () => json(200, { ...tools[2], enabled: true }),
      }),
    );
    fireEvent.click(
      await screen.findByRole('switch', { name: 'Executar script ligada nesta instalação' }),
    );

    const dialog = within(screen.getByRole('dialog', { name: 'Ligar “Executar script”?' }));
    expect(dialog.getByText(/roda com o seu usuário do sistema/)).toBeTruthy();
    expect(view.writes()).toEqual([]);

    fireEvent.click(dialog.getByRole('button', { name: 'Ligar' }));
    await waitFor(() =>
      expect(view.writes()).toEqual([
        { method: 'PATCH', url: '/api/tools/run_script', body: { enabled: true } },
      ]),
    );
  });

  it('shows the permissions of the chosen agent and its workspace folder (RF-16, RF-55)', async () => {
    renderApp('/ferramentas?agente=a1', api());

    const read = await screen.findByRole('group', { name: 'Ler arquivo' });
    expect(chosen(read)).toBe('Permitida');
    expect(chosen(screen.getByRole('group', { name: 'Escrever arquivo' }))).toBe('Bloqueada');
    expect(screen.getByText('C:\\dados\\workspaces\\a1')).toBeTruthy();

    // A high-risk tool can be blocked or ask, never run by itself (C-16).
    const script = within(screen.getByRole('group', { name: 'Executar script' }));
    expect(script.getByRole<HTMLInputElement>('radio', { name: 'Permitida' }).disabled).toBe(true);
    expect(script.getByText(/Desligada nesta instalação/)).toBeTruthy();
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Salvar permissões' }).disabled,
    ).toBe(true);
  });

  it('saves every permission at once (RF-53)', async () => {
    const saved: AgentTools = {
      ...agentTools,
      grants: [
        { toolName: 'read_file', permission: 'allow' },
        { toolName: 'write_file', permission: 'ask' },
      ],
    };
    const view = renderApp(
      '/ferramentas?agente=a1',
      api({ 'PUT /api/agents/a1/tools': () => json(200, saved) }),
    );
    const write = within(await screen.findByRole('group', { name: 'Escrever arquivo' }));
    fireEvent.click(write.getByRole('radio', { name: 'Pede aprovação' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar permissões' }));

    await waitFor(() =>
      expect(view.writes()).toEqual([
        {
          method: 'PUT',
          url: '/api/agents/a1/tools',
          body: {
            grants: [
              { toolName: 'read_file', permission: 'allow' },
              { toolName: 'write_file', permission: 'ask' },
              { toolName: 'run_script', permission: 'deny' },
            ],
          },
        },
      ]),
    );
    expect(await screen.findByText('Permissões salvas.')).toBeTruthy();
    await waitFor(() =>
      expect(
        screen.getByRole<HTMLButtonElement>('button', { name: 'Salvar permissões' }).disabled,
      ).toBe(true),
    );
  });

  it('warns when the model of the agent cannot use tools', async () => {
    renderApp(
      '/ferramentas?agente=a1',
      api({ '/api/agents/a1/tools': { ...agentTools, modelSupportsTools: false } }),
    );
    expect(await screen.findByText(/O modelo deste agente não aceita ferramentas/)).toBeTruthy();
  });

  it('asks for an agent first, and says so when there is none', async () => {
    const first = renderApp('/ferramentas', api());
    await screen.findByRole('combobox', { name: 'Agente' });
    expect(screen.queryByRole('button', { name: 'Salvar permissões' })).toBeNull();
    first.unmount();

    renderApp('/ferramentas', api({ '/api/agents': { agents: [] } }));
    expect(await screen.findByText('Nenhum agente ainda.')).toBeTruthy();
  });
});

const approval: Approval = {
  id: 'ap1',
  runId: 'r1',
  originRunId: 'r1',
  agentId: 'a1',
  agentName: 'Triagem',
  conversationId: 'c1',
  toolName: 'write_file',
  toolTitle: 'Escrever arquivo',
  risk: 'medium',
  arguments: { path: 'notas/a.txt', content: 'linha 1\nlinha 2' },
  status: 'pending',
  reason: null,
  createdAt: '2026-11-13T12:00:00.000Z',
  decidedAt: null,
};

describe('ApprovalsPage', () => {
  it('shows who asks, the tool and the exact arguments (RF-54, C-16)', async () => {
    renderApp('/aprovacoes', { '/api/approvals': { approvals: [approval] } });

    const card = within(
      await screen.findByRole('article', {
        name: 'Aprovação pedida por Triagem: Escrever arquivo',
      }),
    );
    expect(card.getByText('Risco médio')).toBeTruthy();
    expect(card.getByText('notas/a.txt')).toBeTruthy();
    expect(card.getByText('path')).toBeTruthy();
    // Kept exactly as it will be written, line breaks included.
    expect(
      card.getAllByText(
        (_, node) => node?.tagName === 'PRE' && node.textContent === 'linha 1\nlinha 2',
      ),
    ).toHaveLength(1);
    expect(card.getByRole('link', { name: 'Ver a execução' }).getAttribute('href')).toBe(
      '/logs/r1',
    );
  });

  it('approves with one click', async () => {
    const view = renderApp('/aprovacoes', {
      '/api/approvals': { approvals: [approval] },
      'POST /api/approvals/ap1/decision': () => json(200, { ...approval, status: 'approved' }),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Aprovar' }));
    await waitFor(() =>
      expect(view.writes()).toEqual([
        { method: 'POST', url: '/api/approvals/ap1/decision', body: { decision: 'approve' } },
      ]),
    );
  });

  it('denies, sending the reason to the agent', async () => {
    const view = renderApp('/aprovacoes', {
      '/api/approvals': { approvals: [approval] },
      'POST /api/approvals/ap1/decision': () => json(200, { ...approval, status: 'denied' }),
    });
    fireEvent.change(await screen.findByLabelText(/Motivo, se for negar/), {
      target: { value: '  Não mexa nisso.  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Negar' }));
    await waitFor(() =>
      expect(view.writes()[0]?.body).toEqual({ decision: 'deny', reason: 'Não mexa nisso.' }),
    );
  });

  it('says so when the request was already answered elsewhere', async () => {
    renderApp('/aprovacoes', {
      '/api/approvals': { approvals: [approval] },
      'POST /api/approvals/ap1/decision': () =>
        json(409, {
          code: 'approval_not_pending',
          message: 'Esta aprovação já foi respondida ou retirada.',
        }),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Aprovar' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Esta aprovação já foi respondida ou retirada.',
    );
  });

  it('shows an empty queue and the recent decisions', async () => {
    renderApp('/aprovacoes', {
      '/api/approvals': (request: { url: string }) =>
        json(200, {
          approvals: request.url.includes('decided')
            ? [
                {
                  ...approval,
                  status: 'denied',
                  reason: 'Não mexa nisso.',
                  decidedAt: '2026-11-13T12:01:00.000Z',
                },
              ]
            : [],
        }),
    });
    expect(await screen.findByText('Nada esperando por você.')).toBeTruthy();
    const decided = within(await screen.findByRole('region', { name: 'Decisões recentes' }));
    expect(decided.getByText('Negada')).toBeTruthy();
    expect(decided.getByText('Motivo: Não mexa nisso.')).toBeTruthy();
  });
});
