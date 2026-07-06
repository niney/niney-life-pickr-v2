import { z } from 'zod';

// 수도권 전철 역 검색 — 버스와 달리 friendly 가 역사마스터(~784행, 프로브 실측
// 2026-07-06)를 DB 에 전량 적재해 두고 로컬 조회한다. 업스트림 콜이 없어 쿼터
// 부담이 0 이므로 클라이언트는 라이브 검색(타이핑 즉시)을 쓴다.
//
// ID 설계 (프로브 verdict): 역사마스터의 BLDN_ID(4자리)는 실시간 API 의
// statnId(10자리)와 불일치 — 조인 키로 못 쓴다. 내부 stationId 는
// `${lineId}:${name}` 합성(플랜 B)이며, 실시간 조회는 역명 기반이라 이 ID 로
// 완결된다. lineId 는 실시간 subwayId(4자리) 체계를 그대로 쓴다.

export const SubwayStationSearchQuery = z.object({
  // NFC 정규화 후 길이 검증 — 로컬 DB 검색이라 1자부터 허용(버스는 쿼터 보호로
  // 2자였음). min 을 transform 앞에 걸면 NFD 1글자가 우회하므로 순서 유지.
  q: z
    .string()
    .trim()
    .transform((v) => v.normalize('NFC'))
    .refine((v) => v.length >= 1 && v.length <= 50, {
      message: '검색어는 1자 이상 50자 이하여야 합니다.',
    }),
});
export type SubwayStationSearchQueryType = z.infer<typeof SubwayStationSearchQuery>;

// 역×호선 1건 — 같은 물리 역이라도 호선마다 마스터 행(좌표 포함)이 따로 있다.
export const SubwayStationLineRef = z.object({
  // 내부 합성 ID `${lineId}:${name}` — 도착 조회 라우트(2차)의 path 파라미터.
  stationId: z.string().min(1),
  // 실시간 API subwayId 체계 ('1002'). 색/뱃지는 @repo/utils SUBWAY_LINES 매핑.
  lineId: z.string().regex(/^\d{4}$/),
  lineName: z.string(),
  // 역사마스터 LAT/LOT — WGS84 한국 범위 강제(버스와 동일 계약).
  lat: z.number().min(33).max(39),
  lng: z.number().min(124).max(132),
});
export type SubwayStationLineRefType = z.infer<typeof SubwayStationLineRef>;

// 역명 그룹 — 동일 역명 + 좌표 근접(≤1km)만 한 그룹(=환승역). 동명이역
// ('양평' 5호선/경의중앙선 등)은 좌표가 멀어 별개 그룹으로 내려간다.
export const SubwayStationGroupItem = z.object({
  // 그룹 대표 ID — lines[0].stationId (lineId 오름차순 첫 항목). URL(stn)과
  // 도착 조회의 입력.
  id: z.string().min(1),
  name: z.string(),
  // 그룹 대표 좌표 — 소속 호선 좌표의 산술 평균(환승역 마커 1개 지점).
  lat: z.number().min(33).max(39),
  lng: z.number().min(124).max(132),
  // lineId 오름차순. 2개 이상 = 환승역.
  lines: z.array(SubwayStationLineRef).min(1),
});
export type SubwayStationGroupItemType = z.infer<typeof SubwayStationGroupItem>;

export const SubwayStationSearchResult = z.object({
  // 그룹 단위 목록 — 상한 30그룹 절단. total 과 다르면 FE 가 '일부만 표시' 안내.
  items: z.array(SubwayStationGroupItem),
  // 절단 전 그룹 수.
  total: z.number().int().min(0),
  // 역사마스터를 적재한 시각 (ISO) — 캐시 아닌 마스터 기준일 표시용.
  fetchedAt: z.string(),
  // 로컬 DB 단일 소스 — 버스의 cache/api/stale 구분이 없음을 계약으로 명시.
  source: z.literal('db'),
});
export type SubwayStationSearchResultType = z.infer<typeof SubwayStationSearchResult>;

// ── 3차: 좌표 기반 주변 역 ───────────────────────────────────────────────────
// 로컬 마스터 조회(업스트림 0콜)라 버스의 셀 격자 캐시·쿼터 설계가 통째로 없다.
// dist 는 그룹 대표 좌표(소속 호선 평균) 기준으로 서버가 계산해 오름차순 정렬.

export const SubwayNearbyQuery = z.object({
  // WGS84 한국 범위 강제 — 범위 밖 좌표는 400.
  lat: z.coerce.number().min(33).max(39),
  lng: z.coerce.number().min(124).max(132),
  // 반경(m). 역 간격(도심 ~1km)이 버스 정류장보다 넓어 기본 1500, 상한 3000.
  radius: z.coerce.number().int().min(100).max(3000).default(1500),
});
export type SubwayNearbyQueryType = z.infer<typeof SubwayNearbyQuery>;

export const SubwayNearbyGroupItem = SubwayStationGroupItem.extend({
  // 요청 좌표 → 그룹 대표 좌표 거리(m) — 오름차순 정렬 계약.
  dist: z.number().int().min(0),
});
export type SubwayNearbyGroupItemType = z.infer<typeof SubwayNearbyGroupItem>;

export const SubwayNearbyResult = z.object({
  // dist 오름차순, 검색과 동일하게 30그룹 절단(total 과 다르면 '일부만 표시').
  items: z.array(SubwayNearbyGroupItem),
  total: z.number().int().min(0),
  // 역사마스터 적재 시각 (ISO) — 검색과 동일 의미.
  fetchedAt: z.string(),
  source: z.literal('db'),
});
export type SubwayNearbyResultType = z.infer<typeof SubwayNearbyResult>;

// ── 5차: 호선 보기 — 노선별 역 순서 + 근사 폴리라인 ─────────────────────────
// 지하철은 노선 형상 공공 API 가 없어 역 좌표를 운행 순서로 이은 근사 폴리라인을
// 쓴다(FE 가 sections[].stations 좌표로 그림 — 별도 path 배열 없음). 지선(2호선
// 성수/신정, 5호선 마천 등)은 section 으로 분리 — 단일 배열로 이으면 지도에서
// 지그재그가 된다. 순서 데이터는 load-subway-line-orders 가 적재한 로컬 DB
// (업스트림 0콜, source 'db').

export const SubwayLineDetailParams = z.object({
  lineId: z.string().regex(/^\d{4}$/),
});
export type SubwayLineDetailParamsType = z.infer<typeof SubwayLineDetailParams>;

export const SubwayLineStationItem = z.object({
  // `${lineId}:${name}` — 경유역 점 클릭 시 역 선택(stn) 입력. 단 환승역의
  // stn 딥링크는 그룹 대표 id 가 다를 수 있어 FE 가 검색 그룹으로 재해석한다.
  stationId: z.string().min(1),
  name: z.string(),
  // section 내 운행 순서 (1부터, 연속).
  seq: z.number().int().min(1),
  // 같은 물리 역에 다른 호선이 있는지(근접 그룹 기준) — 경유역 점 시각 구분.
  isTransfer: z.boolean(),
  lat: z.number().min(33).max(39),
  lng: z.number().min(124).max(132),
});
export type SubwayLineStationItemType = z.infer<typeof SubwayLineStationItem>;

export const SubwayLineSection = z.object({
  // 'main' + 지선 슬러그('seongsu', 'sinjeong' 등 — 적재 데이터 정의).
  branchKey: z.string().min(1),
  // 표시명 — 본선은 null, 지선은 '성수지선' 등.
  branchName: z.string().nullable(),
  // 운행 순서(seq asc). 폴리라인 = 이 좌표들의 연결. 2호선 본선 순환은
  // 서버가 첫 역을 끝에 복제하지 않는다 — FE 가 isLoop 로 닫는다.
  stations: z.array(SubwayLineStationItem).min(2),
  // 순환 구간(2호선 본선) — FE 가 폴리라인을 닫고 열차 보간(6차)에서 시임 처리.
  isLoop: z.boolean(),
});
export type SubwayLineSectionType = z.infer<typeof SubwayLineSection>;

export const SubwayLineDetailResult = z.object({
  lineId: z.string(),
  // SUBWAY_LINES 표기 ('2호선') — FE 상수와 동일하지만 응답 자체 완결성을 위해 포함.
  lineName: z.string(),
  sections: z.array(SubwayLineSection).min(1),
  // 순서 데이터 적재 시각 (ISO).
  fetchedAt: z.string(),
  source: z.literal('db'),
});
export type SubwayLineDetailResultType = z.infer<typeof SubwayLineDetailResult>;

// ── 8차: 역 시간표 (SearchSTNTimeTableByIDService — 1~9호선 한정) ───────────
// 프로브 실측(2026-07-06): 서울시 시간표는 1~9호선(중전철)만 제공 — 경전철·광역
// (신분당/수인분당/공항철도/GTX 등 10개 노선)은 미제공이라 coverage:false 로
// 200 을 내려 FE 가 "시간표 미제공" 을 안내한다(역이 없는 게 아니므로 404 아님).
// 시간표는 사실상 정적이라 (역×호선, dayType) 단위 DB blob 30일 캐시 + stale
// 폴백(버스 노선상세 패턴 — source 3값 봉투). 한 응답에 상·하행을 모두 담아
// FE 토글이 재요청 없이 동작한다(업스트림은 방향별 2콜 — 캐시 미스 시만).

export const SubwayTimetableParams = z.object({
  // `${lineId}:${name}` — 시간표는 역×호선 단위(환승역은 호선 섹션에서 진입).
  stationId: z.string().min(1),
});
export type SubwayTimetableParamsType = z.infer<typeof SubwayTimetableParams>;

export const SubwayTimetableQuery = z.object({
  // 주중구분 원문 체계 — '1' 평일 / '2' 토요일 / '3' 휴일(일요일·공휴일).
  // 공휴일 자동 판정은 불가능해 FE 기본값은 요일 기반(토=2, 일=3, 그 외 1).
  dayType: z.enum(['1', '2', '3']).default('1'),
});
export type SubwayTimetableQueryType = z.infer<typeof SubwayTimetableQuery>;

export const SubwayTimetableTrainItem = z.object({
  // ARRIVETIME/LEFTTIME 'HH:MM:SS' 원문 — 종착행 '00:00:00' 등 경계값이 있어
  // FE 가 표기 시 정규화한다.
  arriveTime: z.string(),
  leaveTime: z.string(),
  trainNo: z.string().nullable(),
  // EXPRESS_YN 원문 보존('G' 일반 관측, 급행 값은 9호선 실측으로 확정) —
  // FE 는 'G'/null 이 아닐 때 급행 뱃지.
  expressTag: z.string().nullable(),
  // DESTSTATION — 종착역명(정규화).
  destination: z.string().nullable(),
});
export type SubwayTimetableTrainItemType = z.infer<typeof SubwayTimetableTrainItem>;

export const SubwayTimetableDirection = z.object({
  // INOUT_TAG 원문 — '1' 상행(내선) / '2' 하행(외선).
  updn: z.string(),
  // arriveTime 오름차순.
  trains: z.array(SubwayTimetableTrainItem),
  // 첫차/막차 — trains 에서 서버가 파생(빈 방향이면 null).
  firstTrain: z.string().nullable(),
  lastTrain: z.string().nullable(),
});
export type SubwayTimetableDirectionType = z.infer<typeof SubwayTimetableDirection>;

export const SubwayTimetableResult = z.object({
  stationId: z.string(),
  name: z.string(),
  lineId: z.string(),
  dayType: z.string(),
  // false = 시간표 미제공 노선(광역·경전철) — directions 는 빈 배열.
  coverage: z.boolean(),
  directions: z.array(SubwayTimetableDirection),
  // 업스트림 수집 시각 (ISO).
  fetchedAt: z.string(),
  // cache = TTL 내 blob / api = 방금 수집 / stale = 수집 실패로 만료 blob 반환.
  source: z.enum(['cache', 'api', 'stale']),
});
export type SubwayTimetableResultType = z.infer<typeof SubwayTimetableResult>;

// ── 10차: 시간대별 혼잡도 (서울교통공사 정적 통계 — 1~8호선 한정) ───────────
// odcloud 파일데이터(분기 갱신)를 load-subway-congestion 이 전량 적재한 로컬
// 통계 — 실시간이 아니다(FE 는 "정적 통계" 라벨 필수). 값은 정원 대비 %
// (좌석 만석 = 34%). 30분 슬롯 05:30~00:30(익일 00시 표기 포함). 9호선·광역·
// 경전철은 데이터가 없어 coverage:false.

export const SubwayCongestionParams = z.object({
  stationId: z.string().min(1),
});
export type SubwayCongestionParamsType = z.infer<typeof SubwayCongestionParams>;

export const SubwayCongestionQuery = z.object({
  // 시간표와 같은 체계 — '1' 평일 / '2' 토요일 / '3' 휴일. 원본 요일구분
  // (평일/토요일/일요일)을 적재 시 이 코드로 접는다(일요일→'3').
  dayType: z.enum(['1', '2', '3']).default('1'),
});
export type SubwayCongestionQueryType = z.infer<typeof SubwayCongestionQuery>;

export const SubwayCongestionSlot = z.object({
  // 'HH:MM' — '05:30'~'23:30' + 자정 이후 '00:00'/'00:30'(익일).
  time: z.string(),
  // 정원 대비 % — 원본 공백/비수치는 null.
  level: z.number().nullable(),
});
export type SubwayCongestionSlotType = z.infer<typeof SubwayCongestionSlot>;

export const SubwayCongestionDirection = z.object({
  // 원본 상하구분 원문 보존(표기는 적재 관찰로 확정 — FE 가 도착 updnLine 과
  // 매핑). 슬롯은 time 순.
  updn: z.string(),
  slots: z.array(SubwayCongestionSlot),
});
export type SubwayCongestionDirectionType = z.infer<typeof SubwayCongestionDirection>;

export const SubwayCongestionResult = z.object({
  stationId: z.string(),
  name: z.string(),
  lineId: z.string(),
  dayType: z.string(),
  // false = 데이터 없는 노선/역(9호선·광역·경전철·미조인) — directions 빈 배열.
  coverage: z.boolean(),
  directions: z.array(SubwayCongestionDirection),
  // 적재 시각 (ISO) — 원본은 분기 단위 갱신.
  fetchedAt: z.string(),
  source: z.literal('db'),
});
export type SubwayCongestionResultType = z.infer<typeof SubwayCongestionResult>;

// ── 6차: 실시간 열차 위치 (realtimePosition 프록시) ─────────────────────────
// 버스와 결정적 차이 — GPS 가 없다. 응답은 현재역(statnId)+상태(trainSttus)뿐이라
// 서버가 마스터 statnId 조인으로 역 좌표를 enrich 해 내려주고(실패 시 null —
// 좌표는 부가 정보라 전량 null 도 정상), FE 가 5차 노선 순서(sections)와 조합해
// 역간 위치를 보간한다. 도착정보와 같은 실시간 인프라(15초 마이크로 캐시·쿼터·
// in-flight)를 노선명 키로 공유한다.

export const SubwayPositionsParams = z.object({
  lineId: z.string().regex(/^\d{4}$/),
});
export type SubwayPositionsParamsType = z.infer<typeof SubwayPositionsParams>;

export const SubwayTrainPositionItem = z.object({
  // 열차 번호 — 도착정보 trainNo(btrainNo)와 동일 체계(프로브 ⑨ 실측). 7차
  // 도착↔지도 열차 연계의 조인 키이자 rAF 보간의 identity.
  trainNo: z.string().min(1),
  // 현재(또는 직전 이벤트) 역 — 실시간 10자리. FE 가 sections 의 statnId 와
  // 조인해 보간 기준점을 잡는다.
  statnId: z.string().min(1),
  statnNm: z.string(),
  // trainSttus 원문 보존 — '0' 진입 / '1' 도착 / '2' 출발 / '3' 전역출발.
  trainStatus: z.string(),
  // updnLine 원문 — '0'/'1' (도착정보의 텍스트 인코딩과 다름 — 변환하지 않음).
  // 진행 방향의 1차 근거는 destinationId(행선)와 노선 순서 비교, updn 은 보조.
  updnLine: z.string(),
  // statnTid/statnTnm — 행선(종착) 역. 보간의 진행 방향 판정 근거.
  destinationId: z.string().nullable(),
  destinationName: z.string().nullable(),
  // directAt — 급행/직통 여부('1' 급행·'7' 특급 등 비'0' 값 — 원문 보존).
  expressType: z.string().nullable(),
  isLastTrain: z.boolean(),
  // 원천 수신 시각(ISO) — 이동 보간의 시간 기준.
  receivedAt: z.string().nullable(),
  // 마스터 statnId 조인 역 좌표 — 조인 실패 시 null(정상).
  lat: z.number().min(33).max(39).nullable(),
  lng: z.number().min(124).max(132).nullable(),
});
export type SubwayTrainPositionItemType = z.infer<typeof SubwayTrainPositionItem>;

export const SubwayPositionsResult = z.object({
  lineId: z.string(),
  items: z.array(SubwayTrainPositionItem),
  // 업스트림 호출 시각 (ISO) — 마이크로 캐시 히트 시 캐시 생성 시각 보존.
  fetchedAt: z.string(),
});
export type SubwayPositionsResultType = z.infer<typeof SubwayPositionsResult>;

// ── 2차: 실시간 도착정보 (realtimeStationArrival 프록시) ─────────────────────
// 조회 단위는 역명 그룹 — 서버가 stationId 로 그룹을 재구성해 그룹의 유니크
// 조회역명(realtimeName ?? name — 신촌은 '신촌'+'신촌(경의중앙선)' 2개)별로
// 업스트림을 부르고 합본한 뒤, 그룹 lineId 집합으로 필터한다(동명이역 응답 오염
// 차단 — '양평' 조회에 5호선/경의중앙 두 물리 역이 섞여 온다). 서버는 역명 단위
// 15초 마이크로 캐시 + in-flight 합류로 동시 사용자의 업스트림 콜을 공유한다
// (실시간이라 stale 폴백은 없음 — 쿼터 소진/실패는 503/502).

export const SubwayArrivalsParams = z.object({
  // 내부 합성 ID `${lineId}:${name}` — 검색 결과 그룹의 id(lines[0].stationId).
  // 콜론·한글이 있어 클라이언트는 encodeURIComponent 로 넣는다(Routes 빌더가 처리).
  stationId: z.string().min(1),
});
export type SubwayArrivalsParamsType = z.infer<typeof SubwayArrivalsParams>;

export const SubwayArrivalItem = z.object({
  // 실시간 subwayId — SUBWAY_LINES 매핑으로 뱃지/색.
  lineId: z.string().regex(/^\d{4}$/),
  // 상하행 원문 보존 — '상행'/'하행'/'내선'/'외선' (호선마다 표기가 다르고
  // 위치 API('0'/'1')와도 인코딩이 달라 변환하지 않는다).
  updnLine: z.string(),
  // '성수행 - 역삼방면' — 행선지 주 표기의 원천.
  trainLineNm: z.string().nullable(),
  // bstatnNm — 종착역명.
  destination: z.string().nullable(),
  // btrainSttus 원문 — '일반'/'급행'/'ITX'/'특급' (값 집합이 노선마다 달라
  // 원문 보존, FE 는 '일반'이 아닐 때만 뱃지).
  trainKind: z.string().nullable(),
  // btrainNo — 위치 API 의 trainNo 와 동일 체계(프로브 ⑨ 실측). 7차
  // 도착↔지도 열차 연계의 조인 키라 지금부터 계약에 포함.
  trainNo: z.string().nullable(),
  // barvlDt(초). 0 은 도착/출발 등 상태 국면(arrivalCode 로 구분) — FE 는
  // 양수일 때만 카운트다운을 그린다.
  arrivalSec: z.number().int().nullable(),
  // arvlMsg2 — '전역 도착', '3분 후 (2번째 전역)' 등 보조 문구.
  arrivalMsg: z.string().nullable(),
  // arvlCd 원문 — 0접근/1도착/2출발/3전역출발/4전역진입/5전역도착/99운행중.
  arrivalCode: z.string().nullable(),
  // lstcarAt '1' — 막차.
  isLastTrain: z.boolean(),
  // recptnDt('yyyy-MM-dd HH:mm:ss', KST)를 ISO 로 정규화. 공식 가이드가
  // "현재시각과 recptnDt 차이만큼 보정"을 명시 — 카운트다운의 기준 시각이라
  // fetchedAt(캐시 생성 시각)이 아니라 이 값을 쓴다.
  receivedAt: z.string().nullable(),
});
export type SubwayArrivalItemType = z.infer<typeof SubwayArrivalItem>;

export const SubwayArrivalsResult = z.object({
  // 요청한 stationId (그룹 대표가 아니어도 그대로 반환).
  stationId: z.string(),
  name: z.string(),
  // 그룹의 lineId 집합(오름차순) — 패널 헤더 뱃지·필터 근거 노출.
  lines: z.array(z.string()),
  // barvlDt 오름차순 정렬(null 은 뒤로).
  items: z.array(SubwayArrivalItem),
  // 업스트림 호출 시각 (ISO) — 마이크로 캐시 히트 시 캐시 생성 시각 보존.
  fetchedAt: z.string(),
});
export type SubwayArrivalsResultType = z.infer<typeof SubwayArrivalsResult>;
