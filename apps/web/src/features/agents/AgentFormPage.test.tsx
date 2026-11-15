import type { ModelOption, Project } from '@ea/shared';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { json, makeAgent, renderApp } from '../../test/render';
import { parseForm, toFormValues } from './agent-form';

const project: Project = {
  id: 'p1',
  name: 'Pesquisa',
  description: '',
  agentCount: 0,
  createdAt: '2026-11-12T12:00:00.000Z',
  updatedAt: '2026-11-12T12:00:00.000Z',
};

const localModel: ModelOption = {
  id: 'm1',
  name: 'llama3',
  displayName: 'Llama 3',
  providerName: 'Ollama local',
  isExternal: false,
  supportsTools: true,
};
const cloudModel: ModelOption = {
  id: 'm2',
  name: 'gpt',
  displayName: 'GPT',
  providerName: 'OpenAI',
  isExternal: true,
  supportsTools: true,
};

const base = {
  '/api/agents': { agents: [] },
  '/api/projects': { projects: [project] },
  '/api/models': { models: [localModel, cloudModel] },
};

const field = (name: string | RegExp) => screen.findByRole('textbox', { name });
const type = async (name: string | RegExp, value: string) =>
  fireEvent.change(await field(name), { target: { value } });

describe('creating an agent', () => {
  it('needs only a name and sends the defaults for the rest', async () => {
    const { writes, router } = renderApp('/agentes/novo', {
      ...base,
      'POST /api/agents': () => json(201, makeAgent({ id: 'a1', name: 'Leitor' })),
    });
    await type('Nome', '  Leitor ');
    fireEvent.click(screen.getByRole('button', { name: 'Criar agente' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/agentes'));
    expect(await screen.findByText('Leitor criado.')).toBeTruthy();
    expect(writes()).toEqual([
      {
        method: 'POST',
        url: '/api/agents',
        body: {
          name: 'Leitor',
          description: '',
          objective: '',
          systemPrompt: '',
          projectId: null,
          modelId: null,
          temperature: 0.7,
          maxOutputTokens: 4096,
          maxSteps: 20,
          maxDurationSeconds: 300,
          maxTotalTokens: null,
          enabled: true,
        },
      },
    ]);
  });

  it('sends everything the user filled in', async () => {
    const { writes } = renderApp('/agentes/novo', {
      ...base,
      'POST /api/agents': () => json(201, makeAgent({ id: 'a1', name: 'Leitor' })),
    });
    await type('Nome', 'Leitor');
    await type('Descrição', 'Lê documentos');
    await type('Objetivo', 'Resumir');
    await type('Prompt de sistema', 'Seja breve.');
    fireEvent.change(screen.getByRole('combobox', { name: 'Projeto' }), {
      target: { value: 'p1' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Modelo de IA' }), {
      target: { value: 'm1' },
    });
    await type('Temperatura', '0,2');
    await type('Tokens por resposta', '800');
    await type('Passos por execução', '5');
    await type(/Tempo por execução/, '60');
    await type('Tokens por execução', '9000');
    fireEvent.click(screen.getByRole('switch', { name: 'Agente ativo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Criar agente' }));

    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]?.body).toEqual({
      name: 'Leitor',
      description: 'Lê documentos',
      objective: 'Resumir',
      systemPrompt: 'Seja breve.',
      projectId: 'p1',
      modelId: 'm1',
      temperature: 0.2,
      maxOutputTokens: 800,
      maxSteps: 5,
      maxDurationSeconds: 60,
      maxTotalTokens: 9000,
      enabled: false,
    });
  });

  it('points out invalid fields and sends nothing', async () => {
    const { writes } = renderApp('/agentes/novo', base);
    await type('Temperatura', '9');
    await type('Passos por execução', 'muitos');
    fireEvent.click(screen.getByRole('button', { name: 'Criar agente' }));

    expect(await screen.findByText('Informe o nome do agente.')).toBeTruthy();
    expect(screen.getByText('Temperatura: o máximo é 2.')).toBeTruthy();
    expect(screen.getByText('Passos por execução: informe um número.')).toBeTruthy();
    expect((await field('Nome')).getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('alert').textContent).toBe('Corrija os 3 campos destacados.');
    expect(writes()).toEqual([]);

    // Fixing a field clears its message.
    await type('Nome', 'Leitor');
    expect(screen.queryByText('Informe o nome do agente.')).toBeNull();
  });

  it('shows a name already in use on the name field', async () => {
    renderApp('/agentes/novo', {
      ...base,
      'POST /api/agents': () =>
        json(409, { code: 'name_taken', message: 'Já existe um agente com esse nome.' }),
    });
    await type('Nome', 'Leitor');
    fireEvent.click(screen.getByRole('button', { name: 'Criar agente' }));

    expect(await screen.findByText('Já existe um agente com esse nome.')).toBeTruthy();
    expect((await field('Nome')).getAttribute('aria-invalid')).toBe('true');
  });

  it('shows a failure that is not about a field next to the buttons', async () => {
    renderApp('/agentes/novo', {
      ...base,
      'POST /api/agents': () =>
        json(500, { code: 'internal_error', message: 'Erro interno do servidor.' }),
    });
    await type('Nome', 'Leitor');
    fireEvent.click(screen.getByRole('button', { name: 'Criar agente' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Erro interno do servidor.');
  });

  it('warns when the chosen model sends data to an external service (RF-44)', async () => {
    renderApp('/agentes/novo', base);
    const select = await screen.findByRole('combobox', { name: 'Modelo de IA' });
    expect(screen.queryByText(/serviço externo/)).toBeNull();

    fireEvent.change(select, { target: { value: 'm2' } });
    expect(screen.getByText(/OpenAI é um serviço externo/)).toBeTruthy();

    fireEvent.change(select, { target: { value: 'm1' } });
    expect(screen.queryByText(/serviço externo/)).toBeNull();
  });

  it('points to the models screen when there is no model to choose', async () => {
    renderApp('/agentes/novo', { ...base, '/api/models': { models: [] } });
    const select = await screen.findByRole('combobox', { name: 'Modelo de IA' });
    expect(select).toHaveProperty('disabled', true);
    expect(
      screen.getByRole('link', { name: 'Conectar um provedor de modelos' }).getAttribute('href'),
    ).toBe('/modelos');
  });
});

describe('editing an agent', () => {
  const agent = makeAgent({
    id: 'a1',
    name: 'Leitor',
    objective: 'Resumir',
    systemPrompt: 'Seja breve.',
    projectId: 'p1',
    projectName: 'Pesquisa',
    modelId: 'm1',
    modelName: 'Llama 3',
    temperature: 0.2,
    maxTotalTokens: 9000,
    state: 'failed',
  });

  it('opens with the saved values and the current state', async () => {
    renderApp('/agentes/a1', { ...base, '/api/agents/a1': agent });
    expect(await screen.findByRole('heading', { name: 'Leitor', level: 1 })).toBeTruthy();
    expect(screen.getByText('Com falha')).toBeTruthy();
    expect(await field('Nome')).toHaveProperty('value', 'Leitor');
    expect(await field('Prompt de sistema')).toHaveProperty('value', 'Seja breve.');
    expect(await field('Temperatura')).toHaveProperty('value', '0,2');
    expect(await field('Tokens por execução')).toHaveProperty('value', '9000');
    expect(screen.getByRole('combobox', { name: 'Projeto' })).toHaveProperty('value', 'p1');
    expect(screen.getByRole('combobox', { name: 'Modelo de IA' })).toHaveProperty('value', 'm1');
    expect(screen.getByRole('link', { name: 'Abrir as conversas' }).getAttribute('href')).toBe(
      '/agentes/a1/conversa',
    );
    expect(screen.getByRole('link', { name: 'Ver as execuções' }).getAttribute('href')).toBe(
      '/logs?agente=a1',
    );
  });

  it('saves the changes and returns to the list', async () => {
    const { writes, router } = renderApp('/agentes/a1', {
      ...base,
      '/api/agents/a1': agent,
      'PATCH /api/agents/a1': { ...agent, objective: 'Resumir em três linhas' },
    });
    await type('Objetivo', 'Resumir em três linhas');
    await type('Tokens por execução', '');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/agentes'));
    expect(await screen.findByText('Leitor salvo.')).toBeTruthy();
    expect(writes()).toMatchObject([
      {
        method: 'PATCH',
        url: '/api/agents/a1',
        body: { name: 'Leitor', objective: 'Resumir em três linhas', maxTotalTokens: null },
      },
    ]);
  });

  it('keeps showing a model that was disabled after being chosen', async () => {
    renderApp('/agentes/a1', {
      ...base,
      '/api/models': { models: [cloudModel] },
      '/api/agents/a1': agent,
    });
    const select = await screen.findByRole('combobox', { name: 'Modelo de IA' });
    expect(select).toHaveProperty('value', 'm1');
    expect(screen.getByRole('option', { name: 'Modelo atual (indisponível)' })).toBeTruthy();
  });

  it('explains when the agent does not exist', async () => {
    renderApp('/agentes/sumiu', {
      ...base,
      '/api/agents/sumiu': () =>
        json(404, { code: 'not_found', message: 'Agente não encontrado.' }),
    });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Não foi possível abrir este agente.');
    expect(alert.textContent).toContain('Agente não encontrado.');
    expect(screen.queryByRole('button', { name: 'Salvar alterações' })).toBeNull();
  });
});

describe('parseForm', () => {
  const values = toFormValues();

  it('accepts a decimal comma or point', () => {
    for (const temperature of ['0,5', '0.5', ' 0,5 ']) {
      const parsed = parseForm({ ...values, name: 'A', temperature });
      expect(parsed.ok && parsed.agent.temperature).toBe(0.5);
    }
  });

  it('treats an empty token limit as "no limit" but an empty required number as an error', () => {
    const noLimit = parseForm({ ...values, name: 'A', maxTotalTokens: '  ' });
    expect(noLimit.ok && noLimit.agent.maxTotalTokens).toBeNull();

    const missing = parseForm({ ...values, name: 'A', maxSteps: '' });
    expect(missing).toEqual({
      ok: false,
      errors: { maxSteps: 'Passos por execução: informe um número.' },
    });
  });

  it('round-trips an existing agent without changing it', () => {
    const agent = makeAgent({ id: 'a1', name: 'Leitor', temperature: 1.25, maxTotalTokens: 500 });
    const parsed = parseForm(toFormValues(agent));
    expect(parsed.ok && parsed.agent).toMatchObject({
      name: 'Leitor',
      temperature: 1.25,
      maxTotalTokens: 500,
      maxSteps: 20,
    });
  });
});
