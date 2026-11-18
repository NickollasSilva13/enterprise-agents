import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR } from '../src/config/paths';
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
  taskEvents,
  tasks,
  workflowStages,
  workflowTemplates,
} from '../src/db/schema';
import { makeDatabase, makeTempDir } from './helpers';

const EXPECTED_TABLES = [
  'agent_tools',
  'agents',
  'approvals',
  'area_links',
  'audit_log',
  'conversations',
  'messages',
  'models',
  'office_areas',
  'office_items',
  'projects',
  'providers',
  'run_steps',
  'runs',
  'settings',
  'task_events',
  'tasks',
  'tool_calls',
  'workflow_stages',
  'workflow_templates',
  'workflow_transitions',
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

describe('migrations over existing data', () => {
  /** A database migrated only up to `last`, as an earlier version left it. */
  function databaseUpTo(last: number): Database {
    const folder = makeTempDir();
    cleanups.push(folder.remove);
    const journal = JSON.parse(
      readFileSync(join(MIGRATIONS_DIR, 'meta', '_journal.json'), 'utf8'),
    ) as { entries: { idx: number; tag: string }[] };
    const entries = journal.entries.filter((entry) => entry.idx <= last);
    mkdirSync(join(folder.path, 'meta'));
    writeFileSync(
      join(folder.path, 'meta', '_journal.json'),
      JSON.stringify({ ...journal, entries }),
    );
    for (const { tag } of entries) {
      copyFileSync(join(MIGRATIONS_DIR, `${tag}.sql`), join(folder.path, `${tag}.sql`));
    }
    const database = openDatabase(':memory:');
    cleanups.push(() => database.close());
    runMigrations(database, folder.path);
    return database;
  }

  // Defect found when the real database first met migration 0002: rebuilding
  // `providers` dropped it with foreign keys on, which cascaded to `models`.
  // With an agent on a model the start failed; with none, every model went.
  it.each([
    ['an agent uses one of the models', true],
    ['no agent uses the models', false],
  ])('rebuild providers without touching its models when %s (0002)', (_label, withAgent) => {
    const database = databaseUpTo(1);
    database.sqlite.exec(`
      INSERT INTO providers (id, name, kind, base_url, is_external)
        VALUES ('p1', 'Ollama local', 'ollama', 'http://127.0.0.1:11434', 0);
      INSERT INTO models (id, provider_id, name, display_name)
        VALUES ('m1', 'p1', 'llama3', 'Llama 3'), ('m2', 'p1', 'phi', 'Phi');
    `);
    if (withAgent) {
      database.sqlite.exec("INSERT INTO agents (id, name, model_id) VALUES ('a1', 'Agente', 'm1')");
    }

    runMigrations(database);

    expect(database.db.select({ id: models.id }).from(models).all()).toEqual([
      { id: 'm1' },
      { id: 'm2' },
    ]);
    expect(database.db.select().from(providers).get()).toMatchObject({
      id: 'p1',
      baseUrl: 'http://127.0.0.1:11434',
      command: null,
    });
    if (withAgent) expect(database.db.select().from(agents).get()?.modelId).toBe('m1');
    // The keys are back on for everything that runs after the migrations.
    expect(database.sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
  });

  // 0003 adds the office layout and also rebuilds `providers`: the hand-written
  // 0002 left drizzle's snapshot behind, so the next generated migration
  // carried the rebuild. Data must come through untouched.
  it('keep providers, models and agents when adding the office layout (0003)', () => {
    const database = databaseUpTo(2);
    database.sqlite.exec(`
      INSERT INTO providers (id, name, kind, base_url, command, is_external)
        VALUES ('p1', 'Ollama local', 'ollama', 'http://127.0.0.1:11434', NULL, 0),
               ('p2', 'Claude Code', 'claude_code', NULL, 'claude', 1);
      INSERT INTO models (id, provider_id, name, display_name)
        VALUES ('m1', 'p1', 'llama3', 'Llama 3'), ('m2', 'p2', 'haiku', 'Haiku');
      INSERT INTO agents (id, name, model_id) VALUES ('a1', 'Agente', 'm2');
    `);

    runMigrations(database);

    expect(database.db.select({ id: models.id }).from(models).all()).toEqual([
      { id: 'm1' },
      { id: 'm2' },
    ]);
    expect(
      database.db.select({ id: providers.id, command: providers.command }).from(providers).all(),
    ).toEqual([
      { id: 'p1', command: null },
      { id: 'p2', command: 'claude' },
    ]);
    expect(database.db.select().from(agents).get()).toMatchObject({
      modelId: 'm2',
      appearance: null,
    });
    expect(tableNames(database)).toEqual(EXPECTED_TABLES);
    expect(database.sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
  });

  it('give existing agents no area access and existing runs no task (0004)', () => {
    const database = databaseUpTo(3);
    database.sqlite.exec(`
      INSERT INTO projects (id, name) VALUES ('pr1', 'Site');
      INSERT INTO providers (id, name, kind, base_url, is_external)
        VALUES ('p1', 'Ollama local', 'ollama', 'http://127.0.0.1:11434', 0);
      INSERT INTO models (id, provider_id, name, display_name) VALUES ('m1', 'p1', 'llama3', 'Llama 3');
      INSERT INTO agents (id, name, model_id, project_id) VALUES ('a1', 'Agente', 'm1', 'pr1');
      INSERT INTO runs (id, agent_id, trigger) VALUES ('r1', 'a1', 'chat');
    `);

    runMigrations(database);

    expect(database.db.select().from(agents).get()).toMatchObject({
      projectId: 'pr1',
      areaAccess: 'none',
    });
    expect(database.db.select().from(runs).get()).toMatchObject({ id: 'r1', taskId: null });
    expect(tableNames(database)).toEqual(EXPECTED_TABLES);
  });

  it('keep tasks and their history, now with no parent, when adding requests (0006)', () => {
    const database = databaseUpTo(5);
    database.sqlite.exec(`
      INSERT INTO projects (id, name) VALUES ('pr1', 'Site');
      INSERT INTO workflow_stages (id, project_id, position, name, kind)
        VALUES ('s1', 'pr1', 0, 'Fila', 'human');
      INSERT INTO tasks (id, project_id, title, stage_id) VALUES ('t1', 'pr1', 'Tarefa', 's1');
      INSERT INTO task_events (id, task_id, kind, actor) VALUES ('e1', 't1', 'created', 'user');
    `);

    runMigrations(database);

    expect(database.db.select().from(tasks).get()).toMatchObject({ id: 't1', parentTaskId: null });
    expect(database.db.select().from(taskEvents).get()).toMatchObject({
      id: 'e1',
      relatedTaskId: null,
    });
    // Adding columns kept the history append-only.
    expect(() => database.sqlite.prepare('DELETE FROM task_events').run()).toThrow(/append-only/);
    // A task asked for by another cannot be erased from under it.
    database.sqlite.exec(
      "INSERT INTO tasks (id, project_id, title, stage_id, parent_task_id) VALUES ('t2', 'pr1', 'Pedido', 's1', 't1')",
    );
    expect(() => database.sqlite.prepare("DELETE FROM tasks WHERE id = 't1'").run()).toThrow(
      /FOREIGN KEY/,
    );
    expect(tableNames(database)).toEqual(EXPECTED_TABLES);
  });

  it('keep areas and their flows when adding saved templates (0007)', () => {
    const database = databaseUpTo(6);
    database.sqlite.exec(`
      INSERT INTO projects (id, name) VALUES ('pr1', 'Site');
      INSERT INTO workflow_stages (id, project_id, position, name, kind)
        VALUES ('s1', 'pr1', 0, 'Fila', 'human'), ('s2', 'pr1', 1, 'Fim', 'done');
      INSERT INTO workflow_transitions (id, project_id, from_stage_id, to_stage_id, actor)
        VALUES ('w1', 'pr1', 's1', 's2', 'human');
    `);

    runMigrations(database);

    expect(database.db.select({ id: workflowStages.id }).from(workflowStages).all()).toEqual([
      { id: 's1' },
      { id: 's2' },
    ]);
    expect(database.db.select().from(workflowTemplates).all()).toEqual([]);
    expect(tableNames(database)).toEqual(EXPECTED_TABLES);
  });
});

describe('task history (Phase 16)', () => {
  it('cannot be changed or erased, even directly in the database (0005)', () => {
    const database = memoryDatabase();
    const { agentId } = seedAgent(database);
    database.sqlite.exec(`
      INSERT INTO projects (id, name) VALUES ('pr1', 'Site');
      INSERT INTO workflow_stages (id, project_id, position, name, kind, agent_id)
        VALUES ('s1', 'pr1', 0, 'Fazer', 'agent', '${agentId}');
      INSERT INTO tasks (id, project_id, title, stage_id) VALUES ('t1', 'pr1', 'Tarefa', 's1');
      INSERT INTO task_events (id, task_id, kind, actor, text) VALUES ('e1', 't1', 'created', 'user', 'oi');
    `);
    expect(() => database.sqlite.prepare("UPDATE task_events SET text = 'outro'").run()).toThrow(
      /append-only/,
    );
    expect(() => database.sqlite.prepare('DELETE FROM task_events').run()).toThrow(/append-only/);
    // A stage with tasks in it, and an area with tasks, cannot be removed.
    expect(() =>
      database.sqlite.prepare("DELETE FROM workflow_stages WHERE id = 's1'").run(),
    ).toThrow(/FOREIGN KEY/);
    expect(() => database.sqlite.prepare("DELETE FROM projects WHERE id = 'pr1'").run()).toThrow(
      /FOREIGN KEY/,
    );
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
