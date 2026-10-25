import { Routes, type HikingCourseDetailType, type HikingMountainDetailType, type HikingMountainsResultType } from '@repo/api-contract';
import { apiFetch } from './client.js';

// 등산(100대 명산 코스) — friendly 적재본 조회(공개, 토큰 불필요). 적재본은 배포 때만 바뀐다.
export const hikingApi = {
  mountains: () => apiFetch<HikingMountainsResultType>(Routes.Hiking.mountains),
  mountain: (id: string) => apiFetch<HikingMountainDetailType>(Routes.Hiking.mountain(id)),
  course: (id: string) => apiFetch<HikingCourseDetailType>(Routes.Hiking.course(id)),
};
