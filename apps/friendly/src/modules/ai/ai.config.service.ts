import type { PrismaClient } from '@prisma/client';
import type {
  LlmKeySourceType,
  LlmModelSourceType,
  LlmProviderConfigType,
  LlmProviderIdType,
  LlmProviderPurposeType,
  UpdateLlmProviderInputType,
} from '@repo/api-contract';

// What the service needs from env to fill gaps in DB rows. Kept in this
// module rather than read from `env` directly so tests can inject a fake.
// 키·baseUrl 의 env fallback 은 계정 대표(chat)에만 적용한다 — image 등 다른
// 용도는 키를 env 로 공유하기 어려워 DB row(또는 chat 상속)로만 동작한다.
// 반면 defaultModels 는 용도별로 따로 두어 세 용도 모두 .env 기본 모델을 가질
// 수 있다 (모델은 용도마다 달라야 하므로 상속하지 않고 용도별 fallback).
export interface LlmProviderEnv {
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
  maxConcurrent: number;
  defaultModels: Record<LlmProviderPurposeType, string>;
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

// chat 이 "계정 대표" 용도다 — 키·baseUrl 은 chat row(없으면 env)에 두고,
// image·log-analysis 는 자기 row 에 키가 없으면 이 계정 키를 상속한다. 따라서
// 키 하나(chat 또는 env)만 있으면 세 용도가 모두 동작한다. 모델은 용도마다
// 달라야 하므로 상속하지 않는다 (각 row 의 defaultModel 만 사용).
const ENV_BACKED_PURPOSE: LlmProviderPurposeType = 'chat';

// list 가 항상 카드로 노출하는 용도들 — DB row 가 없어도 계정 키 상속으로
// 동작할 수 있으므로 가상 row 를 합성해 모두 보여준다.
const ALL_PURPOSES: LlmProviderPurposeType[] = ['chat', 'image', 'log-analysis'];

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

    // 모든 용도를 항상 한 장씩 노출한다 — DB row 가 없는 용도는 계정 키를
    // 상속해 동작할 수 있으므로 가상 row 로 합성한다. 계정 대표 키·baseUrl
    // (chat row 또는 env)을 함께 넘겨 image·log-analysis 의 상속 표시를 채운다.
    for (const provider of known) {
      const providerRows = rows.filter((r) => r.provider === provider);
      const chatRow = providerRows.find((r) => r.purpose === ENV_BACKED_PURPOSE) ?? null;
      const accountKey = (chatRow?.apiKey?.trim() || '') || this.env.apiKey.trim();
      const accountBaseUrl = chatRow?.baseUrl ?? this.env.baseUrl;
      for (const purpose of ALL_PURPOSES) {
        const row = providerRows.find((r) => r.purpose === purpose) ?? null;
        out.push(this.toView(provider, purpose, row, accountKey, accountBaseUrl));
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

    // 비활성 row 는 키 유무와 무관하게 막는다.
    const enabled = row?.enabled ?? true;
    if (!enabled) return null;

    // 키·baseUrl 은 계정에서 상속한다.
    //  chat        자기 row 가 곧 계정 — env 로만 보충.
    //  그 외 용도  자기 키가 없으면 계정(chat row, 없으면 env) 키를 빌린다.
    let apiKey = row?.apiKey?.trim() || '';
    let baseUrl = row?.baseUrl ?? null;
    if (purpose === ENV_BACKED_PURPOSE) {
      if (!apiKey) apiKey = this.env.apiKey.trim();
      if (baseUrl === null) baseUrl = this.env.baseUrl;
    } else if (!apiKey || baseUrl === null) {
      const account = await this.resolveAccountCredentials(provider);
      if (!apiKey) apiKey = account.apiKey;
      if (baseUrl === null) baseUrl = account.baseUrl;
    }
    if (!apiKey) return null;

    return {
      provider,
      purpose,
      apiKey,
      baseUrl: baseUrl ?? this.env.baseUrl,
      timeoutMs: this.env.timeoutMs,
      maxConcurrent: row?.maxConcurrent ?? this.env.maxConcurrent,
      // 모델은 상속하지 않는다 — 용도마다 다르므로. 대신 용도별 .env 기본 모델로
      // 보충한다(DB row 값이 비어 있을 때만).
      defaultModel: row?.defaultModel?.trim() || this.envModelFor(purpose),
      enabled,
    };
  }

  // 용도별 .env 기본 모델. DB row 의 defaultModel 이 비어 있을 때 보충값.
  private envModelFor(purpose: LlmProviderPurposeType): string {
    return this.env.defaultModels[purpose]?.trim() ?? '';
  }

  // 계정 대표 자격증명(키·baseUrl) — chat row 가 있으면 그 값, 없으면 env.
  // chat 이외 용도가 자기 row 에 키/baseUrl 이 없을 때 상속해 쓴다.
  private async resolveAccountCredentials(
    provider: LlmProviderIdType,
  ): Promise<{ apiKey: string; baseUrl: string }> {
    const chatRow = await this.prisma.llmProviderConfig.findUnique({
      where: { provider_purpose: { provider, purpose: ENV_BACKED_PURPOSE } },
    });
    return {
      apiKey: chatRow?.apiKey?.trim() || this.env.apiKey.trim(),
      baseUrl: chatRow?.baseUrl ?? this.env.baseUrl,
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

    // 상속 표시를 위해 계정 자격을 함께 넘긴다 (chat 을 막 저장했다면 그
    // 값이, 아니면 기존 chat row/env 가 계정 기준이 된다).
    const account = await this.resolveAccountCredentials(provider);
    return this.toView(provider, purpose, row, account.apiKey, account.baseUrl);
  }

  // accountKey/accountBaseUrl 은 계정 대표(chat row 또는 env)에서 미리 구한
  // 값 — image·log-analysis 가 자기 키 없이 상속할 때의 표시 기준이다.
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
    accountKey: string,
    accountBaseUrl: string,
  ): LlmProviderConfigType {
    const isChat = purpose === ENV_BACKED_PURPOSE;
    const ownKey = row?.apiKey?.trim() || '';

    // 유효 키와 출처를 함께 결정한다.
    let effectiveKey: string;
    let keySource: LlmKeySourceType;
    if (ownKey) {
      effectiveKey = ownKey;
      keySource = 'own';
    } else if (isChat) {
      // chat 자신이 계정 — 자기 키가 없으면 env 가 곧 계정 키.
      const envKey = this.env.apiKey.trim();
      effectiveKey = envKey;
      keySource = envKey.length > 0 ? 'env' : 'none';
    } else {
      // image·log-analysis — 계정(chat row 또는 env) 키를 상속.
      effectiveKey = accountKey;
      keySource = accountKey.length > 0 ? 'inherited' : 'none';
    }

    // 유효 기본 모델과 출처 — DB row 값이 있으면 own, 없으면 .env 기본값(env),
    // 둘 다 없으면 none. 모델은 키와 달리 상속하지 않고 용도별 fallback 만 본다.
    const ownModel = row?.defaultModel?.trim() || '';
    const envModel = this.envModelFor(purpose);
    const effectiveModel = ownModel || envModel;
    const defaultModelSource: LlmModelSourceType = ownModel ? 'own' : envModel ? 'env' : 'none';

    return {
      provider,
      purpose,
      hasApiKey: effectiveKey.length > 0,
      apiKeyMasked: maskApiKey(effectiveKey),
      keySource,
      baseUrl: row?.baseUrl ?? (isChat ? this.env.baseUrl : accountBaseUrl),
      defaultModel: effectiveModel || null,
      defaultModelSource,
      enabled: row?.enabled ?? true,
      maxConcurrent: row?.maxConcurrent ?? this.env.maxConcurrent,
      updatedAt: row ? row.updatedAt.toISOString() : null,
    };
  }
}
