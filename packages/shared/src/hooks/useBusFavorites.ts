import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BusFavoriteRouteItemType,
  BusFavoriteStationItemType,
  BusFavoritesResultType,
} from '@repo/api-contract';
import { busFavoriteApi } from '../api/bus-favorite.api.js';
import { useBusFavoriteStore } from '../stores/busFavoriteStore.js';
import { useAuthStore } from '../stores/authStore.js';

// 버스 즐겨찾기 하이브리드 훅 — 웹/앱 공용 단일 인터페이스.
//
// - 게스트(!token): busFavoriteStore(localStorage/AsyncStorage) 를 그대로 사용.
// - 로그인(token): 서버 목록을 React Query 로 조회. 토글은 현재 목록 포함
//   여부로 upsert/remove 를 골라 호출하고, 응답(변경 후 전체 목록)으로 캐시를
//   통째 교체한다(낙관적 업데이트 불필요 — 응답이 전체 목록). pending 중 같은
//   항목 연타는 in-flight ref 로 무시.
// - 병합: 로그인 && 게스트 저장분 존재 && 서버 목록 조회 성공 후 → sync 1회
//   fire(외부 시스템 동기화라 useEffect 허용). 성공 시 게스트 clearAll +
//   응답으로 캐시 교체. 실패 시 로컬 유지(다음 마운트 재시도), UI 없음.
// - 401 로 clearSession 되면 token 이 null 이 되어 자연히 게스트 모드로 폴백.

// useBus.ts 컨벤션(['bus', ...])에 맞춘 즐겨찾기 캐시 키.
const FAVORITES_KEY = ['bus', 'favorites'] as const;

const routeKey = (stId: string, busRouteId: string) => `${stId}::${busRouteId}`;

export interface BusFavoritesApi {
  stations: BusFavoriteStationItemType[];
  routes: BusFavoriteRouteItemType[];
  isStationFavorite(stId: string): boolean;
  isRouteFavorite(stId: string, busRouteId: string): boolean;
  toggleStation(item: BusFavoriteStationItemType): void;
  toggleRoute(item: BusFavoriteRouteItemType): void;
}

export const useBusFavorites = (): BusFavoritesApi => {
  const loggedIn = useAuthStore((s) => !!s.token);
  const queryClient = useQueryClient();

  // 게스트 store — 로그인 시에도 hook 규칙상 구독은 유지하되, 반환/토글에는
  // 로그인 여부로 분기해 사용한다.
  const guestStations = useBusFavoriteStore((s) => s.stations);
  const guestRoutes = useBusFavoriteStore((s) => s.routes);
  const guestToggleStation = useBusFavoriteStore((s) => s.toggleStation);
  const guestToggleRoute = useBusFavoriteStore((s) => s.toggleRoute);

  const listQuery = useQuery({
    queryKey: FAVORITES_KEY,
    queryFn: () => busFavoriteApi.list(),
    enabled: loggedIn,
    // 목록은 사용자 조작으로만 바뀌고 응답으로 즉시 교체하므로 재조회 압박이 낮다.
    staleTime: 60_000,
  });

  const serverStations = listQuery.data?.stations ?? [];
  const serverRoutes = listQuery.data?.routes ?? [];

  // pending 중 같은 항목 연타 무시용 — 항목 식별자 집합.
  const pendingStations = useRef(new Set<string>());
  const pendingRoutes = useRef(new Set<string>());

  const stationMutation = useMutation({
    mutationFn: (vars: { item: BusFavoriteStationItemType; isFav: boolean }) =>
      vars.isFav
        ? busFavoriteApi.removeStation(vars.item.stId)
        : busFavoriteApi.upsertStation(vars.item.stId, {
            arsId: vars.item.arsId,
            name: vars.item.name,
            lat: vars.item.lat,
            lng: vars.item.lng,
          }),
    onSuccess: (result) => {
      queryClient.setQueryData<BusFavoritesResultType>(FAVORITES_KEY, result);
    },
    onSettled: (_data, _err, vars) => {
      pendingStations.current.delete(vars.item.stId);
    },
  });

  const routeMutation = useMutation({
    mutationFn: (vars: { item: BusFavoriteRouteItemType; isFav: boolean }) =>
      vars.isFav
        ? busFavoriteApi.removeRoute(vars.item.stId, vars.item.busRouteId)
        : busFavoriteApi.upsertRoute(vars.item.stId, vars.item.busRouteId, {
            routeName: vars.item.routeName,
            stationName: vars.item.stationName,
            arsId: vars.item.arsId,
            lat: vars.item.lat,
            lng: vars.item.lng,
          }),
    onSuccess: (result) => {
      queryClient.setQueryData<BusFavoritesResultType>(FAVORITES_KEY, result);
    },
    onSettled: (_data, _err, vars) => {
      pendingRoutes.current.delete(routeKey(vars.item.stId, vars.item.busRouteId));
    },
  });

  // ── 로그인 직후 게스트 저장분 union 병합 (sync 1회) ─────────────────────────
  const syncMutation = useMutation({
    mutationFn: busFavoriteApi.sync,
  });
  // StrictMode 이중 실행/재렌더 재진입 가드 — mutate 직전 동기적으로 true.
  const syncedRef = useRef(false);
  useEffect(() => {
    if (!loggedIn) {
      // 로그아웃 시 리셋 → 재로그인 때 새 게스트 저장분을 다시 병합할 수 있게.
      syncedRef.current = false;
      return;
    }
    if (syncedRef.current) return;
    if (!listQuery.isSuccess) return;
    const guest = useBusFavoriteStore.getState();
    if (guest.stations.length === 0 && guest.routes.length === 0) return;
    syncedRef.current = true;
    syncMutation.mutate(
      { stations: guest.stations, routes: guest.routes },
      {
        onSuccess: (result) => {
          useBusFavoriteStore.getState().clearAll();
          queryClient.setQueryData<BusFavoritesResultType>(FAVORITES_KEY, result);
        },
        onError: () => {
          // 로컬 유지 — 다음 마운트에서 재시도.
          syncedRef.current = false;
        },
      },
    );
    // listQuery.isSuccess 전이 + 로그인 상태만 추적. sync 는 1회성이라
    // 게스트 store 변화를 반응 의존성으로 두지 않는다(getState 로 스냅샷).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn, listQuery.isSuccess]);

  // ── 반환 — 로그인이면 서버 목록, 게스트면 store. 파생 판정은 렌더 중 계산 ──
  const stations = loggedIn ? serverStations : guestStations;
  const routes = loggedIn ? serverRoutes : guestRoutes;

  const isStationFavorite = (stId: string) => stations.some((s) => s.stId === stId);
  const isRouteFavorite = (stId: string, busRouteId: string) =>
    routes.some((r) => r.stId === stId && r.busRouteId === busRouteId);

  const toggleStation = (item: BusFavoriteStationItemType) => {
    if (!loggedIn) {
      guestToggleStation(item);
      return;
    }
    if (pendingStations.current.has(item.stId)) return;
    const isFav = serverStations.some((s) => s.stId === item.stId);
    pendingStations.current.add(item.stId);
    stationMutation.mutate({ item, isFav });
  };

  const toggleRoute = (item: BusFavoriteRouteItemType) => {
    if (!loggedIn) {
      guestToggleRoute(item);
      return;
    }
    const key = routeKey(item.stId, item.busRouteId);
    if (pendingRoutes.current.has(key)) return;
    const isFav = serverRoutes.some(
      (r) => r.stId === item.stId && r.busRouteId === item.busRouteId,
    );
    pendingRoutes.current.add(key);
    routeMutation.mutate({ item, isFav });
  };

  return {
    stations,
    routes,
    isStationFavorite,
    isRouteFavorite,
    toggleStation,
    toggleRoute,
  };
};
