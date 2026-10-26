import { describe, expect, it } from 'vitest';
import {
  estimateHikingMinutes,
  formatHikingDuration,
  formatHikingLength,
  hikingCourseTimes,
  hikingDifficulty,
  hikingDifficultyReasons,
  hikingInRegionGroup,
  hikingRegionsOf,
  hikingSteepSections,
} from './hiking.js';

describe('hikingRegionsOf', () => {
  it('정식·줄인 시도 이름과 여러 시도에 걸친 소재지', () => {
    expect(hikingRegionsOf('강원도 춘천시 북산면ㆍ동면, 홍천군 두촌면ㆍ화촌면')).toEqual(['gangwon']);
    expect(hikingRegionsOf('강원 양구군 동면, 인제군 서화면')).toEqual(['gangwon']);
    expect(hikingRegionsOf('전남 고흥군 영남면 우천리')).toEqual(['jeonnam']);
    expect(hikingRegionsOf('서울특별시 도봉구, 경기도 의정부시 호원동ㆍ양주시 장흥면')).toEqual(['seoul', 'gyeonggi']);
    expect(hikingRegionsOf('충청북도 영동군 상촌면ㆍ용화면, 전라북도 무주군 설천면, 경상북도 김천시 부항면')).toEqual([
      'chungbuk',
      'jeonbuk',
      'gyeongbuk',
    ]);
    expect(hikingRegionsOf('광주광역시 동구, 전라남도 담양군 남면ㆍ화순군 이서면')).toEqual(['gwangju', 'jeonnam']);
    expect(hikingRegionsOf(null)).toEqual([]);
  });
});

describe('hikingInRegionGroup', () => {
  it('권역 묶음', () => {
    expect(hikingInRegionGroup(['seoul', 'gyeonggi'], 'capital')).toBe(true);
    expect(hikingInRegionGroup(['gwangju', 'jeonnam'], 'jeolla')).toBe(true);
    expect(hikingInRegionGroup(['gangwon'], 'jeju')).toBe(false);
  });
});

describe('formatHikingLength', () => {
  it('1km 미만은 m, 이상은 소수 한 자리 km', () => {
    expect(formatHikingLength(358)).toBe('358m');
    expect(formatHikingLength(7644)).toBe('7.6km');
  });
});

describe('estimateHikingMinutes / hikingCourseTimes', () => {
  it('보행 배율 1.35 × 피로 보정(1 + 이동/1500), 이동 180분 넘으면 보정 배율을 더 키우지 않는다', () => {
    expect(estimateHikingMinutes(0)).toBe(0);
    // 120 × 1.35 × 1.08
    expect(estimateHikingMinutes(120)).toBe(175);
    // 180 이후는 1.512 배 고정 — 이동이 두 배면 예상도 두 배.
    expect(estimateHikingMinutes(800)).toBe(estimateHikingMinutes(400) * 2);
  });

  it('정상 왕복만 왕복 시간 — 이동을 합쳐 보정해 두 편도 합보다 길다', () => {
    const t = hikingCourseTimes('summit', 120, 80)!;
    expect(t.roundTripMin).toBe(estimateHikingMinutes(200));
    expect(t.roundTripMin!).toBeGreaterThan(t.timeMin + t.timeRevMin);
    expect(hikingCourseTimes('traverse', 120, 80)!.roundTripMin).toBeNull();
    expect(hikingCourseTimes('loop', null, null)).toBeNull();
  });
});

describe('formatHikingDuration', () => {
  it('1시간 아래 5분, 그 위 10분 단위', () => {
    expect(formatHikingDuration(3)).toBe('5분');
    expect(formatHikingDuration(43)).toBe('45분');
    expect(formatHikingDuration(64)).toBe('1시간');
    expect(formatHikingDuration(196)).toBe('3시간 20분');
  });
});

describe('hikingDifficulty / hikingDifficultyReasons', () => {
  const base = { outingMin: 150, roundTrip: false, gainM: 400, steepPct: 30, roughSurfaces: [] as string[] };

  it('쉬움 — 3시간·500m·35% 아래이고 밧줄·릿지·사다리가 없다', () => {
    expect(hikingDifficulty(base)).toBe('easy');
    expect(hikingDifficultyReasons(base)).toEqual(['예상 2시간 30분', '누적 상승 400m']);
    // 암릉·너덜길은 쉬움을 막지 않는다(100대 명산 대부분에 있다).
    expect(hikingDifficulty({ ...base, roughSurfaces: ['암릉', '너덜길'] })).toBe('easy');
  });

  it('보통 — 쉬움 기준 하나라도 넘으면, 까닭은 넘은 것', () => {
    const e = { ...base, steepPct: 41, roughSurfaces: ['밧줄', '암릉'] };
    expect(hikingDifficulty(e)).toBe('moderate');
    expect(hikingDifficultyReasons(e)).toEqual(['가파른 500m 평균 41%', '밧줄 구간']);
  });

  it('어려움 — 5시간 30분·1,000m·55% 중 하나, 정상 왕복은 왕복 시간', () => {
    const e = { ...base, outingMin: 400, roundTrip: true, gainM: 1315 };
    expect(hikingDifficulty(e)).toBe('hard');
    expect(hikingDifficultyReasons(e)).toEqual(['왕복 예상 6시간 40분', '누적 상승 1,315m']);
    expect(hikingDifficulty({ ...base, steepPct: 55 })).toBe('hard');
  });
});

describe('hikingSteepSections', () => {
  // 20m 간격 1km — 200~400m 오르막 40%, 600~760m 내리막 35%, 나머지 평지(경사 5%).
  const d = Array.from({ length: 51 }, (_, i) => i * 20);
  const slope = (m: number): number => (m >= 200 && m < 400 ? 0.4 : m >= 600 && m < 760 ? -0.35 : 0.05);
  const e: number[] = [];
  d.forEach((m, i) => e.push(i === 0 ? 300 : e[i - 1]! + slope(m - 20) * 20));

  it('100m 구간 경사 30% 넘는 곳을 오르막·내리막으로 이어 붙인다', () => {
    const s = hikingSteepSections({ d, e });
    expect(s.map((x) => x.dir)).toEqual(['up', 'down']);
    expect(s[0]).toMatchObject({ maxPct: 40 });
    expect(s[0]!.fromM).toBeGreaterThanOrEqual(140);
    expect(s[0]!.toM).toBeLessThanOrEqual(460);
    expect(s[1]).toMatchObject({ maxPct: 35 });
  });

  it('완만하거나 짧은 코스는 없다', () => {
    expect(hikingSteepSections({ d, e: d.map((m) => 300 + m * 0.1) })).toEqual([]);
    expect(hikingSteepSections({ d: [0, 20, 40], e: [0, 30, 60] })).toEqual([]);
  });
});
