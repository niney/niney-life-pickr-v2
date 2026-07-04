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
// 색과 겹쳐도 헷갈리지 않는다.
//
// 앵커 트릭: MapCanvas 는 비선택 아이콘을 [0.5, 0.5](이미지 중앙) 앵커로 배치하고
// 차량은 선택 개념이 없어 항상 비선택이다. 그래서 SVG 아래 절반을 투명 여백으로
// 채워 '꼬리 끝'이 세로 중앙에 오게 그린다 — 꼬리 끝이 정차 좌표를 정확히 가리키고,
// compact 축소(중앙 기준 scale)에도 그 지점이 고정된다. 정류장 26×26 규격과 달리
// 라벨을 붙이지 않으므로(호출처가 label 생략) 라벨 offset 규격과는 무관하다.

const escapeXml = (s: string): string =>
  s.replace(/[<>&'"]/g, (c) =>
    c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c === "'" ? '&apos;' : '&quot;',
  );

export interface BusVehiclePillOptions {
  // 노선 번호 표기('141', 'N61', '6411'). 빈 문자열이면 번호 없이 색 알약만.
  label: string;
  // 노선색(폴리라인·경유지 점과 동일). '#rrggbb'.
  color: string;
  // '정차 중'(stopFlag='1') 강조 — 알약 뒤에 은은한 노선색 후광 1겹.
  stopped?: boolean;
}

export function buildBusVehiclePillSvg({
  label,
  color,
  stopped = false,
}: BusVehiclePillOptions): string {
  const fontSize = 13;
  // SVG 텍스트 실측이 불가 → bold 숫자·대문자 기준 문자폭 근사(넉넉히).
  const textW = Math.max(label.length * 8.4, 8);
  const padX = 9;
  const pillH = 24;
  const r = pillH / 2; // stadium(양끝 반원)
  const pillW = Math.max(pillH, Math.round(textW + padX * 2));
  const tailH = 8;
  const tailHalf = 6;
  // 정차 후광(halo)이 삐져나올 여백 — 주행 시엔 흰 스트로크만 감안.
  const margin = stopped ? 6 : 3;
  const w = pillW + margin * 2;
  const h = (pillH + tailH + margin) * 2; // 꼬리 끝 = 세로 중앙
  const cx = w / 2;
  const tipY = h / 2;
  const pillTop = tipY - tailH - pillH;
  const pillBottom = tipY - tailH;
  const left = cx - pillW / 2;
  const right = cx + pillW / 2;
  const midY = (pillTop + pillBottom) / 2;
  // 알약 + 하단 중앙 꼬리를 하나의 path 로(이음새 없는 말풍선).
  const bubble =
    `M${left + r} ${pillTop} H${right - r} ` +
    `A${r} ${r} 0 0 1 ${right - r} ${pillBottom} ` +
    `H${cx + tailHalf} L${cx} ${tipY} L${cx - tailHalf} ${pillBottom} ` +
    `H${left + r} ` +
    `A${r} ${r} 0 0 1 ${left + r} ${pillTop} Z`;
  const halo = stopped
    ? `<rect x="${left - 3}" y="${pillTop - 3}" width="${pillW + 6}" height="${pillH + 6}" rx="${r + 3}" fill="${color}" opacity="0.28"/>`
    : '';
  const text = label
    ? `<text x="${cx}" y="${midY + fontSize * 0.34}" text-anchor="middle" ` +
      `fill="#fff" font-family="system-ui, -apple-system, 'Malgun Gothic', sans-serif" ` +
      `font-size="${fontSize}" font-weight="700">${escapeXml(label)}</text>`
    : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    halo +
    `<path d="${bubble}" fill="${color}" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>` +
    text +
    '</svg>'
  );
}

export function buildBusVehiclePillDataUrl(options: BusVehiclePillOptions): string {
  return (
    'data:image/svg+xml;charset=utf-8,' +
    encodeURIComponent(buildBusVehiclePillSvg(options))
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
