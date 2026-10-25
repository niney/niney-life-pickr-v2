import { buildCircleMarkerSvg, buildPinMarkerSvg } from './markerFrame.js';
import { HIKING_MOUNTAIN_COLOR, type HikingMapPoiCategory } from './hiking.js';

// 등산 지도 마커 — 식당·주차와 같은 프레임(비선택 26px 원 / 선택 32×48 핀). 산은 초록 산 모양, 코스 지점은 분류별
// 색·그림(정상 깃발·갈림길 이정표·위험 느낌표·화장실·주차 P·정류장 버스 …).

const MOUNTAIN_ICON = '<path d="m8 3 4 8 5-5 5 15H2L8 3z"/>';
const POI_ICON: Record<HikingMapPoiCategory, string> = {
  PEAK: '<path d="M5 21V4"/><path d="M5 15s1-1 4-1 5 2 8 2 3-1 3-1V3s-1 1-3 1-5-2-8-2-4 1-4 1z"/>',
  ENTRY: '<path d="M13 4h3a2 2 0 0 1 2 2v14"/><path d="M2 20h3"/><path d="M13 20h9"/><path d="M10 12v.01"/><path d="M13 4.56v16.88a.5.5 0 0 1-.68.47l-6-2.4A1 1 0 0 1 5.69 18.56V5.44a1 1 0 0 1 .63-.93l6-2.4a.5.5 0 0 1 .68.45z"/>',
  SIGN: '<path d="M12 13v8"/><path d="M12 3v3"/><path d="M4 6h13l4 3.5-4 3.5H4z"/>',
  DANGER: '<path d="M12 8v5"/><path d="M12 17h.01"/><path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
  SHELTER: '<path d="M3 11 12 3l9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  TOILET: '<path d="M7 4h10v5H7z"/><path d="M5 11h14v2a7 7 0 0 1-14 0z"/><path d="M9 20h6"/>',
  SPRING: '<path d="M12 3s-6 7-6 11a6 6 0 0 0 12 0c0-4-6-11-6-11z"/>',
  PARK: '<path d="M8.5 19V5h5a4.5 4.5 0 0 1 0 9h-5"/>',
  TRANS: '<path d="M6 17V6a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v11"/><path d="M5 17h14"/><path d="M6 11h12"/><path d="M8 20v-3"/><path d="M16 20v-3"/>',
  VIEW: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
};
export const HIKING_POI_COLOR: Record<HikingMapPoiCategory, string> = {
  PEAK: '#b91c1c',
  ENTRY: '#15803d',
  SIGN: '#0f766e',
  DANGER: '#d97706',
  SHELTER: '#7c3aed',
  TOILET: '#0284c7',
  SPRING: '#0891b2',
  PARK: '#2563eb',
  TRANS: '#4f46e5',
  VIEW: '#a21caf',
};

const toDataUrl = (svg: string): string => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
const frame = (fill: string, innerSvg: string, selected: boolean): string =>
  toDataUrl(selected ? buildPinMarkerSvg({ fill, innerSvg }) : buildCircleMarkerSvg({ fill, innerSvg }));

export function buildHikingMountainMarkerDataUrl(selected: boolean): string {
  return frame(HIKING_MOUNTAIN_COLOR, MOUNTAIN_ICON, selected);
}
export function buildHikingPoiMarkerDataUrl(category: HikingMapPoiCategory, selected: boolean): string {
  return frame(HIKING_POI_COLOR[category], POI_ICON[category], selected);
}
