import {
  Routes,
  type BusFavoriteRouteUpsertBodyType,
  type BusFavoriteStationUpsertBodyType,
  type BusFavoritesResultType,
  type BusFavoritesSyncBodyType,
} from '@repo/api-contract';
import { apiFetch } from './client.js';

// 버스 즐겨찾기 — 로그인 사용자의 서버 저장분. 전부 Bearer 인증(미로그인 401).
// 변경(PUT/DELETE/sync)은 변경 후 전체 목록(BusFavoritesResult)을 반환해
// 클라이언트가 diff 없이 캐시를 통째로 교체한다. 상한 초과 PUT 은 400.
export const busFavoriteApi = {
  list: () => apiFetch<BusFavoritesResultType>(Routes.Bus.favorites),

  upsertStation: (stId: string, body: BusFavoriteStationUpsertBodyType) =>
    apiFetch<BusFavoritesResultType>(Routes.Bus.favoriteStation(stId), {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  removeStation: (stId: string) =>
    apiFetch<BusFavoritesResultType>(Routes.Bus.favoriteStation(stId), {
      method: 'DELETE',
    }),

  upsertRoute: (
    stId: string,
    busRouteId: string,
    body: BusFavoriteRouteUpsertBodyType,
  ) =>
    apiFetch<BusFavoritesResultType>(Routes.Bus.favoriteRoute(stId, busRouteId), {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  removeRoute: (stId: string, busRouteId: string) =>
    apiFetch<BusFavoritesResultType>(Routes.Bus.favoriteRoute(stId, busRouteId), {
      method: 'DELETE',
    }),

  // 로그인 직후 1회 — 게스트 저장분을 서버로 union 병합(멱등).
  sync: (body: BusFavoritesSyncBodyType) =>
    apiFetch<BusFavoritesResultType>(Routes.Bus.favoritesSync, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};
