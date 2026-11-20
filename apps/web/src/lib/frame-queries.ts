import {
  type Guide,
  type GuideState,
  guideStateSchema,
  type Profile,
  profileSchema,
  searchResultsSchema,
  type TipId,
} from '@ea/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiSend } from './api';
import { useRequests, useWaitingTasks } from './task-queries';
import { useApprovals } from './tool-queries';

// The frame of every screen (Phase 21): global search, the user's card and
// what waits for the user (the bell and the menu counters).

/** Server results for the search box; nothing is asked while it is empty. */
export const useSearch = (query: string) =>
  useQuery({
    queryKey: ['search', query.trim()],
    queryFn: () =>
      apiFetch(`/api/search?q=${encodeURIComponent(query.trim())}`, searchResultsSchema),
    enabled: query.trim() !== '',
    // Typing one more letter keeps the last results on screen until the new ones arrive.
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });

export const useProfile = () =>
  useQuery({ queryKey: ['profile'], queryFn: () => apiFetch('/api/profile', profileSchema) });

export function useSaveProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (profile: Profile) => apiSend('PUT', '/api/profile', profileSchema, profile),
    onSuccess: (saved) => queryClient.setQueryData(['profile'], saved),
  });
}

/** The first steps and the tips (Phase 32): the choices kept on the server, and the steps done. */
export const useGuide = () =>
  useQuery({
    queryKey: ['guide'],
    queryFn: () => apiFetch('/api/guide', guideStateSchema),
    // The steps are done on other screens: read them again on every return to the office.
    staleTime: 0,
    refetchOnMount: 'always',
  });

/** Changes to the first steps and tips; each one shows at once and is then saved. */
export function useGuideActions() {
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: (guide: Guide) => apiSend('PUT', '/api/guide', guideStateSchema, guide),
    onMutate: (guide) => {
      const before = queryClient.getQueryData<GuideState>(['guide']);
      if (before) queryClient.setQueryData<GuideState>(['guide'], { ...before, ...guide });
      return before;
    },
    onError: (_error, _guide, before) => queryClient.setQueryData(['guide'], before),
    onSuccess: (saved) => queryClient.setQueryData(['guide'], saved),
  });
  const current = (): Guide => {
    const state = queryClient.getQueryData<GuideState>(['guide']);
    return { skipped: state?.skipped ?? false, dismissedTips: state?.dismissedTips ?? [] };
  };
  return {
    skip: () => save.mutate({ ...current(), skipped: true }),
    resume: () => save.mutate({ ...current(), skipped: false }),
    dismissTip: (tip: TipId) => {
      const guide = current();
      save.mutate({ ...guide, dismissedTips: [...guide.dismissedTips, tip] });
    },
    showTipsAgain: () => save.mutate({ ...current(), dismissedTips: [] }),
    error: save.error,
  };
}

export type AttentionKind = 'approval' | 'task' | 'request';

export interface AttentionItem {
  readonly id: string;
  readonly kind: AttentionKind;
  readonly title: string;
  readonly detail: string;
  readonly to: string;
}

/**
 * Everything waiting for the user, from the three lists that already exist
 * (D4): tool approvals, tasks stopped at the user, and requests between areas
 * waiting to be approved. Nothing is "read": an item leaves when it is
 * resolved, so the count is always true.
 */
export function useAttention() {
  const approvals = useApprovals('pending');
  const waiting = useWaitingTasks();
  const requests = useRequests();

  const approvalItems: AttentionItem[] = (approvals.data ?? []).map((approval) => ({
    id: `approval-${approval.id}`,
    kind: 'approval',
    title: `${approval.agentName} quer usar "${approval.toolTitle}"`,
    detail: 'Aprovação de ferramenta',
    to: '/aprovacoes',
  }));
  const taskItems: AttentionItem[] = (waiting.data ?? []).map((task) => ({
    id: `task-${task.id}`,
    kind: 'task',
    title: task.title,
    detail: task.attention ?? `${task.areaName} · na etapa ${task.stageName}`,
    to: `/tarefas/${task.id}`,
  }));
  const requestItems: AttentionItem[] = (requests.data ?? [])
    .filter((request) => request.state === 'pending')
    .map((request) => ({
      id: `request-${request.id}`,
      kind: 'request',
      title: request.title,
      detail: `Pedido de ${request.fromAreaName} para ${request.toAreaName}`,
      to: `/tarefas/${request.id}`,
    }));

  const sources = [approvals, waiting, requests];
  return {
    items: [...approvalItems, ...taskItems, ...requestItems],
    counts: {
      approvals: approvalItems.length,
      tasks: taskItems.length + requestItems.length,
    },
    /** True until every list answered once. */
    isPending: sources.some((source) => source.isPending),
    /** Some list could not be read: the count may be short. */
    isError: sources.some((source) => source.isError && !source.data),
  };
}
