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
  SubwayCongestionDirectionType,
  SubwayCongestionResultType,
  SubwayLineDetailResultType,
  SubwayNearbyResultType,
  SubwayPathLegType,
  SubwayPathResultType,
  SubwayPositionsResultType,
  SubwayStationSearchResultType,
  SubwayTimetableDirectionType,
  SubwayTimetableResultType,
  SubwayTrainPositionItemType,
} from '@repo/api-contract';
import { approxDistanceM, roundCoord, subwayLineById, subwayLineName } from '@repo/utils';
import { isLoopSection } from './subway-line-order.service.js';
import {
  buildSectionShapeIndex,
  sliceLegPath,
  type SectionShapeIndex,
} from './subway-shape.service.js';
import {
  getRealtimeArrivals,
  getRealtimePositions,
  getStationTimetable,
  SubwayApiError,
  type RawSubwayArrival,
  type RawSubwayPosition,
  type RawSubwayTimetableRow,
  type SubwayApiRequestOptions,
} from './subway-api.adapter.js';
import { groupStations, type StationForGrouping } from './subway-master.service.js';
import {
  buildSubwayGraph,
  compressPathLegs,
  findPath,
  RIDE_SEC_PER_STATION,
  SUBWAY_GRAPH_TTL_MS,
  TRANSFER_SEC,
  type SubwayGraph,
} from './subway-path.service.js';

// 검색 응답 상한 — total 은 절단 전 그룹 수(FE 가 '일부만 표시' 안내).
export const MAX_GROUPS = 30;

// 실시간 인프라 상수.
export const ARRIVALS_MICRO_CACHE_TTL_MS = 15_000;
// 일일 업스트림 호출 한도 기본값 — 도착/위치(6차)가 'realtime' 그룹으로 공유한다.
export const DEFAULT_DAILY_UPSTREAM_LIMIT = 900;

// 시간표(8차) blob 캐시 TTL — 사실상 정적이라 30일(버스 노선상세 미러).
export const SUBWAY_TIMETABLE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// 서울시 시간표 제공 노선 — 1~9호선(중전철). 경전철·광역은 미제공(프로브 실측).
const TIMETABLE_LINES = new Set([
  '1001',
  '1002',
  '1003',
  '1004',
  '1005',
  '1006',
  '1007',
  '1008',
  '1009',
]);

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
  // 시간표(8차) 업스트림 키(SEOUL_OPEN_API_KEY) — 실시간 키와 발급처가 다르다.
  seoulKey?: string;
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
    getRealtimePositions?: (
      lineNameParam: string,
      opts: SubwayApiRequestOptions,
    ) => Promise<RawSubwayPosition[]>;
    getStationTimetable?: (
      stationCd: string,
      weekTag: string,
      inoutTag: string,
      opts: SubwayApiRequestOptions,
    ) => Promise<RawSubwayTimetableRow[]>;
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

// RawSubwayPosition → 계약 항목. trainNo/statnId 는 호출측이 non-null 필터하고
// 넘긴다. directAt '0'(일반)은 null, 나머지는 원문. coord 는 마스터 statnId 배치
// 조인 결과(없으면 null — 좌표는 부가 정보라 정상).
const toPositionItem = (
  p: RawSubwayPosition,
  coord: { lat: number; lng: number } | null,
): SubwayTrainPositionItemType => ({
  trainNo: p.trainNo as string,
  statnId: p.statnId as string,
  statnNm: p.statnNm ?? '',
  trainStatus: p.trainSttus ?? '',
  updnLine: p.updnLine ?? '',
  destinationId: p.statnTid,
  destinationName: p.statnTnm,
  expressType: p.directAt === '0' ? null : p.directAt,
  isLastTrain: p.lstcarAt === '1',
  receivedAt: recptnToIso(p.recptnDt),
  lat: coord?.lat ?? null,
  lng: coord?.lng ?? null,
});

// 연속 공백 접기 + trim — DESTSTATION(SUBWAYENAME) 역명 정리. 비면 null.
const collapseSpaces = (v: string | null): string | null => {
  if (v === null) return null;
  const t = v.replace(/\s+/g, ' ').trim();
  return t.length > 0 ? t : null;
};

// 방향(상/하행) 시간표 정규화 — arriveTime 오름차순, first/last 파생. ARRIVETIME 은
// 자정 넘김을 24/25시로 표기('24:46:00', '00:00:00' 미관측)라 문자열 정렬이 곧
// 시각 순서다(0시 wraparound 없음). 빈 arriveTime 행은 제외한다.
const normalizeDirection = (
  updn: string,
  rows: RawSubwayTimetableRow[],
): SubwayTimetableDirectionType => {
  const trains = rows
    .filter((r) => r.arriveTime && r.arriveTime.length > 0)
    .map((r) => ({
      arriveTime: r.arriveTime as string,
      leaveTime: r.leaveTime ?? '',
      trainNo: r.trainNo,
      expressTag: r.expressYn, // 'G' 일반 / 'D' 급행(9호선 실측)
      destination: collapseSpaces(r.destName), // SUBWAYENAME(종착역명)
    }))
    .sort((a, b) => (a.arriveTime < b.arriveTime ? -1 : a.arriveTime > b.arriveTime ? 1 : 0));
  return {
    updn,
    trains,
    firstTrain: trains.length > 0 ? trains[0]!.arriveTime : null,
    lastTrain: trains.length > 0 ? trains[trains.length - 1]!.arriveTime : null,
  };
};

// blob 캐시 payload — 서빙 시 stationId/name/lineId/dayType/fetchedAt/source 덧댐.
interface TimetableBlob {
  coverage: boolean;
  directions: SubwayTimetableDirectionType[];
}

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

// SubwayLineShape 행 JSON 파싱 — 형식이 어긋나면 null(형상 부착 생략, 직선 폴백).
const parseShapeRow = (
  row: { path: string; stationS: string } | undefined,
): { path: [number, number][]; stationS: number[] } | null => {
  if (!row) return null;
  try {
    const path = JSON.parse(row.path) as unknown;
    const stationS = JSON.parse(row.stationS) as unknown;
    if (!Array.isArray(path) || path.length < 2 || !Array.isArray(stationS)) return null;
    return { path: path as [number, number][], stationS: stationS as number[] };
  } catch {
    return null;
  }
};

// 실시간 마이크로 캐시 엔트리 — 필터/정규화 전 raw 배열을 담는다(도착은 동명이역
// 두 그룹이 같은 조회명 캐시를 공유하고 필터는 서빙 시점에 건다). 도착
// (RawSubwayArrival[])·위치(RawSubwayPosition[])가 같은 캐시를 쓰므로 unknown[].
interface RealtimeCacheEntry {
  data: unknown[];
  fetchedAt: Date;
  expiresAt: number;
}

export class SubwayService {
  // 'realtime' 단일 그룹 카운터 — 도착(2차)·위치(6차)가 공유. 단일 인스턴스 전제(메모리).
  private readonly quota = new Map<string, { dateKey: string; count: number }>();
  // 키(`arrivals:역명` / `positions:호선명`) 단위 15초 마이크로 캐시.
  private readonly microCache = new Map<string, RealtimeCacheEntry>();
  // 같은 키 동시 요청 합류.
  private readonly inflight = new Map<string, Promise<{ data: unknown[]; fetchedAt: Date }>>();
  // 시간표 수집 동시 요청 합류 (cacheKey 단위) — 캐시 미스 시 업스트림 2콜 공유.
  private readonly timetableInflight = new Map<string, Promise<TimetableBlob>>();
  // 경로 그래프(11차) lazy 캐시 — 재적재 드물어 TTL 로 충분. 동시 구축 합류.
  private graphCache?: { graph: SubwayGraph; builtAt: number };
  private graphInflight?: Promise<SubwayGraph>;

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

  // 좌표 기반 주변 역 — 로컬 마스터 바운딩박스 조회(업스트림 0콜, 쿼터/캐시/키 무관).
  // 박스로 후보 행을 좁힌 뒤 groupStations 로 묶고, 그룹 대표 좌표(평균) 기준
  // approxDistanceM 으로 dist 를 계산해 반경 내만 남긴다(행은 박스 안이어도 대표
  // 좌표가 반경 밖일 수 있어 대표 좌표가 계약 기준). dist 오름차순 30그룹 절단.
  async getNearbyStations(
    lat: number,
    lng: number,
    radius: number,
  ): Promise<SubwayNearbyResultType> {
    const { prisma } = this.deps;

    // 등거리 근사 바운딩박스 — 경도는 위도만큼 좁아지므로 cos 보정.
    const degLat = radius / 111_320;
    const degLng = radius / (111_320 * Math.cos((lat * Math.PI) / 180));

    const [rows, sync] = await Promise.all([
      prisma.subwayStation.findMany({
        where: {
          lat: { gte: lat - degLat, lte: lat + degLat },
          lng: { gte: lng - degLng, lte: lng + degLng },
        },
      }),
      prisma.subwayMasterSync.findFirst({ orderBy: { loadedAt: 'desc' } }),
    ]);

    // 박스 내 0행이면 마스터 자체가 비었는지 확인 — 미적재는 503, 단순 주변 없음은
    // 빈 결과(200)로 구분(검색과 동일 규율).
    if (rows.length === 0) {
      const total = await prisma.subwayStation.count();
      if (total === 0) {
        throw new SubwayServiceError(
          '지하철 역 데이터가 없습니다 — load:subway-stations 실행 필요',
          503,
        );
      }
    }

    const withDist = groupStations(rows.map(toGrouping))
      .map((g) => ({ ...g, dist: Math.round(approxDistanceM({ lat, lng }, g)) }))
      // 대표 좌표가 반경 밖(박스 모서리)인 그룹 제거.
      .filter((g) => g.dist <= radius)
      .sort((a, b) => a.dist - b.dist);

    const fetchedAt = (sync?.loadedAt ?? this.deps.now?.() ?? new Date()).toISOString();

    return {
      items: withDist.slice(0, MAX_GROUPS),
      total: withDist.length,
      fetchedAt,
      source: 'db',
    };
  }

  // 노선 상세(호선 보기) — load-subway-line-orders 가 적재한 SubwayLineStation
  // (본선/지선 section, seq)을 SubwayStation(이름·좌표)과 조인해 조립한다.
  // isTransfer 는 역명 그룹핑(같은 name 근접 ≥2 호선)으로 파생. 순서 데이터 없는
  // lineId 는 404. 로컬 조회라 업스트림/쿼터 무관.
  async getLineDetail(lineId: string): Promise<SubwayLineDetailResultType> {
    const { prisma } = this.deps;
    const [lineRows, sync, shapeRows] = await Promise.all([
      prisma.subwayLineStation.findMany({
        where: { lineId },
        orderBy: [{ branchKey: 'asc' }, { seq: 'asc' }],
      }),
      prisma.subwayMasterSync.findFirst({
        where: { source: 'line-orders' },
        orderBy: { loadedAt: 'desc' },
      }),
      prisma.subwayLineShape.findMany({ where: { lineId } }),
    ]);
    if (lineRows.length === 0) {
      throw new SubwayServiceError('해당 노선의 순서 데이터가 없습니다.', 404);
    }

    // 역 좌표/이름 — stationId 조인. 재적재 내성으로 FK 가 없어 누락 가능(필터).
    const stationIds = [...new Set(lineRows.map((r) => r.stationId))];
    const stations = await prisma.subwayStation.findMany({ where: { id: { in: stationIds } } });
    const stationById = new Map(stations.map((s) => [s.id, s]));

    // isTransfer — 이 노선 역들의 name 근접 그룹이 ≥2 호선이면 환승역.
    const names = [...new Set(stations.map((s) => s.name))];
    const neighbors = await prisma.subwayStation.findMany({ where: { name: { in: names } } });
    const transferIds = new Set<string>();
    for (const g of groupStations(neighbors.map(toGrouping))) {
      if (new Set(g.lines.map((l) => l.lineId)).size >= 2) {
        for (const l of g.lines) transferIds.add(l.stationId);
      }
    }

    // section 조립 — branchKey 별(main 먼저), seq 순. 누락 역 제외 후 seq 재번호로
    // 계약(1부터 연속) 보장. <2 역 section 은 제외.
    const byBranch = new Map<string, typeof lineRows>();
    const branchOrder: string[] = [];
    for (const r of lineRows) {
      let bucket = byBranch.get(r.branchKey);
      if (!bucket) {
        bucket = [];
        byBranch.set(r.branchKey, bucket);
        branchOrder.push(r.branchKey);
      }
      bucket.push(r);
    }
    branchOrder.sort((a, b) => (a === 'main' ? -1 : b === 'main' ? 1 : 0));

    const sections = branchOrder
      .map((branchKey) => {
        const rows = byBranch.get(branchKey)!;
        const built = rows
          .map((r) => {
            const st = stationById.get(r.stationId);
            if (!st) return null;
            return {
              stationId: r.stationId,
              name: st.name,
              isTransfer: transferIds.has(r.stationId),
              lat: st.lat,
              lng: st.lng,
            };
          })
          .filter((x): x is NonNullable<typeof x> => x !== null)
          .map((x, i) => ({ ...x, seq: i + 1 }));
        // 실형상(OSM, load-subway-shapes) — stationS 길이가 조립된 역 수와 일치할
        // 때만 부착(재적재 드리프트 내성). 없으면 FE 가 stations 직선 폴백.
        const shape = parseShapeRow(shapeRows.find((r) => r.branchKey === branchKey));
        const withShape = shape !== null && shape.stationS.length === built.length;
        return {
          branchKey,
          branchName: rows[0]?.branchName ?? null,
          isLoop: isLoopSection(lineId, branchKey),
          stations: built,
          ...(withShape ? { path: shape.path, stationS: shape.stationS } : {}),
        };
      })
      .filter((s) => s.stations.length >= 2);

    if (sections.length === 0) {
      throw new SubwayServiceError('해당 노선의 순서 데이터가 없습니다.', 404);
    }

    return {
      lineId,
      lineName: subwayLineName(lineId),
      sections,
      fetchedAt: (sync?.loadedAt ?? this.deps.now?.() ?? new Date()).toISOString(),
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
    const fetchArrivals = this.deps.adapter?.getRealtimeArrivals ?? getRealtimeArrivals;

    // 조회역명별 병렬 — 각자 캐시/in-flight, 미스는 쿼터 소비 후 업스트림.
    const results = await Promise.all(
      queryNames.map((qn) =>
        this.fetchRealtime(`arrivals:${qn}`, now, () =>
          fetchArrivals(qn, { apiKey: this.deps.serviceKey! }),
        ),
      ),
    );

    // 합본 → 그룹 lineId 필터(동명이역 오염 차단) → normalize → 정렬.
    const merged: RawSubwayArrival[] = [];
    let earliest: Date | null = null;
    for (const r of results) {
      merged.push(...(r.data as RawSubwayArrival[]));
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

  // 노선 실시간 열차 위치 — lineId → positionParam(호선명) 해석 후 도착과 같은
  // 실시간 인프라(캐시 `positions:${호선명}`·쿼터 'realtime'·in-flight)로 조회.
  // 응답 statnId 를 마스터 statnId 배치 조인해 좌표 enrich(실패 null). 미등재
  // lineId 는 404, 빈 키 503, INFO-200 은 빈 배열(어댑터가 처리).
  async getLinePositions(lineId: string): Promise<SubwayPositionsResultType> {
    if (!this.deps.serviceKey) {
      throw new SubwayServiceError(
        'SUBWAY_API_KEY 가 설정되지 않아 실시간 위치 조회를 사용할 수 없습니다.',
        503,
      );
    }
    const line = subwayLineById(lineId);
    if (!line || !line.positionParam) {
      throw new SubwayServiceError('해당 노선의 실시간 위치를 지원하지 않습니다.', 404);
    }
    const { prisma } = this.deps;
    const now = this.deps.now?.() ?? new Date();
    const fetchPositions = this.deps.adapter?.getRealtimePositions ?? getRealtimePositions;

    const { data, fetchedAt } = await this.fetchRealtime(`positions:${line.positionParam}`, now, () =>
      fetchPositions(line.positionParam!, { apiKey: this.deps.serviceKey! }),
    );
    // trainNo/statnId 필수(계약 min 1) — 누락 행 drop.
    const valid = (data as RawSubwayPosition[]).filter((p) => p.trainNo && p.statnId);

    // 좌표 enrich — statnId 배치 조인(행당 쿼리 금지). 미조인은 null.
    const statnIds = [...new Set(valid.map((p) => p.statnId as string))];
    const coordRows =
      statnIds.length > 0
        ? await prisma.subwayStation.findMany({
            where: { statnId: { in: statnIds } },
            select: { statnId: true, lat: true, lng: true },
          })
        : [];
    const coordByStatnId = new Map<string, { lat: number; lng: number }>();
    for (const c of coordRows) {
      if (c.statnId) coordByStatnId.set(c.statnId, { lat: c.lat, lng: c.lng });
    }

    const items = valid.map((p) =>
      toPositionItem(p, coordByStatnId.get(p.statnId as string) ?? null),
    );

    return { lineId, items, fetchedAt: fetchedAt.toISOString() };
  }

  // 역 시간표(1~9호선) — (stationId, dayType) blob 30일 캐시 + stale 폴백(버스
  // 노선상세 미러). 광역·경전철(또는 1~9호선인데 데이터 0)은 coverage:false.
  // 한 응답에 상·하행을 모두 담는다(업스트림은 방향별 2콜 — 캐시 미스 시만).
  async getStationTimetable(
    stationId: string,
    dayType: string,
  ): Promise<SubwayTimetableResultType> {
    const { prisma } = this.deps;
    const station = await prisma.subwayStation.findUnique({ where: { id: stationId } });
    if (!station) {
      throw new SubwayServiceError('해당 역을 찾을 수 없습니다.', 404);
    }
    const meta = { stationId, name: station.name, lineId: station.lineId, dayType };

    // coverage 판정 — 미제공 노선/코드 없음은 즉시 200(캐시·업스트림 없이).
    if (!TIMETABLE_LINES.has(station.lineId) || !station.stationCd) {
      return {
        ...meta,
        coverage: false,
        directions: [],
        fetchedAt: (this.deps.now?.() ?? new Date()).toISOString(),
        source: 'api',
      };
    }

    const cacheKey = `${stationId}|${dayType}`;
    const now = this.deps.now?.() ?? new Date();
    const cached = await prisma.subwayTimetableCache.findUnique({ where: { cacheKey } });
    if (cached && now.getTime() - cached.fetchedAt.getTime() < SUBWAY_TIMETABLE_TTL_MS) {
      const blob = JSON.parse(cached.payload) as TimetableBlob;
      return { ...meta, ...blob, fetchedAt: cached.fetchedAt.toISOString(), source: 'cache' };
    }

    // 미스 — 업스트림 2콜 수집(in-flight 합류). 실패/쿼터 소진 시 만료 blob 이면 stale.
    let blob: TimetableBlob;
    try {
      blob = await this.collectTimetable(cacheKey, station.stationCd, dayType, now);
    } catch (e) {
      if (cached) {
        const stale = JSON.parse(cached.payload) as TimetableBlob;
        return { ...meta, ...stale, fetchedAt: cached.fetchedAt.toISOString(), source: 'stale' };
      }
      if (e instanceof SubwayApiError || e instanceof SubwayServiceError) throw e;
      throw new SubwayServiceError(
        e instanceof Error ? e.message : '지하철 시간표 호출 실패',
        502,
        { cause: e },
      );
    }
    return { ...meta, ...blob, fetchedAt: now.toISOString(), source: 'api' };
  }

  // 시간대별 혼잡도(1~8호선 정적 통계) — load-subway-congestion 이 적재한 로컬
  // SubwayCongestion 을 조회. 역 없으면 404, 이 역 데이터 없으면 coverage:false
  // (9호선·광역·경전철·미조인), 전체 테이블 0행이면 503(미적재). 업스트림 무관.
  async getStationCongestion(
    stationId: string,
    dayType: string,
  ): Promise<SubwayCongestionResultType> {
    const { prisma } = this.deps;
    const station = await prisma.subwayStation.findUnique({ where: { id: stationId } });
    if (!station) {
      throw new SubwayServiceError('해당 역을 찾을 수 없습니다.', 404);
    }
    const meta = { stationId, name: station.name, lineId: station.lineId, dayType };

    const [rows, sync] = await Promise.all([
      prisma.subwayCongestion.findMany({
        where: { stationId, dayType },
        orderBy: { updn: 'asc' },
      }),
      prisma.subwayMasterSync.findFirst({
        where: { source: 'congestion' },
        orderBy: { loadedAt: 'desc' },
      }),
    ]);
    const fetchedAt = (sync?.loadedAt ?? this.deps.now?.() ?? new Date()).toISOString();

    if (rows.length === 0) {
      // 이 역 데이터 없음 — 테이블 자체가 비었으면 미적재(503), 아니면 coverage:false.
      const total = await prisma.subwayCongestion.count();
      if (total === 0) {
        throw new SubwayServiceError(
          '혼잡도 데이터가 없습니다 — load:subway-congestion 실행 필요',
          503,
        );
      }
      return { ...meta, coverage: false, directions: [], fetchedAt, source: 'db' };
    }

    const directions = rows.map((r) => ({
      updn: r.updn,
      slots: JSON.parse(r.slots) as SubwayCongestionDirectionType['slots'],
    }));
    return { ...meta, coverage: true, directions, fetchedAt, source: 'db' };
  }

  // 경로 탐색(11차) — 로컬 그래프 다익스트라. 두 역 없으면 404, 마스터/순서 미적재
  // 503. 미연결(순서 공백 등)은 found:false·legs [] 로 200. 업스트림 무관.
  async getPath(fromId: string, toId: string): Promise<SubwayPathResultType> {
    const { prisma } = this.deps;
    const [stationCount, orderCount] = await Promise.all([
      prisma.subwayStation.count(),
      prisma.subwayLineStation.count(),
    ]);
    if (stationCount === 0 || orderCount === 0) {
      throw new SubwayServiceError(
        '경로 데이터가 없습니다 — 역사 마스터/노선 순서 적재 필요',
        503,
      );
    }
    const [fromStation, toStation] = await Promise.all([
      prisma.subwayStation.findUnique({ where: { id: fromId } }),
      prisma.subwayStation.findUnique({ where: { id: toId } }),
    ]);
    if (!fromStation || !toStation) {
      throw new SubwayServiceError('해당 역을 찾을 수 없습니다.', 404);
    }

    const graph = await this.loadGraph();
    const path = findPath(graph, fromId, toId);
    const legs = compressPathLegs(graph, path);
    await this.attachLegShapes(legs);
    // 지표는 legs 기반 — 출발/도착역의 플랫폼 이동(선두/후미 환승 간선)은 "무의미"
    // 라 제외한다. 실제 탑승 leg 사이 경계만 환승(=legs-1). 소요도 탑승·환승만.
    const totalRideStations = legs.reduce((sum, l) => sum + l.rideCount, 0);
    const transferCount = legs.length > 0 ? legs.length - 1 : 0;
    const approxMinutes = path.found
      ? Math.round((totalRideStations * RIDE_SEC_PER_STATION + transferCount * TRANSFER_SEC) / 60)
      : null;
    const fetchedAt = (this.deps.now?.() ?? new Date()).toISOString();
    return {
      found: path.found,
      from: { stationId: fromId, name: fromStation.name },
      to: { stationId: toId, name: toStation.name },
      legs,
      transferCount,
      approxMinutes,
      totalRideStations,
      fetchedAt,
      source: 'db',
    };
  }

  // leg 실형상 부착 — 노선 형상(SubwayLineShape)이 있으면 탑승~하차 슬라이스를
  // leg.path 에 담는다. 형상 미시드·정렬 드리프트·쌍 미해소는 조용히 생략(FE 가
  // stations 직선 폴백). 경로 탐색은 저빈도라 요청 시 인덱스 구축로 충분.
  private async attachLegShapes(legs: SubwayPathLegType[]): Promise<void> {
    if (legs.length === 0) return;
    const { prisma } = this.deps;
    const lineIds = [...new Set(legs.map((l) => l.lineId))];
    const shapeRows = await prisma.subwayLineShape.findMany({
      where: { lineId: { in: lineIds } },
    });
    if (shapeRows.length === 0) return;
    const lineSts = await prisma.subwayLineStation.findMany({
      where: { lineId: { in: lineIds } },
      orderBy: [{ lineId: 'asc' }, { branchKey: 'asc' }, { seq: 'asc' }],
    });
    // 형상 적재(load-subway-shapes)와 동일한 좌표-누락 필터로 section 역 id 열을
    // 재구성해야 stationS anchor 와 인덱스가 맞는다.
    const stIds = [...new Set(lineSts.map((r) => r.stationId))];
    const existing = new Set(
      (
        await prisma.subwayStation.findMany({
          where: { id: { in: stIds } },
          select: { id: true },
        })
      ).map((s) => s.id),
    );
    const idsBySection = new Map<string, string[]>();
    for (const r of lineSts) {
      if (!existing.has(r.stationId)) continue;
      const key = `${r.lineId}:${r.branchKey}`;
      let ids = idsBySection.get(key);
      if (!ids) {
        ids = [];
        idsBySection.set(key, ids);
      }
      ids.push(r.stationId);
    }
    const sectionsByLine = new Map<string, SectionShapeIndex[]>();
    for (const row of shapeRows) {
      const parsed = parseShapeRow(row);
      if (!parsed) continue;
      const sec = buildSectionShapeIndex(
        parsed.path.map(([lat, lng]) => ({ lat, lng })),
        parsed.stationS,
        idsBySection.get(`${row.lineId}:${row.branchKey}`) ?? [],
        isLoopSection(row.lineId, row.branchKey),
      );
      if (!sec) continue;
      let list = sectionsByLine.get(row.lineId);
      if (!list) {
        list = [];
        sectionsByLine.set(row.lineId, list);
      }
      list.push(sec);
    }
    for (const leg of legs) {
      const secs = sectionsByLine.get(leg.lineId);
      if (!secs) continue;
      const sliced = sliceLegPath(
        secs,
        leg.stations.map((s) => s.stationId),
      );
      if (sliced) {
        leg.path = sliced.map((p) => [roundCoord(p.lat), roundCoord(p.lng)]);
      }
    }
  }

  // 그래프 lazy 구축 + TTL 캐시. 동시 첫 요청은 하나의 구축에 합류.
  private async loadGraph(): Promise<SubwayGraph> {
    const nowMs = (this.deps.now?.() ?? new Date()).getTime();
    if (this.graphCache && nowMs - this.graphCache.builtAt < SUBWAY_GRAPH_TTL_MS) {
      return this.graphCache.graph;
    }
    if (this.graphInflight) return this.graphInflight;
    const build = (async (): Promise<SubwayGraph> => {
      const { prisma } = this.deps;
      const [stations, lineStations] = await Promise.all([
        prisma.subwayStation.findMany({
          select: { id: true, name: true, lineId: true, lineName: true, lat: true, lng: true },
        }),
        prisma.subwayLineStation.findMany({
          select: { lineId: true, branchKey: true, seq: true, stationId: true },
        }),
      ]);
      const graph = buildSubwayGraph(stations, lineStations);
      this.graphCache = { graph, builtAt: nowMs };
      return graph;
    })();
    this.graphInflight = build;
    try {
      return await build;
    } finally {
      this.graphInflight = undefined;
    }
  }

  private collectTimetable(
    cacheKey: string,
    stationCd: string,
    dayType: string,
    now: Date,
  ): Promise<TimetableBlob> {
    const existing = this.timetableInflight.get(cacheKey);
    if (existing) return existing;
    const task = this.doCollectTimetable(cacheKey, stationCd, dayType, now).finally(() => {
      this.timetableInflight.delete(cacheKey);
    });
    this.timetableInflight.set(cacheKey, task);
    return task;
  }

  private async doCollectTimetable(
    cacheKey: string,
    stationCd: string,
    dayType: string,
    now: Date,
  ): Promise<TimetableBlob> {
    if (!this.deps.seoulKey) {
      throw new SubwayServiceError(
        'SEOUL_OPEN_API_KEY 가 설정되지 않아 시간표 조회를 사용할 수 없습니다.',
        503,
      );
    }
    // openapi 그룹으로 방향 2콜분 선소비(중간 소진 방지) — 실시간('realtime')과 별도.
    this.consumeQuota('openapi', now);
    this.consumeQuota('openapi', now);

    const fetch = this.deps.adapter?.getStationTimetable ?? getStationTimetable;
    const opts = { apiKey: this.deps.seoulKey };
    const [up, down] = await Promise.all([
      fetch(stationCd, dayType, '1', opts),
      fetch(stationCd, dayType, '2', opts),
    ]);

    // 방향별 정규화 — 빈 방향은 계약상 제외(0행 방향 미노출). 양쪽 0 이면 coverage
    // false 로 저장(1~9호선인데 데이터 없음 — 무의미 재호출 방지).
    const directions = [normalizeDirection('1', up), normalizeDirection('2', down)].filter(
      (d) => d.trains.length > 0,
    );
    const blob: TimetableBlob = { coverage: directions.length > 0, directions };

    await this.deps.prisma.subwayTimetableCache.upsert({
      where: { cacheKey },
      create: { cacheKey, payload: JSON.stringify(blob), fetchedAt: now },
      update: { payload: JSON.stringify(blob), fetchedAt: now },
    });
    return blob;
  }

  // 실시간 키 1개의 raw 배열 — 캐시 히트 시 캐시 fetchedAt 보존, 미스는 in-flight
  // 합류(같은 키 동시 요청 업스트림 1콜). 도착/위치가 공유하는 골격.
  private fetchRealtime(
    key: string,
    now: Date,
    load: () => Promise<unknown[]>,
  ): Promise<{ data: unknown[]; fetchedAt: Date }> {
    const cached = this.microCache.get(key);
    if (cached) {
      if (now.getTime() <= cached.expiresAt) {
        return Promise.resolve({ data: cached.data, fetchedAt: cached.fetchedAt });
      }
      this.microCache.delete(key); // 만료 청소.
    }

    const existing = this.inflight.get(key);
    if (existing) return existing;

    const task = this.loadRealtime(key, now, load).finally(() => {
      this.inflight.delete(key);
    });
    this.inflight.set(key, task);
    return task;
  }

  private async loadRealtime(
    key: string,
    now: Date,
    load: () => Promise<unknown[]>,
  ): Promise<{ data: unknown[]; fetchedAt: Date }> {
    // 쿼터는 실제 업스트림 콜 직전(캐시 미스 확정)에만 소비.
    this.consumeQuota('realtime', now);
    const data = await load();
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
