import { z } from 'zod';

// 서울시 버스 정류장 검색 — friendly 가 ws.bus.go.kr(getStationByName) 을
// 프록시하고 결과를 DB 에 장기 캐싱(TTL 30일)한다. 일 1,000건(개발계정) 한도
// 보호를 위해 클라이언트는 제출형 검색(Enter/버튼)만 사용한다.

export const BusStationSearchQuery = z.object({
  // NFC 정규화 후 길이 검증 — min(2) 를 먼저 걸면 NFD '가'(코드유닛 2) 가
  // 통과한 뒤 1글자로 업스트림에 도달한다. 이 스키마가 1차 방어이며 서비스의
  // normalize 는 라우트 밖 호출자 대비 이중 방어.
  q: z
    .string()
    .trim()
    .transform((v) => v.normalize('NFC'))
    .refine((v) => v.length >= 2 && v.length <= 50, {
      message: '검색어는 2자 이상 50자 이하여야 합니다.',
    }),
  // true = 캐시 무시하고 서울시 API 재호출(사용자 강제 재요청 버튼).
  // 단 서버가 60초 내 재요청은 캐시로 응답한다(한도 남용 가드).
  // z.coerce.boolean() 은 'false' 문자열도 true 가 되므로 union+transform.
  force: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .default(false)
    .transform((v) => (typeof v === 'string' ? v === 'true' : v)),
});
export type BusStationSearchQueryType = z.infer<typeof BusStationSearchQuery>;

export const BusStationItem = z.object({
  // 서울시 9자리 정류소 고유 ID — PK. arsId 가 '0' 인 가상정류장이 여럿이라
  // arsId 는 식별자로 못 쓴다.
  stId: z.string().min(1),
  // 5자리 정류소번호(승차대 표지판 번호). '0' = 가상정류장 — 도착정보 조회
  // 불가, FE 는 arsId === '0' 으로 판별해 번호 배지를 숨긴다.
  arsId: z.string(),
  name: z.string(),
  // 항상 WGS84 로 정규화해 내려준다 — 원본이 GRS80 TM 이어도 서버가 변환.
  // 한국 범위 검증으로 이 계약을 코드로 강제(TM 값이 새면 직렬화에서 실패).
  lat: z.number().min(33).max(39),
  lng: z.number().min(124).max(132),
});
export type BusStationItemType = z.infer<typeof BusStationItem>;

export const BusStationSearchResult = z.object({
  // 상한 100건으로 절단된 목록. total 과 다르면 FE 가 '일부만 표시' 안내.
  items: z.array(BusStationItem),
  // 절단 전 원본 건수.
  total: z.number().int().min(0),
  // 서울시 원본을 수집한 시각 (ISO) — '마지막 갱신' 표시용.
  fetchedAt: z.string(),
  // cache = TTL 내 DB 응답 / api = 방금 서울시 호출 / stale = API 실패로
  // 만료된 캐시라도 반환(가용성 우선).
  source: z.enum(['cache', 'api', 'stale']),
});
export type BusStationSearchResultType = z.infer<typeof BusStationSearchResult>;

// ── 2차: 실시간 도착정보 / 버스 위치 ──────────────────────────────────────
// 둘 다 캐싱 없는 실시간 프록시(getStationByUid / getBusPosByRouteSt).
// 폴링은 화면 활성 + 패널 열림일 때만 — 일 1,000건 한도가 최대 제약이라
// 서버의 일일 쿼터 카운터를 검색과 공유한다.

export const BusArrivalsParams = z.object({
  // 5자리 정류소번호. '0'(가상정류장, "(미정차)")은 도착정보 조회가 불가능해
  // 라우트가 400 으로 거절 — FE 는 목록에서 미리 비활성 처리한다.
  arsId: z
    .string()
    .regex(/^\d{1,5}$/)
    .refine((v) => v !== '0', { message: '가상정류장은 도착정보를 제공하지 않습니다.' }),
});
export type BusArrivalsParamsType = z.infer<typeof BusArrivalsParams>;

export const BusArrivalEntry = z.object({
  // 도착예정 차량 ID — 업스트림 vehId '0'(도착예정 없음)은 null 로 정규화.
  // 이 값이 있으면 위치 API 의 차량 단건 추적(vehId) 입력으로 쓸 수 있다.
  vehId: z.string().nullable(),
  // 도착예정 메시지 원문 — "곧 도착", "12분후[4번째 전]", "운행종료" 등.
  message: z.string(),
});
export type BusArrivalEntryType = z.infer<typeof BusArrivalEntry>;

export const BusArrivalItem = z.object({
  busRouteId: z.string().min(1),
  // rtNm — 노선 번호 표기('141', '6411', 'N61').
  routeName: z.string(),
  // 이 정류장의 노선 내 순번 — 버스 위치 구간 조회(startOrd/endOrd)의 입력.
  // null 이면 위치 조회 불가(FE 가 해당 노선의 지도 표시를 비활성).
  staOrd: z.number().int().min(1).nullable(),
  // 1·2번째 도착예정 — 메시지 자체가 없으면 null.
  first: BusArrivalEntry.nullable(),
  second: BusArrivalEntry.nullable(),
});
export type BusArrivalItemType = z.infer<typeof BusArrivalItem>;

export const BusArrivalsResult = z.object({
  arsId: z.string(),
  items: z.array(BusArrivalItem),
  // 서울시 호출 시각 (ISO).
  fetchedAt: z.string(),
});
export type BusArrivalsResultType = z.infer<typeof BusArrivalsResult>;

// ── 3차: 좌표 기반 주변 정류장 (getStationByPos) ──────────────────────────
// probe 실측(2026-07-04): 파라미터 tmX(경도)/tmY(위도)에 WGS84 를 그대로 수용,
// radius 는 미터. 응답 필드는 검색과 다름 — stationId(=stId 와 동일 ID 공간)/
// stationNm/gpsX·gpsY(WGS84)/dist(m). 서버는 셀(0.005°≈550m) 단위 DB 30일
// 캐시 + 일일 쿼터 공유 — 지도 자동 조회(패닝 재조회)를 감당한다. dist 는
// 셀 캐시와 무관하게 쿼리 지점 기준으로 서버가 재계산해 내려준다.

export const BusNearbyQuery = z.object({
  // WGS84 한국 범위 강제 — 범위 밖 좌표는 서울시 API 를 때리기 전에 400.
  lat: z.coerce.number().min(33).max(39),
  lng: z.coerce.number().min(124).max(132),
  // 반경(m). 상한 1000 — 노선 전체를 훑는 남용 방지, 기본 500.
  radius: z.coerce.number().int().min(50).max(1000).default(500),
});
export type BusNearbyQueryType = z.infer<typeof BusNearbyQuery>;

export const BusNearbyItem = BusStationItem.extend({
  // 요청 좌표로부터의 거리(m) — 서울시가 계산해 내려주며 오름차순 정렬 계약.
  dist: z.number().int().min(0),
});
export type BusNearbyItemType = z.infer<typeof BusNearbyItem>;

export const BusNearbyResult = z.object({
  items: z.array(BusNearbyItem),
  total: z.number().int().min(0),
  fetchedAt: z.string(),
  // cache = 셀 TTL 내 DB 응답 / api = 방금 셀 수집 / stale = 수집 실패(쿼터
  // 소진 포함)로 만료 셀 반환. 검색과 동일 의미.
  source: z.enum(['cache', 'api', 'stale']),
});
export type BusNearbyResultType = z.infer<typeof BusNearbyResult>;

export const BusPositionsParams = z.object({
  busRouteId: z.string().regex(/^\d+$/),
});
export type BusPositionsParamsType = z.infer<typeof BusPositionsParams>;

export const BusPositionsQuery = z
  .object({
    startOrd: z.coerce.number().int().min(1),
    endOrd: z.coerce.number().int().min(1),
  })
  .refine((v) => v.endOrd >= v.startOrd, {
    message: 'endOrd 는 startOrd 이상이어야 합니다.',
  })
  // 구간 상한 — 노선 전체를 훑는 남용 방지(정류장 접근 구간 조회 용도).
  .refine((v) => v.endOrd - v.startOrd <= 50, {
    message: '조회 구간은 50 정류장 이하여야 합니다.',
  });
export type BusPositionsQueryType = z.infer<typeof BusPositionsQuery>;

export const BusPositionItem = z.object({
  vehId: z.string().min(1),
  // 차량번호판 ('서울74사6531') — getBusPosByRouteSt 응답엔 없을 수 있어 nullable.
  plainNo: z.string().nullable(),
  // 검색과 동일한 WGS84 정규화 계약 (서울시는 tmX/tmY 필드에 WGS84 를 준다).
  lat: z.number().min(33).max(39),
  lng: z.number().min(124).max(132),
  // 현재 구간 순번 — 정류장 staOrd 와 비교해 '몇 정류장 전'인지 계산 가능.
  sectOrd: z.number().int().nullable(),
  // '1' = 정류소 정차 중, '0' = 주행 중 (서울시 원문 보존).
  stopFlag: z.string().nullable(),
});
export type BusPositionItemType = z.infer<typeof BusPositionItem>;

export const BusPositionsResult = z.object({
  busRouteId: z.string(),
  items: z.array(BusPositionItem),
  fetchedAt: z.string(),
});
export type BusPositionsResultType = z.infer<typeof BusPositionsResult>;
