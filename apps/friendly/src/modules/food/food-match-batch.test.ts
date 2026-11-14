import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../app.js';
import { normalizeTerm } from '../../lib/text.js';
import { useIsolatedDatabase, type IsolatedDatabase } from '../../test-utils/temp-db.js';
import { DEFAULT_LEXICON } from './engine/index.js';
import { upsertFoodSeeds } from './food-import.service.js';
import {
  FOOD_MATCH_UNDECIDED,
  FUZZY_CANDIDATE_LIMIT,
  FoodService,
  buildFoodMatchIndex,
  foodNameSimilarity,
  matchInFoodIndex,
  type FoodMatchRow,
} from './food.service.js';

// 묶음 매칭 — 카탈로그를 한 번 읽어 메모리에서 판정한 답이 이름마다 matchFood(DB)와 같아야 한다. 순서에 따라 답이
// 갈릴 수 있는 이름(인기도가 같은 후보가 겹침)은 정하지 않고 DB 로 넘긴다.

const row = (name: string, o: { popularity?: number; aliases?: string[] } = {}): FoodMatchRow => ({
  id: `f-${name}`,
  name,
  nameNorm: normalizeTerm(name),
  aliasNormsJson: JSON.stringify((o.aliases ?? []).map(normalizeTerm)),
  popularity: o.popularity ?? 0,
  dishType: null,
  mainIngredient: null,
  cuisine: null,
  kcal: null,
  proteinG: null,
  sodiumMg: null,
  servingG: null,
  kcalPer100g: null,
  nutritionFrom: null,
  source: 'manual',
  sourceCategory: null,
});

const judge = (name: string, rows: FoodMatchRow[]) =>
  matchInFoodIndex(normalizeTerm(name), buildFoodMatchIndex(rows), DEFAULT_LEXICON);
const nameOf = (hit: ReturnType<typeof judge>): string | null | symbol =>
  hit === FOOD_MATCH_UNDECIDED ? hit : (hit?.row.name ?? null);

describe('matchInFoodIndex — 메모리 판정', () => {
  const catalog = [row('김치찌개', { aliases: ['묵은지 김치찌개'] }), row('달걀말이'), row('된장찌개')];

  it('정확 → 별칭 → 표기 변형 → 퍼지 순서로 본다', () => {
    expect(judge('김치 찌개', catalog)).toMatchObject({ row: { name: '김치찌개' }, score: 1, matchedBy: 'exact' });
    expect(judge('묵은지김치찌개', catalog)).toMatchObject({ row: { name: '김치찌개' }, score: 0.95, matchedBy: 'alias' });
    // 계란 ↔ 달걀(어휘의 표기 변형).
    expect(judge('계란말이', catalog)).toMatchObject({ row: { name: '달걀말이' }, score: 0.95, matchedBy: 'alias' });
    expect(judge('김치찌게', catalog)).toMatchObject({ row: { name: '김치찌개' }, matchedBy: 'fuzzy' });
    expect(judge('피자', catalog)).toBeNull();
    expect(judge('  ', catalog)).toBeNull();
  });

  it('별칭이 같은 음식이 둘이면 인기 있는 쪽 — 인기도까지 같으면 정하지 않는다', () => {
    const a = row('돼지국밥', { aliases: ['국밥'], popularity: 3 });
    const b = row('순대국밥', { aliases: ['국밥'], popularity: 1 });
    expect(nameOf(judge('국밥', [a, b]))).toBe('돼지국밥');
    expect(nameOf(judge('국밥', [b, a]))).toBe('돼지국밥');
    expect(judge('국밥', [a, { ...b, popularity: 3 }])).toBe(FOOD_MATCH_UNDECIDED);
  });

  it('퍼지 — 닮음이 같으면 인기 있는 쪽, 인기도까지 같으면 정하지 않는다', () => {
    const query = normalizeTerm('가나다라');
    const a = row('가나다마', { popularity: 2 });
    const b = row('가나다바', { popularity: 1 });
    expect(foodNameSimilarity(query, a.nameNorm)).toBe(foodNameSimilarity(query, b.nameNorm));
    expect(nameOf(judge('가나다라', [b, a]))).toBe('가나다마');
    expect(judge('가나다라', [a, { ...b, popularity: 2 }])).toBe(FOOD_MATCH_UNDECIDED);
    // 더 닮은 음식이 있으면 인기도와 상관없이 그쪽.
    expect(nameOf(judge('가나다라', [a, b, row('가나다라면')]))).toBe('가나다라면');
  });

  describe('퍼지 후보가 한도를 넘을 때(DB 는 인기순으로 한도까지만 본다)', () => {
    // 이름에 '김치'가 들어 후보가 되지만 찾는 말과는 닮지 않은 음식.
    const filler = (n: number, popularity: number) =>
      Array.from({ length: n }, (_, i) => row(`김치${String(i).padStart(3, '0')}가나다라마바사아자차`, { popularity }));

    it('끊기는 자리의 인기도보다 인기 있는 음식이 답이면 그대로 정한다', () => {
      const rows = [row('김치찌개', { popularity: 9 }), ...filler(FUZZY_CANDIDATE_LIMIT + 100, 0)];
      expect(nameOf(judge('김치찌게', rows))).toBe('김치찌개');
    });

    it('끊기는 자리에 걸린 음식이 더 닮았으면 정하지 않는다', () => {
      const rows = [
        row('김치찌개', { popularity: 9 }),
        ...filler(FUZZY_CANDIDATE_LIMIT + 100, 0),
        row('김치만두전골탕', { popularity: 0 }),
      ];
      expect(judge('김치만두전골', rows)).toBe(FOOD_MATCH_UNDECIDED);
    });

    it('한도까지만 들어가는 것이 분명하면 그 밖의 음식은 보지 않는다', () => {
      const rows = [...filler(FUZZY_CANDIDATE_LIMIT, 1), row('김치만두전골탕', { popularity: 0 })];
      expect(judge('김치만두전골', rows)).toBeNull();
    });
  });
});

describe('FoodService.matchFoods (격리 DB) — 이름마다 matchFood 와 같다', () => {
  let app: FastifyInstance;
  let isolated: IsolatedDatabase;

  beforeAll(async () => {
    isolated = await useIsolatedDatabase();
    app = await buildApp({ logger: false });
    await app.ready();
    await upsertFoodSeeds(app.prisma, [
      { name: '김치찌개', source: 'manual', aliases: ['묵은지 김치찌개'], popularity: 5 },
      { name: '된장찌개', source: 'manual', popularity: 3 },
      { name: '순두부찌개', source: 'manual', popularity: 3 },
      { name: '달걀말이', source: 'manual' },
      { name: '완자전', source: 'manual' },
      { name: '돼지국밥', source: 'manual', aliases: ['국밥'], popularity: 2 },
      { name: '순대국밥', source: 'manual', aliases: ['국밥'], popularity: 2 },
      { name: '가나다마', source: 'manual' },
      { name: '가나다바', source: 'manual' },
      // 퍼지 후보가 한도를 넘는 말('볶음')
      ...Array.from({ length: FUZZY_CANDIDATE_LIMIT + 40 }, (_, i) => ({
        name: `재료${String(i).padStart(3, '0')}볶음`,
        source: 'manual' as const,
        popularity: i % 3,
      })),
    ]);
  }, 120_000);
  afterAll(async () => {
    await app.close();
    isolated.restore();
  });

  const names = [
    '김치찌개',
    '김치 찌개',
    '묵은지 김치찌개',
    '김치찌게',
    '계란말이',
    '동그랑땡',
    '국밥', // 별칭이 같고 인기도도 같은 두 음식 — DB 로 넘어간다
    '가나다라', // 닮음·인기도가 같은 두 음식 — DB 로 넘어간다
    '제육볶음', // 후보가 한도를 넘는다
    '재료007볶음',
    '재료07볶음',
    '된장찌게',
    '피자',
    '순두부',
    '가',
    '',
  ];

  it('묶음으로 물은 답이 하나씩 물은 답과 같다', async () => {
    const food = new FoodService(app.prisma);
    const many = await food.matchFoods(names);
    expect([...many.keys()]).toEqual([...new Set(names)]);
    for (const name of names) {
      expect(many.get(name), name).toEqual(await food.matchFood(name));
    }
    // 눈으로 보는 확인 — 갈래마다 하나씩.
    expect(many.get('김치 찌개')).toMatchObject({ name: '김치찌개', matchedBy: 'exact' });
    expect(many.get('묵은지 김치찌개')).toMatchObject({ name: '김치찌개', matchedBy: 'alias' });
    expect(many.get('동그랑땡')).toMatchObject({ name: '완자전', matchedBy: 'alias' });
    expect(many.get('김치찌게')).toMatchObject({ name: '김치찌개', matchedBy: 'fuzzy' });
    expect(many.get('피자')).toBeNull();
  });

  it('이름이 몇 개 안 되면 카탈로그를 읽지 않고 하나씩 묻는다 — 답은 같다', async () => {
    const food = new FoodService(app.prisma);
    const few = await food.matchFoods(['김치찌게', '국밥', '피자']);
    expect(few.get('김치찌게')).toEqual(await food.matchFood('김치찌게'));
    expect(few.get('국밥')).toEqual(await food.matchFood('국밥'));
    expect(few.get('피자')).toBeNull();
  });

  it('카탈로그 색인은 10분 주기로 다시 읽는다 — 그사이 고친 것은 주기 뒤에 보인다', async () => {
    const food = new FoodService(app.prisma);
    const realNow = Date.now;
    let offset = 0;
    const now = vi.spyOn(Date, 'now').mockImplementation(() => realNow() + offset);
    try {
      // 이름이 충분해 카탈로그 색인을 읽는다.
      expect((await food.matchFoods([...names, '순두부찌개'])).get('순두부찌개')).toMatchObject({ matchedBy: 'exact' });
      await app.prisma.foodItem.update({ where: { nameNorm: '순두부찌개' }, data: { active: false } });
      // 색인이 살아 있는 동안은 이름이 적어도 색인으로 답한다.
      expect((await food.matchFoods(['순두부찌개'])).get('순두부찌개')).toMatchObject({ matchedBy: 'exact' });
      offset = 10 * 60_000 + 1000;
      expect((await food.matchFoods([...names, '순두부찌개'])).get('순두부찌개')).toEqual(
        await food.matchFood('순두부찌개'),
      );
      expect((await food.matchFood('순두부찌개'))?.matchedBy).not.toBe('exact');
    } finally {
      now.mockRestore();
      await app.prisma.foodItem.update({ where: { nameNorm: '순두부찌개' }, data: { active: true } });
    }
  });
});
