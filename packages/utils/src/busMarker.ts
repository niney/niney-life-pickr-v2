// 버스 정류장 마커 SVG 빌더. 프레임(핀/원 골격)은 markerFrame.ts 공용 —
// 식당 마커와 규격이 같아야 MapCanvas 의 라벨 offset·축소 스케일
// (SMALL_ICON_SCALE)이 그대로 유효하다.
import { buildCircleMarkerSvg, buildPinMarkerSvg } from './markerFrame.js';

// 파란 톤 — 식당(빨강)·등록됨(회색)과 즉시 구분. selected 는 한 단계 진하게.
const BUS_COLORS = { base: '#2563eb', selected: '#1d4ed8' } as const;

// 24×24 viewBox 의 단순 버스 실루엣 — 차체(둥근 사각) + 창문 경계선 + 바퀴
// 스텁 2개 + 전조등 점 2개(h.01 + round linecap = 점). 16px 축소에서도 인식
// 가능하도록 디테일 최소화. 식당 아이콘과 같은 스트로크 규격(흰색 라인).
const BUS_ICON_PATH =
  '<rect x="4" y="3" width="16" height="14" rx="2"/>' +
  '<path d="M4 11h16"/>' +
  '<path d="M7 17v3"/>' +
  '<path d="M17 17v3"/>' +
  '<path d="M8 14h.01"/>' +
  '<path d="M16 14h.01"/>';

export function buildBusStopMarkerSvg(selected: boolean): string {
  return selected
    ? buildPinMarkerSvg({ fill: BUS_COLORS.selected, innerSvg: BUS_ICON_PATH })
    : buildCircleMarkerSvg({ fill: BUS_COLORS.base, innerSvg: BUS_ICON_PATH });
}

// data URL 직접 사용 시 — 호출처에서 OL Icon.src 에 그대로 넣을 수 있다.
export function buildBusStopMarkerDataUrl(selected: boolean): string {
  return (
    'data:image/svg+xml;charset=utf-8,' +
    encodeURIComponent(buildBusStopMarkerSvg(selected))
  );
}
