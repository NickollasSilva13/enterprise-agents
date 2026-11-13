import {
  connectionTestSchema,
  modelSyncResultSchema,
  type ModelUpdate,
  type ProviderCreate,
  providerListSchema,
  providerModelListSchema,
  providerModelSchema,
  providerSchema,
  type ProviderUpdate,
} from '@ea/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiFetch, apiSend } from './api';

const providerPath = (id: string) => `/api/providers/${encodeURIComponent(id)}`;

export const useProviders = () =>
  useQuery({
    queryKey: ['providers'],
    queryFn: async () => (await apiFetch('/api/providers', providerListSchema)).providers,
  });

export const useProviderModels = (providerId: string) =>
  useQuery({
    queryKey: ['providers', providerId, 'models'],
    queryFn: async () =>
      (await apiFetch(`${providerPath(providerId)}/models`, providerModelListSchema)).models,
  });

/**
 * Providers and models decide which agents can run, so a change refreshes the
 * provider list, the model options, the agents and the dashboard alerts.
 */
function useRefreshProviders() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(
      [['providers'], ['models'], ['agents'], ['dashboard']].map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    );
}

export function useCreateProvider() {
  const refresh = useRefreshProviders();
  return useMutation({
    mutationFn: (input: ProviderCreate) => apiSend('POST', '/api/providers', providerSchema, input),
    onSuccess: refresh,
  });
}

export function useUpdateProvider() {
  const refresh = useRefreshProviders();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ProviderUpdate }) =>
      apiSend('PATCH', providerPath(id), providerSchema, patch),
    onSuccess: refresh,
  });
}

export function useDeleteProvider() {
  const refresh = useRefreshProviders();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(providerPath(id)),
    onSuccess: (_result, id) => {
      // Its model list no longer exists; refetching it would only fail.
      queryClient.removeQueries({ queryKey: ['providers', id, 'models'] });
      return refresh();
    },
  });
}

/** The result says whether it worked; a failed test is not an error. */
export const useTestProvider = () =>
  useMutation({
    mutationFn: (id: string) => apiSend('POST', `${providerPath(id)}/test`, connectionTestSchema),
  });

export function useSyncModels() {
  const refresh = useRefreshProviders();
  return useMutation({
    mutationFn: (id: string) =>
      apiSend('POST', `${providerPath(id)}/models/sync`, modelSyncResultSchema),
    onSuccess: refresh,
  });
}

export function useUpdateModel() {
  const refresh = useRefreshProviders();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ModelUpdate }) =>
      apiSend('PATCH', `/api/models/${encodeURIComponent(id)}`, providerModelSchema, patch),
    onSuccess: refresh,
  });
}
