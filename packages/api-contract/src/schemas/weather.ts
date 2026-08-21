import { z } from 'zod';

// 기상청 날씨 — 단기예보 조회서비스(VilageFcstInfoService_2.0, data.go.kr 15084084:
// 초단기실황·초단기예보·단기예보·예보버전) + 중기예보 조회서비스(MidFcstInfoService,
// 15059468: 중기전망·중기육상·중기기온·중기해상). friendly 가 8개 오퍼레이션을 프록시한다.
// 업스트림은 (category, fcstDate, fcstTime, fcstValue) 의 세로 행 묶음이고 값이 전부
// 문자열(강수량은 "1mm 미만" 같은 범주)이라, 여기서는 시각별로 가로로 접고 숫자를 정규화한
// 형태만 계약한다(접기·정규화는 서비스 책임). 캐시성 응답 공통: fetchedAt(수집 시각 ISO)
// + stale(업스트림 실패로 last-known 서빙) + base(사용한 발표 기준 시각).

// 단기예보 격자(5km LCC) — nx 1~149, ny 1~253. 위·경도 → 격자 변환은 @repo/utils.
export const WeatherGridQuery = z.object({
  nx: z.coerce.number().int().min(1).max(149),
  ny: z.coerce.number().int().min(1).max(253),
});
export type WeatherGridQueryType = z.infer<typeof WeatherGridQuery>;

// 발표 기준 시각 — base_date "YYYYMMDD" + base_time "HHMM", ISO(+09:00).
export const WeatherBase = z.object({
  date: z.string().regex(/^\d{8}$/),
  time: z.string().regex(/^\d{4}$/),
  at: z.string(),
});
export type WeatherBaseType = z.infer<typeof WeatherBase>;

// 강수량/적설 — 업스트림 범주 문자열 원문 + 대표 수치.
export const WeatherPrecip = z.object({
  text: z.string(),
  value: z.number().nullable(),
  none: z.boolean(),
});
export type WeatherPrecipType = z.infer<typeof WeatherPrecip>;

// ── 초단기실황 + 초단기예보 (getUltraSrtNcst + getUltraSrtFcst) ────────────
// 실황(정시 관측 8항목) 과 앞으로 6시간 예보(11항목) 를 한 응답에 — "지금" 카드가 둘을
// 같이 쓴다. 두 오퍼레이션은 발표 시각이 다르므로 base 를 각각 싣는다.
export const WeatherNowcastNow = z.object({
  // 기온 ℃ / 1시간 강수량 mm / 습도 % / 강수형태 코드 / 풍향 deg / 풍속 m/s / 동서·남북 성분.
  t1h: z.number().nullable(),
  rn1: z.number().nullable(),
  reh: z.number().nullable(),
  pty: z.number().int().nullable(),
  vec: z.number().nullable(),
  wsd: z.number().nullable(),
  uuu: z.number().nullable(),
  vvv: z.number().nullable(),
});
export type WeatherNowcastNowType = z.infer<typeof WeatherNowcastNow>;

export const WeatherUltraHour = z.object({
  fcstDate: z.string().regex(/^\d{8}$/),
  fcstTime: z.string().regex(/^\d{4}$/),
  at: z.string(),
  t1h: z.number().nullable(),
  // 초단기예보 RN1 은 범주 문자열("강수없음"/"1mm 미만"/…) — 실황과 달리 수치가 아니다.
  rn1: WeatherPrecip,
  sky: z.number().int().nullable(),
  pty: z.number().int().nullable(),
  pop: z.number().nullable(),
  reh: z.number().nullable(),
  wsd: z.number().nullable(),
  vec: z.number().nullable(),
  uuu: z.number().nullable(),
  vvv: z.number().nullable(),
  // 낙뢰 kA — 0 은 없음.
  lgt: z.number().nullable(),
});
export type WeatherUltraHourType = z.infer<typeof WeatherUltraHour>;

export const WeatherNowcastResult = z.object({
  grid: z.object({ nx: z.number().int(), ny: z.number().int() }),
  // 실황 발표 기준(정시) — 관측 시각이기도 하다.
  ncstBase: WeatherBase.nullable(),
  now: WeatherNowcastNow.nullable(),
  // 초단기예보 발표 기준(HH:30) + 시각 오름차순 6시간.
  ultraBase: WeatherBase.nullable(),
  hours: z.array(WeatherUltraHour),
  // 최신 슬롯이 아직 없어 한 슬롯 이전 발표분을 쓴 경우 true(실황/예보 각각).
  ncstFallback: z.boolean(),
  ultraFallback: z.boolean(),
  fetchedAt: z.string(),
  stale: z.boolean(),
});
export type WeatherNowcastResultType = z.infer<typeof WeatherNowcastResult>;

// ── 단기예보 (getVilageFcst) ───────────────────────────────────────────────────
export const WeatherForecastHour = z.object({
  fcstDate: z.string().regex(/^\d{8}$/),
  fcstTime: z.string().regex(/^\d{4}$/),
  at: z.string(),
  // 1시간 기온 ℃ (TMP). 일 최저/최고(TMN/TMX)는 해당 시각 행(06시/15시)에만 실린다.
  tmp: z.number().nullable(),
  tmn: z.number().nullable(),
  tmx: z.number().nullable(),
  sky: z.number().int().nullable(),
  pty: z.number().int().nullable(),
  pop: z.number().nullable(),
  pcp: WeatherPrecip,
  sno: WeatherPrecip,
  reh: z.number().nullable(),
  wsd: z.number().nullable(),
  vec: z.number().nullable(),
  uuu: z.number().nullable(),
  vvv: z.number().nullable(),
  // 파고 m (내륙 0).
  wav: z.number().nullable(),
});
export type WeatherForecastHourType = z.infer<typeof WeatherForecastHour>;

// 반나절 요약 — 오전(00~12시)/오후(12~24시). 대표 하늘/강수는 강수 우선, 그다음 흐린 쪽.
export const WeatherHalfDay = z.object({
  sky: z.number().int().nullable(),
  pty: z.number().int().nullable(),
  // 그 반나절 최대 강수확률.
  pop: z.number().nullable(),
  hours: z.number().int().min(0),
});
export type WeatherHalfDayType = z.infer<typeof WeatherHalfDay>;

export const WeatherForecastDay = z.object({
  // "YYYY-MM-DD"
  date: z.string(),
  // 업스트림 TMN/TMX 가 있으면 그 값, 없으면(오늘 등) 남은 시각 TMP 의 최저/최고.
  tmn: z.number().nullable(),
  tmx: z.number().nullable(),
  // TMN/TMX 가 업스트림 일 최저/최고(정식)인지, TMP 에서 유도한 근사인지.
  tmnFromHours: z.boolean(),
  tmxFromHours: z.boolean(),
  popMax: z.number().nullable(),
  am: WeatherHalfDay.nullable(),
  pm: WeatherHalfDay.nullable(),
  // 이 날짜가 24시간을 다 덮지 못하면(오늘 남은 시각만, 마지막 날 00시만) true.
  partial: z.boolean(),
  hours: z.number().int().min(0),
});
export type WeatherForecastDayType = z.infer<typeof WeatherForecastDay>;

export const WeatherForecastResult = z.object({
  grid: z.object({ nx: z.number().int(), ny: z.number().int() }),
  base: WeatherBase.nullable(),
  fallback: z.boolean(),
  // 시각 오름차순(발표 +1시간 ~ +3일 24시).
  hours: z.array(WeatherForecastHour),
  // 날짜 오름차순 일별 요약.
  days: z.array(WeatherForecastDay),
  total: z.number().int().min(0),
  fetchedAt: z.string(),
  stale: z.boolean(),
});
export type WeatherForecastResultType = z.infer<typeof WeatherForecastResult>;

// ── 예보 버전 (getFcstVersion) ─────────────────────────────────────────────────
export const WEATHER_FCST_FILE_TYPES = ['ODAM', 'VSRT', 'SHRT'] as const;
export const WeatherFcstFileType = z.enum(WEATHER_FCST_FILE_TYPES);
export type WeatherFcstFileTypeType = z.infer<typeof WeatherFcstFileType>;

export const WeatherVersionItem = z.object({
  // ODAM 초단기실황 / VSRT 초단기예보 / SHRT 단기예보.
  ftype: WeatherFcstFileType,
  label: z.string(),
  // 조회에 쓴 발표 기준(basedatetime).
  base: WeatherBase,
  // 업스트림 version 원문("YYYYMMDDHHmmss") 과 ISO.
  version: z.string().nullable(),
  versionAt: z.string().nullable(),
});
export type WeatherVersionItemType = z.infer<typeof WeatherVersionItem>;

export const WeatherVersionsResult = z.object({
  items: z.array(WeatherVersionItem),
  fetchedAt: z.string(),
  stale: z.boolean(),
});
export type WeatherVersionsResultType = z.infer<typeof WeatherVersionsResult>;

// ── 중기예보 (getMidLandFcst + getMidTa + getMidFcst) ───────────────────────────
// 2026 현재 업스트림은 발표일 +4일(D+4)부터 +10일까지를 준다(D+3 까지는 단기예보가
// 담당). D+4~D+7 은 오전/오후, D+8~D+10 은 하루 한 값.
const REG_ID = z.string().regex(/^\d{2}[A-Z]\d{5}$/);
const STN_ID = z.string().regex(/^\d{3}$/);

export const WeatherMidQuery = z.object({
  // 중기육상예보 구역(11B00000 서울·인천·경기 …).
  land: REG_ID,
  // 중기기온 지점(11B10101 서울 …).
  ta: REG_ID,
  // 중기전망 지점번호(108 전국, 109 서울·인천·경기 …). 생략 시 전망 제외.
  stn: STN_ID.optional(),
});
export type WeatherMidQueryType = z.infer<typeof WeatherMidQuery>;

export const WeatherMidHalf = z.object({
  // 날씨 문구 원문("구름많음", "흐리고 비" …).
  wf: z.string().nullable(),
  // 강수확률 %.
  rnSt: z.number().nullable(),
});
export type WeatherMidHalfType = z.infer<typeof WeatherMidHalf>;

export const WeatherMidLandDay = z.object({
  // 발표일 기준 +n 일(4~10).
  day: z.number().int().min(3).max(10),
  date: z.string(),
  // D+4~D+7: am/pm, D+8~D+10: all.
  am: WeatherMidHalf.nullable(),
  pm: WeatherMidHalf.nullable(),
  all: WeatherMidHalf.nullable(),
});
export type WeatherMidLandDayType = z.infer<typeof WeatherMidLandDay>;

export const WeatherMidTaDay = z.object({
  day: z.number().int().min(3).max(10),
  date: z.string(),
  taMin: z.number().nullable(),
  // 예측 오차 범위(taMinLow/High = 최저기온 하한/상한 편차).
  taMinLow: z.number().nullable(),
  taMinHigh: z.number().nullable(),
  taMax: z.number().nullable(),
  taMaxLow: z.number().nullable(),
  taMaxHigh: z.number().nullable(),
});
export type WeatherMidTaDayType = z.infer<typeof WeatherMidTaDay>;

export const WeatherMidResult = z.object({
  // 발표 시각 "YYYYMMDDHHmm"(06:00/18:00) + ISO.
  tmFc: z.string(),
  announcedAt: z.string().nullable(),
  fallback: z.boolean(),
  land: z.object({ regId: z.string(), days: z.array(WeatherMidLandDay) }).nullable(),
  ta: z.object({ regId: z.string(), days: z.array(WeatherMidTaDay) }).nullable(),
  // 중기전망(wfSv 원문, 줄바꿈 포함).
  outlook: z.object({ stnId: z.string(), text: z.string() }).nullable(),
  fetchedAt: z.string(),
  stale: z.boolean(),
});
export type WeatherMidResultType = z.infer<typeof WeatherMidResult>;

// ── 중기해상예보 (getMidSeaFcst) ───────────────────────────────────────────────
export const WeatherMidSeaQuery = z.object({
  regId: REG_ID,
});
export type WeatherMidSeaQueryType = z.infer<typeof WeatherMidSeaQuery>;

export const WeatherMidSeaHalf = z.object({
  wf: z.string().nullable(),
  // 파고 m — 최저(whA)/최고(whB).
  whMin: z.number().nullable(),
  whMax: z.number().nullable(),
});
export type WeatherMidSeaHalfType = z.infer<typeof WeatherMidSeaHalf>;

export const WeatherMidSeaDay = z.object({
  day: z.number().int().min(3).max(10),
  date: z.string(),
  am: WeatherMidSeaHalf.nullable(),
  pm: WeatherMidSeaHalf.nullable(),
  all: WeatherMidSeaHalf.nullable(),
});
export type WeatherMidSeaDayType = z.infer<typeof WeatherMidSeaDay>;

export const WeatherMidSeaResult = z.object({
  tmFc: z.string(),
  announcedAt: z.string().nullable(),
  fallback: z.boolean(),
  regId: z.string(),
  days: z.array(WeatherMidSeaDay),
  fetchedAt: z.string(),
  stale: z.boolean(),
});
export type WeatherMidSeaResultType = z.infer<typeof WeatherMidSeaResult>;
