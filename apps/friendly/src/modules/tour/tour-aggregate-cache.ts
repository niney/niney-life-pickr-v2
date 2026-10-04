// 여행로그 공개 집계(인사이트·지역 비교·숙소·밀도)의 캐시 관문(PLAN-perf-2 D-2·D-8). 데이터 버전(tour-data-version.ts —
// 적재·제거 이력의 최신 id 를 요청마다 읽고, 바뀌면 담긴 것을 버린다)에 묶은 LRU 위에
//   ① 같은 키·같은 버전의 동시 요청은 계산 하나에 합류시킨다(in-flight) — 예전엔 같은 키 3건이 3번 다 계산했다.
//   ② 서로 다른 키의 콜드 계산은 프로세스 공용 게이트(동시 TOUR_COLD_CONCURRENCY)로 줄 세운다 — region=all 집계 1건이 원시 행
//      수십만 개를 올려 RSS 가 수백 MB 오르는데, 게이트가 없으면 필터만 바꾼 동시 요청이 그만큼 겹친다. 적중은 게이트를 안 탄다.
// 등록 맛집 링크(네이버 placeId)처럼 매칭 실행으로 바뀌는 값은 여기 담지 말고 응답 때 붙인다(서비스 몫).

import type { PrismaClient } from '@prisma/client';
import { ConcurrencyGate } from '../ai/concurrency-gate.js';
import { TourVersionedCache, tourDataVersion } from './tour-data-version.js';

export const TOUR_COLD_CONCURRENCY = 2;
// 이력 없이 바뀌는 데이터(사업자 상태 갱신 등)는 TTL 로만 따라간다 — tour-data-version.ts 의 다른 공개 캐시와 같은 10분.
export const TOUR_AGGREGATE_TTL_MS = 10 * 60_000;

const coldGate = new ConcurrencyGate(TOUR_COLD_CONCURRENCY);

export const withTourColdSlot = async <T>(fn: () => Promise<T>): Promise<T> => {
  await coldGate.acquire();
  try {
    return await fn();
  } finally {
    coldGate.release();
  }
};

export interface TourAggregateCacheOptions {
  max: number;
  ttlMs?: number;
}

export class TourAggregateCache<V extends object> {
  private readonly cache: TourVersionedCache<V>;
  private readonly inflight = new Map<string, Promise<V>>();

  constructor(
    private readonly prisma: PrismaClient,
    opts: TourAggregateCacheOptions,
  ) {
    this.cache = new TourVersionedCache<V>({ max: opts.max, ttl: opts.ttlMs ?? TOUR_AGGREGATE_TTL_MS });
  }

  async get(key: string, compute: () => Promise<V>): Promise<V> {
    // 집계보다 먼저 버전을 읽는다 — 그래야 어떤 버전으로 담긴 값이 그 버전보다 옛 데이터일 수 없다(tour-data-version.ts).
    const version = await tourDataVersion(this.prisma);
    const hit = this.cache.get(version, key);
    if (hit !== undefined) return hit;
    const k = `${version}|${key}`;
    const running = this.inflight.get(k);
    if (running) return running;
    const task = withTourColdSlot(compute)
      .then((v) => {
        // 계산하는 사이 버전이 바뀌었으면 TourVersionedCache 가 담지 않는다.
        this.cache.set(version, key, v);
        return v;
      })
      .finally(() => this.inflight.delete(k));
    this.inflight.set(k, task);
    return task;
  }

  clear(): void {
    this.cache.clear();
  }
}
