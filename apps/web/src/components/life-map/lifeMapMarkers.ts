import type { LifeMapCellType, LifeMapPointsResultType } from '@repo/api-contract';
import {
  LIFE_CCTV_PURPOSE_GROUPS,
  buildLifeCctvDotDataUrl,
  buildLifeCctvPinDataUrl,
  buildLifeCellMarkerDataUrl,
  buildLifeHospitalMarkerDataUrl,
  buildLifeToiletMarkerDataUrl,
  isLifeMapLayer,
  lifeCctvPurposeGroup,
  type LifeCctvPurposeGroup,
  type LifeMapLayer,
} from '@repo/utils';
import type { MapMarker } from '~/components/restaurant/MapCanvas';

// 일상지도 마커 빌더 — 서버 응답(점/셀)을 MapCanvas 마커로. 아이콘 data URL 은 모듈 레벨에서
// 한 번 만들어 공유(OL 아이콘 캐시가 이미지를 1회만 디코드). 셀 버블은 건수마다 다른 이미지라
// 건수 키로 메모이즈.

const CCTV_ICONS = Object.fromEntries(
  LIFE_CCTV_PURPOSE_GROUPS.map((g) => [g, { src: buildLifeCctvDotDataUrl(g), selectedSrc: buildLifeCctvPinDataUrl(g) }]),
) as Record<LifeCctvPurposeGroup, { src: string; selectedSrc: string }>;
const TOILET_ICON = { src: buildLifeToiletMarkerDataUrl(false), selectedSrc: buildLifeToiletMarkerDataUrl(true) };
const HOSPITAL_ICON = { src: buildLifeHospitalMarkerDataUrl(false), selectedSrc: buildLifeHospitalMarkerDataUrl(true) };
const cellIconCache = new Map<string, string>();
const cellIcon = (layer: LifeMapLayer, count: number): string => {
  const key = `${layer}:${count}`;
  let url = cellIconCache.get(key);
  if (!url) {
    url = buildLifeCellMarkerDataUrl(layer, count);
    cellIconCache.set(key, url);
  }
  return url;
};

// 마커 id — 점 `${layer}:${id}`, 셀 `cell:${layer}:${index}`(index = 응답 cells 배열 위치).
export const lifeMarkerId = (layer: LifeMapLayer, id: string): string => `${layer}:${id}`;
export type ParsedLifeMarkerId =
  | { kind: 'point'; layer: LifeMapLayer; id: string }
  | { kind: 'cell'; layer: LifeMapLayer; index: number };
export const parseLifeMarkerId = (markerId: string): ParsedLifeMarkerId | null => {
  const i = markerId.indexOf(':');
  if (i <= 0) return null;
  const head = markerId.slice(0, i);
  const rest = markerId.slice(i + 1);
  if (head === 'cell') {
    const j = rest.indexOf(':');
    if (j <= 0) return null;
    const layer = rest.slice(0, j);
    const index = Number(rest.slice(j + 1));
    return isLifeMapLayer(layer) && Number.isInteger(index) ? { kind: 'cell', layer, index } : null;
  }
  return isLifeMapLayer(head) && rest.length > 0 ? { kind: 'point', layer: head, id: rest } : null;
};

// 응답 → 마커. 셀은 버블(원본 크기 고정), CCTV 점은 12px 점(고정), 화장실·병의원은 26px 원/선택 핀
// + 라벨(labeledIds 에 든 것만 — 수백 개 전부 라벨은 과밀).
export const buildLifeMarkers = (
  layer: LifeMapLayer,
  result: LifeMapPointsResultType | undefined,
  labeledIds: ReadonlySet<string>,
): MapMarker[] => {
  if (!result) return [];
  if (result.mode === 'cells') {
    return result.cells.map((c, index) => {
      const src = cellIcon(layer, c.count);
      return { id: `cell:${layer}:${index}`, lat: c.lat, lng: c.lng, icon: { src, selectedSrc: src }, fixedScale: true };
    });
  }
  if (layer === 'cctv') {
    return result.items.map((p) => ({
      id: lifeMarkerId('cctv', p.id),
      lat: p.lat,
      lng: p.lng,
      icon: CCTV_ICONS[lifeCctvPurposeGroup(p.purpose)],
      fixedScale: true,
    }));
  }
  const icon = layer === 'hospital' ? HOSPITAL_ICON : TOILET_ICON;
  return result.items.map((p) => ({
    id: lifeMarkerId(layer, p.id),
    lat: p.lat,
    lng: p.lng,
    label: labeledIds.has(p.id) ? p.name : undefined,
    icon,
  }));
};

export const lifeCellAt = (result: LifeMapPointsResultType | undefined, index: number): LifeMapCellType | null =>
  result?.mode === 'cells' ? (result.cells[index] ?? null) : null;
