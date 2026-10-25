import { describe, expect, it } from 'vitest';
import { formatHikingLength, hikingInRegionGroup, hikingRegionsOf } from './hiking.js';

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
