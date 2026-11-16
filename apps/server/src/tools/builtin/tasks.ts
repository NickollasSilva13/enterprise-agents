import { REQUEST_LIMITS, TASK_LIMITS } from '@ea/shared';
import { z } from 'zod';
import { type ToolDefinition, toolError } from '../types';
import { resolveToolPath, WorkspacePathError } from '../workspace';

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

export const REQUEST_FROM_AREA_TOOL_NAME = 'request_from_area';

interface RequestInput {
  area: string;
  title: string;
  description: string;
  acceptance?: string;
  files?: string[];
}

/**
 * Asks another area for work (Phase 17). The request becomes a task on the
 * other area's board and this task waits for its delivery. Whether this area
 * may ask that one is a rule the user set, checked by the server (D2); the
 * files go through the path resolver here and are copied by the server (D3).
 */
export const requestFromAreaTool: ToolDefinition<RequestInput> = {
  name: REQUEST_FROM_AREA_TOOL_NAME,
  title: 'Pedir trabalho a outra área',
  summary:
    'Cria um pedido no quadro de outra área, quando uma regra do usuário permite; a tarefa espera a entrega.',
  description:
    'Pede trabalho a outra área, pelo nome. O pedido vira uma tarefa no quadro dela e esta tarefa espera a entrega; quando ela chega, você volta a esta tarefa com o resultado. Em "files", liste arquivos ou pastas (os seus ou de "area/") para mandar uma cópia junto. Depois de pedir, termine a sua resposta.',
  risk: 'medium',
  scope: 'task',
  inputSchema: z.strictObject({
    area: z.string().trim().min(1).max(80),
    title: z.string().trim().min(1).max(TASK_LIMITS.title),
    description: z.string().trim().min(1, 'Explique o que precisa.').max(TASK_LIMITS.description),
    acceptance: z.string().trim().max(TASK_LIMITS.acceptance).optional(),
    files: z.array(z.string().trim().min(1).max(400)).max(REQUEST_LIMITS.paths).optional(),
  }),
  execute: async (input, context) => {
    if (!context.task) return toolError(NOT_IN_TASK);
    const files: string[] = [];
    for (const path of input.files ?? []) {
      try {
        files.push(
          resolveToolPath({ workspaceDir: context.workspaceDir, area: context.area }, path, 'read')
            .absolute,
        );
      } catch (error) {
        if (error instanceof WorkspacePathError) return toolError(`${path}: ${error.message}`);
        throw error;
      }
    }
    return context.task.request({
      area: input.area,
      title: input.title,
      description: input.description,
      acceptance: input.acceptance ?? '',
      files,
    });
  },
};
