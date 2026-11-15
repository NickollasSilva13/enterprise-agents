import { z } from 'zod';
import { RUN_STATUSES, RUN_TRIGGERS } from './enums';

// Contract for conversations, runs and their live events (Phase 7).

export const MESSAGE_LIMITS = { content: 20_000 } as const;

const id = z.string().min(1).max(40);

const content = z
  .string()
  .trim()
  .min(1, 'Escreva uma mensagem.')
  .max(
    MESSAGE_LIMITS.content,
    `A mensagem pode ter no máximo ${MESSAGE_LIMITS.content} caracteres.`,
  );

/** Starts a conversation with an agent by sending its first message. */
export const conversationStartSchema = z.strictObject({ agentId: id, content });
export type ConversationStart = z.infer<typeof conversationStartSchema>;

export const messageSendSchema = z.strictObject({ content });
export type MessageSend = z.infer<typeof messageSendSchema>;

/** Answer to both: the run was accepted and its progress arrives as events. */
export const runAcceptedSchema = z.object({ conversationId: id, runId: id });
export type RunAccepted = z.infer<typeof runAcceptedSchema>;

export const conversationSummarySchema = z.object({
  id,
  agentId: id,
  title: z.string(),
  messageCount: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ConversationSummary = z.infer<typeof conversationSummarySchema>;

export const conversationListSchema = z.object({
  conversations: z.array(conversationSummarySchema),
});

export const chatMessageSchema = z.object({
  id,
  role: z.enum(['user', 'assistant']),
  text: z.string(),
  runId: id.nullable(),
  createdAt: z.string(),
});
export type ChatMessageView = z.infer<typeof chatMessageSchema>;

/**
 * Why a run ended. Kept as text in the database so new reasons need no
 * migration; the UI falls back to the raw value for one it does not know.
 */
export const RUN_END_REASONS = [
  'completed',
  'max_tokens',
  'refusal',
  'cancelled_by_user',
  'time_limit',
  'token_limit',
  'step_limit',
  'provider_unreachable',
  'provider_timeout',
  'provider_error',
  'not_runnable',
  'shutdown',
  'server_restart',
  'parent_stopped',
  'internal_error',
] as const;
export type RunEndReason = (typeof RUN_END_REASONS)[number];

export const runSummarySchema = z.object({
  id,
  agentId: id,
  agentName: z.string(),
  /** The agent was deleted after this run; its history is kept (RN-07). */
  agentDeleted: z.boolean(),
  conversationId: id.nullable(),
  /** The run that delegated this one, if any (RF-61). */
  parentRunId: id.nullable(),
  trigger: z.enum(RUN_TRIGGERS),
  status: z.enum(RUN_STATUSES),
  endReason: z.string().nullable(),
  errorMessage: z.string().nullable(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  durationMs: z.number().nonnegative().nullable(),
});
export type RunSummary = z.infer<typeof runSummarySchema>;

export const conversationDetailSchema = z.object({
  conversation: conversationSummarySchema,
  messages: z.array(chatMessageSchema),
  runs: z.array(runSummarySchema),
  /** The run in progress, if any (RN-06 allows one per conversation). */
  activeRunId: id.nullable(),
});
export type ConversationDetail = z.infer<typeof conversationDetailSchema>;

/** Step types written by the runtime. */
export const RUN_STEP_TYPES = [
  'run_started',
  'model_call_started',
  'model_call_finished',
  'tool_call_requested',
  'approval_requested',
  'approval_decided',
  'tool_call_finished',
  'delegation_started',
  'delegation_finished',
  'error',
  'run_finished',
] as const;

export const runStepSchema = z.object({
  /** Order within the run; also the SSE event id used to resume. */
  seq: z.number().int().positive(),
  /** Open on purpose: an older UI must not break on a newer step type. */
  type: z.string(),
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
});
export type RunStep = z.infer<typeof runStepSchema>;

/** One run of a delegation tree, with how deep it is (the root is 0). */
export const runTreeNodeSchema = z.object({
  run: runSummarySchema,
  depth: z.number().int().nonnegative(),
});
export type RunTreeNode = z.infer<typeof runTreeNodeSchema>;

export const runDetailSchema = z.object({
  run: runSummarySchema,
  steps: z.array(runStepSchema),
  /** The whole delegation tree this run belongs to, parents before children. */
  tree: z.array(runTreeNodeSchema),
});
export type RunDetail = z.infer<typeof runDetailSchema>;

export const RUN_LIST_LIMITS = { default: 50, max: 200 } as const;

const isoDate = z.iso.datetime({ message: 'Data inválida.' });

export const runListQuerySchema = z.strictObject({
  agentId: id.optional(),
  status: z.enum(RUN_STATUSES).optional(),
  /** Inclusive bounds on when the run was created. */
  from: isoDate.optional(),
  to: isoDate.optional(),
  /** Paging: only runs older than this run id. */
  before: id.optional(),
  limit: z.coerce.number().int().min(1).max(RUN_LIST_LIMITS.max).optional(),
});
export type RunListQuery = z.infer<typeof runListQuerySchema>;

export const runListSchema = z.object({
  runs: z.array(runSummarySchema),
  /** Pass as `before` to read the next page; null on the last one. */
  nextBefore: id.nullable(),
});
export type RunList = z.infer<typeof runListSchema>;

// ---- Live events (Server-Sent Events) --------------------------------------

/** First event of a run stream: where the run stands right now. */
export const runSnapshotEventSchema = z.object({
  status: z.enum(RUN_STATUSES),
  /** Everything the model has written so far in this run. */
  text: z.string(),
});
export type RunSnapshotEvent = z.infer<typeof runSnapshotEventSchema>;

export const runDeltaEventSchema = z.object({ text: z.string() });

export const runEndEventSchema = z.object({ status: z.enum(RUN_STATUSES) });

/** Sent on the global stream whenever any run changes state. */
export const runChangedEventSchema = z.object({
  runId: id,
  agentId: id,
  conversationId: id.nullable(),
  status: z.enum(RUN_STATUSES),
});
export type RunChangedEvent = z.infer<typeof runChangedEventSchema>;
