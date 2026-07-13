import {
  Routes,
  type RestaurantFavoriteUpsertBodyType,
  type RestaurantFavoritesResultType,
  type RestaurantFavoritesSyncBodyType,
} from '@repo/api-contract';
import { apiFetch } from './client.js';

// 맛집 즐겨찾기 — 로그인 사용자의 서버 저장분. 전부 Bearer 인증(미로그인 401).
// 변경(PUT/DELETE/sync)은 변경 후 전체 목록(RestaurantFavoritesResult)을 반환해
// 클라이언트가 diff 없이 캐시를 통째로 교체한다. 상한 초과 PUT 은 400.
export const restaurantFavoriteApi = {
  list: () => apiFetch<RestaurantFavoritesResultType>(Routes.Restaurant.favorites),

  upsert: (placeId: string, body: RestaurantFavoriteUpsertBodyType) =>
    apiFetch<RestaurantFavoritesResultType>(Routes.Restaurant.favorite(placeId), {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  remove: (placeId: string) =>
    apiFetch<RestaurantFavoritesResultType>(Routes.Restaurant.favorite(placeId), {
      method: 'DELETE',
    }),

  // 로그인 직후 1회 — 게스트 저장분을 서버로 union 병합(멱등).
  sync: (body: RestaurantFavoritesSyncBodyType) =>
    apiFetch<RestaurantFavoritesResultType>(Routes.Restaurant.favoritesSync, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};
