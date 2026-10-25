// 코스가 걸친 시군구 — 산불위험예보(시군구 단위)·대기 예보 권역을 고르는 열쇠. 적재 때 한 번 정해 코스에 저장한다(순수 함수).
// 키는 "<시도 코드>:<시군구 이름>"(예 "51:춘천시") — 산불위험예보가 쓰는 현행 시도 코드(강원 51·전북 52·전남광주 12)와 이름이다.
//
// 경계는 웹 apps/web/public/sigungu-geo.json(통계청 2018 시군구, 4% 단순화·소수 3자리 ≈100m — build-life-crime 과 같은 파일).
// 옛 코드라 시도 코드를 옮기고, 도의 시에 있는 구 폴리곤("수원시장안구")은 시로 묶는다. 2018 뒤 바뀐 곳은 군위군(경북 → 대구,
// 2023)만 옮긴다 — 인천 구 개편(2026-07 제물포·영종·서해·검단)은 100대 명산과 겹치지 않는다(못 맞추면 산불이 빈다).
// 산은 시군구 경계(능선)에 걸친 곳이 많고 경계가 100m 쯤 거칠어, 코스 위 500m 마다 찍어 걸리는 시군구를 전부 넣는다.
// docs/PLAN-hiking.md §3차

import type { BuiltCourse } from './hiking-gpx.js';

type Ring = [number, number][];
interface GeoFeature {
  properties: { code: string; name: string };
  geometry: { type: 'Polygon'; coordinates: Ring[] } | { type: 'MultiPolygon'; coordinates: Ring[][] };
}

export interface SigunguShape {
  key: string;
  // 폴리곤마다 [바깥 고리, 구멍…].
  polygons: Ring[][];
  bbox: { minLng: number; minLat: number; maxLng: number; maxLat: number };
}

// 통계청 2018 시도 코드 → 현행(산불위험예보 upplocalcd).
const SIDO_CODE: Record<string, string> = {
  '11': '11', '21': '26', '22': '27', '23': '28', '24': '12', '25': '30', '26': '31', '29': '36',
  '31': '41', '32': '51', '33': '43', '34': '44', '35': '52', '36': '12', '37': '47', '38': '48', '39': '50',
};
// 이름이 바뀐 곳·시도가 바뀐 곳.
const RENAMED: Record<string, string> = { '29:세종시': '36:세종특별자치시', '37:군위군': '27:군위군' };
// 도의 시 아래 구 폴리곤 — "수원시장안구"·"고양시일산동구" → 시.
const CITY_DISTRICT = /^(.+?시).+구$/;
const PROVINCES = new Set(['31', '32', '33', '34', '35', '36', '37', '38']);

export const sigunguKeyOf = (code: string, name: string): string | null => {
  const old = code.slice(0, 2);
  const sido = SIDO_CODE[old];
  if (!sido) return null;
  const renamed = RENAMED[`${old}:${name}`];
  if (renamed) return renamed;
  const city = PROVINCES.has(old) ? CITY_DISTRICT.exec(name)?.[1] : undefined;
  return `${sido}:${city ?? name}`;
};

export const parseSigunguGeo = (json: unknown): SigunguShape[] => {
  const features = (json as { features?: GeoFeature[] }).features ?? [];
  const out: SigunguShape[] = [];
  for (const f of features) {
    const key = sigunguKeyOf(String(f.properties?.code ?? ''), String(f.properties?.name ?? ''));
    if (!key || !f.geometry) continue;
    const polygons = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    const bbox = { minLng: Infinity, minLat: Infinity, maxLng: -Infinity, maxLat: -Infinity };
    for (const poly of polygons) {
      for (const [lng, lat] of poly[0] ?? []) {
        bbox.minLng = Math.min(bbox.minLng, lng);
        bbox.maxLng = Math.max(bbox.maxLng, lng);
        bbox.minLat = Math.min(bbox.minLat, lat);
        bbox.maxLat = Math.max(bbox.maxLat, lat);
      }
    }
    out.push({ key, polygons, bbox });
  }
  return out;
};

// 반직선 교차 — 고리 안이면 true.
const inRing = (ring: Ring, lng: number, lat: number): boolean => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

export const sigunguAt = (shapes: readonly SigunguShape[], lat: number, lng: number): string | null => {
  for (const s of shapes) {
    const b = s.bbox;
    if (lng < b.minLng || lng > b.maxLng || lat < b.minLat || lat > b.maxLat) continue;
    for (const [outer, ...holes] of s.polygons) {
      if (outer && inRing(outer, lng, lat) && !holes.some((h) => inRing(h, lng, lat))) return s.key;
    }
  }
  return null;
};

const SAMPLE_EVERY_M = 500;

// 코스가 걸친 시군구 키(처음 만난 순서). 경계 틈(바다·단순화 틈)에 떨어진 점은 건너뛴다.
export const courseSigungu = (course: Pick<BuiltCourse, 'pieces' | 'start' | 'end' | 'top'>, shapes: readonly SigunguShape[]): string[] => {
  const points = [course.start, ...(course.top ? [course.top] : []), course.end];
  for (const piece of course.pieces) {
    let next = 0;
    for (const p of piece) {
      if (p.atM < next) continue;
      points.push(p);
      next = (Math.floor(p.atM / SAMPLE_EVERY_M) + 1) * SAMPLE_EVERY_M;
    }
  }
  const keys = new Set<string>();
  for (const p of points) {
    const k = sigunguAt(shapes, p.lat, p.lng);
    if (k) keys.add(k);
  }
  return [...keys];
};

// 시군구 키 → 소재지 문구(@repo/utils hikingRegionsOf 가 시도를 뽑을 수 있는 꼴) — 산정보에 소재지가 없는 봉우리용.
// 12(전남광주)는 광주 구면 "광주광역시 …"(hikingRegionsOf 가 광주광역시만 광주로 본다), 아니면 전남.
const SIDO_AREA: Record<string, string> = {
  '11': '서울', '26': '부산', '27': '대구', '28': '인천', '30': '대전', '31': '울산', '36': '', '41': '경기', '51': '강원',
  '43': '충북', '44': '충남', '52': '전북', '47': '경북', '48': '경남', '50': '제주',
};
export const sigunguArea = (key: string): string | null => {
  const [sido, name = ''] = key.split(':');
  if (!sido || !name) return null;
  if (sido === '12') return `${GWANGJU_GU.has(name) ? '광주광역시' : '전남'} ${name}`;
  const prefix = SIDO_AREA[sido];
  if (prefix === undefined) return null;
  return prefix ? `${prefix} ${name}` : name;
};

// 대기 예보 권역(에어코리아 예보통보 informGrade 의 권역 이름). 경기·강원은 남북·영동영서로 나뉘는데 에어코리아가 시군 목록을
// 밝히지 않아 추정으로 둔다 — 경기북부는 경기 북부 10개 시군, 영동은 기상청 동해안 6개 시군(태백은 영서로 본다).
const GYEONGGI_NORTH = new Set(['고양시', '의정부시', '남양주시', '파주시', '구리시', '양주시', '동두천시', '포천시', '연천군', '가평군']);
const GANGWON_EAST = new Set(['강릉시', '동해시', '속초시', '삼척시', '고성군', '양양군']);
const GWANGJU_GU = new Set(['동구', '서구', '남구', '북구', '광산구']);
const AIR_REGION_BY_SIDO: Record<string, string> = {
  '11': '서울', '26': '부산', '27': '대구', '28': '인천', '30': '대전', '31': '울산', '36': '세종',
  '43': '충북', '44': '충남', '47': '경북', '48': '경남', '50': '제주', '52': '전북',
};

export const airRegionOf = (key: string): string | null => {
  const [sido, name = ''] = key.split(':');
  if (!sido) return null;
  if (sido === '41') return GYEONGGI_NORTH.has(name) ? '경기북부' : '경기남부';
  if (sido === '51') return GANGWON_EAST.has(name) ? '영동' : '영서';
  if (sido === '12') return GWANGJU_GU.has(name) ? '광주' : '전남';
  return AIR_REGION_BY_SIDO[sido] ?? null;
};
