import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TourBizCheckBodyType, TourDensityKindType, TourPlanBodyType } from '@repo/api-contract';
import { getTourPhotoBase, tourApi, type TourInsightsParams, type TourRawPageParams, type TourSeedParams } from '../api/tour.api.js';

// ── 공개 — 인사이트는 필터 키로 캐시(재적재 때만 바뀌는 값, 10분), 코스 추천은 제출형이라 뮤테이션.
export const tourInsightsKey = (p: TourInsightsParams): string =>
  [p.region ?? 'jeju', p.ageGrp ?? '', p.gender ?? '', p.accompany ?? '', p.month ?? '', p.nights ?? ''].join('|');

export const useTourInsights = (params: TourInsightsParams, enabled = true) =>
  useQuery({
    queryKey: ['tour', 'public', 'insights', tourInsightsKey(params)],
    queryFn: () => tourApi.publicInsights(params),
    enabled,
    placeholderData: (prev) => prev,
    staleTime: 10 * 60_000,
  });

export const useTourPlan = () =>
  useMutation({
    mutationFn: (body: Partial<TourPlanBodyType>) => tourApi.publicPlan(body),
  });

// 6차 — 밀도 격자는 정적(재적재 때만)이라 24h, 배경 레이어를 켠 동안만(enabled). 숙소·지역 비교는 인사이트와 같은 필터 키.
const DENSITY_STALE_MS = 24 * 60 * 60_000;
export const useTourDensity = (kind: TourDensityKindType, enabled = true) =>
  useQuery({
    queryKey: ['tour', 'public', 'density', kind],
    queryFn: () => tourApi.publicDensity(kind),
    enabled,
    staleTime: DENSITY_STALE_MS,
    placeholderData: enabled ? (prev) => prev : undefined,
  });

export const useTourLodging = (params: TourInsightsParams, enabled = true) =>
  useQuery({
    queryKey: ['tour', 'public', 'lodging', tourInsightsKey(params)],
    queryFn: () => tourApi.publicLodging(params),
    enabled,
    placeholderData: (prev) => prev,
    staleTime: 10 * 60_000,
  });

export const useTourRegions = (params: TourInsightsParams, enabled = true) =>
  useQuery({
    queryKey: ['tour', 'public', 'regions', tourInsightsKey(params)],
    queryFn: () => tourApi.publicRegions(params),
    enabled,
    placeholderData: (prev) => prev,
    staleTime: 10 * 60_000,
  });

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

// ── 3차 원본 열람 — placeId 가 null 이면 비활성(탭이 닫혀 있을 때). 404 는 allowlist 밖 또는 없는 장소.
const RAW_STALE_MS = 5 * 60_000;
const rawKey = (kind: string, id: string | null, p: TourRawPageParams) => [...KEY, 'raw', kind, id, p.limit ?? 50, p.offset ?? 0] as const;

export const useTourRawVisits = (placeId: string | null, p: TourRawPageParams = {}) =>
  useQuery({ queryKey: rawKey('visits', placeId, p), queryFn: () => tourApi.adminPlaceVisits(placeId!, p), enabled: placeId !== null, staleTime: RAW_STALE_MS, retry: false });
export const useTourRawActivities = (placeId: string | null, p: TourRawPageParams = {}) =>
  useQuery({ queryKey: rawKey('activities', placeId, p), queryFn: () => tourApi.adminPlaceActivities(placeId!, p), enabled: placeId !== null, staleTime: RAW_STALE_MS, retry: false });
export const useTourRawSpend = (placeId: string | null, p: TourRawPageParams = {}) =>
  useQuery({ queryKey: rawKey('spend', placeId, p), queryFn: () => tourApi.adminPlaceSpend(placeId!, p), enabled: placeId !== null, staleTime: RAW_STALE_MS, retry: false });
export const useTourRawPhotos = (placeId: string | null, p: TourRawPageParams = {}) =>
  useQuery({ queryKey: rawKey('photos', placeId, p), queryFn: () => tourApi.adminPlacePhotos(placeId!, p), enabled: placeId !== null, staleTime: RAW_STALE_MS, retry: false });
export const useTourRawTrips = (placeId: string | null, p: TourRawPageParams = {}) =>
  useQuery({ queryKey: rawKey('trips', placeId, p), queryFn: () => tourApi.adminPlaceTrips(placeId!, p), enabled: placeId !== null, staleTime: RAW_STALE_MS, retry: false });
export const useTourRawTrip = (travelId: string | null) =>
  useQuery({ queryKey: [...KEY, 'raw', 'trip', travelId], queryFn: () => tourApi.adminTrip(travelId!), enabled: travelId !== null, staleTime: RAW_STALE_MS, retry: false });

// 사진 URL 조립용 base(토큰) — 세션 동안 한 번.
export const useTourPhotoBase = (enabled = true) =>
  useQuery({ queryKey: [...KEY, 'photo-base'], queryFn: () => getTourPhotoBase(), enabled, staleTime: 30 * 60_000 });
