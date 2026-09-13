import {
  Routes,
  type TourAdminStatusType,
  type TourBizCheckBodyType,
  type TourBizCheckResultType,
  type TourMatchRunResultType,
  type TourSeedDiscoverResultType,
  type TourSeedListType,
  type TourSeedQueryType,
  type TourSeedRegisterResultType,
} from '@repo/api-contract';
import { apiFetch } from './client.js';

// 여행로그(AI 허브 71780) 관리자 시드 콘솔 API — 전부 admin 토큰. 공개 집계 API 는 4차에서 같은 파일에 합류.

export type TourSeedParams = Partial<TourSeedQueryType>;

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

export const tourApi = {
  adminStatus: () => apiFetch<TourAdminStatusType>(Routes.Tour.adminStatus),
  adminSeeds: (p: TourSeedParams = {}) => apiFetch<TourSeedListType>(`${Routes.Tour.adminSeeds}${seedsQuery(p)}`),
  adminDiscover: (placeId: string) => apiFetch<TourSeedDiscoverResultType>(Routes.Tour.adminSeedDiscover(placeId), { method: 'POST' }),
  adminRegister: (placeId: string, rawSourceUrl: string) =>
    apiFetch<TourSeedRegisterResultType>(Routes.Tour.adminSeedRegister(placeId), { method: 'POST', body: JSON.stringify({ rawSourceUrl }) }),
  adminMatchRun: () => apiFetch<TourMatchRunResultType>(Routes.Tour.adminMatchRun, { method: 'POST' }),
  adminBizCheck: (body: Partial<TourBizCheckBodyType> = {}) =>
    apiFetch<TourBizCheckResultType>(Routes.Tour.adminBizStatusRun, { method: 'POST', body: JSON.stringify(body) }),
};
