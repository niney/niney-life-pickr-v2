import { z } from 'zod';

// 맛집 즐겨찾기 — 로그인 사용자의 서버 저장분. 비로그인은 클라이언트
// (localStorage/AsyncStorage) 저장이며, 로그인 시 sync 로 union 병합한다.
// 버스/지하철 즐겨찾기와 동일 설계 — 대상이 식당(placeId) 1종이라 절반 규모.

// 사용자당 상한 — localStorage 비대화와 서버 남용을 함께 막는다.
// PUT 단건은 초과 시 400, sync 는 상한까지만 채우고 나머지를 조용히 버린다
// (로그인 직후 병합이 에러로 끊기는 것보다 목록이 진실이 되는 쪽이 낫다).
export const RESTAURANT_FAVORITES_MAX = 100;

// 네이버 placeId — 숫자 문자열(Restaurant.placeId 와 동일 ID 공간). Item 의
// placeId 와 같은 규칙이어야 sync 로 들어간 항목이 DELETE path 검증에 막히는
// 엇갈림이 없다.
const placeIdSchema = z.string().regex(/^\d{1,20}$/);

export const RestaurantFavoriteParams = z.object({
  placeId: placeIdSchema,
});
export type RestaurantFavoriteParamsType = z.infer<typeof RestaurantFavoriteParams>;

// 즐겨찾기 항목 = 저장 시점 식당 스냅샷 — 목록 렌더에 재조회가 필요 없도록
// 이름/카테고리/주소/썸네일/좌표를 보존한다. 식당 마스터와 달리 좌표는
// nullable(마스터 자체가 nullable) — 값이 있으면 한국 범위 강제.
export const RestaurantFavoriteItem = z.object({
  placeId: placeIdSchema,
  name: z.string().min(1).max(200),
  category: z.string().max(120).nullable(),
  // roadAddress ?? address 한 값으로 스냅샷.
  address: z.string().max(300).nullable(),
  // 외부 CDN 절대 URL 또는 same-origin 경로 둘 다 — url() 강제 안 함.
  thumbnailUrl: z.string().max(500).nullable(),
  latitude: z.number().min(33).max(39).nullable(),
  longitude: z.number().min(124).max(132).nullable(),
});
export type RestaurantFavoriteItemType = z.infer<typeof RestaurantFavoriteItem>;

// PUT body — 식별자는 path 로 오므로 스냅샷 필드만.
export const RestaurantFavoriteUpsertBody = RestaurantFavoriteItem.omit({ placeId: true });
export type RestaurantFavoriteUpsertBodyType = z.infer<typeof RestaurantFavoriteUpsertBody>;

// 목록 정렬 계약: createdAt 오름차순(등록순) — 즐겨찾기는 위치가 안 바뀌어야
// 눈이 기억한다. PUT/DELETE/sync 응답도 이 전체 목록을 그대로 반환해
// 클라이언트가 diff 없이 캐시를 통째로 교체한다.
export const RestaurantFavoritesResult = z.object({
  items: z.array(RestaurantFavoriteItem),
});
export type RestaurantFavoritesResultType = z.infer<typeof RestaurantFavoritesResult>;

// 로그인 직후 1회 — 게스트(localStorage) 저장분을 서버로 union 병합.
// 이미 있는 항목은 서버 값 유지(스냅샷 덮어쓰지 않음), 멱등이라 재호출 무해.
export const RestaurantFavoritesSyncBody = z.object({
  items: z.array(RestaurantFavoriteItem).max(RESTAURANT_FAVORITES_MAX),
});
export type RestaurantFavoritesSyncBodyType = z.infer<typeof RestaurantFavoritesSyncBody>;
