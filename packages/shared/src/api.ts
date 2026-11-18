import { z } from 'zod';
import { appearanceSchema } from './appearance';
import { RUN_STATUSES, RUN_TRIGGERS } from './enums';
import { officeLayoutSchema } from './office';

/** Every API error response has this shape (RNF-08). */
export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  version: z.string(),
  uptimeSeconds: z.number().nonnegative(),
  database: z.enum(['ok', 'error']),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const sessionResponseSchema = z.object({
  ok: z.literal(true),
});
export type SessionResponse = z.infer<typeof sessionResponseSchema>;

/**
 * What the UI shows for an agent. Derived from the agent and its runs:
 * inactive (disabled), idle, working, waiting (needs the user), failed (last run failed).
 */
export const AGENT_STATES = ['inactive', 'idle', 'working', 'waiting', 'failed'] as const;
export const agentStateSchema = z.enum(AGENT_STATES);
export type AgentState = z.infer<typeof agentStateSchema>;

const count = z.number().int().nonnegative();

export const recentRunSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  agentName: z.string(),
  status: z.enum(RUN_STATUSES),
  trigger: z.enum(RUN_TRIGGERS),
  createdAt: z.string(),
  durationMs: z.number().nonnegative().nullable(),
});
export type RecentRun = z.infer<typeof recentRunSchema>;

export const DASHBOARD_ALERT_KINDS = [
  'no_provider',
  'agents_without_model',
  'failed_agents',
  'pending_approvals',
  'provider_unreachable',
] as const;

export const dashboardAlertSchema = z.object({
  kind: z.enum(DASHBOARD_ALERT_KINDS),
  severity: z.enum(['info', 'warning', 'error']),
  count,
});
export type DashboardAlert = z.infer<typeof dashboardAlertSchema>;

/** One line of the activity feed: something an agent started or finished. */
export const activityItemSchema = z.object({
  /** Stable key: run id plus step sequence. */
  id: z.string(),
  runId: z.string(),
  agentId: z.string(),
  agentName: z.string(),
  kind: z.enum(['started', 'finished']),
  /** Final status, for `finished`. */
  status: z.enum(RUN_STATUSES).nullable(),
  at: z.string(),
});
export type ActivityItem = z.infer<typeof activityItemSchema>;

export const dashboardSummarySchema = z.object({
  agents: z.object({
    total: count,
    /** Enabled agents, whatever they are doing. */
    active: count,
    inactive: count,
    failed: count,
    working: count,
    waiting: count,
  }),
  runs: z.object({
    active: count,
    waitingApproval: count,
    last24h: z.object({
      finished: count,
      completed: count,
      failed: count,
      /** 0..1; null while nothing has finished. */
      successRate: z.number().min(0).max(1).nullable(),
      averageDurationMs: z.number().nonnegative().nullable(),
      inputTokens: count,
      outputTokens: count,
    }),
  }),
  pendingApprovals: count,
  providers: count,
  recentRuns: z.array(recentRunSchema),
  activity: z.array(activityItemSchema),
  alerts: z.array(dashboardAlertSchema),
  generatedAt: z.string(),
});
export type DashboardSummary = z.infer<typeof dashboardSummarySchema>;

export const officeAgentSchema = z.object({
  id: z.string(),
  name: z.string(),
  objective: z.string(),
  projectId: z.string().nullable(),
  /** Null: the look drawn from the id (`defaultAppearance`). */
  appearance: appearanceSchema.nullable(),
  state: agentStateSchema,
  /** What the agent is doing now: its run in progress, if any. */
  currentRun: z
    .object({
      id: z.string(),
      conversationId: z.string().nullable(),
      status: z.enum(RUN_STATUSES),
      /** Start of the message being answered; shown in the activity balloon. */
      prompt: z.string().nullable(),
    })
    .nullable(),
  /** Why the last run failed, when the agent is in the failed state. */
  lastError: z.string().nullable(),
  /** The decision this agent is waiting for, so it can be given at the desk (RF-09). */
  pendingApproval: z.object({ id: z.string(), toolTitle: z.string() }).nullable(),
  /** Agents working right now on a task this agent delegated (RF-09). */
  delegatingTo: z.array(z.string()),
  /**
   * Since when the agent has had nothing to do; null unless it is idle.
   * Derived, never stored: it decides who has gone to the pantry (RF-80).
   */
  idleSince: z.string().nullable(),
  /**
   * The agent is taking a request to another area's room until `until`
   * (Phase 17). Derived from the task history, never stored.
   */
  visit: z.object({ areaId: z.string(), until: z.string() }).nullable().default(null),
});
export type OfficeAgent = z.infer<typeof officeAgentSchema>;

export const officeProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
});
export type OfficeProject = z.infer<typeof officeProjectSchema>;

export const officeSchema = z.object({
  layout: officeLayoutSchema,
  /** False while the layout is the automatic one, rebuilt from the projects on every read. */
  customized: z.boolean(),
  projects: z.array(officeProjectSchema),
  /** Every agent, by name. */
  agents: z.array(officeAgentSchema),
});
export type Office = z.infer<typeof officeSchema>;

export const systemInfoSchema = z.object({
  version: z.string(),
  nodeVersion: z.string(),
  platform: z.string(),
  environment: z.enum(['development', 'production', 'test']),
  address: z.string(),
  dataDir: z.string(),
  databasePath: z.string(),
  maxConcurrentRuns: z.number().int().positive(),
  /** Where API keys are kept: the OS vault, or memory only (tests). */
  secretStore: z.enum(['os', 'memory']),
  startedAt: z.string(),
});
export type SystemInfo = z.infer<typeof systemInfoSchema>;
