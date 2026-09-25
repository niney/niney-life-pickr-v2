import type { EvPointsResultType, ParkingAirportType, ParkingCellType, ParkingLotPointsResultType } from '@repo/api-contract';
import {
  EV_LEVELS,
  PARKING_LEVELS,
  buildEvStationMarkerDataUrl,
  buildParkingAirportMarkerDataUrl,
  buildParkingCellMarkerDataUrl,
  buildParkingLotMarkerDataUrl,
  type EvLevel,
  type ParkingLevel,
} from '@repo/utils';
import type { MapMarker } from '~/components/restaurant/MapCanvas';

// 주차 마커 빌더 — 서버 응답(점/셀)을 MapCanvas 마커로. 아이콘 data URL 은 단계별로 모듈 레벨에서 한 번 만들어 공유(OL
// 아이콘 캐시가 1회만 디코드), 셀 버블은 건수 키로 메모이즈. 마커 id: 점 `lot:<id>`·`ev:<id>`·`airport:<IATA>`,
// 셀 `cell:<lot|ev>:<index>`(index = 응답 cells 위치).

type IconPair = { src: string; selectedSrc: string };
const LOT_ICONS = Object.fromEntries(
  [...PARKING_LEVELS, 'none'].map((l) => {
    const level = l === 'none' ? null : (l as ParkingLevel);
    return [l, { src: buildParkingLotMarkerDataUrl(level, false), selectedSrc: buildParkingLotMarkerDataUrl(level, true) }];
  }),
) as Record<ParkingLevel | 'none', IconPair>;
const EV_ICONS = Object.fromEntries(
  EV_LEVELS.map((l) => [l, { src: buildEvStationMarkerDataUrl(l, false), selectedSrc: buildEvStationMarkerDataUrl(l, true) }]),
) as Record<EvLevel, IconPair>;
const AIRPORT_ICONS = Object.fromEntries(
  [...PARKING_LEVELS, 'none'].map((l) => {
    const level = l === 'none' ? null : (l as ParkingLevel);
    return [l, { src: buildParkingAirportMarkerDataUrl(level, false), selectedSrc: buildParkingAirportMarkerDataUrl(level, true) }];
  }),
) as Record<ParkingLevel | 'none', IconPair>;

const cellIconCache = new Map<string, string>();
const cellIcon = (layer: 'lot' | 'ev', count: number): string => {
  const key = `${layer}:${count}`;
  let url = cellIconCache.get(key);
  if (!url) {
    url = buildParkingCellMarkerDataUrl(layer, count);
    cellIconCache.set(key, url);
  }
  return url;
};

export type ParkingMarkerKind = 'lot' | 'ev' | 'airport';
export const parkingMarkerId = (kind: ParkingMarkerKind, id: string): string => `${kind}:${id}`;
export type ParsedParkingMarkerId = { kind: ParkingMarkerKind; id: string } | { kind: 'cell'; layer: 'lot' | 'ev'; index: number };

export const parseParkingMarkerId = (markerId: string): ParsedParkingMarkerId | null => {
  const i = markerId.indexOf(':');
  if (i <= 0) return null;
  const head = markerId.slice(0, i);
  const rest = markerId.slice(i + 1);
  if (head === 'cell') {
    const j = rest.indexOf(':');
    const layer = rest.slice(0, j);
    const index = Number(rest.slice(j + 1));
    return (layer === 'lot' || layer === 'ev') && Number.isInteger(index) ? { kind: 'cell', layer, index } : null;
  }
  if ((head === 'lot' || head === 'ev' || head === 'airport') && rest.length > 0) return { kind: head, id: rest };
  return null;
};

const cellMarkers = (layer: 'lot' | 'ev', cells: ParkingCellType[]): MapMarker[] =>
  cells.map((c, index) => {
    const src = cellIcon(layer, c.count);
    return { id: `cell:${layer}:${index}`, lat: c.lat, lng: c.lng, icon: { src, selectedSrc: src }, fixedScale: true };
  });

// 주차장 — 라벨은 labeledIds(주변 목록 + 선택)만. 실시간 여석이 있으면 라벨에 붙인다.
export const buildParkingLotMarkers = (result: ParkingLotPointsResultType | undefined, labeledIds: ReadonlySet<string>): MapMarker[] => {
  if (!result) return [];
  if (result.mode === 'cells') return cellMarkers('lot', result.cells);
  return result.items.map((p) => ({
    id: parkingMarkerId('lot', p.id),
    lat: p.lat,
    lng: p.lng,
    label: labeledIds.has(p.id) ? (p.available !== null ? `${p.name} · 여석 ${p.available}` : p.name) : undefined,
    icon: LOT_ICONS[p.level ?? 'none'],
  }));
};

export const buildEvMarkers = (result: EvPointsResultType | undefined, labeledIds: ReadonlySet<string>): MapMarker[] => {
  if (!result) return [];
  if (result.mode === 'cells') return cellMarkers('ev', result.cells);
  return result.items.map((p) => ({
    id: parkingMarkerId('ev', p.id),
    lat: p.lat,
    lng: p.lng,
    label: labeledIds.has(p.id) ? p.name : undefined,
    icon: EV_ICONS[p.level],
  }));
};

// 공항 — 14곳뿐이라 이름 라벨을 항상 붙인다.
export const buildAirportMarkers = (airports: ParkingAirportType[] | undefined): MapMarker[] =>
  (airports ?? []).map((a) => ({
    id: parkingMarkerId('airport', a.code),
    lat: a.lat,
    lng: a.lng,
    label: a.name.replace(/국제공항$|공항$/, ''),
    icon: AIRPORT_ICONS[a.level ?? 'none'],
  }));

export const parkingCellAt = (result: { mode: string; cells: ParkingCellType[] } | undefined, index: number): ParkingCellType | null =>
  result?.mode === 'cells' ? (result.cells[index] ?? null) : null;
