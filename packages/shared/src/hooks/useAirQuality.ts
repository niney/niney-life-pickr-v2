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

// 전국 측정소 목록(좌표) — 사실상 정적. 24시간 stale, 재시도 없음(활용신청 전 503 은
// 재시도해도 같다 — FE 가 안내를 띄운다).
export const useAirStations = () =>
  useQuery({
    queryKey: ['air', 'stations'],
    queryFn: () => airQualityApi.stations(),
    staleTime: 24 * 60 * 60_000,
    gcTime: 24 * 60 * 60_000,
    retry: false,
  });

// 좌표 기반 내 주변 측정소 — 좌표는 호출자가 Geolocation 으로 확정해 넘긴다. 소수
// 4자리 스냅(≈11m)으로 GPS 흔들림에 쿼리 키가 갈라지지 않게(버스/지하철 미러).
// 측정값 조인이 붙어 있어 다른 측정 훅과 같은 10분 리듬으로 재조회한다(탭이 보일 때만;
// 서버 10분 캐시 뒤라 업스트림 추가 호출은 없다). 재조회 중엔 기존 데이터가 유지돼
// 상단바 칩처럼 상주하는 표시가 깜빡이지 않는다. refetchOnWindowFocus 는 상주 표시
// (칩)만 켠다 — 오래 떠나 있다 돌아온 탭이 즉시 최신화되도록.
export const useAirNearbyStations = (
  lat: number | null,
  lng: number | null,
  opts: { radius?: number; limit?: number; refetchOnWindowFocus?: boolean } = {},
) => {
  const enabled = lat !== null && lng !== null;
  const keyLat = lat !== null ? lat.toFixed(4) : null;
  const keyLng = lng !== null ? lng.toFixed(4) : null;
  const { refetchOnWindowFocus, ...apiOpts } = opts;
  return useQuery({
    queryKey: ['air', 'stations', 'nearby', keyLat, keyLng, apiOpts.radius ?? null, apiOpts.limit ?? null],
    queryFn: () => airQualityApi.nearbyStations(lat!, lng!, apiOpts),
    enabled,
    staleTime: MEASURE_STALE_MS,
    refetchInterval: MEASURE_REFETCH_MS,
    ...(refetchOnWindowFocus !== undefined ? { refetchOnWindowFocus } : {}),
    placeholderData: enabled ? (prev) => prev : undefined,
  });
};

// 측정소명/주소 라이브 검색 — 서버 로컬 검색이라 쿼터 부담 0. 1~30자일 때만.
// 타이핑 지연은 호출부(useDeferredValue/디바운스)가 맡는다.
export const useAirStationSearch = (q: string) => {
  const trimmed = q.trim();
  const enabled = trimmed.length >= 1 && trimmed.length <= 30;
  return useQuery({
    queryKey: ['air', 'stations', 'search', trimmed],
    queryFn: () => airQualityApi.searchStations(trimmed),
    enabled,
    staleTime: 24 * 60 * 60_000,
    placeholderData: enabled ? (prev) => prev : undefined,
  });
};

// 초미세먼지 주간예보(D+3~D+6).
export const useAirWeeklyForecast = (date?: string) =>
  useQuery({
    queryKey: ['air', 'forecast', 'weekly', date ?? 'auto'],
    queryFn: () => airQualityApi.weeklyForecast(date),
    staleTime: WEEKLY_STALE_MS,
  });
