import type { Office } from '@ea/shared';
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { emptySummary, json, renderApp } from '../../test/render';

const office: Office = {
  rooms: [
    {
      id: 'p1',
      name: 'Atendimento',
      description: 'Responde clientes',
      agents: [
        { id: 'a1', name: 'Triagem', objective: '', state: 'working' },
        { id: 'a2', name: 'Respostas', objective: '', state: 'waiting' },
      ],
    },
    { id: 'p2', name: 'Arquivo', description: '', agents: [] },
    {
      id: null,
      name: 'Sem projeto',
      description: '',
      agents: [{ id: 'a3', name: 'Rascunho', objective: '', state: 'inactive' }],
    },
  ],
};

const room = (name: string) => within(screen.getByRole('region', { name }));

describe('OfficePage', () => {
  it('draws one room per project with its agents and their states', async () => {
    renderApp('/escritorio', { '/api/dashboard/summary': emptySummary, '/api/office': office });

    await screen.findByRole('region', { name: 'Atendimento' });
    const desks = room('Atendimento').getAllByRole('listitem');
    expect(desks.map((desk) => desk.textContent)).toEqual([
      'TriagemTrabalhando',
      'RespostasAguardando você',
    ]);
    expect(room('Atendimento').getByText('Responde clientes')).toBeTruthy();

    expect(room('Arquivo').getByText('Sala vazia.')).toBeTruthy();
    expect(room('Arquivo').getByText('0 agentes')).toBeTruthy();
    expect(room('Sem projeto').getByText('Inativo')).toBeTruthy();
    expect(room('Sem projeto').getByText('1 agente')).toBeTruthy();
  });

  it('explains every state colour in a legend', async () => {
    renderApp('/escritorio', { '/api/dashboard/summary': emptySummary, '/api/office': office });
    const legend = within(await screen.findByRole('list', { name: 'Legenda dos estados' }));
    expect(legend.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Aguardando você',
      'Com falha',
      'Trabalhando',
      'Ocioso',
      'Inativo',
    ]);
  });

  it('gives the same agent the same face every time', async () => {
    renderApp('/escritorio', {
      '/api/dashboard/summary': emptySummary,
      '/api/office': {
        rooms: [
          {
            id: 'p1',
            name: 'Sala',
            description: '',
            agents: [
              { id: 'same', name: 'Um', objective: '', state: 'idle' },
              { id: 'same', name: 'Dois', objective: '', state: 'idle' },
              { id: 'other-agent', name: 'Três', objective: '', state: 'idle' },
            ],
          },
        ],
      } satisfies Office,
    });
    const sala = await screen.findByRole('region', { name: 'Sala' });
    const faces = [...sala.querySelectorAll('li svg')].map((svg) => svg.innerHTML);
    expect(faces).toHaveLength(3);
    expect(faces[0]).toBe(faces[1]);
    expect(faces[0]).not.toBe(faces[2]);
  });

  it('explains an empty office and what will fill it', async () => {
    renderApp('/escritorio', {
      '/api/dashboard/summary': emptySummary,
      '/api/office': { rooms: [] },
    });
    expect(await screen.findByText('O escritório ainda está vazio.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Criar o primeiro agente' }).getAttribute('href')).toBe(
      '/agentes/novo',
    );
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('shows an error when the office cannot be loaded', async () => {
    renderApp('/escritorio', {
      '/api/dashboard/summary': emptySummary,
      '/api/office': () => json(500, { code: 'internal_error', message: 'Erro interno.' }),
    });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Não foi possível carregar o escritório.');
  });
});
