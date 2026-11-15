import {
  agentToolsSchema,
  type ApprovalDecision,
  approvalListSchema,
  approvalSchema,
  type ToolGrant,
  toolCatalogueSchema,
  toolInfoSchema,
} from '@ea/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiSend } from './api';
import { REFRESH_MS } from './queries';
import { useRefreshRuns } from './run-queries';

const enc = encodeURIComponent;

export const useTools = () =>
  useQuery({
    queryKey: ['tools'],
    queryFn: async () => (await apiFetch('/api/tools', toolCatalogueSchema)).tools,
  });

/** Switches an off-by-default tool on or off for the whole installation. */
export function useSetToolEnabled() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, enabled }: { name: string; enabled: boolean }) =>
      apiSend('PATCH', `/api/tools/${enc(name)}`, toolInfoSchema, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tools'] }),
  });
}

export const useAgentTools = (agentId: string | undefined) =>
  useQuery({
    queryKey: ['agent-tools', agentId],
    queryFn: () => apiFetch(`/api/agents/${enc(agentId ?? '')}/tools`, agentToolsSchema),
    enabled: agentId !== undefined,
  });

export function useSetAgentTools() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, grants }: { agentId: string; grants: ToolGrant[] }) =>
      apiSend('PUT', `/api/agents/${enc(agentId)}/tools`, agentToolsSchema, { grants }),
    onSuccess: (saved) => queryClient.setQueryData(['agent-tools', saved.agentId], saved),
  });
}

export const useApprovals = (status: 'pending' | 'decided' = 'pending') =>
  useQuery({
    queryKey: ['approvals', status],
    queryFn: async () =>
      (await apiFetch(`/api/approvals?status=${status}`, approvalListSchema)).approvals,
    refetchInterval: REFRESH_MS,
  });

export function useDecideApproval() {
  const refresh = useRefreshRuns();
  return useMutation({
    mutationFn: ({ id, ...decision }: ApprovalDecision & { id: string }) =>
      apiSend('POST', `/api/approvals/${enc(id)}/decision`, approvalSchema, decision),
    // Also on failure: "already answered" means the screen was out of date.
    onSettled: refresh,
  });
}
