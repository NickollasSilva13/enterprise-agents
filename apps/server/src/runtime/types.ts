import type { ApprovalStatus, RunEndReason, ToolCallStatus, ToolPermission } from '@ea/shared';
import type { ChatMessage, ModelProvider } from '../providers/types';
import type { ToolDefinition } from '../tools/types';

/** Hard limits of one run (SECURITY C-13). */
export interface RunLimits {
  /** Model calls allowed in the run. */
  readonly maxSteps: number;
  readonly maxDurationMs: number;
  /** Input plus output tokens; null means no limit. */
  readonly maxTotalTokens: number | null;
}

/**
 * Everything a run needs, resolved at the moment it starts (not when it was
 * queued), so a run never uses an agent configuration that has since changed.
 */
export interface RunPlan {
  readonly provider: ModelProvider;
  readonly model: string;
  readonly system: string;
  readonly messages: readonly ChatMessage[];
  readonly temperature: number;
  readonly maxOutputTokens: number;
  readonly limits: RunLimits;
  /** Credentials in use, so they can be removed from anything logged. */
  readonly knownSecrets: readonly string[];
  /** Tools offered to the model. Offering is not permission: see `grants`. */
  readonly tools: readonly ToolDefinition[];
  /** What the user granted to this agent, by tool name (SECURITY C-15). */
  readonly grants: ReadonlyMap<string, ToolPermission>;
  /** Off-by-default tools the user switched on for the installation. */
  readonly enabledTools: ReadonlySet<string>;
  /** The agent's own folder; file tools never leave it (SECURITY C-17). */
  readonly workspaceDir: string;
}

export type FinalRunStatus = 'completed' | 'failed' | 'cancelled' | 'timed_out' | 'interrupted';

export interface RunOutcome {
  readonly status: FinalRunStatus;
  readonly endReason: RunEndReason;
  /** A sentence that is safe to show; null when nothing went wrong. */
  readonly errorMessage: string | null;
  readonly inputTokens: number;
  readonly outputTokens: number;
  /** What the model wrote, complete or not. Kept even when the run is cut short. */
  readonly text: string;
}

/** Identifies a run to the runtime without it reading the database. */
export interface RunRef {
  readonly runId: string;
  readonly agentId: string;
  readonly conversationId: string | null;
}

export interface ToolCallRecord {
  readonly toolName: string;
  readonly arguments: Record<string, unknown>;
  /** What the PermissionEngine answered for this call. */
  readonly permission: ToolPermission;
  readonly status: ToolCallStatus;
}

export interface ToolCallUpdate {
  readonly status: ToolCallStatus;
  readonly result?: string;
  readonly errorMessage?: string;
}

/** A tool call that ran, for the audit trail (SECURITY C-23). */
export interface ToolAuditEntry {
  readonly runId: string;
  readonly agentId: string;
  readonly toolName: string;
  readonly toolCallId: string;
  readonly approved: boolean;
  readonly failed: boolean;
  readonly arguments: Record<string, unknown>;
}

/**
 * The runtime's only way to persist (it never touches the database itself).
 * Implemented by the runs module.
 */
export interface RunStore {
  /** Marks the run as running. */
  begin(runId: string): void;
  /** Records the final state and, if there is text, the assistant message. */
  finish(runId: string, outcome: RunOutcome): void;
  /** Moves a run between working and waiting for the user. */
  setStatus(runId: string, status: 'running' | 'waiting_approval'): void;
  /** Records a tool call and returns its id. */
  createToolCall(runId: string, call: ToolCallRecord): string;
  updateToolCall(toolCallId: string, update: ToolCallUpdate): void;
  /** Opens a request for the user's decision and returns its id. */
  createApproval(runId: string, toolCallId: string): string;
  resolveApproval(
    approvalId: string,
    status: Exclude<ApprovalStatus, 'pending'>,
    reason: string | null,
  ): void;
  auditToolCall(entry: ToolAuditEntry): void;
}

/** What `RunManagerDeps.spawnChild` answers: a run ready to execute, or why not. */
export type ChildRun =
  { readonly ref: RunRef; readonly agentName: string } | { readonly refused: string };

/**
 * Thrown by the plan resolver when the run cannot start any more, for
 * instance because the agent was deactivated while the run waited in the
 * queue. The message is shown to the user.
 */
export class RunNotRunnableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RunNotRunnableError';
  }
}
