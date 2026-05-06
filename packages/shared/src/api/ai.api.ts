import type {
  AiCompleteBatchInputType,
  AiCompleteBatchResultType,
  AiCompleteInputType,
  AiCompleteResultType,
  LlmModelListResultType,
  LlmProviderConfigType,
  LlmProviderIdType,
  LlmProviderListResultType,
  TestLlmProviderResultType,
  UpdateLlmProviderInputType,
} from '@repo/api-contract';
import { apiFetch } from './client.js';

// Path constants kept local to avoid relying on `Routes.Ai` namespace —
// some bundlers (vite's esbuild prebundle) drop the inner object from the
// `export * as Routes` re-export, so we hardcode the paths here.
const AI_PREFIX = '/api/v1/admin/ai';

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

  updateProvider: (id: LlmProviderIdType, input: UpdateLlmProviderInputType) =>
    apiFetch<LlmProviderConfigType>(`${AI_PREFIX}/providers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),

  deleteProvider: (id: LlmProviderIdType) =>
    apiFetch<void>(`${AI_PREFIX}/providers/${id}`, {
      method: 'DELETE',
    }),

  testProvider: (id: LlmProviderIdType, model?: string) =>
    apiFetch<TestLlmProviderResultType>(`${AI_PREFIX}/providers/${id}/test`, {
      method: 'POST',
      body: JSON.stringify(model ? { model } : {}),
    }),

  listModels: (id: LlmProviderIdType) =>
    apiFetch<LlmModelListResultType>(`${AI_PREFIX}/providers/${id}/models`),
};
