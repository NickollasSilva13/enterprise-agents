import { runAcceptedSchema, runDetailSchema } from '@ea/shared';
import { newId } from '../../src/db/ids';
import { FakeProvider, waitFor } from '../fake-provider';
import { addAgent, addModel, addProject, addProvider } from '../fixtures';
import { makeApp } from '../helpers';

// Performance check (`npm run test:perf`): the real application, in process,
// over a database with far more history than a single user builds up in
// months, and then under a burst of runs. It prints what it measured and
// fails if a budget is exceeded. The budgets are generous on purpose: this
// is here to catch a query that stopped using its index or a screen that
// started reading the whole history, not to compare machines.

const VOLUME = {
  projects: 10,
  agents: 200,
  runs: 20_000,
  stepsPerRun: 6,
  conversations: 2_000,
  messagesPerConversation: 20,
  bigRunSteps: 400,
  tasks: 20_000,
} as const;

const SAMPLES = 40;
const READ_BUDGET_MS = 250;
const STREAM_BUDGET_MS = 3_000;
const BURST_BUDGET_MS = 10_000;

interface Row {
  readonly name: string;
  readonly median: number;
  readonly p95: number;
  readonly budget: number;
}

const percentile = (sorted: readonly number[], fraction: number) =>
  sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;

async function main(): Promise<void> {
  const STREAM_CHUNKS = 2_000;
  const provider = new FakeProvider({
    chunks: Array.from({ length: STREAM_CHUNKS }, (_, index) => `palavra${index} `),
  });
  const test = await makeApp({
    createProvider: () => provider,
    env: { MAX_CONCURRENT_RUNS: '4' },
  });
  const { sqlite } = test.database;
  const rows: Row[] = [];

  try {
    // ---- Volume ------------------------------------------------------------
    const seedStarted = performance.now();
    const modelId = addModel(test.database, addProvider(test.database), 'fake-model');
    const projectIds = Array.from({ length: VOLUME.projects }, (_, index) =>
      addProject(test.database, `Projeto ${index}`),
    );
    const agentIds = Array.from({ length: VOLUME.agents }, (_, index) =>
      addAgent(test.database, {
        name: `Agente ${String(index).padStart(3, '0')}`,
        modelId,
        projectId: projectIds[index % projectIds.length] ?? null,
        enabled: index % 10 !== 0,
      }),
    );

    const insertConversation = sqlite.prepare(
      'insert into conversations (id, agent_id, title) values (?, ?, ?)',
    );
    const insertMessage = sqlite.prepare(
      'insert into messages (id, conversation_id, run_id, role, content) values (?, ?, ?, ?, ?)',
    );
    const insertRun = sqlite.prepare(
      `insert into runs (id, agent_id, conversation_id, trigger, status, end_reason, error_message,
         input_tokens, output_tokens, started_at, finished_at, created_at)
       values (?, ?, ?, 'chat', ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertStep = sqlite.prepare(
      'insert into run_steps (id, run_id, seq, type, payload) values (?, ?, ?, ?, ?)',
    );
    const STATUSES = ['completed', 'completed', 'completed', 'failed', 'cancelled'] as const;
    const STEP_TYPES = [
      'run_started',
      'model_call_started',
      'model_call_finished',
      'tool_call_requested',
      'tool_call_finished',
      'run_finished',
    ] as const;
    const text = 'Texto de uma mensagem de tamanho comum, com algumas frases. '.repeat(6);

    let bigRunId = '';
    let sampleConversationId = '';
    sqlite.transaction(() => {
      const conversationIds: string[] = [];
      for (let index = 0; index < VOLUME.conversations; index += 1) {
        const id = newId();
        conversationIds.push(id);
        insertConversation.run(id, agentIds[index % agentIds.length], `Conversa ${index}`);
      }
      sampleConversationId = conversationIds[0] ?? '';

      const now = Date.now();
      for (let index = 0; index < VOLUME.runs; index += 1) {
        const id = newId();
        const conversationId = conversationIds[index % conversationIds.length] ?? null;
        const status = STATUSES[index % STATUSES.length] ?? 'completed';
        // Spread over thirty days, the newest last, as ids are.
        const at = new Date(now - (VOLUME.runs - index) * 130_000).toISOString();
        insertRun.run(
          id,
          agentIds[index % agentIds.length],
          conversationId,
          status,
          status === 'completed' ? 'completed' : 'provider_error',
          status === 'failed' ? 'O provedor recusou a requisição.' : null,
          900,
          250,
          at,
          at,
          at,
        );
        const steps = index === VOLUME.runs - 1 ? VOLUME.bigRunSteps : VOLUME.stepsPerRun;
        for (let seq = 1; seq <= steps; seq += 1) {
          insertStep.run(
            newId(),
            id,
            seq,
            STEP_TYPES[(seq - 1) % STEP_TYPES.length],
            JSON.stringify({ step: seq, tool: 'read_file', preview: text.slice(0, 200) }),
          );
        }
        if (index < VOLUME.conversations * (VOLUME.messagesPerConversation / 2)) {
          insertMessage.run(newId(), conversationId, id, 'user', JSON.stringify({ text }));
          insertMessage.run(newId(), conversationId, id, 'assistant', JSON.stringify({ text }));
        }
        if (index === VOLUME.runs - 1) bigRunId = id;
      }
    })();
    // Tasks for the global search (Phase 21), spread over the areas; the done
    // ones entered their area's done stage over the last two weeks, for the
    // indicators (Phase 30).
    const insertStage = sqlite.prepare(
      'insert into workflow_stages (id, project_id, position, name, kind) values (?, ?, ?, ?, ?)',
    );
    const insertTask = sqlite.prepare(
      'insert into tasks (id, project_id, title, stage_id, state) values (?, ?, ?, ?, ?)',
    );
    const insertEvent = sqlite.prepare(
      "insert into task_events (id, task_id, kind, actor, to_stage, created_at) values (?, ?, 'moved', 'agent', 'Pronto', ?)",
    );
    sqlite.transaction(() => {
      const stageIds = projectIds.map((projectId) => {
        const queue = newId();
        const done = newId();
        insertStage.run(queue, projectId, 0, 'Fila', 'human');
        insertStage.run(done, projectId, 1, 'Pronto', 'done');
        return { queue, done };
      });
      const twoWeeks = 14 * 24 * 60 * 60 * 1000;
      for (let index = 0; index < VOLUME.tasks; index += 1) {
        const area = index % projectIds.length;
        const open = index % 4 === 0;
        const taskId = newId();
        const stages = stageIds[area];
        insertTask.run(
          taskId,
          projectIds[area],
          `Relatório ${index} de vendas`,
          open ? stages?.queue : stages?.done,
          open ? 'open' : 'done',
        );
        if (!open)
          insertEvent.run(
            newId(),
            taskId,
            new Date(Date.now() - ((index * 7919) % twoWeeks)).toISOString(),
          );
      }
    })();
    const count = (table: string) =>
      (sqlite.prepare(`select count(*) as n from ${table}`).get() as { n: number }).n;
    console.log(
      `Banco preparado em ${Math.round(performance.now() - seedStarted)} ms: ` +
        `${count('agents')} agentes, ${count('runs')} execuções, ${count('run_steps')} passos, ` +
        `${count('conversations')} conversas, ${count('messages')} mensagens.\n`,
    );

    // ---- Reads over that volume --------------------------------------------
    const get = (url: string) => test.app.inject({ url, headers: test.trusted });
    const measure = async (name: string, url: string) => {
      const first = await get(url);
      if (first.statusCode !== 200)
        throw new Error(`${name}: ${url} respondeu ${first.statusCode}`);
      const times: number[] = [];
      for (let sample = 0; sample < SAMPLES; sample += 1) {
        const started = performance.now();
        await get(url);
        times.push(performance.now() - started);
      }
      times.sort((a, b) => a - b);
      rows.push({
        name,
        median: percentile(times, 0.5),
        p95: percentile(times, 0.95),
        budget: READ_BUDGET_MS,
      });
    };
    await measure('Painel', '/api/dashboard/summary');
    await measure('Escritório (200 agentes)', '/api/office');
    await measure('Lista de agentes', '/api/agents');
    await measure('Logs, primeira página', '/api/runs?limit=50');
    await measure('Logs, filtro por estado', '/api/runs?limit=50&status=failed');
    await measure('Logs, filtro por agente', `/api/runs?limit=50&agentId=${agentIds[7]}`);
    await measure(`Execução com ${VOLUME.bigRunSteps} passos`, `/api/runs/${bigRunId}`);
    await measure('Conversa com 20 mensagens', `/api/conversations/${sampleConversationId}`);
    await measure('Conversas de um agente', `/api/agents/${agentIds[0]}/conversations`);
    await measure('Aprovações', '/api/approvals');
    await measure(`Busca em ${VOLUME.tasks} tarefas`, '/api/search?q=relatorio');
    await measure(`Indicadores sobre ${VOLUME.tasks} tarefas`, '/api/indicators');
    await measure('Atividade recente', '/api/activity');

    // ---- A long streamed answer --------------------------------------------
    const post = async (payload: object) => {
      const response = await test.app.inject({
        method: 'POST',
        url: '/api/conversations',
        headers: test.trusted,
        payload,
      });
      if (response.statusCode !== 202) throw new Error(`mensagem recusada: ${response.body}`);
      return runAcceptedSchema.parse(response.json()).runId;
    };
    const finished = (runId: string) =>
      waitFor(async () => {
        const { run } = runDetailSchema.parse((await get(`/api/runs/${runId}`)).json());
        return run.finishedAt ? run : null;
      }, 60_000);
    // One in ten agents of the scenario is inactive and cannot be messaged.
    const active = agentIds.filter((_, index) => index % 10 !== 0);
    const worker = active[0] ?? '';

    const streamStarted = performance.now();
    const run = await finished(await post({ agentId: worker, content: 'responda' }));
    const streamMs = performance.now() - streamStarted;
    if (run.status !== 'completed') throw new Error(`execução terminou como ${run.status}`);
    rows.push({
      name: `Resposta de ${STREAM_CHUNKS} trechos, do envio ao fim`,
      median: streamMs,
      p95: streamMs,
      budget: STREAM_BUDGET_MS,
    });

    // ---- A burst of runs ---------------------------------------------------
    const BURST = 40;
    const burstStarted = performance.now();
    const runIds = await Promise.all(
      Array.from({ length: BURST }, (_, index) =>
        post({ agentId: active[index + 1], content: `rajada ${index}` }),
      ),
    );
    const outcomes = await Promise.all(runIds.map(finished));
    const burstMs = performance.now() - burstStarted;
    const failures = outcomes.filter((outcome) => outcome.status !== 'completed').length;
    if (failures > 0) throw new Error(`${failures} execuções da rajada não concluíram`);
    rows.push({
      name: `${BURST} execuções de ${STREAM_CHUNKS} trechos, 4 por vez`,
      median: burstMs,
      p95: burstMs,
      budget: BURST_BUDGET_MS,
    });
  } finally {
    await test.close();
  }

  const width = Math.max(...rows.map((row) => row.name.length));
  console.log(`${'Medição'.padEnd(width)}  mediana     p95   limite`);
  for (const row of rows) {
    const ms = (value: number) => `${value.toFixed(1)} ms`.padStart(9);
    const verdict = row.p95 > row.budget ? '  ACIMA DO LIMITE' : '';
    console.log(
      `${row.name.padEnd(width)} ${ms(row.median)} ${ms(row.p95)} ${`${row.budget} ms`.padStart(8)}${verdict}`,
    );
  }
  const over = rows.filter((row) => row.p95 > row.budget);
  if (over.length > 0) {
    console.error(`\n${over.length} medição(ões) acima do limite.`);
    process.exitCode = 1;
  } else {
    console.log('\nTodas as medições dentro do limite.');
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
