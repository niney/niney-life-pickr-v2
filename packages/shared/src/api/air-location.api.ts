import {
  Routes,
  type AirLocationResultType,
  type AirLocationUpsertBodyType,
} from '@repo/api-contract';
import { apiFetch } from './client.js';

// 내 대기 위치 — 로그인 사용자의 서버 저장분(Bearer 인증, 미로그인 401). 변경(PUT/DELETE)
// 응답은 변경 후 상태라 클라이언트가 캐시를 통째로 교체한다. 게스트 저장분은
// airLocationStore(클라이언트 persist).
export const airLocationApi = {
  get: () => apiFetch<AirLocationResultType>(Routes.AirQuality.location),
  upsert: (body: AirLocationUpsertBodyType) =>
    apiFetch<AirLocationResultType>(Routes.AirQuality.location, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  remove: () =>
    apiFetch<AirLocationResultType>(Routes.AirQuality.location, { method: 'DELETE' }),
};
