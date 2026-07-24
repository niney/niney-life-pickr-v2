// 역사마스터(subwayStationMaster) 정규화 + 적재 + 역명 그룹핑.
//
// 마스터 ROUTE 는 39종의 철도노선 표기(경부선/과천선/분당선 등)로 오지만,
// 실시간 API·FE 는 subwayId(4자리) 체계를 lineId 로 쓴다. 여기서 ROUTE→lineId
// 로 접고, lineName 은 @repo/utils SUBWAY_LINES 의 표준 표기로 다시 접는다
// (예: ROUTE '공항철도1호선' → lineId '1065' → lineName '공항철도').

import type { PrismaClient } from '@prisma/client';
import type { SubwayStationGroupItemType } from '@repo/api-contract';
import { approxDistanceM, subwayLineName } from '@repo/utils';
import type { RawSubwayMasterRow } from './subway-api.adapter.js';

// ROUTE(마스터 39종) → lineId(실시간 subwayId 체계). 프로브 실측(2026-07-06)의
// ROUTE 유니크 39종을 브리프 매핑표 그대로 옮겼다. 여러 철도노선이 한 lineId 로
// 접힌다(경부선/경인선/경원선/장항선 → 1001 등).
const ROUTE_TO_LINE_ID: Record<string, string> = {
  '1호선': '1001',
  경부선: '1001',
  경인선: '1001',
  경원선: '1001',
  장항선: '1001',
  '2호선': '1002',
  '3호선': '1003',
  일산선: '1003',
  '4호선': '1004',
  과천선: '1004',
  안산선: '1004',
  진접선: '1004',
  '5호선': '1005',
  '6호선': '1006',
  '7호선': '1007',
  '7호선(인천)': '1007',
  '8호선': '1008',
  별내선: '1008',
  '9호선': '1009',
  '9호선(연장)': '1009',
  '수도권 광역급행철도': '1032',
  경의중앙선: '1063',
  중앙선: '1063',
  공항철도1호선: '1065',
  경춘선: '1067',
  분당선: '1075',
  수인선: '1075',
  신분당선: '1077',
  '신분당선(연장)': '1077',
  '신분당선(연장2)': '1077',
  경강선: '1081',
  우이신설선: '1092',
  서해선: '1093',
  신림선: '1094',
};

// 서울시 실시간 API 미제공 노선 — 1차 범위 밖이라 적재 제외(drop + 리포트).
// 매핑에 없는 미래 ROUTE 는 unknown 으로 drop(하드 fail 금지).
const DROPPED_ROUTES = new Set<string>([
  '김포골드라인',
  '에버라인선',
  '의정부선',
  '인천1호선',
  '인천2호선',
]);

// 실시간 조회 역명이 마스터 BLDN_NM 과 다른 알려진 예외. 프로브 실증(2026-07-06):
// 마스터 '서울역'(1호선/경의중앙/경부 등)↔실시간 도착 역명 '서울'. GTX-A(1032)만
// '서울역' 그대로라 lineId 1032 는 오버라이드 제외. 값이 null 이면 오버라이드 없음.
const knownRealtimeNameOverride = (name: string, lineId: string): string | null => {
  if (name === '서울역' && lineId !== '1032') return '서울';
  return null;
};

// 업스트림 좌표가 실제 역사와 크게 어긋난 알려진 예외 — OSM railway=station
// 노드와 대조 실측(2026-07-24). 인천공항2터미널은 T2 청사 건물 좌표(역과 1.1km),
// 청산은 원인 불명 1.6km 이탈이 온다. 노선 실형상 anchor·주변 검색 정확도에
// 직접 영향이라 마스터 적재 시점에 보정한다.
const KNOWN_COORD_OVERRIDES: Record<string, { lat: number; lng: number }> = {
  '1065:인천공항2터미널': { lat: 37.468942, lng: 126.433475 },
  '1001:청산': { lat: 37.995154, lng: 127.074343 },
};

// WGS84 한국 범위 — 계약(lat 33~39, lng 124~132)과 동일. 밖이면 좌표 이상으로 drop.
const LAT_MIN = 33;
const LAT_MAX = 39;
const LNG_MIN = 124;
const LNG_MAX = 132;


// 동명이역 분리 임계 — 같은 역명이라도 이 거리 넘게 떨어지면 별개 그룹(환승 아님).
export const STATION_CLUSTER_RADIUS_M = 1000;

// 적재 대상 정규화 행 — SubwayStation 컬럼과 1:1(추후 backfill 컬럼 statnId/frCode
// 는 여기서 채우지 않는다).
export interface NormalizedStation {
  id: string; // `${lineId}:${name}`
  name: string;
  realtimeName: string | null;
  lineId: string;
  lineName: string;
  stationCd: string | null; // BLDN_ID
  lat: number;
  lng: number;
}

// 정규화 리포트 — 적재 대상 + drop 사유별 목록(스크립트가 콘솔 출력).
export interface MasterNormalizeReport {
  rows: NormalizedStation[];
  // lineId → 채택 건수 (호선별 카운트).
  byLine: Map<string, number>;
  // 서울 실시간 미제공 노선으로 제외.
  droppedExcluded: { name: string; route: string }[];
  // 매핑에 없는 미지 ROUTE.
  droppedUnknown: { name: string; route: string | null }[];
  // 좌표 누락/WGS84 범위 밖.
  droppedBadCoord: { name: string; lineId: string; lat: number | null; lng: number | null }[];
  // 역명 누락.
  droppedNoName: number;
  // 정규화 후 id 중복(같은 lineId+name)으로 접힌 건수 — 보통 0.
  duplicates: number;
}

export const normalizeMasterRows = (raw: RawSubwayMasterRow[]): MasterNormalizeReport => {
  const rows: NormalizedStation[] = [];
  const byLine = new Map<string, number>();
  const droppedExcluded: { name: string; route: string }[] = [];
  const droppedUnknown: { name: string; route: string | null }[] = [];
  const droppedBadCoord: {
    name: string;
    lineId: string;
    lat: number | null;
    lng: number | null;
  }[] = [];
  let droppedNoName = 0;
  let duplicates = 0;
  const seen = new Set<string>();

  for (const r of raw) {
    const name = r.name?.trim().normalize('NFC') ?? '';
    if (!name) {
      droppedNoName += 1;
      continue;
    }
    const route = r.route;
    if (route && DROPPED_ROUTES.has(route)) {
      droppedExcluded.push({ name, route });
      continue;
    }
    const lineId = route ? ROUTE_TO_LINE_ID[route] : undefined;
    if (!lineId) {
      droppedUnknown.push({ name, route });
      continue;
    }
    if (
      r.lat === null ||
      r.lng === null ||
      r.lat < LAT_MIN ||
      r.lat > LAT_MAX ||
      r.lng < LNG_MIN ||
      r.lng > LNG_MAX
    ) {
      droppedBadCoord.push({ name, lineId, lat: r.lat, lng: r.lng });
      continue;
    }
    const id = `${lineId}:${name}`;
    if (seen.has(id)) {
      // 같은 lineId+name 이 두 ROUTE 로 접혀 겹치면 첫 등장만 채택(upsert 멱등).
      duplicates += 1;
      continue;
    }
    seen.add(id);
    const coordFix = KNOWN_COORD_OVERRIDES[id];
    rows.push({
      id,
      name,
      realtimeName: knownRealtimeNameOverride(name, lineId),
      lineId,
      lineName: subwayLineName(lineId),
      stationCd: r.bldnId,
      lat: coordFix?.lat ?? r.lat,
      lng: coordFix?.lng ?? r.lng,
    });
    byLine.set(lineId, (byLine.get(lineId) ?? 0) + 1);
  }

  return {
    rows,
    byLine,
    droppedExcluded,
    droppedUnknown,
    droppedBadCoord,
    droppedNoName,
    duplicates,
  };
};

// 정규화 행을 id 기준 upsert + 적재 이력(SubwayMasterSync) 기록 — 한 트랜잭션.
// upsert 라 기존 행은 갱신, 신규는 생성. 이번 적재에서 사라진 옛 행 삭제는 스크립트
// 의 --prune 이 별도 담당(여기선 안 지운다).
export const upsertStations = async (
  prisma: PrismaClient,
  rows: NormalizedStation[],
): Promise<void> => {
  await prisma.$transaction(async (tx) => {
    for (const s of rows) {
      await tx.subwayStation.upsert({
        where: { id: s.id },
        create: {
          id: s.id,
          name: s.name,
          realtimeName: s.realtimeName,
          lineId: s.lineId,
          lineName: s.lineName,
          stationCd: s.stationCd,
          lat: s.lat,
          lng: s.lng,
        },
        update: {
          name: s.name,
          realtimeName: s.realtimeName,
          lineId: s.lineId,
          lineName: s.lineName,
          stationCd: s.stationCd,
          lat: s.lat,
          lng: s.lng,
        },
      });
    }
    await tx.subwayMasterSync.create({
      data: { source: 'subwayStationMaster', count: rows.length },
    });
  });
};

// 그룹핑 입력 — SubwayStation 행(또는 정규화 행)의 부분집합.
export interface StationForGrouping {
  id: string;
  name: string;
  lineId: string;
  lineName: string;
  lat: number;
  lng: number;
}

// 역명 → 환승 그룹. 같은 name 을 모아 좌표 근접(≤1km)으로 클러스터를 분리한다
// (동명이역 '양평' 5호선/경의중앙선은 좌표가 멀어 별개 그룹). 그룹 대표 좌표는
// 소속 호선 좌표의 산술 평균, lines 는 lineId 오름차순, 그룹 id 는 lines[0].stationId.
//
// 순수 함수(단위 테스트 대상) — DB/시간에 의존하지 않는다.
export const groupStations = (
  stations: StationForGrouping[],
): SubwayStationGroupItemType[] => {
  // 1) 역명 버킷.
  const byName = new Map<string, StationForGrouping[]>();
  for (const s of stations) {
    const bucket = byName.get(s.name);
    if (bucket) bucket.push(s);
    else byName.set(s.name, [s]);
  }

  const groups: SubwayStationGroupItemType[] = [];
  for (const bucket of byName.values()) {
    // 2) 좌표 근접 단일연결 클러스터링 — 버킷이 작아(환승 대개 ≤4) O(n²) 충분.
    const clusters: StationForGrouping[][] = [];
    for (const s of bucket) {
      const joined = clusters.find((c) =>
        c.some((m) => approxDistanceM(s, m) <= STATION_CLUSTER_RADIUS_M),
      );
      if (joined) joined.push(s);
      else clusters.push([s]);
    }

    // 3) 클러스터 → 그룹.
    for (const cluster of clusters) {
      const lines = [...cluster]
        .sort((a, b) => (a.lineId < b.lineId ? -1 : a.lineId > b.lineId ? 1 : 0))
        .map((m) => ({
          stationId: m.id,
          lineId: m.lineId,
          lineName: m.lineName,
          lat: m.lat,
          lng: m.lng,
        }));
      const lat = lines.reduce((sum, l) => sum + l.lat, 0) / lines.length;
      const lng = lines.reduce((sum, l) => sum + l.lng, 0) / lines.length;
      groups.push({
        id: lines[0]!.stationId,
        name: cluster[0]!.name,
        lat,
        lng,
        lines,
      });
    }
  }

  return groups;
};
