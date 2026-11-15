import {
  conversationDetailSchema,
  conversationListSchema,
  runAcceptedSchema,
  runDetailSchema,
  runListSchema,
  type RunStatus,
  runSummarySchema,
} from '@ea/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiFetch, apiSend } from './api';
import { isActiveRun } from './run-labels';

/** While a run is active, re-read as a fallback in case the event stream drops. */
const ACTIVE_REFRESH_MS = 2000;

const enc = encodeURIComponent;

export const useConversations = (agentId: string) =>
  useQuery({
    queryKey: ['conversations', 'agent', agentId],
    queryFn: async () =>
      (await apiFetch(`/api/agents/${enc(agentId)}/conversations`, conversationListSchema))
        .conversations,
  });

export const useConversation = (id: string | undefined) =>
  useQuery({
    queryKey: ['conversations', 'detail', id],
    queryFn: () => apiFetch(`/api/conversations/${enc(id ?? '')}`, conversationDetailSchema),
    enabled: id !== undefined,
    refetchInterval: (query) => (query.state.data?.activeRunId ? ACTIVE_REFRESH_MS : false),
  });

/** A run changes what the chat, the logs, the dashboard and the office show. */
export function useRefreshRuns() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(
      [['conversations'], ['runs'], ['dashboard'], ['office'], ['agents'], ['approvals']].map(
        (queryKey) => queryClient.invalidateQueries({ queryKey }),
      ),
    );
}

/** Sends a message: the first of a new conversation, or the next of an existing one. */
export function useSendMessage(agentId: string) {
  const refresh = useRefreshRuns();
  return useMutation({
    mutationFn: ({ conversationId, content }: { conversationId?: string; content: string }) =>
      conversationId
        ? apiSend('POST', `/api/conversations/${enc(conversationId)}/messages`, runAcceptedSchema, {
            content,
          })
        : apiSend('POST', '/api/conversations', runAcceptedSchema, { agentId, content }),
    onSuccess: refresh,
  });
}

export function useCancelRun() {
  const refresh = useRefreshRuns();
  return useMutation({
    mutationFn: (runId: string) =>
      apiSend('POST', `/api/runs/${enc(runId)}/cancel`, runSummarySchema),
    // Also on failure: "already finished" means the screen was out of date.
    onSettled: refresh,
  });
}

export function useDeleteConversation() {
  const refresh = useRefreshRuns();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/api/conversations/${enc(id)}`),
    onSuccess: refresh,
  });
}

export const useRunDetail = (id: string | undefined) =>
  useQuery({
    queryKey: ['runs', 'detail', id],
    queryFn: () => apiFetch(`/api/runs/${enc(id ?? '')}`, runDetailSchema),
    enabled: id !== undefined,
    refetchInterval: (query) =>
      query.state.data && isActiveRun(query.state.data.run.status) ? ACTIVE_REFRESH_MS : false,
  });

export interface RunFilters {
  readonly agentId?: string;
  readonly status?: RunStatus;
  /** ISO date: only runs created from then on. */
  readonly from?: string;
}

export const RUN_PAGE_SIZE = 25;

export const useRuns = (filters: RunFilters) =>
  useInfiniteQuery({
    queryKey: ['runs', 'list', filters],
    queryFn: ({ pageParam }) => {
      const query = new URLSearchParams({ limit: String(RUN_PAGE_SIZE) });
      if (filters.agentId) query.set('agentId', filters.agentId);
      if (filters.status) query.set('status', filters.status);
      if (filters.from) query.set('from', filters.from);
      if (pageParam) query.set('before', pageParam);
      return apiFetch(`/api/runs?${query.toString()}`, runListSchema);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextBefore,
  });
