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
