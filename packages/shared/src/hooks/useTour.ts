import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TourBizCheckBodyType } from '@repo/api-contract';
import { tourApi, type TourSeedParams } from '../api/tour.api.js';

// 여행로그 관리자 훅 — 상태·시드 목록은 쿼리, 후보 찾기·등록·매칭·폐업 조회는 뮤테이션. 매칭/폐업 조회가 끝나면
// 상태와 목록을 무효화해 배지가 바로 바뀐다. 등록(크롤 잡)은 비동기라 목록은 매칭 재실행 뒤에 갱신된다.

const KEY = ['admin', 'tour'] as const;

export const useTourAdminStatus = () =>
  useQuery({
    queryKey: [...KEY, 'status'],
    queryFn: () => tourApi.adminStatus(),
    staleTime: 30_000,
  });

export const useTourSeeds = (params: TourSeedParams) =>
  useQuery({
    queryKey: [...KEY, 'seeds', params.region ?? 'jeju', params.minTravelers ?? 5, params.status ?? 'all', params.q ?? '', params.limit ?? 50, params.offset ?? 0],
    queryFn: () => tourApi.adminSeeds(params),
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });

export const useTourSeedDiscover = () =>
  useMutation({
    mutationFn: (placeId: string) => tourApi.adminDiscover(placeId),
  });

export const useTourSeedRegister = () =>
  useMutation({
    mutationFn: ({ placeId, rawSourceUrl }: { placeId: string; rawSourceUrl: string }) => tourApi.adminRegister(placeId, rawSourceUrl),
  });

export const useTourMatchRun = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => tourApi.adminMatchRun(),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
};

export const useTourBizCheck = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<TourBizCheckBodyType>) => tourApi.adminBizCheck(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
};
