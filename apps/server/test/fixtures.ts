import type { RunStatus, RunTrigger } from '@ea/shared';
import type { Database } from '../src/db/client';
import { newId } from '../src/db/ids';
import { agents, approvals, models, projects, providers, runs, toolCalls } from '../src/db/schema';

// Small builders for test data. Each returns the id it created.

export function addProvider(database: Database, name = 'Ollama local'): string {
  const id = newId();
  database.db
    .insert(providers)
    .values({ id, name, kind: 'ollama', baseUrl: 'http://127.0.0.1:11434', isExternal: false })
    .run();
  return id;
}

export function addModel(database: Database, providerId: string, name = 'llama3'): string {
  const id = newId();
  database.db.insert(models).values({ id, providerId, name, displayName: name }).run();
  return id;
}

export function addProject(database: Database, name: string, description = ''): string {
  const id = newId();
  database.db.insert(projects).values({ id, name, description }).run();
  return id;
}

export function addAgent(
  database: Database,
  values: Partial<typeof agents.$inferInsert> & { name: string },
): string {
  const id = newId();
  database.db
    .insert(agents)
    .values({ id, ...values })
    .run();
  return id;
}

export interface RunOptions {
  status: RunStatus;
  trigger?: RunTrigger;
  /** ISO timestamps; default to "now". */
  createdAt?: string;
  startedAt?: string;
  finishedAt?: string;
  inputTokens?: number;
  outputTokens?: number;
}

export function addRun(database: Database, agentId: string, options: RunOptions): string {
  const id = newId();
  database.db
    .insert(runs)
    .values({ id, agentId, trigger: options.trigger ?? 'manual', ...options })
    .run();
  return id;
}

/** A tool call paused on a pending approval, for the given run. */
export function addPendingApproval(database: Database, runId: string): string {
  const toolCallId = newId();
  database.db
    .insert(toolCalls)
    .values({
      id: toolCallId,
      runId,
      toolName: 'write_file',
      arguments: { path: 'notas.txt' },
      permissionDecision: 'ask',
      status: 'waiting_approval',
    })
    .run();
  const id = newId();
  database.db.insert(approvals).values({ id, runId, toolCallId }).run();
  return id;
}
