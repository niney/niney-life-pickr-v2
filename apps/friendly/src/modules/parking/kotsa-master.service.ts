// 한국교통안전공단 주차정보(15099883) → ParkingLotRow. 시설(PrkSttusInfo)·운영(PrkOprInfo) 행을 시군구(옛 행정코드 —
// kotsa-sigungu) 단위로 받아 공영 주차장만 정규화한다. 로더가 좌표 없는 행(입구 좌표 결측 ≈16%)을 주소로 지오코딩하고, 서울·
// 표준데이터와 겹치는 곳을 빼고 새 곳만 더한다.
// docs/PLAN-parking.md §KOTSA
//
// 범위(2026-10-05): 공영 + 요금 구분(무료/유료)이 있는 행. 시설 176만 행의 대부분인 민영 부설(빌라·주택 1~5면, 이름·요금·
// 운영시간 없음)은 넣지 않는다. 실시간(PrkRealtimeInfo)은 쓰지 않는다 — 시설과 이어지는 행은 값이 멈춰 있고, 값이 바뀌는
// 행은 시설에 없는 ID 라 위치를 모른다.
//
// 실측 함정(2026-10-05):
//   - 가이드 필드명 prk_chrge_se ≠ 실제 응답 parkng_chrge_se — 둘 다 읽는다.
//   - 같은 관리 ID 가 여러 행(좌표·구획수가 다른 행이 섞임) — 좌표 있는 첫 행 하나. 한 ID 가 수백 행인 쓰레기 ID(…-99999-…)는 버린다.
//   - 관리주체 '공영'인데 업체·아파트·개인 주택(광주 '○○동 단독주택 (사람 이름)' 등)인 행이 섞인다 — 이런 행은 요금 구분이
//     비어 있어(공영 13,645행 중 2,981행, 광주 1,949), 요금 구분이 있는 공영만 받는다.
//   - 추가 요금 0원(예: '30분 900원 + 10분 0원', 공영 운영정보 13,074행 중 11,200행)은 정보 없음 — 0 으로 두면 예상 요금이
//     기본 요금에서 멈춘다.
//   - 운영시간은 평일 요일끼리·일요일과 휴일이 항상 같았다(실측 0건 차이) — 다르면 월요일 기준 + 참고 문구.
//   - 기본요금에 정수 최댓값(2,147,483,647)·월정액을 잘못 넣은 행이 있다 — 1만 원(30분) 넘으면 정보 없음. 거주자 우선 주차 구획
//     ('(주거지)'·'업무지 N구간'·'거주자우선주차장')은 뺀다.
//   - 대표 좌표: 이름이 다른 주차장 여럿이 한 좌표에 몰린 곳이 있다(구미 35곳·대구 북구 11곳이 한 점, 3곳 이상 몰린 좌표 63곳·
//     283행) — markKotsaPlaceholderCoords 가 좌표를 지워 주소로 다시 찾게 하고, 주소도 뭉뚱그려져(부산 범일동 거주자 구획 등)
//     지오코딩이 다시 한 점에 모이면 뺀다. 같은 주차장이 관리 ID 만 달리 여러 번 실린 행(이름 같고 300m 안 — 실측 1천여 행)은
//     dedupeKotsaRows 가 하나로.

import { haversineM, normalizeParkingHhmm, normalizeParkingName, parseParkingLotType, type ParkingFeeType } from '@repo/utils';
import { coerceStrOrNull, isObject, numOrNull } from '../../lib/narrow.js';
import { KOTSA_PAGE_SIZE, fetchKotsaPage, type FetchLike, type KotsaOp, type ParkingPage } from './parking-api.adapter.js';
import type { ParkingLotRow } from './parking-master.service.js';

const LAT_MIN = 33;
const LAT_MAX = 39;
const LNG_MIN = 124;
const LNG_MAX = 132;
// 한 시군구 안에서 이보다 많이 반복되는 관리 ID 는 쓰레기 값으로 본다.
const JUNK_ID_REPEAT = 10;
// 거주자 우선 주차 구획 — 월정액만 받는 등록 거주자용이라 방문자가 쓸 수 없다(서울 원천의 '거주자 우선 전용' 제외와 같은 취지).
// 실측: 부산 동구 '수5-5(주거지)'·'초량3동-업무지7구간'(월 4만~6만 원, 시간 요금 없음), '○○거주자우선주차장'. '업무지구'(북구 동편
// 업무지구 공영)는 실제 공영이라 남긴다.
const RESIDENT_ONLY_NAME = /주거지|업무지(?!구)|거주자/;
// 기본요금(실측 기본 시간은 모두 30분) 상한 — 넘으면 입력 오류로 보고 정보 없음(정수 최댓값 2,147,483,647 이 80행, 월정액을 잘못 넣은
// 4만 원 등).
const MAX_BASE_FEE = 10_000;

const text = (v: unknown): string | null => {
  const s = coerceStrOrNull(v)?.replace(/\s+/g, ' ').trim() ?? '';
  return s.length > 0 ? s : null;
};
const int = (v: unknown): number | null => {
  const s = coerceStrOrNull(v)?.replace(/,/g, '').trim() ?? '';
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
};
const positive = (n: number | null): number | null => (n !== null && n > 0 ? n : null);
const inKorea = (lat: number | null, lng: number | null): boolean =>
  lat !== null && lng !== null && lat >= LAT_MIN && lat <= LAT_MAX && lng >= LNG_MIN && lng <= LNG_MAX;

const idOf = (r: Record<string, unknown>): string | null => text(r['prk_center_id']);
const isPublicRow = (r: Record<string, unknown>): boolean => text(r['prk_manage_agent']) === '1';

// 'HHMMSS' → 'HH:MM'(2400 허용).
const hhmmss = (v: unknown): string | null => {
  const s = text(v);
  return s && /^\d{4,6}$/.test(s) ? normalizeParkingHhmm(s.slice(0, 4)) : null;
};
type Hours = { open: string | null; close: string | null };
const dayHours = (raw: unknown): Hours => {
  const d = isObject(raw) ? raw : {};
  return { open: hhmmss(d['opertn_start_time']), close: hhmmss(d['opertn_end_time']) };
};
const sameHours = (a: Hours, b: Hours): boolean => a.open === b.open && a.close === b.close;
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const;

// 도로명(…로·…길 + 번호)이면 도로명 칸, 아니면 지번 칸 — 원천은 '도로명, 없으면 지번' 한 칸이다.
const splitAddr = (addr: string | null): { roadAddr: string | null; lotAddr: string | null } =>
  addr && /(로|길)\s*\d/.test(addr) ? { roadAddr: addr, lotAddr: null } : { roadAddr: null, lotAddr: addr };

const feeTypeOf = (r: Record<string, unknown>): ParkingFeeType | null => {
  const s = text(r['parkng_chrge_se']) ?? text(r['prk_chrge_se']);
  return s === '1' ? 'free' : s === '2' ? 'paid' : null;
};

type OperationFields = Pick<
  ParkingLotRow,
  'wdOpen' | 'wdClose' | 'satOpen' | 'satClose' | 'holOpen' | 'holClose' | 'baseMin' | 'baseFee' | 'addMin' | 'addFee' | 'dayPassFee' | 'monthlyFee' | 'note'
>;

// 운영정보 한 행 → 운영시간·요금 칸. 무료 주차장은 요금 칸을 비운다(계산은 feeType 으로). 일·공휴일 칸은 일요일(없으면 휴일).
export const kotsaOperationFields = (opr: Record<string, unknown> | undefined, feeType: ParkingFeeType | null): OperationFields => {
  if (!opr) {
    return {
      wdOpen: null,
      wdClose: null,
      satOpen: null,
      satClose: null,
      holOpen: null,
      holClose: null,
      baseMin: null,
      baseFee: null,
      addMin: null,
      addFee: null,
      dayPassFee: null,
      monthlyFee: null,
      note: null,
    };
  }
  const days = WEEKDAYS.map((d) => dayHours(opr[d]));
  const wd = days[0]!;
  const sat = dayHours(opr['Saturday']);
  const sun = dayHours(opr['Sunday']);
  const hol = sun.open !== null || sun.close !== null ? sun : dayHours(opr['Holiday']);
  const notes: string[] = [];
  if (!days.every((d) => sameHours(d, wd))) notes.push('평일 요일마다 운영시간이 다름(월요일 기준 표시)');
  const freeMin = positive(int(opr['opertn_bs_free_time']));
  if (freeMin !== null) notes.push(`기본 회차 ${freeMin}분 무료`);
  const basic = isObject(opr['basic_info']) ? opr['basic_info'] : {};
  const fixed = isObject(opr['fxamt_info']) ? opr['fxamt_info'] : {};
  const paid = feeType !== 'free';
  const baseMin = paid ? positive(int(basic['parking_chrge_bs_time'])) : null;
  const baseFee = paid ? positive(int(basic['parking_chrge_bs_chrge'])) : null;
  const hasBase = baseMin !== null && baseFee !== null && baseFee <= MAX_BASE_FEE;
  const addMin = hasBase ? positive(int(basic['parking_chrge_adit_unit_time'])) : null;
  // 추가 요금 0 은 정보 없음(실측 — 기본 요금만 채우고 추가는 0 으로 두는 행이 대부분이다).
  const addFee = addMin !== null ? positive(int(basic['parking_chrge_adit_unit_chrge'])) : null;
  return {
    wdOpen: wd.open,
    wdClose: wd.close,
    satOpen: sat.open,
    satClose: sat.close,
    holOpen: hol.open,
    holClose: hol.close,
    baseMin: hasBase ? baseMin : null,
    baseFee: hasBase ? baseFee : null,
    addMin: addFee !== null ? addMin : null,
    addFee,
    dayPassFee: paid ? positive(int(fixed['parking_chrge_one_day_chrge'])) : null,
    monthlyFee: positive(int(fixed['parking_chrge_mon_unit_chrge'])),
    note: notes.length > 0 ? notes.join(' · ') : null,
  };
};

// ── 수집 ────────────────────────────────────────────────────────────────────
// 시설 목록은 관리 ID 순이라 공영(ID 둘째 구간 111xx·112xx)이 앞쪽에 몰린다(실측 — 전국 공영 13,645행이 모두 시군구 첫 페이지
// 안). 첫 페이지 끝 KOTSA_PUBLIC_TAIL 행에도 공영이 있으면 다음 페이지까지 받는다.
const KOTSA_PUBLIC_TAIL = 1000;
// 운영정보는 시설과 같은 순서 — 공영이 끝나는 위치 + 여유만 받는다(시군구당 수 MB 를 아낀다). 빠진 공영이 있으면 첫 페이지 전체.
const KOTSA_OPR_MARGIN = 50;

export interface KotsaSigunguInput {
  sigunguCd: string;
  facility: Record<string, unknown>[];
  operation: Record<string, unknown>[];
}

export interface KotsaCollected extends KotsaSigunguInput {
  // 원천이 밝힌 시설 수 — 목록이 비었는데 0 보다 크면 원천 결함(행정코드 바뀐 지역).
  facilityTotal: number;
  calls: number;
}

export const collectKotsaSigungu = async (
  serviceKey: string,
  sigunguCd: string,
  deps: { space: <T>(fn: () => Promise<T>) => Promise<T>; fetchImpl?: FetchLike },
): Promise<KotsaCollected> => {
  let calls = 0;
  const call = (op: KotsaOp, q: { pageNo?: number; numOfRows?: number }): Promise<ParkingPage> => {
    calls += 1;
    return deps.space(() => fetchKotsaPage(serviceKey, op, { sigunguCd, ...q }, { fetchImpl: deps.fetchImpl }));
  };
  const first = await call('facility', { pageNo: 1 });
  const total = first.totalCount;
  const facility = [...first.items];
  let last = first.items;
  for (let page = 2; last.length >= KOTSA_PAGE_SIZE && facility.length < total && last.slice(-KOTSA_PUBLIC_TAIL).some(isPublicRow); page += 1) {
    last = (await call('facility', { pageNo: page })).items;
    facility.push(...last);
  }
  let lastPublic = -1;
  facility.forEach((r, i) => {
    if (isPublicRow(r)) lastPublic = i;
  });
  let operation: Record<string, unknown>[] = [];
  if (lastPublic >= 0) {
    const n = Math.min(KOTSA_PAGE_SIZE, lastPublic + 1 + KOTSA_OPR_MARGIN);
    operation = (await call('operation', { numOfRows: n })).items;
    const got = new Set(operation.map(idOf));
    const lacking = facility.slice(0, lastPublic + 1).some((r) => isPublicRow(r) && !got.has(idOf(r)));
    if (lacking && n < KOTSA_PAGE_SIZE) operation = (await call('operation', { numOfRows: KOTSA_PAGE_SIZE })).items;
  }
  return { sigunguCd, facility, operation, facilityTotal: total, calls };
};

// 저장본(--kotsa-dump)에 남길 행만 — 공영 시설 행과 그 운영정보.
export const slimKotsaCollected = (c: KotsaCollected): KotsaCollected => {
  const facility = c.facility.filter(isPublicRow);
  const ids = new Set(facility.map(idOf));
  return { ...c, facility, operation: c.operation.filter((o) => ids.has(idOf(o))) };
};

// ── 정규화 ──────────────────────────────────────────────────────────────────
export interface KotsaReport {
  rows: ParkingLotRow[];
  facilityRows: number;
  publicRows: number;
  withOperation: number;
  droppedJunkId: number;
  droppedDupId: number;
  droppedNoName: number;
  // 거주자 우선 주차 구획(이름으로 — RESIDENT_ONLY_NAME).
  droppedResidentOnly: number;
  // 좌표도 주소도 없음.
  droppedNoLocation: number;
  // 좌표가 없어 주소로 찾아야 하는 행(rows 에 lat/lng null 로 들어 있다 — 로더가 지오코딩, 못 찾으면 뺀다).
  needGeocode: number;
  // 공영인데 요금 구분이 비어 있음 — 업체·아파트·개인 주택이 섞여 있어 받지 않는다.
  droppedNoFeeType: number;
  // 관리 ID → rows 위치. 같은 ID 가 다시 나오면(시군구를 넘어서도) 한 행만 — 먼저 남긴 행에 좌표가 없고 새 행엔 있으면 바꾼다.
  seenIds: Map<string, number>;
}

export const emptyKotsaReport = (): KotsaReport => ({
  rows: [],
  facilityRows: 0,
  publicRows: 0,
  withOperation: 0,
  droppedJunkId: 0,
  droppedDupId: 0,
  droppedNoName: 0,
  droppedResidentOnly: 0,
  droppedNoLocation: 0,
  needGeocode: 0,
  droppedNoFeeType: 0,
  seenIds: new Map(),
});

// 시군구 하나 정규화 — report 에 누적한다(여러 시군구를 한 리포트로).
export const normalizeKotsaSigungu = (input: KotsaSigunguInput, loadDate: string, report: KotsaReport = emptyKotsaReport()): KotsaReport => {
  const oprById = new Map<string, Record<string, unknown>>();
  for (const o of input.operation) {
    const id = idOf(o);
    if (id && !oprById.has(id)) oprById.set(id, o);
  }
  const publicRows = input.facility.filter(isPublicRow);
  const repeat = new Map<string, number>();
  for (const r of publicRows) {
    const id = idOf(r);
    if (id) repeat.set(id, (repeat.get(id) ?? 0) + 1);
  }
  report.facilityRows += input.facility.length;
  report.publicRows += publicRows.length;
  for (const r of publicRows) {
    const id = idOf(r);
    const name = text(r['prk_plce_nm']);
    if (!id || !name) {
      report.droppedNoName += 1;
      continue;
    }
    if ((repeat.get(id) ?? 0) >= JUNK_ID_REPEAT) {
      report.droppedJunkId += 1;
      continue;
    }
    if (RESIDENT_ONLY_NAME.test(name)) {
      report.droppedResidentOnly += 1;
      continue;
    }
    const feeType = feeTypeOf(r);
    if (feeType === null) {
      report.droppedNoFeeType += 1;
      continue;
    }
    const addr = text(r['prk_plce_adres']);
    const lat = numOrNull(r['prk_plce_entrc_la']);
    const lng = numOrNull(r['prk_plce_entrc_lo']);
    const hasCoord = inKorea(lat, lng);
    if (!hasCoord && !addr) {
      report.droppedNoLocation += 1;
      continue;
    }
    const prevIdx = report.seenIds.get(id);
    if (prevIdx !== undefined) {
      report.droppedDupId += 1;
      if (!hasCoord || report.rows[prevIdx]!.lat !== null) continue;
      report.needGeocode -= 1;
    }
    const opr = oprById.get(id);
    if (opr && prevIdx === undefined) report.withOperation += 1;
    if (!hasCoord) report.needGeocode += 1;
    const row: ParkingLotRow = {
      id: `kotsa:${id}`,
      source: 'kotsa',
      name,
      ownership: 'public',
      lotType: parseParkingLotType(name),
      feeType,
      ...splitAddr(addr),
      phone: null,
      orgName: null,
      totalSpaces: positive(int(r['prk_cmprt_co'])),
      operDays: null,
      dayMaxFee: null,
      satFree: null,
      holFree: null,
      payMethods: null,
      disabledZone: null,
      ...kotsaOperationFields(opr, feeType),
      liveKey: null,
      lat: hasCoord ? lat : null,
      lng: hasCoord ? lng : null,
      geoSource: hasCoord ? 'source' : null,
      baseDate: loadDate,
    };
    if (prevIdx !== undefined) {
      report.rows[prevIdx] = row;
    } else {
      report.seenIds.set(id, report.rows.length);
      report.rows.push(row);
    }
  }
  return report;
};

// ── 좌표 정리(로더가 지오코딩 앞뒤로 부른다) ───────────────────────────────────
// 이름이 다른 KOTSA 행이 이만큼 한 좌표(소수 6자리)에 몰리면 원천 좌표를 대표값으로 본다. 둘은 실제로 붙은 구획(압구정고가1·2
// 같은)이 많아 건드리지 않는다.
const PLACEHOLDER_MIN_ROWS = 3;
// KOTSA 끼리 같은 주차장 — 정규화 이름이 같고(두 글자 이상) 이 거리 안. 원천 입구 좌표와 주소로 찾은 좌표(필지 중심)가
// 100~300m 벌어지는 같은 주차장이 많아(실측 47쌍) 기존 원천과의 겹침(KOTSA_SAME_NAME_RADIUS_M)과 같은 300m.
const SELF_DUP_RADIUS_M = 300;
// 칸 한 변이 판정 거리 이상(경도 1° ≥ 85km).
const SELF_DUP_CELL_DEG = SELF_DUP_RADIUS_M / 85_000;

// 한 좌표에 몰린 행의 좌표를 지운다(lat/lng/geoSource null). 지운 행 수. 지오코딩 전(원천 좌표만 — 로더가 주소로 다시 찾고,
// 못 찾으면 뺀다)과 지오코딩 뒤(includeGeocoded — 주소도 뭉뚱그려져 한 점에 모인 행, 로더가 뺀다)에 부른다.
export const markKotsaPlaceholderCoords = (rows: ParkingLotRow[], opts: { includeGeocoded?: boolean } = {}): number => {
  const bySpot = new Map<string, ParkingLotRow[]>();
  for (const r of rows) {
    if (r.lat === null || r.lng === null || (!opts.includeGeocoded && r.geoSource !== 'source')) continue;
    const k = `${r.lat.toFixed(6)},${r.lng.toFixed(6)}`;
    const list = bySpot.get(k);
    if (list) list.push(r);
    else bySpot.set(k, [r]);
  }
  let cleared = 0;
  for (const list of bySpot.values()) {
    if (list.length < PLACEHOLDER_MIN_ROWS || new Set(list.map((r) => normalizeParkingName(r.name))).size < 2) continue;
    for (const r of list) {
      r.lat = null;
      r.lng = null;
      r.geoSource = null;
      cleared += 1;
    }
  }
  return cleared;
};

// KOTSA 끼리 같은 주차장(관리 ID 만 다른 중복 행)을 하나로 — 원천 좌표 행을 주소로 찾은 행보다 먼저, 같은 쪽끼리는 앞에 나온
// 행을 남긴다. 좌표 없는 행은 그대로 남긴다.
export const dedupeKotsaRows = (rows: ParkingLotRow[]): { kept: ParkingLotRow[]; dropped: number } => {
  const grid = new Map<string, { row: ParkingLotRow; name: string }[]>();
  const kept: ParkingLotRow[] = [];
  let dropped = 0;
  const ordered = [...rows.filter((r) => r.geoSource === 'source'), ...rows.filter((r) => r.geoSource !== 'source')];
  for (const r of ordered) {
    if (r.lat === null || r.lng === null) {
      kept.push(r);
      continue;
    }
    const here = { lat: r.lat, lng: r.lng };
    const name = normalizeParkingName(r.name);
    const cy = Math.floor(r.lat / SELF_DUP_CELL_DEG);
    const cx = Math.floor(r.lng / SELF_DUP_CELL_DEG);
    let dup = false;
    for (let dy = -1; dy <= 1 && !dup; dy += 1) {
      for (let dx = -1; dx <= 1 && !dup; dx += 1) {
        for (const a of grid.get(`${cy + dy}:${cx + dx}`) ?? []) {
          if (name.length >= 2 && a.name === name && haversineM(here, { lat: a.row.lat!, lng: a.row.lng! }) <= SELF_DUP_RADIUS_M) {
            dup = true;
            break;
          }
        }
      }
    }
    if (dup) {
      dropped += 1;
      continue;
    }
    const k = `${cy}:${cx}`;
    const list = grid.get(k);
    if (list) list.push({ row: r, name });
    else grid.set(k, [{ row: r, name }]);
    kept.push(r);
  }
  return { kept, dropped };
};
