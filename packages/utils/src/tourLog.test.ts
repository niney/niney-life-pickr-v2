import { describe, expect, it } from 'vitest';
import {
  TOUR_DATASETS,
  TOUR_DATASET_KEYS,
  TOUR_DENSITY_CELL_DEG,
  TOUR_ITINERARY_REGIONS,
  TOUR_REGIONS,
  TOUR_REGION_GROUPS,
  TOUR_REGION_KEYS,
  TOUR_SOURCE_NOTE,
  isNearJeju,
  isTourItineraryRegion,
  nearestTourSampleRegion,
  parseTourDensityCellKey,
  tourDensityCellBbox,
  tourDensityCellKey,
  tourDensityGrade,
  tourDensityQuantileBreaks,
  tourItineraryDays,
  tourRegionGroupOf,
  tourSampleRegionAt,
} from './tourLog.js';
import { weatherPlaceById } from './weatherRegions.js';

describe('tourLog — 데이터셋·지역(7차·8차)', () => {
  it('데이터셋 키는 지역 키이기도 하고, 표본 시도 목록이 같다', () => {
    for (const k of TOUR_DATASET_KEYS) {
      expect(TOUR_REGION_KEYS).toContain(k);
      expect(TOUR_REGIONS[k].sidos).toEqual(TOUR_DATASETS[k].sidos);
      expect(TOUR_REGIONS[k].parent).toBeNull();
    }
    // 첫 세트만 접두 없음, 나머지는 "<key>:".
    expect(TOUR_DATASETS.jeju.idPrefix).toBe('');
    expect(TOUR_DATASETS.west.idPrefix).toBe('west:');
    expect(TOUR_DATASETS.east.idPrefix).toBe('east:');
    expect(TOUR_DATASETS.capital.idPrefix).toBe('capital:');
  });

  it('권역 묶음 — 1행 제주·서부권·동부권·수도권·전체, 시도는 정확히 한 권역에 속한다', () => {
    expect(TOUR_REGION_GROUPS.map((g) => g.key)).toEqual(['jeju', 'west', 'east', 'capital', 'all']);
    const west = TOUR_REGION_GROUPS.find((g) => g.key === 'west')!;
    const east = TOUR_REGION_GROUPS.find((g) => g.key === 'east')!;
    const capital = TOUR_REGION_GROUPS.find((g) => g.key === 'capital')!;
    expect(west.children).toEqual(['jeonbuk', 'jeonnam', 'chungnam', 'daejeon', 'chungbuk', 'gwangju', 'sejong']);
    expect(east.children).toEqual(['gangwon', 'gyeongbuk', 'gyeongnam', 'busan', 'daegu', 'ulsan']);
    expect(capital.children).toEqual(['seoul', 'gyeonggi', 'incheon']);
    // 시도 지역의 sido 합 = 권역의 sidos(순서 포함).
    for (const g of [west, east, capital]) expect(g.children.flatMap((c) => TOUR_REGIONS[c].sidos ?? [])).toEqual([...TOUR_DATASETS[g.key as 'west' | 'east' | 'capital'].sidos]);
    expect(tourRegionGroupOf('busan')).toBe('east');
    expect(tourRegionGroupOf('daejeon')).toBe('west');
    expect(tourRegionGroupOf('seoul')).toBe('capital');
    expect(tourRegionGroupOf('all')).toBe('all');
    // 키 목록의 순서 = 권역 뒤에 그 권역의 시도(칩 순서).
    expect([...TOUR_REGION_KEYS]).toEqual(TOUR_REGION_GROUPS.flatMap((g) => [g.key, ...g.children]));
  });

  it('표본 판정 — 강릉은 동부권, 대전은 서부권, 서울은 수도권(9차부터 표본 안), 제주 남쪽 바다는 밖이고 가까운 표본은 제주', () => {
    expect(tourSampleRegionAt(37.75, 128.9)).toBe('east');
    expect(tourSampleRegionAt(36.35, 127.38)).toBe('west');
    expect(tourSampleRegionAt(33.5, 126.5)).toBe('jeju');
    expect(tourSampleRegionAt(37.5665, 126.978)).toBe('capital');
    expect(tourSampleRegionAt(32.5, 126.5)).toBeNull();
    expect(nearestTourSampleRegion(32.5, 126.5)).toBe('jeju');
    expect(nearestTourSampleRegion(37.5665, 126.978)).toBe('capital');
    // 표본 밖 동해 먼바다(독도 동쪽) — 중심 거리로는 동부권. (bbox 안 좌표는 tourSampleRegionAt 이 먼저 잡으므로 nearest 는 밖에서만 쓴다.)
    expect(tourSampleRegionAt(37.2, 132.5)).toBeNull();
    expect(nearestTourSampleRegion(37.2, 132.5)).toBe('east');
  });

  it('출처 표기에 데이터명이 모두 들어간다', () => {
    for (const k of TOUR_DATASET_KEYS) expect(TOUR_SOURCE_NOTE).toContain(`「${TOUR_DATASETS[k].name}」`);
  });
});

describe('tourLog — 밀도 격자', () => {
  it('분위 경계 4개(오름차순) + 등급 1~5', () => {
    const breaks = tourDensityQuantileBreaks([5, 10, 20, 40, 80]);
    expect(breaks).toEqual([9, 16, 28, 48]);
    expect(tourDensityGrade(5, breaks)).toBe(1);
    expect(tourDensityGrade(16, breaks)).toBe(2);
    expect(tourDensityGrade(17, breaks)).toBe(3);
    expect(tourDensityGrade(80, breaks)).toBe(5);
    expect(tourDensityQuantileBreaks([])).toEqual([0, 0, 0, 0]);
  });

  it('칸 인덱스 ↔ bbox ↔ 키', () => {
    const x = Math.floor(126.5 / TOUR_DENSITY_CELL_DEG);
    const y = Math.floor(33.5 / TOUR_DENSITY_CELL_DEG);
    const b = tourDensityCellBbox(x, y);
    expect(b.minLng).toBeCloseTo(126.5, 5);
    expect(b.maxLat).toBeCloseTo(33.52, 5);
    expect(parseTourDensityCellKey(tourDensityCellKey(x, y))).toEqual({ x, y });
    expect(parseTourDensityCellKey('a:b')).toBeNull();
  });

  it('제주 근방 판정', () => {
    expect(isNearJeju(33.5, 126.5)).toBe(true);
    expect(isNearJeju(37.5665, 126.978)).toBe(false);
  });
});

describe('tourLog — 코스 일정표(10차·13차)', () => {
  it('일정표는 "전체" 만 빼고 모든 지역에서 열려 있고, 일수는 박수 + 1(당일 1일 · 4박 이상 5일)', () => {
    expect(TOUR_REGION_KEYS.filter((k) => !isTourItineraryRegion(k))).toEqual(['all']);
    expect([0, 1, 2, 3, 4, 9].map(tourItineraryDays)).toEqual([1, 2, 3, 4, 5, 5]);
  });

  it('지역별 동선 규모 — 하루 권역 5~12km, 거점 반경은 제주만 없고(섬 전체) 나머지는 15~40km 이며 하루 권역보다 넓다', () => {
    for (const [key, cfg] of Object.entries(TOUR_ITINERARY_REGIONS)) {
      expect(cfg.zoneKm, key).toBeGreaterThanOrEqual(5);
      expect(cfg.zoneKm, key).toBeLessThanOrEqual(12);
      if (key === 'jeju') {
        // 제주 — 부속섬을 빼고, 식당 표본이 두꺼워 식사 자리를 볼거리로 메우지 않는다.
        expect(cfg).toMatchObject({ hubKm: null, skipIslands: true, mealFallback: false });
        continue;
      }
      expect(cfg, key).toMatchObject({ skipIslands: false, mealFallback: true, weatherPlaceId: null });
      expect(cfg.hubKm, key).toBeGreaterThanOrEqual(15);
      expect(cfg.hubKm, key).toBeLessThanOrEqual(40);
      expect(cfg.hubKm!, key).toBeGreaterThan(cfg.zoneKm);
    }
  });

  it('예보 지점을 직접 적은 지역은 실제 날씨 지점이다(제주 = 제주시) — 나머지는 서버가 거점에서 가까운 지점을 알려 준다', () => {
    for (const cfg of Object.values(TOUR_ITINERARY_REGIONS)) if (cfg.weatherPlaceId) expect(weatherPlaceById(cfg.weatherPlaceId)).not.toBeNull();
    expect(weatherPlaceById(TOUR_ITINERARY_REGIONS.jeju!.weatherPlaceId)).toMatchObject({ name: '제주', sido: '제주' });
  });
});
