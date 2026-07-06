import { z } from 'zod';

// 지하철 즐겨찾기 — 버스 즐겨찾기(bus-favorite.ts)와 동일 골격: 로그인 사용자의
// 서버 저장분이며, 비로그인은 클라이언트(localStorage) 저장 후 로그인 시 sync 로
// union 병합한다. 대상은 두 종류: 역 그룹(stationId) / 역×호선(stationId+lineId).
//
// stationId 는 검색 그룹 대표 id(`${lineId}:${name}` 합성) 스냅샷이다 — 마스터
// 재적재·보정으로 대표가 바뀌면 죽은 id 가 될 수 있으므로, 목록 렌더/지도 이동은
// 스냅샷만으로 완결하고 도착 재진입 실패(404)는 FE 가 안내한다(버스의 죽은 stId
// 안내와 동일 계약).

// 사용자·종류당 상한 — PUT 단건은 초과 시 400, sync 는 상한까지 채우고 나머지는
// 조용히 버린다(버스와 동일 정책).
export const SUBWAY_FAVORITES_MAX = 100;

// `${lineId 4자리}:${역명}` 합성 — 콜론·한글 포함이라 URL 에선 인코딩된다
// (Routes 빌더가 책임, 서버 라우트 등록은 디코드 트릭 — 도착 라우트와 동일).
const stationIdSchema = z.string().regex(/^\d{4}:.+$/);

export const SubwayFavoriteStationParams = z.object({
  stationId: stationIdSchema,
});
export type SubwayFavoriteStationParamsType = z.infer<typeof SubwayFavoriteStationParams>;

export const SubwayFavoriteLineParams = z.object({
  stationId: stationIdSchema,
  // 실시간 subwayId 체계 ('1002').
  lineId: z.string().regex(/^\d{4}$/),
});
export type SubwayFavoriteLineParamsType = z.infer<typeof SubwayFavoriteLineParams>;

// 역 즐겨찾기 항목 = 역 그룹 스냅샷 — 목록 렌더(호선 뱃지)/지도 이동에 재조회가
// 필요 없도록 저장 시점 값을 보존한다. lines 는 lineId 오름차순 문자열 배열
// (lineName/색은 FE 가 SUBWAY_LINES 상수로 파생).
export const SubwayFavoriteStationItem = z.object({
  stationId: stationIdSchema,
  name: z.string().min(1),
  // 그룹 대표 좌표 — WGS84 한국 범위 강제(다른 지하철 계약과 동일).
  lat: z.number().min(33).max(39),
  lng: z.number().min(124).max(132),
  lines: z.array(z.string().regex(/^\d{4}$/)).min(1).max(10),
});
export type SubwayFavoriteStationItemType = z.infer<typeof SubwayFavoriteStationItem>;

// 역×호선 즐겨찾기 — 도착 패널의 호선 섹션에서 추가. 탭하면 해당 역 패널로
// 진입(호선 강조), 5차 이후 호선 추적(line)과 연계된다.
export const SubwayFavoriteLineItem = z.object({
  stationId: stationIdSchema,
  lineId: z.string().regex(/^\d{4}$/),
  // 역명 스냅샷 — "역명 · 호선" 렌더용.
  stationName: z.string().min(1),
  // 그룹 대표 좌표 스냅샷 — 단독 진입 시 지도 이동용(역 즐겨찾기에 같은 역이
  // 없을 수 있다).
  lat: z.number().min(33).max(39),
  lng: z.number().min(124).max(132),
});
export type SubwayFavoriteLineItemType = z.infer<typeof SubwayFavoriteLineItem>;

// PUT body — 식별자는 path 로 오므로 스냅샷 필드만.
export const SubwayFavoriteStationUpsertBody = SubwayFavoriteStationItem.omit({
  stationId: true,
});
export type SubwayFavoriteStationUpsertBodyType = z.infer<
  typeof SubwayFavoriteStationUpsertBody
>;

export const SubwayFavoriteLineUpsertBody = SubwayFavoriteLineItem.omit({
  stationId: true,
  lineId: true,
});
export type SubwayFavoriteLineUpsertBodyType = z.infer<typeof SubwayFavoriteLineUpsertBody>;

// 목록 정렬 계약: createdAt 오름차순(등록순). PUT/DELETE/sync 응답도 전체 목록을
// 그대로 반환해 클라이언트가 diff 없이 캐시를 통째로 교체한다(버스와 동일).
export const SubwayFavoritesResult = z.object({
  stations: z.array(SubwayFavoriteStationItem),
  lines: z.array(SubwayFavoriteLineItem),
});
export type SubwayFavoritesResultType = z.infer<typeof SubwayFavoritesResult>;

// 로그인 직후 1회 — 게스트(localStorage) 저장분을 서버로 union 병합.
// 이미 있는 항목은 서버 값 유지(스냅샷 덮어쓰지 않음), 멱등이라 재호출 무해.
export const SubwayFavoritesSyncBody = z.object({
  stations: z.array(SubwayFavoriteStationItem).max(SUBWAY_FAVORITES_MAX),
  lines: z.array(SubwayFavoriteLineItem).max(SUBWAY_FAVORITES_MAX),
});
export type SubwayFavoritesSyncBodyType = z.infer<typeof SubwayFavoritesSyncBody>;
