import type { PrismaClient } from '@prisma/client';
import type {
  LlmProviderConfigType,
  LlmProviderIdType,
  UpdateLlmProviderInputType,
} from '@repo/api-contract';

// What the service needs from env to fill gaps in DB rows. Kept in this
// module rather than read from `env` directly so tests can inject a fake.
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
    const rows = await this.prisma.llmProviderConfig.findMany();
    const byProvider = new Map(rows.map((r) => [r.provider, r]));

    const known: LlmProviderIdType[] = ['ollama-cloud'];
    return known.map((provider) => this.toView(provider, byProvider.get(provider) ?? null));
  }

  async getResolved(provider: LlmProviderIdType): Promise<ResolvedProviderConfig | null> {
    const row = await this.prisma.llmProviderConfig.findUnique({ where: { provider } });

    const apiKey = row?.apiKey?.trim() || this.env.apiKey.trim();
    if (!apiKey) return null;

    const enabled = row?.enabled ?? true;
    if (!enabled) return null;

    return {
      provider,
      apiKey,
      baseUrl: row?.baseUrl ?? this.env.baseUrl,
      timeoutMs: this.env.timeoutMs,
      maxConcurrent: row?.maxConcurrent ?? this.env.maxConcurrent,
      defaultModel: row?.defaultModel ?? this.env.defaultModel,
      enabled,
    };
  }

  // Drop the DB row entirely. Subsequent reads fall back to env config —
  // the provider effectively reverts to whatever .env declares (or no key
  // at all if env is empty). Idempotent: missing row is not an error.
  async remove(provider: LlmProviderIdType): Promise<void> {
    await this.prisma.llmProviderConfig.deleteMany({ where: { provider } });
  }

  async update(
    provider: LlmProviderIdType,
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

    const row = await this.prisma.llmProviderConfig.upsert({
      where: { provider },
      create: {
        provider,
        // First create needs a key — if caller didn't pass one, use env.
        apiKey: input.apiKey ?? this.env.apiKey,
        baseUrl: input.baseUrl ?? null,
        defaultModel: input.defaultModel ?? null,
        enabled: input.enabled ?? true,
        maxConcurrent: input.maxConcurrent ?? this.env.maxConcurrent,
        updatedById: actorId,
      },
      update: updateData,
    });

    return this.toView(provider as LlmProviderIdType, row);
  }

  private toView(
    provider: LlmProviderIdType,
    row: {
      apiKey: string;
      baseUrl: string | null;
      defaultModel: string | null;
      enabled: boolean;
      maxConcurrent: number;
      updatedAt: Date;
    } | null,
  ): LlmProviderConfigType {
    if (!row) {
      // Synthesize a virtual view from env so the UI always has at least
      // one row to render. hasApiKey reflects whether env can satisfy the
      // request without any DB-side input.
      const envKey = this.env.apiKey.trim();
      return {
        provider,
        hasApiKey: envKey.length > 0,
        apiKeyMasked: maskApiKey(envKey),
        baseUrl: this.env.baseUrl,
        defaultModel: null,
        enabled: true,
        maxConcurrent: this.env.maxConcurrent,
        updatedAt: null,
      };
    }
    const effectiveKey = row.apiKey.trim() || this.env.apiKey.trim();
    return {
      provider,
      hasApiKey: effectiveKey.length > 0,
      apiKeyMasked: maskApiKey(effectiveKey),
      baseUrl: row.baseUrl ?? this.env.baseUrl,
      defaultModel: row.defaultModel,
      enabled: row.enabled,
      maxConcurrent: row.maxConcurrent,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
