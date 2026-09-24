import { Routes, type SeaActivityType, type SeaForecastResultType, type SeaTideResultType } from '@repo/api-contract';
import { apiFetch } from './client.js';

// 바다(국립해양조사원 생활해양예보지수·조석예보) — friendly 프록시(공개, 토큰 불필요). 서버가 활동별 1시간,
// 물때는 지점·날짜별 12시간 캐시하므로 클라이언트는 가볍게 다시 불러도 된다.
export const seaApi = {
  // 활동별 지점 × 7일 오전/오후 지수.
  forecast: (activity: SeaActivityType) =>
    apiFetch<SeaForecastResultType>(`${Routes.Sea.forecast}?${new URLSearchParams({ activity }).toString()}`),
  // 좌표에서 가장 가까운 조석 예보지점의 하루 만조·간조.
  tide: (lat: number, lng: number, date: string) => {
    const params = new URLSearchParams({ lat: lat.toFixed(5), lng: lng.toFixed(5), date });
    return apiFetch<SeaTideResultType>(`${Routes.Sea.tide}?${params.toString()}`);
  },
};
