import type { AirForecastCodeType } from '@repo/api-contract';

// 대기정보 페이지의 선택지 상수 — 컴포넌트 파일 밖에 둬 react-refresh 경계를 깨끗이
// 유지한다(컴포넌트 파일은 컴포넌트만 export).

// 추이 차트 항목 — PM10·PM2.5 는 같은 단위(㎍/㎥)라 한 축에 2계열, 나머지는 단일.
export type AirChartMetric = 'pm' | 'o3' | 'no2' | 'co' | 'so2' | 'khai';
export const AIR_CHART_METRICS: ReadonlyArray<{ key: AirChartMetric; label: string }> = [
  { key: 'pm', label: 'PM10 · PM2.5' },
  { key: 'o3', label: '오존' },
  { key: 'no2', label: '이산화질소' },
  { key: 'co', label: '일산화탄소' },
  { key: 'so2', label: '아황산가스' },
  { key: 'khai', label: '통합지수' },
];

// 예보 항목 탭 — 업스트림 informCode ↔ 이미지 파일명 항목 표기.
export const AIR_FORECAST_TABS: ReadonlyArray<{
  code: AirForecastCodeType;
  label: string;
  image: 'PM10' | 'PM2.5' | 'O3';
}> = [
  { code: 'PM10', label: '미세먼지 PM10', image: 'PM10' },
  { code: 'PM25', label: '초미세먼지 PM2.5', image: 'PM2.5' },
  { code: 'O3', label: '오존 O₃', image: 'O3' },
];
