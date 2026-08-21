import { useQuery } from '@tanstack/react-query';
import type { AirHistoryTermType } from '@repo/api-contract';
import { airQualityApi } from '../api/air-quality.api.js';

// 에어코리아 대기정보 훅 — 측정값은 매시 정각 갱신(보통 +10~20분 반영)이라 분 단위
// 폴링은 낭비다. 서버 캐시(10분)에 맞춰 staleTime 5분·10분 주기 재조회로 탭이 열려
// 있는 동안 한 시간에 6번만 묻는다(refetchIntervalInBackground 기본 false → 탭이
// 비활성이면 자동 중단). placeholderData 로 시도/측정소 전환 시 이전 화면을 디밍
// 유지(깜빡임 없음, dataviz 의 "refetch keeps the frame").

const MEASURE_STALE_MS = 5 * 60_000;
const MEASURE_REFETCH_MS = 10 * 60_000;
const FORECAST_STALE_MS = 15 * 60_000;
const WEEKLY_STALE_MS = 30 * 60_000;

// 시도별 실시간 측정소 목록(+전국). sidoName null 이면 비활성.
export const useAirSidoRealtime = (sidoName: string | null) => {
  const enabled = !!sidoName;
  return useQuery({
    queryKey: ['air', 'sido', sidoName],
    queryFn: () => airQualityApi.sidoRealtime(sidoName!),
    enabled,
    staleTime: MEASURE_STALE_MS,
    refetchInterval: MEASURE_REFETCH_MS,
    placeholderData: enabled ? (prev) => prev : undefined,
  });
};

// 측정소 시계열(DAILY 시간별 / MONTH·3MONTH 일평균) + latest 상세.
export const useAirStationHistory = (stationName: string | null, term: AirHistoryTermType) => {
  const enabled = !!stationName;
  return useQuery({
    queryKey: ['air', 'station', stationName, term],
    queryFn: () => airQualityApi.stationHistory(stationName!, term),
    enabled,
    staleTime: MEASURE_STALE_MS,
    refetchInterval: MEASURE_REFETCH_MS,
    placeholderData: enabled ? (prev) => prev : undefined,
  });
};

// 통합대기환경지수 나쁨 이상 측정소 목록.
export const useAirBadStations = () =>
  useQuery({
    queryKey: ['air', 'bad-stations'],
    queryFn: () => airQualityApi.badStations(),
    staleTime: MEASURE_STALE_MS,
    refetchInterval: MEASURE_REFETCH_MS,
  });

// 대기질 예보통보(PM10/PM25/O3 × 오늘/내일/모레). date 생략 = 오늘(서버 전일 폴백).
export const useAirForecast = (date?: string) =>
  useQuery({
    queryKey: ['air', 'forecast', date ?? 'auto'],
    queryFn: () => airQualityApi.forecast(date),
    staleTime: FORECAST_STALE_MS,
  });

// 초미세먼지 주간예보(D+3~D+6).
export const useAirWeeklyForecast = (date?: string) =>
  useQuery({
    queryKey: ['air', 'forecast', 'weekly', date ?? 'auto'],
    queryFn: () => airQualityApi.weeklyForecast(date),
    staleTime: WEEKLY_STALE_MS,
  });
