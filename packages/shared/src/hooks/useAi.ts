import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AiCompleteBatchInputType,
  AiCompleteInputType,
  LlmProviderIdType,
  UpdateLlmProviderInputType,
} from '@repo/api-contract';
import { aiApi } from '../api/ai.api.js';

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
    mutationFn: ({ id, input }: { id: LlmProviderIdType; input: UpdateLlmProviderInputType }) =>
      aiApi.updateProvider(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai', 'providers'] }),
  });
};

export const useDeleteProvider = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: LlmProviderIdType) => aiApi.deleteProvider(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai', 'providers'] }),
  });
};

export const useTestProvider = () =>
  useMutation({
    mutationFn: ({ id, model }: { id: LlmProviderIdType; model?: string }) =>
      aiApi.testProvider(id, model),
  });

// Best-effort fetch — silent on failure (returns empty array). UI uses this
// to populate a datalist for autocomplete; users can always type a model
// id by hand if the list isn't available.
export const useProviderModels = (id: LlmProviderIdType, enabled = true) =>
  useQuery({
    queryKey: ['ai', 'providers', id, 'models'],
    queryFn: () => aiApi.listModels(id),
    enabled,
    retry: false,
    staleTime: 60_000,
  });
