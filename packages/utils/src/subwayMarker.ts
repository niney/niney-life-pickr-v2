// 지하철 역 마커 SVG 빌더. 프레임(핀/원 골격)은 markerFrame.ts 공용 — 식당·버스
// 마커와 규격이 같아야 MapCanvas 의 라벨 offset·축소 스케일(SMALL_ICON_SCALE)이
// 그대로 유효하다. 버스(파랑)와 즉시 구분되는 청록 톤을 쓰고, 환승역은 프레임 흰
// 외곽선 안쪽에 흰 링을 한 겹 더 둘러 '이중 링'으로 도드라지게 한다.
import { buildCircleMarkerSvg, buildPinMarkerSvg } from './markerFrame.js';

// 청록 톤 — 정류장(파랑 #2563eb)·식당(빨강)과 즉시 구분. selected 는 한 단계 진하게.
const SUBWAY_COLORS = { base: '#0d9488', selected: '#0f766e' } as const;

// 24×24 viewBox 의 단순 전동차 실루엣 — 차체(둥근 사각) + 창문 경계선 + 전조등
// 점 2개 + 하부 레일 스텁 2개. 16px 축소에서도 '열차'로 읽히도록 디테일 최소화.
// 버스 아이콘과 같은 흰색 스트로크 규격(프레임 <g> 가 stroke 2.4·round 적용).
const SUBWAY_ICON_PATH =
  '<rect x="6" y="3" width="12" height="14" rx="3"/>' +
  '<path d="M6 10h12"/>' +
  '<path d="M9 13.5h.01"/>' +
  '<path d="M15 13.5h.01"/>' +
  '<path d="M9 17l-1.5 3"/>' +
  '<path d="M15 17l1.5 3"/>';

// 환승 강조 링 — 프레임 흰 외곽선 안쪽에 흰 링 한 겹. 링 반경이 아이콘 범위
// 밖이라 아이콘을 가리지 않는다. 원(26 중심 13,13)·핀(32×48 머리 중심 16,16)은
// 중심이 달라 각각 상수로 둔다.
const CIRCLE_TRANSFER_RING =
  '<circle cx="13" cy="13" r="9" fill="none" stroke="#fff" stroke-width="1.6"/>';
const PIN_TRANSFER_RING =
  '<circle cx="16" cy="16" r="10" fill="none" stroke="#fff" stroke-width="1.6"/>';

export interface SubwayStationMarkerOptions {
  selected: boolean;
  // 2개 이상 호선이 지나는 환승역 — 이중 링 변형.
  transfer: boolean;
}

export function buildSubwayStationMarkerSvg({
  selected,
  transfer,
}: SubwayStationMarkerOptions): string {
  const base = selected
    ? buildPinMarkerSvg({ fill: SUBWAY_COLORS.selected, innerSvg: SUBWAY_ICON_PATH })
    : buildCircleMarkerSvg({ fill: SUBWAY_COLORS.base, innerSvg: SUBWAY_ICON_PATH });
  if (!transfer) return base;
  // 프레임 SVG 의 닫는 태그 직전에 링을 삽입 — 아이콘 위에 그려지지만 링 반경이
  // 아이콘 범위 밖이라 겹치지 않는다. 프레임 내부 구조가 아닌 </svg> 만 참조.
  const ring = selected ? PIN_TRANSFER_RING : CIRCLE_TRANSFER_RING;
  return base.replace('</svg>', ring + '</svg>');
}

// data URL 직접 사용 시 — 호출처에서 OL Icon.src 에 그대로 넣을 수 있다. 같은
// 옵션은 같은 문자열을 반환하므로 호출처가 4종(선택×환승)을 모듈 상수로 캐시하면
// OL 아이콘 캐시가 이미지를 1회만 디코드한다.
export function buildSubwayStationMarkerDataUrl(options: SubwayStationMarkerOptions): string {
  return (
    'data:image/svg+xml;charset=utf-8,' +
    encodeURIComponent(buildSubwayStationMarkerSvg(options))
  );
}
