// 행정안전부 산행안전지도(safetydata.go.kr — 국립공원공단 원자료) 어댑터, 9차. 적재 스크립트에서만 부른다.
// 데이터마다 키가 따로이고(다른 API 에 쓰면 resultCode 20 접근거부) 공인 IP 에 묶인다. 신청 이름과 내용이 엇갈린다:
//   - DSSP-IF-00143("국립공원 경계"로 신청, SAFETYDATA_COURSE_KEY) = 탐방로 코스 199 — 공원·코스명·구간·소요시간·거리·난이도·일정·선.
//   - DSSP-IF-00145("등산로라인"으로 신청, SAFETYDATA_PARK_KEY) = 국립공원 경계 22(WDPA, 이름은 영문뿐).
//   - DSSP-IF-00139(SAFETYDATA_FACILITY_KEY) = 국립공원 주요시설물 222(사무소·분소·탐방안내소·탐방지원센터·대피소).
// 요청 serviceKey·pageNo·numOfRows·returnType=json, 응답 { header: { resultCode '00' }, totalCount, body: [...] }. 좌표는 EPSG:3857
// WKT(GEOM). 공공누리 3유형(출처표시·변경금지) — 코스 이름·구간·소요시간·거리·난이도 문구는 고치지 않고 그대로 둔다.
// docs/PLAN-hiking.md §9차

import { fetchWithTimeout } from '../../lib/fetch-timeout.js';
import { coerceStrOrNull, isObject, numOrNull, strOrNull } from '../../lib/narrow.js';
import type { FetchLike } from './hiking-api.adapter.js';

const SAFETY_BASE = 'https://www.safetydata.go.kr/V2/api';
export const SAFETY_APIS = { course: 'DSSP-IF-00143', park: 'DSSP-IF-00145', facility: 'DSSP-IF-00139' } as const;
export type SafetyApi = keyof typeof SAFETY_APIS;
const PAGE_SIZE = 1_000;
const MAX_PAGES = 10;
// 코스 199건 한 쪽이 20MB 남짓(선 WKT) — 넉넉히.
const TIMEOUT_MS = 120_000;

export class SafetyDataError extends Error {
  readonly requestUrl: string;
  constructor(message: string, requestUrl: string) {
    super(message);
    this.name = 'SafetyDataError';
    this.requestUrl = requestUrl;
  }
}

// 전 건(쪽마다 1,000건). 키가 틀리거나 IP 가 등록되지 않으면 resultCode 20.
export const fetchSafetyRows = async (api: SafetyApi, serviceKey: string, fetchImpl?: FetchLike): Promise<Record<string, unknown>[]> => {
  const doFetch = fetchImpl ?? ((u: string, init?: RequestInit) => fetchWithTimeout(u, init ?? {}, TIMEOUT_MS));
  const out: Record<string, unknown>[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const qs = `pageNo=${page}&numOfRows=${PAGE_SIZE}&returnType=json`;
    const masked = `${SAFETY_BASE}/${SAFETY_APIS[api]}?serviceKey=***&${qs}`;
    const res = await doFetch(`${SAFETY_BASE}/${SAFETY_APIS[api]}?serviceKey=${encodeURIComponent(serviceKey)}&${qs}`);
    if (!res.ok) throw new SafetyDataError(`HTTP ${res.status}`, masked);
    let json: unknown;
    try {
      json = JSON.parse(await res.text());
    } catch {
      throw new SafetyDataError('JSON 아님', masked);
    }
    const header = isObject(json) && isObject(json.header) ? json.header : null;
    if (!isObject(json) || !header) throw new SafetyDataError('응답 형식 오류', masked);
    if (header.resultCode !== '00') throw new SafetyDataError(`산행안전지도 오류 ${String(header.resultCode)}: ${String(header.errorMsg ?? header.resultMsg ?? '')}`, masked);
    const body = Array.isArray(json.body) ? json.body.filter(isObject) : [];
    out.push(...body);
    const total = numOrNull(json.totalCount) ?? out.length;
    if (body.length < PAGE_SIZE || out.length >= total) break;
  }
  return out;
};

// ── 좌표 ──────────────────────────────────────────────────────────────────────

export interface LatLngPoint {
  lat: number;
  lng: number;
}
const R = 6_378_137;
export const webMercatorToLatLng = (x: number, y: number): LatLngPoint => ({
  lat: ((2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * 180) / Math.PI,
  lng: ((x / R) * 180) / Math.PI,
});
const ringOf = (body: string): LatLngPoint[] =>
  body
    .split(',')
    .map((pair) => pair.trim().split(/\s+/).map(Number))
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
    .map(([x, y]) => webMercatorToLatLng(x!, y!));

// LINESTRING / MULTILINESTRING → 선들.
export const parseWktLines = (wkt: string): LatLngPoint[][] =>
  [...wkt.matchAll(/\(([^()]+)\)/g)].map((m) => ringOf(m[1]!)).filter((l) => l.length >= 2);

// POLYGON / MULTIPOLYGON → 다각형마다 [바깥 고리, 구멍…].
export const parseWktPolygons = (wkt: string): LatLngPoint[][][] => {
  const t = wkt.trim();
  const inner = t.slice(t.indexOf('(') + 1, t.lastIndexOf(')'));
  // MULTIPOLYGON 은 "((..),(..)),((..))" — 다각형마다 바깥 괄호가 한 겹 더 있다.
  const polygonBodies = /^MULTIPOLYGON/i.test(t) ? [...inner.matchAll(/\((\s*\([^()]+\)(?:\s*,\s*\([^()]+\))*)\s*\)/g)].map((m) => m[1]!) : [inner];
  return polygonBodies.map((p) => [...p.matchAll(/\(([^()]+)\)/g)].map((m) => ringOf(m[1]!)).filter((r) => r.length >= 4)).filter((p) => p.length > 0);
};

// ── 탐방로 코스(DSSP-IF-00143) ─────────────────────────────────────────────────

export interface ParkCourseRow {
  // 원천 일련번호(SN — 전국에서 하나).
  sn: number;
  parkCode: string;
  parkName: string;
  // 공원 안 코스 순번(SITE_EXPRS_SEQ).
  seq: number;
  name: string;
  // "구룡탐방지원센터~구룡사~…~비로봉" 을 '~' 로 나눈 것.
  sections: string[];
  // 원문 그대로 — "03시간30분"·"5.7km"·"상|중|하"·"당일|1박2일"·"치악산국립공원사무소 (033)740-9900".
  duration: string;
  distance: string;
  difficulty: string;
  schedule: string;
  contact: string | null;
  lines: LatLngPoint[][];
}

export const normalizeParkCourse = (it: Record<string, unknown>): ParkCourseRow | null => {
  const sn = numOrNull(it.SN);
  const name = strOrNull(it.COES_NM);
  const parkName = strOrNull(it.PARK_NM);
  const geom = strOrNull(it.GEOM);
  if (sn === null || !name || !parkName || !geom) return null;
  const lines = parseWktLines(geom);
  if (lines.length === 0) return null;
  return {
    sn,
    parkCode: coerceStrOrNull(it.NTNL_PARK_CD) ?? '',
    parkName,
    seq: numOrNull(it.SITE_EXPRS_SEQ) ?? sn,
    name,
    sections: (strOrNull(it.COES_SCTN_NM) ?? '')
      .split('~')
      .map((s) => s.trim())
      .filter(Boolean),
    duration: strOrNull(it.REQ_HR) ?? '',
    distance: strOrNull(it.DSTNC) ?? '',
    difficulty: strOrNull(it.DGOD) ?? '',
    schedule: strOrNull(it.SCHDL) ?? '',
    contact: strOrNull(it.MNG_TELNO),
    lines,
  };
};

// ── 주요시설물(DSSP-IF-00139) ──────────────────────────────────────────────────
// 분류 코드 101 사무소·102 분소(등산과 거리가 멀어 뺀다)·103 탐방안내소·104 탐방지원센터(→ ENTRY)·105 대피소(→ SHELTER).

export interface ParkFacilityRow {
  // 관리번호(MNG_NO — 전국에서 하나. SN 은 겹친다).
  id: string;
  category: 'ENTRY' | 'SHELTER';
  name: string;
  ele: number | null;
  lat: number;
  lng: number;
  phone: string | null;
}

const FACILITY_CATEGORY: Record<string, ParkFacilityRow['category']> = { '103': 'ENTRY', '104': 'ENTRY', '105': 'SHELTER' };

export const normalizeParkFacility = (it: Record<string, unknown>): ParkFacilityRow | null => {
  const category = FACILITY_CATEGORY[(strOrNull(it.CLSF_CD) ?? '').trim()];
  const id = coerceStrOrNull(it.MNG_NO);
  const name = strOrNull(it.KR_NM)?.trim() ?? null;
  const lat = numOrNull(it.LAT);
  const lng = numOrNull(it.LOT);
  // 쓰지 않는 시설(USE_YN 0 — 소청대피소).
  if (!category || !id || !name || lat === null || lng === null || strOrNull(it.USE_YN) === '0') return null;
  // 연락처가 "000-000-0000" 인 곳(백운대탐방지원센터)은 없음.
  const phone = strOrNull(it.TELNO);
  return { id, category, name, ele: numOrNull(it.ALTD), lat, lng, phone: phone && /[1-9]/.test(phone) ? phone : null };
};

// ── 국립공원 경계(DSSP-IF-00145) ───────────────────────────────────────────────

export interface ParkBoundaryRow {
  id: string;
  name: string;
  nameEn: string;
  designatedYear: number | null;
  polygons: LatLngPoint[][][];
}

// WDPA 영문 이름 → 한글(원천에 한글 이름이 없다). 팔공산(2023 지정)은 원천에 없다.
const PARK_NAME_KO: Record<string, string> = {
  Bukhansan: '북한산',
  Byeonsanbando: '변산반도',
  Chiaksan: '치악산',
  Dadohaehaesang: '다도해해상',
  Deogyusan: '덕유산',
  Gayasan: '가야산',
  Gyeongju: '경주',
  Gyeryongsan: '계룡산',
  Hallasan: '한라산',
  Hallyeohaesang: '한려해상',
  Jirisan: '지리산',
  Juwangsan: '주왕산',
  Mudeungsan: '무등산',
  Naejangsan: '내장산',
  Odaesan: '오대산',
  Seoraksan: '설악산',
  Sobaeksan: '소백산',
  Songnisan: '속리산',
  Taeanhaean: '태안해안',
  Taebaeksan: '태백산',
  Wolchulsan: '월출산',
  Woraksan: '월악산',
};

export const normalizeParkBoundary = (it: Record<string, unknown>): ParkBoundaryRow | null => {
  const id = coerceStrOrNull(it.WDPAID);
  const nameEn = strOrNull(it.NAME);
  const geom = strOrNull(it.GEOM);
  if (!id || !nameEn || !geom) return null;
  const polygons = parseWktPolygons(geom);
  if (polygons.length === 0) return null;
  const ko = PARK_NAME_KO[nameEn];
  return { id, name: ko ? `${ko}국립공원` : `${nameEn} National Park`, nameEn, designatedYear: numOrNull(it.STATUS_YR), polygons };
};
