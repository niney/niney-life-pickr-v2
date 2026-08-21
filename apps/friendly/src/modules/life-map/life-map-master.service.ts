// 일상지도 마스터 적재 — 지방행정인허가데이터개방(localdata.go.kr) 전국 CCTV / 공중화장실
// CSV 를 정규화해 LifeCctv / LifeToilet 에 전량 교체 적재한다(bus-master.service 와 같은
// "정규화는 순수 함수 + 사유별 drop 리포트, 쓰기는 별도 함수" 골격).
//
// 실측(2026-08-21): CCTV 377,278행(좌표 100%, 한국 밖 35행), 화장실 53,559행(좌표 열 없음 —
// 지오코딩은 life-map-geocode.service). 둘 다 CP949, 따옴표 안 쉼표·줄바꿈 있음(RFC4180 파서).

import type { PrismaClient } from '@prisma/client';
import {
  lifeToiletOpen24,
  normalizeLifeCctvPurpose,
  normalizeLifeToiletKind,
  normalizeLifeToiletOpenType,
} from '@repo/utils';
import { csvColumnIndex } from '../../lib/csv.js';

// WGS84 한국 범위 — 계약(lat 33~39, lng 124~132)과 동일. 밖이면 좌표 이상 drop.
const LAT_MIN = 33;
const LAT_MAX = 39;
const LNG_MIN = 124;
const LNG_MAX = 132;

// 한 트랜잭션 안의 createMany 청크 — SQLite 바인드 변수 상한(32,766) 아래. 화장실은 열이 35개라
// 500행이면 ~17,500개.
const CREATE_CHUNK = 500;
const REPLACE_TX_TIMEOUT_MS = 15 * 60_000;

// CSV 바이트 → 문자열. BOM 이 있으면 UTF-8, 아니면 CP949(EUC-KR) — 헤더에 '관리번호'가 보여야
// 제대로 풀린 것. 둘 다 아니면 UTF-8 로 마지막 시도(호출자가 헤더 검증에서 잡는다).
export const decodeLifeCsv = (buf: Uint8Array): string => {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(buf);
  }
  const eucKr = new TextDecoder('euc-kr').decode(buf);
  if (eucKr.slice(0, 2000).includes('관리번호')) return eucKr;
  return new TextDecoder('utf-8').decode(buf);
};

const strOrNull = (v: string | undefined): string | null => {
  const s = (v ?? '').trim();
  return s.length > 0 ? s : null;
};
const intOrNull = (v: string | undefined): number | null => {
  const s = (v ?? '').trim().replace(/,/g, '');
  if (!/^-?\d+(\.0+)?$/.test(s)) return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
};
const intOrZero = (v: string | undefined): number => Math.max(0, intOrNull(v) ?? 0);
const floatOrNull = (v: string | undefined): number | null => {
  const s = (v ?? '').trim();
  if (s.length === 0) return null;
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : null;
};
// 'YYYYMM' 정규화 — 'YYYY-MM'·'YYYY.MM'·'YYYYMMDD' 도 앞 6자리로. 월 범위 밖이면 null.
const ymOrNull = (v: string | undefined): string | null => {
  const digits = (v ?? '').replace(/\D/g, '');
  const m = /^(\d{4})(\d{2})/.exec(digits);
  if (!m) return null;
  const mm = Number(m[2]);
  return mm >= 1 && mm <= 12 ? `${m[1]}${m[2]}` : null;
};
// 'YYYY-MM-DD' 정규화 — 'YYYYMMDD'·'YYYY.MM.DD' 허용, 시각이 붙어 있으면 날짜만.
const dateOrNull = (v: string | undefined): string | null => {
  const m = /^(\d{4})[-./]?(\d{2})[-./]?(\d{2})/.exec((v ?? '').trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
};
const ynOrNull = (v: string | undefined): boolean | null => {
  const s = (v ?? '').trim().toUpperCase();
  if (s === 'Y' || s === 'YES' || s === '있음' || s === '유') return true;
  if (s === 'N' || s === 'NO' || s === '없음' || s === '무') return false;
  return null;
};
const inKorea = (lat: number, lng: number): boolean =>
  lat >= LAT_MIN && lat <= LAT_MAX && lng >= LNG_MIN && lng <= LNG_MAX;

const requireColumns = (header: string[], names: readonly string[]): Map<string, number> => {
  const idx = csvColumnIndex(header);
  const missing = names.filter((n) => !idx.has(n));
  if (missing.length > 0) {
    throw new Error(`CSV 헤더에 필요한 열이 없습니다: ${missing.join(', ')} (헤더: ${header.slice(0, 8).join(', ')}…)`);
  }
  return idx;
};

// ── CCTV ────────────────────────────────────────────────────────────────────
export const LIFE_CCTV_REQUIRED_COLUMNS = [
  '관리번호',
  '개방자치단체코드',
  '관리기관명',
  '설치목적구분',
  'WGS84위도',
  'WGS84경도',
  '데이터기준일자',
] as const;

export interface LifeCctvRow {
  id: string;
  orgCode: string;
  orgName: string;
  roadAddr: string | null;
  lotAddr: string | null;
  purpose: string;
  cameraCount: number | null;
  pixels: number | null;
  direction: string | null;
  keepDays: number | null;
  installedYm: string | null;
  phone: string | null;
  lat: number;
  lng: number;
  baseDate: string;
}

export interface LifeCctvReport {
  rows: LifeCctvRow[];
  byPurpose: Map<string, number>;
  droppedWidth: number; // 열 수가 헤더와 다른 행
  droppedBadId: number;
  droppedBadCoord: { id: string; lat: number | null; lng: number | null }[];
  duplicates: number;
  maxBaseDate: string | null;
}

// 정규화 — drop 사유별 리포트(스크립트가 출력). 하드 fail 은 헤더 불일치뿐.
export const normalizeLifeCctvRows = (header: string[], rows: string[][]): LifeCctvReport => {
  const idx = requireColumns(header, LIFE_CCTV_REQUIRED_COLUMNS);
  const col = (row: string[], name: string): string | undefined => {
    const i = idx.get(name);
    return i === undefined ? undefined : row[i];
  };
  const report: LifeCctvReport = {
    rows: [],
    byPurpose: new Map(),
    droppedWidth: 0,
    droppedBadId: 0,
    droppedBadCoord: [],
    duplicates: 0,
    maxBaseDate: null,
  };
  const seen = new Set<string>();
  for (const row of rows) {
    if (row.length !== header.length) {
      report.droppedWidth += 1;
      continue;
    }
    const id = strOrNull(col(row, '관리번호'));
    const orgCode = strOrNull(col(row, '개방자치단체코드'));
    if (!id || !orgCode) {
      report.droppedBadId += 1;
      continue;
    }
    const lat = floatOrNull(col(row, 'WGS84위도'));
    const lng = floatOrNull(col(row, 'WGS84경도'));
    if (lat === null || lng === null || !inKorea(lat, lng)) {
      report.droppedBadCoord.push({ id, lat, lng });
      continue;
    }
    if (seen.has(id)) {
      report.duplicates += 1;
      continue;
    }
    seen.add(id);
    const purpose = normalizeLifeCctvPurpose(col(row, '설치목적구분'));
    const baseDate = dateOrNull(col(row, '데이터기준일자')) ?? '';
    if (baseDate && (report.maxBaseDate === null || baseDate > report.maxBaseDate)) report.maxBaseDate = baseDate;
    report.rows.push({
      id,
      orgCode,
      orgName: strOrNull(col(row, '관리기관명')) ?? '',
      roadAddr: strOrNull(col(row, '소재지도로명주소')),
      lotAddr: strOrNull(col(row, '소재지지번주소')),
      purpose,
      cameraCount: intOrNull(col(row, '카메라대수')),
      pixels: intOrNull(col(row, '카메라화소수')),
      direction: strOrNull(col(row, '촬영방면정보')),
      keepDays: intOrNull(col(row, '보관일수')),
      installedYm: ymOrNull(col(row, '설치연월')),
      phone: strOrNull(col(row, '관리기관전화번호')),
      lat,
      lng,
      baseDate,
    });
    report.byPurpose.set(purpose, (report.byPurpose.get(purpose) ?? 0) + 1);
  }
  return report;
};

export interface LifeReplaceMeta {
  sourceFile: string | null;
  baseDate: string | null;
}

// 전량 교체 — 한 인터랙티브 트랜잭션 안에서 비우고 청크로 넣고 적재 이력까지 기록한다(중간
// 상태 노출 없음). SQLite 단일 쓰기라 다른 요청은 busy_timeout 안에서 대기.
export const replaceLifeCctv = async (
  prisma: PrismaClient,
  rows: LifeCctvRow[],
  meta: LifeReplaceMeta,
): Promise<number> => {
  await prisma.$transaction(
    async (tx) => {
      await tx.lifeCctv.deleteMany({});
      for (let i = 0; i < rows.length; i += CREATE_CHUNK) {
        await tx.lifeCctv.createMany({ data: rows.slice(i, i + CREATE_CHUNK) });
      }
      await tx.lifeMasterSync.create({
        data: { layer: 'cctv', count: rows.length, geocoded: null, baseDate: meta.baseDate, sourceFile: meta.sourceFile },
      });
    },
    { timeout: REPLACE_TX_TIMEOUT_MS, maxWait: 60_000 },
  );
  return rows.length;
};

// ── 공중화장실 ────────────────────────────────────────────────────────────────
export const LIFE_TOILET_REQUIRED_COLUMNS = [
  '관리번호',
  '개방자치단체코드',
  '화장실명',
  '구분명',
  '관리기관명',
  '데이터기준일자',
] as const;

export interface LifeToiletRow {
  id: string;
  orgCode: string;
  name: string;
  kind: string;
  roadAddr: string | null;
  lotAddr: string | null;
  orgName: string;
  phone: string | null;
  openType: string;
  openDetail: string | null;
  open24: boolean;
  maleToilet: number;
  maleUrinal: number;
  maleDisabledToilet: number;
  maleDisabledUrinal: number;
  maleKidsToilet: number;
  maleKidsUrinal: number;
  femaleToilet: number;
  femaleDisabledToilet: number;
  femaleKidsToilet: number;
  disabled: boolean;
  kids: boolean;
  ownerType: string;
  disposal: string | null;
  safetyTarget: boolean | null;
  bell: boolean;
  bellPlace: string | null;
  entranceCctv: boolean;
  diaper: boolean;
  diaperPlace: string | null;
  installedYm: string | null;
  remodeledYm: string | null;
  baseDate: string;
  // 지오코딩 결과 — 정규화 단계에서는 항상 null.
  lat: number | null;
  lng: number | null;
  geoSource: 'road' | 'parcel' | null;
}

export interface LifeToiletReport {
  rows: LifeToiletRow[];
  byKind: Map<string, number>;
  droppedWidth: number;
  droppedBadId: number;
  duplicates: number;
  // 도로명·지번 둘 다 없는 행(지오코딩 불가 — 적재는 하되 지도에 안 나온다).
  noAddress: number;
  maxBaseDate: string | null;
}

export const normalizeLifeToiletRows = (header: string[], rows: string[][]): LifeToiletReport => {
  const idx = requireColumns(header, LIFE_TOILET_REQUIRED_COLUMNS);
  const col = (row: string[], name: string): string | undefined => {
    const i = idx.get(name);
    return i === undefined ? undefined : row[i];
  };
  const report: LifeToiletReport = {
    rows: [],
    byKind: new Map(),
    droppedWidth: 0,
    droppedBadId: 0,
    duplicates: 0,
    noAddress: 0,
    maxBaseDate: null,
  };
  const seen = new Set<string>();
  for (const row of rows) {
    if (row.length !== header.length) {
      report.droppedWidth += 1;
      continue;
    }
    const id = strOrNull(col(row, '관리번호'));
    const orgCode = strOrNull(col(row, '개방자치단체코드'));
    if (!id || !orgCode) {
      report.droppedBadId += 1;
      continue;
    }
    if (seen.has(id)) {
      report.duplicates += 1;
      continue;
    }
    seen.add(id);
    const roadAddr = strOrNull(col(row, '소재지도로명주소'));
    const lotAddr = strOrNull(col(row, '소재지지번주소'));
    if (!roadAddr && !lotAddr) report.noAddress += 1;
    const kind = normalizeLifeToiletKind(col(row, '구분명'));
    const openType = normalizeLifeToiletOpenType(col(row, '개방시간'));
    const openDetail = strOrNull(col(row, '개방시간상세'));
    const maleToilet = intOrZero(col(row, '남성용-대변기수'));
    const maleUrinal = intOrZero(col(row, '남성용-소변기수'));
    const maleDisabledToilet = intOrZero(col(row, '남성용-장애인용대변기수'));
    const maleDisabledUrinal = intOrZero(col(row, '남성용-장애인용소변기수'));
    const maleKidsToilet = intOrZero(col(row, '남성용-어린이용대변기수'));
    const maleKidsUrinal = intOrZero(col(row, '남성용-어린이용소변기수'));
    const femaleToilet = intOrZero(col(row, '여성용-대변기수'));
    const femaleDisabledToilet = intOrZero(col(row, '여성용-장애인용대변기수'));
    const femaleKidsToilet = intOrZero(col(row, '여성용-어린이용대변기수'));
    const baseDate = dateOrNull(col(row, '데이터기준일자')) ?? '';
    if (baseDate && (report.maxBaseDate === null || baseDate > report.maxBaseDate)) report.maxBaseDate = baseDate;
    report.rows.push({
      id,
      orgCode,
      name: strOrNull(col(row, '화장실명')) ?? '(이름 없음)',
      kind,
      roadAddr,
      lotAddr,
      orgName: strOrNull(col(row, '관리기관명')) ?? '',
      phone: strOrNull(col(row, '전화번호')),
      openType,
      openDetail,
      open24: lifeToiletOpen24(openType, openDetail),
      maleToilet,
      maleUrinal,
      maleDisabledToilet,
      maleDisabledUrinal,
      maleKidsToilet,
      maleKidsUrinal,
      femaleToilet,
      femaleDisabledToilet,
      femaleKidsToilet,
      disabled: maleDisabledToilet + maleDisabledUrinal + femaleDisabledToilet > 0,
      kids: maleKidsToilet + maleKidsUrinal + femaleKidsToilet > 0,
      ownerType: strOrNull(col(row, '화장실소유구분명')) ?? '미상',
      disposal: strOrNull(col(row, '오물처리방식')),
      safetyTarget: ynOrNull(col(row, '안전관리시설설치대상여부')),
      bell: ynOrNull(col(row, '비상벨설치여부')) ?? false,
      bellPlace: strOrNull(col(row, '비상벨설치장소')),
      entranceCctv: ynOrNull(col(row, '화장실입구CCTV설치유무')) ?? false,
      diaper: ynOrNull(col(row, '기저귀교환대유무')) ?? false,
      diaperPlace: strOrNull(col(row, '기저귀교환대장소')),
      installedYm: ymOrNull(col(row, '설치연월')),
      remodeledYm: ymOrNull(col(row, '리모델링연월')),
      baseDate,
      lat: null,
      lng: null,
      geoSource: null,
    });
    report.byKind.set(kind, (report.byKind.get(kind) ?? 0) + 1);
  }
  return report;
};

export const replaceLifeToilets = async (
  prisma: PrismaClient,
  rows: LifeToiletRow[],
  meta: LifeReplaceMeta,
): Promise<{ count: number; geocoded: number }> => {
  const geocoded = rows.filter((r) => r.lat !== null && r.lng !== null).length;
  await prisma.$transaction(
    async (tx) => {
      await tx.lifeToilet.deleteMany({});
      for (let i = 0; i < rows.length; i += CREATE_CHUNK) {
        await tx.lifeToilet.createMany({ data: rows.slice(i, i + CREATE_CHUNK) });
      }
      await tx.lifeMasterSync.create({
        data: { layer: 'toilet', count: rows.length, geocoded, baseDate: meta.baseDate, sourceFile: meta.sourceFile },
      });
    },
    { timeout: REPLACE_TX_TIMEOUT_MS, maxWait: 60_000 },
  );
  return { count: rows.length, geocoded };
};
