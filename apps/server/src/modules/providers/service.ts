import {
  type ConnectionTest,
  isExternalUrl,
  type ModelSyncResult,
  type ModelUpdate,
  type Provider,
  PROVIDER_KIND_INFO,
  type ProviderCreate,
  type ProviderModel,
  type ProviderUpdate,
} from '@ea/shared';
import { and, asc, count, eq, inArray, isNull } from 'drizzle-orm';
import { ConflictError, NotFoundError, UpstreamError, ValidationError } from '../../core/errors';
import type { Db } from '../../db/client';
import { newId } from '../../db/ids';
import { agents, models, providers } from '../../db/schema';
import type { ProviderFactory } from '../../providers/factory';
import { type ModelProvider, ProviderError } from '../../providers/types';
import { redactSecrets, secretHint } from '../../security/redact';
import type { SecretStore } from '../../security/secret-store';
import { recordAudit } from '../audit/service';

export interface ProviderDeps {
  readonly db: Db;
  readonly secrets: SecretStore;
  readonly createProvider: ProviderFactory;
  /** Receives provider failures, already stripped of credentials. */
  readonly logWarning: (context: Record<string, unknown>, message: string) => void;
}

type ProviderRow = typeof providers.$inferSelect;

const sameName = (a: string, b: string) =>
  a.toLocaleLowerCase('pt-BR') === b.toLocaleLowerCase('pt-BR');

const fieldError = (path: string, message: string) => new ValidationError([{ path, message }]);

const secretRefFor = (providerId: string) => `provider:${providerId}`;

function findRow(db: Db, id: string): ProviderRow {
  const row = db.select().from(providers).where(eq(providers.id, id)).get();
  if (!row) throw new NotFoundError('Provedor não encontrado.');
  return row;
}

function assertNameIsFree(db: Db, name: string, exceptId?: string): void {
  const taken = db
    .select({ id: providers.id, name: providers.name })
    .from(providers)
    .all()
    .some((row) => row.id !== exceptId && sameName(row.name, name));
  if (taken) throw new ConflictError('name_taken', 'Já existe um provedor com esse nome.');
}

/** Live agents per model id. Deleted agents hold no model. */
function agentCountsByModel(db: Db): Map<string, number> {
  const rows = db
    .select({ modelId: agents.modelId, total: count() })
    .from(agents)
    .where(isNull(agents.deletedAt))
    .groupBy(agents.modelId)
    .all();
  return new Map(rows.flatMap((row) => (row.modelId ? [[row.modelId, row.total]] : [])));
}

function readSecret(deps: ProviderDeps, row: ProviderRow): string | null {
  return row.secretRef ? deps.secrets.get(row.secretRef) : null;
}

function toProvider(deps: ProviderDeps, row: ProviderRow, usage: Map<string, number>): Provider {
  const providerModels = deps.db
    .select({ id: models.id, enabled: models.enabled })
    .from(models)
    .where(eq(models.providerId, row.id))
    .all();
  const secret = readSecret(deps, row);
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    baseUrl: row.baseUrl,
    isExternal: row.isExternal,
    hasApiKey: secret !== null,
    apiKeyHint: secret === null ? null : secretHint(secret),
    modelCount: providerModels.length,
    enabledModelCount: providerModels.filter((model) => model.enabled).length,
    agentCount: providerModels.reduce((total, model) => total + (usage.get(model.id) ?? 0), 0),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function listProviders(deps: ProviderDeps): Provider[] {
  const usage = agentCountsByModel(deps.db);
  return deps.db
    .select()
    .from(providers)
    .orderBy(asc(providers.name))
    .all()
    .map((row) => toProvider(deps, row, usage));
}

export function getProvider(deps: ProviderDeps, id: string): Provider {
  return toProvider(deps, findRow(deps.db, id), agentCountsByModel(deps.db));
}

export function createProviderRecord(deps: ProviderDeps, input: ProviderCreate): Provider {
  const info = PROVIDER_KIND_INFO[input.kind];
  if (info.apiKey === 'required' && !input.apiKey) {
    throw fieldError('apiKey', `${info.label} exige uma chave de API.`);
  }
  if (info.apiKey === 'none' && input.apiKey) {
    throw fieldError('apiKey', `${info.label} não usa chave de API.`);
  }
  assertNameIsFree(deps.db, input.name);

  const id = newId();
  const secretRef = input.apiKey ? secretRefFor(id) : null;
  // Secret first: if the vault is unavailable nothing is half-created.
  if (secretRef && input.apiKey) deps.secrets.set(secretRef, input.apiKey);
  try {
    deps.db
      .insert(providers)
      .values({
        id,
        name: input.name,
        kind: input.kind,
        baseUrl: input.baseUrl,
        isExternal: isExternalUrl(input.baseUrl),
        secretRef,
      })
      .run();
  } catch (error) {
    if (secretRef) deps.secrets.delete(secretRef);
    throw error;
  }

  recordAudit(deps.db, {
    actor: 'user',
    action: 'provider.created',
    target: id,
    details: {
      name: input.name,
      kind: input.kind,
      baseUrl: input.baseUrl,
      external: isExternalUrl(input.baseUrl),
      apiKeyStored: secretRef !== null,
    },
  });
  return getProvider(deps, id);
}

export function updateProviderRecord(
  deps: ProviderDeps,
  id: string,
  patch: ProviderUpdate,
): Provider {
  const row = findRow(deps.db, id);
  const info = PROVIDER_KIND_INFO[row.kind];
  if (patch.name !== undefined) assertNameIsFree(deps.db, patch.name, id);
  if (patch.apiKey === null && info.apiKey === 'required') {
    throw fieldError('apiKey', `${info.label} exige uma chave de API.`);
  }
  if (typeof patch.apiKey === 'string' && info.apiKey === 'none') {
    throw fieldError('apiKey', `${info.label} não usa chave de API.`);
  }

  let secretRef = row.secretRef;
  if (typeof patch.apiKey === 'string') {
    secretRef = secretRefFor(id);
    deps.secrets.set(secretRef, patch.apiKey);
  } else if (patch.apiKey === null && row.secretRef) {
    deps.secrets.delete(row.secretRef);
    secretRef = null;
  }

  const baseUrl = patch.baseUrl ?? row.baseUrl;
  deps.db
    .update(providers)
    .set({
      name: patch.name ?? row.name,
      baseUrl,
      isExternal: isExternalUrl(baseUrl),
      secretRef,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(providers.id, id))
    .run();

  recordAudit(deps.db, {
    actor: 'user',
    action: 'provider.updated',
    target: id,
    details: {
      ...(patch.name !== undefined && patch.name !== row.name ? { name: patch.name } : {}),
      ...(patch.baseUrl !== undefined && patch.baseUrl !== row.baseUrl
        ? { baseUrl, external: isExternalUrl(baseUrl) }
        : {}),
      // Which way the key changed, never the key.
      ...(patch.apiKey === undefined
        ? {}
        : { apiKey: patch.apiKey === null ? 'removed' : 'replaced' }),
    },
  });
  return getProvider(deps, id);
}

export function deleteProviderRecord(deps: ProviderDeps, id: string): void {
  const provider = getProvider(deps, id);
  if (provider.agentCount > 0) {
    throw new ConflictError(
      'provider_in_use',
      `Este provedor é usado por ${provider.agentCount === 1 ? '1 agente' : `${provider.agentCount} agentes`}. Escolha outro modelo para eles antes de excluir.`,
      { agentCount: provider.agentCount },
    );
  }
  const row = findRow(deps.db, id);
  deps.db.delete(providers).where(eq(providers.id, id)).run();
  if (row.secretRef) deps.secrets.delete(row.secretRef);
  recordAudit(deps.db, {
    actor: 'user',
    action: 'provider.deleted',
    target: id,
    details: { name: row.name, kind: row.kind },
  });
}

function adapterFor(
  deps: ProviderDeps,
  row: ProviderRow,
): { adapter: ModelProvider; secret: string | null } {
  const secret = readSecret(deps, row);
  return {
    adapter: deps.createProvider({ kind: row.kind, baseUrl: row.baseUrl, apiKey: secret }),
    secret,
  };
}

/** Logs a provider failure without the credential and returns the safe message. */
function reportFailure(
  deps: ProviderDeps,
  row: ProviderRow,
  secret: string | null,
  error: unknown,
): string {
  const known = secret ? [secret] : [];
  if (error instanceof ProviderError) {
    deps.logWarning(
      {
        providerId: row.id,
        kind: error.kind,
        status: error.status,
        detail: error.upstreamDetail ? redactSecrets(error.upstreamDetail, known) : undefined,
      },
      'provider request failed',
    );
    return error.message;
  }
  deps.logWarning(
    { providerId: row.id, detail: redactSecrets(String(error), known) },
    'provider request failed unexpectedly',
  );
  return 'Não foi possível falar com o provedor.';
}

/** Never throws for a provider failure: the result says what went wrong. */
export async function testProviderConnection(
  deps: ProviderDeps,
  id: string,
): Promise<ConnectionTest> {
  const row = findRow(deps.db, id);
  const { adapter, secret } = adapterFor(deps, row);
  const started = performance.now();
  try {
    const { detail } = await adapter.testConnection();
    return {
      ok: true,
      message: `Conexão bem-sucedida: ${detail}.`,
      latencyMs: Math.round(performance.now() - started),
    };
  } catch (error) {
    return {
      ok: false,
      message: reportFailure(deps, row, secret, error),
      latencyMs: Math.round(performance.now() - started),
    };
  }
}

export function listProviderModels(deps: ProviderDeps, providerId: string): ProviderModel[] {
  findRow(deps.db, providerId);
  const usage = agentCountsByModel(deps.db);
  return deps.db
    .select()
    .from(models)
    .where(eq(models.providerId, providerId))
    .orderBy(asc(models.displayName))
    .all()
    .map((model) => ({
      id: model.id,
      providerId: model.providerId,
      name: model.name,
      displayName: model.displayName,
      supportsTools: model.supportsTools,
      enabled: model.enabled,
      agentCount: usage.get(model.id) ?? 0,
    }));
}

/**
 * Brings the stored model list in line with what the provider offers now.
 * New models arrive disabled, so nothing becomes usable without the user
 * choosing it; models that disappeared are removed unless an agent uses them.
 */
export async function syncProviderModels(deps: ProviderDeps, id: string): Promise<ModelSyncResult> {
  const row = findRow(deps.db, id);
  const { adapter, secret } = adapterFor(deps, row);

  let offered;
  try {
    offered = await adapter.listModels();
  } catch (error) {
    throw new UpstreamError(reportFailure(deps, row, secret, error));
  }

  const existing = deps.db.select().from(models).where(eq(models.providerId, id)).all();
  const existingByName = new Map(existing.map((model) => [model.name, model]));
  const offeredNames = new Set(offered.map((model) => model.name));
  const usage = agentCountsByModel(deps.db);

  const toAdd = offered.filter((model) => !existingByName.has(model.name));
  const toRemove = existing.filter(
    (model) => !offeredNames.has(model.name) && !usage.has(model.id),
  );

  deps.db.transaction((tx) => {
    for (const model of offered) {
      const known = existingByName.get(model.name);
      if (known) {
        tx.update(models)
          .set({ displayName: model.displayName, supportsTools: model.supportsTools })
          .where(eq(models.id, known.id))
          .run();
      }
    }
    if (toAdd.length > 0) {
      tx.insert(models)
        .values(
          toAdd.map((model) => ({
            id: newId(),
            providerId: id,
            name: model.name,
            displayName: model.displayName,
            supportsTools: model.supportsTools,
            enabled: false,
          })),
        )
        .run();
    }
    if (toRemove.length > 0) {
      tx.delete(models)
        .where(
          inArray(
            models.id,
            toRemove.map((model) => model.id),
          ),
        )
        .run();
    }
  });

  return {
    models: listProviderModels(deps, id),
    added: toAdd.length,
    removed: toRemove.length,
  };
}

export function updateModel(
  deps: ProviderDeps,
  modelId: string,
  patch: ModelUpdate,
): ProviderModel {
  const model = deps.db.select().from(models).where(eq(models.id, modelId)).get();
  if (!model) throw new NotFoundError('Modelo não encontrado.');

  if (!patch.enabled) {
    const inUse =
      deps.db
        .select({ total: count() })
        .from(agents)
        .where(and(eq(agents.modelId, modelId), isNull(agents.deletedAt)))
        .get()?.total ?? 0;
    if (inUse > 0) {
      throw new ConflictError(
        'model_in_use',
        `Este modelo é usado por ${inUse === 1 ? '1 agente' : `${inUse} agentes`}. Escolha outro modelo para eles antes de desabilitar.`,
        { agentCount: inUse },
      );
    }
  }

  if (model.enabled !== patch.enabled) {
    deps.db.update(models).set({ enabled: patch.enabled }).where(eq(models.id, modelId)).run();
    recordAudit(deps.db, {
      actor: 'user',
      action: patch.enabled ? 'model.enabled' : 'model.disabled',
      target: modelId,
      details: { providerId: model.providerId, name: model.name },
    });
  }

  const updated = listProviderModels(deps, model.providerId).find((entry) => entry.id === modelId);
  if (!updated) throw new NotFoundError('Modelo não encontrado.');
  return updated;
}
