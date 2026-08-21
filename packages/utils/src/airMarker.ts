// 대기 측정소 지도 마커 SVG 빌더 — 프레임(핀/원)은 markerFrame.ts 공용이라 식당·
// 버스·지하철 마커와 규격(선택 32×48 핀 / 비선택 26×26 원)이 같고 MapCanvas 의 라벨
// offset·축소 스케일이 그대로 유효하다. 채움색은 현재 통합대기환경지수 등급
// (좋음 파랑/보통 초록/나쁨 주황/매우나쁨 빨강, 없음 회색) — 에어코리아 관행색.
import { buildCircleMarkerSvg, buildPinMarkerSvg } from './markerFrame.js';
import type { AirGradeLevel } from './airQuality.js';

// 등급별 마커색 — 웹 airGrade.ts 의 hex 와 동일 값(지도는 CSS 변수를 못 쓰므로 상수).
export const AIR_MARKER_COLORS: Record<AirGradeLevel | 0, { base: string; selected: string }> = {
  0: { base: '#9ca3af', selected: '#6b7280' },
  1: { base: '#0ea5e9', selected: '#0284c7' },
  2: { base: '#10b981', selected: '#059669' },
  3: { base: '#f59e0b', selected: '#d97706' },
  4: { base: '#f43f5e', selected: '#e11d48' },
};

// 24×24 viewBox 바람 실루엣(lucide 'wind' 단순화) — 16px 축소에서도 읽히는 3획.
const WIND_ICON_PATH =
  '<path d="M3 8h11a3 3 0 1 0-3-3"/>' +
  '<path d="M3 12h15a3 3 0 1 1-3 3"/>' +
  '<path d="M3 16h8a2 2 0 1 1-2 2"/>';

export interface AirStationMarkerOptions {
  // 현재 CAI 등급 — null/undefined 면 회색(결측·조인 실패).
  grade: AirGradeLevel | null | undefined;
  selected: boolean;
}

export function buildAirStationMarkerSvg({ grade, selected }: AirStationMarkerOptions): string {
  const colors = AIR_MARKER_COLORS[grade ?? 0];
  return selected
    ? buildPinMarkerSvg({ fill: colors.selected, innerSvg: WIND_ICON_PATH })
    : buildCircleMarkerSvg({ fill: colors.base, innerSvg: WIND_ICON_PATH });
}

// data URL — OL Icon.src 에 그대로. 등급×선택 10종이 전부라 호출처가 모듈 레벨에서
// 미리 만들어 공유한다(OL 아이콘 캐시가 이미지를 1회만 디코드).
export function buildAirStationMarkerDataUrl(opts: AirStationMarkerOptions): string {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(buildAirStationMarkerSvg(opts));
}
