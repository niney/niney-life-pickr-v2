import {
  Routes,
  type AirBadStationsResultType,
  type AirForecastResultType,
  type AirHistoryTermType,
  type AirSidoRealtimeResultType,
  type AirStationHistoryResultType,
  type AirWeeklyForecastResultType,
} from '@repo/api-contract';
import { apiFetch } from './client.js';

// 에어코리아 대기오염정보 — friendly 프록시(공개, 토큰 불필요). 서버가 측정 10분·
// 예보 20~60분 캐시와 stale 폴백을 얹으므로 클라이언트는 가볍게 폴링해도 된다.
export const airQualityApi = {
  // 시도별 실시간 측정소 목록 — sidoName 은 업스트림 어휘(전국/서울/…/전남광주).
  // 서버가 '전국' 1콜 캐시를 거르므로 시도를 바꿔도 업스트림 추가 호출이 없다.
  sidoRealtime: (sidoName: string) =>
    apiFetch<AirSidoRealtimeResultType>(Routes.AirQuality.sidoRealtime(sidoName)),
  // 측정소 시계열 — DAILY(시간별 24h) / MONTH·3MONTH(일평균). latest 에 최신 행 상세.
  stationHistory: (stationName: string, term: AirHistoryTermType = 'DAILY') => {
    const params = new URLSearchParams();
    params.set('term', term);
    return apiFetch<AirStationHistoryResultType>(
      `${Routes.AirQuality.stationHistory(stationName)}?${params.toString()}`,
    );
  },
  // 통합대기환경지수 나쁨 이상 측정소.
  badStations: () => apiFetch<AirBadStationsResultType>(Routes.AirQuality.badStations),
  // 대기질 예보통보 — date 생략 시 오늘(없으면 서버가 전일 폴백).
  forecast: (date?: string) => {
    const params = new URLSearchParams();
    if (date) params.set('date', date);
    const qs = params.toString();
    return apiFetch<AirForecastResultType>(`${Routes.AirQuality.forecast}${qs ? `?${qs}` : ''}`);
  },
  // 초미세먼지 주간예보 — date(발표일) 생략 시 오늘→전일 폴백.
  weeklyForecast: (date?: string) => {
    const params = new URLSearchParams();
    if (date) params.set('date', date);
    const qs = params.toString();
    return apiFetch<AirWeeklyForecastResultType>(
      `${Routes.AirQuality.weeklyForecast}${qs ? `?${qs}` : ''}`,
    );
  },
};
