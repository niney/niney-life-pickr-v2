import { describe, expect, it } from 'vitest';
import type { RandomCrawlRegionType } from '@repo/api-contract';
import { RegionStore, type RegionEntry } from './region.js';

// RegionStore 단위 테스트 — 번들 JSON 대신 결정론적 entries 를 주입한다.
const ENTRIES: RegionEntry[] = [
  { sido: '서울특별시', sigungu: '강남구', lat: 37.49, lng: 127.06, dongs: ['역삼동', '삼성동'] },
  { sido: '서울특별시', sigungu: '마포구', lat: 37.56, lng: 126.9, dongs: ['망원동', '합정동'] },
  { sido: '부산광역시', sigungu: '해운대구', lat: 35.16, lng: 129.16, dongs: ['우동', '중동'] },
];

const base: RandomCrawlRegionType = {
  sidoRandom: false,
  sido: null,
  sigunguRandom: false,
  sigungu: null,
  dongEnabled: false,
  dongRandom: false,
  dong: null,
};

describe('RegionStore', () => {
  const store = new RegionStore(ENTRIES);

  it('tree() 는 시도별로 시군구를 묶는다', () => {
    const tree = store.tree();
    const seoul = tree.find((t) => t.sido === '서울특별시');
    expect(seoul?.sigungus).toEqual(['강남구', '마포구']);
    expect(tree.find((t) => t.sido === '부산광역시')?.sigungus).toEqual(['해운대구']);
  });

  it('dongs() 는 해당 시군구의 동 목록', () => {
    expect(store.dongs('서울특별시', '강남구')).toEqual(['역삼동', '삼성동']);
    expect(store.dongs('없는시', '없는구')).toEqual([]);
  });

  it('고정 시/구 — 정확히 그 좌표와 라벨', () => {
    const r = store.resolve({ ...base, sido: '서울특별시', sigungu: '강남구' });
    expect(r).toMatchObject({ sido: '서울특별시', sigungu: '강남구', lat: 37.49, lng: 127.06, dong: null });
    expect(r?.label).toBe('서울특별시 강남구');
  });

  it('동 비활성 — dong 은 null', () => {
    const r = store.resolve({ ...base, sido: '서울특별시', sigungu: '마포구', dongEnabled: false, dong: '망원동' });
    expect(r?.dong).toBeNull();
  });

  it('고정 시/구 + 고정 동 — 라벨에 동 포함', () => {
    const r = store.resolve({
      ...base,
      sido: '서울특별시',
      sigungu: '강남구',
      dongEnabled: true,
      dong: '삼성동',
    });
    expect(r?.dong).toBe('삼성동');
    expect(r?.label).toBe('서울특별시 강남구 삼성동');
  });

  it('랜덤 동 — 그 시군구의 동 중 하나', () => {
    for (let i = 0; i < 20; i += 1) {
      const r = store.resolve({
        ...base,
        sido: '부산광역시',
        sigungu: '해운대구',
        dongEnabled: true,
        dongRandom: true,
      });
      expect(['우동', '중동']).toContain(r?.dong);
    }
  });

  it('시도 랜덤 — 항상 데이터에 있는 시도/시군구 조합', () => {
    for (let i = 0; i < 30; i += 1) {
      const r = store.resolve({ ...base, sidoRandom: true });
      expect(r).not.toBeNull();
      const match = ENTRIES.find((e) => e.sido === r!.sido && e.sigungu === r!.sigungu);
      expect(match).toBeDefined();
    }
  });

  it('고정 시도 + 랜덤 시군구 — 그 시도 안에서만 선택', () => {
    for (let i = 0; i < 30; i += 1) {
      const r = store.resolve({ ...base, sido: '서울특별시', sigunguRandom: true });
      expect(r?.sido).toBe('서울특별시');
      expect(['강남구', '마포구']).toContain(r?.sigungu);
    }
  });

  it('고정값이 데이터에 없으면 랜덤으로 폴백', () => {
    const r = store.resolve({ ...base, sido: '없는도', sigungu: '없는구' });
    expect(r).not.toBeNull();
    // 없는 시도는 무시되고 실재 시도 중 하나가 선택된다.
    expect(['서울특별시', '부산광역시']).toContain(r?.sido);
  });

  it('데이터가 비면 null', () => {
    const empty = new RegionStore([]);
    expect(empty.resolve(base)).toBeNull();
    expect(empty.size).toBe(0);
  });
});
