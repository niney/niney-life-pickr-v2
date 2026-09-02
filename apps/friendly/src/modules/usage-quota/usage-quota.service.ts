import type { PrismaClient } from '@prisma/client';
import {
  UsageQuotaFeature,
  type UpdateUsageQuotaSettingInputType,
  type UsageQuotaFeatureType,
  type UsageQuotaSettingType,
  type UsageQuotaUsageType,
} from '@repo/api-contract';

// 공용 익명 사용량 한도 — 로그인 없이 쓰는 비용성 기능(타로 LLM 해석 등)의 기기·IP·전역 일일
// 카운터. MealDailyQuotaService 의 "INSERT ... ON CONFLICT 조건부 UPDATE 한 문장" 원자 카운터를
// scope(global / ip / guest / user) 로 일반화했다. 기존 meal_daily_quotas 는 옮기지 않는다.
//
// 소비 순서: 전역(게스트는 guestCutoffPct % 에서 컷) → [게스트만] IP 일일 → 게스트 키 일일.
// 뒤 단계가 막히면 앞 단계 증가분을 되돌린다(best effort — 단일 인스턴스 SQLite 라 경합은 작다).
// 회원은 전역 예산만 소비하고 user scope 에 통계용으로만 센다(한도 없음 — 사용자 결정 2026-09-02).
//
// 설정은 feature 당 1행(UsageQuotaSetting), 없으면 USAGE_QUOTA_DEFAULTS. 매 요청 DB 를 읽지
// 않게 30초 캐시하고 어드민 저장 시 즉시 무효화한다.

export const kstToday = (now: Date = new Date()): string =>
  now.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });

export const USAGE_QUOTA_FEATURES: readonly UsageQuotaFeatureType[] = UsageQuotaFeature.options;

export type UsageQuotaDefaults = Omit<UsageQuotaSettingType, 'feature' | 'updatedAt'>;

export const USAGE_QUOTA_DEFAULTS: Record<UsageQuotaFeatureType, UsageQuotaDefaults> = {
  // 타로 해석 LLM 호출. IP 일일은 CGNAT(한 IP 뒤 다수 사용자)를 고려해 넉넉히, 전역 300 은
  // Ollama Cloud 예산 안전망 — 운영 초기엔 어드민에서 보수적으로 조정.
  'tarot-reading': {
    enabled: true,
    guestPerDay: 5,
    ipPerDay: 60,
    ipPerMinute: 6,
    globalPerDay: 300,
    guestCutoffPct: 80,
  },
};

export type UsageQuotaScope = 'global' | 'ip' | 'guest' | 'user';

export interface UsageQuotaActor {
  userId: string | null;
  // X-Guest-Key 헤더. 없으면 IP 로 대체(ip:<addr>).
  guestKey: string | null;
  ip: string;
}

export type UsageQuotaDenyReason =
  | 'disabled'
  | 'global_budget'
  | 'guest_cutoff'
  | 'ip_daily'
  | 'guest_daily';

export interface UsageQuotaDecision {
  allowed: boolean;
  reason: UsageQuotaDenyReason | null;
  // 게스트의 기기 일일 잔여 횟수. 회원·무제한이면 null.
  remainingToday: number | null;
}

interface UsageQuotaServiceOptions {
  now?: () => Date;
  settingsTtlMs?: number;
}

const GLOBAL_KEY = '*';
const TOP_N = 10;

export class UsageQuotaService {
  private settingsCache: { at: number; byFeature: Map<string, UsageQuotaSettingType> } | null = null;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly opts: UsageQuotaServiceOptions = {},
  ) {}

  today(): string {
    return kstToday(this.opts.now?.() ?? new Date());
  }

  // ── 설정 ──────────────────────────────────────────────────────────────────

  invalidate(): void {
    this.settingsCache = null;
  }

  async listSettings(): Promise<UsageQuotaSettingType[]> {
    const map = await this.loadSettings();
    return USAGE_QUOTA_FEATURES.map((f) => map.get(f)!);
  }

  async getSetting(feature: UsageQuotaFeatureType): Promise<UsageQuotaSettingType> {
    const map = await this.loadSettings();
    return map.get(feature)!;
  }

  async updateSetting(
    feature: UsageQuotaFeatureType,
    patch: UpdateUsageQuotaSettingInputType,
    updatedById: string | null = null,
  ): Promise<UsageQuotaSettingType> {
    const defaults = USAGE_QUOTA_DEFAULTS[feature];
    const row = await this.prisma.usageQuotaSetting.upsert({
      where: { feature },
      create: { feature, ...defaults, ...stripUndefined(patch), updatedById },
      update: { ...stripUndefined(patch), updatedById },
    });
    this.invalidate();
    return toSetting(feature, row);
  }

  private async loadSettings(): Promise<Map<string, UsageQuotaSettingType>> {
    const ttl = this.opts.settingsTtlMs ?? 30_000;
    const now = Date.now();
    if (this.settingsCache && now - this.settingsCache.at < ttl) return this.settingsCache.byFeature;
    const rows = await this.prisma.usageQuotaSetting.findMany();
    const byFeature = new Map<string, UsageQuotaSettingType>();
    for (const f of USAGE_QUOTA_FEATURES) {
      byFeature.set(f, toSetting(f, rows.find((r) => r.feature === f) ?? null));
    }
    this.settingsCache = { at: now, byFeature };
    return byFeature;
  }

  // ── 소비 ──────────────────────────────────────────────────────────────────

  async consume(feature: UsageQuotaFeatureType, actor: UsageQuotaActor): Promise<UsageQuotaDecision> {
    const s = await this.getSetting(feature);
    if (!s.enabled) return { allowed: false, reason: 'disabled', remainingToday: null };
    const date = this.today();
    const isGuest = !actor.userId;

    // 전역 예산 — 게스트는 cutoff % 까지만. globalPerDay 0 = 무제한(게스트도).
    const globalLimit =
      s.globalPerDay <= 0
        ? null
        : isGuest
          ? Math.floor((s.globalPerDay * s.guestCutoffPct) / 100)
          : s.globalPerDay;
    if (!(await this.consumeOne(feature, 'global', GLOBAL_KEY, date, globalLimit))) {
      return {
        allowed: false,
        reason: isGuest && s.guestCutoffPct < 100 ? 'guest_cutoff' : 'global_budget',
        remainingToday: isGuest ? 0 : null,
      };
    }

    if (!isGuest) {
      await this.consumeOne(feature, 'user', actor.userId!, date, null);
      return { allowed: true, reason: null, remainingToday: null };
    }

    if (!(await this.consumeOne(feature, 'ip', actor.ip, date, s.ipPerDay > 0 ? s.ipPerDay : null))) {
      await this.release(feature, 'global', GLOBAL_KEY, date);
      return { allowed: false, reason: 'ip_daily', remainingToday: 0 };
    }

    const guestKey = guestKeyOf(actor);
    if (!(await this.consumeOne(feature, 'guest', guestKey, date, s.guestPerDay > 0 ? s.guestPerDay : null))) {
      await this.release(feature, 'ip', actor.ip, date);
      await this.release(feature, 'global', GLOBAL_KEY, date);
      return { allowed: false, reason: 'guest_daily', remainingToday: 0 };
    }

    return { allowed: true, reason: null, remainingToday: await this.remainingForGuest(feature, actor, s, date) };
  }

  // 소비 없이 게스트 기기 일일 잔여만(캐시 히트 응답 표시용). 회원·무제한이면 null.
  async remainingForGuest(
    feature: UsageQuotaFeatureType,
    actor: UsageQuotaActor,
    setting?: UsageQuotaSettingType,
    date?: string,
  ): Promise<number | null> {
    if (actor.userId) return null;
    const s = setting ?? (await this.getSetting(feature));
    if (!s.enabled) return 0;
    if (s.guestPerDay <= 0) return null;
    const used = await this.count(feature, 'guest', guestKeyOf(actor), date ?? this.today());
    return Math.max(0, s.guestPerDay - used);
  }

  async count(feature: string, scope: UsageQuotaScope, key: string, date: string): Promise<number> {
    const row = await this.prisma.usageQuotaCounter.findUnique({
      where: { feature_scope_key_date: { feature, scope, key, date } },
      select: { count: true },
    });
    return row?.count ?? 0;
  }

  // count < limit 일 때만 증가(원자). limit null = 무제한(증가만), limit 0 = 항상 거부(행도 안 만든다).
  private async consumeOne(
    feature: string,
    scope: UsageQuotaScope,
    key: string,
    date: string,
    limit: number | null,
  ): Promise<boolean> {
    if (limit !== null && limit <= 0) return false;
    if (limit === null) {
      await this.prisma.$executeRaw`
        INSERT INTO usage_quota_counters (feature, scope, "key", date, count, updatedAt)
        VALUES (${feature}, ${scope}, ${key}, ${date}, 1, CURRENT_TIMESTAMP)
        ON CONFLICT(feature, scope, "key", date) DO UPDATE SET
          count = count + 1,
          updatedAt = CURRENT_TIMESTAMP
      `;
      return true;
    }
    const changed = await this.prisma.$executeRaw`
      INSERT INTO usage_quota_counters (feature, scope, "key", date, count, updatedAt)
      VALUES (${feature}, ${scope}, ${key}, ${date}, 1, CURRENT_TIMESTAMP)
      ON CONFLICT(feature, scope, "key", date) DO UPDATE SET
        count = count + 1,
        updatedAt = CURRENT_TIMESTAMP
      WHERE count < ${limit}
    `;
    return changed === 1;
  }

  private async release(feature: string, scope: UsageQuotaScope, key: string, date: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE usage_quota_counters SET count = count - 1, updatedAt = CURRENT_TIMESTAMP
      WHERE feature = ${feature} AND scope = ${scope} AND "key" = ${key} AND date = ${date} AND count > 0
    `;
  }

  // ── 집계·정리 ─────────────────────────────────────────────────────────────

  async usage(feature: UsageQuotaFeatureType, date: string): Promise<UsageQuotaUsageType> {
    const rows = await this.prisma.usageQuotaCounter.findMany({
      where: { feature, date },
      select: { scope: true, key: true, count: true },
    });
    const sum = (scope: UsageQuotaScope): number =>
      rows.filter((r) => r.scope === scope).reduce((a, r) => a + r.count, 0);
    const top = (scope: UsageQuotaScope) =>
      rows
        .filter((r) => r.scope === scope)
        .sort((a, b) => b.count - a.count)
        .slice(0, TOP_N)
        .map((r) => ({ key: r.key, count: r.count }));
    return {
      date,
      global: sum('global'),
      guestTotal: sum('guest'),
      ipTotal: sum('ip'),
      userTotal: sum('user'),
      topGuests: top('guest'),
      topIps: top('ip'),
    };
  }

  // 30일 지난 카운터 삭제(스케줄). 반환은 삭제 행 수.
  async cleanup(olderThanDays = 30): Promise<number> {
    const cutoff = new Date((this.opts.now?.() ?? new Date()).getTime() - olderThanDays * 86_400_000);
    const res = await this.prisma.usageQuotaCounter.deleteMany({ where: { date: { lt: kstToday(cutoff) } } });
    return res.count;
  }
}

const guestKeyOf = (actor: UsageQuotaActor): string => actor.guestKey ?? `ip:${actor.ip}`;

const stripUndefined = <T extends object>(o: T): Partial<T> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;

const toSetting = (
  feature: UsageQuotaFeatureType,
  row: {
    enabled: boolean;
    guestPerDay: number;
    ipPerDay: number;
    ipPerMinute: number;
    globalPerDay: number;
    guestCutoffPct: number;
    updatedAt: Date;
  } | null,
): UsageQuotaSettingType => {
  const d = USAGE_QUOTA_DEFAULTS[feature];
  return {
    feature,
    enabled: row?.enabled ?? d.enabled,
    guestPerDay: row?.guestPerDay ?? d.guestPerDay,
    ipPerDay: row?.ipPerDay ?? d.ipPerDay,
    ipPerMinute: row?.ipPerMinute ?? d.ipPerMinute,
    globalPerDay: row?.globalPerDay ?? d.globalPerDay,
    guestCutoffPct: row?.guestCutoffPct ?? d.guestCutoffPct,
    updatedAt: row ? row.updatedAt.toISOString() : null,
  };
};
