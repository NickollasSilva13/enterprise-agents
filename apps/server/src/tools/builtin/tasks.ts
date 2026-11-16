import { TASK_LIMITS } from '@ea/shared';
import { z } from 'zod';
import { type ToolDefinition, toolError } from '../types';

// The tools of the task board (Phase 16). They exist only in a run that works
// on a task (scope 'task', decided by the PermissionEngine) and do nothing on
// their own: the task port checks every move against the area's workflow, so
// what the model writes can never take a task where the flow does not allow.

const NOT_IN_TASK = 'Esta execução não trabalha numa tarefa do quadro.';

export const MOVE_TASK_TOOL_NAME = 'move_task';
export const COMMENT_TASK_TOOL_NAME = 'comment_task';

export const moveTaskTool: ToolDefinition<{ stage: string; note: string }> = {
  name: MOVE_TASK_TOOL_NAME,
  title: 'Passar a tarefa adiante',
  summary: 'Move a tarefa em que o agente trabalha para a próxima etapa do fluxo.',
  description:
    'Move a tarefa em que você trabalha para outra etapa, pelo nome, com uma nota para quem vem depois. Só as etapas permitidas pelo fluxo são aceitas. Depois de mover, termine a sua resposta.',
  risk: 'low',
  scope: 'task',
  inputSchema: z.strictObject({
    stage: z.string().trim().min(1).max(80),
    note: z.string().trim().min(1, 'Escreva uma nota para quem vem depois.').max(TASK_LIMITS.note),
  }),
  execute: async (input, context) =>
    context.task ? context.task.move(input.stage, input.note) : toolError(NOT_IN_TASK),
};

export const commentTaskTool: ToolDefinition<{ text: string }> = {
  name: COMMENT_TASK_TOOL_NAME,
  title: 'Comentar na tarefa',
  summary: 'Registra uma dúvida, decisão ou observação no histórico da tarefa.',
  description:
    'Registra um comentário no histórico da tarefa em que você trabalha: uma dúvida, uma decisão, um problema encontrado.',
  risk: 'low',
  scope: 'task',
  inputSchema: z.strictObject({
    text: z.string().trim().min(1).max(TASK_LIMITS.comment),
  }),
  execute: async (input, context) =>
    context.task ? context.task.comment(input.text) : toolError(NOT_IN_TASK),
};
