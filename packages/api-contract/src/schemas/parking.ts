import { z } from 'zod';

// 주차(/parking) 공개 조회 계약 — 주차장(전국주차장정보표준데이터 15012896 + 서울 공영주차장, 로컬 DB)·전기차
// 충전소(환경공단 15076352, 로컬 DB + 상태 폴러)·공항 주차(한국공항공사·인천공항 실시간, 서버 폴러 메모리).
// 지도 조회는 일상지도와 같은 bbox+줌 규약 — 임계 줌 이상이면 점, 아니면 서버 집계 셀. 코드값은
// @repo/utils parking.ts 와 같은 목록(이 패키지는 utils 를 import 하지 않는다). docs/PLAN-parking.md

// "minLng,minLat,maxLng,maxLat" — 일상지도·집값과 같은 문자열 규약(@repo/utils formatBbox).
const BboxParam = z
  .string()
  .regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?$/, 'bbox must be "minLng,minLat,maxLng,maxLat"');

// 쿼리 불리언 — z.coerce.boolean 은 '0'/'false' 도 true 라 쓰지 않는다. 미지정=false(조건 없음).
const FlagParam = z
  .enum(['1', '0', 'true', 'false'])
  .optional()
  .transform((v) => v === '1' || v === 'true');

export const ParkingOwnership = z.enum(['public', 'private']);
export const ParkingLotType = z.enum(['street', 'offstreet', 'attached']);
export const ParkingFeeType = z.enum(['free', 'paid', 'mixed']);
export const ParkingSource = z.enum(['std', 'seoul', 'kotsa']);
export const ParkingLevel = z.enum(['free', 'normal', 'busy', 'full']);
export type ParkingLevelType = z.infer<typeof ParkingLevel>;
export const EvLevel = z.enum(['available', 'busy', 'offline']);
export type EvLevelType = z.infer<typeof EvLevel>;

// 집계 셀 — 셀 안 지점의 평균 좌표와 건수.
export const ParkingCell = z.object({
  lat: z.number(),
  lng: z.number(),
  count: z.number().int().min(1),
});
export type ParkingCellType = z.infer<typeof ParkingCell>;

// ── 실시간·이력 ──────────────────────────────────────────────────────────────
// 실시간 — 서버 폴러(5분)가 받은 최신 값. updatedAt 은 원천이 밝힌 갱신 시각(없으면 null), fetchedAt 은 폴링 시각.
export const ParkingLive = z.object({
  total: z.number().int().nullable(),
  occupied: z.number().int().nullable(),
  available: z.number().int().nullable(),
  level: ParkingLevel.nullable(),
  updatedAt: z.string().nullable(),
  fetchedAt: z.string(),
});
export type ParkingLiveType = z.infer<typeof ParkingLive>;

// 평소 혼잡도 — 5분 폴링을 (요일, 시) 칸에 누적한 평균 점유율. 표본이 모자란 시각은 occ null.
export const ParkingPatternHour = z.object({
  hour: z.number().int().min(0).max(23),
  occ: z.number().min(0).nullable(),
  // 만차(점유율 97% 이상) 표본 비율.
  fullRatio: z.number().min(0).max(1).nullable(),
  samples: z.number().int().min(0),
});
export const ParkingPattern = z.object({
  // KST 요일(0=일).
  dow: z.number().int().min(0).max(6),
  hours: z.array(ParkingPatternHour).length(24),
  // 칸 하나에 필요한 최소 표본 — 클라이언트 안내 문구용.
  minSamples: z.number().int().min(1),
});
export type ParkingPatternType = z.infer<typeof ParkingPattern>;

// ── 주차장 ──────────────────────────────────────────────────────────────────
const lotFilterFields = {
  // 공영만 / 무료만(요금 구분 무료) / 실시간 연계만.
  publicOnly: FlagParam,
  freeOnly: FlagParam,
  liveOnly: FlagParam,
} as const;

export const ParkingLotPointsQuery = z.object({
  bbox: BboxParam,
  // 지도 줌(소수 허용, 서버는 내림) — PARKING_POINT_MIN_ZOOM 이상이면 points.
  zoom: z.coerce.number().min(0).max(22),
  ...lotFilterFields,
});
export type ParkingLotPointsQueryType = z.infer<typeof ParkingLotPointsQuery>;

// 지도 점 — 최소 필드. level 은 실시간 단계(연계 없으면 null).
export const ParkingLotPoint = z.object({
  id: z.string(),
  lat: z.number(),
  lng: z.number(),
  name: z.string(),
  feeType: ParkingFeeType.nullable(),
  level: ParkingLevel.nullable(),
  available: z.number().int().nullable(),
});
export type ParkingLotPointType = z.infer<typeof ParkingLotPoint>;

export const ParkingLotPointsResult = z.object({
  mode: z.enum(['points', 'cells']),
  items: z.array(ParkingLotPoint),
  cells: z.array(ParkingCell),
  total: z.number().int().min(0),
  truncated: z.boolean(),
  minPointZoom: z.number().int().min(0).max(22),
  // 적재 시각(ParkingSync.loadedAt).
  fetchedAt: z.string(),
});
export type ParkingLotPointsResultType = z.infer<typeof ParkingLotPointsResult>;

// 하루 운영시간 'HH:MM'(24:00 허용). 둘 다 null 이거나 00:00~00:00 이면 정보 없음(@repo/utils parkingHoursKind).
const ParkingHoursOfDay = z.object({ open: z.string().nullable(), close: z.string().nullable() });

// 요금 — 분·원. null = 정보 없음. 계산은 @repo/utils estimateParkingFee.
export const ParkingFee = z.object({
  baseMin: z.number().int().nullable(),
  baseFee: z.number().int().nullable(),
  addMin: z.number().int().nullable(),
  addFee: z.number().int().nullable(),
  dayMaxFee: z.number().int().nullable(),
  dayPassFee: z.number().int().nullable(),
  monthlyFee: z.number().int().nullable(),
});
export type ParkingFeeRuleType = z.infer<typeof ParkingFee>;

export const ParkingLotItem = z.object({
  // 원천 접두 id — 'std:<관리번호>' | 'seoul:<주차장코드>'.
  id: z.string(),
  source: ParkingSource,
  name: z.string(),
  ownership: ParkingOwnership.nullable(),
  lotType: ParkingLotType.nullable(),
  feeType: ParkingFeeType.nullable(),
  roadAddr: z.string().nullable(),
  lotAddr: z.string().nullable(),
  phone: z.string().nullable(),
  orgName: z.string().nullable(),
  totalSpaces: z.number().int().nullable(),
  hours: z.object({ wd: ParkingHoursOfDay, sat: ParkingHoursOfDay, hol: ParkingHoursOfDay }),
  // 운영요일 원문(표준데이터 '평일+토요일+공휴일').
  operDays: z.string().nullable(),
  fee: ParkingFee,
  // 서울 — 토요일·공휴일 무료 여부. 다른 원천은 null.
  satFree: z.boolean().nullable(),
  holFree: z.boolean().nullable(),
  payMethods: z.string().nullable(),
  note: z.string().nullable(),
  // 장애인전용주차구역 보유(표준데이터, 빈값 null).
  disabledZone: z.boolean().nullable(),
  // 좌표 — 원천 좌표가 없으면 주소 지오코딩, 그래도 실패면 null(지도 미표시).
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  geoSource: z.enum(['source', 'road', 'parcel']).nullable(),
  // 데이터기준일자 'YYYY-MM-DD'.
  baseDate: z.string().nullable(),
  live: ParkingLive.nullable(),
});
export type ParkingLotItemType = z.infer<typeof ParkingLotItem>;

export const ParkingLotDetail = ParkingLotItem.extend({
  // 실시간 연계 주차장의 오늘(KST 요일) 평소 혼잡도 — 연계 없거나 이력이 없으면 null.
  pattern: ParkingPattern.nullable(),
});
export type ParkingLotDetailType = z.infer<typeof ParkingLotDetail>;

export const ParkingLotDetailParams = z.object({ id: z.string().min(1).max(80) });

export const ParkingNearbyQuery = z.object({
  // WGS84 한국 범위 강제(일상지도 주변과 동일).
  lat: z.coerce.number().min(33).max(39),
  lng: z.coerce.number().min(124).max(132),
  radius: z.coerce.number().int().min(100).max(3000).default(1000),
  limit: z.coerce.number().int().min(1).max(30).default(15),
  ...lotFilterFields,
});
export type ParkingNearbyQueryType = z.infer<typeof ParkingNearbyQuery>;

export const ParkingLotNearbyItem = ParkingLotItem.extend({ dist: z.number().int().min(0) });
export type ParkingLotNearbyItemType = z.infer<typeof ParkingLotNearbyItem>;

export const ParkingLotNearbyResult = z.object({
  center: z.object({ lat: z.number(), lng: z.number() }),
  items: z.array(ParkingLotNearbyItem),
  total: z.number().int().min(0),
  fetchedAt: z.string(),
});
export type ParkingLotNearbyResultType = z.infer<typeof ParkingLotNearbyResult>;

// ── 전기차 충전소 ────────────────────────────────────────────────────────────
const evFilterFields = {
  // 급속(30kW 이상) 충전기가 있는 곳만 / 주차료 무료만 / 지금 사용 가능 1기 이상만 / 이용자 제한 없는 곳만.
  fastOnly: FlagParam,
  freeParkingOnly: FlagParam,
  availableOnly: FlagParam,
  openOnly: FlagParam,
} as const;

export const EvPointsQuery = z.object({
  bbox: BboxParam,
  zoom: z.coerce.number().min(0).max(22),
  ...evFilterFields,
});
export type EvPointsQueryType = z.infer<typeof EvPointsQuery>;

export const EvPoint = z.object({
  id: z.string(),
  lat: z.number(),
  lng: z.number(),
  name: z.string(),
  level: EvLevel,
  fast: z.boolean(),
});
export type EvPointType = z.infer<typeof EvPoint>;

export const EvPointsResult = z.object({
  mode: z.enum(['points', 'cells']),
  items: z.array(EvPoint),
  cells: z.array(ParkingCell),
  total: z.number().int().min(0),
  truncated: z.boolean(),
  minPointZoom: z.number().int().min(0).max(22),
  fetchedAt: z.string(),
  // 충전기 상태를 마지막으로 반영한 시각(폴러). 폴링 전이면 null.
  statusAt: z.string().nullable(),
});
export type EvPointsResultType = z.infer<typeof EvPointsResult>;

export const EvChargerItem = z.object({
  id: z.string(),
  // 충전기 타입 코드(01~11, @repo/utils EV_CHARGER_TYPE_LABEL).
  type: z.string(),
  outputKw: z.number().nullable(),
  method: z.string().nullable(),
  fast: z.boolean(),
  // 상태 코드(0 알수없음·1 통신이상·2 사용가능·3 충전중·4 운영중지·5 점검중·6 예약중·9 미확인).
  stat: z.number().int(),
  statUpdatedAt: z.string().nullable(),
  lastChargeEndAt: z.string().nullable(),
  chargingSince: z.string().nullable(),
});
export type EvChargerItemType = z.infer<typeof EvChargerItem>;

export const EvStationItem = z.object({
  // 충전소 ID(statId).
  id: z.string(),
  name: z.string(),
  addr: z.string().nullable(),
  addrDetail: z.string().nullable(),
  location: z.string().nullable(),
  lat: z.number(),
  lng: z.number(),
  useTime: z.string().nullable(),
  operator: z.string().nullable(),
  operatorCall: z.string().nullable(),
  // 주차료 무료(Y) / 유료(N) / 모름(null — 현장 확인).
  parkingFree: z.boolean().nullable(),
  // 이용자 제한(Y) — 사유는 limitDetail.
  limited: z.boolean().nullable(),
  limitDetail: z.string().nullable(),
  note: z.string().nullable(),
  // 충전소 구분 코드(A0~J0)·상세(B001 공영주차장 …)와 표시명.
  kind: z.string().nullable(),
  kindDetail: z.string().nullable(),
  kindLabel: z.string().nullable(),
  // 지상/지하 구분(F/B)·층.
  floorType: z.string().nullable(),
  floorNum: z.string().nullable(),
  chargerCount: z.number().int().min(0),
  fastCount: z.number().int().min(0),
  availableCount: z.number().int().min(0),
  chargingCount: z.number().int().min(0),
  level: EvLevel,
});
export type EvStationItemType = z.infer<typeof EvStationItem>;

export const EvStationDetail = EvStationItem.extend({
  chargers: z.array(EvChargerItem),
  statusAt: z.string().nullable(),
});
export type EvStationDetailType = z.infer<typeof EvStationDetail>;

export const EvStationDetailParams = z.object({ id: z.string().min(1).max(40) });

export const EvNearbyQuery = z.object({
  lat: z.coerce.number().min(33).max(39),
  lng: z.coerce.number().min(124).max(132),
  radius: z.coerce.number().int().min(100).max(3000).default(1000),
  limit: z.coerce.number().int().min(1).max(30).default(15),
  ...evFilterFields,
});
export type EvNearbyQueryType = z.infer<typeof EvNearbyQuery>;

export const EvStationNearbyItem = EvStationItem.extend({ dist: z.number().int().min(0) });
export type EvStationNearbyItemType = z.infer<typeof EvStationNearbyItem>;

export const EvNearbyResult = z.object({
  center: z.object({ lat: z.number(), lng: z.number() }),
  items: z.array(EvStationNearbyItem),
  total: z.number().int().min(0),
  fetchedAt: z.string(),
  statusAt: z.string().nullable(),
});
export type EvNearbyResultType = z.infer<typeof EvNearbyResult>;

// ── 공항 주차 ────────────────────────────────────────────────────────────────
export const ParkingAirportLot = z.object({
  name: z.string(),
  total: z.number().int().nullable(),
  occupied: z.number().int().nullable(),
  // 점유율(0~, 초과 주차면 1 초과).
  rate: z.number().min(0).nullable(),
  level: ParkingLevel.nullable(),
  updatedAt: z.string().nullable(),
  // 지금 요일·시 평소 점유율(표본 부족이면 null).
  usualOcc: z.number().min(0).nullable(),
});
export type ParkingAirportLotType = z.infer<typeof ParkingAirportLot>;

export const ParkingAirport = z.object({
  // IATA 코드(@repo/utils PARKING_AIRPORTS).
  code: z.string(),
  name: z.string(),
  lat: z.number(),
  lng: z.number(),
  // 공항 전체(면수 있는 주차장 합) 점유 — 대표 단계.
  total: z.number().int().nullable(),
  occupied: z.number().int().nullable(),
  level: ParkingLevel.nullable(),
  lots: z.array(ParkingAirportLot),
});
export type ParkingAirportType = z.infer<typeof ParkingAirport>;

export const ParkingAirportsResult = z.object({
  airports: z.array(ParkingAirport),
  // 마지막 폴링 시각 — 아직 한 번도 못 받았으면 null.
  fetchedAt: z.string().nullable(),
  // 최근 폴링이 실패해 이전 값을 보여 주는 중.
  stale: z.boolean(),
});
export type ParkingAirportsResultType = z.infer<typeof ParkingAirportsResult>;

// ── 적재·실시간 상태 ─────────────────────────────────────────────────────────
export const ParkingStatusResult = z.object({
  lots: z.object({
    loaded: z.boolean(),
    count: z.number().int().min(0),
    bySource: z.object({ std: z.number().int().min(0), seoul: z.number().int().min(0), kotsa: z.number().int().min(0) }),
    // 좌표 확보 건수.
    geocoded: z.number().int().min(0),
    baseDate: z.string().nullable(),
    loadedAt: z.string().nullable(),
  }),
  ev: z.object({
    loaded: z.boolean(),
    stations: z.number().int().min(0),
    chargers: z.number().int().min(0),
    loadedAt: z.string().nullable(),
    statusAt: z.string().nullable(),
  }),
  live: z.object({
    // 실시간 값을 가진 주차장 수와 마지막 폴링 시각.
    lotCount: z.number().int().min(0),
    lotAt: z.string().nullable(),
    airportLotCount: z.number().int().min(0),
    airportAt: z.string().nullable(),
  }),
  fetchedAt: z.string(),
});
export type ParkingStatusResultType = z.infer<typeof ParkingStatusResult>;

// ── 맛집 주차 리뷰(가는 법 탭) ───────────────────────────────────────────────
// 분석된 리뷰의 '주차' 관점 극성 집계와 주차 관련 팁. 리뷰가 없으면 analyzed 0.
export const RestaurantParkingReviews = z.object({
  analyzed: z.number().int().min(0),
  aspect: z.object({
    pos: z.number().int().min(0),
    neg: z.number().int().min(0),
    neu: z.number().int().min(0),
  }),
  // 주차 관련 팁(예: '주차 협소') — 언급 많은 순, 최대 5.
  tips: z.array(z.object({ term: z.string(), count: z.number().int().min(1) })),
});
export type RestaurantParkingReviewsType = z.infer<typeof RestaurantParkingReviews>;
