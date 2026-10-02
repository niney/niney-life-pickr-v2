import { describe, expect, it } from 'vitest';
import { rankFrequentMealItems, type FrequentDefault, type FrequentOccurrence } from './meal-frequent.js';

// 빠른 추가 순위 — 끼니 단위 횟수·최근성·끼니 가중, 주식/반찬 다수결, 기본 목록 채우기.

const NOW = new Date('2026-10-02T12:00:00.000Z');
const daysAgo = (d: number): Date => new Date(NOW.getTime() - d * 86_400_000);

let seq = 0;
const occ = (name: string, ago: number, over: Partial<FrequentOccurrence> = {}): FrequentOccurrence => ({
  entryId: `e${(seq += 1)}`,
  eatenAt: daysAgo(ago),
  eatenDate: daysAgo(ago).toISOString().slice(0, 10),
  slot: 'lunch',
  name,
  nameNorm: name.replace(/\s+/g, ''),
  foodId: `f-${name}`,
  dishType: null,
  mainIngredient: null,
  cuisine: null,
  isMain: true,
  portion: null,
  servings: null,
  portionSource: null,
  ...over,
});

const defaults: FrequentDefault[] = [
  { name: '공기밥', nameNorm: '공기밥', foodId: 'f-rice', dishType: 'rice', mainIngredient: 'grain', cuisine: 'korean' },
  { name: '배추김치', nameNorm: '배추김치', foodId: 'f-kimchi', dishType: 'kimchi', mainIngredient: 'vegetable', cuisine: 'korean' },
];

describe('rankFrequentMealItems', () => {
  it('자주·최근 먹은 순으로 앞에 두고, 같은 끼니에 먹은 기록에 가중을 준다', () => {
    const rows = [
      occ('김치찌개', 2),
      occ('김치찌개', 9),
      occ('라면', 1),
      occ('토스트', 3, { slot: 'breakfast' }),
    ];
    const lunch = rankFrequentMealItems(rows, { slot: 'lunch', limit: 3, now: NOW, defaults: [] });
    expect(lunch.map((i) => i.name)).toEqual(['김치찌개', '라면', '토스트']);
    expect(lunch[0]).toMatchObject({ count: 2, from: 'history' });
    // 아침을 고르면 아침에 먹던 토스트가 앞으로 온다.
    const breakfast = rankFrequentMealItems(rows, { slot: 'breakfast', limit: 3, now: NOW, defaults: [] });
    expect(breakfast[0]?.name).toBe('토스트');
  });

  it('한 끼에 같은 음식이 여러 줄이어도 한 번으로 센다', () => {
    const e = occ('깍두기', 1);
    const rows = [e, { ...e }, occ('콩나물무침', 1), occ('콩나물무침', 5)];
    const r = rankFrequentMealItems(rows, { limit: 5, now: NOW, defaults: [] });
    expect(r.find((i) => i.name === '깍두기')?.count).toBe(1);
    expect(r[0]?.name).toBe('콩나물무침');
  });

  it('값은 가장 최근 기록을, 주식/반찬은 2번 이상이면 다수결을 따른다', () => {
    const rows = [
      occ('멸치볶음', 1, { isMain: false, portion: 'small', portionSource: 'vision_ordinal' }),
      occ('멸치볶음', 4, { isMain: false }),
      occ('멸치볶음', 6, { isMain: true, portion: 'large' }),
    ];
    const [item] = rankFrequentMealItems(rows, { limit: 1, now: NOW, defaults: [] });
    expect(item).toMatchObject({ isMain: false, portion: 'small', count: 3 });
  });

  it('기본 목록 음식은 기록이 한 번뿐이면 기본값(반찬)을, 그 밖의 음식은 그 기록을 따른다', () => {
    const rows = [occ('공기밥', 1, { isMain: true }), occ('제육볶음', 1, { isMain: true })];
    const r = rankFrequentMealItems(rows, { limit: 4, now: NOW, defaults });
    expect(r.find((i) => i.name === '공기밥')).toMatchObject({ isMain: false, from: 'history', count: 1 });
    expect(r.find((i) => i.name === '제육볶음')?.isMain).toBe(true);
  });

  it('모자라면 기본 목록으로 채우되 이미 나온 음식은 빼고, limit 를 넘기지 않는다', () => {
    const r = rankFrequentMealItems([occ('공기밥', 2)], { limit: 2, now: NOW, defaults });
    expect(r.map((i) => [i.name, i.from])).toEqual([
      ['공기밥', 'history'],
      ['배추김치', 'default'],
    ]);
    expect(r[1]).toMatchObject({ isMain: false, count: 0, lastEatenDate: null, foodId: 'f-kimchi' });
    // 기록이 없으면 기본 목록만.
    expect(rankFrequentMealItems([], { limit: 12, now: NOW, defaults }).map((i) => i.name)).toEqual(['공기밥', '배추김치']);
  });
});
