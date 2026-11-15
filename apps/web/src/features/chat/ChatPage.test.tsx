import type { Approval, ChatMessageView, ConversationDetail, ModelOption } from '@ea/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { installFakeEventSource } from '../../test/fake-event-source';
import { json, makeAgent, makeRun, noContent, renderApp } from '../../test/render';

const AT = '2026-11-12T12:00:00.000Z';

const agent = makeAgent({
  id: 'a1',
  name: 'Triagem',
  objective: 'Classificar pedidos',
  modelId: 'm1',
  modelName: 'Llama 3',
});

const localModel: ModelOption = {
  id: 'm1',
  name: 'llama3',
  displayName: 'Llama 3',
  providerName: 'Ollama local',
  isExternal: false,
  supportsTools: false,
};

const message = (
  id: string,
  role: ChatMessageView['role'],
  text: string,
  runId = 'r1',
): ChatMessageView => ({ id, role, text, runId, createdAt: AT });

function detail(overrides: Partial<ConversationDetail> = {}): ConversationDetail {
  const messages = overrides.messages ?? [
    message('m1', 'user', 'Bom dia'),
    message('m2', 'assistant', 'Bom dia! Como posso ajudar?'),
  ];
  return {
    conversation: {
      id: 'c1',
      agentId: 'a1',
      title: 'Bom dia',
      messageCount: messages.length,
      createdAt: AT,
      updatedAt: AT,
    },
    messages,
    runs: [makeRun({ id: 'r1' })],
    activeRunId: null,
    ...overrides,
  };
}

const api = (extra: Record<string, unknown> = {}) => ({
  '/api/agents': { agents: [agent] },
  '/api/models': { models: [localModel] },
  '/api/agents/a1/conversations': { conversations: [detail().conversation] },
  '/api/conversations/c1': detail(),
  ...extra,
});

const composer = () => screen.findByRole('textbox', { name: 'Mensagem' });
const transcript = async () => within(await screen.findByRole('list', { name: 'Mensagens' }));

describe('ChatPage', () => {
  it('starts a new conversation with the first message (RF-30)', async () => {
    const { writes, router } = renderApp(
      '/agentes/a1/conversa',
      api({
        '/api/agents/a1/conversations': { conversations: [] },
        'POST /api/conversations': () => json(202, { conversationId: 'c1', runId: 'r1' }),
      }),
    );

    expect(await screen.findByRole('heading', { name: 'Triagem', level: 1 })).toBeTruthy();
    expect(screen.getByText('Nova conversa com Triagem')).toBeTruthy();
    expect(screen.getByText('Classificar pedidos')).toBeTruthy();
    expect(screen.getAllByText('Nenhuma conversa ainda.').length).toBeGreaterThan(0);

    const send = screen.getByRole('button', { name: 'Enviar' });
    expect(send).toHaveProperty('disabled', true);
    fireEvent.change(await composer(), { target: { value: '  Bom dia  ' } });
    fireEvent.click(send);

    await waitFor(() => expect(router.state.location.pathname).toBe('/agentes/a1/conversa/c1'));
    expect(writes()).toEqual([
      { method: 'POST', url: '/api/conversations', body: { agentId: 'a1', content: 'Bom dia' } },
    ]);
    const list = await transcript();
    expect(list.getByText('Bom dia! Como posso ajudar?')).toBeTruthy();
  });

  it('shows the history with what each run cost and a link to its steps (RF-32)', async () => {
    renderApp('/agentes/a1/conversa/c1', api());
    const list = await transcript();

    const items = list.getAllByRole('listitem').map((item) => item.textContent);
    expect(items[0]).toBe('Você:Bom dia');
    expect(items[1]).toBe('Agente:Bom dia! Como posso ajudar?');
    expect(items[2]).toContain('3 s');
    expect(items[2]).toContain('120 tokens');
    expect(list.getByRole('link', { name: 'Ver passos' }).getAttribute('href')).toBe('/logs/r1');

    const conversations = within(screen.getAllByRole('list', { name: 'Conversas' })[0]!);
    expect(conversations.getByRole('link', { current: 'page' }).textContent).toContain('Bom dia');
  });

  it('sends the next message in the same conversation with Enter (RF-36)', async () => {
    const { writes } = renderApp(
      '/agentes/a1/conversa/c1',
      api({
        'POST /api/conversations/c1/messages': () =>
          json(202, { conversationId: 'c1', runId: 'r2' }),
      }),
    );
    const input = await composer();
    await transcript();

    fireEvent.change(input, { target: { value: 'Linha um' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(writes()).toEqual([]);

    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual({
      method: 'POST',
      url: '/api/conversations/c1/messages',
      body: { content: 'Linha um' },
    });
    await waitFor(() => expect(input).toHaveProperty('value', ''));
  });

  it('shows the answer as it is written and lets the user interrupt (RF-31, RF-35)', async () => {
    const streams = installFakeEventSource();
    const running = detail({
      messages: [message('m1', 'user', 'Conte uma história', 'r1')],
      runs: [
        makeRun({
          id: 'r1',
          status: 'running',
          endReason: null,
          finishedAt: null,
          durationMs: null,
        }),
      ],
      activeRunId: 'r1',
    });
    const cancelled = detail({
      messages: [
        message('m1', 'user', 'Conte uma história', 'r1'),
        message('m2', 'assistant', 'Era uma vez', 'r1'),
      ],
      runs: [makeRun({ id: 'r1', status: 'cancelled', endReason: 'cancelled_by_user' })],
    });
    let finished = false;
    const { writes } = renderApp(
      '/agentes/a1/conversa/c1',
      api({
        '/api/conversations/c1': () => json(200, finished ? cancelled : running),
        'POST /api/runs/r1/cancel': () => json(202, running.runs[0]),
      }),
    );

    const list = await transcript();
    const stream = await waitFor(() => {
      const source = streams.open('/api/runs/r1/events');
      expect(source).toBeDefined();
      return source!;
    });
    expect(screen.queryByRole('button', { name: 'Enviar' })).toBeNull();

    stream.emit('snapshot', { status: 'running', text: 'Era ' });
    stream.emit('delta', { text: 'uma ' });
    stream.emit('delta', { text: 'vez' });
    stream.emit('step', {
      seq: 1,
      type: 'run_started',
      payload: { model: 'llama3' },
      createdAt: AT,
    });
    // The same step again (a reconnection) is not shown twice.
    stream.emit('step', {
      seq: 1,
      type: 'run_started',
      payload: { model: 'llama3' },
      createdAt: AT,
    });

    expect(list.getByText('Era uma vez')).toBeTruthy();
    expect(list.getByText('Escrevendo…')).toBeTruthy();
    expect(list.getByText('1 passo até agora')).toBeTruthy();

    // A snapshot after a reconnection replaces the text instead of appending to it.
    stream.emit('snapshot', { status: 'running', text: 'Era uma vez' });
    expect(list.getByText('Era uma vez')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Interromper' }));
    await waitFor(() =>
      expect(writes()).toEqual([{ method: 'POST', url: '/api/runs/r1/cancel', body: undefined }]),
    );

    finished = true;
    stream.emit('end', { status: 'cancelled' });
    expect(await list.findByText(/Interrompida por você/)).toBeTruthy();
    expect(list.getByText('Você interrompeu a execução.')).toBeTruthy();
    expect(list.queryByText('Escrevendo…')).toBeNull();
    expect(streams.open('/api/runs/r1/events')).toBeUndefined();
    expect(await screen.findByRole('button', { name: 'Enviar' })).toBeTruthy();
  });

  it('shows why a run failed, with the way to its steps (RF-34)', async () => {
    renderApp(
      '/agentes/a1/conversa/c1',
      api({
        '/api/conversations/c1': detail({
          messages: [message('m1', 'user', 'Olá')],
          runs: [
            makeRun({
              id: 'r1',
              status: 'failed',
              endReason: 'provider_unreachable',
              errorMessage: 'Não foi possível conectar ao provedor.',
              inputTokens: 0,
              outputTokens: 0,
            }),
          ],
        }),
      }),
    );
    const list = await transcript();
    expect(list.getByRole('alert').textContent).toBe('Não foi possível conectar ao provedor.');
    expect(list.getByText(/Falhou/)).toBeTruthy();
  });

  it('renders model output as safe Markdown (C-07)', async () => {
    const hostile = [
      '**negrito** e `código`',
      '<script>window.hacked = true</script>',
      '<img src="http://evil.example/pixel.png" onerror="window.hacked = true">',
      '![rastreador](http://evil.example/pixel.png)',
      '[clique](javascript:window.hacked=true)',
      '[site](https://example.com/pagina)',
    ].join('\n\n');
    const { container } = renderApp(
      '/agentes/a1/conversa/c1',
      api({
        '/api/conversations/c1': detail({
          messages: [message('m1', 'user', '<b>oi</b>'), message('m2', 'assistant', hostile)],
        }),
      }),
    );
    const list = await transcript();

    expect(list.getByText('negrito').tagName).toBe('STRONG');
    expect(list.getByText('código').tagName).toBe('CODE');
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[onerror]')).toBeNull();
    expect((window as unknown as { hacked?: boolean }).hacked).toBeUndefined();
    expect(list.getByText('[imagem: rastreador]')).toBeTruthy();

    const unsafe = list.getByText('clique');
    expect(unsafe.getAttribute('href') ?? '').not.toContain('javascript');
    const link = list.getByRole('link', { name: 'site' });
    expect(link.getAttribute('href')).toBe('https://example.com/pagina');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer nofollow');

    // What the user typed is shown literally, never as markup.
    expect(list.getByText('<b>oi</b>')).toBeTruthy();
  });

  it('does not let an inactive agent or one without a model be messaged (RN-01, RN-02)', async () => {
    const inactive = makeAgent({ ...agent, enabled: false, state: 'inactive' });
    const first = renderApp('/agentes/a1/conversa', api({ '/api/agents': { agents: [inactive] } }));
    expect(await screen.findByText(/Este agente está inativo/)).toBeTruthy();
    expect(await composer()).toHaveProperty('disabled', true);
    first.unmount();

    const noModel = makeAgent({ id: 'a1', name: 'Triagem' });
    renderApp('/agentes/a1/conversa', api({ '/api/agents': { agents: [noModel] } }));
    expect(await screen.findByText(/ainda não tem um modelo/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Escolher um modelo' }).getAttribute('href')).toBe(
      '/agentes/a1',
    );
  });

  it('says what is sent to an external provider', async () => {
    renderApp(
      '/agentes/a1/conversa',
      api({
        '/api/models': { models: [{ ...localModel, isExternal: true, providerName: 'OpenAI' }] },
      }),
    );
    expect(
      await screen.findByText(/todas as mensagens desta\s+conversa são enviados a OpenAI/),
    ).toBeTruthy();
  });

  it('keeps the draft and shows the reason when the server refuses the message', async () => {
    renderApp(
      '/agentes/a1/conversa/c1',
      api({
        'POST /api/conversations/c1/messages': () =>
          json(409, { code: 'conversation_busy', message: 'O agente ainda está respondendo.' }),
      }),
    );
    const input = await composer();
    await transcript();
    fireEvent.change(input, { target: { value: 'de novo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    expect((await screen.findByRole('alert')).textContent).toBe('O agente ainda está respondendo.');
    expect(input).toHaveProperty('value', 'de novo');
  });

  it('deletes a conversation after confirmation and leaves it', async () => {
    const { writes, router } = renderApp(
      '/agentes/a1/conversa/c1',
      api({ 'DELETE /api/conversations/c1': () => noContent() }),
    );
    await transcript();
    fireEvent.click(screen.getAllByRole('button', { name: 'Excluir a conversa "Bom dia"' })[0]!);
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByText(/As execuções continuam nos logs/)).toBeTruthy();
    fireEvent.click(dialog.getByRole('button', { name: 'Excluir conversa' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/agentes/a1/conversa'));
    expect(writes()).toEqual([{ method: 'DELETE', url: '/api/conversations/c1', body: undefined }]);
  });

  it('explains when the agent does not exist', async () => {
    renderApp('/agentes/nope/conversa', api());
    expect(await screen.findByText('Agente não encontrado.')).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Mensagem' })).toBeNull();
  });
  it('shows what the agent is doing with its tools and asks for approval in place (UC-05)', async () => {
    const events = installFakeEventSource();
    const approval: Approval = {
      id: 'ap1',
      runId: 'r2',
      originRunId: 'r2',
      agentId: 'a1',
      agentName: 'Triagem',
      conversationId: 'c1',
      toolName: 'write_file',
      toolTitle: 'Escrever arquivo',
      risk: 'medium',
      arguments: { path: 'notas.txt', content: 'oi' },
      status: 'pending',
      reason: null,
      createdAt: AT,
      decidedAt: null,
    };
    let queue: Approval[] = [];
    const { writes } = renderApp(
      '/agentes/a1/conversa/c1',
      api({
        '/api/conversations/c1': detail({
          runs: [makeRun({ id: 'r1' }), makeRun({ id: 'r2', status: 'running', finishedAt: null })],
          activeRunId: 'r2',
        }),
        '/api/approvals': () => json(200, { approvals: queue }),
        'POST /api/approvals/ap1/decision': () => json(200, { ...approval, status: 'approved' }),
      }),
    );
    const stream = await waitFor(() => {
      const found = events.open('/api/runs/r2/events');
      if (!found) throw new Error('stream not open yet');
      return found;
    });
    stream.emit('snapshot', { status: 'running', text: '' });
    stream.emit('step', {
      seq: 3,
      type: 'tool_call_requested',
      payload: { tool: 'read_file', toolTitle: 'Ler arquivo', permission: 'allow' },
      createdAt: AT,
    });
    expect(await screen.findByText('Usando a ferramenta “Ler arquivo”…')).toBeTruthy();

    stream.emit('step', {
      seq: 4,
      type: 'delegation_started',
      payload: { childRunId: 'r9', agentId: 'a2', agentName: 'Revisor' },
      createdAt: AT,
    });
    expect(await screen.findByText(/Aguardando Revisor, que recebeu uma tarefa/)).toBeTruthy();

    // The run stops for a decision: the request appears in the conversation itself.
    queue = [approval];
    stream.emit('status', { status: 'waiting_approval' });
    expect(await screen.findByText('Aguardando a sua aprovação…')).toBeTruthy();
    events.open('/api/events')?.emit('run', {
      runId: 'r2',
      agentId: 'a1',
      conversationId: 'c1',
      status: 'waiting_approval',
    });
    const card = within(
      await screen.findByRole('article', {
        name: 'Aprovação pedida por Triagem: Escrever arquivo',
      }),
    );
    expect(card.getByText('notas.txt')).toBeTruthy();
    fireEvent.click(card.getByRole('button', { name: 'Aprovar' }));
    await waitFor(() =>
      expect(writes()).toEqual([
        { method: 'POST', url: '/api/approvals/ap1/decision', body: { decision: 'approve' } },
      ]),
    );
  });
});
