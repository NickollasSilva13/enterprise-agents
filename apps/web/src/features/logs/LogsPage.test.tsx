import type { RunDetail, RunList } from '@ea/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { json, makeAgent, makeRun, renderApp } from '../../test/render';

const agents = {
  agents: [makeAgent({ id: 'a1', name: 'Triagem' }), makeAgent({ id: 'a2', name: 'Leitor' })],
};

const failed = makeRun({
  id: 'r2',
  status: 'failed',
  endReason: 'provider_unreachable',
  errorMessage: 'Não foi possível conectar ao provedor.',
  inputTokens: 0,
  outputTokens: 0,
  durationMs: 850,
});
const done = makeRun({ id: 'r1', agentId: 'a2', agentName: 'Leitor', agentDeleted: true });

/** Renders the logs over pages of runs keyed by `before`; records each query string. */
function renderLogs(path: string, pages: Record<string, RunList>) {
  const queries: string[] = [];
  const view = renderApp(path, {
    '/api/agents': agents,
    '/api/runs': ({ url }: { url: string }) => {
      const query = url.split('?')[1] ?? '';
      queries.push(query);
      const before = new URLSearchParams(query).get('before') ?? '';
      return json(200, pages[before] ?? { runs: [], nextBefore: null });
    },
  });
  return { ...view, queries };
}

const rows = async () =>
  within(await screen.findByRole('table', { name: 'Execuções' }))
    .getAllByRole('row')
    .slice(1);

describe('LogsPage', () => {
  it('lists the runs with agent, state, duration and tokens (RF-71)', async () => {
    renderLogs('/logs', { '': { runs: [failed, done], nextBefore: null } });
    const [first, second] = await rows();

    expect(first?.textContent).toContain('Triagem');
    expect(first?.textContent).toContain('Falhou');
    expect(first?.textContent).toContain('850 ms');
    expect(second?.textContent).toContain('Leitor (excluído)');
    expect(second?.textContent).toContain('Concluída');
    expect(second?.textContent).toContain('120');
    expect(within(first!).getByRole('link').getAttribute('href')).toBe('/logs/r2');
    expect(screen.getByText('2 execuções')).toBeTruthy();
  });

  it('filters by agent, state and period, keeping the filters in the address', async () => {
    const { queries, router } = renderLogs('/logs', {
      '': { runs: [failed], nextBefore: null },
    });
    await rows();

    fireEvent.change(screen.getByRole('combobox', { name: 'Agente' }), { target: { value: 'a1' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Estado' }), {
      target: { value: 'failed' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Período' }), {
      target: { value: '24h' },
    });

    await waitFor(() => {
      const last = new URLSearchParams(queries.at(-1));
      expect(last.get('agentId')).toBe('a1');
      expect(last.get('status')).toBe('failed');
      expect(last.get('from')).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
    expect(router.state.location.search).toBe('?agente=a1&estado=failed&periodo=24h');
  });

  it('opens already filtered from a link, as the agent history does (RF-19)', async () => {
    const { queries } = renderLogs('/logs?agente=a2', { '': { runs: [done], nextBefore: null } });
    await rows();
    expect(new URLSearchParams(queries[0]).get('agentId')).toBe('a2');
    expect(screen.getByRole('combobox', { name: 'Agente' })).toHaveProperty('value', 'a2');
  });

  it('loads older runs on request', async () => {
    renderLogs('/logs', {
      '': { runs: [failed], nextBefore: 'r2' },
      r2: { runs: [done], nextBefore: null },
    });
    expect(await rows()).toHaveLength(1);
    expect(screen.getByText('1 execução ou mais')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Carregar mais antigas' }));
    await waitFor(async () => expect(await rows()).toHaveLength(2));
    expect(screen.queryByRole('button', { name: 'Carregar mais antigas' })).toBeNull();
  });

  it('tells an empty history from filters that match nothing', async () => {
    const first = renderLogs('/logs', {});
    expect(await screen.findByText('Nenhuma execução ainda.')).toBeTruthy();
    first.unmount();

    renderLogs('/logs?estado=failed', {});
    expect(await screen.findByText('Nenhuma execução corresponde aos filtros.')).toBeTruthy();
  });
});

describe('RunDetailPage', () => {
  const detail: RunDetail = {
    run: failed,
    steps: [
      { seq: 1, type: 'run_started', payload: { model: 'llama3' }, createdAt: failed.createdAt },
      { seq: 2, type: 'model_call_started', payload: { step: 1 }, createdAt: failed.createdAt },
      {
        seq: 3,
        type: 'error',
        payload: { reason: 'provider_unreachable', message: failed.errorMessage },
        createdAt: failed.createdAt,
      },
      {
        seq: 4,
        type: 'run_finished',
        payload: { status: 'failed', endReason: 'provider_unreachable' },
        createdAt: failed.createdAt,
      },
      { seq: 5, type: 'tool_call_future', payload: {}, createdAt: failed.createdAt },
    ],
    tree: [{ run: failed, depth: 0 }],
  };

  it('shows the run step by step, with the error in evidence (RF-33, RF-34, UC-07)', async () => {
    renderApp('/logs/r2', { '/api/runs/r2': detail });

    expect(await screen.findByRole('heading', { name: 'Execução de Triagem' })).toBeTruthy();
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Não foi possível conectar ao provedor.');
    expect(alert.textContent).toContain('O provedor do modelo não respondeu.');

    const steps = within(screen.getByRole('list', { name: 'Passos da execução' }))
      .getAllByRole('listitem')
      .map((item) => item.textContent);
    expect(steps).toHaveLength(5);
    expect(steps[0]).toContain('Execução iniciada');
    expect(steps[0]).toContain('Modelo llama3');
    expect(steps[1]).toContain('Chamada ao modelo');
    expect(steps[2]).toContain('Erro');
    expect(steps[3]).toContain('Execução encerrada');
    expect(steps[3]).toContain('Falhou');
    // A step type this version does not know is still listed, by name.
    expect(steps[4]).toContain('tool_call_future');

    expect(screen.getByRole('link', { name: 'Abrir a conversa' }).getAttribute('href')).toBe(
      '/agentes/a1/conversa/c1',
    );
    expect(screen.queryByRole('button', { name: 'Interromper' })).toBeNull();
  });

  it('describes a finished model call and lets an active run be interrupted', async () => {
    const active = makeRun({
      id: 'r3',
      status: 'running',
      endReason: null,
      finishedAt: null,
      durationMs: null,
    });
    const { writes } = renderApp('/logs/r3', {
      '/api/runs/r3': {
        run: active,
        steps: [
          {
            seq: 1,
            type: 'model_call_finished',
            payload: {
              step: 1,
              stopReason: 'end',
              inputTokens: 1200,
              outputTokens: 34,
              durationMs: 2500,
            },
            createdAt: active.createdAt,
          },
        ],
        tree: [{ run: active, depth: 0 }],
      } satisfies RunDetail,
      'POST /api/runs/r3/cancel': () => json(202, active),
    });

    expect(
      await screen.findByText(/resposta completa · 2,5 s · 1.200 tokens de entrada · 34 de saída/),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Interromper' }));
    await waitFor(() =>
      expect(writes().map((write) => write.url)).toEqual(['/api/runs/r3/cancel']),
    );
  });

  it('says so when the run does not exist', async () => {
    renderApp('/logs/nope', {
      '/api/runs/nope': () => json(404, { code: 'not_found', message: 'Execução não encontrada.' }),
    });
    expect((await screen.findByRole('alert')).textContent).toContain('Execução não encontrada.');
  });
  it('describes tool calls, approvals and delegations in plain words (RF-33)', async () => {
    const at = failed.createdAt;
    const run = makeRun({ id: 'r5' });
    renderApp('/logs/r5', {
      '/api/runs/r5': {
        run,
        steps: [
          {
            seq: 1,
            type: 'tool_call_requested',
            payload: {
              tool: 'write_file',
              toolTitle: 'Escrever arquivo',
              permission: 'ask',
              reason: 'granted',
              arguments: { path: 'a.txt', content: 'oi' },
            },
            createdAt: at,
          },
          {
            seq: 2,
            type: 'approval_requested',
            payload: { tool: 'write_file', toolTitle: 'Escrever arquivo' },
            createdAt: at,
          },
          {
            seq: 3,
            type: 'approval_decided',
            payload: { tool: 'write_file', decision: 'denied', reason: 'Agora não.' },
            createdAt: at,
          },
          {
            seq: 4,
            type: 'tool_call_finished',
            payload: {
              tool: 'write_file',
              toolTitle: 'Escrever arquivo',
              status: 'denied',
              preview: 'O usuário negou esta ação.',
            },
            createdAt: at,
          },
          {
            seq: 5,
            type: 'tool_call_requested',
            payload: {
              tool: 'run_script',
              permission: 'deny',
              reason: 'not_granted',
              arguments: {},
            },
            createdAt: at,
          },
          {
            seq: 6,
            type: 'tool_call_finished',
            payload: {
              tool: 'read_file',
              toolTitle: 'Ler arquivo',
              status: 'completed',
              durationMs: 1500,
              preview: 'conteúdo',
            },
            createdAt: at,
          },
          {
            seq: 7,
            type: 'delegation_started',
            payload: { childRunId: 'r6', agentName: 'Revisor' },
            createdAt: at,
          },
          {
            seq: 8,
            type: 'delegation_finished',
            payload: { childRunId: 'r6', agentName: 'Revisor', status: 'completed' },
            createdAt: at,
          },
        ],
        tree: [{ run, depth: 0 }],
      } satisfies RunDetail,
    });

    const steps = within(await screen.findByRole('list', { name: 'Passos da execução' }))
      .getAllByRole('listitem')
      .map((item) => item.textContent?.replace(/\d{2}:\d{2}:\d{2}/, ' | '));
    expect(steps).toEqual([
      'Pediu a ferramenta "Escrever arquivo" | path: a.txt · content: oi',
      'Aguardando a sua aprovação | Para usar "Escrever arquivo"',
      'Você negou | "write_file" · Motivo: Agora não.',
      'Ferramenta "Escrever arquivo" não executada | O usuário negou esta ação.',
      'Pediu a ferramenta "run_script" | Bloqueada: não foi liberada para este agente',
      'Ferramenta "Ler arquivo" concluída | 1,5 s · conteúdo',
      'Delegou uma tarefa a Revisor | ',
      'Revisor devolveu a tarefa | Concluída',
    ]);
    // A run with no delegation has no tree to show.
    expect(screen.queryByRole('region', { name: 'Delegações' })).toBeNull();
  });

  it('shows the delegation tree with the agent of each run (RF-61, RF-62)', async () => {
    const parent = makeRun({ id: 'r7', agentName: 'Coordenador' });
    const child = makeRun({
      id: 'r8',
      agentId: 'a2',
      agentName: 'Revisor',
      parentRunId: 'r7',
      trigger: 'delegation',
      status: 'failed',
    });
    renderApp('/logs/r8', {
      '/api/runs/r8': {
        run: child,
        steps: [],
        tree: [
          { run: parent, depth: 0 },
          { run: child, depth: 1 },
        ],
      } satisfies RunDetail,
    });

    const tree = within(await screen.findByRole('list', { name: 'Árvore de execução' }));
    const nodes = tree.getAllByRole('listitem').map((item) => item.textContent);
    expect(nodes[0]).toContain('Coordenador');
    expect(nodes[0]).toContain('iniciada por você');
    expect(nodes[1]).toContain('Revisor');
    expect(nodes[1]).toContain('Falhou');
    expect(nodes[1]).toContain('tarefa delegada');
    expect(nodes[1]).toContain('Você está aqui');
    expect(
      tree.getByRole('link', { name: 'Abrir a execução de Coordenador' }).getAttribute('href'),
    ).toBe('/logs/r7');
    expect(screen.getByText('Delegação de outro agente')).toBeTruthy();
  });
});
