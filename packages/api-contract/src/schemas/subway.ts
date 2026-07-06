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
