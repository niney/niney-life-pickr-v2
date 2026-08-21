import {
  Routes,
  type WeatherForecastResultType,
  type WeatherMidResultType,
  type WeatherMidSeaResultType,
  type WeatherNowcastResultType,
  type WeatherVersionsResultType,
} from '@repo/api-contract';
import { apiFetch } from './client.js';

// 기상청 날씨 — friendly 프록시(공개, 토큰 불필요). 서버가 발표 시각 단위로 캐시하고
// stale 폴백을 얹으므로 클라이언트는 가볍게 폴링해도 된다.
export const weatherApi = {
  // 초단기실황 + 초단기예보(6시간) — 격자(nx,ny). 위·경도는 @repo/utils latLngToKmaGrid 로.
  nowcast: (nx: number, ny: number) => {
    const params = new URLSearchParams({ nx: String(nx), ny: String(ny) });
    return apiFetch<WeatherNowcastResultType>(`${Routes.Weather.nowcast}?${params.toString()}`);
  },
  // 단기예보(+3일 시각별 + 일별 요약).
  forecast: (nx: number, ny: number) => {
    const params = new URLSearchParams({ nx: String(nx), ny: String(ny) });
    return apiFetch<WeatherForecastResultType>(`${Routes.Weather.forecast}?${params.toString()}`);
  },
  // 예보 버전(ODAM/VSRT/SHRT).
  versions: () => apiFetch<WeatherVersionsResultType>(Routes.Weather.versions),
  // 중기육상 + 중기기온 + 중기전망(stn 생략 시 전망 없음).
  mid: (land: string, ta: string, stn?: string) => {
    const params = new URLSearchParams({ land, ta });
    if (stn) params.set('stn', stn);
    return apiFetch<WeatherMidResultType>(`${Routes.Weather.mid}?${params.toString()}`);
  },
  // 중기해상예보.
  midSea: (regId: string) => {
    const params = new URLSearchParams({ regId });
    return apiFetch<WeatherMidSeaResultType>(`${Routes.Weather.midSea}?${params.toString()}`);
  },
};
