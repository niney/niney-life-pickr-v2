import type { AirLocationItemType, AirNearbyResultType, WeatherBaseType } from '@repo/api-contract';
import {
  KMA_CONDITION_LABEL,
  kmaCondition,
  latLngToKmaGrid,
  type AirGradeLevel,
  type KmaConditionKey,
} from '@repo/utils';
import { useAirLocation } from './useAirLocation.js';
import { useAirNearbyStations } from './useAirQuality.js';
import { useWeatherNowcast } from './useWeather.js';

// 저장한 내 위치 한 곳의 "한눈에" 날씨·공기 — 웹 상단바 칩(MyLocationChip)과 앱 홈 카드가 같은
// 파생값을 쓴다(문구·링크·색은 각 화면의 몫).
//   날씨: 좌표→격자 실황 기온 + 초단기 첫 시각 하늘(실황엔 하늘상태가 없다) + 앞 6시간 강수(형태가
//         있거나 확률 ≥60%) → 우산(wet).
//   대기: 가장 가까운 측정소 1곳의 등급(통합지수 → PM2.5 → PM10 폴백). 측정소는 있어도 측정값이
//         없으면(업스트림 장애) ok=false — 화면은 그 세그먼트만 조용히 뺀다("● -" 를 남기지 않는다).
// 둘 다 서버 캐시 뒤라 10분 조용한 갱신. refetchOnWindowFocus 는 상주 표시(칩·카드)에서 켠다.

export const GLANCE_RAIN_POP_THRESHOLD = 60;
export const GLANCE_AIR_RADIUS_M = 50_000;

export type GlanceAirGradeSource = 'khai' | 'pm25' | 'pm10';
export const GLANCE_AIR_GRADE_SOURCE_LABEL: Record<GlanceAirGradeSource, string> = {
  khai: '통합지수',
  pm25: 'PM2.5',
  pm10: 'PM10',
};

export interface MyLocationGlanceWeather {
  // 첫 로딩(아직 자료 없음).
  loading: boolean;
  // 보여줄 값이 있거나 로딩 중 — false 면 세그먼트 생략.
  ok: boolean;
  tempC: number | null;
  condition: KmaConditionKey;
  conditionLabel: string;
  // 실황 관측 시각(시) — 낮/밤 아이콘 선택용.
  ncstHour: number | null;
  ncstBase: WeatherBaseType | null;
  // 앞 6시간 강수확률 최대.
  popMax: number | null;
  wet: boolean;
}

export interface MyLocationGlanceAir {
  loading: boolean;
  ok: boolean;
  grade: AirGradeLevel | null;
  gradeSource: GlanceAirGradeSource | null;
  pm10: number | null;
  pm25: number | null;
  // 가장 가까운 측정소(없으면 null).
  station: AirNearbyResultType['items'][number] | null;
}

export interface MyLocationGlance {
  location: AirLocationItemType | null;
  // 표시 라벨 — 저장 라벨 또는 '내 위치'.
  label: string;
  weather: MyLocationGlanceWeather;
  air: MyLocationGlanceAir;
}

export const useMyLocationGlance = (opts: { refetchOnWindowFocus?: boolean } = {}): MyLocationGlance => {
  const { location } = useAirLocation();
  const grid = location ? latLngToKmaGrid(location.lat, location.lng) : null;
  const wxQ = useWeatherNowcast(grid?.nx ?? null, grid?.ny ?? null, opts);
  const airQ = useAirNearbyStations(location?.lat ?? null, location?.lng ?? null, {
    limit: 1,
    radius: GLANCE_AIR_RADIUS_M,
    ...opts,
  });

  // ── 날씨 ──
  const now = wxQ.data?.now ?? null;
  const hours = wxQ.data?.hours ?? [];
  const first = hours[0] ?? null;
  const wxLoading = wxQ.isLoading && !wxQ.data;
  const tempC = now?.t1h ?? null;
  const condition = kmaCondition(first?.sky ?? null, now?.pty ?? first?.pty ?? null);
  const pops = hours.map((h) => h.pop).filter((v): v is number => v !== null);
  const popMax = pops.length ? Math.max(...pops) : null;
  const weather: MyLocationGlanceWeather = {
    loading: wxLoading,
    ok: wxLoading || tempC !== null,
    tempC,
    condition,
    conditionLabel: KMA_CONDITION_LABEL[condition],
    ncstHour: wxQ.data?.ncstBase ? Number(wxQ.data.ncstBase.time.slice(0, 2)) : null,
    ncstBase: wxQ.data?.ncstBase ?? null,
    popMax,
    wet: hours.some((h) => (h.pty ?? 0) > 0) || (popMax !== null && popMax >= GLANCE_RAIN_POP_THRESHOLD),
  };

  // ── 대기 ──
  const station = airQ.data?.items[0] ?? null;
  const measure = station?.measure ?? null;
  const graded: { grade: AirGradeLevel; source: GlanceAirGradeSource } | null =
    measure?.khaiGrade != null
      ? { grade: measure.khaiGrade, source: 'khai' }
      : measure?.pm25Grade != null
        ? { grade: measure.pm25Grade, source: 'pm25' }
        : measure?.pm10Grade != null
          ? { grade: measure.pm10Grade, source: 'pm10' }
          : null;
  const airLoading = airQ.isLoading && !airQ.data;
  const air: MyLocationGlanceAir = {
    loading: airLoading,
    ok: airLoading || graded !== null,
    grade: graded?.grade ?? null,
    gradeSource: graded?.source ?? null,
    pm10: measure?.pm10 ?? null,
    pm25: measure?.pm25 ?? null,
    station,
  };

  return { location, label: location?.label ?? '내 위치', weather, air };
};
