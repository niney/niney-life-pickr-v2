import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FoodCuisine, FoodDishType, FoodMainIngredient, FoodSource } from '@repo/api-contract';
import { FOOD_CUISINES, FOOD_DISH_TYPES, FOOD_MAIN_INGREDIENTS, FOOD_SOURCES } from '@repo/utils';
import { buildApp } from '../../app.js';
import { useIsolatedDatabase, type IsolatedDatabase } from '../../test-utils/temp-db.js';
import {
  __foodImportInternals,
  applyNameRules,
  normalizeHansik800Rows,
  normalizeMafraRows,
  normalizeMenuCanonicalRows,
  normalizeMfdsNutritionRows,
  normalizeMfdsRecipeRows,
  parseRecipeIngredients,
  upsertFoodSeeds,
} from './food-import.service.js';
import { FoodService, foodNameSimilarity } from './food.service.js';

// 정규화는 순수 함수 — 픽스처(실응답 형식을 본뜬 최소 행)로 네트워크 없이 검증. upsert·검색·매칭은
// 격리 DB(빈 테이블)에서.

describe('food taxonomy — api-contract enum 과 @repo/utils 키 목록 동기화', () => {
  it('dishType/mainIngredient/cuisine/source 키와 순서가 같다', () => {
    expect(FoodDishType.options).toEqual([...FOOD_DISH_TYPES]);
    expect(FoodMainIngredient.options).toEqual([...FOOD_MAIN_INGREDIENTS]);
    expect(FoodCuisine.options).toEqual([...FOOD_CUISINES]);
    expect(FoodSource.options).toEqual([...FOOD_SOURCES]);
  });
});

describe('normalizeMfdsNutritionRows — 표준데이터(음식)', () => {
  const rows = [
    // 요리류: 대표식품 '김치찌개' 변형 2개(가정식 분석이 프랜차이즈보다 우선).
    { foodCd: 'D101-001', foodNm: '김치찌개_돼지고기', foodLv3Nm: '찌개 및 전골류', foodLv4Nm: '김치찌개', foodOriginNm: '외식(프랜차이즈 제공)', nutConSrtrQua: '100g', enerc: '50', prot: '4', fatce: '3', chocdf: '2', sugar: '0.5', nat: '400', foodSize: '400g' },
    { foodCd: 'D101-002', foodNm: '김치찌개', foodLv3Nm: '찌개 및 전골류', foodLv4Nm: '김치찌개', foodOriginNm: '가정식(분석 함량)', nutConSrtrQua: '100g', enerc: '40', prot: '3', fatce: '2', chocdf: '2', sugar: '0.4', nat: '350', foodSize: '300g' },
    // 요리류: 밥류 대표식품 '비빔밥'.
    { foodCd: 'D101-003', foodNm: '비빔밥_산채', foodLv3Nm: '밥류', foodLv4Nm: '비빔밥', foodOriginNm: '외식(재료량 산출)', enerc: '120', prot: '4', fatce: '3', chocdf: '20', sugar: '1', nat: '300', foodSize: '500g' },
    // 비요리류(프랜차이즈 상품): 대표식품 '피자' 변형 3개 → 행 1개, 변형은 별칭으로 안 남김.
    { foodCd: 'D102-001', foodNm: '피자_페퍼로니_A사', foodLv3Nm: '빵 및 과자류', foodLv4Nm: '피자', foodOriginNm: '외식(프랜차이즈 제공)', enerc: '250', prot: '10', fatce: '10', chocdf: '30', sugar: '3', nat: '600', foodSize: '120g' },
    { foodCd: 'D102-002', foodNm: '피자_불고기_B사', foodLv3Nm: '빵 및 과자류', foodLv4Nm: '피자', foodOriginNm: '외식(프랜차이즈 제공)', enerc: '260', prot: '11', fatce: '11', chocdf: '31', sugar: '3', nat: '610', foodSize: '125g' },
    { foodCd: 'D102-003', foodNm: '피자_치즈_C사', foodLv3Nm: '빵 및 과자류', foodLv4Nm: '피자', foodOriginNm: '외식(프랜차이즈 제공)', enerc: '240', prot: '9', fatce: '9', chocdf: '29', sugar: '3', nat: '590', foodSize: '110g' },
    // 이름 없음 → drop.
    { foodCd: 'X', foodNm: '', foodLv3Nm: '밥류', foodLv4Nm: '' },
  ];

  it('대표식품 단위로 축약하고 요리류 변형만 별칭으로 남긴다', () => {
    const { seeds, report } = normalizeMfdsNutritionRows(rows);
    expect(report.fetched).toBe(7);
    expect(report.produced).toBe(3);
    expect(report.dropped['no_name']).toBe(1);
    const kimchi = seeds.find((s) => s.name === '김치찌개')!;
    expect(kimchi.dishType).toBe('stew');
    expect(kimchi.aliases).toEqual(['김치찌개 돼지고기']);
    expect(kimchi.sourceCategory).toBe('찌개 및 전골류');
    // 가정식(분석) 변형의 100g 값 × 300g/100 = 3배.
    expect(kimchi.servingG).toBe(300);
    expect(kimchi.nutrition?.kcal).toBe(120);
    expect(kimchi.nutrition?.sodiumMg).toBe(1050);
    const pizza = seeds.find((s) => s.name === '피자')!;
    expect(pizza.dishType).toBe('bakery');
    expect(pizza.aliases).toEqual([]);
    expect(seeds.find((s) => s.name === '비빔밥')?.dishType).toBe('rice');
  });

  it('parseSize/originPriority 보조 함수', () => {
    expect(__foodImportInternals.parseSize('780ml')).toEqual({ value: 780, unit: 'ml' });
    expect(__foodImportInternals.parseSize('1.2kg')).toEqual({ value: 1200, unit: 'g' });
    expect(__foodImportInternals.parseSize('')).toBeNull();
    expect(__foodImportInternals.originPriority('가정식(분석 함량)')).toBeLessThan(__foodImportInternals.originPriority('외식(프랜차이즈 제공)'));
  });
});

describe('normalizeMfdsRecipeRows / parseRecipeIngredients — 식품안전나라 레시피', () => {
  it('재료 문자열에서 수량·단위·섹션 라벨을 걷어낸다', () => {
    const ing = parseRecipeIngredients('연두부 75g(3/4모), 칵테일새우 20g(5마리), 달걀 30g(1/2개), 생크림 13g(1큰술)\n●양념장 : 진간장 5g(1작은술), 소금 약간');
    expect(ing).toEqual(['연두부', '칵테일새우', '달걀', '생크림', '진간장', '소금']);
    expect(parseRecipeIngredients(null)).toEqual([]);
  });

  it('이름·조리법·영양·재료를 시드로 만든다(중복 이름 drop)', () => {
    const { seeds, report } = normalizeMfdsRecipeRows([
      { RCP_SEQ: '28', RCP_NM: '새우 두부 계란찜', RCP_WAY2: '찌기', RCP_PAT2: '반찬', INFO_WGT: '100', INFO_ENG: '220', INFO_CAR: '3', INFO_PRO: '14', INFO_FAT: '17', INFO_NA: '99', RCP_PARTS_DTLS: '연두부 75g, 칵테일새우 20g' },
      { RCP_SEQ: '29', RCP_NM: '새우두부계란찜', RCP_WAY2: '찌기', RCP_PAT2: '반찬' },
      { RCP_SEQ: '30', RCP_NM: '된장찌개', RCP_WAY2: '끓이기', RCP_PAT2: '국&찌개' },
    ]);
    expect(report.produced).toBe(2);
    expect(report.dropped['duplicate']).toBe(1);
    const egg = seeds[0]!;
    expect(egg.dishType).toBe('steam');
    expect(egg.ingredients).toEqual(['연두부', '칵테일새우']);
    expect(egg.nutrition?.kcal).toBe(220);
    expect(egg.sourceCategory).toBe('반찬/찌기');
    // 끓이기(soup) 보다 이름 규칙(찌개 → stew)이 우선.
    expect(seeds[1]!.dishType).toBe('stew');
  });
});

describe('normalizeMafraRows — MAFRA 레시피 기본+재료', () => {
  it('주재료 라벨로 mainIngredient, NATION_NM 으로 cuisine 을 채운다', () => {
    const { seeds } = normalizeMafraRows(
      [{ RECIPE_ID: 1, RECIPE_NM_KO: '나물비빔밥', NATION_NM: '한식', TY_NM: '밥' }, { RECIPE_ID: 2, RECIPE_NM_KO: '탕수육', NATION_NM: '중식', TY_NM: '일품' }],
      [
        { RECIPE_ID: 1, IRDNT_NM: '쌀', IRDNT_TY_NM: '주재료' },
        { RECIPE_ID: 1, IRDNT_NM: '고사리', IRDNT_TY_NM: '부재료' },
        { RECIPE_ID: 2, IRDNT_NM: '돼지고기', IRDNT_TY_NM: '주재료' },
        { RECIPE_ID: 2, IRDNT_NM: '녹말', IRDNT_TY_NM: '부재료' },
      ],
    );
    expect(seeds[0]).toMatchObject({ name: '나물비빔밥', dishType: 'rice', cuisine: 'korean', ingredients: ['쌀', '고사리'] });
    expect(seeds[1]).toMatchObject({ name: '탕수육', mainIngredient: 'pork', cuisine: 'chinese', dishType: 'fried' });
  });
});

describe('normalizeMenuCanonicalRows — 외식 메뉴 어휘', () => {
  it('식당 2곳 미만·너무 짧은 이름을 거르고 categoryPath 루트 힌트를 붙인다', () => {
    const { seeds, report } = normalizeMenuCanonicalRows([
      { id: '1', displayName: '물냉면', globalKey: '물냉면', categoryPath: '면 > 냉면 > 물냉면', restaurantCount: 5 },
      { id: '2', displayName: '깅치', globalKey: '깅치', categoryPath: '기타 > 깅치', restaurantCount: 1 },
      { id: '3', displayName: '회', globalKey: '회', categoryPath: '회·초밥 > 회', restaurantCount: 9 },
      { id: '4', displayName: '광어회', globalKey: '광어회', categoryPath: '회·초밥 > 광어회', restaurantCount: 3 },
    ]);
    expect(report.dropped['few_restaurants']).toBe(1);
    expect(report.dropped['too_short']).toBe(1);
    expect(seeds.map((s) => s.name)).toEqual(['물냉면', '광어회']);
    expect(seeds[0]).toMatchObject({ dishType: 'noodle', popularity: 5, sourceCategory: '면 > 냉면 > 물냉면' });
    expect(seeds[1]).toMatchObject({ dishType: 'raw_fish', mainIngredient: 'fish' });
  });
});

describe('normalizeHansik800Rows — 800선 CSV', () => {
  it('요리명·카테고리·외국어 별칭을 시드로 만든다', () => {
    const header = ['요리번호', '800선 카테고리', '요리명', '라틴어 발음', '설명', '영어', '일본어', '중문1', '중문2'];
    const { seeds } = normalizeHansik800Rows(header, [
      ['1', '구이', '갈비구이', 'Galbi-gui', '…', 'Grilled Ribs', 'カルビ焼き', '烤排骨', '烤牛排'],
      ['2', '찌개', '김치찌개', 'Kimchi-jjigae', '…', 'Kimchi Stew', 'キムチチゲ', '泡菜汤', '泡菜锅'],
    ]);
    expect(seeds[0]).toMatchObject({ name: '갈비구이', dishType: 'grill', cuisine: 'korean', sourceId: '1' });
    expect(seeds[0]!.aliases).toEqual(['Galbi-gui', 'Grilled Ribs', 'カルビ焼き', '烤排骨']);
    expect(seeds[1]!.dishType).toBe('stew');
  });
});

describe('applyNameRules / foodNameSimilarity', () => {
  it('이름 규칙으로 빈 분류를 채운다', () => {
    expect(applyNameRules({ name: '삼계탕', source: 'manual' })).toMatchObject({ dishType: 'soup', mainIngredient: 'chicken', cuisine: 'korean' });
    expect(applyNameRules({ name: '짜장면', source: 'manual' })).toMatchObject({ dishType: 'noodle', cuisine: 'chinese' });
    expect(applyNameRules({ name: '아메리카노', source: 'manual' })).toMatchObject({ dishType: 'beverage' });
  });
  it('유사도 — 오타·포함은 통과, 다른 찌개는 탈락', () => {
    expect(foodNameSimilarity('김치찌개', '김치찌게')).toBeGreaterThanOrEqual(0.5);
    expect(foodNameSimilarity('묵은지김치찌개', '김치찌개')).toBeGreaterThanOrEqual(0.5);
    expect(foodNameSimilarity('된장찌개', '김치찌개')).toBeLessThan(0.5);
    expect(foodNameSimilarity('', '김치찌개')).toBe(0);
  });
});

describe('upsertFoodSeeds + FoodService (격리 DB)', () => {
  let app: FastifyInstance;
  let isolated: IsolatedDatabase;

  beforeAll(async () => {
    isolated = await useIsolatedDatabase();
    app = await buildApp({ logger: false });
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
    isolated.restore();
  });

  it('신규 생성 → 다른 출처 병합(빈 필드 채움·별칭 합집합·sourceRefs·popularity max)', async () => {
    const r1 = await upsertFoodSeeds(app.prisma, [
      { name: '김치찌개', repName: '김치찌개', aliases: ['김치 찌개'], dishType: 'stew', source: 'mfds-nutrition', sourceId: 'D1', servingG: 300, nutrition: { kcal: 120, carbG: 6, proteinG: 9, fatG: 6, sodiumMg: 1050, sugarG: 1 } },
      { name: '김치찌개', source: 'mfds-nutrition', sourceId: 'D1-dup' }, // 배치 내 중복 → 접힘
    ]);
    expect(r1).toEqual({ inserted: 1, updated: 0, skipped: 1 });

    const r2 = await upsertFoodSeeds(app.prisma, [
      { name: '김치 찌개', aliases: ['묵은지김치찌개'], ingredients: ['김치', '돼지고기', '두부'], source: 'mfds-recipe', sourceId: 'R9', popularity: 0 },
      { name: '김치찌개', source: 'menu-canonical', sourceId: '김치찌개', popularity: 17 },
    ]);
    expect(r2.inserted).toBe(0);
    expect(r2.updated).toBeGreaterThanOrEqual(1);

    const row = await app.prisma.foodItem.findUnique({ where: { nameNorm: '김치찌개' } });
    expect(row).not.toBeNull();
    expect(row!.source).toBe('mfds-nutrition');
    expect(JSON.parse(row!.aliasesJson)).toEqual(['김치 찌개', '묵은지김치찌개']);
    expect(JSON.parse(row!.aliasNormsJson)).toEqual(['묵은지김치찌개']);
    expect(JSON.parse(row!.ingredientsJson!)).toEqual(['김치', '돼지고기', '두부']);
    expect(row!.popularity).toBe(17);
    expect(JSON.parse(row!.sourceRefsJson)).toEqual([
      { source: 'mfds-recipe', sourceId: 'R9' },
      { source: 'menu-canonical', sourceId: '김치찌개' },
    ]);
    // 이름 규칙으로 채워진 주재료·계통.
    expect(row!.mainIngredient).toBe('pork');
    expect(row!.cuisine).toBe('korean');
  });

  it('검색·매칭: 정확/별칭/퍼지/비활성 제외', async () => {
    await upsertFoodSeeds(app.prisma, [
      { name: '된장찌개', source: 'manual' },
      { name: '순두부찌개', source: 'manual', popularity: 3 },
    ]);
    const food = new FoodService(app.prisma);
    const hits = await food.search('찌개', 10);
    expect(hits.map((h) => h.name)).toEqual(expect.arrayContaining(['김치찌개', '된장찌개', '순두부찌개']));
    // 정확 일치가 맨 앞.
    expect((await food.search('김치찌개', 10))[0]?.name).toBe('김치찌개');

    expect((await food.matchFood('김치찌개'))?.matchedBy).toBe('exact');
    expect((await food.matchFood('묵은지 김치찌개'))?.matchedBy).toBe('alias');
    const fuzzy = await food.matchFood('김치찌게');
    expect(fuzzy?.name).toBe('김치찌개');
    expect(fuzzy?.matchedBy).toBe('fuzzy');
    expect(await food.matchFood('피자')).toBeNull();

    const item = await app.prisma.foodItem.findUnique({ where: { nameNorm: '된장찌개' } });
    await food.adminUpdate(item!.id, { active: false });
    expect((await food.search('된장', 10)).length).toBe(0);
    expect(await food.matchFood('된장찌개')).toBeNull();
  });

  it('adminCreate 중복 이름은 duplicate_name, adminStats 집계', async () => {
    const food = new FoodService(app.prisma);
    await expect(food.adminCreate({ name: '김치 찌개' })).rejects.toMatchObject({ code: 'duplicate_name' });
    const created = await food.adminCreate({ name: '새 음식', dishType: 'other', aliases: ['신메뉴'] });
    expect(created.source).toBe('manual');
    const stats = await food.adminStats();
    expect(stats.total).toBe(4);
    expect(stats.active).toBe(3);
    expect(stats.bySource.find((s) => s.source === 'manual')?.count).toBe(3);
  });
});
