import { z } from 'zod';
import {
  STAGE_KINDS,
  TASK_EVENT_KINDS,
  TASK_PRIORITIES,
  TASK_STATES,
  TRANSITION_ACTORS,
  AUDIT_ACTORS,
} from './enums';

// Contract of areas, their workflows and the task board (Phase 16).
// An area is a project (decision D1); these schemas only add what is new.

const id = z.string().min(1).max(40);
const count = z.number().int().nonnegative();

export const WORKFLOW_LIMITS = { stageName: 40, stages: 12, transitions: 60 } as const;

export const TASK_LIMITS = {
  title: 200,
  description: 20_000,
  acceptance: 5_000,
  note: 4_000,
  comment: 4_000,
  /** Times a task may go back to a stage it already went through (D4). */
  maxReturns: 3,
  /** Runs a task may start in total before it stops and asks the user (D4). */
  maxRuns: 20,
  /** Tasks listed on one board, newest first. */
  boardTasks: 500,
} as const;

// ---- Workflow ---------------------------------------------------------------

const stageName = z
  .string()
  .trim()
  .min(1, 'Dê um nome à etapa.')
  .max(
    WORKFLOW_LIMITS.stageName,
    `O nome da etapa pode ter até ${WORKFLOW_LIMITS.stageName} caracteres.`,
  );

/**
 * A stage as the editor sends it. `key` is the id of a stage that exists, or
 * any temporary key for a new one, so transitions can point at new stages.
 */
const stageInputSchema = z.strictObject({
  key: z.string().min(1).max(40),
  name: stageName,
  kind: z.enum(STAGE_KINDS),
  /** The agent that works this stage; only for `agent` stages. */
  agentId: id.nullable(),
});

const transitionInputSchema = z.strictObject({
  from: z.string().min(1).max(40),
  to: z.string().min(1).max(40),
  actor: z.enum(TRANSITION_ACTORS),
});

const sameText = (a: string, b: string) =>
  a.trim().toLocaleLowerCase('pt-BR') === b.trim().toLocaleLowerCase('pt-BR');

/**
 * The whole workflow of an area, saved at once. The rules that need only the
 * workflow itself live here; that a stage's agent belongs to the area is
 * checked by the server.
 */
export const workflowUpdateSchema = z
  .strictObject({
    stages: z
      .array(stageInputSchema)
      .min(2, 'O fluxo precisa de pelo menos duas etapas.')
      .max(WORKFLOW_LIMITS.stages, `O fluxo pode ter até ${WORKFLOW_LIMITS.stages} etapas.`),
    transitions: z
      .array(transitionInputSchema)
      .max(
        WORKFLOW_LIMITS.transitions,
        `O fluxo pode ter até ${WORKFLOW_LIMITS.transitions} passagens.`,
      ),
  })
  .superRefine((workflow, context) => {
    const problem = (message: string, path: (string | number)[]) =>
      context.addIssue({ code: 'custom', message, path });

    const byKey = new Map(workflow.stages.map((stage) => [stage.key, stage]));
    if (byKey.size !== workflow.stages.length) {
      problem('Há duas etapas com a mesma chave.', ['stages']);
    }
    workflow.stages.forEach((stage, index) => {
      if (workflow.stages.findIndex((other) => sameText(other.name, stage.name)) !== index) {
        problem(`Já existe uma etapa chamada "${stage.name}".`, ['stages', index, 'name']);
      }
      if (stage.kind !== 'agent' && stage.agentId !== null) {
        problem('Só uma etapa de agente tem responsável.', ['stages', index, 'agentId']);
      }
    });
    if (workflow.stages[0]?.kind === 'done') {
      problem('A primeira etapa não pode ser a final.', ['stages', 0, 'kind']);
    }
    if (!workflow.stages.some((stage) => stage.kind === 'done')) {
      problem('O fluxo precisa de uma etapa final.', ['stages']);
    }

    const pairs = new Set<string>();
    workflow.transitions.forEach((transition, index) => {
      const from = byKey.get(transition.from);
      const to = byKey.get(transition.to);
      if (!from || !to) {
        problem('A passagem aponta para uma etapa que não existe.', ['transitions', index]);
        return;
      }
      if (transition.from === transition.to) {
        problem('Uma passagem precisa ir para outra etapa.', ['transitions', index]);
      }
      const pair = `${transition.from}\u0000${transition.to}`;
      if (pairs.has(pair)) {
        problem(`A passagem de "${from.name}" para "${to.name}" está repetida.`, [
          'transitions',
          index,
        ]);
      }
      pairs.add(pair);
      // Nobody runs a task that waits for the user or is finished, so only
      // the user can move it from there.
      if (from.kind !== 'agent' && transition.actor !== 'human') {
        problem(`Só você pode tirar uma tarefa de "${from.name}".`, [
          'transitions',
          index,
          'actor',
        ]);
      }
    });
  });
export type WorkflowUpdate = z.infer<typeof workflowUpdateSchema>;

export const workflowStageSchema = z.object({
  id,
  name: z.string(),
  kind: z.enum(STAGE_KINDS),
  position: count,
  agentId: id.nullable(),
  agentName: z.string().nullable(),
  /** Tasks in this stage that are not finished. */
  openTasks: count,
});
export type WorkflowStage = z.infer<typeof workflowStageSchema>;

export const workflowTransitionSchema = z.object({
  id,
  fromStageId: id,
  toStageId: id,
  actor: z.enum(TRANSITION_ACTORS),
});
export type WorkflowTransition = z.infer<typeof workflowTransitionSchema>;

export const workflowSchema = z.object({
  areaId: id,
  stages: z.array(workflowStageSchema),
  transitions: z.array(workflowTransitionSchema),
});
export type Workflow = z.infer<typeof workflowSchema>;

// ---- Tasks ------------------------------------------------------------------

const title = z
  .string()
  .trim()
  .min(1, 'Informe o título da tarefa.')
  .max(TASK_LIMITS.title, `O título pode ter até ${TASK_LIMITS.title} caracteres.`);
const longText = (label: string, max: number) =>
  z.string().max(max, `${label}: o máximo é de ${max} caracteres.`);

export const taskCreateSchema = z.strictObject({
  title,
  description: longText('Descrição', TASK_LIMITS.description).default(''),
  acceptance: longText('Critérios de aceite', TASK_LIMITS.acceptance).default(''),
  priority: z.enum(TASK_PRIORITIES).default('normal'),
  /** Where the task starts; the first stage of the flow when absent. */
  stageId: id.optional(),
});
export type TaskCreate = z.infer<typeof taskCreateSchema>;
export type TaskCreateInput = z.input<typeof taskCreateSchema>;

export const taskUpdateSchema = z.strictObject({
  title: title.optional(),
  description: longText('Descrição', TASK_LIMITS.description).optional(),
  acceptance: longText('Critérios de aceite', TASK_LIMITS.acceptance).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
});
export type TaskUpdate = z.infer<typeof taskUpdateSchema>;

export const taskMoveSchema = z.strictObject({
  toStageId: id,
  note: longText('Nota', TASK_LIMITS.note).trim().default(''),
});
export type TaskMove = z.infer<typeof taskMoveSchema>;

export const taskCommentSchema = z.strictObject({
  text: longText('Comentário', TASK_LIMITS.comment).trim().min(1, 'Escreva o comentário.'),
});
export type TaskComment = z.infer<typeof taskCommentSchema>;

export const taskSummarySchema = z.object({
  id,
  areaId: id,
  title: z.string(),
  priority: z.enum(TASK_PRIORITIES),
  state: z.enum(TASK_STATES),
  stageId: id,
  stageName: z.string(),
  stageKind: z.enum(STAGE_KINDS),
  /** The agent of the current stage, if it is an agent stage with one. */
  agentId: id.nullable(),
  agentName: z.string().nullable(),
  /** Why the task stopped and waits for the user; null while it flows. */
  attention: z.string().nullable(),
  /** A run is working on the task right now (queued, running or waiting). */
  working: z.boolean(),
  /** Waits for its agent, who is busy with another task. */
  queued: z.boolean(),
  returns: count,
  runCount: count,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TaskSummary = z.infer<typeof taskSummarySchema>;

export const taskEventSchema = z.object({
  id,
  kind: z.enum(TASK_EVENT_KINDS),
  actor: z.enum(AUDIT_ACTORS),
  agentId: id.nullable(),
  agentName: z.string().nullable(),
  runId: id.nullable(),
  fromStageName: z.string().nullable(),
  toStageName: z.string().nullable(),
  /** A note, comment or explanation. Written by people or models: untrusted. */
  text: z.string(),
  createdAt: z.string(),
});
export type TaskEvent = z.infer<typeof taskEventSchema>;

export const taskDetailSchema = z.object({
  task: taskSummarySchema.extend({
    areaName: z.string(),
    description: z.string(),
    acceptance: z.string(),
  }),
  events: z.array(taskEventSchema),
  /** Where the user can move the task from its current stage. */
  moves: z.array(z.object({ stageId: id, stageName: z.string() })),
});
export type TaskDetail = z.infer<typeof taskDetailSchema>;

export const boardSchema = z.object({
  area: z.object({ id, name: z.string() }),
  workflow: workflowSchema,
  tasks: z.array(taskSummarySchema),
});
export type Board = z.infer<typeof boardSchema>;

/** Tasks that wait for the user, across every area. */
export const tasksWaitingSchema = z.object({
  tasks: z.array(taskSummarySchema.extend({ areaName: z.string() })),
});
export type TasksWaiting = z.infer<typeof tasksWaitingSchema>;

// ---- Areas from a template -----------------------------------------------------

export const areaFromTemplateSchema = z.strictObject({
  templateId: z.string().min(1).max(40),
  name: z
    .string()
    .trim()
    .min(1, 'Informe o nome da área.')
    .max(60, 'O nome pode ter até 60 caracteres.'),
  /** The model every agent of the area starts with; changed per agent later. */
  modelId: id,
});
export type AreaFromTemplate = z.infer<typeof areaFromTemplateSchema>;

export const areaCreatedSchema = z.object({
  areaId: id,
  agentIds: z.array(id),
});
export type AreaCreated = z.infer<typeof areaCreatedSchema>;
