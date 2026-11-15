import {
  type AgentCreateInput,
  type AgentExport,
  agentExportSchema,
  agentImportResultSchema,
  agentListSchema,
  agentSchema,
  type AgentUpdate,
  dashboardSummarySchema,
  modelListSchema,
  officeSchema,
  type ProjectCreate,
  projectListSchema,
  projectSchema,
  type ProjectUpdate,
  systemInfoSchema,
} from '@ea/shared';
import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiFetch, apiSend } from './api';

/**
 * Screens refresh when the server announces a change (see `useLiveRefresh`).
 * This slower polling is only the safety net for a dropped event stream.
 */
export const REFRESH_MS = 15_000;

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true, staleTime: 2000 } },
  });
}

export const useDashboardSummary = () =>
  useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: () => apiFetch('/api/dashboard/summary', dashboardSummarySchema),
    refetchInterval: REFRESH_MS,
  });

export const useOffice = () =>
  useQuery({
    queryKey: ['office'],
    queryFn: () => apiFetch('/api/office', officeSchema),
    refetchInterval: REFRESH_MS,
  });

export const useSystemInfo = () =>
  useQuery({
    queryKey: ['system', 'info'],
    queryFn: () => apiFetch('/api/system/info', systemInfoSchema),
  });

export const useAgents = () =>
  useQuery({
    queryKey: ['agents'],
    queryFn: async () => (await apiFetch('/api/agents', agentListSchema)).agents,
    refetchInterval: REFRESH_MS,
  });

export const useAgent = (id: string | undefined) =>
  useQuery({
    queryKey: ['agents', id],
    queryFn: () => apiFetch(`/api/agents/${encodeURIComponent(id ?? '')}`, agentSchema),
    enabled: id !== undefined,
    // The form copies the agent once; refetching behind it would be wasted work.
    staleTime: Infinity,
    gcTime: 0,
  });

export const useProjects = () =>
  useQuery({
    queryKey: ['projects'],
    queryFn: async () => (await apiFetch('/api/projects', projectListSchema)).projects,
  });

export const useModels = () =>
  useQuery({
    queryKey: ['models'],
    queryFn: async () => (await apiFetch('/api/models', modelListSchema)).models,
  });

/**
 * Agents and projects show up in the list, the office, the dashboard and the
 * status strip, so every change refreshes all of them.
 */
function useRefreshAll() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(
      // Providers too: they show how many agents use them.
      [['agents'], ['projects'], ['office'], ['dashboard'], ['providers']].map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    );
}

const agentPath = (id: string) => `/api/agents/${encodeURIComponent(id)}`;
const projectPath = (id: string) => `/api/projects/${encodeURIComponent(id)}`;

export function useCreateAgent() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: (input: AgentCreateInput) => apiSend('POST', '/api/agents', agentSchema, input),
    onSuccess: refresh,
  });
}

export function useUpdateAgent() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: AgentUpdate }) =>
      apiSend('PATCH', agentPath(id), agentSchema, patch),
    onSuccess: refresh,
  });
}

export function useDuplicateAgent() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: (id: string) => apiSend('POST', `${agentPath(id)}/duplicate`, agentSchema),
    onSuccess: refresh,
  });
}

/** Every agent as a document that can be saved to a file (RF-20). */
export const fetchAgentExport = (): Promise<AgentExport> =>
  apiFetch('/api/agents/export', agentExportSchema);

/** Creates the agents of a file. The file is checked by the server, not here. */
export function useImportAgents() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: (document: unknown) =>
      apiSend('POST', '/api/agents/import', agentImportResultSchema, document),
    onSuccess: refresh,
  });
}

export function useDeleteAgent() {
  const refresh = useRefreshAll();
  return useMutation({ mutationFn: (id: string) => apiDelete(agentPath(id)), onSuccess: refresh });
}

export function useCreateProject() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: (input: ProjectCreate) => apiSend('POST', '/api/projects', projectSchema, input),
    onSuccess: refresh,
  });
}

export function useUpdateProject() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ProjectUpdate }) =>
      apiSend('PATCH', projectPath(id), projectSchema, patch),
    onSuccess: refresh,
  });
}

export function useDeleteProject() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: (id: string) => apiDelete(projectPath(id)),
    onSuccess: refresh,
  });
}
