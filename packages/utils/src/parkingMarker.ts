import { formatLifeCount, lifeCountBucket } from './lifeMap.js';
import { buildCircleMarkerSvg, buildPinMarkerSvg } from './markerFrame.js';
import {
  EV_LEVEL_COLOR,
  PARKING_NO_LIVE_COLOR,
  parkingLevelColor,
  type EvLevel,
  type ParkingLevel,
} from './parking.js';

// 주차 지도 마커 — 식당·버스와 같은 프레임(비선택 26px 원 / 선택 32×48 핀)이라 MapCanvas 의 라벨 offset·축소
// 스케일을 그대로 쓴다. 주차장은 'P', 충전소는 번개, 공항은 비행기. 채움색은 실시간 단계(없으면 주차 표지 파랑),
// 충전소는 사용 가능 여부. 저줌 집계는 숫자를 새긴 버블(일상지도 셀과 같은 크기 버킷).

const P_ICON = '<path d="M8.5 19V5h5a4.5 4.5 0 0 1 0 9h-5"/>';
const BOLT_ICON = '<path d="M13 3 6 13.5h5.5L10.5 21 18 10.5h-5.5z"/>';
const PLANE_ICON =
  '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>';

const toDataUrl = (svg: string): string => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
const frame = (fill: string, innerSvg: string, selected: boolean): string =>
  toDataUrl(selected ? buildPinMarkerSvg({ fill, innerSvg }) : buildCircleMarkerSvg({ fill, innerSvg }));

// 주차장 — level null = 실시간 없음(파랑).
export function buildParkingLotMarkerDataUrl(level: ParkingLevel | null, selected: boolean): string {
  return frame(parkingLevelColor(level), P_ICON, selected);
}
export function buildEvStationMarkerDataUrl(level: EvLevel, selected: boolean): string {
  return frame(EV_LEVEL_COLOR[level], BOLT_ICON, selected);
}
export function buildParkingAirportMarkerDataUrl(level: ParkingLevel | null, selected: boolean): string {
  return frame(parkingLevelColor(level), PLANE_ICON, selected);
}

// 집계 버블 — 건수 버킷별 지름, 숫자를 SVG 안에(MapCanvas 라벨은 저줌에서 꺼진다).
const CELL_SIZE = [26, 34, 40, 46] as const;
const CELL_FONT = [10, 11, 12, 13] as const;
export const PARKING_CELL_COLOR = { lot: PARKING_NO_LIVE_COLOR, ev: '#0f766e' } as const;
export function buildParkingCellMarkerDataUrl(kind: keyof typeof PARKING_CELL_COLOR, count: number): string {
  const bucket = lifeCountBucket(count);
  const size = CELL_SIZE[bucket];
  const half = size / 2;
  return toDataUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
      `<circle fill="${PARKING_CELL_COLOR[kind]}" fill-opacity="0.85" stroke="#fff" stroke-width="2" cx="${half}" cy="${half}" r="${half - 1.5}"/>` +
      `<text x="${half}" y="${half}" fill="#fff" font-family="system-ui, -apple-system, sans-serif" font-size="${CELL_FONT[bucket]}" font-weight="700" text-anchor="middle" dominant-baseline="central">${formatLifeCount(count)}</text>` +
      '</svg>',
  );
}
