import type { ToolPermission, ToolRisk } from '@ea/shared';
import { z, type ZodType } from 'zod';
import type { ToolSpec } from '../providers/types';

/** What a tool hands back to the model. */
export interface ToolResult {
  readonly content: string;
  /** The tool could not do what was asked; the model is told so. */
  readonly isError?: boolean;
}

/**
 * Everything a tool may touch. It gets no database, no secret store and no
 * HTTP layer: only the agent's own folder, a cancellation signal and, for
 * delegation, a function supplied by the runtime.
 */
export interface ToolContext {
  readonly agentId: string;
  readonly runId: string;
  /** The agent's working folder. File tools never leave it (SECURITY C-17). */
  readonly workspaceDir: string;
  readonly signal: AbortSignal;
  /** Hands a task to another agent and waits for its answer. */
  readonly delegate: (agentName: string, task: string) => Promise<ToolResult>;
}

export interface ToolDefinition<Input = unknown> {
  /** Identifier the model uses: lowercase with underscores. */
  readonly name: string;
  /** Name shown to the user. */
  readonly title: string;
  /** What the user is told this tool lets an agent do. */
  readonly summary: string;
  /** What the model is told. */
  readonly description: string;
  readonly risk: ToolRisk;
  /** Arguments, validated before anything else happens. */
  readonly inputSchema: ZodType<Input>;
  /**
   * True for a tool that only works after the user switches it on for the
   * whole installation, on top of granting it to an agent (C-20).
   */
  readonly offByDefault?: boolean;
  execute(input: Input, context: ToolContext): Promise<ToolResult>;
}

/** High-risk tools can never run without a person approving each call. */
export function maxPermission(risk: ToolRisk): ToolPermission {
  return risk === 'high' ? 'ask' : 'allow';
}

export function toToolSpec(tool: ToolDefinition): ToolSpec {
  const parameters = { ...z.toJSONSchema(tool.inputSchema) } as Record<string, unknown>;
  // The dialect marker means nothing to a model, and some providers reject it.
  delete parameters.$schema;
  return { name: tool.name, description: tool.description, parameters };
}

/** A failure the model can read and react to. Never a stack trace. */
export const toolError = (message: string): ToolResult => ({ content: message, isError: true });
