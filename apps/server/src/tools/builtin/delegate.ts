import { z } from 'zod';
import type { ToolDefinition } from '../types';

export const DELEGATE_LIMITS = { agent: 80, task: 8000 } as const;

/**
 * Hands a task to another agent. The work itself is done by the runtime,
 * which creates a child run: the other agent uses its own model, limits and
 * permissions, never those of whoever delegated (SECURITY C-22).
 */
export const delegateTool: ToolDefinition<{ agent: string; task: string }> = {
  name: 'delegate_to_agent',
  title: 'Delegar a agente',
  summary: 'Passa uma tarefa a outro agente e recebe a resposta dele.',
  description:
    'Entrega uma tarefa a outro agente, pelo nome, e devolve a resposta dele. Descreva a tarefa por completo: o outro agente não vê esta conversa.',
  risk: 'medium',
  inputSchema: z.strictObject({
    agent: z.string().trim().min(1).max(DELEGATE_LIMITS.agent),
    task: z.string().trim().min(1).max(DELEGATE_LIMITS.task),
  }),
  execute: (input, context) => context.delegate(input.agent, input.task),
};
