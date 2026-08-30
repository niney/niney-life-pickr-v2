import { z } from 'zod';

// 일상지도 — 전국 CCTV·공중화장실(지방행정인허가데이터 CSV 적재)·병의원(심평원 병원정보서비스
// API 적재) 공개 조회 계약. 지도 뷰포트(bbox)+줌이 조회 단위: 줌이 충분하면 개별 지점(points),
// 아니면 서버 집계 셀(cells)을 내려준다 — 377k 점을 브라우저에 다 보내지 않기 위한 유일한 분기.
// 필터는 CCTV 설치목적·병의원 종별(쉼표 목록)과 화장실 편의 조건(AND)뿐이며 양쪽 모드에 똑같이
// 걸린다.

export const LifeMapLayer = z.enum(['cctv', 'toilet', 'hospital']);
export type LifeMapLayerType = z.infer<typeof LifeMapLayer>;

// "minLng,minLat,maxLng,maxLat" — 맛집 공개 목록의 bbox 와 같은 문자열 규약(@repo/utils formatBbox).
const LifeMapBboxParam = z
  .string()
  .regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?$/, 'bbox must be "minLng,minLat,maxLng,maxLat"');

// 쿼리 불리언 — z.coerce.boolean 은 '0'/'false' 도 true 라 쓰지 않는다. 미지정=false(조건 없음).
const LifeMapFlagParam = z
  .enum(['1', '0', 'true', 'false'])
  .optional()
  .transform((v) => v === '1' || v === 'true');

// 공통 필터 — purpose 는 CCTV, category 는 병의원, 불리언은 화장실에만 의미(다른 레이어에선 무시).
const lifeMapFilterFields = {
  // 쉼표 구분 설치목적 목록(@repo/utils LIFE_CCTV_PURPOSES). 미지정/빈값=전체.
  purpose: z.string().max(200).optional(),
  // 쉼표 구분 병의원 종별 목록(@repo/utils LIFE_HOSPITAL_CATEGORIES). 미지정/빈값=전체.
  category: z.string().max(200).optional(),
  open24: LifeMapFlagParam,
  disabled: LifeMapFlagParam,
  kids: LifeMapFlagParam,
  diaper: LifeMapFlagParam,
  bell: LifeMapFlagParam,
} as const;

export const LifeMapPointsQuery = z.object({
  layer: LifeMapLayer,
  bbox: LifeMapBboxParam,
  // 지도 줌(소수 허용, 서버는 내림) — 레이어별 임계(LIFE_MAP_POINT_MIN_ZOOM) 이상이면 points.
  zoom: z.coerce.number().min(0).max(22),
  ...lifeMapFilterFields,
});
export type LifeMapPointsQueryType = z.infer<typeof LifeMapPointsQuery>;

// 지도 점 — 최소 필드만(한 번에 수천 점). 상세는 detail 라우트로. purpose 는 CCTV,
// name 은 화장실·병의원, open24 는 화장실.
export const LifeMapPoint = z.object({
  id: z.string(),
  lat: z.number(),
  lng: z.number(),
  purpose: z.string().optional(),
  name: z.string().optional(),
  open24: z.boolean().optional(),
});
export type LifeMapPointType = z.infer<typeof LifeMapPoint>;

// 집계 셀 — 셀 안 지점의 평균 좌표(무게중심)와 건수.
export const LifeMapCell = z.object({
  lat: z.number(),
  lng: z.number(),
  count: z.number().int().min(1),
});
export type LifeMapCellType = z.infer<typeof LifeMapCell>;

export const LifeMapPointsResult = z.object({
  layer: LifeMapLayer,
  mode: z.enum(['points', 'cells']),
  // mode=points 일 때만 채움(상한 LIFE_MAP_POINTS_MAX, 넘으면 truncated=true).
  items: z.array(LifeMapPoint),
  // mode=cells 일 때만 채움.
  cells: z.array(LifeMapCell),
  // bbox 안 전체 건수(필터 적용, 절단 전).
  total: z.number().int().min(0),
  truncated: z.boolean(),
  // 이 레이어가 개별 지점을 그리기 시작하는 줌 — 클라이언트 안내 문구용.
  minPointZoom: z.number().int().min(0).max(22),
  // 적재 시각(LifeMasterSync.loadedAt).
  fetchedAt: z.string(),
});
export type LifeMapPointsResultType = z.infer<typeof LifeMapPointsResult>;

// ── 상세 항목 ────────────────────────────────────────────────────────────────
export const LifeCctvItem = z.object({
  layer: z.literal('cctv'),
  id: z.string(),
  lat: z.number(),
  lng: z.number(),
  // 설치목적(정규화 10종).
  purpose: z.string(),
  orgCode: z.string(),
  orgName: z.string(),
  roadAddr: z.string().nullable(),
  lotAddr: z.string().nullable(),
  cameraCount: z.number().int().nullable(),
  // 카메라화소수(만 화소).
  pixels: z.number().int().nullable(),
  direction: z.string().nullable(),
  keepDays: z.number().int().nullable(),
  // 설치연월 'YYYYMM'.
  installedYm: z.string().nullable(),
  phone: z.string().nullable(),
  // 데이터기준일자 'YYYY-MM-DD'.
  baseDate: z.string(),
});
export type LifeCctvItemType = z.infer<typeof LifeCctvItem>;

export const LifeToiletFixtures = z.object({
  maleToilet: z.number().int().min(0),
  maleUrinal: z.number().int().min(0),
  maleDisabledToilet: z.number().int().min(0),
  maleDisabledUrinal: z.number().int().min(0),
  maleKidsToilet: z.number().int().min(0),
  maleKidsUrinal: z.number().int().min(0),
  femaleToilet: z.number().int().min(0),
  femaleDisabledToilet: z.number().int().min(0),
  femaleKidsToilet: z.number().int().min(0),
});
export type LifeToiletFixturesType = z.infer<typeof LifeToiletFixtures>;

export const LifeToiletItem = z.object({
  layer: z.literal('toilet'),
  id: z.string(),
  // 원본엔 좌표가 없어 주소를 지오코딩한 값 — 실패 건은 null(지도 미표시, 상세·검색은 가능).
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  name: z.string(),
  // 구분명(공중/개방/간이/이동/기타).
  kind: z.string(),
  roadAddr: z.string().nullable(),
  lotAddr: z.string().nullable(),
  orgName: z.string(),
  phone: z.string().nullable(),
  // 개방시간 구분(상시/정시/불규칙/미개방/미상) + 상세(원문).
  openType: z.string(),
  openDetail: z.string().nullable(),
  open24: z.boolean(),
  fixtures: LifeToiletFixtures,
  // 장애인용·어린이용 변기 1개 이상.
  disabled: z.boolean(),
  kids: z.boolean(),
  // 화장실소유구분명(공공기관-지방자치단체/민간 …).
  ownerType: z.string(),
  disposal: z.string().nullable(),
  // 안전관리시설설치대상여부 — 빈값은 null.
  safetyTarget: z.boolean().nullable(),
  bell: z.boolean(),
  bellPlace: z.string().nullable(),
  entranceCctv: z.boolean(),
  diaper: z.boolean(),
  diaperPlace: z.string().nullable(),
  installedYm: z.string().nullable(),
  remodeledYm: z.string().nullable(),
  baseDate: z.string(),
  // 좌표 출처 — 도로명/지번 지오코딩. null 이면 좌표 없음.
  geoSource: z.enum(['road', 'parcel']).nullable(),
});
export type LifeToiletItemType = z.infer<typeof LifeToiletItem>;

export const LifeHospitalItem = z.object({
  layer: z.literal('hospital'),
  // 암호화 요양기호(ykiho) — 심평원이 주는 기관 식별자(재적재 때 전량 교체라 영속 보장은 없음).
  id: z.string(),
  // 업스트림 좌표(XPos/YPos)가 없는 소수 기관은 주소 지오코딩으로 보완 — 그래도 실패면 null
  // (지도 미표시, 상세·주변 목록은 가능).
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  name: z.string(),
  // 종별코드명 원문(상급종합병원~조산원).
  kindName: z.string(),
  // 필터용 정규화 종별(@repo/utils LIFE_HOSPITAL_CATEGORIES 7종).
  category: z.string(),
  sidoName: z.string().nullable(),
  sgguName: z.string().nullable(),
  emdongName: z.string().nullable(),
  postNo: z.string().nullable(),
  addr: z.string().nullable(),
  phone: z.string().nullable(),
  url: z.string().nullable(),
  // 개설일자 'YYYY-MM-DD'.
  openedDate: z.string().nullable(),
  // 총의사수(의과+치과+한방 합) — 업스트림 미제공이면 null.
  doctorCount: z.number().int().nullable(),
  // 좌표 출처 — 'api' 는 심평원 제공, road/parcel 은 주소 지오코딩. null 이면 좌표 없음.
  geoSource: z.enum(['api', 'road', 'parcel']).nullable(),
});
export type LifeHospitalItemType = z.infer<typeof LifeHospitalItem>;

export const LifeMapItem = z.discriminatedUnion('layer', [LifeCctvItem, LifeToiletItem, LifeHospitalItem]);
export type LifeMapItemType = z.infer<typeof LifeMapItem>;

export const LifeMapDetailParams = z.object({
  layer: LifeMapLayer,
  // 병의원 id(암호화 요양기호)는 base64 ~100자 안팎이라 상한을 넉넉히 둔다.
  id: z.string().min(1).max(200),
});
export type LifeMapDetailParamsType = z.infer<typeof LifeMapDetailParams>;

// ── 주변(거리순 목록) ─────────────────────────────────────────────────────────
export const LifeMapNearbyQuery = z.object({
  layer: LifeMapLayer,
  // WGS84 한국 범위 강제(버스/지하철/대기 주변과 동일).
  lat: z.coerce.number().min(33).max(39),
  lng: z.coerce.number().min(124).max(132),
  // 반경(m) — 걸어갈 거리. 기본 1km, 상한 3km.
  radius: z.coerce.number().int().min(100).max(3000).default(1000),
  limit: z.coerce.number().int().min(1).max(30).default(10),
  ...lifeMapFilterFields,
});
export type LifeMapNearbyQueryType = z.infer<typeof LifeMapNearbyQuery>;

const distField = { dist: z.number().int().min(0) };
export const LifeMapNearbyItem = z.discriminatedUnion('layer', [
  LifeCctvItem.extend(distField),
  LifeToiletItem.extend(distField),
  LifeHospitalItem.extend(distField),
]);
export type LifeMapNearbyItemType = z.infer<typeof LifeMapNearbyItem>;

export const LifeMapNearbyResult = z.object({
  layer: LifeMapLayer,
  center: z.object({ lat: z.number(), lng: z.number() }),
  // 요청 좌표로부터 거리(m) 오름차순.
  items: z.array(LifeMapNearbyItem),
  // 반경 내 전체 건수(절단 전).
  total: z.number().int().min(0),
  fetchedAt: z.string(),
});
export type LifeMapNearbyResultType = z.infer<typeof LifeMapNearbyResult>;

// ── 지역 이동 검색(주소·장소) ─────────────────────────────────────────────────
// VWorld 검색 API 프록시. 행정구역(로컬 245지점)·지하철역·버스정류장은 클라이언트가 각자 섞고,
// 이 라우트는 주소·POI 만 — 키가 없으면 enabled=false 빈 목록(200).
export const LifeMapSearchQuery = z.object({
  q: z
    .string()
    .trim()
    .transform((v) => v.normalize('NFC').replace(/\s+/g, ' '))
    .refine((v) => v.length >= 2 && v.length <= 60, { message: '검색어는 2자 이상 60자 이하여야 합니다.' }),
  limit: z.coerce.number().int().min(1).max(20).default(8),
});
export type LifeMapSearchQueryType = z.infer<typeof LifeMapSearchQuery>;

export const LifeMapSearchItem = z.object({
  // place = POI, road/parcel = 도로명/지번 주소.
  kind: z.enum(['place', 'road', 'parcel']),
  id: z.string(),
  title: z.string(),
  // 장소는 "분류 · 주소", 주소는 건물명(없으면 지번).
  subtitle: z.string().nullable(),
  lat: z.number(),
  lng: z.number(),
});
export type LifeMapSearchItemType = z.infer<typeof LifeMapSearchItem>;

export const LifeMapSearchResult = z.object({
  q: z.string(),
  items: z.array(LifeMapSearchItem),
  // false = 서버에 vworld 키가 없어 검색을 제공하지 않음(클라이언트는 섹션을 숨긴다).
  enabled: z.boolean(),
  fetchedAt: z.string(),
});
export type LifeMapSearchResultType = z.infer<typeof LifeMapSearchResult>;

// ── 적재 상태 ────────────────────────────────────────────────────────────────
export const LifeMapLayerStatus = z.object({
  layer: LifeMapLayer,
  loaded: z.boolean(),
  count: z.number().int().min(0),
  // 화장실·병의원만 — 좌표를 확보한 건수. CCTV 는 null.
  geocoded: z.number().int().min(0).nullable(),
  // 적재 파일의 데이터기준일자 최댓값 'YYYY-MM-DD'(병의원은 적재일).
  baseDate: z.string().nullable(),
  loadedAt: z.string().nullable(),
});
export type LifeMapLayerStatusType = z.infer<typeof LifeMapLayerStatus>;

export const LifeMapStatusResult = z.object({
  layers: z.array(LifeMapLayerStatus),
  fetchedAt: z.string(),
});
export type LifeMapStatusResultType = z.infer<typeof LifeMapStatusResult>;
