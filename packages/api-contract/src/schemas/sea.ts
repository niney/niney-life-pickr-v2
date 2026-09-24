import { z } from 'zod';

// 바다(/sea) — 국립해양조사원 생활해양예보지수 6종(data.go.kr 15142484 해수욕·15142490 서핑·15142486 바다낚시·
// 15142489 갯벌체험·15142485 바다갈라짐·15142491 바다여행, 7일 오전/오후 5단계) + 조석예보(고·저조, 15156018) +
// 이안류 지수(15156028, 6~9월). friendly 가 활동별 전량을 받아 캐시하고, 활동마다 다른 원문 필드를 한 슬롯
// 모양(없는 값은 null)으로 정규화한다. 캐시성 응답 공통: fetchedAt(수집 시각 ISO) + stale(업스트림 실패로
// last-known 서빙).

export const SeaActivity = z.enum(['beach', 'surf', 'fishing', 'mudflat', 'seaSplit', 'seaTrip']);
export type SeaActivityType = z.infer<typeof SeaActivity>;

export const SeaForecastQuery = z.object({ activity: SeaActivity });
export type SeaForecastQueryType = z.infer<typeof SeaForecastQuery>;

// 세부 구분별 지수 — 바다낚시 대상 어종, 서핑 등급(초급·중급·상급). 같은 지점·날짜·시간대의 파고·수온 등은
// 세부마다 같아 슬롯에 한 번만 싣고 지수만 여기(바다낚시 원문 1,750행 → 슬롯 ~700개).
export const SeaVariant = z.object({
  name: z.string(),
  level: z.number().int().min(0).max(5).nullable(),
  label: z.string().nullable(),
});
export type SeaVariantType = z.infer<typeof SeaVariant>;

// 한 지점의 한 날짜·시간대 예보. level: 1 매우나쁨 ~ 5 매우좋음, 0 체험불가, null 모름(원문 라벨은 label).
// 세부가 있으면 level/label 은 세부 중 가장 좋은 값(지도 색·목록 정렬용).
export const SeaSlot = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  // 오전/오후 — 하루 한 번 예보는 null(갯벌·바다갈라짐 전부, 해수욕·바다여행은 D+3 이후 원문 '일').
  period: z.enum(['am', 'pm']).nullable(),
  // 세부별 지수(원문 순) — 바다낚시·서핑만, 나머지는 빈 배열.
  variants: z.array(SeaVariant),
  level: z.number().int().min(0).max(5).nullable(),
  label: z.string().nullable(),
  // 파고(m, 최대 또는 평균)·파주기(s)·수온·기온(℃)·풍속(m/s)·유속(m/s) — 활동마다 있는 것만.
  waveM: z.number().nullable(),
  wavePeriodS: z.number().nullable(),
  waterTempC: z.number().nullable(),
  airTempC: z.number().nullable(),
  windMs: z.number().nullable(),
  currentMs: z.number().nullable(),
  // 물때(예: '중조기')·날씨(예: '맑음')·개장 여부(해수욕 '개장'|'폐장') 원문.
  tidePhase: z.string().nullable(),
  weather: z.string().nullable(),
  openStatus: z.string().nullable(),
  // 체험·갈라짐 시작/종료 'HH:MM'(갯벌·바다갈라짐).
  timeFrom: z.string().nullable(),
  timeTo: z.string().nullable(),
});
export type SeaSlotType = z.infer<typeof SeaSlot>;

// 이안류 최신 관측(해수욕장 10곳, 6~9월) — 4단계(1 관심 ~ 4 위험).
export const SeaRip = z.object({
  code: z.string(),
  level: z.number().int().min(1).max(4).nullable(),
  label: z.string().nullable(),
  observedAt: z.string(),
  waveM: z.number().nullable(),
});
export type SeaRipType = z.infer<typeof SeaRip>;

export const SeaSpot = z.object({
  // 활동 안에서 유일 — 원문 지점명(좌표가 다른 동명 지점이 있으면 좌표 접미).
  id: z.string(),
  name: z.string(),
  lat: z.number(),
  lng: z.number(),
  slots: z.array(SeaSlot),
  // 해수욕만 — 이안류 대상 해수욕장이고 제공 기간이면.
  rip: SeaRip.nullable(),
});
export type SeaSpotType = z.infer<typeof SeaSpot>;

export const SeaForecastResult = z.object({
  activity: SeaActivity,
  // 예보에 들어 있는 날짜(오름차순).
  dates: z.array(z.string()),
  spots: z.array(SeaSpot),
  fetchedAt: z.string(),
  stale: z.boolean(),
});
export type SeaForecastResultType = z.infer<typeof SeaForecastResult>;

// ── 조석(물때) ──────────────────────────────────────────────────────────────
export const SeaTideQuery = z.object({
  lat: z.coerce.number().min(32).max(39),
  lng: z.coerce.number().min(124).max(132),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type SeaTideQueryType = z.infer<typeof SeaTideQuery>;

export const SeaTideExtreme = z.object({
  // 'HH:MM'(KST).
  time: z.string(),
  kind: z.enum(['high', 'low']),
  // 예측 조위(cm).
  levelCm: z.number().nullable(),
});
export type SeaTideExtremeType = z.infer<typeof SeaTideExtreme>;

export const SeaTideResult = z.object({
  station: z.object({ code: z.string(), name: z.string(), lat: z.number(), lng: z.number(), distM: z.number().int() }),
  date: z.string(),
  extremes: z.array(SeaTideExtreme),
  fetchedAt: z.string(),
  stale: z.boolean(),
});
export type SeaTideResultType = z.infer<typeof SeaTideResult>;
