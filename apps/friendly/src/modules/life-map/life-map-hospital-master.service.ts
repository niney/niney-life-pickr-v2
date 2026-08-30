// 일상지도 병의원 마스터 적재 — 심평원 병원정보서비스(hira-hospital.adapter)를 전량 페이징해
// LifeHospital 에 전량 교체 적재한다(life-map-master.service 의 CCTV/화장실과 같은 "정규화는
// 순수 함수 + 사유별 drop 리포트, 쓰기는 별도 함수" 골격 — 원천이 CSV 가 아니라 API 인 점만
// 다르다).
//
// 좌표는 업스트림(XPos/YPos, WGS84)이 원칙 — 없거나 한국 범위 밖이면 null 로 적재하고
// 로더가 주소 지오코딩(life-map-geocode.service, addr → roadAddr 후보)으로 보완한다.

import type { PrismaClient } from '@prisma/client';
import { normalizeLifeHospitalCategory } from '@repo/utils';
import { coerceStrOrNull, numOrNull, intOrNull } from '../../lib/narrow.js';
import { fetchHiraHospPage, type HiraApiCallOptions } from './hira-hospital.adapter.js';
import type { LifeReplaceMeta } from './life-map-master.service.js';

// WGS84 한국 범위 — 계약(lat 33~39, lng 124~132)과 동일. 밖이면 좌표 없음으로 적재.
const LAT_MIN = 33;
const LAT_MAX = 39;
const LNG_MIN = 124;
const LNG_MAX = 132;

const CREATE_CHUNK = 500;
const REPLACE_TX_TIMEOUT_MS = 15 * 60_000;

// 페이지 크기 — 프로브 실측 1000 허용(78k 행 ≈ 79콜, 일 10,000건 한도에 여유).
export const HIRA_PAGE_SIZE = 1000;
// 페이징 안전 상한 — totalCount 이상(≈80페이지)이면 무한 루프 방지용으로 끊는다.
const MAX_PAGES = 200;

export interface LifeHospitalRow {
  id: string;
  name: string;
  kindName: string;
  category: string;
  sidoName: string | null;
  sgguName: string | null;
  emdongName: string | null;
  postNo: string | null;
  addr: string | null;
  phone: string | null;
  url: string | null;
  openedDate: string | null;
  doctorCount: number | null;
  lat: number | null;
  lng: number | null;
  geoSource: 'api' | 'road' | 'parcel' | null;
}

export interface LifeHospitalReport {
  rows: LifeHospitalRow[];
  byCategory: Map<string, number>;
  // ykiho(암호화 요양기호) 또는 기관명이 없는 행.
  droppedBadId: number;
  duplicates: number;
  // 좌표 결측·한국 범위 밖 — drop 이 아니라 lat/lng null 적재(지오코딩 보완 대상).
  coordMissing: number;
}

// 'YYYY-MM-DD' 정규화 — estbDd 가 20101103(숫자)·'2010-11-03' 어느 쪽이든.
const dateOrNull = (v: unknown): string | null => {
  const s = coerceStrOrNull(v);
  if (!s) return null;
  const m = /^(\d{4})[-./]?(\d{2})[-./]?(\d{2})/.exec(s.trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
};

// 홈페이지 — 스킴 없는 'www.…' 가 흔해 http:// 를 붙인다. 'http'/'-' 같은 쓰레기 값은 버린다.
const urlOrNull = (v: unknown): string | null => {
  const s = coerceStrOrNull(v)?.trim() ?? null;
  if (!s || s.length < 4 || !s.includes('.')) return null;
  return /^https?:\/\//i.test(s) ? s : `http://${s}`;
};

const inKorea = (lat: number, lng: number): boolean =>
  lat >= LAT_MIN && lat <= LAT_MAX && lng >= LNG_MIN && lng <= LNG_MAX;

// 정규화 — drop 사유별 리포트(스크립트가 출력). API 원천이라 하드 fail 없음.
export const normalizeLifeHospitalRows = (rawItems: Record<string, unknown>[]): LifeHospitalReport => {
  const report: LifeHospitalReport = {
    rows: [],
    byCategory: new Map(),
    droppedBadId: 0,
    duplicates: 0,
    coordMissing: 0,
  };
  const seen = new Set<string>();
  for (const raw of rawItems) {
    const id = coerceStrOrNull(raw['ykiho']);
    const name = coerceStrOrNull(raw['yadmNm'])?.trim() ?? null;
    if (!id || !name) {
      report.droppedBadId += 1;
      continue;
    }
    if (seen.has(id)) {
      report.duplicates += 1;
      continue;
    }
    seen.add(id);
    const kindName = coerceStrOrNull(raw['clCdNm'])?.trim() ?? '미상';
    const category = normalizeLifeHospitalCategory(kindName);
    const lng = numOrNull(raw['XPos']);
    const lat = numOrNull(raw['YPos']);
    const hasCoord = lat !== null && lng !== null && inKorea(lat, lng);
    if (!hasCoord) report.coordMissing += 1;
    report.rows.push({
      id,
      name,
      kindName,
      category,
      sidoName: coerceStrOrNull(raw['sidoCdNm']),
      sgguName: coerceStrOrNull(raw['sgguCdNm']),
      emdongName: coerceStrOrNull(raw['emdongNm']),
      postNo: coerceStrOrNull(raw['postNo'])?.trim() || null,
      addr: coerceStrOrNull(raw['addr'])?.trim() || null,
      phone: coerceStrOrNull(raw['telno'])?.trim() || null,
      url: urlOrNull(raw['hospUrl']),
      openedDate: dateOrNull(raw['estbDd']),
      doctorCount: intOrNull(raw['drTotCnt']),
      lat: hasCoord ? lat : null,
      lng: hasCoord ? lng : null,
      geoSource: hasCoord ? 'api' : null,
    });
    report.byCategory.set(category, (report.byCategory.get(category) ?? 0) + 1);
  }
  return report;
};

export interface FetchAllHiraOptions extends HiraApiCallOptions {
  pageSize?: number;
  // 이번 실행의 페이지 상한(드라이런·프로브용). 기본 전량.
  maxPages?: number;
  onPage?(p: { pageNo: number; fetched: number; totalCount: number }): void;
}

// 전량 페이징 — totalCount 까지 순차 조회(동시 호출 없음 — 일 한도 관리보다 게이트웨이 예의).
export const fetchAllHiraHospitals = async (
  opts: FetchAllHiraOptions,
): Promise<{ items: Record<string, unknown>[]; totalCount: number; pages: number }> => {
  const pageSize = opts.pageSize ?? HIRA_PAGE_SIZE;
  const items: Record<string, unknown>[] = [];
  let totalCount = 0;
  let page = 1;
  for (; page <= (opts.maxPages ?? MAX_PAGES); page += 1) {
    const res = await fetchHiraHospPage({ pageNo: page, numOfRows: pageSize }, opts);
    totalCount = res.totalCount;
    items.push(...res.items);
    opts.onPage?.({ pageNo: page, fetched: items.length, totalCount });
    if (res.items.length === 0 || items.length >= totalCount) break;
  }
  return { items, totalCount, pages: page };
};

// 전량 교체 — 한 인터랙티브 트랜잭션 안에서 비우고 청크로 넣고 적재 이력까지 기록(중간 상태
// 노출 없음). geocoded = 좌표를 확보한 건수(상태 API 가 좌표율로 표시).
export const replaceLifeHospitals = async (
  prisma: PrismaClient,
  rows: LifeHospitalRow[],
  meta: LifeReplaceMeta,
): Promise<{ count: number; geocoded: number }> => {
  const geocoded = rows.filter((r) => r.lat !== null && r.lng !== null).length;
  await prisma.$transaction(
    async (tx) => {
      await tx.lifeHospital.deleteMany({});
      for (let i = 0; i < rows.length; i += CREATE_CHUNK) {
        await tx.lifeHospital.createMany({ data: rows.slice(i, i + CREATE_CHUNK) });
      }
      await tx.lifeMasterSync.create({
        data: {
          layer: 'hospital',
          count: rows.length,
          geocoded,
          baseDate: meta.baseDate,
          sourceFile: meta.sourceFile,
        },
      });
    },
    { timeout: REPLACE_TX_TIMEOUT_MS, maxWait: 60_000 },
  );
  return { count: rows.length, geocoded };
};
