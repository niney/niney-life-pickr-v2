import type { PrismaClient } from '@prisma/client';
import type {
  MapProviderConfigType,
  MapProviderIdType,
  MapProviderSecretType,
  UpdateMapProviderInputType,
} from '@repo/api-contract';
import { maskApiKey } from '../ai/ai.config.service.js';

// 지도 SDK 키 관리 — TelegramConfigService 와 같은 "DB 우선 + .env fallback"
// 패턴. DB(MapProviderConfig) 행에 키가 있으면 그 값이 우선, 없으면 env 의
// VWORLD_* 값으로 떨어진다. WMTS 키는 어차피 브라우저 Network 탭에 노출되는
// 클라이언트 자원이라 .env 기본값을 둬도 보안 등급 차이가 없다. domains 는
// 발급 시 도메인 화이트리스트를 적어두는 메모(런타임 미사용).
export interface MapProviderEnv {
  // .env fallback 값 (DB 행에 키가 없을 때 사용).
  apiKey: string;
  domains: string;
}

interface EffectiveMapConfig {
  apiKey: string;
  domains: string | null;
  source: 'db' | 'env' | 'none';
  updatedAt: Date | null;
}

export class MapSettingsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly env: MapProviderEnv,
  ) {}

  // 유효 설정 = DB 행에 키가 있으면 DB 값, 없으면 env. 키 출처로 source 판정.
  // domains 는 DB 행 메모가 있으면 그 값, 없으면 env 메모로 보충.
  private async effective(provider: MapProviderIdType): Promise<EffectiveMapConfig> {
    const row = await this.prisma.mapProviderConfig.findUnique({ where: { provider } });
    const dbKey = row?.apiKey?.trim() ?? '';
    const envKey = this.env.apiKey.trim();
    const apiKey = dbKey || envKey;
    const source: 'db' | 'env' | 'none' = dbKey ? 'db' : envKey ? 'env' : 'none';
    const dbDomains = row?.domains?.trim() || '';
    const domains = dbDomains || this.env.domains.trim() || null;
    return { apiKey, domains, source, updatedAt: row?.updatedAt ?? null };
  }

  async list(): Promise<MapProviderConfigType[]> {
    const known: MapProviderIdType[] = ['vworld'];
    return Promise.all(known.map(async (p) => this.toView(p, await this.effective(p))));
  }

  // 평문 유효 키 — DB 우선, 없으면 env. vworld JS SDK/WMTS init 에 그대로 박힌다.
  // 공개 라우트(맛집 지도)도 이 메서드를 거치므로 env-only 운영에서도 동작한다.
  async getSecret(provider: MapProviderIdType): Promise<MapProviderSecretType> {
    const e = await this.effective(provider);
    return {
      provider,
      apiKey: e.apiKey || null,
      domains: e.domains,
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
    // 첫 등록인데 입력 키도 없고 env fallback 키도 없으면 의미 없는 "키 없음"
    // 행만 만드는 셈이라 거절. env 에 키가 있으면 도메인 메모만 저장하는 것도
    // 허용한다 (키는 env 에서 상속).
    if (!existing && !input.apiKey && !this.env.apiKey.trim()) {
      throw new Error('apiKey is required for first registration');
    }

    await this.prisma.mapProviderConfig.upsert({
      where: { provider },
      create: {
        provider,
        apiKey: input.apiKey ?? '',
        domains: input.domains ?? null,
        updatedById: actorId,
      },
      update: updateData,
    });

    return this.toView(provider, await this.effective(provider));
  }

  // DB 행 삭제 → env fallback 으로 복귀.
  async remove(provider: MapProviderIdType): Promise<void> {
    await this.prisma.mapProviderConfig.deleteMany({ where: { provider } });
  }

  private toView(provider: MapProviderIdType, e: EffectiveMapConfig): MapProviderConfigType {
    return {
      provider,
      hasApiKey: e.apiKey.length > 0,
      apiKeyMasked: e.apiKey ? maskApiKey(e.apiKey) : null,
      domains: e.domains,
      source: e.source,
      updatedAt: e.updatedAt?.toISOString() ?? null,
    };
  }
}
