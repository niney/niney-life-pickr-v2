import { z } from 'zod';

// 등산(/hiking) — 100대 명산 코스. 원천: 한국등산트레킹지원센터 100대명산 GPX(data.go.kr 15098177) + 산림청
// 명산등산로(15158915)·산정보 사진(15058662) + 한국등산트레킹지원센터 봉우리·갈림길·교통 POI(B553662). 전부 적재본
// (load:hiking)을 읽기만 한다 — 업스트림 호출 없음. docs/PLAN-hiking.md

const LatLng = z.object({ lat: z.number(), lng: z.number() });
export const HikingBbox = z.object({ minLat: z.number(), minLng: z.number(), maxLat: z.number(), maxLng: z.number() });
export type HikingBboxType = z.infer<typeof HikingBbox>;

// 산 목록 한 줄. lat/lng 는 정상(없으면 코스 범위 가운데) — 지도 마커 자리.
export const HikingMountainSummary = LatLng.extend({
  id: z.string(),
  name: z.string(),
  subtitle: z.string().nullable(),
  heightM: z.number().nullable(),
  area: z.string().nullable(),
  // @repo/utils HIKING_REGIONS 키 — 두 시도에 걸치면 둘 다.
  regions: z.array(z.string()),
  courseCount: z.number().int(),
  minLengthM: z.number().int().nullable(),
  maxLengthM: z.number().int().nullable(),
  // 저장된 사진 순번(Routes.Hiking.image(id, no)).
  images: z.array(z.number().int()),
});
export type HikingMountainSummaryType = z.infer<typeof HikingMountainSummary>;

export const HikingMountainsResult = z.object({
  items: z.array(HikingMountainSummary),
  loadedAt: z.string(),
});
export type HikingMountainsResultType = z.infer<typeof HikingMountainsResult>;

// 코스 요약 — 산 상세 목록·지도용. pieces 는 조각별 encoded polyline(정밀도 1e5, @repo/utils decodePolyline).
// 조각 사이는 원본 기록이 끊긴 곳(gapCount·gapM, 직선거리 합 — 길이 lengthM 에는 넣지 않는다).
export const HikingCourseSummary = z.object({
  id: z.string(),
  no: z.number().int(),
  name: z.string(),
  // 'points' 지점 이름으로 만든 이름 · 'number' 이름을 못 만들어 "코스 n".
  nameSource: z.enum(['points', 'number']),
  startName: z.string().nullable(),
  endName: z.string().nullable(),
  peakName: z.string().nullable(),
  lengthM: z.number().int(),
  // 고도가 없는 코스(원본 고도 0)는 false — gain/loss/ele 가 null.
  hasElevation: z.boolean(),
  gainM: z.number().int().nullable(),
  lossM: z.number().int().nullable(),
  minEle: z.number().nullable(),
  maxEle: z.number().nullable(),
  isLoop: z.boolean(),
  gapCount: z.number().int(),
  gapM: z.number().int(),
  // 코스에 나오는 험한 노면(@repo/utils HIKING_ROUGH_SURFACES 중) — 카드 칩.
  roughSurfaces: z.array(z.string()),
  bbox: HikingBbox,
  pieces: z.array(z.string()),
});
export type HikingCourseSummaryType = z.infer<typeof HikingCourseSummary>;

export const HikingMountainDetail = HikingMountainSummary.extend({
  overview: z.string().nullable(),
  details: z.string().nullable(),
  // 100대 명산 선정 이유.
  reason: z.string().nullable(),
  // 명산등산로 공식 코스 문구 원문(줄바꿈 구분, 소요시간 포함).
  officialCourses: z.string().nullable(),
  summitName: z.string().nullable(),
  summitEle: z.number().nullable(),
  bbox: HikingBbox,
  courses: z.array(HikingCourseSummary),
});
export type HikingMountainDetailType = z.infer<typeof HikingMountainDetail>;

export const HikingSignpost = z.object({
  dest: z.string(),
  // ST 직진 · TL 왼쪽 · TR 오른쪽 · UT 뒤쪽(조사 진행 방향 기준). 모르면 null.
  dir: z.string().nullable(),
});
export type HikingSignpostType = z.infer<typeof HikingSignpost>;

// 코스 지점 — atM 은 코스 시작에서 그 지점까지 선 위 거리(고도 그래프 눈금). category 는 GPX 원문 코드
// (PEAK·SIGN·ENTRY·TRANS·PARK·TOILET·DANGER·SHELTER·SPRING·VIEW·REST·SCENERY·CULTURAL·INFO·…).
export const HikingPoi = LatLng.extend({
  id: z.string(),
  category: z.string(),
  name: z.string().nullable(),
  description: z.string().nullable(),
  ele: z.number().nullable(),
  signposts: z.array(HikingSignpost),
  atM: z.number().int(),
});
export type HikingPoiType = z.infer<typeof HikingPoi>;

export const HikingSurface = z.object({
  type: z.string(),
  fromM: z.number().int(),
  toM: z.number().int(),
});
export type HikingSurfaceType = z.infer<typeof HikingSurface>;

// 고도 프로필 — 20m 간격 표본. d: 시작에서 거리(m), e: 고도(m). 고도 없는 코스는 빈 배열.
export const HikingProfile = z.object({ d: z.array(z.number()), e: z.array(z.number()) });
export type HikingProfileType = z.infer<typeof HikingProfile>;

export const HikingCourseDetail = HikingCourseSummary.extend({
  mountain: z.object({ id: z.string(), name: z.string(), heightM: z.number().nullable() }),
  start: LatLng.extend({ ele: z.number().nullable() }),
  end: LatLng.extend({ ele: z.number().nullable() }),
  profile: HikingProfile,
  // 노면 범위(원본 rtsc — 유형마다 처음·마지막으로 나온 곳 정도라 서로 겹친다).
  surfaces: z.array(HikingSurface),
  // atM 순.
  pois: z.array(HikingPoi),
});
export type HikingCourseDetailType = z.infer<typeof HikingCourseDetail>;

export const HikingMountainParams = z.object({ id: z.string().regex(/^\d{6,12}$/) });
export const HikingCourseParams = z.object({ id: z.string().regex(/^\d{6,12}-\d{1,4}$/) });
export const HikingImageParams = z.object({ id: z.string().regex(/^\d{6,12}$/), no: z.coerce.number().int().min(1).max(99) });
