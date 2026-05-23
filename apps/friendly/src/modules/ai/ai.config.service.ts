import type { PrismaClient } from '@prisma/client';
import type {
  LlmProviderConfigType,
  LlmProviderIdType,
  LlmProviderPurposeType,
  UpdateLlmProviderInputType,
} from '@repo/api-contract';

// What the service needs from env to fill gaps in DB rows. Kept in this
// module rather than read from `env` directly so tests can inject a fake.
// env fallback 은 purpose='chat' 에만 적용한다 — image 같은 다른 용도는
// 환경변수로 키를 공유하기 어려워 DB row 가 있을 때만 활성화한다.
export interface LlmProviderEnv {
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
  maxConcurrent: number;
  defaultModel: string;
}

// What AiService consumes. `apiKey` is guaranteed non-empty here — getResolved
// returns null when no key is configured, so callers don't need to re-check.
// `defaultModel` may be empty string when neither DB row nor env supply one.
export interface ResolvedProviderConfig {
  provider: LlmProviderIdType;
  purpose: LlmProviderPurposeType;
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
  maxConcurrent: number;
  defaultModel: string;
  enabled: boolean;
}

export const maskApiKey = (key: string): string | null => {
  if (!key) return null;
  if (key.length <= 4) return '***';
  return `sk-***...${key.slice(-4)}`;
};

// purpose='chat' 만 env fallback 으로 가상 row 를 노출한다. 다른 용도는
// DB 등록 전이면 list 응답에 포함하지 않는다.
const ENV_BACKED_PURPOSE: LlmProviderPurposeType = 'chat';

// Owns provider config: DB CRUD + env-fallback resolution + masking.
// The service layer (AiService) calls getResolved() once per request to get
// a snapshot used for that request only — no caching, so config changes
// take effect immediately.
export class AiConfigService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly env: LlmProviderEnv,
  ) {}

  async list(): Promise<LlmProviderConfigType[]> {
    const rows = await this.prisma.llmProviderConfig.findMany({
      orderBy: [{ provider: 'asc' }, { purpose: 'asc' }],
    });
    const known: LlmProviderIdType[] = ['ollama-cloud'];

    const out: LlmProviderConfigType[] = [];

    // DB row 가 있으면 그대로, 없으면 chat purpose 에 한해 env-backed 가상
    // row 를 합성한다. 같은 provider 의 image purpose 는 DB row 가 있어야
    // 카드로 노출되므로 어드민이 명시적으로 추가해야 한다.
    for (const provider of known) {
      const providerRows = rows.filter((r) => r.provider === provider);
      const hasChat = providerRows.some((r) => r.purpose === ENV_BACKED_PURPOSE);
      if (!hasChat) {
        out.push(this.toView(provider, ENV_BACKED_PURPOSE, null));
      }
      for (const row of providerRows) {
        out.push(this.toView(provider, row.purpose as LlmProviderPurposeType, row));
      }
    }

    return out;
  }

  async getResolved(
    provider: LlmProviderIdType,
    purpose: LlmProviderPurposeType,
  ): Promise<ResolvedProviderConfig | null> {
    const row = await this.prisma.llmProviderConfig.findUnique({
      where: { provider_purpose: { provider, purpose } },
    });

    // env fallback 은 chat 에만 — image 등 다른 용도는 DB row 필수.
    const allowEnvFallback = purpose === ENV_BACKED_PURPOSE;
    const envApiKey = allowEnvFallback ? this.env.apiKey.trim() : '';
    const apiKey = row?.apiKey?.trim() || envApiKey;
    if (!apiKey) return null;

    const enabled = row?.enabled ?? true;
    if (!enabled) return null;

    return {
      provider,
      purpose,
      apiKey,
      baseUrl: row?.baseUrl ?? this.env.baseUrl,
      timeoutMs: this.env.timeoutMs,
      maxConcurrent: row?.maxConcurrent ?? this.env.maxConcurrent,
      defaultModel: row?.defaultModel ?? (allowEnvFallback ? this.env.defaultModel : ''),
      enabled,
    };
  }

  // Drop the DB row entirely. Subsequent reads fall back to env config —
  // the provider effectively reverts to whatever .env declares (or no key
  // at all if env is empty). Idempotent: missing row is not an error.
  async remove(
    provider: LlmProviderIdType,
    purpose: LlmProviderPurposeType,
  ): Promise<void> {
    await this.prisma.llmProviderConfig.deleteMany({ where: { provider, purpose } });
  }

  async update(
    provider: LlmProviderIdType,
    purpose: LlmProviderPurposeType,
    input: UpdateLlmProviderInputType,
    actorId: string | null,
  ): Promise<LlmProviderConfigType> {
    const updateData: Record<string, unknown> = { updatedById: actorId };
    // apiKey is write-only — empty/undefined preserves the existing value.
    if (input.apiKey && input.apiKey.length > 0) updateData.apiKey = input.apiKey;
    // baseUrl/defaultModel: undefined = no change, null = clear, string = set.
    if (input.baseUrl !== undefined) updateData.baseUrl = input.baseUrl;
    if (input.defaultModel !== undefined) updateData.defaultModel = input.defaultModel;
    if (input.enabled !== undefined) updateData.enabled = input.enabled;
    if (input.maxConcurrent !== undefined) updateData.maxConcurrent = input.maxConcurrent;

    // 신규 row 생성 시엔 키가 필요한데, chat purpose 만 env fallback 으로
    // 가능하다. image 등은 입력 키가 없으면 빈 문자열로 들어가 hasApiKey=false
    // 인 카드만 만들어진다 (관리자가 다음 PUT 에서 채워 넣게).
    const allowEnvFallback = purpose === ENV_BACKED_PURPOSE;
    const createApiKey = input.apiKey ?? (allowEnvFallback ? this.env.apiKey : '');

    const row = await this.prisma.llmProviderConfig.upsert({
      where: { provider_purpose: { provider, purpose } },
      create: {
        provider,
        purpose,
        apiKey: createApiKey,
        baseUrl: input.baseUrl ?? null,
        defaultModel: input.defaultModel ?? null,
        enabled: input.enabled ?? true,
        maxConcurrent: input.maxConcurrent ?? this.env.maxConcurrent,
        updatedById: actorId,
      },
      update: updateData,
    });

    return this.toView(provider, purpose, row);
  }

  private toView(
    provider: LlmProviderIdType,
    purpose: LlmProviderPurposeType,
    row: {
      apiKey: string;
      baseUrl: string | null;
      defaultModel: string | null;
      enabled: boolean;
      maxConcurrent: number;
      updatedAt: Date;
    } | null,
  ): LlmProviderConfigType {
    const allowEnvFallback = purpose === ENV_BACKED_PURPOSE;
    if (!row) {
      // Synthesize a virtual view from env so the UI always has at least
      // one row to render. hasApiKey reflects whether env can satisfy the
      // request without any DB-side input.
      const envKey = allowEnvFallback ? this.env.apiKey.trim() : '';
      return {
        provider,
        purpose,
        hasApiKey: envKey.length > 0,
        apiKeyMasked: maskApiKey(envKey),
        baseUrl: allowEnvFallback ? this.env.baseUrl : null,
        defaultModel: null,
        enabled: true,
        maxConcurrent: allowEnvFallback ? this.env.maxConcurrent : 15,
        updatedAt: null,
      };
    }
    const envKey = allowEnvFallback ? this.env.apiKey.trim() : '';
    const effectiveKey = row.apiKey.trim() || envKey;
    return {
      provider,
      purpose,
      hasApiKey: effectiveKey.length > 0,
      apiKeyMasked: maskApiKey(effectiveKey),
      baseUrl: row.baseUrl ?? (allowEnvFallback ? this.env.baseUrl : null),
      defaultModel: row.defaultModel,
      enabled: row.enabled,
      maxConcurrent: row.maxConcurrent,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
