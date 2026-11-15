import type { Provider, ProviderModel } from '@ea/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { json, noContent, renderApp } from '../../test/render';

const ollama: Provider = {
  id: 'p1',
  name: 'Ollama local',
  kind: 'ollama',
  baseUrl: 'http://127.0.0.1:11434',
  command: null,
  isExternal: false,
  hasApiKey: false,
  apiKeyHint: null,
  modelCount: 2,
  enabledModelCount: 1,
  agentCount: 1,
  createdAt: '2026-11-12T12:00:00.000Z',
  updatedAt: '2026-11-12T12:00:00.000Z',
};

const openai: Provider = {
  ...ollama,
  id: 'p2',
  name: 'OpenAI',
  kind: 'openai_compatible',
  baseUrl: 'https://api.openai.com/v1',
  isExternal: true,
  hasApiKey: true,
  apiKeyHint: '…cdef',
  modelCount: 0,
  enabledModelCount: 0,
  agentCount: 0,
};

const harness: Provider = {
  ...ollama,
  id: 'p3',
  name: 'Claude Code',
  kind: 'claude_code',
  baseUrl: null,
  command: 'claude',
  isExternal: true,
  modelCount: 1,
  enabledModelCount: 0,
  agentCount: 0,
};

const llama: ProviderModel = {
  id: 'm1',
  providerId: 'p1',
  name: 'llama3.2:3b',
  displayName: 'llama3.2:3b',
  supportsTools: true,
  enabled: true,
  agentCount: 1,
};
const phi: ProviderModel = {
  ...llama,
  id: 'm2',
  name: 'phi:latest',
  displayName: 'phi:latest',
  supportsTools: false,
  enabled: false,
  agentCount: 0,
};

const api = (providers: Provider[] = [ollama, openai]) => ({
  '/api/providers': { providers },
  '/api/providers/p1/models': { models: [llama, phi] },
  '/api/providers/p2/models': { models: [] },
});

const card = async (name: string) => within(await screen.findByRole('region', { name }));

describe('provider list', () => {
  it('invites the user to connect the first provider', async () => {
    renderApp('/modelos', api([]));
    expect(await screen.findByText('Nenhum provedor conectado.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Adicionar o primeiro provedor' })).toBeTruthy();
  });

  it('shows each provider with its address, key status and use', async () => {
    renderApp('/modelos', api());
    const local = await card('Ollama local');
    expect(local.getByText('neste computador')).toBeTruthy();
    expect(local.getByText('http://127.0.0.1:11434')).toBeTruthy();
    expect(local.getByText('Não usa')).toBeTruthy();
    expect(local.getByText('1 agente')).toBeTruthy();
    expect(local.getByText('1 de 2 habilitados')).toBeTruthy();
    expect(local.queryByText(/fica fora deste computador/)).toBeNull();

    const cloud = await card('OpenAI');
    expect(cloud.getByText('externo')).toBeTruthy();
    expect(cloud.getByText('Guardada no cofre do sistema (…cdef)')).toBeTruthy();
    expect(cloud.getByText('Nenhum agente usa este provedor')).toBeTruthy();
    expect(cloud.getByText('Nenhum modelo carregado.')).toBeTruthy();
  });

  it('says what is sent to an external provider, and only there (RF-44)', async () => {
    renderApp('/modelos', api());
    const cloud = await card('OpenAI');
    const notice = cloud.getByText(/fica fora deste computador/);
    expect(notice.textContent).toContain('prompt de sistema');
    expect(notice.textContent).toContain('histórico da conversa');
    expect(notice.textContent).toContain('resultados das ferramentas');
  });

  it('lists the models with tool support, use and an on/off switch', async () => {
    renderApp('/modelos', api());
    const local = await card('Ollama local');
    const rows = within(
      await local.findByRole('list', { name: 'Modelos de Ollama local' }),
    ).getAllByRole('listitem');
    expect(rows[0]?.textContent).toContain('Aceita ferramentas, usado por 1 agente');
    expect(rows[1]?.textContent).toContain('Só conversa');
    expect(
      local.getByRole('switch', { name: 'llama3.2:3b habilitado' }).getAttribute('aria-checked'),
    ).toBe('true');
    expect(
      local.getByRole('switch', { name: 'phi:latest habilitado' }).getAttribute('aria-checked'),
    ).toBe('false');
  });
});

describe('provider actions', () => {
  it('tests the connection and shows the result', async () => {
    const { writes } = renderApp('/modelos', {
      ...api(),
      'POST /api/providers/p1/test': {
        ok: true,
        message: 'Conexão bem-sucedida: Ollama 0.40.16.',
        latencyMs: 12,
      },
    });
    const local = await card('Ollama local');
    fireEvent.click(local.getByRole('button', { name: 'Testar conexão' }));
    const result = (await local.findByText(/Conexão bem-sucedida/)).closest('p');
    expect(result?.getAttribute('role')).toBe('status');
    expect(result?.textContent).toBe('Conexão bem-sucedida: Ollama 0.40.16. Respondeu em 12 ms.');
    expect(writes()).toMatchObject([{ method: 'POST', url: '/api/providers/p1/test' }]);
  });

  it('shows why a connection test failed', async () => {
    renderApp('/modelos', {
      ...api(),
      'POST /api/providers/p2/test': {
        ok: false,
        message: 'O provedor recusou a credencial. Verifique a chave de API.',
        latencyMs: 80,
      },
    });
    const cloud = await card('OpenAI');
    fireEvent.click(cloud.getByRole('button', { name: 'Testar conexão' }));
    const result = (await cloud.findByText(/recusou a credencial/)).closest('p');
    expect(result?.textContent).toBe('O provedor recusou a credencial. Verifique a chave de API.');
  });

  it('refreshes the model list and reports what changed', async () => {
    renderApp('/modelos', {
      ...api(),
      'POST /api/providers/p1/models/sync': { models: [llama, phi], added: 1, removed: 0 },
    });
    const local = await card('Ollama local');
    fireEvent.click(local.getByRole('button', { name: 'Atualizar modelos' }));
    expect(await screen.findByText('Modelos atualizados: 2 modelos (1 novo).')).toBeTruthy();
  });

  it('shows the provider failure when the list cannot be refreshed', async () => {
    renderApp('/modelos', {
      ...api(),
      'POST /api/providers/p1/models/sync': () =>
        json(502, { code: 'provider_error', message: 'O provedor não respondeu a tempo.' }),
    });
    const local = await card('Ollama local');
    fireEvent.click(local.getByRole('button', { name: 'Atualizar modelos' }));
    expect(await screen.findByText('O provedor não respondeu a tempo.')).toBeTruthy();
  });

  it('enables a model with its switch', async () => {
    const { writes } = renderApp('/modelos', {
      ...api(),
      'PATCH /api/models/m2': { ...phi, enabled: true },
    });
    const local = await card('Ollama local');
    fireEvent.click(await local.findByRole('switch', { name: 'phi:latest habilitado' }));
    expect(await screen.findByText('phi:latest habilitado.')).toBeTruthy();
    expect(writes()).toEqual([{ method: 'PATCH', url: '/api/models/m2', body: { enabled: true } }]);
  });

  it('explains why a model in use cannot be disabled', async () => {
    renderApp('/modelos', {
      ...api(),
      'PATCH /api/models/m1': () =>
        json(409, { code: 'model_in_use', message: 'Este modelo é usado por 1 agente.' }),
    });
    const local = await card('Ollama local');
    fireEvent.click(await local.findByRole('switch', { name: 'llama3.2:3b habilitado' }));
    expect(await screen.findByText('Este modelo é usado por 1 agente.')).toBeTruthy();
  });

  it('asks before deleting and says the key is erased too', async () => {
    const { writes } = renderApp('/modelos', {
      ...api(),
      'DELETE /api/providers/p2': () => noContent(),
    });
    const cloud = await card('OpenAI');
    fireEvent.click(cloud.getByRole('button', { name: 'Excluir OpenAI' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Excluir OpenAI?' }));
    expect(dialog.getByText(/chave de API é apagada do cofre/)).toBeTruthy();
    expect(writes()).toEqual([]);

    fireEvent.click(dialog.getByRole('button', { name: 'Excluir provedor' }));
    expect(await screen.findByText('OpenAI excluído.')).toBeTruthy();
    expect(writes()).toMatchObject([{ method: 'DELETE', url: '/api/providers/p2' }]);
  });

  it('keeps the dialog open when the provider is in use', async () => {
    renderApp('/modelos', {
      ...api(),
      'DELETE /api/providers/p1': () =>
        json(409, { code: 'provider_in_use', message: 'Este provedor é usado por 1 agente.' }),
    });
    const local = await card('Ollama local');
    fireEvent.click(local.getByRole('button', { name: 'Excluir Ollama local' }));
    fireEvent.click(screen.getByRole('button', { name: 'Excluir provedor' }));
    const dialog = within(await screen.findByRole('dialog'));
    expect((await dialog.findByRole('alert')).textContent).toBe(
      'Este provedor é usado por 1 agente.',
    );
  });
});

describe('adding a provider', () => {
  const open = async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'Adicionar provedor' }));
    return within(screen.getByRole('dialog', { name: 'Adicionar provedor' }));
  };

  it('starts with a local Ollama, which needs no key and sends nothing outside', async () => {
    const { writes } = renderApp('/modelos', {
      ...api([]),
      'POST /api/providers': () => json(201, ollama),
      'POST /api/providers/p1/models/sync': { models: [llama], added: 1, removed: 0 },
    });
    const dialog = await open();
    expect(dialog.getByRole('textbox', { name: 'Nome' })).toHaveProperty('value', 'Ollama local');
    expect(dialog.getByRole('textbox', { name: 'Endereço' })).toHaveProperty(
      'value',
      'http://127.0.0.1:11434',
    );
    expect(dialog.queryByLabelText('Chave de API')).toBeNull();
    expect(dialog.queryByText(/fica fora deste computador/)).toBeNull();

    fireEvent.click(dialog.getByRole('button', { name: 'Adicionar provedor' }));
    expect(await screen.findByText('Ollama local adicionado. Buscando os modelos…')).toBeTruthy();
    // The models are fetched right after, without another click.
    await waitFor(() =>
      expect(writes()).toMatchObject([
        {
          method: 'POST',
          url: '/api/providers',
          body: { name: 'Ollama local', kind: 'ollama', baseUrl: 'http://127.0.0.1:11434' },
        },
        { method: 'POST', url: '/api/providers/p1/models/sync' },
      ]),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('fills in the usual address of each kind and warns about external ones', async () => {
    renderApp('/modelos', api([]));
    const dialog = await open();
    fireEvent.change(dialog.getByRole('combobox', { name: 'Tipo' }), {
      target: { value: 'anthropic' },
    });
    expect(dialog.getByRole('textbox', { name: 'Endereço' })).toHaveProperty(
      'value',
      'https://api.anthropic.com',
    );
    expect(dialog.getByText(/fica fora deste computador/)).toBeTruthy();
    expect(dialog.getByLabelText('Chave de API').getAttribute('type')).toBe('password');

    // The warning follows the address, not the kind.
    fireEvent.change(dialog.getByRole('textbox', { name: 'Endereço' }), {
      target: { value: 'http://localhost:8080' },
    });
    expect(dialog.queryByText(/fica fora deste computador/)).toBeNull();
  });

  it('requires the key where the provider requires one, and sends nothing without it', async () => {
    const { writes } = renderApp('/modelos', api([]));
    const dialog = await open();
    fireEvent.change(dialog.getByRole('combobox', { name: 'Tipo' }), {
      target: { value: 'anthropic' },
    });
    fireEvent.click(dialog.getByRole('button', { name: 'Adicionar provedor' }));
    expect(await dialog.findByText('Anthropic exige uma chave de API.')).toBeTruthy();
    expect(writes()).toEqual([]);
  });

  it('sends the typed key once and never shows it again', async () => {
    const { writes } = renderApp('/modelos', {
      ...api([]),
      'POST /api/providers': () => json(201, openai),
      'POST /api/providers/p2/models/sync': { models: [], added: 0, removed: 0 },
    });
    const dialog = await open();
    fireEvent.change(dialog.getByRole('combobox', { name: 'Tipo' }), {
      target: { value: 'openai_compatible' },
    });
    fireEvent.change(dialog.getByLabelText('Chave de API'), {
      target: { value: '  sk-typed-key-123456  ' },
    });
    fireEvent.click(dialog.getByRole('button', { name: 'Adicionar provedor' }));

    await waitFor(() => expect(writes().length).toBeGreaterThan(0));
    expect(writes()[0]?.body).toEqual({
      name: 'OpenAI',
      kind: 'openai_compatible',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-typed-key-123456',
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.body.textContent).not.toContain('sk-typed-key');
  });

  it('points out an invalid address', async () => {
    const { writes } = renderApp('/modelos', api([]));
    const dialog = await open();
    fireEvent.change(dialog.getByRole('textbox', { name: 'Endereço' }), {
      target: { value: 'ollama' },
    });
    fireEvent.click(dialog.getByRole('button', { name: 'Adicionar provedor' }));
    expect(
      await dialog.findByText('Informe um endereço completo, como http://127.0.0.1:11434.'),
    ).toBeTruthy();
    expect(writes()).toEqual([]);
  });
});

describe('editing a provider', () => {
  const open = async (name: string) => {
    fireEvent.click((await card(name)).getByRole('button', { name: `Editar ${name}` }));
    return within(screen.getByRole('dialog', { name: 'Editar provedor' }));
  };

  it('keeps the stored key unless a new one is typed', async () => {
    const { writes } = renderApp('/modelos', {
      ...api(),
      'PATCH /api/providers/p2': { ...openai, name: 'OpenAI pessoal' },
    });
    const dialog = await open('OpenAI');
    expect(dialog.queryByRole('combobox', { name: 'Tipo' })).toBeNull();
    expect(dialog.getByLabelText('Chave de API')).toHaveProperty('value', '');
    expect(dialog.getByText('Deixe vazio para manter a chave atual (…cdef).')).toBeTruthy();

    fireEvent.change(dialog.getByRole('textbox', { name: 'Nome' }), {
      target: { value: 'OpenAI pessoal' },
    });
    fireEvent.click(dialog.getByRole('button', { name: 'Salvar provedor' }));
    expect(await screen.findByText('OpenAI pessoal salvo.')).toBeTruthy();
    expect(writes()).toEqual([
      {
        method: 'PATCH',
        url: '/api/providers/p2',
        body: { name: 'OpenAI pessoal', baseUrl: 'https://api.openai.com/v1' },
      },
    ]);
  });

  it('replaces the key when one is typed and removes it when asked', async () => {
    const { writes } = renderApp('/modelos', { ...api(), 'PATCH /api/providers/p2': openai });
    let dialog = await open('OpenAI');
    fireEvent.change(dialog.getByLabelText('Chave de API'), {
      target: { value: 'sk-new-key-654321' },
    });
    fireEvent.click(dialog.getByRole('button', { name: 'Salvar provedor' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]?.body).toMatchObject({ apiKey: 'sk-new-key-654321' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    dialog = await open('OpenAI');
    fireEvent.click(dialog.getByRole('checkbox', { name: 'Remover a chave guardada' }));
    fireEvent.click(dialog.getByRole('button', { name: 'Salvar provedor' }));
    await waitFor(() => expect(writes()).toHaveLength(2));
    expect(writes()[1]?.body).toMatchObject({ apiKey: null });
  });
  describe('tool support marked by hand', () => {
    const gpt: ProviderModel = {
      ...phi,
      id: 'm9',
      providerId: 'p2',
      name: 'gpt-local',
      displayName: 'gpt-local',
    };

    it('offers the marking only where the provider cannot tell', async () => {
      const view = renderApp('/modelos', {
        ...api(),
        '/api/providers/p2/models': { models: [gpt] },
        'PATCH /api/models/m9': () => json(200, { ...gpt, supportsTools: true }),
      });

      const toggle = await screen.findByRole('switch', { name: 'gpt-local aceita ferramentas' });
      expect(toggle.getAttribute('aria-checked')).toBe('false');
      expect(
        (await card('Ollama local')).queryByRole('switch', { name: /aceita ferramentas/ }),
      ).toBeNull();

      fireEvent.click(toggle);
      await waitFor(() =>
        expect(view.writes()).toEqual([
          { method: 'PATCH', url: '/api/models/m9', body: { supportsTools: true } },
        ]),
      );
    });
  });
});

describe('harness providers (Fase 12)', () => {
  const harnessApi = {
    '/api/providers': { providers: [harness] },
    '/api/providers/p3/models': {
      models: [
        {
          id: 'm3',
          providerId: 'p3',
          name: 'default',
          displayName: 'Padrão da conta',
          supportsTools: true,
          enabled: false,
          agentCount: 0,
        },
      ],
    },
  };

  it('shows the command instead of an address, and says what the harness sends', async () => {
    renderApp('/modelos', harnessApi);
    const cc = await card('Claude Code');
    expect(cc.getByText('Comando')).toBeTruthy();
    expect(cc.getByText('claude')).toBeTruthy();
    expect(cc.queryByText('Endereço')).toBeNull();
    expect(cc.getByText('Não usa')).toBeTruthy();

    const notice = cc.getByText(/responde pelo serviço dele/);
    expect(notice.textContent).toContain('prompt de sistema');
    expect(notice.textContent).toContain('histórico da conversa');
    // Harness agents use the platform tools, so their results go there too (Fase 13).
    expect(notice.textContent).toContain('resultados das ferramentas');
  });

  it('shows tool support without a hand marking on a harness model', async () => {
    renderApp('/modelos', harnessApi);
    const cc = await card('Claude Code');
    expect(await cc.findByText('Aceita ferramentas')).toBeTruthy();
    expect(cc.queryByRole('switch', { name: /aceita ferramentas/ })).toBeNull();
  });

  it('asks for the program, no key, and says how tools work there', async () => {
    const { writes } = renderApp('/modelos', {
      '/api/providers': { providers: [] },
      'POST /api/providers': () => json(201, harness),
      'POST /api/providers/p3/models/sync': { models: [], added: 1, removed: 0 },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Adicionar provedor' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Adicionar provedor' }));

    fireEvent.change(dialog.getByRole('combobox', { name: 'Tipo' }), {
      target: { value: 'claude_code' },
    });
    expect(dialog.getByRole('textbox', { name: 'Nome' })).toHaveProperty('value', 'Claude Code');
    expect(dialog.getByRole('textbox', { name: 'Comando' })).toHaveProperty('value', 'claude');
    expect(dialog.queryByRole('textbox', { name: 'Endereço' })).toBeNull();
    expect(dialog.queryByLabelText('Chave de API')).toBeNull();
    expect(dialog.getByText(/ferramentas da plataforma conforme as permissões/)).toBeTruthy();
    expect(dialog.queryByText(/planejado para a Fase/)).toBeNull();
    expect(dialog.getByText(/responde pelo serviço dele/)).toBeTruthy();

    fireEvent.click(dialog.getByRole('button', { name: 'Adicionar provedor' }));
    await waitFor(() => expect(writes().length).toBeGreaterThan(0));
    expect(writes()[0]?.body).toEqual({
      name: 'Claude Code',
      kind: 'claude_code',
      command: 'claude',
    });
  });

  it('points out a command with arguments in it', async () => {
    const { writes } = renderApp('/modelos', { '/api/providers': { providers: [] } });
    fireEvent.click(await screen.findByRole('button', { name: 'Adicionar provedor' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Adicionar provedor' }));
    fireEvent.change(dialog.getByRole('combobox', { name: 'Tipo' }), {
      target: { value: 'codex' },
    });
    fireEvent.change(dialog.getByRole('textbox', { name: 'Comando' }), {
      target: { value: 'codex --dangerously-bypass-approvals' },
    });
    fireEvent.click(dialog.getByRole('button', { name: 'Adicionar provedor' }));
    expect(await dialog.findByText('Informe apenas o programa, sem argumentos.')).toBeTruthy();
    expect(writes()).toEqual([]);
  });

  it('edits the command of a harness already connected', async () => {
    const { writes } = renderApp('/modelos', {
      ...harnessApi,
      'PATCH /api/providers/p3': { ...harness, command: 'claude.exe' },
    });
    fireEvent.click(
      (await card('Claude Code')).getByRole('button', { name: 'Editar Claude Code' }),
    );
    const dialog = within(screen.getByRole('dialog', { name: 'Editar provedor' }));
    fireEvent.change(dialog.getByRole('textbox', { name: 'Comando' }), {
      target: { value: 'claude.exe' },
    });
    fireEvent.click(dialog.getByRole('button', { name: 'Salvar provedor' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual({
      method: 'PATCH',
      url: '/api/providers/p3',
      body: { name: 'Claude Code', command: 'claude.exe' },
    });
  });
});
