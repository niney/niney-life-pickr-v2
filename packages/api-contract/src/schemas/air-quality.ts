import { z } from 'zod';

// 에어코리아 대기오염정보(한국환경공단, data.go.kr 15073861 ArpltnInforInqireSvc) —
// friendly 가 5개 오퍼레이션을 프록시한다. 업스트림은 값이 전부 문자열이고 결측을
// "-"(농도) / null(등급) / "통신장애"(Flag) 로 섞어 보내므로, 여기서는 숫자·등급을
// 정규화한 형태만 계약한다(변환은 서비스 책임). 캐시성 응답 공통 필드:
// fetchedAt(ISO, 업스트림 수집 시각) + stale(업스트림 실패로 last-known 서빙 중).

// 통합대기환경지수 등급 — 1 좋음 / 2 보통 / 3 나쁨 / 4 매우나쁨, 결측 null.
export const AirGradeSchema = z
  .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
  .nullable();
export type AirGradeType = z.infer<typeof AirGradeSchema>;

// 측정자료 상태 — 정상은 null, 그 외 '점검및교정' / '장비점검' / '자료이상' /
// '통신장애'(ver 1.4+). 값이 있으면 해당 항목 농도가 결측("-")으로 온다.
export const AirMeasureFlags = z.object({
  so2: z.string().max(30).nullable(),
  co: z.string().max(30).nullable(),
  o3: z.string().max(30).nullable(),
  no2: z.string().max(30).nullable(),
  pm10: z.string().max(30).nullable(),
  pm25: z.string().max(30).nullable(),
});
export type AirMeasureFlagsType = z.infer<typeof AirMeasureFlags>;

// 측정소 1행(시도별/측정소별 공통, ver=1.5 필드 전부).
export const AirMeasureItem = z.object({
  stationName: z.string().min(1).max(60),
  // ver 1.5 부터 내려오는 측정소 코드('111261'). 선행 0 보존을 위해 문자열.
  stationCode: z.string().max(20).nullable(),
  // 시도별 조회에서만 채워진다('서울', 2026-07 통합 이후 '전남광주' 같은 합본 라벨 포함).
  sidoName: z.string().max(20).nullable(),
  // 측정망 — 도시대기 / 도로변대기 / 교외대기 / 항만 / 국가배경농도(도서).
  mangName: z.string().max(30).nullable(),
  // 측정시각 원문 "YYYY-MM-DD HH:mm"(자정은 전일 "24:00" 표기) — 표시용.
  dataTime: z.string().max(30).nullable(),
  // dataTime 을 ISO(+09:00) 로 정규화한 값(24:00 → 익일 00:00). 정렬·경과시간 계산용.
  measuredAt: z.string().nullable(),
  // 농도 — SO₂/CO/O₃/NO₂ ppm, PM ㎍/㎥. 결측 null.
  so2: z.number().nullable(),
  co: z.number().nullable(),
  o3: z.number().nullable(),
  no2: z.number().nullable(),
  pm10: z.number().nullable(),
  pm25: z.number().nullable(),
  // PM 24시간 예측이동평균(pm10Value24/pm25Value24) — 24시간 등급의 근거값.
  pm10Avg24: z.number().nullable(),
  pm25Avg24: z.number().nullable(),
  // 통합대기환경수치(khaiValue) 와 등급.
  khai: z.number().nullable(),
  khaiGrade: AirGradeSchema,
  so2Grade: AirGradeSchema,
  coGrade: AirGradeSchema,
  o3Grade: AirGradeSchema,
  no2Grade: AirGradeSchema,
  // PM 24시간 등급(pm10Grade/pm25Grade) 과 1시간 등급(pm10Grade1h/pm25Grade1h).
  pm10Grade: AirGradeSchema,
  pm25Grade: AirGradeSchema,
  pm10Grade1h: AirGradeSchema,
  pm25Grade1h: AirGradeSchema,
  flags: AirMeasureFlags,
});
export type AirMeasureItemType = z.infer<typeof AirMeasureItem>;

// ── 시도별 실시간 측정정보 (getCtprvnRltmMesureDnsty) ───────────────────────
export const AirSidoParams = z.object({
  // 업스트림 sidoName 어휘(전국/서울/…/전남광주). 서버는 '전국' 1콜을 캐시해 포함
  // 매칭으로 거르므로 구 라벨('광주'/'전남')도 통합 라벨에 매칭된다. 매칭 0건이면
  // 빈 items(404 아님 — 측정소 전원 결측과 구분 불가).
  sidoName: z.string().trim().min(1).max(20),
});
export type AirSidoParamsType = z.infer<typeof AirSidoParams>;

export const AirSidoRealtimeResult = z.object({
  sidoName: z.string(),
  items: z.array(AirMeasureItem),
  total: z.number().int().min(0),
  fetchedAt: z.string(),
  stale: z.boolean(),
});
export type AirSidoRealtimeResultType = z.infer<typeof AirSidoRealtimeResult>;

// ── 측정소별 실시간 측정정보 (getMsrstnAcctoRltmMesureDnsty) ────────────────
export const AIR_HISTORY_TERMS = ['DAILY', 'MONTH', '3MONTH'] as const;
export const AirHistoryTerm = z.enum(AIR_HISTORY_TERMS);
export type AirHistoryTermType = z.infer<typeof AirHistoryTerm>;

export const AirStationHistoryParams = z.object({
  // 업스트림 측정소명 그대로('강남구'). 시도별 결과의 stationName 을 넘긴다.
  stationName: z.string().trim().min(1).max(60),
});
export type AirStationHistoryParamsType = z.infer<typeof AirStationHistoryParams>;

export const AirStationHistoryQuery = z.object({
  // DAILY = 최근 24시간(시간별 원본) / MONTH·3MONTH = 서버가 일평균으로 접는다.
  term: AirHistoryTerm.default('DAILY'),
});
export type AirStationHistoryQueryType = z.infer<typeof AirStationHistoryQuery>;

export const AirHistoryPoint = z.object({
  // unit 'hour': dataTime 원문("YYYY-MM-DD HH:mm") / 'day': "YYYY-MM-DD".
  time: z.string(),
  // hour 포인트의 ISO(+09:00). day 포인트는 null.
  measuredAt: z.string().nullable(),
  so2: z.number().nullable(),
  co: z.number().nullable(),
  o3: z.number().nullable(),
  no2: z.number().nullable(),
  pm10: z.number().nullable(),
  pm25: z.number().nullable(),
  khai: z.number().nullable(),
});
export type AirHistoryPointType = z.infer<typeof AirHistoryPoint>;

export const AirStationHistoryResult = z.object({
  stationName: z.string(),
  term: AirHistoryTerm,
  unit: z.enum(['hour', 'day']),
  // 가장 최근 시간 행(등급·플래그·측정망 포함) — 상세 카드용. 행이 없으면 null.
  latest: AirMeasureItem.nullable(),
  // 시간 오름차순(과거 → 최근).
  points: z.array(AirHistoryPoint),
  // 업스트림 원본 행 수(일평균으로 접기 전).
  total: z.number().int().min(0),
  fetchedAt: z.string(),
  stale: z.boolean(),
});
export type AirStationHistoryResultType = z.infer<typeof AirStationHistoryResult>;

// ── 통합대기환경지수 나쁨 이상 측정소 (getUnityAirEnvrnIdexSnstiveAboveMsrstnList) ──
export const AirBadStationItem = z.object({
  stationName: z.string().min(1).max(60),
  addr: z.string().max(200),
  // addr 앞머리에서 서버가 추정한 시도 약칭('인천') — 묶음 표시용. 추정 실패 null.
  sidoName: z.string().max(20).nullable(),
});
export type AirBadStationItemType = z.infer<typeof AirBadStationItem>;

export const AirBadStationsResult = z.object({
  items: z.array(AirBadStationItem),
  total: z.number().int().min(0),
  fetchedAt: z.string(),
  stale: z.boolean(),
});
export type AirBadStationsResultType = z.infer<typeof AirBadStationsResult>;

// ── 대기질 예보통보 (getMinuDustFrcstDspth) ─────────────────────────────────
export const AIR_FORECAST_CODES = ['PM10', 'PM25', 'O3'] as const;
export const AirForecastCode = z.enum(AIR_FORECAST_CODES);
export type AirForecastCodeType = z.infer<typeof AirForecastCode>;

export const AirRegionGradeSchema = z.object({
  region: z.string().max(20),
  // 예보: 좋음/보통/나쁨/매우나쁨 · 주간예보: 낮음/높음. 원문 보존(FE 가 색으로 접는다).
  grade: z.string().max(20),
});
export type AirRegionGradeType = z.infer<typeof AirRegionGradeSchema>;

export const AirForecastImage = z.object({
  url: z.string().url(),
  pollutant: z.enum(['PM10', 'PM2.5', 'O3']).nullable(),
  // 정지 이미지의 예측 시각 라벨("8/21 03시"). 애니메이션은 null.
  at: z.string().nullable(),
  animated: z.boolean(),
});
export type AirForecastImageType = z.infer<typeof AirForecastImage>;

export const AirForecastItem = z.object({
  code: AirForecastCode,
  // 통보시간 원문("2026-08-21 11시 발표") 과 ISO.
  announced: z.string().max(40),
  announcedAt: z.string().nullable(),
  // 예측 대상일(informData) "YYYY-MM-DD" — 같은 발표에 오늘/내일(/모레) 행이 따로 온다.
  targetDate: z.string().max(10),
  overall: z.string().nullable(),
  cause: z.string().nullable(),
  actionKnack: z.string().nullable(),
  // informGrade 를 권역·등급 쌍으로 분해(19권역: 영동/영서·경기남부/북부 분리).
  grades: z.array(AirRegionGradeSchema),
  // imageUrl1~9 중 유효한 것만(빈 슬롯 제거), 파일명에서 항목·시각 라벨링.
  images: z.array(AirForecastImage),
});
export type AirForecastItemType = z.infer<typeof AirForecastItem>;

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export const AirForecastQuery = z.object({
  // 통보 일자(searchDate). 생략 시 서버가 KST 오늘 — 당일 발표분이 아직 없으면(새벽)
  // 전일 발표분으로 1회 폴백한다. 업스트림은 InformCode 필터를 무시하고 3종을 모두
  // 돌려주므로(실측) 코드 필터는 FE 가 한다.
  date: z.string().regex(YMD, { message: 'YYYY-MM-DD 형식이어야 합니다.' }).optional(),
});
export type AirForecastQueryType = z.infer<typeof AirForecastQuery>;

export const AirForecastResult = z.object({
  // 실제 조회에 쓰인 통보 일자(폴백 시 전일).
  date: z.string(),
  // announcedAt 내림차순(최신 발표 먼저), 같은 발표 안에서는 code·targetDate 순.
  items: z.array(AirForecastItem),
  fetchedAt: z.string(),
  stale: z.boolean(),
});
export type AirForecastResultType = z.infer<typeof AirForecastResult>;

// ── 초미세먼지 주간예보 (getMinuDustWeekFrcstDspth) ────────────────────────
export const AirWeeklyDay = z.object({
  date: z.string().max(10),
  // 권역별 낮음/높음.
  grades: z.array(AirRegionGradeSchema),
  // 원문 끝의 "신뢰도 : 높음" 을 분리한 값.
  reliability: z.string().max(10).nullable(),
});
export type AirWeeklyDayType = z.infer<typeof AirWeeklyDay>;

export const AirWeeklyForecastQuery = z.object({
  // 발표일(searchDate). 생략 시 KST 오늘 → 미발표면 전일 폴백(오후 발표라 오전엔 전일분).
  date: z.string().regex(YMD, { message: 'YYYY-MM-DD 형식이어야 합니다.' }).optional(),
});
export type AirWeeklyForecastQueryType = z.infer<typeof AirWeeklyForecastQuery>;

// ── 측정소 정보 (MsrstnInfoInqireSvc getMsrstnList, data.go.kr 15073877) ─────
// 측정소 좌표·주소·측정항목. 대기오염정보(15073861)와 다른 API 라 활용신청이 따로
// 필요하다(같은 계정 키). 서버가 전량(≈650개소)을 24시간 캐시하고 지도·검색·내 주변을
// 로컬로 계산한다(업스트림 근접측정소 TM 좌표 오퍼레이션은 쓰지 않는다).
export const AirStationInfoItem = z.object({
  stationName: z.string().min(1).max(60),
  addr: z.string().max(200),
  // addr 앞머리에서 추정한 시도 약칭 — 시도 선택지(AIR_SIDO_OPTIONS) 매핑용.
  sidoName: z.string().max(20).nullable(),
  mangName: z.string().max(30).nullable(),
  // 설치년도(year) — 문자열 원문.
  year: z.string().max(10).nullable(),
  // 측정항목 원문("SO2, CO, O3, NO2, PM10, PM2.5") 을 쉼표로 나눈 배열.
  items: z.array(z.string().max(20)),
  // WGS84 — 업스트림 dmX(위도)/dmY(경도)를 값 범위로 판정해 정규화. 범위 밖이면 null
  // (지도에는 안 그리고 목록에는 남는다).
  lat: z.number().min(33).max(39).nullable(),
  lng: z.number().min(124).max(132).nullable(),
});
export type AirStationInfoItemType = z.infer<typeof AirStationInfoItem>;

export const AirStationsResult = z.object({
  items: z.array(AirStationInfoItem),
  total: z.number().int().min(0),
  fetchedAt: z.string(),
  stale: z.boolean(),
});
export type AirStationsResultType = z.infer<typeof AirStationsResult>;

export const AirNearbyQuery = z.object({
  // WGS84 한국 범위 강제.
  lat: z.coerce.number().min(33).max(39),
  lng: z.coerce.number().min(124).max(132),
  // 반경(m). 측정소 간격이 넓어 기본 10km, 상한 50km.
  radius: z.coerce.number().int().min(500).max(50_000).default(10_000),
  // 거리순 상위 N — 기본 5, 상한 20.
  limit: z.coerce.number().int().min(1).max(20).default(5),
});
export type AirNearbyQueryType = z.infer<typeof AirNearbyQuery>;

export const AirNearbyStationItem = AirStationInfoItem.extend({
  // 요청 좌표로부터의 거리(m) — 서버 계산, 오름차순 정렬 계약.
  dist: z.number().int().min(0),
  // 같은 이름의 측정소 현재 측정값('전국' 실시간 캐시 조인). 매칭 실패·캐시 없음 null.
  measure: AirMeasureItem.nullable(),
});
export type AirNearbyStationItemType = z.infer<typeof AirNearbyStationItem>;

export const AirNearbyResult = z.object({
  center: z.object({ lat: z.number(), lng: z.number() }),
  items: z.array(AirNearbyStationItem),
  // 반경 내 전체 건수(절단 전).
  total: z.number().int().min(0),
  fetchedAt: z.string(),
  stale: z.boolean(),
});
export type AirNearbyResultType = z.infer<typeof AirNearbyResult>;

export const AirStationSearchQuery = z.object({
  // 측정소명/주소 부분일치(NFC 정규화). 1~30자.
  q: z
    .string()
    .trim()
    .transform((v) => v.normalize('NFC'))
    .refine((v) => v.length >= 1 && v.length <= 30, {
      message: '검색어는 1자 이상 30자 이하여야 합니다.',
    }),
});
export type AirStationSearchQueryType = z.infer<typeof AirStationSearchQuery>;

export const AirStationSearchResult = z.object({
  q: z.string(),
  // 상위 30건으로 절단. total 은 절단 전 건수.
  items: z.array(AirStationInfoItem),
  total: z.number().int().min(0),
  fetchedAt: z.string(),
  stale: z.boolean(),
});
export type AirStationSearchResultType = z.infer<typeof AirStationSearchResult>;

// ── 내 대기 위치(저장 지점) ──────────────────────────────────────────────
// 사용자가 지정·저장한 좌표 1곳. 상단바 칩이 이 좌표로 가장 가까운 측정소의 현재 등급을
// 보여준다(해석은 /air/stations/nearby?limit=1). 로그인은 서버(PUT/GET/DELETE, 소유자
// 스코프), 게스트는 클라이언트 persist — 로그인 직후 서버가 비어 있으면 게스트 값을 올린다.
export const AIR_LOCATION_SOURCES = ['geolocation', 'manual'] as const;
export const AirLocationSource = z.enum(AIR_LOCATION_SOURCES);
export type AirLocationSourceType = z.infer<typeof AirLocationSource>;

export const AirLocationUpsertBody = z.object({
  lat: z.number().min(33).max(39),
  lng: z.number().min(124).max(132),
  // 표시용 라벨(저장 시점의 가까운 측정소명 등). 없으면 null.
  label: z.string().trim().max(40).nullable().default(null),
  // geolocation = '내 위치로 찾기' 결과 / manual = 지도에서 직접 지정.
  source: AirLocationSource,
});
export type AirLocationUpsertBodyType = z.infer<typeof AirLocationUpsertBody>;

export const AirLocationItem = AirLocationUpsertBody.extend({
  // 저장(갱신) 시각 ISO — 게스트 저장분도 같은 형태.
  updatedAt: z.string(),
});
export type AirLocationItemType = z.infer<typeof AirLocationItem>;

// GET/PUT/DELETE 응답 — 변경 후 상태(삭제면 null). 클라이언트가 캐시를 통째로 교체.
export const AirLocationResult = z.object({
  location: AirLocationItem.nullable(),
});
export type AirLocationResultType = z.infer<typeof AirLocationResult>;

export const AirWeeklyForecastResult = z.object({
  // 발표일 "YYYY-MM-DD" — 조회 일자들에 발표분이 없으면 null(days 빈 배열).
  presentedAt: z.string().nullable(),
  // 대기질 전망 원문(gwthcnd).
  outlook: z.string().nullable(),
  // D+3 ~ D+6 (frcstOne~Four), 날짜 오름차순.
  days: z.array(AirWeeklyDay),
  fetchedAt: z.string(),
  stale: z.boolean(),
});
export type AirWeeklyForecastResultType = z.infer<typeof AirWeeklyForecastResult>;
