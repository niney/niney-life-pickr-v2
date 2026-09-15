import {
  Routes,
  type TourAdminStatusType,
  type TourBizCheckBodyType,
  type TourBizCheckResultType,
  type TourDensityKindType,
  type TourDensityResultType,
  type TourInsightsQueryType,
  type TourInsightsResultType,
  type TourLodgingResultType,
  type TourMatchRunResultType,
  type TourPlanBodyType,
  type TourPlanResultType,
  type TourRegionsResultType,
  type TourPhotoSizeType,
  type TourRawActivitiesResultType,
  type TourRawPageQueryType,
  type TourRawPhotosResultType,
  type TourRawSpendResultType,
  type TourRawTripDetailType,
  type TourRawTripsResultType,
  type TourRawVisitsResultType,
  type TourSeedDiscoverResultType,
  type TourSeedListType,
  type TourSeedQueryType,
  type TourSeedRegisterResultType,
} from '@repo/api-contract';
import { apiFetch, getApiConfig } from './client.js';

// 여행로그(AI 허브 71780) 관리자 API — 2차 시드 콘솔 + 3차 원본 열람(allowlist, 404 로 거절). 전부 admin 토큰.
// 공개 집계 API 는 4차에서 같은 파일에 합류.

export type TourSeedParams = Partial<TourSeedQueryType>;
export type TourRawPageParams = Partial<TourRawPageQueryType>;

const pageQuery = (p: TourRawPageParams): string => {
  const sp = new URLSearchParams();
  if (p.limit !== undefined) sp.set('limit', String(p.limit));
  if (p.offset !== undefined) sp.set('offset', String(p.offset));
  const qs = sp.toString();
  return qs ? `?${qs}` : '';
};

export interface TourPhotoBase {
  baseUrl: string;
  token: string;
}

// <img src> 는 Authorization 헤더를 못 실으므로 SSE 처럼 ?token= 으로 — 한 번 받아 두고 URL 을 조립한다.
export const getTourPhotoBase = async (): Promise<TourPhotoBase> => {
  const cfg = getApiConfig();
  const token = (await cfg.getToken?.()) ?? '';
  return { baseUrl: cfg.baseUrl, token };
};

export const tourPhotoUrl = (base: TourPhotoBase, photoId: string, size: TourPhotoSizeType): string => {
  const qs = base.token ? `?token=${encodeURIComponent(base.token)}` : '';
  return `${base.baseUrl}${Routes.Tour.adminPhoto(photoId, size)}${qs}`;
};

const seedsQuery = (p: TourSeedParams): string => {
  const sp = new URLSearchParams();
  if (p.region) sp.set('region', p.region);
  if (p.minTravelers !== undefined) sp.set('minTravelers', String(p.minTravelers));
  if (p.status) sp.set('status', p.status);
  if (p.q) sp.set('q', p.q);
  if (p.limit !== undefined) sp.set('limit', String(p.limit));
  if (p.offset !== undefined) sp.set('offset', String(p.offset));
  const qs = sp.toString();
  return qs ? `?${qs}` : '';
};

// 인사이트 필터 — 서버 zod 가 기본값(region=jeju)을 채우므로 Partial. 빈 값은 보내지 않는다. region 은 utils TOUR_REGION_KEYS.
export type TourInsightsParams = Partial<TourInsightsQueryType>;

const insightsQuery = (p: TourInsightsParams): string => {
  const sp = new URLSearchParams();
  if (p.region) sp.set('region', p.region);
  if (p.ageGrp) sp.set('ageGrp', p.ageGrp);
  if (p.gender) sp.set('gender', p.gender);
  if (p.accompany) sp.set('accompany', p.accompany);
  if (p.month !== undefined) sp.set('month', String(p.month));
  if (p.nights !== undefined) sp.set('nights', String(p.nights));
  const qs = sp.toString();
  return qs ? `?${qs}` : '';
};

export const tourApi = {
  // ── 공개(인증 없음) — 인사이트·코스 추천. 응답은 집계뿐.
  publicInsights: (p: TourInsightsParams = {}) => apiFetch<TourInsightsResultType>(`${Routes.Tour.publicInsights}${insightsQuery(p)}`),
  publicPlan: (body: Partial<TourPlanBodyType>) => apiFetch<TourPlanResultType>(Routes.Tour.publicPlan, { method: 'POST', body: JSON.stringify(body) }),
  // 6차 — 밀도 격자(전국 칸 전부, 수백 개 — bbox 는 선택) / 숙소 / 지역 비교(필터 축 동일).
  publicDensity: (kind: TourDensityKindType = 'all', bbox?: string) =>
    apiFetch<TourDensityResultType>(`${Routes.Tour.publicDensity}?kind=${kind}${bbox ? `&bbox=${encodeURIComponent(bbox)}` : ''}`),
  publicLodging: (p: TourInsightsParams = {}) => apiFetch<TourLodgingResultType>(`${Routes.Tour.publicLodging}${insightsQuery(p)}`),
  publicRegions: (p: TourInsightsParams = {}) => apiFetch<TourRegionsResultType>(`${Routes.Tour.publicRegions}${insightsQuery(p)}`),

  adminStatus: () => apiFetch<TourAdminStatusType>(Routes.Tour.adminStatus),
  adminSeeds: (p: TourSeedParams = {}) => apiFetch<TourSeedListType>(`${Routes.Tour.adminSeeds}${seedsQuery(p)}`),
  adminDiscover: (placeId: string) => apiFetch<TourSeedDiscoverResultType>(Routes.Tour.adminSeedDiscover(placeId), { method: 'POST' }),
  adminRegister: (placeId: string, rawSourceUrl: string) =>
    apiFetch<TourSeedRegisterResultType>(Routes.Tour.adminSeedRegister(placeId), { method: 'POST', body: JSON.stringify({ rawSourceUrl }) }),
  adminMatchRun: () => apiFetch<TourMatchRunResultType>(Routes.Tour.adminMatchRun, { method: 'POST' }),
  adminBizCheck: (body: Partial<TourBizCheckBodyType> = {}) =>
    apiFetch<TourBizCheckResultType>(Routes.Tour.adminBizStatusRun, { method: 'POST', body: JSON.stringify(body) }),

  // ── 3차 원본 열람(allowlist) ──
  adminPlaceVisits: (placeId: string, p: TourRawPageParams = {}) => apiFetch<TourRawVisitsResultType>(`${Routes.Tour.adminPlaceVisits(placeId)}${pageQuery(p)}`),
  adminPlaceActivities: (placeId: string, p: TourRawPageParams = {}) =>
    apiFetch<TourRawActivitiesResultType>(`${Routes.Tour.adminPlaceActivities(placeId)}${pageQuery(p)}`),
  adminPlaceSpend: (placeId: string, p: TourRawPageParams = {}) => apiFetch<TourRawSpendResultType>(`${Routes.Tour.adminPlaceSpend(placeId)}${pageQuery(p)}`),
  adminPlacePhotos: (placeId: string, p: TourRawPageParams = {}) => apiFetch<TourRawPhotosResultType>(`${Routes.Tour.adminPlacePhotos(placeId)}${pageQuery(p)}`),
  adminPlaceTrips: (placeId: string, p: TourRawPageParams = {}) => apiFetch<TourRawTripsResultType>(`${Routes.Tour.adminPlaceTrips(placeId)}${pageQuery(p)}`),
  adminTrip: (travelId: string) => apiFetch<TourRawTripDetailType>(Routes.Tour.adminTrip(travelId)),
};
