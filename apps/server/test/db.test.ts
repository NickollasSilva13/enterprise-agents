import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { type Database, openDatabase, runMigrations } from '../src/db/client';
import { newId } from '../src/db/ids';
import {
  agents,
  conversations,
  messages,
  models,
  providers,
  runs,
  runSteps,
} from '../src/db/schema';
import { makeDatabase, makeTempDir } from './helpers';

const EXPECTED_TABLES = [
  'agent_tools',
  'agents',
  'approvals',
  'audit_log',
  'conversations',
  'messages',
  'models',
  'projects',
  'providers',
  'run_steps',
  'runs',
  'settings',
  'tool_calls',
];

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

function memoryDatabase(): Database {
  const database = makeDatabase();
  cleanups.push(() => database.close());
  return database;
}

function seedAgent(database: Database) {
  const providerId = newId();
  const modelId = newId();
  const agentId = newId();
  database.db
    .insert(providers)
    .values({
      id: providerId,
      name: 'local',
      kind: 'ollama',
      baseUrl: 'http://127.0.0.1:11434',
      isExternal: false,
    })
    .run();
  database.db
    .insert(models)
    .values({ id: modelId, providerId, name: 'llama3', displayName: 'Llama 3' })
    .run();
  database.db.insert(agents).values({ id: agentId, name: 'Agent', modelId }).run();
  return { providerId, modelId, agentId };
}

const tableNames = (database: Database) =>
  (
    database.sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_\\_%' ESCAPE '\\' ORDER BY name",
      )
      .all() as { name: string }[]
  ).map((row) => row.name);

describe('migrations', () => {
  it('create the whole schema from an empty database', () => {
    expect(tableNames(memoryDatabase())).toEqual(EXPECTED_TABLES);
  });

  it('can run again without changing anything', () => {
    const database = memoryDatabase();
    seedAgent(database);
    runMigrations(database);
    expect(tableNames(database)).toEqual(EXPECTED_TABLES);
    expect(database.db.select().from(agents).all()).toHaveLength(1);
  });
});

describe('persistence (RNF-04, RNF-11)', () => {
  it('keeps data after closing and reopening the database file', () => {
    const dir = makeTempDir();
    cleanups.push(dir.remove);
    const file = join(dir.path, 'app.db');

    const first = openDatabase(file);
    runMigrations(first);
    const { agentId } = seedAgent(first);
    first.close();

    const second = openDatabase(file);
    cleanups.push(() => second.close());
    runMigrations(second);
    const [agent] = second.db.select().from(agents).where(eq(agents.id, agentId)).all();
    expect(agent).toMatchObject({ name: 'Agent', enabled: true, maxSteps: 20, deletedAt: null });
    expect(agent?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('uses write-ahead logging and enforces foreign keys on file databases', () => {
    const dir = makeTempDir();
    cleanups.push(dir.remove);
    const database = openDatabase(join(dir.path, 'app.db'));
    cleanups.push(() => database.close());
    expect(database.sqlite.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(database.sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
  });

  it('round-trips JSON columns', () => {
    const database = memoryDatabase();
    const { agentId } = seedAgent(database);
    const conversationId = newId();
    database.db.insert(conversations).values({ id: conversationId, agentId }).run();
    const content = { text: 'olá', parts: [1, 2, { nested: true }] };
    database.db
      .insert(messages)
      .values({ id: newId(), conversationId, role: 'user', content })
      .run();
    expect(database.db.select().from(messages).get()?.content).toEqual(content);
  });
});

describe('integrity', () => {
  it('rejects an agent that points to a model that does not exist', () => {
    const database = memoryDatabase();
    expect(() =>
      database.db.insert(agents).values({ id: newId(), name: 'x', modelId: 'missing' }).run(),
    ).toThrow(/FOREIGN KEY/);
  });

  it('blocks removing a model or provider in use by an agent (RN-08)', () => {
    const database = memoryDatabase();
    const { providerId, modelId } = seedAgent(database);
    expect(() => database.db.delete(models).where(eq(models.id, modelId)).run()).toThrow(
      /FOREIGN KEY/,
    );
    expect(() => database.db.delete(providers).where(eq(providers.id, providerId)).run()).toThrow(
      /FOREIGN KEY/,
    );
    expect(database.db.select().from(models).all()).toHaveLength(1);
  });

  it('removes the models of an unused provider along with it', () => {
    const database = memoryDatabase();
    const { providerId, agentId } = seedAgent(database);
    database.db.update(agents).set({ modelId: null }).where(eq(agents.id, agentId)).run();
    database.db.delete(providers).where(eq(providers.id, providerId)).run();
    expect(database.db.select().from(models).all()).toHaveLength(0);
  });

  it('blocks removing an agent that has history (RN-07)', () => {
    const database = memoryDatabase();
    const { agentId } = seedAgent(database);
    database.db.insert(runs).values({ id: newId(), agentId, trigger: 'manual' }).run();
    expect(() => database.db.delete(agents).where(eq(agents.id, agentId)).run()).toThrow(
      /FOREIGN KEY/,
    );
  });

  it('removes messages with their conversation and steps with their run', () => {
    const database = memoryDatabase();
    const { agentId } = seedAgent(database);
    const conversationId = newId();
    const runId = newId();
    database.db.insert(conversations).values({ id: conversationId, agentId }).run();
    database.db.insert(runs).values({ id: runId, agentId, conversationId, trigger: 'chat' }).run();
    database.db
      .insert(messages)
      .values({ id: newId(), conversationId, runId, role: 'user', content: 'hi' })
      .run();
    database.db
      .insert(runSteps)
      .values({ id: newId(), runId, seq: 1, type: 'text', payload: {} })
      .run();

    database.db.delete(conversations).where(eq(conversations.id, conversationId)).run();
    expect(database.db.select().from(messages).all()).toHaveLength(0);
    // The run survives the conversation, detached from it.
    expect(database.db.select().from(runs).get()?.conversationId).toBeNull();

    database.db.delete(runs).where(eq(runs.id, runId)).run();
    expect(database.db.select().from(runSteps).all()).toHaveLength(0);
  });

  it('links child runs to their parent and rejects duplicate step numbers', () => {
    const database = memoryDatabase();
    const { agentId } = seedAgent(database);
    const parentId = newId();
    const childId = newId();
    database.db.insert(runs).values({ id: parentId, agentId, trigger: 'manual' }).run();
    database.db
      .insert(runs)
      .values({ id: childId, agentId, trigger: 'delegation', parentRunId: parentId })
      .run();
    const child = database.db.select().from(runs).where(eq(runs.id, childId)).get();
    expect(child).toMatchObject({ parentRunId: parentId, status: 'queued' });

    const step = { runId: parentId, seq: 1, type: 'text', payload: {} };
    database.db
      .insert(runSteps)
      .values({ id: newId(), ...step })
      .run();
    expect(() =>
      database.db
        .insert(runSteps)
        .values({ id: newId(), ...step })
        .run(),
    ).toThrow(/UNIQUE/);
  });

  it('rejects two providers with the same name', () => {
    const database = memoryDatabase();
    seedAgent(database);
    expect(() =>
      database.db
        .insert(providers)
        .values({ id: newId(), name: 'local', kind: 'ollama', baseUrl: 'x', isExternal: false })
        .run(),
    ).toThrow(/UNIQUE/);
  });
});
