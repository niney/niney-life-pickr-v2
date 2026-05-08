import type { PrismaClient } from '@prisma/client';
import type {
  MapProviderConfigType,
  MapProviderIdType,
  MapProviderSecretType,
  UpdateMapProviderInputType,
} from '@repo/api-contract';
import { maskApiKey } from '../ai/ai.config.service.js';

// 지도 SDK 키 관리. LlmProviderConfig 와 거의 동일한 패턴이지만 모델·동시성
// 같은 LLM 전용 옵션이 없어 더 단순하다. 환경변수 fallback 도 두지 않는다 —
// vworld 키는 운영자가 발급받아 도메인 화이트리스트와 짝지어 직접 등록하는
// 1:1 자원이라 .env 기본값 개념이 어색하다.
export class MapSettingsService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(): Promise<MapProviderConfigType[]> {
    const rows = await this.prisma.mapProviderConfig.findMany();
    const byProvider = new Map(rows.map((r) => [r.provider, r]));
    const known: MapProviderIdType[] = ['vworld'];
    return known.map((p) => this.toView(p, byProvider.get(p) ?? null));
  }

  async getSecret(provider: MapProviderIdType): Promise<MapProviderSecretType> {
    const row = await this.prisma.mapProviderConfig.findUnique({ where: { provider } });
    return {
      provider,
      apiKey: row?.apiKey?.trim() || null,
      domains: row?.domains ?? null,
    };
  }

  async update(
    provider: MapProviderIdType,
    input: UpdateMapProviderInputType,
    actorId: string | null,
  ): Promise<MapProviderConfigType> {
    const updateData: Record<string, unknown> = { updatedById: actorId };
    if (input.apiKey && input.apiKey.length > 0) updateData.apiKey = input.apiKey;
    if (input.domains !== undefined) updateData.domains = input.domains;

    const existing = await this.prisma.mapProviderConfig.findUnique({ where: { provider } });
    if (!existing && !input.apiKey) {
      // 첫 등록인데 키가 없으면 의미 없는 행을 만드는 셈이라 거절. AI 와 달리
      // env fallback 이 없어서 빈 행은 그대로 "키 없음" 상태와 동일.
      throw new Error('apiKey is required for first registration');
    }

    const row = await this.prisma.mapProviderConfig.upsert({
      where: { provider },
      create: {
        provider,
        apiKey: input.apiKey ?? '',
        domains: input.domains ?? null,
        updatedById: actorId,
      },
      update: updateData,
    });

    return this.toView(provider, row);
  }

  async remove(provider: MapProviderIdType): Promise<void> {
    await this.prisma.mapProviderConfig.deleteMany({ where: { provider } });
  }

  private toView(
    provider: MapProviderIdType,
    row: {
      apiKey: string;
      domains: string | null;
      updatedAt: Date;
    } | null,
  ): MapProviderConfigType {
    if (!row) {
      return {
        provider,
        hasApiKey: false,
        apiKeyMasked: null,
        domains: null,
        updatedAt: null,
      };
    }
    const key = row.apiKey.trim();
    return {
      provider,
      hasApiKey: key.length > 0,
      apiKeyMasked: maskApiKey(key),
      domains: row.domains,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
