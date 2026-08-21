import { buildCircleMarkerSvg, buildPinMarkerSvg } from './markerFrame.js';
import {
  formatLifeCount,
  lifeCountBucket,
  type LifeCctvPurposeGroup,
  type LifeMapLayer,
} from './lifeMap.js';

// 일상지도 마커 — CCTV 는 12px 점(목적 그룹색), 화장실은 26px 원(선택 시 32×48 핀), 저줌 집계는
// 숫자를 안에 새긴 버블. 점·버블은 MapCanvas 의 fixedScale 마커로 줌과 무관하게 원본 크기,
// 화장실 원/핀은 식당·버스와 같은 프레임이라 라벨 offset·축소 스케일을 공유한다.
//
// 색은 dataviz 범주 팔레트에서 검증한 5색 — CCTV 4그룹 전 쌍 + 화장실 1색이 라이트 표면에서
// CVD·정상시 분리 기준을 모두 통과한 조합(scripts/validate_palette.js, 2026-08-21). 점은 흰
// 외곽선이 있어 야간(midnight) 타일 위에서도 같은 색을 쓴다.
export const LIFE_CCTV_GROUP_COLOR: Record<LifeCctvPurposeGroup, string> = {
  safety: '#2a78d6',
  child: '#eb6834',
  traffic: '#1baf7a',
  etc: '#4a3aa7',
};
export const LIFE_TOILET_COLOR = '#c2185b';
// 집계 버블·레이어 대표색.
export const LIFE_LAYER_COLOR: Record<LifeMapLayer, string> = {
  cctv: '#2a78d6',
  toilet: LIFE_TOILET_COLOR,
};

// 24×24 흰 라인 아이콘 조각(markerFrame 규약) — CCTV(기울어진 본체+렌즈+거치대), 화장실(물탱크+변기).
const CCTV_ICON =
  '<path d="M3 9.5 14 5l1.8 5-11 4.5z"/><path d="M8 14.5V19"/><path d="M5 19h6"/><circle cx="14.3" cy="7.6" r="1"/>';
const TOILET_ICON = '<path d="M7 4h10v5H7z"/><path d="M5 11h14v2a7 7 0 0 1-14 0z"/><path d="M9 20h6"/>';

const toDataUrl = (svg: string): string => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);

// CCTV 비선택 — 12×12 점. 수천 개가 한 화면에 오르므로 작게, 흰 외곽선으로 타일과 분리.
export function buildLifeCctvDotSvg(group: LifeCctvPurposeGroup): string {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12">' +
    `<circle fill="${LIFE_CCTV_GROUP_COLOR[group]}" stroke="#fff" stroke-width="1.5" cx="6" cy="6" r="4.5"/>` +
    '</svg>'
  );
}
export function buildLifeCctvDotDataUrl(group: LifeCctvPurposeGroup): string {
  return toDataUrl(buildLifeCctvDotSvg(group));
}
// CCTV 선택 — 식당 마커와 같은 32×48 핀(anchor 꼭지점).
export function buildLifeCctvPinDataUrl(group: LifeCctvPurposeGroup): string {
  return toDataUrl(buildPinMarkerSvg({ fill: LIFE_CCTV_GROUP_COLOR[group], innerSvg: CCTV_ICON }));
}

// 화장실 — 비선택 26×26 원 / 선택 32×48 핀.
export function buildLifeToiletMarkerDataUrl(selected: boolean): string {
  return toDataUrl(
    selected
      ? buildPinMarkerSvg({ fill: LIFE_TOILET_COLOR, innerSvg: TOILET_ICON })
      : buildCircleMarkerSvg({ fill: LIFE_TOILET_COLOR, innerSvg: TOILET_ICON }),
  );
}

// 집계 버블 — 건수 버킷(1~9/10~99/100~999/1,000+)별 지름, 숫자를 SVG 안에 새긴다(MapCanvas 라벨은
// 줌 14 미만에서 꺼지므로 텍스트를 이미지에 포함). 반투명 채움이라 아래 지도가 비친다.
// 지름은 셀 한 변(화면 ~64px)보다 충분히 작게 — 이웃 버블(중심 ±15% 안으로 눌린 무게중심)과 겹치지 않게.
const CELL_SIZE = [26, 34, 40, 46] as const;
const CELL_FONT = [10, 11, 12, 13] as const;
export function buildLifeCellMarkerSvg(layer: LifeMapLayer, count: number): string {
  const bucket = lifeCountBucket(count);
  const size = CELL_SIZE[bucket];
  const half = size / 2;
  const color = LIFE_LAYER_COLOR[layer];
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<circle fill="${color}" fill-opacity="0.85" stroke="#fff" stroke-width="2" cx="${half}" cy="${half}" r="${half - 1.5}"/>` +
    `<text x="${half}" y="${half}" fill="#fff" font-family="system-ui, -apple-system, sans-serif" font-size="${CELL_FONT[bucket]}" font-weight="700" text-anchor="middle" dominant-baseline="central">${formatLifeCount(count)}</text>` +
    '</svg>'
  );
}
export function buildLifeCellMarkerDataUrl(layer: LifeMapLayer, count: number): string {
  return toDataUrl(buildLifeCellMarkerSvg(layer, count));
}
