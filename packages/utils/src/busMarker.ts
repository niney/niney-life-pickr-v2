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

// 차량(실시간 버스 위치) 마커 — 정류장(파랑)과 즉시 구분되는 초록. 차량은
// 선택 개념이 없어 26×26 원형 1종만 제공한다(아이콘 실루엣은 정류장과 공유).
const BUS_VEHICLE_COLOR = '#16a34a';

export function buildBusVehicleMarkerDataUrl(): string {
  return (
    'data:image/svg+xml;charset=utf-8,' +
    encodeURIComponent(
      buildCircleMarkerSvg({ fill: BUS_VEHICLE_COLOR, innerSvg: BUS_ICON_PATH }),
    )
  );
}

// 내 위치(Geolocation) 마커 — 정류장(파랑 핀)·차량(초록 원)과 구분되는 단순
// '파란 점'. 지도 앱 관용 표현(진한 파란 점 + 흰 링 + 옅은 정확도 후광)을
// 26×26 규격으로 그려 정류장 마커와 라벨 offset·축소 스케일을 공유한다.
const MY_LOCATION_COLOR = '#2563eb';

export function buildMyLocationMarkerSvg(): string {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26">' +
    // 옅은 후광(정확도 느낌) → 흰 링 → 파란 점 순으로 겹쳐 그린다.
    `<circle fill="${MY_LOCATION_COLOR}" fill-opacity="0.2" cx="13" cy="13" r="12"/>` +
    '<circle fill="#fff" cx="13" cy="13" r="7"/>' +
    `<circle fill="${MY_LOCATION_COLOR}" cx="13" cy="13" r="5"/>` +
    '</svg>'
  );
}

// data URL 직접 사용 시 — OL Icon.src 에 그대로 넣는다. 선택 개념이 없어 1종.
export function buildMyLocationMarkerDataUrl(): string {
  return (
    'data:image/svg+xml;charset=utf-8,' +
    encodeURIComponent(buildMyLocationMarkerSvg())
  );
}
