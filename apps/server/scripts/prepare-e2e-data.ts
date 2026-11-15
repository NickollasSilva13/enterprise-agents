import { mkdirSync, rmSync } from 'node:fs';
import { sep } from 'node:path';
import { loadConfig } from '../src/config/env';
import { openDatabase, runMigrations } from '../src/db/client';
import {
  addAgent,
  addModel,
  addPendingApproval,
  addProject,
  addProvider,
  addRun,
} from '../test/fixtures';

// Prepares a throwaway database for the end-to-end tests, optionally with
// sample data (`--seed`). The seed includes two runs left active, as if the
// previous server had stopped in the middle of them: the server that starts
// next must mark them as interrupted (RN-12), and the tests check that.

const config = loadConfig(process.env);

// This script deletes DATA_DIR. Refuse anything that is not an e2e folder.
if (!config.dataDir.split(sep).includes('.e2e-data')) {
  console.error(`Recusado: ${config.dataDir} não é uma pasta de dados de teste (.e2e-data).`);
  process.exit(1);
}

rmSync(config.dataDir, { recursive: true, force: true });
mkdirSync(config.dataDir, { recursive: true });

const database = openDatabase(config.databasePath);
runMigrations(database);

if (process.argv.includes('--seed')) {
  const model = addModel(database, addProvider(database));
  const support = addProject(database, 'Atendimento', 'Responde clientes');
  const research = addProject(database, 'Pesquisa');
  addProject(database, 'Arquivo');

  const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

  const triage = addAgent(database, { name: 'Triagem', projectId: support, modelId: model });
  addRun(database, triage, { status: 'running', trigger: 'chat', startedAt: minutesAgo(1) });

  const replies = addAgent(database, { name: 'Respostas', projectId: support, modelId: model });
  addPendingApproval(
    database,
    addRun(database, replies, { status: 'waiting_approval', startedAt: minutesAgo(2) }),
  );

  const reader = addAgent(database, { name: 'Leitor', projectId: research, modelId: model });
  addRun(database, reader, {
    status: 'failed',
    createdAt: minutesAgo(30),
    startedAt: minutesAgo(30),
    finishedAt: minutesAgo(29),
  });

  // Idle for an hour: long enough to be found at the pantry (RF-80).
  const summarizer = addAgent(database, {
    name: 'Resumidor',
    projectId: research,
    createdAt: minutesAgo(90),
    updatedAt: minutesAgo(90),
  });
  addRun(database, summarizer, {
    status: 'completed',
    createdAt: minutesAgo(60),
    startedAt: minutesAgo(60),
    finishedAt: minutesAgo(58),
    inputTokens: 1200,
    outputTokens: 300,
  });

  addAgent(database, { name: 'Rascunho', modelId: model, enabled: false });
}

database.close();
