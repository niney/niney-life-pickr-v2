// 버스 정류소 마스터(busStopLocationXyInfo) 수집 + 정규화 + 적재.
//
// 열린데이터광장 openapi(SEOUL_OPEN_API_KEY — 지하철 마스터와 같은 키/포털)로
// 전 정류소(실측 2026-07-13: 11,248행)를 받아 BusStation 에 upsert 한다.
// ws.bus.go.kr 과의 ID 체계 일치는 실측 검증 완료: STOPS_NO=stId(9자리),
// NODE_ID=arsId(5자리), YCRD/XCRD=WGS84 위/경도 — 목동 3개 정류소의
// stId/arsId/좌표가 ws 응답과 자릿수까지 동일했다.
//
// 이 마스터가 있으면 주변 정류장 조회가 로컬 바운딩박스 쿼리로 동작해
// (지하철과 동일 설계) 서울시 실시간 API 장애·쿼터와 무관해진다.

import type { PrismaClient } from '@prisma/client';
import { isObject, coerceStrOrNull } from '../../lib/narrow.js';

export const BUS_MASTER_SOURCE = 'busStopLocationXyInfo';

const SEOUL_OPEN_BASE = 'http://openapi.seoul.go.kr:8088';
const PAGE_SIZE = 1000;
const FETCH_TIMEOUT_MS = 20_000;

// WGS84 한국 범위 — 계약(lat 33~39, lng 124~132)과 동일. 밖이면 좌표 이상 drop.
const LAT_MIN = 33;
const LAT_MAX = 39;
const LNG_MIN = 124;
const LNG_MAX = 132;

// 버스 정류소가 아닌 행 — 실측 STOPS_TYPE 분포(일반차로 6252/마을버스 4186/
// 중앙차로 405/가로변시간 256/가로변전일 141/한강선착장 8) 중 한강선착장만 제외.
// NODE_ID 도 가짜(00001~)라 도착정보 조회가 불가능한 행들이다.
const EXCLUDED_STOP_TYPES = new Set(['한강선착장']);

export interface RawBusStopMasterRow {
  stId: string | null; // STOPS_NO — 9자리 정류소 ID (ws stId 와 동일)
  arsId: string | null; // NODE_ID — 5자리 (ws arsId 와 동일)
  name: string | null; // STOPS_NM
  lat: number | null; // YCRD
  lng: number | null; // XCRD
  stopType: string | null; // STOPS_TYPE
}

const numFromStr = (v: unknown): number | null => {
  const s = coerceStrOrNull(v);
  if (s === null) return null;
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : null;
};

const toRawRow = (raw: Record<string, unknown>): RawBusStopMasterRow => ({
  stId: coerceStrOrNull(raw['STOPS_NO']),
  arsId: coerceStrOrNull(raw['NODE_ID']),
  name: coerceStrOrNull(raw['STOPS_NM']),
  lat: numFromStr(raw['YCRD']),
  lng: numFromStr(raw['XCRD']),
  stopType: coerceStrOrNull(raw['STOPS_TYPE']),
});

// openapi 응답: 성공 { <service>:{ list_total_count, RESULT:{CODE}, row:[...] } },
// 실패 톱레벨 { RESULT:{CODE,MESSAGE} }. INFO-000 외는 전부 에러로 던진다
// (마스터 적재는 스크립트 전용이라 빈 결과도 비정상).
export const fetchBusStopMaster = async (apiKey: string): Promise<RawBusStopMasterRow[]> => {
  const rows: RawBusStopMasterRow[] = [];
  for (let start = 1; ; start += PAGE_SIZE) {
    const tail = `${BUS_MASTER_SOURCE}/${start}/${start + PAGE_SIZE - 1}`;
    const requestUrl = `${SEOUL_OPEN_BASE}/***/json/${tail}`;
    const ac = new AbortController();
    const timeoutId = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
    let json: unknown;
    try {
      const res = await fetch(`${SEOUL_OPEN_BASE}/${apiKey}/json/${tail}`, {
        signal: ac.signal,
      });
      json = JSON.parse(await res.text());
    } catch (e) {
      // 메시지에 키 평문 URL 금지 — 마스킹본만.
      throw new Error(
        `마스터 수집 실패 (${requestUrl}): ${e instanceof Error ? e.message : String(e)}`,
        { cause: e },
      );
    } finally {
      clearTimeout(timeoutId);
    }

    const box = isObject(json) && isObject(json[BUS_MASTER_SOURCE]) ? json[BUS_MASTER_SOURCE] : json;
    const result = isObject(box) && isObject(box['RESULT']) ? box['RESULT'] : null;
    const code = result ? coerceStrOrNull(result['CODE']) : null;
    if (code !== 'INFO-000') {
      const message = result ? coerceStrOrNull(result['MESSAGE']) : null;
      throw new Error(`마스터 응답 오류 (${requestUrl}): ${code ?? '?'}: ${message ?? '알 수 없음'}`);
    }
    const page = isObject(box) && Array.isArray(box['row']) ? box['row'].filter(isObject) : [];
    rows.push(...page.map(toRawRow));

    const total = isObject(box) ? Number(box['list_total_count']) : NaN;
    if (!Number.isFinite(total) || rows.length >= total || page.length === 0) break;
  }
  return rows;
};

export interface BusStationRow {
  stId: string;
  arsId: string;
  name: string;
  lat: number;
  lng: number;
}

export interface BusMasterReport {
  rows: BusStationRow[];
  byType: Map<string, number>; // 채택 행의 STOPS_TYPE 분포
  droppedExcludedType: number; // 한강선착장 등 비버스 행
  droppedBadId: { stId: string | null; arsId: string | null; name: string | null }[];
  droppedBadCoord: { stId: string; name: string; lat: number | null; lng: number | null }[];
  droppedNoName: number;
  duplicates: number; // stId 중복 접힘
}

// 정규화 — drop 사유별 리포트를 남긴다(스크립트가 출력). 하드 fail 없음.
export const normalizeBusMasterRows = (raw: RawBusStopMasterRow[]): BusMasterReport => {
  const report: BusMasterReport = {
    rows: [],
    byType: new Map(),
    droppedExcludedType: 0,
    droppedBadId: [],
    droppedBadCoord: [],
    droppedNoName: 0,
    duplicates: 0,
  };
  const seen = new Set<string>();

  for (const r of raw) {
    if (r.stopType !== null && EXCLUDED_STOP_TYPES.has(r.stopType)) {
      report.droppedExcludedType += 1;
      continue;
    }
    // stId 9자리·arsId 5자리 — 실측 전행 만족(위반 0). 깨진 행만 걸러낸다.
    if (!r.stId || !/^\d+$/.test(r.stId) || !r.arsId || !/^\d{5}$/.test(r.arsId)) {
      report.droppedBadId.push({ stId: r.stId, arsId: r.arsId, name: r.name });
      continue;
    }
    const name = r.name?.trim() ?? '';
    if (name.length === 0) {
      report.droppedNoName += 1;
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
      report.droppedBadCoord.push({ stId: r.stId, name, lat: r.lat, lng: r.lng });
      continue;
    }
    if (seen.has(r.stId)) {
      report.duplicates += 1;
      continue;
    }
    seen.add(r.stId);
    report.rows.push({ stId: r.stId, arsId: r.arsId, name, lat: r.lat, lng: r.lng });
    const type = r.stopType ?? '(없음)';
    report.byType.set(type, (report.byType.get(type) ?? 0) + 1);
  }
  return report;
};

// 청크 트랜잭션 upsert + 적재 이력 기록. 반환은 upsert 행수.
export const upsertBusStations = async (
  prisma: PrismaClient,
  rows: BusStationRow[],
): Promise<number> => {
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    await prisma.$transaction(
      chunk.map((s) =>
        prisma.busStation.upsert({
          where: { stId: s.stId },
          create: s,
          update: { arsId: s.arsId, name: s.name, lat: s.lat, lng: s.lng },
        }),
      ),
    );
  }
  await prisma.busMasterSync.create({
    data: { source: BUS_MASTER_SOURCE, count: rows.length },
  });
  return rows.length;
};
