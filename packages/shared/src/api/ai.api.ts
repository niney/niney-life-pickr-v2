import type {
  AiCompleteBatchInputType,
  AiCompleteBatchResultType,
  AiCompleteInputType,
  AiCompleteResultType,
  LlmModelListResultType,
  LlmProviderConfigType,
  LlmProviderIdType,
  LlmProviderListResultType,
  LlmProviderPurposeType,
  PreviewLlmModelsInputType,
  PreviewLlmModelsResultType,
  TestLlmProviderResultType,
  UpdateLlmProviderInputType,
} from '@repo/api-contract';
import { apiFetch } from './client.js';

// Path constants kept local to avoid relying on `Routes.Ai` namespace —
// some bundlers (vite's esbuild prebundle) drop the inner object from the
// `export * as Routes` re-export, so we hardcode the paths here.
const AI_PREFIX = '/api/v1/admin/ai';

export interface ProviderKey {
  id: LlmProviderIdType;
  purpose: LlmProviderPurposeType;
}

export const aiApi = {
  complete: (input: AiCompleteInputType) =>
    apiFetch<AiCompleteResultType>(`${AI_PREFIX}/complete`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  completeBatch: (input: AiCompleteBatchInputType) =>
    apiFetch<AiCompleteBatchResultType>(`${AI_PREFIX}/complete-batch`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  listProviders: () => apiFetch<LlmProviderListResultType>(`${AI_PREFIX}/providers`),

  updateProvider: ({ id, purpose }: ProviderKey, input: UpdateLlmProviderInputType) =>
    apiFetch<LlmProviderConfigType>(`${AI_PREFIX}/providers/${id}/${purpose}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),

  deleteProvider: ({ id, purpose }: ProviderKey) =>
    apiFetch<void>(`${AI_PREFIX}/providers/${id}/${purpose}`, {
      method: 'DELETE',
    }),

  testProvider: ({ id, purpose }: ProviderKey, model?: string) =>
    apiFetch<TestLlmProviderResultType>(
      `${AI_PREFIX}/providers/${id}/${purpose}/test`,
      {
        method: 'POST',
        body: JSON.stringify(model ? { model } : {}),
      },
    ),

  listModels: ({ id, purpose }: ProviderKey) =>
    apiFetch<LlmModelListResultType>(
      `${AI_PREFIX}/providers/${id}/${purpose}/models`,
    ),

  previewModels: (
    { id, purpose }: ProviderKey,
    input: PreviewLlmModelsInputType,
  ) =>
    apiFetch<PreviewLlmModelsResultType>(
      `${AI_PREFIX}/providers/${id}/${purpose}/models/preview`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    ),
};
