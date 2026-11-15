import { approvalDecisionSchema, type ApprovalList, approvalListQuerySchema } from '@ea/shared';
import type { FastifyInstance } from 'fastify';
import { idParamSchema, parseInput } from '../../http/error-handler';
import type { RunsContext } from '../runs/service';
import { decideApproval, listApprovals } from './service';

export function registerApprovalRoutes(app: FastifyInstance, deps: { runs: RunsContext }): void {
  const { db, registry } = deps.runs;

  app.get('/api/approvals', async (request): Promise<ApprovalList> => {
    const { status } = parseInput(approvalListQuerySchema, request.query);
    return { approvals: listApprovals(db, registry, status ?? 'pending') };
  });

  app.post('/api/approvals/:id/decision', async (request) =>
    decideApproval(
      deps.runs,
      parseInput(idParamSchema, request.params).id,
      parseInput(approvalDecisionSchema, request.body),
    ),
  );
}
