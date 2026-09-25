// 주차장 마스터 적재 — 원천별 정규화(순수 함수 + 사유별 리포트) → 서울 겹침 접기 → 전량 교체.
//   - 전국주차장정보표준데이터(15012896): API(camelCase)와 포털 JSON 덤프(UPPER_SNAKE)가 같은 항목을 이름만 달리 준다
//     → 키를 소문자·밑줄 제거로 맞춘 뒤 읽는다(canonKeys). 같은 관리번호가 두 기관명으로 중복(전남·광주 통합)이면 좌표
//     있고 기준일 최신인 행 하나.
//   - 서울 공영주차장 안내(GetParkInfo): 노상은 구획마다 행(좌표만 다름) → 주차장코드로 접고 좌표는 평균. 좌표는 시영만
//     있어 나머지는 지번 주소 지오코딩(로더). 버스전용·거주자 우선 전용은 뺀다. 시영 실시간(GetParkingInfo)에만 있는
//     코드는 그 행으로 보충.
//   - 표준데이터의 서울 행이 서울 원천과 100m 안 + 이름이 비슷하면(또는 25m 안) 서울 행만 남긴다(요금·실시간이 더 촘촘).

import type { PrismaClient } from '@prisma/client';
import {
  haversineM,
  normalizeParkingHhmm,
  normalizeParkingName,
  parseParkingFeeType,
  parseParkingLotType,
  parseParkingOwnership,
  type ParkingFeeType,
  type ParkingLotType,
  type ParkingOwnership,
} from '@repo/utils';
import { nameSimilarity } from '../../lib/matching.js';
import { coerceStrOrNull, numOrNull } from '../../lib/narrow.js';

const LAT_MIN = 33;
const LAT_MAX = 39;
const LNG_MIN = 124;
const LNG_MAX = 132;
const CREATE_CHUNK = 500;
const REPLACE_TX_TIMEOUT_MS = 10 * 60_000;
// 겹침 판정 — 이 거리 안이면 이름 유사도를 보고, DUP_NEAR_M 안이면 이름과 무관하게 같은 곳.
const DUP_RADIUS_M = 100;
const DUP_NEAR_M = 25;
const DUP_NAME_SCORE = 0.5;

export interface ParkingLotRow {
  id: string;
  source: 'std' | 'seoul' | 'kotsa';
  name: string;
  ownership: ParkingOwnership | null;
  lotType: ParkingLotType | null;
  feeType: ParkingFeeType | null;
  roadAddr: string | null;
  lotAddr: string | null;
  phone: string | null;
  orgName: string | null;
  totalSpaces: number | null;
  wdOpen: string | null;
  wdClose: string | null;
  satOpen: string | null;
  satClose: string | null;
  holOpen: string | null;
  holClose: string | null;
  operDays: string | null;
  baseMin: number | null;
  baseFee: number | null;
  addMin: number | null;
  addFee: number | null;
  dayMaxFee: number | null;
  dayPassFee: number | null;
  monthlyFee: number | null;
  satFree: boolean | null;
  holFree: boolean | null;
  payMethods: string | null;
  note: string | null;
  disabledZone: boolean | null;
  liveKey: string | null;
  lat: number | null;
  lng: number | null;
  geoSource: 'source' | 'road' | 'parcel' | null;
  baseDate: string | null;
}

const inKorea = (lat: number | null, lng: number | null): boolean =>
  lat !== null && lng !== null && lat >= LAT_MIN && lat <= LAT_MAX && lng >= LNG_MIN && lng <= LNG_MAX;

// 키 정규화 — 'PRKPLCE_NO' / 'prkplceNo' → 'prkplceno'.
export const canonKeys = (raw: Record<string, unknown>): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) out[k.replace(/_/g, '').toLowerCase()] = v;
  return out;
};

const text = (v: unknown): string | null => {
  const s = coerceStrOrNull(v)?.replace(/\s+/g, ' ').trim() ?? '';
  return s.length > 0 ? s : null;
};
// 정수(원·분·면) — 빈값·음수·숫자 아님은 null. '1,000' 같은 쉼표도 받는다.
const int = (v: unknown): number | null => {
  const s = coerceStrOrNull(v)?.replace(/,/g, '').trim() ?? '';
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
};
const positive = (n: number | null): number | null => (n !== null && n > 0 ? n : null);
const yn = (v: unknown): boolean | null => {
  const s = coerceStrOrNull(v)?.trim().toUpperCase() ?? '';
  return s === 'Y' ? true : s === 'N' ? false : null;
};
const dateOf = (v: unknown): string | null => {
  const s = coerceStrOrNull(v)?.trim() ?? '';
  const m = /^(\d{4})[-./]?(\d{2})[-./]?(\d{2})/.exec(s);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
};

// ── 전국주차장정보표준데이터 ─────────────────────────────────────────────────
export interface StdParkingReport {
  rows: ParkingLotRow[];
  droppedBadId: number;
  duplicates: number;
  coordMissing: number;
}

export const normalizeStdParkingRows = (rawItems: Record<string, unknown>[]): StdParkingReport => {
  const report: StdParkingReport = { rows: [], droppedBadId: 0, duplicates: 0, coordMissing: 0 };
  const byId = new Map<string, ParkingLotRow>();
  for (const raw of rawItems) {
    const r = canonKeys(raw);
    const no = text(r['prkplceno']);
    const name = text(r['prkplcenm']);
    if (!no || !name) {
      report.droppedBadId += 1;
      continue;
    }
    const lat = numOrNull(r['latitude']);
    const lng = numOrNull(r['longitude']);
    const hasCoord = inKorea(lat, lng);
    const feeType = parseParkingFeeType(text(r['parkingchrgeinfo']));
    const row: ParkingLotRow = {
      id: `std:${no}`,
      source: 'std',
      name,
      ownership: parseParkingOwnership(text(r['prkplcese'])),
      lotType: parseParkingLotType(text(r['prkplcetype'])),
      feeType,
      roadAddr: text(r['rdnmadr']),
      lotAddr: text(r['lnmadr']),
      phone: text(r['phonenumber']),
      orgName: text(r['institutionnm']) ?? text(r['insttnm']),
      totalSpaces: positive(int(r['prkcmprt'])),
      wdOpen: normalizeParkingHhmm(text(r['weekdayoperopenhhmm'])),
      wdClose: normalizeParkingHhmm(text(r['weekdayopercolsehhmm']) ?? text(r['weekdayoperclosehhmm'])),
      satOpen: normalizeParkingHhmm(text(r['satoperoperopenhhmm']) ?? text(r['satoperopenhhmm'])),
      satClose: normalizeParkingHhmm(text(r['satoperclosehhmm'])),
      holOpen: normalizeParkingHhmm(text(r['holidayoperopenhhmm'])),
      holClose: normalizeParkingHhmm(text(r['holidaycloseopenhhmm']) ?? text(r['holidayoperclosehhmm'])),
      operDays: text(r['operday']),
      // 무료 주차장은 요금 칸을 0 으로 채워 오므로 비운다(계산은 feeType 으로).
      baseMin: feeType === 'free' ? null : int(r['basictime']),
      baseFee: feeType === 'free' ? null : int(r['basiccharge']),
      addMin: feeType === 'free' ? null : positive(int(r['addunittime'])),
      addFee: feeType === 'free' ? null : int(r['addunitcharge']),
      dayMaxFee: null,
      dayPassFee: positive(int(r['daycmmtkt'])),
      monthlyFee: positive(int(r['monthcmmtkt'])),
      satFree: null,
      holFree: null,
      payMethods: text(r['metpay']),
      note: text(r['spcmnt']),
      disabledZone: yn(r['pwdbsppkzoneyn']),
      liveKey: null,
      lat: hasCoord ? lat : null,
      lng: hasCoord ? lng : null,
      geoSource: hasCoord ? 'source' : null,
      baseDate: dateOf(r['referencedate']),
    };
    // 유료인데 기본 요금이 0/없으면 정보 없음으로.
    if (row.feeType !== 'free' && (row.baseFee === 0 || row.baseFee === null) && (row.baseMin === 0 || row.baseMin === null)) {
      row.baseMin = null;
      row.baseFee = null;
    }
    const prev = byId.get(row.id);
    if (prev) {
      report.duplicates += 1;
      // 좌표 있는 쪽, 같으면 기준일 최신 쪽.
      const better =
        (row.lat !== null && prev.lat === null) ||
        ((row.lat !== null) === (prev.lat !== null) && (row.baseDate ?? '') > (prev.baseDate ?? ''));
      if (better) byId.set(row.id, row);
      continue;
    }
    byId.set(row.id, row);
  }
  report.rows = [...byId.values()];
  report.coordMissing = report.rows.filter((r) => r.lat === null).length;
  return report;
};

// ── 서울 공영주차장 ──────────────────────────────────────────────────────────
export interface SeoulParkingReport {
  rows: ParkingLotRow[];
  // 노상 구획 행을 코드로 접은 수.
  folded: number;
  droppedBusOnly: number;
  droppedResidentOnly: number;
  droppedBadId: number;
  // 실시간 목록에만 있던 코드로 보충한 수.
  liveOnlyAdded: number;
  coordMissing: number;
}

const SEOUL_PREFIX = '서울특별시';
const seoulAddr = (raw: string | null): string | null => {
  if (!raw) return null;
  return raw.startsWith('서울') ? raw : `${SEOUL_PREFIX} ${raw}`;
};
// 서울 openapi 는 좌표 결측을 0 으로 준다.
const seoulCoord = (lat: unknown, lng: unknown): { lat: number; lng: number } | null => {
  const a = numOrNull(lat);
  const b = numOrNull(lng);
  return inKorea(a, b) ? { lat: a!, lng: b! } : null;
};

// GetParkInfo(요금 필드 PRK_CRG·PRK_HM…) / GetParkingInfo(BSC_PRK_CRG·BSC_PRK_HR…) 둘 다 받는다.
const seoulRow = (r: Record<string, unknown>, loadDate: string): ParkingLotRow | null => {
  const code = text(r['PKLT_CD']);
  const name = text(r['PKLT_NM']);
  if (!code || !name) return null;
  const paidFlag = text(r['CHGD_FREE_NM']) ?? text(r['PAY_YN_NM']);
  const feeType: ParkingFeeType | null = paidFlag === '유료' ? 'paid' : paidFlag === '무료' ? 'free' : null;
  const baseFee = int(r['PRK_CRG'] ?? r['BSC_PRK_CRG']);
  const baseMin = int(r['PRK_HM'] ?? r['BSC_PRK_HR']);
  const addFee = int(r['ADD_CRG'] ?? r['ADD_PRK_CRG']);
  const addMin = int(r['ADD_UNIT_TM_MNT'] ?? r['ADD_PRK_HR']);
  const paidWithFee = feeType !== 'free' && baseMin !== null && baseMin > 0 && baseFee !== null && baseFee > 0;
  const satName = text(r['SAT_CHGD_FREE_NM']);
  const holName = text(r['LHLDY_NM']) ?? text(r['LHLDY_CHGD_FREE_SE_NAME']);
  return {
    id: `seoul:${code}`,
    source: 'seoul',
    name,
    ownership: 'public',
    lotType: parseParkingLotType(text(r['PKLT_KND_NM']) ?? text(r['PRK_TYPE_NM'])),
    feeType,
    roadAddr: null,
    lotAddr: seoulAddr(text(r['ADDR'])),
    phone: text(r['TELNO']),
    orgName: null,
    totalSpaces: positive(int(r['TPKCT'])),
    wdOpen: normalizeParkingHhmm(text(r['WD_OPER_BGNG_TM'])),
    wdClose: normalizeParkingHhmm(text(r['WD_OPER_END_TM'])),
    satOpen: normalizeParkingHhmm(text(r['WE_OPER_BGNG_TM'])),
    satClose: normalizeParkingHhmm(text(r['WE_OPER_END_TM'])),
    holOpen: normalizeParkingHhmm(text(r['LHLDY_BGNG']) ?? text(r['LHLDY_OPER_BGNG_TM'])),
    holClose: normalizeParkingHhmm(text(r['LHLDY']) ?? text(r['LHLDY_OPER_END_TM'])),
    operDays: null,
    baseMin: paidWithFee ? baseMin : null,
    baseFee: paidWithFee ? baseFee : null,
    addMin: paidWithFee ? positive(addMin) : null,
    addFee: paidWithFee && positive(addMin) !== null ? addFee : null,
    dayMaxFee: positive(int(r['DLY_MAX_CRG'] ?? r['DAY_MAX_CRG'])),
    dayPassFee: null,
    monthlyFee: positive(int(r['MNTL_CMUT_CRG'] ?? r['PRD_AMT'])),
    satFree: satName === '무료' ? true : satName === '유료' ? false : null,
    holFree: holName === '무료' ? true : holName === '유료' ? false : null,
    payMethods: null,
    note: text(r['OPER_SE_NM']),
    disabledZone: null,
    liveKey: `seoul:${code}`,
    lat: null,
    lng: null,
    geoSource: null,
    baseDate: loadDate,
  };
};

// 승용차가 못 쓰는 운영 구분 — 관광버스 전용·거주자 우선 전용(시간제가 섞이면 남긴다). 실시간 폴러도 같은 규칙.
export const seoulExcludedOper = (raw: unknown): 'bus' | 'resident' | null => {
  const oper = text(raw) ?? '';
  if (oper.includes('버스전용') && !oper.includes('시간제')) return 'bus';
  if (oper.startsWith('거주자') && !oper.includes('시간제')) return 'resident';
  return null;
};

export const normalizeSeoulParkingRows = (
  infoRows: Record<string, unknown>[],
  liveRows: Record<string, unknown>[],
  loadDate: string,
): SeoulParkingReport => {
  const report: SeoulParkingReport = {
    rows: [],
    folded: 0,
    droppedBusOnly: 0,
    droppedResidentOnly: 0,
    droppedBadId: 0,
    liveOnlyAdded: 0,
    coordMissing: 0,
  };
  const byCode = new Map<string, { row: ParkingLotRow; coords: { lat: number; lng: number }[] }>();
  const rowCount = new Map<string, number>();
  for (const r of infoRows) {
    const excluded = seoulExcludedOper(r['OPER_SE_NM']);
    if (excluded === 'bus') {
      report.droppedBusOnly += 1;
      continue;
    }
    if (excluded === 'resident') {
      report.droppedResidentOnly += 1;
      continue;
    }
    const row = seoulRow(r, loadDate);
    if (!row) {
      report.droppedBadId += 1;
      continue;
    }
    const c = seoulCoord(r['LAT'], r['LOT']);
    rowCount.set(row.id, (rowCount.get(row.id) ?? 0) + 1);
    const hit = byCode.get(row.id);
    if (hit) {
      report.folded += 1;
      if (c) hit.coords.push(c);
      continue;
    }
    byCode.set(row.id, { row, coords: c ? [c] : [] });
  }
  for (const r of liveRows) {
    if (seoulExcludedOper(r['OPER_SE_NM']) !== null) continue;
    const row = seoulRow(r, loadDate);
    if (!row || byCode.has(row.id)) continue;
    byCode.set(row.id, { row, coords: [] });
    report.liveOnlyAdded += 1;
  }
  for (const [id, { row, coords }] of byCode) {
    // 노상은 구획마다 행이고 행마다 면수 1 — 여러 행이면 행 수가 면수, 한 행뿐이면(1) 실제 면수를 모른다.
    if (row.lotType === 'street') {
      const n = rowCount.get(id) ?? 1;
      row.totalSpaces = n > 1 ? n : row.totalSpaces !== null && row.totalSpaces > 1 ? row.totalSpaces : null;
    }
    if (coords.length > 0) {
      row.lat = coords.reduce((s, c) => s + c.lat, 0) / coords.length;
      row.lng = coords.reduce((s, c) => s + c.lng, 0) / coords.length;
      row.geoSource = 'source';
    }
    report.rows.push(row);
  }
  report.coordMissing = report.rows.filter((r) => r.lat === null).length;
  return report;
};

// ── 겹침 접기 ────────────────────────────────────────────────────────────────
// primary(서울) 좌표 근처의 secondary(표준데이터) 행 중 같은 주차장으로 보이는 것을 뺀다. 좌표 없는 행은 비교 불가라 남긴다.
export const dropParkingDuplicates = (
  primary: ParkingLotRow[],
  secondary: ParkingLotRow[],
): { kept: ParkingLotRow[]; dropped: number } => {
  const anchors = primary.filter((p) => p.lat !== null && p.lng !== null);
  if (anchors.length === 0) return { kept: secondary, dropped: 0 };
  const lats = anchors.map((a) => a.lat!);
  const lngs = anchors.map((a) => a.lng!);
  const box = { minLat: Math.min(...lats) - 0.01, maxLat: Math.max(...lats) + 0.01, minLng: Math.min(...lngs) - 0.01, maxLng: Math.max(...lngs) + 0.01 };
  let dropped = 0;
  const kept = secondary.filter((s) => {
    if (s.lat === null || s.lng === null) return true;
    if (s.lat < box.minLat || s.lat > box.maxLat || s.lng < box.minLng || s.lng > box.maxLng) return true;
    const sName = normalizeParkingName(s.name);
    for (const a of anchors) {
      const d = haversineM({ lat: s.lat, lng: s.lng }, { lat: a.lat!, lng: a.lng! });
      if (d > DUP_RADIUS_M) continue;
      const aName = normalizeParkingName(a.name);
      if (d <= DUP_NEAR_M || sName === aName || nameSimilarity(sName, aName) >= DUP_NAME_SCORE) {
        dropped += 1;
        return false;
      }
    }
    return true;
  });
  return { kept, dropped };
};

export interface ParkingReplaceMeta {
  detail: Record<string, number>;
  baseDate: string | null;
}

// 전량 교체 — 한 트랜잭션 안에서 비우고 청크로 넣고 적재 이력까지(중간 상태 노출 없음).
export const replaceParkingLots = async (
  prisma: PrismaClient,
  rows: ParkingLotRow[],
  meta: ParkingReplaceMeta,
): Promise<{ count: number; geocoded: number }> => {
  const geocoded = rows.filter((r) => r.lat !== null && r.lng !== null).length;
  await prisma.$transaction(
    async (tx) => {
      await tx.parkingLot.deleteMany({});
      for (let i = 0; i < rows.length; i += CREATE_CHUNK) {
        await tx.parkingLot.createMany({ data: rows.slice(i, i + CREATE_CHUNK) });
      }
      await tx.parkingSync.create({
        data: { kind: 'lots', count: rows.length, geocoded, detail: JSON.stringify(meta.detail), baseDate: meta.baseDate },
      });
    },
    { timeout: REPLACE_TX_TIMEOUT_MS, maxWait: 60_000 },
  );
  return { count: rows.length, geocoded };
};
