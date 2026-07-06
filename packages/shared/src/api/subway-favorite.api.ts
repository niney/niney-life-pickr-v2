import {
  Routes,
  type SubwayFavoriteLineUpsertBodyType,
  type SubwayFavoriteStationUpsertBodyType,
  type SubwayFavoritesResultType,
  type SubwayFavoritesSyncBodyType,
} from '@repo/api-contract';
import { apiFetch } from './client.js';

// 지하철 즐겨찾기 — 로그인 사용자의 서버 저장분. 전부 Bearer 인증(미로그인 401).
// 변경(PUT/DELETE/sync)은 변경 후 전체 목록(SubwayFavoritesResult)을 반환해
// 클라이언트가 diff 없이 캐시를 통째로 교체한다. 상한 초과 PUT 은 400. stationId
// 는 `${lineId}:${name}` 합성이라 Routes 빌더가 encodeURIComponent 를 책임진다.
export const subwayFavoriteApi = {
  list: () => apiFetch<SubwayFavoritesResultType>(Routes.Subway.favorites),

  upsertStation: (stationId: string, body: SubwayFavoriteStationUpsertBodyType) =>
    apiFetch<SubwayFavoritesResultType>(Routes.Subway.favoriteStation(stationId), {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  removeStation: (stationId: string) =>
    apiFetch<SubwayFavoritesResultType>(Routes.Subway.favoriteStation(stationId), {
      method: 'DELETE',
    }),

  upsertLine: (stationId: string, lineId: string, body: SubwayFavoriteLineUpsertBodyType) =>
    apiFetch<SubwayFavoritesResultType>(Routes.Subway.favoriteLine(stationId, lineId), {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  removeLine: (stationId: string, lineId: string) =>
    apiFetch<SubwayFavoritesResultType>(Routes.Subway.favoriteLine(stationId, lineId), {
      method: 'DELETE',
    }),

  // 로그인 직후 1회 — 게스트 저장분을 서버로 union 병합(멱등).
  sync: (body: SubwayFavoritesSyncBodyType) =>
    apiFetch<SubwayFavoritesResultType>(Routes.Subway.favoritesSync, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};
