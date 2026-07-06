import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  SubwayFavoriteLineItemType,
  SubwayFavoriteStationItemType,
  SubwayFavoritesResultType,
} from '@repo/api-contract';
import { subwayFavoriteApi } from '../api/subway-favorite.api.js';
import { useSubwayFavoriteStore } from '../stores/subwayFavoriteStore.js';
import { useAuthStore } from '../stores/authStore.js';

// 지하철 즐겨찾기 하이브리드 훅 — 웹/앱 공용 단일 인터페이스(useBusFavorites 미러).
//
// - 게스트(!token): subwayFavoriteStore(localStorage/AsyncStorage) 를 그대로 사용.
// - 로그인(token): 서버 목록을 React Query 로 조회. 토글은 현재 목록 포함 여부로
//   upsert/remove 를 골라 호출하고, 응답(변경 후 전체 목록)으로 캐시를 통째 교체
//   한다. pending 중 같은 항목 연타는 in-flight ref 로 무시.
// - 병합: 로그인 && 게스트 저장분 존재 && 서버 목록 조회 성공 후 → sync 1회 fire
//   (외부 시스템 동기화라 useEffect 허용). 성공 시 게스트 clearAll + 응답으로 캐시
//   교체. 실패 시 로컬 유지(다음 마운트 재시도), UI 없음.
// - 401 로 clearSession 되면 token 이 null 이 되어 자연히 게스트 모드로 폴백.

// useSubway.ts 컨벤션(['subway', ...])에 맞춘 즐겨찾기 캐시 키.
const FAVORITES_KEY = ['subway', 'favorites'] as const;

const lineKey = (stationId: string, lineId: string) => `${stationId}::${lineId}`;

export interface SubwayFavoritesApi {
  stations: SubwayFavoriteStationItemType[];
  lines: SubwayFavoriteLineItemType[];
  isStationFavorite(stationId: string): boolean;
  isLineFavorite(stationId: string, lineId: string): boolean;
  toggleStation(item: SubwayFavoriteStationItemType): void;
  toggleLine(item: SubwayFavoriteLineItemType): void;
}

export const useSubwayFavorites = (): SubwayFavoritesApi => {
  const loggedIn = useAuthStore((s) => !!s.token);
  const queryClient = useQueryClient();

  // 게스트 store — 로그인 시에도 hook 규칙상 구독은 유지하되, 반환/토글에는
  // 로그인 여부로 분기해 사용한다.
  const guestStations = useSubwayFavoriteStore((s) => s.stations);
  const guestLines = useSubwayFavoriteStore((s) => s.lines);
  const guestToggleStation = useSubwayFavoriteStore((s) => s.toggleStation);
  const guestToggleLine = useSubwayFavoriteStore((s) => s.toggleLine);

  const listQuery = useQuery({
    queryKey: FAVORITES_KEY,
    queryFn: () => subwayFavoriteApi.list(),
    enabled: loggedIn,
    // 목록은 사용자 조작으로만 바뀌고 응답으로 즉시 교체하므로 재조회 압박이 낮다.
    staleTime: 60_000,
  });

  const serverStations = listQuery.data?.stations ?? [];
  const serverLines = listQuery.data?.lines ?? [];

  // pending 중 같은 항목 연타 무시용 — 항목 식별자 집합.
  const pendingStations = useRef(new Set<string>());
  const pendingLines = useRef(new Set<string>());

  const stationMutation = useMutation({
    mutationFn: (vars: { item: SubwayFavoriteStationItemType; isFav: boolean }) =>
      vars.isFav
        ? subwayFavoriteApi.removeStation(vars.item.stationId)
        : subwayFavoriteApi.upsertStation(vars.item.stationId, {
            name: vars.item.name,
            lat: vars.item.lat,
            lng: vars.item.lng,
            lines: vars.item.lines,
          }),
    onSuccess: (result) => {
      queryClient.setQueryData<SubwayFavoritesResultType>(FAVORITES_KEY, result);
    },
    onSettled: (_data, _err, vars) => {
      pendingStations.current.delete(vars.item.stationId);
    },
  });

  const lineMutation = useMutation({
    mutationFn: (vars: { item: SubwayFavoriteLineItemType; isFav: boolean }) =>
      vars.isFav
        ? subwayFavoriteApi.removeLine(vars.item.stationId, vars.item.lineId)
        : subwayFavoriteApi.upsertLine(vars.item.stationId, vars.item.lineId, {
            stationName: vars.item.stationName,
            lat: vars.item.lat,
            lng: vars.item.lng,
          }),
    onSuccess: (result) => {
      queryClient.setQueryData<SubwayFavoritesResultType>(FAVORITES_KEY, result);
    },
    onSettled: (_data, _err, vars) => {
      pendingLines.current.delete(lineKey(vars.item.stationId, vars.item.lineId));
    },
  });

  // ── 로그인 직후 게스트 저장분 union 병합 (sync 1회) ─────────────────────────
  const syncMutation = useMutation({
    mutationFn: subwayFavoriteApi.sync,
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
    const guest = useSubwayFavoriteStore.getState();
    if (guest.stations.length === 0 && guest.lines.length === 0) return;
    syncedRef.current = true;
    syncMutation.mutate(
      { stations: guest.stations, lines: guest.lines },
      {
        onSuccess: (result) => {
          useSubwayFavoriteStore.getState().clearAll();
          queryClient.setQueryData<SubwayFavoritesResultType>(FAVORITES_KEY, result);
        },
        onError: () => {
          // 로컬 유지 — 다음 마운트에서 재시도.
          syncedRef.current = false;
        },
      },
    );
    // listQuery.isSuccess 전이 + 로그인 상태만 추적. sync 는 1회성이라 게스트
    // store 변화를 반응 의존성으로 두지 않는다(getState 로 스냅샷).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn, listQuery.isSuccess]);

  // ── 반환 — 로그인이면 서버 목록, 게스트면 store. 파생 판정은 렌더 중 계산 ──
  const stations = loggedIn ? serverStations : guestStations;
  const lines = loggedIn ? serverLines : guestLines;

  const isStationFavorite = (stationId: string) =>
    stations.some((s) => s.stationId === stationId);
  const isLineFavorite = (stationId: string, lineId: string) =>
    lines.some((l) => l.stationId === stationId && l.lineId === lineId);

  const toggleStation = (item: SubwayFavoriteStationItemType) => {
    if (!loggedIn) {
      guestToggleStation(item);
      return;
    }
    if (pendingStations.current.has(item.stationId)) return;
    const isFav = serverStations.some((s) => s.stationId === item.stationId);
    pendingStations.current.add(item.stationId);
    stationMutation.mutate({ item, isFav });
  };

  const toggleLine = (item: SubwayFavoriteLineItemType) => {
    if (!loggedIn) {
      guestToggleLine(item);
      return;
    }
    const key = lineKey(item.stationId, item.lineId);
    if (pendingLines.current.has(key)) return;
    const isFav = serverLines.some(
      (l) => l.stationId === item.stationId && l.lineId === item.lineId,
    );
    pendingLines.current.add(key);
    lineMutation.mutate({ item, isFav });
  };

  return {
    stations,
    lines,
    isStationFavorite,
    isLineFavorite,
    toggleStation,
    toggleLine,
  };
};
