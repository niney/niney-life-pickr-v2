import { useQuery } from '@tanstack/react-query';
import type { SeaActivityType } from '@repo/api-contract';
import { seaApi } from '../api/sea.api.js';

// 바다 예보 훅 — 업스트림 지수는 하루 몇 번만 바뀌고 서버가 1시간 캐시하므로 30분 stale·1시간 재조회면 충분.
// 활동 전환 시 이전 활동 화면을 들고 있지 않는다(지점 집합이 달라 섞이면 오해) — placeholderData 없음.

const FORECAST_STALE_MS = 30 * 60_000;
const FORECAST_REFETCH_MS = 60 * 60_000;
// 물때는 천문조 계산값 — 하루 안에 바뀌지 않는다.
const TIDE_STALE_MS = 6 * 60 * 60_000;

export const useSeaForecast = (activity: SeaActivityType) =>
  useQuery({
    queryKey: ['sea', 'forecast', activity],
    queryFn: () => seaApi.forecast(activity),
    staleTime: FORECAST_STALE_MS,
    refetchInterval: FORECAST_REFETCH_MS,
  });

// 좌표·날짜가 없으면 비활성. 좌표는 소수 3자리(≈100m)로 키를 묶는다 — 서버가 가장 가까운 예보지점으로 모은다.
export const useSeaTide = (point: { lat: number; lng: number } | null, date: string | null) => {
  const enabled = point !== null && date !== null;
  return useQuery({
    queryKey: ['sea', 'tide', point?.lat.toFixed(3), point?.lng.toFixed(3), date],
    queryFn: () => seaApi.tide(point!.lat, point!.lng, date!),
    enabled,
    staleTime: TIDE_STALE_MS,
  });
};
