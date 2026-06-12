// 버스 정류장 검색 — 서울시 API 프록시 + DB 장기 캐싱.
//
// 캐싱 정책 (개발계정 일 1,000건 한도 보호):
//   - TTL 30일 — 정류소 정보는 거의 안 바뀐다.
//   - force(사용자 강제 갱신)라도 60초 내 재수집은 캐시로 응답.
//   - 빈 결과도 검색 행을 남긴다(네거티브 캐싱 — 무의미 키워드 반복 차단).
//   - 업스트림 실패 시 만료된 캐시라도 있으면 'stale' 로 반환(가용성 우선).
//   - 동일 키워드 동시 요청은 in-flight 합류 — 업스트림 1회만 호출.
//   - 일일 업스트림 쿼터 가드(기본 900) — 단일 인스턴스 전제라 메모리 카운터로
//     충분(Redis 금지 정책).

import type { Prisma, PrismaClient } from '@prisma/client';
import type { BusStationSearchResultType } from '@repo/api-contract';
import {
  BusApiError,
  getStationsByName,
  toLatLng,
  type BusApiRequestOptions,
  type RawBusStation,
} from './bus-api.adapter.js';

export const BUS_SEARCH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const FORCE_MIN_INTERVAL_MS = 60_000;
// 응답 상한 — total 은 절단 전 건수 (FE 가 '일부만 표시' 안내).
const MAX_ITEMS = 100;
// 일일 업스트림 호출 한도 기본값 — 개발계정 일 1,000건에서 여유를 둔 900.
export const DEFAULT_DAILY_UPSTREAM_LIMIT = 900;

// Asia/Seoul 기준 YYYY-MM-DD — 쿼터 리셋 경계. en-CA 로캘이 ISO 형식을 낸다.
const SEOUL_DATE_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const seoulDateKey = (d: Date): string => SEOUL_DATE_FMT.format(d);

// 라우트가 HTTP status 로 변환하는 서비스 에러. error-handler 플러그인은
// statusCode >= 500 을 일괄 500 으로 응답하므로 라우트가 직접 코드를 내린다.
export class BusServiceError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    opts: { cause?: unknown } = {},
  ) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = 'BusServiceError';
  }
}

export interface BusServiceDeps {
  serviceKey: string;
  // 테스트 주입용 — 기본은 실제 서울시 API 어댑터.
  adapter?: {
    getStationsByName: (
      keyword: string,
      opts: BusApiRequestOptions,
    ) => Promise<RawBusStation[]>;
  };
  // 테스트 주입용 — TTL/60초 가드 시간 제어 (가짜 타이머 불필요).
  now?: () => Date;
  // 일일 업스트림 호출 한도 (기본 DEFAULT_DAILY_UPSTREAM_LIMIT) — 테스트 주입용.
  dailyLimit?: number;
}

type CachedSearch = Prisma.BusStationSearchGetPayload<{
  include: { hits: { include: { station: true } } };
}>;

const toResult = (
  cached: CachedSearch,
  source: 'cache' | 'stale',
): BusStationSearchResultType => ({
  items: cached.hits.slice(0, MAX_ITEMS).map((h) => ({
    stId: h.station.stId,
    arsId: h.station.arsId,
    name: h.station.name,
    lat: h.station.lat,
    lng: h.station.lng,
  })),
  total: cached.hits.length,
  fetchedAt: cached.fetchedAt.toISOString(),
  source,
});

export class BusService {
  // 동일 키워드 동시 요청 합류용 — 진행 중 Promise 를 공유하고 finally 에서 제거.
  private readonly inflight = new Map<string, Promise<BusStationSearchResultType>>();
  // Asia/Seoul 날짜 단위 업스트림 호출 카운터 — 단일 인스턴스 전제(메모리).
  private quota = { dateKey: '', count: 0 };

  constructor(
    private readonly prisma: PrismaClient,
    private readonly deps: BusServiceDeps,
  ) {}

  async searchStations(q: string, force: boolean): Promise<BusStationSearchResultType> {
    if (!this.deps.serviceKey) {
      throw new BusServiceError(
        'BUS_API_KEY 가 설정되지 않아 버스 정류장 검색을 사용할 수 없습니다.',
        503,
      );
    }

    // 1차 방어는 스키마(BusStationSearchQuery 가 NFC 정규화 후 길이 검증) —
    // 여기는 라우트 밖 호출자 대비 이중 방어 + in-flight/캐시 키 정규화.
    const keyword = q.trim().normalize('NFC');

    const existing = this.inflight.get(keyword);
    if (existing) return existing;
    const task = this.executeSearch(keyword, force).finally(() => {
      this.inflight.delete(keyword);
    });
    this.inflight.set(keyword, task);
    return task;
  }

  private async executeSearch(
    keyword: string,
    force: boolean,
  ): Promise<BusStationSearchResultType> {
    const now = this.deps.now?.() ?? new Date();

    const cached = await this.prisma.busStationSearch.findUnique({
      where: { keyword },
      include: { hits: { include: { station: true }, orderBy: { rank: 'asc' } } },
    });

    if (cached) {
      const ageMs = now.getTime() - cached.fetchedAt.getTime();
      if (!force && ageMs < BUS_SEARCH_TTL_MS) return toResult(cached, 'cache');
      // force 라도 60초 내 재수집은 캐시로 — 갱신 버튼 연타로 한도 소진 방지.
      if (force && ageMs < FORCE_MIN_INTERVAL_MS) return toResult(cached, 'cache');
    }

    // 일일 쿼터 가드 — 한도 초과 시 업스트림 호출 없이 만료 캐시(stale)나 503.
    const dateKey = seoulDateKey(now);
    if (this.quota.dateKey !== dateKey) this.quota = { dateKey, count: 0 };
    if (this.quota.count >= (this.deps.dailyLimit ?? DEFAULT_DAILY_UPSTREAM_LIMIT)) {
      if (cached) return toResult(cached, 'stale');
      throw new BusServiceError(
        '서울시 버스 API 일일 호출 한도를 소진해 새 검색을 처리할 수 없습니다. 내일 다시 시도해주세요.',
        503,
      );
    }
    // 실패해도 호출 시도 자체가 한도를 소모하므로 호출 직전 증가.
    this.quota.count += 1;

    const fetchStations = this.deps.adapter?.getStationsByName ?? getStationsByName;
    let raw: RawBusStation[];
    try {
      raw = await fetchStations(keyword, { serviceKey: this.deps.serviceKey });
    } catch (e) {
      // 만료된 캐시라도 있으면 stale 로 반환 — 업스트림 장애에 검색이 통째로
      // 죽는 것보다 오래된 정류소 목록이 낫다.
      if (cached) return toResult(cached, 'stale');
      if (e instanceof BusApiError) throw e; // statusCode 502/503 내장
      throw new BusServiceError(
        e instanceof Error ? e.message : '버스 API 호출 실패',
        502,
        { cause: e },
      );
    }

    // 좌표 정규화 실패(WGS84 범위 밖/누락) 행은 drop — 계약(lat 33~39)을
    // 만족할 수 없어 직렬화에서 어차피 막힌다. stId 중복은 첫 등장(상위 rank)
    // 만 채택 — hits 복합 PK 충돌 방지.
    const seen = new Set<string>();
    const stations: { stId: string; arsId: string; name: string; lat: number; lng: number }[] =
      [];
    for (const r of raw) {
      const coord = toLatLng(r);
      if (!coord || seen.has(r.stId)) continue;
      seen.add(r.stId);
      stations.push({
        stId: r.stId,
        arsId: r.arsId,
        name: r.stNm,
        lat: coord.lat,
        lng: coord.lng,
      });
    }

    // 전량 좌표 정규화 실패 = TM-only 응답 신호 — 빈 결과로 30일 네거티브
    // 캐싱하면 박제되므로 캐시 기록 없이 502 (만료 캐시가 있으면 stale 우선).
    // raw 자체가 빈 경우(진짜 결과 없음)는 아래에서 기존대로 네거티브 캐싱.
    if (raw.length > 0 && stations.length === 0) {
      if (cached) return toResult(cached, 'stale');
      throw new BusServiceError(
        '좌표 정규화 실패 — 서울시 응답이 WGS84 가 아닙니다(좌표계 미지원, probe:bus 확인 필요).',
        502,
      );
    }

    // 빈 결과도 검색 행을 남긴다 — 네거티브 캐싱.
    await this.prisma.$transaction(async (tx) => {
      for (const s of stations) {
        await tx.busStation.upsert({
          where: { stId: s.stId },
          create: s,
          update: { arsId: s.arsId, name: s.name, lat: s.lat, lng: s.lng },
        });
      }
      const search = await tx.busStationSearch.upsert({
        where: { keyword },
        create: { keyword, fetchedAt: now },
        update: { fetchedAt: now },
      });
      await tx.busStationSearchHit.deleteMany({ where: { searchId: search.id } });
      if (stations.length > 0) {
        await tx.busStationSearchHit.createMany({
          data: stations.map((s, i) => ({ searchId: search.id, stId: s.stId, rank: i })),
        });
      }
    });

    return {
      items: stations.slice(0, MAX_ITEMS),
      total: stations.length,
      fetchedAt: now.toISOString(),
      source: 'api',
    };
  }
}
