import { z } from 'zod';
import { BusStationItem } from './bus.js';

// 버스 즐겨찾기 — 로그인 사용자의 서버 저장분. 비로그인은 클라이언트
// (localStorage/AsyncStorage) 저장이며, 로그인 시 sync 로 union 병합한다.
// 대상은 두 종류: 정류장(stId) / 정류장×노선 조합(stId+busRouteId).
// 노선 단독 즐겨찾기는 조회 화면이 없어 만들지 않는다.

// 사용자·종류당 상한 — localStorage 비대화와 서버 남용을 함께 막는다.
// PUT 단건은 초과 시 400, sync 는 상한까지만 채우고 나머지를 조용히 버린다
// (로그인 직후 병합이 에러로 끊기는 것보다 목록이 진실이 되는 쪽이 낫다).
export const BUS_FAVORITES_MAX = 100;

export const BusFavoriteStationParams = z.object({
  // 서울시 9자리 정류소 고유 ID (BusStationItem.stId 와 동일 ID 공간).
  stId: z.string().regex(/^\d{1,12}$/),
});
export type BusFavoriteStationParamsType = z.infer<typeof BusFavoriteStationParams>;

export const BusFavoriteRouteParams = z.object({
  stId: z.string().regex(/^\d{1,12}$/),
  // 기존 BusPositionsParams 와 동일 형식.
  busRouteId: z.string().regex(/^\d+$/),
});
export type BusFavoriteRouteParamsType = z.infer<typeof BusFavoriteRouteParams>;

// 정류장 즐겨찾기 항목 = 정류장 스냅샷 그대로 — 목록 렌더/지도 이동에
// 재조회가 필요 없도록 저장 시점 값을 보존한다(정류장 정보는 사실상 정적).
export const BusFavoriteStationItem = BusStationItem;
export type BusFavoriteStationItemType = z.infer<typeof BusFavoriteStationItem>;

export const BusFavoriteRouteItem = z.object({
  stId: z.string().min(1),
  busRouteId: z.string().min(1),
  // rtNm 표기('141', 'N61') — 목록 표시용 스냅샷.
  routeName: z.string(),
  // 정류장명 스냅샷 — 조합 항목을 "정류장명 · 노선" 으로 렌더하기 위함.
  stationName: z.string(),
  // 도착정보 재진입용. 도착 패널(arsId 유효)에서만 추가되므로 '0' 은
  // 정상 흐름에선 없지만 계약으로 금지하진 않는다.
  arsId: z.string(),
  // 정류장 좌표 스냅샷 — 조합 항목 단독 진입 시 지도 이동에 필요
  // (정류장 즐겨찾기에 같은 정류장이 없을 수 있다). BusStationItem 과 동일 계약.
  lat: z.number().min(33).max(39),
  lng: z.number().min(124).max(132),
});
export type BusFavoriteRouteItemType = z.infer<typeof BusFavoriteRouteItem>;

// PUT body — 식별자는 path 로 오므로 스냅샷 필드만.
export const BusFavoriteStationUpsertBody = BusStationItem.omit({ stId: true });
export type BusFavoriteStationUpsertBodyType = z.infer<typeof BusFavoriteStationUpsertBody>;

export const BusFavoriteRouteUpsertBody = BusFavoriteRouteItem.omit({
  stId: true,
  busRouteId: true,
});
export type BusFavoriteRouteUpsertBodyType = z.infer<typeof BusFavoriteRouteUpsertBody>;

// 목록 정렬 계약: 둘 다 createdAt 오름차순(등록순) — 즐겨찾기는 위치가
// 안 바뀌어야 눈이 기억한다. PUT/DELETE/sync 응답도 이 전체 목록을
// 그대로 반환해 클라이언트가 diff 없이 캐시를 통째로 교체한다.
export const BusFavoritesResult = z.object({
  stations: z.array(BusFavoriteStationItem),
  routes: z.array(BusFavoriteRouteItem),
});
export type BusFavoritesResultType = z.infer<typeof BusFavoritesResult>;

// 로그인 직후 1회 — 게스트(localStorage) 저장분을 서버로 union 병합.
// 이미 있는 항목은 서버 값 유지(스냅샷 덮어쓰지 않음), 멱등이라 재호출 무해.
export const BusFavoritesSyncBody = z.object({
  stations: z.array(BusFavoriteStationItem).max(BUS_FAVORITES_MAX),
  routes: z.array(BusFavoriteRouteItem).max(BUS_FAVORITES_MAX),
});
export type BusFavoritesSyncBodyType = z.infer<typeof BusFavoritesSyncBody>;
