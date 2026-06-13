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
// image/log-analysis 는 DB row 가 있을 때만 활성화된다 (log-analysis 미설정
// 시 실패 잡 자동 분석은 조용히 스킵).
export const LlmProviderPurpose = z.enum(['chat', 'image', 'log-analysis']);
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

// 키 입력 칸에서 저장 없이 바로 모델 목록을 받아오기 위한 미리보기.
// 저장된 row 가 없거나 신규 입력한 키를 검증할 때 사용한다.
export const PreviewLlmModelsInput = z.object({
  apiKey: z.string().min(1).max(500),
  baseUrl: z.string().url().optional(),
});
export type PreviewLlmModelsInputType = z.infer<typeof PreviewLlmModelsInput>;

// 모델 목록 + 에러 분기. listModels 와 달리 미리보기에서는 잘못된 키를
// 알려줘야 하므로 ok=false 분기를 명시한다.
export const PreviewLlmModelsResult = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    models: z.array(z.string()),
  }),
  z.object({
    ok: z.literal(false),
    error: AiErrorCode,
    message: z.string(),
  }),
]);
export type PreviewLlmModelsResultType = z.infer<typeof PreviewLlmModelsResult>;

// --- LLM 사용량 텔레메트리 (표시 전용) --------------------------------------
//
// friendly 의 모든 LLM 호출이 지나는 어댑터 한 곳에서 수집한 인메모리 집계.
// 강제(예산 차단) 없음 — 어드민이 "지금 얼마나 쓰고 있는지"를 보는 용도.
// 서버 재시작 시 리셋된다 (startedAt 으로 집계 기준 시점을 표시).

export const LlmGateSnapshot = z.object({
  limit: z.number().int().nonnegative(),
  inflight: z.number().int().nonnegative(),
  queued: z.number().int().nonnegative(),
  // 대기열 맨 앞이 기다린 시간(ms). 큐가 비어 있으면 null.
  oldestWaitMs: z.number().int().nonnegative().nullable(),
});
export type LlmGateSnapshotType = z.infer<typeof LlmGateSnapshot>;

export const LlmCallStatus = z.enum(['ok', 'error', 'cancelled', 'timeout']);
export type LlmCallStatusType = z.infer<typeof LlmCallStatus>;

export const LlmTelemetryCall = z.object({
  id: z.number().int(),
  purpose: z.string(),
  model: z.string(),
  status: LlmCallStatus,
  errorName: z.string().nullable(),
  promptTokens: z.number().int().nonnegative().nullable(),
  completionTokens: z.number().int().nonnegative().nullable(),
  // 게이트(큐) 대기 시간 — durationMs(업스트림 소요)와 분리해서 보여줘야
  // "느린 게 모델인지 큐인지"를 구분할 수 있다.
  queueWaitMs: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative(),
  // 429(동시성 한도) 백오프 재시도 횟수.
  retries: z.number().int().nonnegative(),
  at: z.string(),
});
export type LlmTelemetryCallType = z.infer<typeof LlmTelemetryCall>;

export const LlmTelemetryAgg = z.object({
  requests: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
});
export type LlmTelemetryAggType = z.infer<typeof LlmTelemetryAgg>;

export const LlmTelemetryWindow = LlmTelemetryAgg.extend({
  avgDurationMs: z.number().int().nonnegative().nullable(),
  maxDurationMs: z.number().int().nonnegative().nullable(),
});
export type LlmTelemetryWindowType = z.infer<typeof LlmTelemetryWindow>;

export const LlmTelemetrySnapshot = z.object({
  // 집계 시작 시점(프로세스 부팅). 인메모리라 이 시점 이후 누적치다.
  startedAt: z.string(),
  totals: LlmTelemetryAgg.extend({
    ok: z.number().int().nonnegative(),
    cancelled: z.number().int().nonnegative(),
    retries: z.number().int().nonnegative(),
  }),
  byPurpose: z.array(LlmTelemetryAgg.extend({ purpose: z.string() })),
  byModel: z.array(LlmTelemetryAgg.extend({ model: z.string() })),
  windows: z.object({
    m1: LlmTelemetryWindow,
    m5: LlmTelemetryWindow,
    h1: LlmTelemetryWindow,
  }),
  // 지금 업스트림에 나가 있는 호출들.
  active: z.array(
    z.object({
      id: z.number().int(),
      purpose: z.string(),
      model: z.string(),
      runningMs: z.number().int().nonnegative(),
    }),
  ),
  recent: z.array(LlmTelemetryCall),
  gates: z.object({
    // 계정(API 키) 단위 공유 게이트 — 키는 노출하지 않는다.
    account: z.array(LlmGateSnapshot),
    purposes: z.array(z.object({ purpose: z.string(), gate: LlmGateSnapshot })),
  }),
});
export type LlmTelemetrySnapshotType = z.infer<typeof LlmTelemetrySnapshot>;

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
