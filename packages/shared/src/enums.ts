// Domain vocabularies shared by the database schema, the API and the UI.

export const PROVIDER_KINDS = ['ollama', 'openai_compatible', 'anthropic'] as const;
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

export const RUN_TRIGGERS = ['chat', 'manual', 'delegation'] as const;
export type RunTrigger = (typeof RUN_TRIGGERS)[number];

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
