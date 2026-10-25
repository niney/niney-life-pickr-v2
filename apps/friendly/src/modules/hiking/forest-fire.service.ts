// 산불위험예보 캐시 — 전국 1콜(≈7,800행)을 3시간 들고 있다가 시군구 키로 꺼낸다. 하루 8콜 안팎이라 쿼터는 넉넉히 48.
// 실패하면 24시간 안의 마지막 성공분을 stale 로, 없으면 에러. 실패 직후 다시 부르지 않게 UpstreamCooldown(30초→5분,
// 인증·한도 오류는 서비스 전체 5분→1시간). 단일 키라 in-flight 하나로 합류한다. docs/PLAN-hiking.md §3차

import { DailyQuota, UpstreamCooldown, retryAfterSec } from '../../lib/upstream-guard.js';
import { HikingApiError, fetchFireRisk, type FireRiskRow, type HikingApiOptions } from './hiking-api.adapter.js';

export const FIRE_TTL_MS = 3 * 60 * 60_000;
export const FIRE_STALE_MAX_MS = 24 * 60 * 60_000;
export const FIRE_DAILY_LIMIT = 48;
// 분석 시각보다 이만큼 지난 칸은 버린다(울릉군처럼 몇 달 묵은 행, 이미 지난 칸).
const FIRE_SLOT_KEEP_MS = 3 * 60 * 60_000;

export class ForestFireServiceError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = 'ForestFireServiceError';
  }
}

export interface FireSlot {
  at: string;
  d1: number;
  d2: number;
  d3: number;
  d4: number;
  mean: number | null;
  max: number | null;
}

export interface FireSnapshot {
  // 시군구 키 → 시각 순 칸.
  byKey: ReadonlyMap<string, { sido: string; name: string; slots: FireSlot[] }>;
  fetchedAt: Date;
  stale: boolean;
}

export interface ForestFireServiceDeps {
  serviceKey: string;
  fetchFire?: (opts: HikingApiOptions) => Promise<FireRiskRow[]>;
  now?: () => Date;
}

const UPSTREAM = 'forest-fire';

// 행 → 시군구별 칸. 같은 시군구·시각이 겹치면 뒤의 것. now − FIRE_SLOT_KEEP_MS 보다 이른 칸은 버린다.
export const groupFireRows = (rows: readonly FireRiskRow[], now: Date): FireSnapshot['byKey'] => {
  const from = now.getTime() - FIRE_SLOT_KEEP_MS;
  const out = new Map<string, { sido: string; name: string; slots: Map<string, FireSlot> }>();
  for (const r of rows) {
    if (Date.parse(r.at) < from) continue;
    let g = out.get(r.key);
    if (!g) {
      g = { sido: r.sido, name: r.name, slots: new Map() };
      out.set(r.key, g);
    }
    g.slots.set(r.at, { at: r.at, d1: r.d1, d2: r.d2, d3: r.d3, d4: r.d4, mean: r.mean, max: r.max });
  }
  return new Map(
    [...out].map(([k, g]) => [k, { sido: g.sido, name: g.name, slots: [...g.slots.values()].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)) }]),
  );
};

export class ForestFireService {
  private cache: { byKey: FireSnapshot['byKey']; fetchedAt: Date; expiresAt: number } | null = null;
  private inflight: Promise<FireSnapshot> | null = null;
  private readonly quota = new DailyQuota(
    { fire: FIRE_DAILY_LIMIT },
    () => new ForestFireServiceError('산불위험예보 일일 호출 한도를 소진했습니다.', 503),
  );
  private readonly cooldown = new UpstreamCooldown();

  constructor(private readonly deps: ForestFireServiceDeps) {}

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  async get(): Promise<FireSnapshot> {
    if (!this.deps.serviceKey) throw new ForestFireServiceError('DATA_GO_KR_API_KEY 가 설정되지 않아 산불위험예보를 조회할 수 없습니다.', 503);
    const now = this.now();
    const nowMs = now.getTime();
    const c = this.cache;
    if (c && nowMs <= c.expiresAt) return { byKey: c.byKey, fetchedAt: c.fetchedAt, stale: false };
    if (this.inflight) return this.inflight;
    const lastKnown = (): FireSnapshot | null =>
      c && nowMs - c.fetchedAt.getTime() <= FIRE_STALE_MAX_MS ? { byKey: c.byKey, fetchedAt: c.fetchedAt, stale: true } : null;
    const blockedUntil = this.cooldown.blockedUntil(UPSTREAM, 'all', nowMs);
    if (blockedUntil !== null) {
      const lk = lastKnown();
      if (lk) return lk;
      throw new ForestFireServiceError(`산불위험예보가 응답하지 않아 잠시 멈췄습니다. ${retryAfterSec(blockedUntil, nowMs)}초 뒤 다시 시도해 주세요.`, 503);
    }
    this.inflight = this.load(now, lastKnown).finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async load(now: Date, lastKnown: () => FireSnapshot | null): Promise<FireSnapshot> {
    const nowMs = now.getTime();
    try {
      this.quota.consume('fire', now);
      const rows = await (this.deps.fetchFire ?? fetchFireRisk)({ serviceKey: this.deps.serviceKey });
      this.cooldown.success(UPSTREAM, 'all');
      const byKey = groupFireRows(rows, now);
      this.cache = { byKey, fetchedAt: now, expiresAt: nowMs + FIRE_TTL_MS };
      return { byKey, fetchedAt: now, stale: false };
    } catch (e) {
      if (e instanceof HikingApiError) this.cooldown.failure(UPSTREAM, 'all', nowMs, /서비스키|SERVICE_KEY|LIMITED/.test(e.message));
      const lk = lastKnown();
      if (lk) return lk;
      if (e instanceof ForestFireServiceError) throw e;
      throw new ForestFireServiceError('산불위험예보를 받지 못했습니다.', 502);
    }
  }
}
