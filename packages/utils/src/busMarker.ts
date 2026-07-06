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

// 차량(실시간 버스 위치) 알약 마커 — 노선 번호를 그대로 보여주는 버스 앱 관용
// 표현(카카오맵/네이버지도). 정류장(원/핀)과 형태가 완전히 달라 노선색이 정류장
// 색과 겹쳐도 헷갈리지 않는다. 알약·다트 기하 코어는 vehiclePill.ts 공용(지하철
// 열차와 규격 동일) — 여기서는 기존 export 이름으로 위임한다(바이트 동일 산출).
import {
  buildVehicleDirDataUrl,
  buildVehicleDirSvg,
  buildVehiclePillDataUrl,
  buildVehiclePillSvg,
  type VehiclePillOptions,
} from './vehiclePill.js';

// 노선 번호 표기('141', 'N61', '6411'). label/color/stopped(정차)/highlighted(따라가기).
export type BusVehiclePillOptions = VehiclePillOptions;

export const buildBusVehiclePillSvg = buildVehiclePillSvg;
export const buildBusVehiclePillDataUrl = buildVehiclePillDataUrl;
export const buildBusVehicleDirSvg = buildVehicleDirSvg;
export const buildBusVehicleDirDataUrl = buildVehicleDirDataUrl;

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

// ── 5차(노선 보기) ──────────────────────────────────────────────────────────
// 노선 유형 코드 → 대표색. 서울시 원문 routeType: 1 공항/2 마을/3 간선/
// 4 지선/5 순환/6 광역/그 외(7 인천·8 경기·0 공용 등). 폴리라인·경유지 점이
// 같은 색을 쓴다. 간선 파랑(#2563eb)은 정류장 마커와 같은 톤이라 "간선 노선 위의
// 정류장"이 색으로 자연히 묶인다.
export function busRouteTypeColor(routeType: string): string {
  switch (routeType) {
    case '1':
      return '#0ea5e9'; // 공항 — 하늘
    case '2':
      return '#84cc16'; // 마을 — 연두
    case '3':
      return '#2563eb'; // 간선 — 파랑
    case '4':
      return '#16a34a'; // 지선 — 초록
    case '5':
      return '#eab308'; // 순환 — 노랑
    case '6':
      return '#dc2626'; // 광역 — 빨강
    default:
      return '#6b7280'; // 그 외 — 회색
  }
}

// 경유 정류소 점 마커 — 노선 형상 위에 얹는 작은 점(노선색 + 흰 링). 정류장
// 핀(26×26)·차량(26×26)보다 의도적으로 작은 16×16 규격이라 105개가 깔려도
// 과밀하지 않다. 라벨은 붙이지 않으므로(호출처가 label 생략) MapCanvas 의 라벨
// offset 규격과는 무관하고, 중심 anchor([0.5,0.5])·축소 스케일만 공유한다.
export function buildBusRouteStopDotSvg(color: string): string {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">' +
    `<circle fill="#fff" cx="8" cy="8" r="6"/>` +
    `<circle fill="${color}" cx="8" cy="8" r="4"/>` +
    '</svg>'
  );
}

export function buildBusRouteStopDotDataUrl(color: string): string {
  return (
    'data:image/svg+xml;charset=utf-8,' +
    encodeURIComponent(buildBusRouteStopDotSvg(color))
  );
}
