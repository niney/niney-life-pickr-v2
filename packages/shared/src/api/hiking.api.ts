import {
  Routes,
  type HikingAroundType,
  type HikingConditionsType,
  type HikingCourseDetailType,
  type HikingMountainDetailType,
  type HikingMountainsResultType,
  type HikingRecommendQueryType,
  type HikingRecommendResultType,
} from '@repo/api-contract';
import { apiFetch } from './client.js';

// 등산(100대 명산·전국 주요 봉우리·국립공원 공식 코스) — friendly 적재본 조회(공개, 토큰 불필요). 적재본은 배포 때만 바뀐다. 오늘의 조건·추천만 업스트림(날씨·
// 대기·산불)을 서버 캐시로 부른다.
export type HikingRecommendParams = Partial<Pick<HikingRecommendQueryType, 'lat' | 'lng' | 'date' | 'start'>> &
  Pick<HikingRecommendQueryType, 'duration' | 'level' | 'mode'> & { limit?: number };

const recommendQs = (p: HikingRecommendParams): string => {
  const params = new URLSearchParams({ duration: p.duration, level: p.level, mode: p.mode });
  if (p.lat !== undefined && p.lng !== undefined) {
    params.set('lat', p.lat.toFixed(4));
    params.set('lng', p.lng.toFixed(4));
  }
  if (p.date) params.set('date', p.date);
  if (p.start) params.set('start', p.start);
  if (p.limit !== undefined) params.set('limit', String(p.limit));
  return params.toString();
};

export const hikingApi = {
  mountains: () => apiFetch<HikingMountainsResultType>(Routes.Hiking.mountains),
  mountain: (id: string) => apiFetch<HikingMountainDetailType>(Routes.Hiking.mountain(id)),
  course: (id: string) => apiFetch<HikingCourseDetailType>(Routes.Hiking.course(id)),
  conditions: (id: string) => apiFetch<HikingConditionsType>(Routes.Hiking.conditions(id)),
  around: (id: string) => apiFetch<HikingAroundType>(Routes.Hiking.around(id)),
  recommend: (p: HikingRecommendParams) => apiFetch<HikingRecommendResultType>(`${Routes.Hiking.recommend}?${recommendQs(p)}`),
};
