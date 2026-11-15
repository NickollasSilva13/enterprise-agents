import { z } from 'zod';
import { APPROVAL_STATUSES, TOOL_PERMISSIONS } from './enums';

// Contract for tools, per-agent permissions and approvals (Phase 8).

export const TOOL_RISKS = ['low', 'medium', 'high'] as const;
export type ToolRisk = (typeof TOOL_RISKS)[number];

const id = z.string().min(1).max(40);
const toolName = z.string().min(1).max(41);
const permission = z.enum(TOOL_PERMISSIONS);

export const toolInfoSchema = z.object({
  name: toolName,
  title: z.string(),
  /** What the tool lets an agent do, in words for the user. */
  summary: z.string(),
  risk: z.enum(TOOL_RISKS),
  /** The most an agent can be given: high-risk tools stop at "ask". */
  maxPermission: permission,
  /** Only works after being switched on for the whole installation. */
  offByDefault: z.boolean(),
  enabled: z.boolean(),
});
export type ToolInfo = z.infer<typeof toolInfoSchema>;

export const toolCatalogueSchema = z.object({ tools: z.array(toolInfoSchema) });
export type ToolCatalogue = z.infer<typeof toolCatalogueSchema>;

export const toolSettingSchema = z.strictObject({ enabled: z.boolean() });
export type ToolSetting = z.infer<typeof toolSettingSchema>;

export const toolGrantSchema = z.strictObject({ toolName, permission });
export type ToolGrant = z.infer<typeof toolGrantSchema>;

export const agentToolsSchema = z.object({
  agentId: id,
  /** Folder on this machine where the agent's file tools work. */
  workspacePath: z.string(),
  /** False when the agent's model cannot call tools; null without a model. */
  modelSupportsTools: z.boolean().nullable(),
  /** Tools that are not listed are blocked. */
  grants: z.array(toolGrantSchema),
});
export type AgentTools = z.infer<typeof agentToolsSchema>;

export const agentToolsUpdateSchema = z.strictObject({
  grants: z.array(toolGrantSchema).max(50),
});
export type AgentToolsUpdate = z.infer<typeof agentToolsUpdateSchema>;

export const APPROVAL_LIMITS = { reason: 500 } as const;

export const approvalSchema = z.object({
  id,
  runId: id,
  /** First run of the delegation chain: the one the user started. */
  originRunId: id,
  agentId: id,
  agentName: z.string(),
  conversationId: id.nullable(),
  toolName,
  toolTitle: z.string(),
  risk: z.enum(TOOL_RISKS).nullable(),
  /** Exactly what the tool will receive. */
  arguments: z.record(z.string(), z.unknown()),
  status: z.enum(APPROVAL_STATUSES),
  reason: z.string().nullable(),
  createdAt: z.string(),
  decidedAt: z.string().nullable(),
});
export type Approval = z.infer<typeof approvalSchema>;

export const approvalListSchema = z.object({ approvals: z.array(approvalSchema) });
export type ApprovalList = z.infer<typeof approvalListSchema>;

export const approvalListQuerySchema = z.strictObject({
  /** "pending" (default) or "decided": the latest ones already answered. */
  status: z.enum(['pending', 'decided']).optional(),
});

export const approvalDecisionSchema = z.strictObject({
  decision: z.enum(['approve', 'deny']),
  reason: z
    .string()
    .trim()
    .max(
      APPROVAL_LIMITS.reason,
      `O motivo pode ter no máximo ${APPROVAL_LIMITS.reason} caracteres.`,
    )
    .optional(),
});
export type ApprovalDecision = z.infer<typeof approvalDecisionSchema>;
