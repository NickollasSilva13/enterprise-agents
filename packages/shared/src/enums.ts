// Domain vocabularies shared by the database schema, the API and the UI.

export const PROVIDER_KINDS = [
  'ollama',
  'openai_compatible',
  'anthropic',
  'claude_code',
  'codex',
] as const;
export type ProviderKind = (typeof PROVIDER_KINDS)[number];

export const TOOL_PERMISSIONS = ['deny', 'ask', 'allow'] as const;
export type ToolPermission = (typeof TOOL_PERMISSIONS)[number];

export const RUN_STATUSES = [
  'queued',
  'running',
  'waiting_approval',
  'completed',
  'failed',
  'cancelled',
  'timed_out',
  'interrupted',
] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const ACTIVE_RUN_STATUSES: RunStatus[] = ['queued', 'running', 'waiting_approval'];

export const RUN_TRIGGERS = ['chat', 'manual', 'delegation', 'task'] as const;
export type RunTrigger = (typeof RUN_TRIGGERS)[number];

/** What an agent may do in its area's shared folder (Phase 16, D6). */
export const AREA_ACCESS = ['none', 'read', 'write'] as const;
export type AreaAccess = (typeof AREA_ACCESS)[number];

/** A stage is worked by an agent, waits for the user, or ends the flow. */
export const STAGE_KINDS = ['agent', 'human', 'done'] as const;
export type StageKind = (typeof STAGE_KINDS)[number];

/** Who may move a task along a transition. */
export const TRANSITION_ACTORS = ['agent', 'human', 'both'] as const;
export type TransitionActor = (typeof TRANSITION_ACTORS)[number];

/** `pending`: a request from another area that waits for the user's approval (Phase 17). */
export const TASK_STATES = ['pending', 'open', 'done', 'cancelled'] as const;
export type TaskState = (typeof TASK_STATES)[number];

export const TASK_PRIORITIES = ['normal', 'high'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_EVENT_KINDS = [
  'created',
  'edited',
  'moved',
  'commented',
  'run_started',
  'run_finished',
  'stopped',
  'resumed',
  'cancelled',
  // Requests between areas (Phase 17).
  'requested',
  'request_approved',
  'request_refused',
  'delivered',
] as const;
export type TaskEventKind = (typeof TASK_EVENT_KINDS)[number];

export const MESSAGE_ROLES = ['user', 'assistant', 'tool'] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];

export const TOOL_CALL_STATUSES = [
  'pending',
  'waiting_approval',
  'running',
  'completed',
  'failed',
  'denied',
  'cancelled',
] as const;
export type ToolCallStatus = (typeof TOOL_CALL_STATUSES)[number];

export const APPROVAL_STATUSES = ['pending', 'approved', 'denied', 'cancelled'] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const AUDIT_ACTORS = ['user', 'agent', 'system'] as const;
export type AuditActor = (typeof AUDIT_ACTORS)[number];
