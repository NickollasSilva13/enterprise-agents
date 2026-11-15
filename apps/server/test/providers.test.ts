import {
  agentSchema,
  apiErrorSchema,
  connectionTestSchema,
  dashboardSummarySchema,
  modelListSchema,
  modelSyncResultSchema,
  type Provider,
  providerListSchema,
  providerModelListSchema,
  providerSchema,
} from '@ea/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { auditLog, models, providers } from '../src/db/schema';
import { recordAudit } from '../src/modules/audit/service';
import { redactSecrets, secretHint } from '../src/security/redact';
import { KeyringSecretStore, MemorySecretStore } from '../src/security/secret-store';
import { type ModelProvider, ProviderError, type ProviderSettings } from '../src/providers/types';
import { makeApp, type TestApp } from './helpers';
import { anthropicStub, ollamaStub, openAiStub, type StubServer, unusedUrl } from './stub-servers';

const KEY = 'sk-test-0123456789abcdef';

let t: TestApp;
const stubs: StubServer[] = [];
const warnings: { context: Record<string, unknown>; message: string }[] = [];

beforeEach(async () => {
  warnings.length = 0;
  t = await makeApp({
    configure: (app) => {
      // Capture what would be logged, to prove no credential reaches the log.
      app.log.warn = ((context: Record<string, unknown>, message: string) => {
        warnings.push({ context, message });
      }) as typeof app.log.warn;
    },
  });
});
afterEach(async () => {
  await t.close();
  await Promise.all(stubs.splice(0).map((stub) => stub.close()));
});

const track = async (stub: Promise<StubServer>) => {
  const started = await stub;
  stubs.push(started);
  return started;
};

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';
async function call(method: Method, url: string, payload?: unknown) {
  const response = await t.app.inject({
    method,
    url,
    headers: t.trusted,
    ...(payload === undefined ? {} : { payload: payload as object }),
  });
  return {
    status: response.statusCode,
    body: response.body ? response.json<unknown>() : null,
    raw: response.body,
  };
}

async function addProvider(input: Record<string, unknown>): Promise<Provider> {
  const { status, body } = await call('POST', '/api/providers', input);
  expect(status, JSON.stringify(body)).toBe(201);
  return providerSchema.parse(body);
}

const addOllama = async (stub: StubServer) =>
  addProvider({ name: 'Ollama local', kind: 'ollama', baseUrl: stub.url });

const errorOf = (body: unknown) => apiErrorSchema.parse(body);
const fieldsOf = (body: unknown) =>
  (errorOf(body).details as { path: string }[]).map((detail) => detail.path);
const auditActions = () =>
  t.database.db
    .select()
    .from(auditLog)
    .all()
    .map((row) => row.action);

describe('adding providers (RF-40, RF-44)', () => {
  it('adds a local provider without a key and marks it as not external', async () => {
    const provider = await addProvider({
      name: 'Ollama local',
      kind: 'ollama',
      baseUrl: 'http://127.0.0.1:11434/',
    });
    expect(provider).toMatchObject({
      name: 'Ollama local',
      kind: 'ollama',
      baseUrl: 'http://127.0.0.1:11434',
      isExternal: false,
      hasApiKey: false,
      apiKeyHint: null,
      modelCount: 0,
      agentCount: 0,
    });
    expect(providerListSchema.parse((await call('GET', '/api/providers')).body).providers).toEqual([
      provider,
    ]);
  });

  it.each([
    ['http://localhost:1234/v1', false],
    ['http://127.0.0.1:1234/v1', false],
    ['http://[::1]:1234/v1', false],
    ['https://api.openai.com/v1', true],
    ['http://192.168.0.20:11434', true],
    ['http://localhost.evil.example/v1', true],
  ])('classifies %s as external=%s', async (baseUrl, isExternal) => {
    const provider = await addProvider({ name: 'P', kind: 'openai_compatible', baseUrl });
    expect(provider.isExternal).toBe(isExternal);
  });

  it.each([
    ['a missing name', { kind: 'ollama', baseUrl: 'http://127.0.0.1:1' }, 'name'],
    ['an unknown kind', { name: 'P', kind: 'gemini', baseUrl: 'http://127.0.0.1:1' }, 'kind'],
    ['text that is not an address', { name: 'P', kind: 'ollama', baseUrl: 'ollama' }, 'baseUrl'],
    ['a file address', { name: 'P', kind: 'ollama', baseUrl: 'file:///etc/passwd' }, 'baseUrl'],
    [
      'credentials inside the address',
      { name: 'P', kind: 'ollama', baseUrl: 'http://user:pass@127.0.0.1:1' },
      'baseUrl',
    ],
    [
      'a query string',
      { name: 'P', kind: 'ollama', baseUrl: 'http://127.0.0.1:1/?key=abc' },
      'baseUrl',
    ],
    [
      'a key for a provider that takes none',
      { name: 'P', kind: 'ollama', baseUrl: 'http://127.0.0.1:1', apiKey: KEY },
      'apiKey',
    ],
    [
      'no key for a provider that requires one',
      { name: 'P', kind: 'anthropic', baseUrl: 'https://api.anthropic.com' },
      'apiKey',
    ],
  ])('rejects %s', async (_label, input, field) => {
    const { status, body } = await call('POST', '/api/providers', input);
    expect(status).toBe(400);
    expect(fieldsOf(body)).toContain(field);
    expect(t.database.db.select().from(providers).all()).toEqual([]);
  });

  it('rejects a duplicate name', async () => {
    await addProvider({ name: 'Local', kind: 'ollama', baseUrl: 'http://127.0.0.1:1' });
    const { status, body } = await call('POST', '/api/providers', {
      name: 'LOCAL',
      kind: 'ollama',
      baseUrl: 'http://127.0.0.1:2',
    });
    expect(status).toBe(409);
    expect(errorOf(body).code).toBe('name_taken');
  });
});

describe('API keys (RF-41, C-08, C-09, RN-11)', () => {
  it('keeps the key in the vault only: not in the database, not in any response', async () => {
    const created = await call('POST', '/api/providers', {
      name: 'OpenAI',
      kind: 'openai_compatible',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: KEY,
    });
    const provider = providerSchema.parse(created.body);
    expect(provider).toMatchObject({ hasApiKey: true, apiKeyHint: '…cdef', isExternal: true });

    // The vault has it, under a reference; the database has only the reference.
    const row = t.database.db.select().from(providers).get();
    expect(row?.secretRef).toBe(`provider:${provider.id}`);
    expect(t.secrets.get(`provider:${provider.id}`)).toBe(KEY);

    const everyResponse = [
      created.raw,
      (await call('GET', '/api/providers')).raw,
      (await call('PATCH', `/api/providers/${provider.id}`, { name: 'OpenAI 2' })).raw,
      (await call('GET', '/api/models')).raw,
      (await call('GET', '/api/dashboard/summary')).raw,
    ].join('\n');
    expect(everyResponse).not.toContain(KEY);
    expect(everyResponse).not.toContain(KEY.slice(0, 12));

    const dump = t.database.sqlite.serialize().toString('latin1');
    expect(dump).not.toContain(KEY);
    expect(dump).not.toContain(KEY.slice(0, 12));
  });

  it('replaces and removes a key, and never returns it', async () => {
    const provider = await addProvider({
      name: 'LM Studio',
      kind: 'openai_compatible',
      baseUrl: 'http://127.0.0.1:1234/v1',
      apiKey: KEY,
    });
    const ref = `provider:${provider.id}`;

    const replaced = await call('PATCH', `/api/providers/${provider.id}`, {
      apiKey: 'another-key-9876543210',
    });
    expect(providerSchema.parse(replaced.body).apiKeyHint).toBe('…3210');
    expect(t.secrets.get(ref)).toBe('another-key-9876543210');
    expect(replaced.raw).not.toContain('another-key');

    // Editing something else leaves the key alone.
    await call('PATCH', `/api/providers/${provider.id}`, { name: 'Renamed' });
    expect(t.secrets.get(ref)).toBe('another-key-9876543210');

    const removed = await call('PATCH', `/api/providers/${provider.id}`, { apiKey: null });
    expect(providerSchema.parse(removed.body)).toMatchObject({
      hasApiKey: false,
      apiKeyHint: null,
    });
    expect(t.secrets.get(ref)).toBeNull();
    expect(t.database.db.select().from(providers).get()?.secretRef).toBeNull();
  });

  it('does not let a required key be removed', async () => {
    const provider = await addProvider({
      name: 'Anthropic',
      kind: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
      apiKey: KEY,
    });
    const { status, body } = await call('PATCH', `/api/providers/${provider.id}`, {
      apiKey: null,
    });
    expect(status).toBe(400);
    expect(fieldsOf(body)).toEqual(['apiKey']);
    expect(t.secrets.get(`provider:${provider.id}`)).toBe(KEY);
  });

  it('removes the key from the vault when the provider is deleted', async () => {
    const provider = await addProvider({
      name: 'OpenAI',
      kind: 'openai_compatible',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: KEY,
    });
    expect((await call('DELETE', `/api/providers/${provider.id}`)).status).toBe(204);
    expect(t.secrets.get(`provider:${provider.id}`)).toBeNull();
    expect((await call('GET', '/api/providers')).body).toEqual({ providers: [] });
  });

  it('shows no part of a short key', () => {
    expect(secretHint('short')).toBe('…');
    expect(secretHint('0123456789ab')).toBe('…89ab');
  });
});

describe('testing the connection (RF-42)', () => {
  it('reports success with what answered', async () => {
    const provider = await addOllama(await track(ollamaStub()));
    const { status, body } = await call('POST', `/api/providers/${provider.id}/test`);
    expect(status).toBe(200);
    const result = connectionTestSchema.parse(body);
    expect(result).toMatchObject({ ok: true, message: 'Conexão bem-sucedida: Ollama 0.40.16.' });
  });

  it('reports a failure as a result, not as an error', async () => {
    const provider = await addProvider({
      name: 'Parado',
      kind: 'ollama',
      baseUrl: await unusedUrl(),
    });
    const { status, body } = await call('POST', `/api/providers/${provider.id}/test`);
    expect(status).toBe(200);
    expect(connectionTestSchema.parse(body)).toMatchObject({
      ok: false,
      message:
        'Não foi possível conectar ao provedor. Verifique o endereço e se o serviço está em execução.',
    });
  });

  it('sends the stored key to the provider and succeeds with it', async () => {
    const stub = await track(openAiStub({ requireKey: KEY }));
    const provider = await addProvider({
      name: 'Local',
      kind: 'openai_compatible',
      baseUrl: `${stub.url}/v1`,
      apiKey: KEY,
    });
    const { body } = await call('POST', `/api/providers/${provider.id}/test`);
    expect(connectionTestSchema.parse(body).ok).toBe(true);
    expect(stub.requests[0]?.headers.authorization).toBe(`Bearer ${KEY}`);
  });

  it('keeps a rejected key out of the response and out of the log (C-10)', async () => {
    const stub = await track(openAiStub({ requireKey: 'the-right-key' }));
    const provider = await addProvider({
      name: 'Local',
      kind: 'openai_compatible',
      baseUrl: `${stub.url}/v1`,
      apiKey: KEY,
    });

    const { raw, body } = await call('POST', `/api/providers/${provider.id}/test`);
    expect(connectionTestSchema.parse(body)).toMatchObject({
      ok: false,
      message: 'O provedor recusou a credencial. Verifique a chave de API.',
    });
    expect(raw).not.toContain(KEY);

    // The stub echoed the key in its error; the log entry must not carry it.
    expect(warnings).toHaveLength(1);
    const logged = JSON.stringify(warnings);
    expect(logged).not.toContain(KEY);
    expect(logged).toContain('[redacted]');
    expect(warnings[0]?.context).toMatchObject({ kind: 'unauthorized', status: 401 });
  });

  it('works for an Anthropic provider', async () => {
    const stub = await track(anthropicStub({ requireKey: KEY }));
    const provider = await addProvider({
      name: 'Anthropic',
      kind: 'anthropic',
      baseUrl: stub.url,
      apiKey: KEY,
    });
    const { body } = await call('POST', `/api/providers/${provider.id}/test`);
    expect(connectionTestSchema.parse(body)).toMatchObject({
      ok: true,
      message: 'Conexão bem-sucedida: 2 modelos disponíveis.',
    });
  });
});

describe('models of a provider (RF-43)', () => {
  const sync = async (providerId: string) => {
    const { status, body } = await call('POST', `/api/providers/${providerId}/models/sync`);
    expect(status, JSON.stringify(body)).toBe(200);
    return modelSyncResultSchema.parse(body);
  };

  it('fetches the models, disabled until the user enables them', async () => {
    const stub = await track(
      ollamaStub({
        models: { 'llama3.2:3b': ['completion', 'tools'], 'phi:latest': ['completion'] },
      }),
    );
    const provider = await addOllama(stub);

    const result = await sync(provider.id);
    expect(result).toMatchObject({ added: 2, removed: 0 });
    expect(result.models).toMatchObject([
      { name: 'llama3.2:3b', supportsTools: true, enabled: false, agentCount: 0 },
      { name: 'phi:latest', supportsTools: false, enabled: false },
    ]);
    // Nothing is offered to agents yet.
    expect(modelListSchema.parse((await call('GET', '/api/models')).body).models).toEqual([]);

    const enabled = await call('PATCH', `/api/models/${result.models[0]!.id}`, { enabled: true });
    expect(enabled.status).toBe(200);
    expect(modelListSchema.parse((await call('GET', '/api/models')).body).models).toMatchObject([
      { name: 'llama3.2:3b', providerName: 'Ollama local', isExternal: false, supportsTools: true },
    ]);

    const listed = providerListSchema.parse((await call('GET', '/api/providers')).body);
    expect(listed.providers[0]).toMatchObject({ modelCount: 2, enabledModelCount: 1 });
  });

  it('keeps choices across a second sync, adds new models and drops removed ones', async () => {
    const offered: Record<string, string[]> = { a: ['completion'], b: ['completion'] };
    const stub = await track(ollamaStub({ models: offered }));
    const provider = await addOllama(stub);
    const first = await sync(provider.id);
    await call('PATCH', `/api/models/${first.models[0]!.id}`, { enabled: true });

    delete offered.b;
    offered.c = ['completion', 'tools'];
    const second = await sync(provider.id);
    expect(second).toMatchObject({ added: 1, removed: 1 });
    expect(second.models.map((model) => [model.name, model.enabled, model.supportsTools])).toEqual([
      ['a', true, false],
      ['c', false, true],
    ]);
    // The model that stayed kept its identity.
    expect(second.models[0]?.id).toBe(first.models[0]?.id);
  });

  it('keeps a model that disappeared while an agent still uses it', async () => {
    const offered: Record<string, string[]> = { a: ['completion'] };
    const provider = await addOllama(await track(ollamaStub({ models: offered })));
    const [model] = (await sync(provider.id)).models;
    await call('PATCH', `/api/models/${model!.id}`, { enabled: true });
    await call('POST', '/api/agents', { name: 'Leitor', modelId: model!.id });

    delete offered.a;
    const result = await sync(provider.id);
    expect(result).toMatchObject({ added: 0, removed: 0 });
    expect(result.models).toMatchObject([{ name: 'a', agentCount: 1 }]);
  });

  it('answers 502 with a safe message when the provider cannot be reached', async () => {
    const provider = await addProvider({
      name: 'Parado',
      kind: 'ollama',
      baseUrl: await unusedUrl(),
    });
    const { status, body } = await call('POST', `/api/providers/${provider.id}/models/sync`);
    expect(status).toBe(502);
    expect(errorOf(body)).toMatchObject({
      code: 'provider_error',
      message:
        'Não foi possível conectar ao provedor. Verifique o endereço e se o serviço está em execução.',
    });
  });

  it('lets an agent take an enabled model and shows it on the agent', async () => {
    const provider = await addOllama(await track(ollamaStub()));
    const [model] = (await sync(provider.id)).models;

    const tooEarly = await call('POST', '/api/agents', { name: 'A', modelId: model!.id });
    expect(tooEarly.status).toBe(400);

    await call('PATCH', `/api/models/${model!.id}`, { enabled: true });
    const created = await call('POST', '/api/agents', { name: 'A', modelId: model!.id });
    expect(agentSchema.parse(created.body)).toMatchObject({ modelName: 'llama3.2:3b' });

    const listed = providerModelListSchema.parse(
      (await call('GET', `/api/providers/${provider.id}/models`)).body,
    );
    expect(listed.models[0]?.agentCount).toBe(1);
    const summary = dashboardSummarySchema.parse(
      (await call('GET', '/api/dashboard/summary')).body,
    );
    expect(summary.alerts).toEqual([]);
  });
});

describe('removing what is in use (RN-08)', () => {
  async function providerWithAgent() {
    const provider = await addOllama(await track(ollamaStub()));
    const synced = modelSyncResultSchema.parse(
      (await call('POST', `/api/providers/${provider.id}/models/sync`)).body,
    );
    const modelId = synced.models[0]!.id;
    await call('PATCH', `/api/models/${modelId}`, { enabled: true });
    const agent = agentSchema.parse(
      (await call('POST', '/api/agents', { name: 'Leitor', modelId })).body,
    );
    return { provider, modelId, agent };
  }

  it('refuses to delete a provider or disable a model that an agent uses', async () => {
    const { provider, modelId } = await providerWithAgent();

    const removal = await call('DELETE', `/api/providers/${provider.id}`);
    expect(removal.status).toBe(409);
    expect(errorOf(removal.body)).toMatchObject({
      code: 'provider_in_use',
      details: { agentCount: 1 },
    });

    const disabling = await call('PATCH', `/api/models/${modelId}`, { enabled: false });
    expect(disabling.status).toBe(409);
    expect(errorOf(disabling.body).code).toBe('model_in_use');
    expect(t.database.db.select().from(models).get()?.enabled).toBe(true);
  });

  it('allows it once the agent uses another model or is deleted', async () => {
    const { provider, modelId, agent } = await providerWithAgent();

    await call('PATCH', `/api/agents/${agent.id}`, { modelId: null });
    expect((await call('PATCH', `/api/models/${modelId}`, { enabled: false })).status).toBe(200);

    await call('PATCH', `/api/models/${modelId}`, { enabled: true });
    await call('PATCH', `/api/agents/${agent.id}`, { modelId });
    expect((await call('DELETE', `/api/agents/${agent.id}`)).status).toBe(204);
    // A deleted agent no longer holds the provider.
    expect((await call('DELETE', `/api/providers/${provider.id}`)).status).toBe(204);
    expect(t.database.db.select().from(models).all()).toEqual([]);
  });
});

describe('audit trail (RF-72, C-23)', () => {
  it('records provider and model changes without any credential', async () => {
    const provider = await addProvider({
      name: 'OpenAI',
      kind: 'openai_compatible',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: KEY,
    });
    await call('PATCH', `/api/providers/${provider.id}`, { apiKey: 'another-key-9876543210' });
    await call('PATCH', `/api/providers/${provider.id}`, { apiKey: null });
    await call('DELETE', `/api/providers/${provider.id}`);

    expect(auditActions()).toEqual([
      'provider.created',
      'provider.updated',
      'provider.updated',
      'provider.deleted',
    ]);
    const rows = t.database.db.select().from(auditLog).all();
    expect(rows[0]).toMatchObject({
      actor: 'user',
      target: provider.id,
      details: { name: 'OpenAI', external: true, apiKeyStored: true },
    });
    expect(rows[1]?.details).toEqual({ apiKey: 'replaced' });
    expect(rows[2]?.details).toEqual({ apiKey: 'removed' });
    const everything = JSON.stringify(rows);
    expect(everything).not.toContain(KEY);
    expect(everything).not.toContain('another-key');
  });

  it('records a model being enabled and disabled, but not a no-op', async () => {
    const provider = await addOllama(await track(ollamaStub()));
    const synced = modelSyncResultSchema.parse(
      (await call('POST', `/api/providers/${provider.id}/models/sync`)).body,
    );
    const modelId = synced.models[0]!.id;
    await call('PATCH', `/api/models/${modelId}`, { enabled: true });
    await call('PATCH', `/api/models/${modelId}`, { enabled: true });
    await call('PATCH', `/api/models/${modelId}`, { enabled: false });
    expect(auditActions()).toEqual(['provider.created', 'model.enabled', 'model.disabled']);
  });

  it('redacts credentials that slip into audit details', () => {
    recordAudit(t.database.db, {
      actor: 'system',
      action: 'test.entry',
      details: { note: `failed with Authorization: Bearer ${KEY}`, nested: { list: [KEY] } },
    });
    expect(JSON.stringify(t.database.db.select().from(auditLog).all())).not.toContain(KEY);
  });

  it('cannot be changed or erased, even directly in the database', async () => {
    await addProvider({ name: 'P', kind: 'ollama', baseUrl: 'http://127.0.0.1:1' });
    expect(() => t.database.sqlite.prepare('UPDATE audit_log SET action = ?').run('x')).toThrow(
      /append-only/,
    );
    expect(() => t.database.sqlite.prepare('DELETE FROM audit_log').run()).toThrow(/append-only/);
    expect(auditActions()).toEqual(['provider.created']);
  });
});

describe('redactSecrets (C-10)', () => {
  it.each([
    ['a known secret', `key is ${KEY} here`, [KEY]],
    ['an sk- key it has never seen', 'error: sk-proj-AbCdEf123456789 invalid', []],
    ['a bearer token', 'Authorization: Bearer abcdef1234567890xyz', []],
    ['an x-api-key header', 'x-api-key: abcdef1234567890', []],
    ['a JSON api_key field', '{"api_key":"abcdef1234567890"}', []],
  ])('removes %s', (_label, text, known) => {
    const result = redactSecrets(text, known);
    expect(result).toContain('[redacted]');
    expect(result).not.toMatch(/abcdef1234567890|AbCdEf123456789|0123456789abcdef/);
  });

  it('leaves ordinary text alone', () => {
    const text = 'O modelo llama3.2:3b respondeu em 1,2 s com 42 tokens.';
    expect(redactSecrets(text, ['zzzz-not-present'])).toBe(text);
  });
});

describe('secret stores', () => {
  it('memory store: set, get, replace, delete', () => {
    const store = new MemorySecretStore();
    expect(store.get('a')).toBeNull();
    store.set('a', 'one');
    store.set('a', 'two');
    expect(store.get('a')).toBe('two');
    store.delete('a');
    store.delete('a');
    expect(store.get('a')).toBeNull();
  });

  it('OS vault: stores, replaces and removes a real entry', () => {
    // Uses a service name of its own so it never touches real application keys.
    const store = new KeyringSecretStore('enterprise-agents-test');
    const ref = `provider:test-${process.pid}`;
    try {
      expect(store.get(ref)).toBeNull();
      store.set(ref, 'first-value');
      expect(store.get(ref)).toBe('first-value');
      store.set(ref, 'second-value');
      expect(store.get(ref)).toBe('second-value');
    } finally {
      store.delete(ref);
    }
    expect(store.get(ref)).toBeNull();
    store.delete(ref);
  });
});

describe('protection of the provider routes', () => {
  it('requires a session and a trusted origin', async () => {
    const noSession = await t.app.inject({
      method: 'POST',
      url: '/api/providers',
      headers: { ...t.trusted, cookie: '' },
      payload: { name: 'P', kind: 'ollama', baseUrl: 'http://127.0.0.1:1' },
    });
    expect(noSession.statusCode).toBe(401);

    const foreign = await t.app.inject({
      method: 'POST',
      url: '/api/providers/x/test',
      headers: { ...t.trusted, origin: 'https://evil.example' },
    });
    expect(foreign.statusCode).toBe(403);
  });
});

describe('harness providers (Fase 12)', () => {
  it('adds a harness with a command, no address and no key', async () => {
    const provider = await addProvider({
      name: 'Claude Code',
      kind: 'claude_code',
      command: 'claude',
    });
    expect(provider).toMatchObject({
      kind: 'claude_code',
      command: 'claude',
      baseUrl: null,
      // The program runs here, but it answers through its vendor's service.
      isExternal: true,
      hasApiKey: false,
      apiKeyHint: null,
    });
    const row = t.database.db.select().from(providers).get();
    expect(row).toMatchObject({ command: 'claude', baseUrl: null, secretRef: null });
  });

  it.each([
    ['an address on a harness', { name: 'P', kind: 'claude_code', baseUrl: 'http://127.0.0.1:1' }],
    ['a harness with no command', { name: 'P', kind: 'codex' }],
    ['a command with arguments', { name: 'P', kind: 'claude_code', command: 'claude --bare' }],
    ['a command that is a shell line', { name: 'P', kind: 'codex', command: 'codex && rm -rf .' }],
    ['a command that starts with a dash', { name: 'P', kind: 'codex', command: '-rf' }],
    ['a key for a harness', { name: 'P', kind: 'claude_code', command: 'claude', apiKey: KEY }],
  ])('rejects %s', async (_label, input) => {
    const { status, body } = await call('POST', '/api/providers', input);
    expect(status, JSON.stringify(body)).toBe(400);
    expect(t.database.db.select().from(providers).all()).toEqual([]);
  });

  it('rejects a command on a provider reached over HTTP', async () => {
    const { status, body } = await call('POST', '/api/providers', {
      name: 'P',
      kind: 'ollama',
      baseUrl: 'http://127.0.0.1:11434',
      command: 'claude',
    });
    expect(status).toBe(400);
    expect(fieldsOf(body)).toContain('command');
  });

  it('changes the command, and refuses to give the harness an address', async () => {
    const provider = await addProvider({ name: 'CC', kind: 'claude_code', command: 'claude' });

    const changed = await call('PATCH', `/api/providers/${provider.id}`, {
      command: 'C:\\Program Files\\claude\\claude.exe',
    });
    expect(changed.status).toBe(200);
    expect(providerSchema.parse(changed.body).command).toBe(
      'C:\\Program Files\\claude\\claude.exe',
    );

    const withAddress = await call('PATCH', `/api/providers/${provider.id}`, {
      baseUrl: 'http://127.0.0.1:1',
    });
    expect(withAddress.status).toBe(400);
    expect(fieldsOf(withAddress.body)).toEqual(['baseUrl']);

    expect(auditActions()).toEqual(['provider.created', 'provider.updated']);
    expect(t.database.db.select().from(auditLog).all()[1]?.details).toEqual({
      command: 'C:\\Program Files\\claude\\claude.exe',
    });
  });

  it('refuses a command on an HTTP provider that already exists', async () => {
    const provider = await addProvider({
      name: 'Ollama',
      kind: 'ollama',
      baseUrl: 'http://127.0.0.1:11434',
    });
    const { status, body } = await call('PATCH', `/api/providers/${provider.id}`, {
      command: 'claude',
    });
    expect(status).toBe(400);
    expect(fieldsOf(body)).toEqual(['command']);
  });
});

describe('harness providers in use (Fase 12)', () => {
  /** An app whose factory records the settings and answers like a harness. */
  async function appWithHarness(adapter: Partial<ModelProvider> = {}) {
    const seen: ProviderSettings[] = [];
    const app = await makeApp({
      createProvider: (settings) => {
        seen.push(settings);
        return {
          testConnection: async () => ({ detail: 'Claude Code 2.1.301' }),
          listModels: async () => [
            { name: 'default', displayName: 'Padrão da conta', supportsTools: false },
          ],
          chat: async function* () {
            yield { type: 'done', stopReason: 'end' } as const;
          },
          ...adapter,
        };
      },
    });
    const post = async (url: string, payload?: unknown) => {
      const response = await app.app.inject({
        method: 'POST',
        url,
        headers: app.trusted,
        ...(payload === undefined ? {} : { payload: payload as object }),
      });
      return { status: response.statusCode, body: response.json<unknown>() };
    };
    const created = await post('/api/providers', {
      name: 'Claude Code',
      kind: 'claude_code',
      command: 'claude',
    });
    expect(created.status).toBe(201);
    return { app, seen, post, provider: providerSchema.parse(created.body) };
  }

  it('hands the adapter the command and no address or key', async () => {
    const harness = await appWithHarness();
    try {
      const { status, body } = await harness.post(`/api/providers/${harness.provider.id}/test`);
      expect(status).toBe(200);
      expect(connectionTestSchema.parse(body)).toMatchObject({
        ok: true,
        message: 'Conexão bem-sucedida: Claude Code 2.1.301.',
      });
      expect(harness.seen[0]).toEqual({
        kind: 'claude_code',
        command: 'claude',
        baseUrl: null,
        apiKey: null,
      });
    } finally {
      await harness.app.close();
    }
  });

  it('says the harness is not signed in, without the harness own words', async () => {
    const harness = await appWithHarness({
      testConnection: async () => {
        throw new ProviderError('not_signed_in', undefined, 'OAuth session expired');
      },
    });
    try {
      const { status, body } = await harness.post(`/api/providers/${harness.provider.id}/test`);
      expect(status).toBe(200);
      const result = connectionTestSchema.parse(body);
      expect(result.ok).toBe(false);
      expect(result.message).toBe(
        'O harness não está conectado a uma conta. Abra um terminal, execute o programa dele e entre na sua conta.',
      );
      expect(JSON.stringify(result)).not.toContain('OAuth');
    } finally {
      await harness.app.close();
    }
  });

  it('syncs models that only converse, and does not let that be overridden', async () => {
    const harness = await appWithHarness();
    try {
      const synced = await harness.post(`/api/providers/${harness.provider.id}/models/sync`);
      const result = modelSyncResultSchema.parse(synced.body);
      expect(result.models).toMatchObject([{ name: 'default', supportsTools: false }]);

      const marking = await harness.app.app.inject({
        method: 'PATCH',
        url: `/api/models/${result.models[0]!.id}`,
        headers: harness.app.trusted,
        payload: { supportsTools: true },
      });
      expect(marking.statusCode).toBe(409);
      expect(errorOf(marking.json()).code).toBe('tools_support_detected');
    } finally {
      await harness.app.close();
    }
  });
});
