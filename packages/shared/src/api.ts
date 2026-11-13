import { z } from 'zod';
import { RUN_STATUSES, RUN_TRIGGERS } from './enums';

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
] as const;

export const dashboardAlertSchema = z.object({
  kind: z.enum(DASHBOARD_ALERT_KINDS),
  severity: z.enum(['info', 'warning', 'error']),
  count,
});
export type DashboardAlert = z.infer<typeof dashboardAlertSchema>;

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
  alerts: z.array(dashboardAlertSchema),
  generatedAt: z.string(),
});
export type DashboardSummary = z.infer<typeof dashboardSummarySchema>;

export const officeAgentSchema = z.object({
  id: z.string(),
  name: z.string(),
  objective: z.string(),
  state: agentStateSchema,
});
export type OfficeAgent = z.infer<typeof officeAgentSchema>;

export const officeRoomSchema = z.object({
  /** Project id; null for the room that holds agents without a project. */
  id: z.string().nullable(),
  name: z.string(),
  description: z.string(),
  agents: z.array(officeAgentSchema),
});
export type OfficeRoom = z.infer<typeof officeRoomSchema>;

export const officeSchema = z.object({
  rooms: z.array(officeRoomSchema),
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
