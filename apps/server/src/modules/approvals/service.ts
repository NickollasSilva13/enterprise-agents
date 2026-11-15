import type { Approval, ApprovalDecision } from '@ea/shared';
import { desc, eq, ne } from 'drizzle-orm';
import { ConflictError, NotFoundError } from '../../core/errors';
import type { Db } from '../../db/client';
import { agents, approvals, runs, toolCalls } from '../../db/schema';
import type { ToolRegistry } from '../../tools/registry';
import { recordAudit } from '../audit/service';
import { ancestry } from '../runs/repository';
import type { RunsContext } from '../runs/service';

const DECIDED_LIMIT = 30;

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function select(db: Db, registry: ToolRegistry, status: 'pending' | 'decided' | { id: string }) {
  const where =
    typeof status === 'object'
      ? eq(approvals.id, status.id)
      : status === 'pending'
        ? eq(approvals.status, 'pending')
        : ne(approvals.status, 'pending');
  const query = db
    .select({ approval: approvals, call: toolCalls, run: runs, agentName: agents.name })
    .from(approvals)
    .innerJoin(toolCalls, eq(approvals.toolCallId, toolCalls.id))
    .innerJoin(runs, eq(approvals.runId, runs.id))
    .innerJoin(agents, eq(runs.agentId, agents.id))
    .where(where)
    // Pending: oldest first, the order they should be answered in.
    .orderBy(status === 'decided' ? desc(approvals.id) : approvals.id)
    .limit(status === 'decided' ? DECIDED_LIMIT : 200);

  return query.all().map(({ approval, call, run, agentName }): Approval => {
    const tool = registry.get(call.toolName);
    return {
      id: approval.id,
      runId: run.id,
      originRunId: ancestry(db, run.id).at(-1)?.id ?? run.id,
      agentId: run.agentId,
      agentName,
      conversationId: run.conversationId,
      toolName: call.toolName,
      toolTitle: tool?.title ?? call.toolName,
      risk: tool?.risk ?? null,
      arguments: toRecord(call.arguments),
      status: approval.status,
      reason: approval.reason,
      createdAt: approval.createdAt,
      decidedAt: approval.decidedAt,
    };
  });
}

export function listApprovals(
  db: Db,
  registry: ToolRegistry,
  status: 'pending' | 'decided',
): Approval[] {
  return select(db, registry, status);
}

/**
 * Records the user's answer and lets the waiting run continue (SECURITY
 * C-16). The tool only ever runs after an "approve" given here.
 */
export function decideApproval(ctx: RunsContext, id: string, input: ApprovalDecision): Approval {
  const [approval] = select(ctx.db, ctx.registry, { id });
  if (!approval) throw new NotFoundError('Aprovação não encontrada.');

  const approved = input.decision === 'approve';
  const reason = input.reason ? input.reason : null;
  if (approval.status !== 'pending' || !ctx.manager.decideApproval(id, approved, reason)) {
    throw new ConflictError(
      'approval_not_pending',
      'Esta aprovação já foi respondida ou retirada.',
    );
  }
  recordAudit(ctx.db, {
    actor: 'user',
    action: approved ? 'approval.approved' : 'approval.denied',
    target: approval.toolName,
    agentId: approval.agentId,
    runId: approval.runId,
    details: { approvalId: id, reason },
  });
  const [updated] = select(ctx.db, ctx.registry, { id });
  return updated ?? approval;
}
