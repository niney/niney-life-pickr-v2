// 산불위험예보 캐시 — 전국 1콜(≈7,800행)을 3시간 들고 있다가 시군구 키로 꺼낸다. 하루 8콜 안팎이라 쿼터는 넉넉히 48(재시도 포함).
// 3시간이 지나면 24시간 안의 마지막 성공분을 바로 stale 로 내고 뒤에서 새로 받는다(처음 한 번만 받을 때까지 기다린다). 실패하면
// 마지막 성공분을 stale 로, 없으면 에러. 실패 직후 다시 부르지 않게 UpstreamCooldown(30초→5분, 인증·한도 오류는 서비스 전체
// 5분→1시간). 단일 키라 in-flight 하나로 합류한다. docs/PLAN-hiking.md §3차

import { DailyQuota, UpstreamCooldown, retryAfterSec } from '../../lib/upstream-guard.js';
import { HikingApiError, fetchFireRisk, type FireRiskRow, type HikingApiOptions } from './hiking-api.adapter.js';

export const FIRE_TTL_MS = 3 * 60 * 60_000;
export const FIRE_STALE_MAX_MS = 24 * 60 * 60_000;
export const FIRE_DAILY_LIMIT = 48;
// 요청 경로(오늘의 조건·추천)에서 부르는 호출이라 한 번(본문까지) 15초·재시도 1회 — 적재 스크립트 기본(20초·2회)이면 업스트림이
// 매달릴 때 한 번 받기가 최대 약 63초였다(2026-11 검토). 평소 1.7MB·1.5초.
export const FIRE_FETCH_TIMEOUT_MS = 15_000;
export const FIRE_FETCH_RETRIES = 1;
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
    const lastKnown: FireSnapshot | null =
      c && nowMs - c.fetchedAt.getTime() <= FIRE_STALE_MAX_MS ? { byKey: c.byKey, fetchedAt: c.fetchedAt, stale: true } : null;
    // 만료 뒤에는 마지막 성공분을 바로 낸다 — 갱신을 기다리면 3시간마다 그 시점의 조건·추천이 업스트림 시간(평소 1.5초, 매달리면
    // 수십 초)을 그대로 기다렸다(2026-11 검토). 갱신은 뒤에서 한 번만(in-flight 합류).
    if (this.inflight) return lastKnown ?? this.inflight;
    const blockedUntil = this.cooldown.blockedUntil(UPSTREAM, 'all', nowMs);
    if (blockedUntil !== null) {
      if (lastKnown) return lastKnown;
      throw new ForestFireServiceError(`산불위험예보가 응답하지 않아 잠시 멈췄습니다. ${retryAfterSec(blockedUntil, nowMs)}초 뒤 다시 시도해 주세요.`, 503);
    }
    const task = this.load(now, lastKnown).finally(() => {
      this.inflight = null;
    });
    this.inflight = task;
    if (lastKnown) {
      // 뒤에서 도는 갱신의 실패는 load 가 쿨다운으로 남기고 마지막 성공분을 돌려준다 — 처리되지 않은 거부가 남지 않게만.
      task.catch(() => undefined);
      return lastKnown;
    }
    return task;
  }

  private async load(now: Date, lastKnown: FireSnapshot | null): Promise<FireSnapshot> {
    try {
      this.quota.consume('fire', now);
      const rows = await (this.deps.fetchFire ?? fetchFireRisk)({
        serviceKey: this.deps.serviceKey,
        timeoutMs: FIRE_FETCH_TIMEOUT_MS,
        retries: FIRE_FETCH_RETRIES,
        // 재시도도 업스트림 호출이다 — 한도(48)가 실제로는 그 세 배까지 나가지 않게 센다.
        onRetry: () => this.quota.record('fire', this.now()),
      });
      this.cooldown.success(UPSTREAM, 'all');
      const byKey = groupFireRows(rows, now);
      this.cache = { byKey, fetchedAt: now, expiresAt: now.getTime() + FIRE_TTL_MS };
      return { byKey, fetchedAt: now, stale: false };
    } catch (e) {
      // 쿨다운은 실패를 안 시각부터 잰다 — 시작 시각으로 재면 오래 걸린 실패(타임아웃·재시도) 뒤엔 백오프(30초·1분)가 이미
      // 지나 있어 곧바로 다시 불렀다.
      if (e instanceof HikingApiError) {
        this.cooldown.failure(UPSTREAM, 'all', this.now().getTime(), /서비스키|SERVICE_KEY|LIMITED/.test(e.message));
      }
      if (lastKnown) return lastKnown;
      if (e instanceof ForestFireServiceError) throw e;
      throw new ForestFireServiceError('산불위험예보를 받지 못했습니다.', 502);
    }
  }
}
