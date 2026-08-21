import { useQuery } from '@tanstack/react-query';
import { weatherApi } from '../api/weather.api.js';

// 기상청 날씨 훅 — 실황은 매시 :10, 초단기예보는 :45, 단기예보는 3시간마다(+10분), 중기는
// 06/18시 발표. 서버가 "다음 발표 시각까지" 캐시하므로 클라이언트는 10분 주기 재조회로
// 충분하다(탭이 보일 때만; refetchIntervalInBackground 기본 false). placeholderData 로
// 지점 전환 시 이전 화면을 디밍 유지(대기정보와 같은 규율).

const NOWCAST_STALE_MS = 5 * 60_000;
const NOWCAST_REFETCH_MS = 10 * 60_000;
const FORECAST_STALE_MS = 10 * 60_000;
const FORECAST_REFETCH_MS = 30 * 60_000;
const MID_STALE_MS = 30 * 60_000;
const MID_REFETCH_MS = 60 * 60_000;

// 초단기실황 + 초단기예보 — 격자 null 이면 비활성.
export const useWeatherNowcast = (nx: number | null, ny: number | null) => {
  const enabled = nx !== null && ny !== null;
  return useQuery({
    queryKey: ['weather', 'nowcast', nx, ny],
    queryFn: () => weatherApi.nowcast(nx!, ny!),
    enabled,
    staleTime: NOWCAST_STALE_MS,
    refetchInterval: NOWCAST_REFETCH_MS,
    placeholderData: enabled ? (prev) => prev : undefined,
  });
};

// 단기예보(+3일).
export const useWeatherForecast = (nx: number | null, ny: number | null) => {
  const enabled = nx !== null && ny !== null;
  return useQuery({
    queryKey: ['weather', 'forecast', nx, ny],
    queryFn: () => weatherApi.forecast(nx!, ny!),
    enabled,
    staleTime: FORECAST_STALE_MS,
    refetchInterval: FORECAST_REFETCH_MS,
    placeholderData: enabled ? (prev) => prev : undefined,
  });
};

// 예보 버전 — 발표 정보 섹션용.
export const useWeatherVersions = () =>
  useQuery({
    queryKey: ['weather', 'versions'],
    queryFn: () => weatherApi.versions(),
    staleTime: NOWCAST_STALE_MS,
    refetchInterval: NOWCAST_REFETCH_MS,
  });

// 중기육상 + 중기기온 + 중기전망 — land/ta null 이면 비활성.
export const useWeatherMid = (land: string | null, ta: string | null, stn?: string | null) => {
  const enabled = !!land && !!ta;
  return useQuery({
    queryKey: ['weather', 'mid', land, ta, stn ?? null],
    queryFn: () => weatherApi.mid(land!, ta!, stn ?? undefined),
    enabled,
    staleTime: MID_STALE_MS,
    refetchInterval: MID_REFETCH_MS,
    placeholderData: enabled ? (prev) => prev : undefined,
  });
};

// 중기해상예보 — regId null 이면 비활성.
export const useWeatherMidSea = (regId: string | null) => {
  const enabled = !!regId;
  return useQuery({
    queryKey: ['weather', 'mid-sea', regId],
    queryFn: () => weatherApi.midSea(regId!),
    enabled,
    staleTime: MID_STALE_MS,
    refetchInterval: MID_REFETCH_MS,
    placeholderData: enabled ? (prev) => prev : undefined,
  });
};
