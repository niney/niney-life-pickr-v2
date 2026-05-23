import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AiCompleteBatchInputType,
  AiCompleteInputType,
  UpdateLlmProviderInputType,
} from '@repo/api-contract';
import { aiApi, type ProviderKey } from '../api/ai.api.js';

export const useCompleteAi = () =>
  useMutation({
    mutationFn: (input: AiCompleteInputType) => aiApi.complete(input),
  });

export const useCompleteBatchAi = () =>
  useMutation({
    mutationFn: (input: AiCompleteBatchInputType) => aiApi.completeBatch(input),
  });

export const useProviders = () =>
  useQuery({
    queryKey: ['ai', 'providers'],
    queryFn: aiApi.listProviders,
  });

export const useUpdateProvider = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, input }: { key: ProviderKey; input: UpdateLlmProviderInputType }) =>
      aiApi.updateProvider(key, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai', 'providers'] }),
  });
};

export const useDeleteProvider = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (key: ProviderKey) => aiApi.deleteProvider(key),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai', 'providers'] }),
  });
};

export const useTestProvider = () =>
  useMutation({
    mutationFn: ({ key, model }: { key: ProviderKey; model?: string }) =>
      aiApi.testProvider(key, model),
  });

// Best-effort fetch — silent on failure (returns empty array). UI uses this
// to populate a datalist for autocomplete; users can always type a model
// id by hand if the list isn't available.
export const useProviderModels = (key: ProviderKey, enabled = true) =>
  useQuery({
    queryKey: ['ai', 'providers', key.id, key.purpose, 'models'],
    queryFn: () => aiApi.listModels(key),
    enabled,
    retry: false,
    staleTime: 60_000,
  });
