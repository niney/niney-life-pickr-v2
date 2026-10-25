import { z } from 'zod';
import { AirGradeSchema } from './air-quality.js';
import { WeatherBase, WeatherPrecip } from './weather.js';

// 등산(/hiking) — 100대 명산 + 전국 주요 봉우리 코스. 원천: 한국등산트레킹지원센터 100대명산 GPX(data.go.kr 15098177)·전국 주요
// 봉우리 코스 GPX(15108086) + 산림청 명산등산로(15158915)·산정보(15058662) + 한국등산트레킹지원센터 봉우리·갈림길·교통 POI(B553662). 산·코스는 적재본
// (load:hiking)을 읽기만 하고, 오늘의 조건(conditions)만 기상청 단기예보·에어코리아·산림청 산불위험예보를 캐시로 부른다.
// docs/PLAN-hiking.md

const LatLng = z.object({ lat: z.number(), lng: z.number() });
export const HikingBbox = z.object({ minLat: z.number(), minLng: z.number(), maxLat: z.number(), maxLng: z.number() });
export type HikingBboxType = z.infer<typeof HikingBbox>;

// 산 종류(5차) — top100 100대 명산(산림청 명산등산로, id = 산 코드 9자리) · peak 전국 주요 봉우리(한국등산트레킹지원센터
// 15108086, id = 봉우리 코드 10자리 — 선·고도만 있는 자료라 이정표·노면·공식 코스 문구가 없다).
export const HikingMountainKind = z.enum(['top100', 'peak']);
export type HikingMountainKindType = z.infer<typeof HikingMountainKind>;

// 산 목록 한 줄. lat/lng 는 정상(없으면 코스 범위 가운데) — 지도 마커 자리.
export const HikingMountainSummary = LatLng.extend({
  id: z.string(),
  name: z.string(),
  kind: HikingMountainKind,
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
  // 100대 명산에 합친 전국 봉우리 이름(검색용 — "서석대"로 무등산을 찾는다). 봉우리 산은 빈 배열.
  peaks: z.array(z.string()),
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
  // loop 원점회귀 · summit 정상에서 끝나는 편도(같은 길로 내려온다) · traverse 넘어가는 편도.
  shape: z.enum(['loop', 'summit', 'traverse']),
  // 예상 시간(분, 짧은 휴식 포함 추정 — @repo/utils estimateHikingMinutes). 시작→끝 / 끝→시작 / 정상 왕복(summit 만).
  // 고도가 없는 코스는 null. 끊긴 곳은 거리처럼 넣지 않았다.
  timeMin: z.number().int().nullable(),
  timeRevMin: z.number().int().nullable(),
  roundTripMin: z.number().int().nullable(),
  // 쉬움·보통·어려움(@repo/utils hikingDifficulty — 예상 시간·누적 상승·가장 가파른 500m·밧줄/릿지/사다리). 고도 없으면 null.
  difficulty: z.enum(['easy', 'moderate', 'hard']).nullable(),
  // 가장 가파른 500m 의 평균 경사(%).
  steepPct: z.number().int().nullable(),
  gapCount: z.number().int(),
  gapM: z.number().int(),
  // 코스에 나오는 험한 노면(@repo/utils HIKING_ROUGH_SURFACES 중) — 카드 칩.
  roughSurfaces: z.array(z.string()),
  // 원천 — top100 100대명산 GPX(지점·이정표·노면) · peak 전국 주요 봉우리 GPX(선·고도만, 지점은 근처 봉우리·등산 지점을 붙인 것) ·
  // network 전국 주요 봉우리의 등산로 망(구간 묶음)을 갈림길에서 이어 만든 코스(6차 — 들머리 → 정상 왕복·넘어가기).
  source: z.enum(['top100', 'peak', 'network']),
  bbox: HikingBbox,
  pieces: z.array(z.string()),
});
export type HikingCourseSummaryType = z.infer<typeof HikingCourseSummary>;

// 이어진 봉우리 — 정상이 서로의 코스 선 30m 안인 산(가까운 순, 최대 8). distM 은 정상끼리 직선거리.
export const HikingNeighbor = LatLng.extend({
  id: z.string(),
  name: z.string(),
  kind: HikingMountainKind,
  heightM: z.number().nullable(),
  distM: z.number().int(),
});
export type HikingNeighborType = z.infer<typeof HikingNeighbor>;

export const HikingMountainDetail = HikingMountainSummary.extend({
  // 100대 명산은 명산등산로 개관, 봉우리는 산림청 산정보 소개(이름·시군구가 맞을 때만).
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
  neighbors: z.array(HikingNeighbor),
});
export type HikingMountainDetailType = z.infer<typeof HikingMountainDetail>;

export const HikingSignpost = z.object({
  dest: z.string(),
  // ST 직진 · BR/BL 비스듬히 오른쪽/왼쪽 · TR/TL 오른쪽/왼쪽 · SR/SL 크게 꺾어 · UT 뒤쪽 — 조사자가 걸어온 방향 기준이라
  // 코스 방향과 다를 수 있다(코스 기준은 guide). 모르면 null.
  dir: z.string().nullable(),
});
export type HikingSignpostType = z.infer<typeof HikingSignpost>;

// 코스 기준 이정표 안내 — way: next 이 코스로 가는 길 · prev 온 길 · null 다른 길(또는 못 정함).
export const HikingSignGuide = HikingSignpost.extend({ way: z.enum(['next', 'prev']).nullable() });
export type HikingSignGuideType = z.infer<typeof HikingSignGuide>;

// 코스 지점 — atM 은 코스 시작에서 그 지점까지 선 위 거리(고도 그래프 눈금). category 는 GPX 원문 코드
// (PEAK·SIGN·ENTRY·TRANS·PARK·TOILET·DANGER·SHELTER·SPRING·VIEW·REST·SCENERY·CULTURAL·INFO·…).
export const HikingPoi = LatLng.extend({
  id: z.string(),
  category: z.string(),
  name: z.string().nullable(),
  description: z.string().nullable(),
  ele: z.number().nullable(),
  signposts: z.array(HikingSignpost),
  // 이 코스 기준 안내(이정표 없는 지점은 빈 배열).
  guide: z.array(HikingSignGuide),
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

// ── 오늘의 조건(3차) — GET /v1/hiking/courses/:id/conditions ─────────────────────
// 오늘·내일·모레 3일치 원자료(들머리 격자 단기예보 + 가장 높은 곳 추정 기온, 가까운 대기 측정소·예보 권역, 코스가 걸친 시군구의
// 산불위험예보, 해 뜨고 지는 시각). 날짜·출발 시각에 따른 접기(산행 시간대 날씨·산불 등급·해 지기 전 하산·주의할 점)는
// @repo/utils hikingConditions 가 한다. 항목마다 따로 받아 하나가 실패해도 나머지는 온다(errors 에 까닭).

export const HikingConditionHour = z.object({
  // 그 시각부터 한 시간(ISO +09:00).
  at: z.string(),
  tmp: z.number().nullable(),
  // 코스 가장 높은 곳 추정 기온 — 들머리 고도 기준 100m 당 0.6°C(@repo/utils estimateTopTemp).
  topTmp: z.number().nullable(),
  sky: z.number().int().nullable(),
  pty: z.number().int().nullable(),
  pop: z.number().nullable(),
  pcp: WeatherPrecip,
  sno: WeatherPrecip,
  reh: z.number().nullable(),
  wsd: z.number().nullable(),
  vec: z.number().nullable(),
});
export type HikingConditionHourType = z.infer<typeof HikingConditionHour>;

// 들머리 좌표의 해 — 시민박명 시작·일출·일몰·시민박명 끝(ISO, @repo/utils sunTimes).
export const HikingConditionDay = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dawn: z.string().nullable(),
  sunrise: z.string().nullable(),
  sunset: z.string().nullable(),
  dusk: z.string().nullable(),
});
export type HikingConditionDayType = z.infer<typeof HikingConditionDay>;

export const HikingConditionsWeather = z.object({
  grid: z.object({ nx: z.number().int(), ny: z.number().int() }),
  base: WeatherBase.nullable(),
  hours: z.array(HikingConditionHour),
  fetchedAt: z.string(),
  stale: z.boolean(),
});

export const HikingConditionsAir = z.object({
  // 들머리에서 가장 가까운 측정소(30km 안, 측정값이 있는 곳).
  station: z.object({ name: z.string(), distM: z.number().int() }).nullable(),
  measuredAt: z.string().nullable(),
  pm10: z.number().nullable(),
  pm10Grade: AirGradeSchema,
  pm25: z.number().nullable(),
  pm25Grade: AirGradeSchema,
  // 에어코리아 예보 권역(코스가 걸친 시군구에서) — 날짜별 등급은 권역 여럿이면 나쁜 쪽. 보통 내일까지 온다.
  regions: z.array(z.string()),
  forecast: z.array(z.object({ date: z.string(), pm10Grade: AirGradeSchema, pm25Grade: AirGradeSchema })),
  fetchedAt: z.string(),
  stale: z.boolean(),
});

// 산림청 산불위험예보 한 칸(그 시각부터 3시간) — d1~d4 는 등급(낮음·다소높음·높음·매우높음)별 면적 %, mean/max 는 지수.
export const HikingFireSlot = z.object({
  at: z.string(),
  d1: z.number(),
  d2: z.number(),
  d3: z.number(),
  d4: z.number(),
  mean: z.number().nullable(),
  max: z.number().nullable(),
});
export const HikingFireArea = z.object({
  // "<시도 코드>:<시군구>".
  key: z.string(),
  sido: z.string(),
  name: z.string(),
  slots: z.array(HikingFireSlot),
});
export type HikingFireAreaType = z.infer<typeof HikingFireArea>;

export const HikingConditionsFire = z.object({
  areas: z.array(HikingFireArea),
  fetchedAt: z.string(),
  stale: z.boolean(),
});

export const HikingConditions = z.object({
  courseId: z.string(),
  // 들머리(코스 시작) — 날씨 격자·대기 측정소·해 시각의 기준.
  ref: LatLng.extend({ ele: z.number().nullable() }),
  // 코스 가장 높은 곳 고도(추정 기온 대상).
  topEle: z.number().nullable(),
  // 오늘·내일·모레(KST).
  days: z.array(HikingConditionDay),
  weather: HikingConditionsWeather.nullable(),
  air: HikingConditionsAir.nullable(),
  fire: HikingConditionsFire.nullable(),
  errors: z.object({ weather: z.string().nullable(), air: z.string().nullable(), fire: z.string().nullable() }),
  generatedAt: z.string(),
});
export type HikingConditionsType = z.infer<typeof HikingConditions>;

// ── 코스 주변(4차) — GET /v1/hiking/courses/:id/around ─────────────────────────────
// 들머리(편도면 날머리도) 근처 정류장·주차·화장실과 날머리 근처 하산 후 맛집. 로컬 DB 만.
// kind: trail 등산 지점(GPX·등산트레킹) · bus 버스 정류장(수도권) · subway 지하철역 · lot 주차장 · public 공중화장실 ·
// restaurant 맛집(공개 네이버 행, refId = placeId) · store 상가정보 음식점. refId 는 bus stId · subway 역 id · lot 주차장 id.
export const HikingAroundPlace = LatLng.extend({
  kind: z.enum(['trail', 'bus', 'subway', 'lot', 'public', 'restaurant', 'store']),
  name: z.string(),
  // 기준점(들머리·날머리)에서 직선거리.
  distM: z.number().int(),
  at: z.enum(['start', 'end']),
  // 한 줄 덧붙임(요금·노선·업종·평점 등).
  detail: z.string().nullable(),
  refId: z.string().nullable(),
});
export type HikingAroundPlaceType = z.infer<typeof HikingAroundPlace>;

export const HikingAround = z.object({
  courseId: z.string(),
  start: LatLng.extend({ name: z.string().nullable() }),
  // 편도(traverse)만 — 원점회귀·왕복은 들머리로 돌아온다.
  end: LatLng.extend({ name: z.string().nullable() }).nullable(),
  transit: z.array(HikingAroundPlace),
  parking: z.array(HikingAroundPlace),
  toilets: z.array(HikingAroundPlace),
  // 날머리(원점회귀·왕복은 들머리) 근처 — 크롤 맛집(5km) 먼저, 없으면 상가정보 음식점(2km).
  food: z.object({ source: z.enum(['restaurants', 'stores']).nullable(), items: z.array(HikingAroundPlace) }),
});
export type HikingAroundType = z.infer<typeof HikingAround>;

// ── 추천(4차) — GET /v1/hiking/recommend ────────────────────────────────────────
// 사용자 결정(2026-10-25): 출발 위치·날짜·출발 시각·산행 시간·난이도·이동 수단. 점수·문장은 @repo/utils hikingRecommend.
export const HikingRecommendQuery = z
  .object({
    // 출발 위치 — 둘 다 주거나 둘 다 빼기(빼면 거리를 보지 않는다).
    lat: z.coerce.number().min(32).max(39).optional(),
    lng: z.coerce.number().min(124).max(132).optional(),
    // KST 오늘·내일·모레 중 하나(생략하면 오늘).
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    // 출발 시각 HH:MM(생략하면 08:00).
    start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
    // short 3시간 안 · half 반나절(3~5.5시간) · day 하루(5.5~10시간).
    duration: z.enum(['short', 'half', 'day']).default('half'),
    level: z.enum(['any', 'easy', 'moderate', 'hard']).default('any'),
    mode: z.enum(['car', 'transit']).default('car'),
    limit: z.coerce.number().int().min(1).max(20).default(10),
  })
  .refine((q) => (q.lat === undefined) === (q.lng === undefined), { message: 'lat 과 lng 는 함께 주세요.' });
export type HikingRecommendQueryType = z.infer<typeof HikingRecommendQuery>;

export const HikingCaution = z.object({ level: z.enum(['warn', 'info']), text: z.string() });

export const HikingRecommendItem = z.object({
  rank: z.number().int(),
  score: z.number(),
  mountain: LatLng.extend({ id: z.string(), name: z.string(), kind: HikingMountainKind, heightM: z.number().nullable(), images: z.array(z.number().int()) }),
  course: z.object({
    id: z.string(),
    no: z.number().int(),
    name: z.string(),
    shape: z.enum(['loop', 'summit', 'traverse']),
    lengthM: z.number().int(),
    // 왕복 또는 코스 방향 예상 시간(분).
    outingMin: z.number().int().nullable(),
    difficulty: z.enum(['easy', 'moderate', 'hard']).nullable(),
    start: LatLng,
  }),
  // 출발 위치 → 들머리 직선거리와 대략 차로 시간(추정). 위치를 안 주면 null.
  straightM: z.number().int().nullable(),
  driveMin: z.number().int().nullable(),
  // 들머리 근처 주차·정류장 이름, 편도 날머리 근처 정류장.
  access: z.object({ parking: z.string().nullable(), transit: z.string().nullable(), transitEnd: z.string().nullable() }),
  startAt: z.string(),
  endAt: z.string().nullable(),
  sunset: z.string().nullable(),
  daylight: z.enum(['ok', 'tight', 'dark']).nullable(),
  // 산행 시간대 날씨 요약(오늘의 조건을 받은 항목만).
  weather: z
    .object({
      sky: z.number().int().nullable(),
      pty: z.number().int().nullable(),
      tmpMax: z.number().nullable(),
      topTmpMin: z.number().nullable(),
      popMax: z.number().nullable(),
      windMax: z.number().nullable(),
    })
    .nullable(),
  fireLevel: z.number().int().min(1).max(4).nullable(),
  airGrade: AirGradeSchema,
  // 오늘의 조건(날씨·산불·대기)을 받아 점수에 넣었는지 — 상위 후보만 받는다.
  conditionsChecked: z.boolean(),
  season: z.array(z.string()),
  // 추천 이유 문장.
  reason: z.string(),
  cautions: z.array(HikingCaution),
});
export type HikingRecommendItemType = z.infer<typeof HikingRecommendItem>;

export const HikingRecommendResult = z.object({
  items: z.array(HikingRecommendItem),
  query: z.object({
    date: z.string(),
    start: z.string(),
    duration: z.enum(['short', 'half', 'day']),
    level: z.enum(['any', 'easy', 'moderate', 'hard']),
    mode: z.enum(['car', 'transit']),
    origin: LatLng.nullable(),
  }),
  generatedAt: z.string(),
});
export type HikingRecommendResultType = z.infer<typeof HikingRecommendResult>;

export const HikingMountainParams = z.object({ id: z.string().regex(/^\d{6,12}$/) });
export const HikingCourseParams = z.object({ id: z.string().regex(/^\d{6,12}-\d{1,4}$/) });
export const HikingImageParams = z.object({ id: z.string().regex(/^\d{6,12}$/), no: z.coerce.number().int().min(1).max(99) });
