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
    currentRun: { id: 'r2', conversationId: null, status: 'queued', prompt: null },
  }),
  occupant({ id: 'a4', name: 'Leitor', state: 'failed', lastError: 'O provedor não respondeu.' }),
  occupant({ id: 'a3', name: 'Rascunho', state: 'inactive', projectId: null }),
  occupant({ id: 'a2', name: 'Respostas', state: 'waiting' }),
  occupant({
    id: 'a1',
    name: 'Triagem',
    state: 'working',
    currentRun: { id: 'r1', conversationId: 'c1', status: 'running', prompt: 'Pedido 42' },
  }),
]);

const panel = () => within(screen.getByRole('region', { name: /^Agentes no escritório/ }));
const entry = (id: string) => document.querySelector(`[data-agent="${id}"]`);

const render = (data: Office = office) =>
  renderApp('/escritorio', { '/api/dashboard/summary': emptySummary, '/api/office': data });

describe('OfficePage', () => {
  it('lists every agent with its state, where it is and what it is doing (RF-07, RF-08)', async () => {
    render();
    await screen.findByRole('region', { name: 'Agentes no escritório (5)' });
    expect(
      panel()
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      'CalmoOciosoNa mesa, em Sem projeto',
      'FilaTrabalhandoNa mesa, em AtendimentoNa fila, já começo…',
      'LeitorCom falhaNa mesa, em AtendimentoO provedor não respondeu.',
      'RascunhoInativoFora do escritório',
      'RespostasAguardando vocêNa mesa, em AtendimentoPreciso da sua aprovação',
      'TriagemTrabalhandoNa mesa, em AtendimentoRespondendo: “Pedido 42”',
    ]);
  });

  it('opens the conversation of an agent from the list', async () => {
    render();
    await screen.findByRole('region', { name: /^Agentes no escritório/ });
    const links = [...document.querySelectorAll('[data-agent] > a')].map((link) =>
      link.getAttribute('href'),
    );
    // An agent in the middle of a run opens that conversation; the others, a new one.
    expect(links).toEqual([
      '/agentes/a6/conversa',
      '/agentes/a5/conversa',
      '/agentes/a4/conversa',
      '/agentes/a3/conversa',
      '/agentes/a2/conversa',
      '/agentes/a1/conversa/c1',
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
    expect(sitter('a1')?.querySelector('.desk-type-a')).not.toBeNull();
    expect(sitter('a2')?.querySelector('.desk-wave')).not.toBeNull();
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
      currentRun: { id: 'r1', conversationId: 'c1', status: 'running', prompt: 'Relatório' },
      delegatingTo: ['a2'],
    }),
    occupant({
      id: 'a2',
      name: 'Revisor',
      state: 'working',
      currentRun: { id: 'r2', conversationId: 'c2', status: 'running', prompt: 'Revise' },
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
      '/api/office': officeWith([
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
    // The button is not inside the link that opens the conversation.
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
