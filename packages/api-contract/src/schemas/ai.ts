import { z } from 'zod';

export const AiCompleteInput = z.object({
  prompt: z.string().min(1).max(8000),
  // Provider-specific model id (e.g., 'gpt-oss:20b'). Forwarded verbatim
  // to the provider — there is no server-side alias mapping.
  model: z.string().min(1).max(100),
  systemPrompt: z.string().max(2000).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().max(4096).optional(),
});
export type AiCompleteInputType = z.infer<typeof AiCompleteInput>;

export const AiErrorCode = z.enum([
  'rate_limited',
  'upstream_failed',
  'timeout',
  'invalid_response',
  'provider_unavailable',
  'provider_disabled',
  'no_api_key',
]);
export type AiErrorCodeType = z.infer<typeof AiErrorCode>;

export const AiTokenUsage = z.object({
  promptTokens: z.number().int().nonnegative().nullable(),
  completionTokens: z.number().int().nonnegative().nullable(),
});
export type AiTokenUsageType = z.infer<typeof AiTokenUsage>;

export const AiCompleteResult = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    text: z.string(),
    model: z.string(),
    durationMs: z.number().int().nonnegative(),
    tokens: AiTokenUsage,
  }),
  z.object({
    ok: z.literal(false),
    error: AiErrorCode,
    message: z.string(),
  }),
]);
export type AiCompleteResultType = z.infer<typeof AiCompleteResult>;

// Batch — same shape per item plus an optional clientId so callers can
// correlate results back to their request order even when responses come
// back in arbitrary order. The server may reorder freely; the client
// should sort/lookup by clientId.
export const AiCompleteBatchItem = AiCompleteInput.extend({
  clientId: z.string().min(1).max(64).optional(),
});
export type AiCompleteBatchItemType = z.infer<typeof AiCompleteBatchItem>;

export const AiCompleteBatchInput = z.object({
  items: z.array(AiCompleteBatchItem).min(1).max(10),
});
export type AiCompleteBatchInputType = z.infer<typeof AiCompleteBatchInput>;

export const AiCompleteBatchResultItem = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    clientId: z.string().optional(),
    text: z.string(),
    model: z.string(),
    durationMs: z.number().int().nonnegative(),
    tokens: AiTokenUsage,
  }),
  z.object({
    ok: z.literal(false),
    clientId: z.string().optional(),
    error: AiErrorCode,
    message: z.string(),
  }),
]);
export type AiCompleteBatchResultItemType = z.infer<typeof AiCompleteBatchResultItem>;

export const AiCompleteBatchResult = z.object({
  results: z.array(AiCompleteBatchResultItem),
});
export type AiCompleteBatchResultType = z.infer<typeof AiCompleteBatchResult>;

// Provider config — admin-managed. apiKey is always returned masked
// (e.g. 'sk-ol***...abc4'); the plaintext only crosses the wire on PUT.
export const LlmProviderId = z.enum(['ollama-cloud']);
export type LlmProviderIdType = z.infer<typeof LlmProviderId>;

// 같은 provider 를 용도별로 따로 설정한다 — 텍스트(chat)와 비전(image)은
// 보통 모델이 달라 한 row 에 묶기 어렵다. env fallback 은 chat 에만 적용,
// image 는 DB row 가 있을 때만 활성화된다.
export const LlmProviderPurpose = z.enum(['chat', 'image']);
export type LlmProviderPurposeType = z.infer<typeof LlmProviderPurpose>;

export const LlmProviderConfig = z.object({
  provider: LlmProviderId,
  purpose: LlmProviderPurpose,
  hasApiKey: z.boolean(),
  apiKeyMasked: z.string().nullable(),
  baseUrl: z.string().nullable(),
  defaultModel: z.string().nullable(),
  enabled: z.boolean(),
  maxConcurrent: z.number().int().positive(),
  updatedAt: z.string().nullable(),
});
export type LlmProviderConfigType = z.infer<typeof LlmProviderConfig>;

export const LlmProviderListResult = z.object({
  providers: z.array(LlmProviderConfig),
});
export type LlmProviderListResultType = z.infer<typeof LlmProviderListResult>;

// Empty/undefined apiKey → keep existing key. Other fields default to no-op.
// Sending null for baseUrl/defaultModel explicitly clears them.
export const UpdateLlmProviderInput = z.object({
  apiKey: z.string().min(1).optional(),
  baseUrl: z.string().url().nullable().optional(),
  defaultModel: z.string().min(1).nullable().optional(),
  enabled: z.boolean().optional(),
  maxConcurrent: z.number().int().min(1).max(100).optional(),
});
export type UpdateLlmProviderInputType = z.infer<typeof UpdateLlmProviderInput>;

export const TestLlmProviderInput = z.object({
  // Override the default test model (provider's resolved fast alias). Use
  // when admin wants to verify a specific model id (e.g., the one they're
  // about to set as defaultModel) rather than the alias mapping.
  model: z.string().min(1).optional(),
});
export type TestLlmProviderInputType = z.infer<typeof TestLlmProviderInput>;

export const LlmModelListResult = z.object({
  // Empty array when the provider doesn't support listing or the call
  // failed — clients should fall back to free text entry rather than
  // surface an error in this case.
  models: z.array(z.string()),
});
export type LlmModelListResultType = z.infer<typeof LlmModelListResult>;

export const TestLlmProviderResult = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    model: z.string(),
    durationMs: z.number().int().nonnegative(),
    sample: z.string(),
  }),
  z.object({
    ok: z.literal(false),
    error: AiErrorCode,
    message: z.string(),
  }),
]);
export type TestLlmProviderResultType = z.infer<typeof TestLlmProviderResult>;
