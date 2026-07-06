// 수도권 전철 — 역 검색(로컬 DB) + 실시간 도착정보(swopenAPI 프록시).
//
// 검색은 업스트림 콜이 없는 로컬 역사마스터 조회(캐시/쿼터 무관, source 'db').
// 도착정보는 실시간이라 stale 폴백이 없다 — 대신 역명 단위 15초 마이크로 캐시 +
// in-flight 합류로 동시 사용자의 업스트림 콜을 공유하고, 일일 쿼터로 한도를 지킨다
// (bus.service 의 쿼터/in-flight 규율 이식). 6차 실시간 위치도 이 골격을 재사용한다.

import type { PrismaClient } from '@prisma/client';
import type {
  SubwayArrivalItemType,
  SubwayArrivalsResultType,
  SubwayStationSearchResultType,
} from '@repo/api-contract';
import {
  getRealtimeArrivals,
  type RawSubwayArrival,
  type SubwayApiRequestOptions,
} from './subway-api.adapter.js';
import { groupStations, type StationForGrouping } from './subway-master.service.js';

// 검색 응답 상한 — total 은 절단 전 그룹 수(FE 가 '일부만 표시' 안내).
export const MAX_GROUPS = 30;

// 실시간 인프라 상수.
export const ARRIVALS_MICRO_CACHE_TTL_MS = 15_000;
// 일일 업스트림 호출 한도 기본값 — 도착/위치(6차)가 'realtime' 그룹으로 공유한다.
export const DEFAULT_DAILY_UPSTREAM_LIMIT = 900;

// Asia/Seoul 기준 YYYY-MM-DD — 쿼터 리셋 경계. en-CA 로캘이 ISO 형식을 낸다.
const SEOUL_DATE_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const seoulDateKey = (d: Date): string => SEOUL_DATE_FMT.format(d);

// 라우트가 HTTP status 로 변환하는 서비스 에러(bus.service 와 동일 규율).
// error-handler 는 statusCode >= 500 을 일괄 500 으로 뭉개므로 라우트가 직접 내린다.
export class SubwayServiceError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    opts: { cause?: unknown } = {},
  ) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = 'SubwayServiceError';
  }
}

export interface SubwayServiceDeps {
  prisma: PrismaClient;
  // 실시간(도착/위치) 업스트림 키 — 빈 값이면 실시간 메서드가 첫 줄에서 503.
  // 검색은 로컬 DB 조회라 키가 불필요하다.
  serviceKey?: string;
  // 테스트 주입 — fetchedAt/TTL/쿼터 시간 제어.
  now?: () => Date;
  // 테스트 주입 — 일일 업스트림 한도(기본 900).
  dailyLimit?: number;
  // 테스트 주입 — 마이크로 캐시 TTL(기본 15s).
  microCacheTtlMs?: number;
  // 테스트 주입 — 실시간 어댑터(기본은 실제 swopenAPI).
  adapter?: {
    getRealtimeArrivals: (
      stationName: string,
      opts: SubwayApiRequestOptions,
    ) => Promise<RawSubwayArrival[]>;
  };
}

// 'yyyy-MM-dd HH:mm:ss'(KST) → UTC ISO. 서버 TZ 를 가정하지 않도록 +09:00 을
// 명시해 파싱한다(공식 가이드: recptnDt 가 카운트다운 기준 시각). 형식이 어긋나면 null.
const recptnToIso = (v: string | null): string | null => {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(v.trim());
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+09:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

// RawSubwayArrival → 계약 항목. subwayId 는 호출측이 그룹 lineId 로 필터해 넘기므로
// 항상 non-null(4자리). updnLine 은 계약상 non-null 이라 빈 문자 폴백, 나머지는 원문.
const toArrivalItem = (a: RawSubwayArrival): SubwayArrivalItemType => ({
  lineId: a.subwayId as string,
  updnLine: a.updnLine ?? '',
  trainLineNm: a.trainLineNm,
  destination: a.bstatnNm,
  trainKind: a.btrainSttus,
  trainNo: a.btrainNo,
  arrivalSec: a.barvlDt,
  arrivalMsg: a.arvlMsg2,
  arrivalCode: a.arvlCd,
  isLastTrain: a.lstcarAt === '1',
  receivedAt: recptnToIso(a.recptnDt),
});

// arrivalSec 오름차순(null 은 뒤로), 동률/양쪽 null 은 arrivalCode 오름차순(null 뒤로).
const compareArrival = (a: SubwayArrivalItemType, b: SubwayArrivalItemType): number => {
  const as = a.arrivalSec;
  const bs = b.arrivalSec;
  if (as !== null && bs !== null && as !== bs) return as - bs;
  if (as === null && bs !== null) return 1;
  if (as !== null && bs === null) return -1;
  const ac = a.arrivalCode ?? '￿';
  const bc = b.arrivalCode ?? '￿';
  return ac < bc ? -1 : ac > bc ? 1 : 0;
};

const toGrouping = (r: {
  id: string;
  name: string;
  lineId: string;
  lineName: string;
  lat: number;
  lng: number;
}): StationForGrouping => ({
  id: r.id,
  name: r.name,
  lineId: r.lineId,
  lineName: r.lineName,
  lat: r.lat,
  lng: r.lng,
});

// 역명 단위 마이크로 캐시 엔트리 — 필터 전 raw 배열을 담아 동명이역 두 그룹이
// 같은 조회명 캐시를 공유하고, 필터는 서빙 시점에 그룹 lineId 로 건다.
interface ArrivalCacheEntry {
  data: RawSubwayArrival[];
  fetchedAt: Date;
  expiresAt: number;
}

export class SubwayService {
  // 'realtime' 단일 그룹 카운터 — 도착(2차)·위치(6차)가 공유. 단일 인스턴스 전제(메모리).
  private readonly quota = new Map<string, { dateKey: string; count: number }>();
  // 조회역명 단위 15초 마이크로 캐시.
  private readonly microCache = new Map<string, ArrivalCacheEntry>();
  // 같은 조회역명 동시 요청 합류.
  private readonly inflight = new Map<string, Promise<{ data: RawSubwayArrival[]; fetchedAt: Date }>>();

  constructor(private readonly deps: SubwayServiceDeps) {}

  async searchStations(q: string): Promise<SubwayStationSearchResultType> {
    // 1차 방어는 스키마(SubwayStationSearchQuery 가 NFC 정규화 후 길이 검증) —
    // 여기는 라우트 밖 호출자 대비 이중 방어.
    const keyword = q.trim().normalize('NFC');
    const { prisma } = this.deps;

    // name 부분일치 + 최신 적재 시각(fetchedAt)을 병렬로. SQLite LIKE 는 한글을
    // 바이트 부분일치로 처리하므로 mode 옵션 불필요.
    const [rows, sync] = await Promise.all([
      prisma.subwayStation.findMany({ where: { name: { contains: keyword } } }),
      prisma.subwayMasterSync.findFirst({ orderBy: { loadedAt: 'desc' } }),
    ]);

    // 매칭 0 이면 마스터 자체가 비었는지 확인 — 빈 마스터(미적재)는 503, 단순
    // 무매칭은 빈 결과(200)로 구분한다.
    if (rows.length === 0) {
      const total = await prisma.subwayStation.count();
      if (total === 0) {
        throw new SubwayServiceError(
          '지하철 역 데이터가 없습니다 — load:subway-stations 실행 필요',
          503,
        );
      }
    }

    const groups = groupStations(rows.map(toGrouping));

    // 정렬: 전방일치 그룹 우선 → name 길이 → name 사전순(한국어).
    groups.sort((a, b) => {
      const aPrefix = a.name.startsWith(keyword) ? 0 : 1;
      const bPrefix = b.name.startsWith(keyword) ? 0 : 1;
      if (aPrefix !== bPrefix) return aPrefix - bPrefix;
      if (a.name.length !== b.name.length) return a.name.length - b.name.length;
      return a.name.localeCompare(b.name, 'ko');
    });

    const fetchedAt = (sync?.loadedAt ?? this.deps.now?.() ?? new Date()).toISOString();

    return {
      items: groups.slice(0, MAX_GROUPS),
      total: groups.length,
      fetchedAt,
      source: 'db',
    };
  }

  // 역 실시간 도착정보 — stationId 로 역명 그룹을 재구성해 유니크 조회역명별로
  // 업스트림을 부르고(캐시/쿼터/in-flight), 합본을 그룹 lineId 로 필터한다.
  async getStationArrivals(stationId: string): Promise<SubwayArrivalsResultType> {
    if (!this.deps.serviceKey) {
      throw new SubwayServiceError(
        'SUBWAY_API_KEY 가 설정되지 않아 실시간 도착 조회를 사용할 수 없습니다.',
        503,
      );
    }
    const { prisma } = this.deps;

    const station = await prisma.subwayStation.findUnique({ where: { id: stationId } });
    if (!station) {
      throw new SubwayServiceError('해당 역을 찾을 수 없습니다.', 404);
    }

    // 그룹 재구성 — 같은 name 행을 좌표로 클러스터링해 stationId 가 속한 그룹을
    // 고른다(동명이역이 name 만으로는 섞이지만 groupStations 가 분리한다).
    const rows = await prisma.subwayStation.findMany({ where: { name: station.name } });
    const groups = groupStations(rows.map(toGrouping));
    const group = groups.find((g) => g.lines.some((l) => l.stationId === stationId));
    const groupLines = group?.lines ?? [
      {
        stationId: station.id,
        lineId: station.lineId,
        lineName: station.lineName,
        lat: station.lat,
        lng: station.lng,
      },
    ];
    const lineIdSet = new Set(groupLines.map((l) => l.lineId));
    const lines = [...lineIdSet].sort();

    // 유니크 조회역명 = uniq(realtimeName ?? name) — 신촌은 {'신촌','신촌(경의중앙선)'}.
    const rowById = new Map(rows.map((r) => [r.id, r]));
    const queryNames = [
      ...new Set(
        groupLines.map((l) => rowById.get(l.stationId)?.realtimeName ?? station.name),
      ),
    ];

    const now = this.deps.now?.() ?? new Date();

    // 조회역명별 병렬 — 각자 캐시/in-flight, 미스는 쿼터 소비 후 업스트림.
    const results = await Promise.all(queryNames.map((qn) => this.fetchArrivals(qn, now)));

    // 합본 → 그룹 lineId 필터(동명이역 오염 차단) → normalize → 정렬.
    const merged: RawSubwayArrival[] = [];
    let earliest: Date | null = null;
    for (const r of results) {
      merged.push(...r.data);
      if (!earliest || r.fetchedAt < earliest) earliest = r.fetchedAt;
    }
    const items = merged
      .filter((a) => a.subwayId !== null && lineIdSet.has(a.subwayId))
      .map(toArrivalItem)
      .sort(compareArrival);

    return {
      stationId,
      name: station.name,
      lines,
      items,
      fetchedAt: (earliest ?? now).toISOString(),
    };
  }

  // 조회역명 1개의 도착 raw 배열 — 캐시 히트 시 캐시 fetchedAt 보존, 미스는
  // in-flight 합류(같은 역명 동시 요청 업스트림 1콜).
  private fetchArrivals(
    queryName: string,
    now: Date,
  ): Promise<{ data: RawSubwayArrival[]; fetchedAt: Date }> {
    const key = `arrivals:${queryName}`;

    const cached = this.microCache.get(key);
    if (cached) {
      if (now.getTime() <= cached.expiresAt) {
        return Promise.resolve({ data: cached.data, fetchedAt: cached.fetchedAt });
      }
      this.microCache.delete(key); // 만료 청소.
    }

    const existing = this.inflight.get(key);
    if (existing) return existing;

    const task = this.loadArrivals(queryName, key, now).finally(() => {
      this.inflight.delete(key);
    });
    this.inflight.set(key, task);
    return task;
  }

  private async loadArrivals(
    queryName: string,
    key: string,
    now: Date,
  ): Promise<{ data: RawSubwayArrival[]; fetchedAt: Date }> {
    // 쿼터는 실제 업스트림 콜 직전(캐시 미스 확정)에만 소비.
    this.consumeQuota('realtime', now);
    const fetch = this.deps.adapter?.getRealtimeArrivals ?? getRealtimeArrivals;
    const data = await fetch(queryName, { apiKey: this.deps.serviceKey! });
    const ttl = this.deps.microCacheTtlMs ?? ARRIVALS_MICRO_CACHE_TTL_MS;
    this.microCache.set(key, { data, fetchedAt: now, expiresAt: now.getTime() + ttl });
    return { data, fetchedAt: now };
  }

  // 일일 업스트림 쿼터 소비 — 초과 시 소비 없이 503. 실시간이라 stale 폴백 없음.
  private consumeQuota(group: string, now: Date): void {
    const dateKey = seoulDateKey(now);
    let q = this.quota.get(group);
    if (!q || q.dateKey !== dateKey) {
      q = { dateKey, count: 0 };
      this.quota.set(group, q);
    }
    if (q.count >= (this.deps.dailyLimit ?? DEFAULT_DAILY_UPSTREAM_LIMIT)) {
      throw new SubwayServiceError(
        '서울시 지하철 API 일일 호출 한도를 소진해 요청을 처리할 수 없습니다. 잠시 후 다시 시도해주세요.',
        503,
      );
    }
    q.count += 1;
  }
}
