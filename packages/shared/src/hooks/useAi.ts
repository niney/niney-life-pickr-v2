import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AiCompleteBatchInputType,
  AiCompleteInputType,
  PreviewLlmModelsInputType,
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

// 설정을 바꾼 뒤에는 목록만 정확 일치로 다시 받는다. ['ai','providers'] 접두사로
// 무효화하면 모델 카탈로그(['ai','providers',id,purpose,'models'] — 서버가 캐시 없이
// 외부 /api/tags 를 부른다)까지 저장할 때마다 재요청된다. 카탈로그는 키·Base URL 이
// 바뀌어 내용이 달라질 수 있을 때만(catalogOf) 함께 무효화한다.
const invalidateProviders = (
  qc: ReturnType<typeof useQueryClient>,
  catalogOf?: ProviderKey['id'],
): Promise<void> => {
  if (catalogOf) void qc.invalidateQueries({ queryKey: ['ai', 'providers', catalogOf] });
  return qc.invalidateQueries({ queryKey: ['ai', 'providers'], exact: true });
};

export const useUpdateProvider = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, input }: { key: ProviderKey; input: UpdateLlmProviderInputType }) =>
      aiApi.updateProvider(key, input),
    onSuccess: (_data, { key, input }) =>
      invalidateProviders(
        qc,
        input.apiKey !== undefined || input.baseUrl !== undefined ? key.id : undefined,
      ),
  });
};

export const useDeleteProvider = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (key: ProviderKey) => aiApi.deleteProvider(key),
    onSuccess: (_data, key) => invalidateProviders(qc, key.id),
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

// 저장 전에 입력 폼의 API 키로 직접 모델 목록을 받아온다. 잘못된 키일 경우
// ok=false 분기로 에러 메시지를 받아 UI 에 그대로 표시한다.
export const usePreviewModels = () =>
  useMutation({
    mutationFn: ({ key, input }: { key: ProviderKey; input: PreviewLlmModelsInputType }) =>
      aiApi.previewModels(key, input),
  });
