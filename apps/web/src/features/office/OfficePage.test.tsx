import type { Office, OfficeAgent } from '@ea/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { emptySummary, json, renderApp } from '../../test/render';

const occupant = (overrides: Partial<OfficeAgent> & { id: string; name: string }): OfficeAgent => ({
  objective: '',
  state: 'idle',
  currentRun: null,
  lastError: null,
  pendingApproval: null,
  delegatingTo: [],
  idleSince: null,
  ...overrides,
});

const office: Office = {
  rooms: [
    {
      id: 'p1',
      name: 'Atendimento',
      description: 'Responde clientes',
      agents: [
        occupant({
          id: 'a1',
          name: 'Triagem',
          state: 'working',
          currentRun: { id: 'r1', conversationId: 'c1', status: 'running', prompt: 'Pedido 42' },
        }),
        occupant({ id: 'a2', name: 'Respostas', state: 'waiting' }),
        occupant({
          id: 'a4',
          name: 'Leitor',
          state: 'failed',
          lastError: 'O provedor não respondeu.',
        }),
        occupant({
          id: 'a5',
          name: 'Fila',
          state: 'working',
          currentRun: { id: 'r2', conversationId: null, status: 'queued', prompt: null },
        }),
      ],
    },
    { id: 'p2', name: 'Arquivo', description: '', agents: [] },
    {
      id: null,
      name: 'Sem projeto',
      description: '',
      agents: [
        occupant({ id: 'a3', name: 'Rascunho', state: 'inactive' }),
        occupant({ id: 'a6', name: 'Calmo' }),
      ],
    },
  ],
};

const room = (name: string) => within(screen.getByRole('region', { name }));

const render = (data: Office = office) =>
  renderApp('/escritorio', { '/api/dashboard/summary': emptySummary, '/api/office': data });

describe('OfficePage', () => {
  it('draws one room per project with each agent at a desk, saying what it is doing (RF-08)', async () => {
    render();

    await screen.findByRole('region', { name: 'Atendimento' });
    const desks = room('Atendimento').getAllByRole('listitem');
    expect(desks.map((desk) => desk.textContent)).toEqual([
      'Respondendo: “Pedido 42”TriagemTrabalhando',
      'Preciso da sua aprovaçãoRespostasAguardando você',
      'O provedor não respondeu.LeitorCom falha',
      'Na fila, já começo…FilaTrabalhando',
    ]);
    expect(room('Atendimento').getByText('Responde clientes')).toBeTruthy();
    expect(room('Atendimento').getByText('4 agentes')).toBeTruthy();

    expect(room('Arquivo').getByText(/Sala vazia/)).toBeTruthy();
    expect(room('Arquivo').getByText('0 agentes')).toBeTruthy();

    // Idle and inactive agents have nothing to say.
    expect(
      room('Sem projeto')
        .getAllByRole('listitem')
        .map((desk) => desk.textContent),
    ).toEqual(['RascunhoInativo', 'CalmoOcioso']);
  });

  it('opens the conversation when an agent is clicked', async () => {
    render();
    await screen.findByRole('region', { name: 'Atendimento' });
    const links = room('Atendimento')
      .getAllByRole('link')
      .map((link) => link.getAttribute('href'));
    // An agent in the middle of a run opens that conversation; the others, a new one.
    expect(links).toEqual([
      '/agentes/a1/conversa/c1',
      '/agentes/a2/conversa',
      '/agentes/a4/conversa',
      '/agentes/a5/conversa',
    ]);
  });

  it('draws each state differently and leaves the chair of an inactive agent empty', async () => {
    render();
    await screen.findByRole('region', { name: 'Atendimento' });
    const scene = (name: string, region: string) =>
      room(region)
        .getAllByRole('listitem')
        .find((desk) => desk.textContent?.includes(name))
        ?.querySelector('svg');

    expect(scene('Triagem', 'Atendimento')?.querySelector('.desk-type-a')).not.toBeNull();
    expect(
      scene('Triagem', 'Atendimento')?.querySelector('.desk-steam, .desk-code'),
    ).not.toBeNull();
    expect(scene('Respostas', 'Atendimento')?.querySelector('.desk-wave')).not.toBeNull();
    expect(scene('Leitor', 'Atendimento')?.querySelector('.desk-shake')).not.toBeNull();
    expect(scene('Calmo', 'Sem projeto')?.querySelector('.desk-breathe')).not.toBeNull();

    const away = scene('Rascunho', 'Sem projeto');
    expect(away?.querySelector('[class^="desk-"]')).toBeNull();
    // Nothing in the artwork uses an inline style or an outside resource (CSP).
    expect(document.querySelector('main [style]')).toBeNull();
    expect(document.querySelector('main image, main use, main [href^="http"]')).toBeNull();
    expect(away?.getAttribute('aria-hidden')).toBe('true');
  });

  it('explains every state colour in a legend', async () => {
    render();
    const legend = within(await screen.findByRole('list', { name: 'Legenda dos estados' }));
    expect(legend.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Aguardando você',
      'Com falha',
      'Trabalhando',
      'Ocioso',
      'Inativo',
    ]);
  });

  it('gives the same agent the same look every time', async () => {
    render({
      rooms: [
        {
          id: 'p1',
          name: 'Sala',
          description: '',
          agents: [
            occupant({ id: 'same', name: 'Um' }),
            occupant({ id: 'same', name: 'Dois' }),
            occupant({ id: 'other-agent', name: 'Três' }),
          ],
        },
      ],
    });
    const sala = await screen.findByRole('region', { name: 'Sala' });
    const scenes = [...sala.querySelectorAll('li svg')].map((svg) => svg.innerHTML);
    expect(scenes).toHaveLength(3);
    expect(scenes[0]).toBe(scenes[1]);
    expect(scenes[0]).not.toBe(scenes[2]);
  });

  it('explains an empty office and what will fill it', async () => {
    render({ rooms: [] });
    expect(await screen.findByText('O escritório ainda está vazio.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Criar o primeiro agente' }).getAttribute('href')).toBe(
      '/agentes/novo',
    );
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('has a reception and a pantry, and says in words who is where (RF-80)', async () => {
    const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
    render({
      rooms: [
        {
          id: 'p1',
          name: 'Sala',
          description: '',
          agents: [
            occupant({ id: 'a1', name: 'Ana', idleSince: hourAgo }),
            occupant({ id: 'a2', name: 'Bento', idleSince: hourAgo }),
            occupant({ id: 'a3', name: 'Caio', idleSince: new Date().toISOString() }),
            occupant({ id: 'a4', name: 'Dora', state: 'inactive' }),
          ],
        },
      ],
    });
    await screen.findByRole('region', { name: 'Sala' });
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Recepção',
      'Copa',
      'Sala',
    ]);
    expect(room('Copa').getByText('Na copa: Ana e Bento.')).toBeTruthy();
    expect(room('Recepção').getByText('Fora do escritório: Dora.')).toBeTruthy();
    expect(
      room('Sala')
        .getAllByRole('listitem')
        .map((desk) => [desk.textContent, desk.getAttribute('data-seated')]),
    ).toEqual([
      ['AnaOciosoNa copa', 'false'],
      ['BentoOciosoNa copa', 'false'],
      ['CaioOcioso', 'true'],
      ['DoraInativo', 'false'],
    ]);
    // Who is at the pantry or on the way is drawn standing; who is outside is not drawn.
    expect(
      [...document.querySelectorAll('[data-walker]')].map((w) => w.getAttribute('data-walker')),
    ).toEqual(['a1', 'a2']);
    // The agent still opens its conversation from the desk, wherever it is.
    expect(room('Sala').getAllByRole('link')).toHaveLength(4);
    expect(document.querySelector('main [style]')).toBeNull();
    expect(document.querySelector('main svg text')).toBeNull();
  });

  it('says so when nobody is at the pantry or outside', async () => {
    render();
    await screen.findByRole('region', { name: 'Atendimento' });
    expect(room('Copa').getByText('Ninguém na copa agora.')).toBeTruthy();
    expect(room('Recepção').getByText('Fora do escritório: Rascunho.')).toBeTruthy();
  });

  it('shows an error when the office cannot be loaded', async () => {
    renderApp('/escritorio', {
      '/api/dashboard/summary': emptySummary,
      '/api/office': () => json(500, { code: 'internal_error', message: 'Erro interno.' }),
    });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Não foi possível carregar o escritório.');
  });
  it('shows a delegation between the desks of the two agents (RF-09)', async () => {
    render({
      rooms: [
        {
          id: 'p1',
          name: 'Redação',
          description: '',
          agents: [
            occupant({
              id: 'a1',
              name: 'Coordenador',
              state: 'working',
              currentRun: {
                id: 'r1',
                conversationId: 'c1',
                status: 'running',
                prompt: 'Relatório',
              },
              delegatingTo: ['a2'],
            }),
            occupant({
              id: 'a2',
              name: 'Revisor',
              state: 'working',
              currentRun: { id: 'r2', conversationId: 'c2', status: 'running', prompt: 'Revise' },
            }),
          ],
        },
      ],
    });
    const redacao = await screen.findByRole('region', { name: 'Redação' });
    expect(
      within(redacao)
        .getAllByRole('listitem')
        .map((desk) => desk.textContent),
    ).toEqual([
      'Pedi ajuda a Revisor e aguardo a respostaCoordenadorTrabalhandoNa mesa de Revisor',
      'Tarefa de Coordenador: “Revise”RevisorTrabalhando',
    ]);
    // The delegator is drawn on its feet at the other desk, and its own chair is empty.
    const [coordinator, reviewer] = within(redacao).getAllByRole('listitem');
    expect(coordinator?.getAttribute('data-place')).toBe('visit:a2');
    expect(coordinator?.querySelector('.desk-type-a')).toBeNull();
    expect(reviewer?.querySelector('.desk-type-a')).not.toBeNull();
    const walker = document.querySelector('[data-walker="a1"]');
    expect(walker).not.toBeNull();
    // The characters are decoration, hidden from assistive technology.
    expect(walker?.closest('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(document.querySelector('[data-walker="a2"]')).toBeNull();
  });

  it('lets a waiting agent be answered at its own desk (RF-09)', async () => {
    const view = renderApp('/escritorio', {
      '/api/dashboard/summary': emptySummary,
      '/api/office': {
        rooms: [
          {
            id: 'p1',
            name: 'Redação',
            description: '',
            agents: [
              occupant({
                id: 'a1',
                name: 'Escritor',
                state: 'waiting',
                currentRun: {
                  id: 'r1',
                  conversationId: 'c1',
                  status: 'waiting_approval',
                  prompt: 'Salve',
                },
                pendingApproval: { id: 'ap1', toolTitle: 'Escrever arquivo' },
              }),
            ],
          },
        ],
      } satisfies Office,
      '/api/approvals': {
        approvals: [
          {
            id: 'ap1',
            runId: 'r1',
            originRunId: 'r1',
            agentId: 'a1',
            agentName: 'Escritor',
            conversationId: 'c1',
            toolName: 'write_file',
            toolTitle: 'Escrever arquivo',
            risk: 'medium',
            arguments: { path: 'texto.md', content: 'Era uma vez' },
            status: 'pending',
            reason: null,
            createdAt: '2026-11-13T12:00:00.000Z',
            decidedAt: null,
          },
        ],
      },
      'POST /api/approvals/ap1/decision': () => json(200, {}),
    });

    const desk = within(await screen.findByRole('region', { name: 'Redação' }));
    expect(desk.getByText('Posso usar “Escrever arquivo”?')).toBeTruthy();
    // The button is not inside the link that opens the conversation.
    const button = desk.getByRole('button', { name: 'Decidir o pedido de Escritor' });
    expect(button.closest('a')).toBeNull();

    fireEvent.click(button);
    const dialog = within(screen.getByRole('dialog', { name: 'Decidir o pedido' }));
    expect(dialog.getByText('texto.md')).toBeTruthy();
    expect(dialog.getByText('Era uma vez')).toBeTruthy();
    fireEvent.click(dialog.getByRole('button', { name: 'Negar' }));
    await waitFor(() =>
      expect(view.writes()).toEqual([
        { method: 'POST', url: '/api/approvals/ap1/decision', body: { decision: 'deny' } },
      ]),
    );
  });
});
