import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AirLocationItemType, AirLocationResultType, AirLocationUpsertBodyType } from '@repo/api-contract';
import { airLocationApi } from '../api/air-location.api.js';
import { useAirLocationStore } from '../stores/airLocationStore.js';
import { useAuthStore } from '../stores/authStore.js';

// 내 대기 위치 하이브리드 훅 — 웹/앱 공용 단일 인터페이스(useBusFavorites 미러).
//
// - 게스트(!token): airLocationStore(localStorage/AsyncStorage).
// - 로그인(token): 서버 값을 React Query 로 조회, save/clear 는 PUT/DELETE 응답으로 캐시
//   통째 교체.
// - 병합: 로그인 && 서버 조회 성공 && 서버가 비어 있음 && 게스트 저장분 있음 → PUT 1회
//   (외부 시스템 동기화라 useEffect). 성공 시 게스트 clear. 실패 시 로컬 유지(재시도).
//   서버에 이미 값이 있으면 서버 우선(게스트 값은 버리지 않고 둔다 — 로그아웃 시 복귀).

const AIR_LOCATION_KEY = ['air', 'location'] as const;

export interface AirLocationApi {
  location: AirLocationItemType | null;
  // 로그인 첫 조회 중(게스트는 항상 false).
  isLoading: boolean;
  // 저장/해제 요청 진행 중(서버 모드만).
  isSaving: boolean;
  save(body: AirLocationUpsertBodyType): void;
  clear(): void;
}

export const useAirLocation = (): AirLocationApi => {
  const loggedIn = useAuthStore((s) => !!s.token);
  const queryClient = useQueryClient();

  const guestLocation = useAirLocationStore((s) => s.location);
  const guestSet = useAirLocationStore((s) => s.setLocation);
  const guestClear = useAirLocationStore((s) => s.clear);

  const query = useQuery({
    queryKey: AIR_LOCATION_KEY,
    queryFn: () => airLocationApi.get(),
    enabled: loggedIn,
    staleTime: 60_000,
  });

  const upsert = useMutation({
    mutationFn: (body: AirLocationUpsertBodyType) => airLocationApi.upsert(body),
    onSuccess: (result) => {
      queryClient.setQueryData<AirLocationResultType>(AIR_LOCATION_KEY, result);
    },
  });
  const remove = useMutation({
    mutationFn: () => airLocationApi.remove(),
    onSuccess: (result) => {
      queryClient.setQueryData<AirLocationResultType>(AIR_LOCATION_KEY, result);
    },
  });

  // ── 로그인 직후 게스트 저장분 업로드(서버가 비어 있을 때만, 1회) ──────────
  const mergedRef = useRef(false);
  const serverLocation = query.data?.location ?? null;
  useEffect(() => {
    if (!loggedIn) {
      mergedRef.current = false;
      return;
    }
    if (mergedRef.current || !query.isSuccess || serverLocation) return;
    const guest = useAirLocationStore.getState().location;
    if (!guest) return;
    mergedRef.current = true;
    upsert.mutate(
      { lat: guest.lat, lng: guest.lng, label: guest.label, source: guest.source },
      {
        onSuccess: () => useAirLocationStore.getState().clear(),
        onError: () => {
          mergedRef.current = false;
        },
      },
    );
    // 로그인/조회 성공/서버 값 유무만 추적 — 게스트 store 는 getState 스냅샷.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn, query.isSuccess, serverLocation]);

  const location = loggedIn ? serverLocation : guestLocation;

  return {
    location,
    isLoading: loggedIn && query.isLoading,
    isSaving: upsert.isPending || remove.isPending,
    save: (body) => {
      if (loggedIn) upsert.mutate(body);
      else guestSet(body);
    },
    clear: () => {
      if (loggedIn) remove.mutate();
      else guestClear();
    },
  };
};
