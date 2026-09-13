import Feature from 'ol/Feature';
import Polygon from 'ol/geom/Polygon';
import { fromLonLat } from 'ol/proj';
import type { TourDensityCellType } from '@repo/api-contract';
import { tourDensityCellBbox, tourDensityCellKey } from '@repo/utils';

// 여행자 밀도 격자 → OL 면 피처(EPSG:3857). MapCanvas 의 areas(배경 면 레이어)가 그대로 받는다 — 시군구 경계와 같은
// 경로라 클릭·스타일 규약이 같다. 셀 한 장은 0.02° 사각형; 피처 속성 key(x:y)·n·travelers 만 싣는다(식별자 없음).

export const buildTourDensityFeatures = (cells: readonly TourDensityCellType[], deg: number): Feature[] =>
  cells.map((c) => {
    const b = tourDensityCellBbox(c.x, c.y, deg);
    const ring = [
      [b.minLng, b.minLat],
      [b.maxLng, b.minLat],
      [b.maxLng, b.maxLat],
      [b.minLng, b.maxLat],
      [b.minLng, b.minLat],
    ].map(([lng, lat]) => fromLonLat([lng!, lat!]));
    const f = new Feature(new Polygon([ring]));
    f.set('key', tourDensityCellKey(c.x, c.y));
    f.set('n', c.n);
    f.set('travelers', c.travelers);
    return f;
  });

export const tourCellKeyOf = (f: Feature): string => String(f.get('key') ?? '');
export const tourCellVisitsOf = (f: Feature): number => Number(f.get('n') ?? 0);
