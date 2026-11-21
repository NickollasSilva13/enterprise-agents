import { type Appearance, buildPresetLayout, type Office, type OfficeAgent } from '@ea/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { emptySummary, json, renderApp } from '../../test/render';

const occupant = (overrides: Partial<OfficeAgent> & { id: string; name: string }): OfficeAgent => ({
  objective: '',
  projectId: 'p1',
  appearance: null,
  state: 'idle',
  currentRun: null,
  lastError: null,
  pendingApproval: null,
  delegatingTo: [],
  idleSince: null,
  visit: null,
  ...overrides,
});

/** A run in progress, with the facts the card shows (Phase 29, D4). */
const run = (overrides: Partial<NonNullable<OfficeAgent['currentRun']>> & { id: string }) => ({
  conversationId: null,
  status: 'running' as const,
  prompt: null,
  startedAt: null,
  steps: 0,
  maxSteps: 20,
  task: null,
  ...overrides,
});

const projects = [
  { id: 'p1', name: 'Atendimento', description: 'Responde clientes' },
  { id: 'p2', name: 'Arquivo', description: '' },
];

const officeWith = (agents: OfficeAgent[], preset: 'complete' | 'compact' = 'complete'): Office => {
  const counts = (projectId: string | null) =>
    agents.filter((agent) => agent.projectId === projectId).length;
  return {
    layout: buildPresetLayout(preset, [
      { projectId: 'p1', agents: counts('p1') },
      { projectId: 'p2', agents: counts('p2') },
      { projectId: null, agents: counts(null) },
    ]),
    customized: false,
    projects,
    agents,
  };
};

const office = officeWith([
  occupant({ id: 'a6', name: 'Calmo', projectId: null }),
  occupant({
    id: 'a5',
    name: 'Fila',
    state: 'working',
    currentRun: run({ id: 'r2', status: 'queued' }),
  }),
  occupant({ id: 'a4', name: 'Leitor', state: 'failed', lastError: 'O provedor não respondeu.' }),
  occupant({ id: 'a3', name: 'Rascunho', state: 'inactive', projectId: null }),
  occupant({ id: 'a2', name: 'Respostas', state: 'waiting' }),
  occupant({
    id: 'a1',
    name: 'Triagem',
    state: 'working',
    currentRun: run({
      id: 'r1',
      conversationId: 'c1',
      prompt: 'Pedido 42',
      startedAt: new Date(Date.now() - 125_000).toISOString(),
      steps: 4,
    }),
  }),
]);

const panel = () => within(screen.getByRole('region', { name: /^Agentes no escritório/ }));
const entry = (id: string) => document.querySelector(`[data-agent="${id}"]`);

const render = (data: Office = office, extra: Record<string, unknown> = {}) =>
  renderApp('/escritorio', {
    '/api/dashboard/summary': emptySummary,
    '/api/office': data,
    '/api/activity': { entries: [] },
    ...extra,
  });

describe('OfficePage', () => {
  it('lists every agent with its state, where it is and what it is doing (RF-07, RF-08)', async () => {
    render();
    await screen.findByRole('region', { name: 'Agentes no escritório (5)' });
    // Who needs the user first, then who failed, who works, who rests, who is off (Phase 29, D2).
    const cards = panel()
      .getAllByRole('article')
      .map((card) => [
        card.querySelector('h3')?.textContent,
        [...card.querySelectorAll('p')].map((line) => line.textContent),
      ]);
    expect(cards).toEqual([
      ['Respostas', ['Na mesa, em Atendimento', 'Preciso da sua aprovação']],
      ['Leitor', ['Na mesa, em Atendimento', 'O provedor não respondeu.']],
      ['Fila', ['Na mesa, em Atendimento', 'Na fila, já começo…', 'Na fila']],
      [
        'Triagem',
        ['Na mesa, em Atendimento', 'Respondendo: “Pedido 42”', 'passo 4 de até 20 · 2 min 05 s'],
      ],
      ['Calmo', ['Na mesa, em Sem projeto', 'Sem tarefa no momento.']],
      ['Rascunho', ['Fora do escritório', 'Sem tarefa no momento.']],
    ]);
    // The state is said in words on each card.
    expect(entry('a2')?.textContent).toContain('RespostasAguardando você');
    expect(entry('a3')?.textContent).toContain('RascunhoInativo');
  });

  it('lights the card of an agent picked in the scene, and keeps the conversation on the card (D3)', async () => {
    render();
    await screen.findByRole('region', { name: /^Agentes no escritório/ });
    const card = () => entry('a1')?.querySelector('article');
    expect(card()?.className).not.toContain('border-glow');
    const sitter = document.querySelector('[data-sitter="a1"]');
    if (!sitter) throw new Error('Triagem is not seated in the scene');
    fireEvent.click(sitter);
    // Picking does not leave the office: the card lights up instead.
    expect(screen.getByRole('heading', { name: 'Escritório', level: 1 })).toBeTruthy();
    expect(card()?.className).toContain('border-glow');
    expect(entry('a1')?.querySelector('a')?.getAttribute('aria-current')).toBe('true');
  });

  it('tells the recent activity in sentences, each leading to where it happened (D5)', async () => {
    render(office, {
      '/api/activity': {
        entries: [
          {
            kind: 'failure',
            id: 'r9',
            at: '2026-11-19T12:05:00.000Z',
            runId: 'r9',
            agentName: 'Leitor',
            taskTitle: 'Planilha',
          },
          {
            kind: 'approval',
            id: 'ap1',
            at: '2026-11-19T12:04:00.000Z',
            agentName: 'Respostas',
            toolTitle: 'Escrever arquivo',
            status: 'pending',
          },
          {
            kind: 'delivery',
            id: 'e3',
            at: '2026-11-19T12:03:00.000Z',
            taskId: 't3',
            title: 'Página de preços',
            fromArea: 'Site',
            toArea: 'Vendas',
          },
          {
            kind: 'scheduled',
            id: 'e2',
            at: '2026-11-19T12:02:00.000Z',
            taskId: 't2',
            title: 'Fechamento',
            areaName: 'Vendas',
          },
          {
            kind: 'task_done',
            id: 'e1',
            at: '2026-11-19T12:01:00.000Z',
            taskId: 't1',
            title: 'Relatório',
            areaName: 'Vendas',
            agentName: 'Triagem',
          },
        ],
      },
    });
    // The feed is a query of its own, answered after the office: it may take longer.
    const feed = within(
      await screen.findByRole('list', { name: 'Atividade recente' }, { timeout: 3000 }),
    );
    expect(
      feed.getAllByRole('link').map((link) => [link.textContent, link.getAttribute('href')]),
    ).toEqual([
      ['Leitor falhou em “Planilha”', '/logs/r9'],
      ['Respostas pede para usar “Escrever arquivo”', '/aprovacoes'],
      ['Site entregou “Página de preços” a Vendas', '/tarefas/t3'],
      ['Um agendamento criou “Fechamento” em Vendas', '/tarefas/t2'],
      ['Triagem concluiu “Relatório” em Vendas', '/tarefas/t1'],
    ]);
  });

  it('says what the activity will show while there is none', async () => {
    render();
    expect(
      await screen.findByText(/Tarefas concluídas, entregas entre áreas/, {}, { timeout: 3000 }),
    ).toBeTruthy();
  });

  it('offers the next things to do, off with the reason when there is no area (D6)', async () => {
    const view = render();
    const quick = within(
      await screen.findByRole('region', { name: 'Ações rápidas' }, { timeout: 3000 }),
    );
    expect(quick.getByRole('link', { name: /Criar tarefa/ }).getAttribute('href')).toBe(
      '/tarefas?nova=1',
    );
    expect(quick.getByRole('link', { name: /Novo agente/ }).getAttribute('href')).toBe(
      '/agentes/novo',
    );
    expect(quick.getByRole('link', { name: /Agendar tarefa/ }).getAttribute('href')).toBe(
      '/tarefas/agendamentos?novo=1',
    );
    view.unmount();

    render({ ...officeWith([]), projects: [] });
    const off = within(await screen.findByRole('region', { name: 'Ações rápidas' }));
    const create = off.getByRole('link', { name: /Criar tarefa/ });
    expect(create.getAttribute('aria-disabled')).toBe('true');
    expect(create.textContent).toContain('Crie uma área primeiro');
    expect(off.getByRole('link', { name: /Novo agente/ }).getAttribute('aria-disabled')).toBeNull();
  });

  it('opens the conversation of an agent from the list', async () => {
    render();
    await screen.findByRole('region', { name: /^Agentes no escritório/ });
    const links = [...document.querySelectorAll('[data-agent] article a')].map((link) =>
      link.getAttribute('href'),
    );
    // An agent in the middle of a run opens that conversation; the others, a new one.
    expect(links).toEqual([
      '/agentes/a2/conversa',
      '/agentes/a4/conversa',
      '/agentes/a5/conversa',
      '/agentes/a1/conversa/c1',
      '/agentes/a6/conversa',
      '/agentes/a3/conversa',
    ]);
    expect(
      panel()
        .getByRole('link', { name: /Ver todos os agentes/ })
        .getAttribute('href'),
    ).toBe('/agentes');
  });

  it('draws the office in pixel art: seated agents move by state, nobody outside is drawn', async () => {
    render();
    await screen.findByRole('region', { name: /^Agentes no escritório/ });
    const sitter = (id: string) => document.querySelector(`[data-sitter="${id}"]`);
    // Phase 22: typing and waving are frames of the character itself.
    expect(sitter('a1')?.querySelector('.pixel-type-1')).not.toBeNull();
    expect(sitter('a2')?.querySelector('.pixel-wave-1')).not.toBeNull();
    expect(sitter('a4')?.querySelector('.desk-shake')).not.toBeNull();
    expect(sitter('a6')?.querySelector('.desk-breathe')).not.toBeNull();
    expect(sitter('a3')).toBeNull();
    expect(document.querySelector('[data-walker]')).toBeNull();
    // The rooms carry their names, and the scene is decoration hidden from assistive technology.
    const scene = document.querySelector('[data-office-scene]');
    expect(scene?.getAttribute('aria-hidden')).toBe('true');
    expect(scene?.textContent).toContain('Atendimento');
    expect(scene?.textContent).toContain('Copa');
    expect(scene?.textContent).toContain('Boas ideias!');
    // Around it, by default, the park (Phase 33; before, a building).
    expect(scene?.querySelector('[data-surroundings="park"]')).not.toBeNull();
    // Nothing uses an inline style, an outside resource or <text> (CSP, readable text).
    expect(document.querySelector('main [style]')).toBeNull();
    expect(document.querySelector('main image, main use, main [href^="http"]')).toBeNull();
    expect(document.querySelector('main svg text')).toBeNull();
  });

  it('draws a chosen look, and the same robot for the same id', async () => {
    const look: Appearance = {
      kind: 'person',
      skin: 'brown',
      hair: 'curly',
      hairColor: 'black',
      outfit: 'hoodie',
      outfitColor: 'teal',
      pants: 'denim',
      accessory: 'headset',
      eyes: 'brown',
      facialHair: 'none',
      shoes: 'black',
      pattern: 'plain',
    };
    render(
      officeWith([
        occupant({ id: 'same', name: 'Um' }),
        occupant({ id: 'same-too', name: 'Dois', appearance: look }),
      ]),
    );
    await screen.findByRole('region', { name: /^Agentes no escritório/ });
    const robot = document.querySelector('[data-sitter="same"]')?.innerHTML;
    const person = document.querySelector('[data-sitter="same-too"]')?.innerHTML;
    expect(robot).toBeTruthy();
    expect(person).not.toBe(robot);
    // The avatar in the list is drawn from the same look.
    expect(entry('same-too')?.querySelector('svg')?.innerHTML).not.toBe(
      entry('same')?.querySelector('svg')?.innerHTML,
    );
  });

  it('draws the surroundings the layout says: a house, a park, a condominium', async () => {
    // Without WebGL the condominium (Phase 35) is drawn as the residential street, and the island
    // and the technological garden (Phase 36) as the park, each under its own name.
    for (const surroundings of ['house', 'park', 'condo', 'island', 'techGarden'] as const) {
      const data = officeWith([occupant({ id: 'a1', name: 'Ana' })]);
      const view = render({ ...data, layout: { ...data.layout, surroundings } });
      await screen.findByRole('region', { name: /^Agentes no escritório/ });
      expect(document.querySelector(`[data-surroundings="${surroundings}"]`)).not.toBeNull();
      expect(document.querySelector('main [style], main svg text')).toBeNull();
      view.unmount();
    }
  });

  it('explains an empty office and what will fill it', async () => {
    render(officeWith([]));
    expect(await screen.findByText(/Ninguém ainda/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Criar o primeiro agente' }).getAttribute('href')).toBe(
      '/agentes/novo',
    );
    // The office itself is there, with its common areas, ready to be edited.
    expect(document.querySelector('[data-office-scene]')?.textContent).toContain('Recepção');
    expect(
      screen.getAllByRole('link', { name: /Editar (o )?escritório/ })[0]?.getAttribute('href'),
    ).toBe('/escritorio/editar');
  });

  it('says where each agent is: pantry, lounge, outside (RF-80)', async () => {
    const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
    render(
      officeWith([
        occupant({ id: 'a1', name: 'Ana', idleSince: minutesAgo(5) }),
        occupant({ id: 'a2', name: 'Bento', idleSince: minutesAgo(60) }),
        occupant({ id: 'a3', name: 'Caio', idleSince: new Date().toISOString() }),
        occupant({ id: 'a4', name: 'Dora', state: 'inactive' }),
      ]),
    );
    await screen.findByRole('region', { name: /^Agentes no escritório/ });
    const where = ['a1', 'a2', 'a3', 'a4'].map((id) => [
      entry(id)?.getAttribute('data-place'),
      entry(id)?.getAttribute('data-seated'),
    ]);
    expect(where).toEqual([
      ['pantry', 'false'],
      ['lounge', 'false'],
      ['desk', 'true'],
      ['outside', 'false'],
    ]);
    expect(entry('a1')?.textContent).toContain('Na copa');
    expect(entry('a2')?.textContent).toContain('Na descompressão');
    expect(entry('a4')?.textContent).toContain('Fora do escritório');
    // Who is away from the desk is drawn standing, with a coffee at the pantry; who is outside is not drawn.
    expect(
      [...document.querySelectorAll('[data-walker]')]
        .map((walker) => walker.getAttribute('data-walker'))
        .sort(),
    ).toEqual(['a1', 'a2']);
  });

  it('without a lounge, a long rest is still at the pantry', async () => {
    render(
      officeWith(
        [
          occupant({
            id: 'a1',
            name: 'Ana',
            idleSince: new Date(Date.now() - 3_600_000).toISOString(),
          }),
        ],
        'compact',
      ),
    );
    await screen.findByRole('region', { name: /^Agentes no escritório/ });
    expect(entry('a1')?.getAttribute('data-place')).toBe('pantry');
  });

  it('shows an agent the layout has no desk for waiting at the reception', async () => {
    const data = officeWith([occupant({ id: 'a1', name: 'Ana' })]);
    render({
      ...data,
      layout: { ...data.layout, items: data.layout.items.filter((item) => item.kind !== 'desk') },
    });
    await screen.findByRole('region', { name: /^Agentes no escritório/ });
    expect(entry('a1')?.getAttribute('data-place')).toBe('lobby');
    expect(entry('a1')?.textContent).toContain('Sem mesa no layout');
  });

  it('shows an error when the office cannot be loaded', async () => {
    renderApp('/escritorio', {
      '/api/dashboard/summary': emptySummary,
      '/api/activity': { entries: [] },
      '/api/office': () => json(500, { code: 'internal_error', message: 'Erro interno.' }),
    });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Não foi possível carregar o escritório.');
  });

  const delegation = [
    occupant({
      id: 'a1',
      name: 'Coordenador',
      state: 'working',
      currentRun: run({ id: 'r1', conversationId: 'c1', prompt: 'Relatório' }),
      delegatingTo: ['a2'],
    }),
    occupant({
      id: 'a2',
      name: 'Revisor',
      state: 'working',
      currentRun: run({ id: 'r2', conversationId: 'c2', prompt: 'Revise' }),
    }),
  ];

  it('meets in the meeting room during a delegation (RF-09, RF-80)', async () => {
    render(officeWith(delegation));
    await screen.findByRole('region', { name: /^Agentes no escritório/ });
    expect(entry('a1')?.textContent).toContain('Pedi ajuda a Revisor e aguardo a resposta');
    expect(entry('a2')?.textContent).toContain('Tarefa de Coordenador: “Revise”');
    expect(entry('a1')?.getAttribute('data-place')).toBe('meeting');
    expect(entry('a2')?.getAttribute('data-place')).toBe('meeting');
    expect(entry('a1')?.textContent).toContain('Na sala de reunião');
    expect(document.querySelectorAll('[data-walker]')).toHaveLength(2);
  });

  it('visits the other desk when the office has no meeting room', async () => {
    render(officeWith(delegation, 'compact'));
    await screen.findByRole('region', { name: /^Agentes no escritório/ });
    expect(entry('a1')?.getAttribute('data-place')).toBe('visit:a2');
    expect(entry('a1')?.textContent).toContain('Na mesa de Revisor');
    expect(entry('a2')?.getAttribute('data-seated')).toBe('true');
    expect(document.querySelector('[data-walker="a1"]')).not.toBeNull();
    expect(document.querySelector('[data-walker="a2"]')).toBeNull();
  });

  it('lets a waiting agent be answered from the list (RF-09)', async () => {
    const view = renderApp('/escritorio', {
      '/api/dashboard/summary': emptySummary,
      '/api/activity': { entries: [] },
      '/api/office': officeWith([
        occupant({
          id: 'a1',
          name: 'Escritor',
          state: 'waiting',
          currentRun: run({
            id: 'r1',
            conversationId: 'c1',
            status: 'waiting_approval',
            prompt: 'Salve',
          }),
          pendingApproval: { id: 'ap1', toolTitle: 'Escrever arquivo' },
        }),
      ]),
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

    await screen.findByRole('region', { name: /^Agentes no escritório/ });
    expect(panel().getByText('Posso usar “Escrever arquivo”?')).toBeTruthy();
    // The bell counts what waits for the user.
    expect(await screen.findByRole('link', { name: 'Aprovações pendentes: 1' })).toBeTruthy();
    // The button is not inside the card's link, which opens the conversation.
    const button = panel().getByRole('button', { name: 'Decidir o pedido de Escritor' });
    expect(button.closest('a')).toBeNull();

    fireEvent.click(button);
    const dialog = within(screen.getByRole('dialog', { name: 'Decidir o pedido' }));
    expect(dialog.getByText('texto.md')).toBeTruthy();
    fireEvent.click(dialog.getByRole('button', { name: 'Negar' }));
    await waitFor(() =>
      expect(view.writes()).toEqual([
        { method: 'POST', url: '/api/approvals/ap1/decision', body: { decision: 'deny' } },
      ]),
    );
  });
});
