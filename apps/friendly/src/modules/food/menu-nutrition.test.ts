import { describe, expect, it } from 'vitest';
import type { FoodMatch } from './food.service.js';
import {
  MenuNutritionResolver,
  decideMenuKcal,
  parseMenuName,
  stripLeadingModifiers,
  synonymVariants,
  type MenuFoodLookup,
} from './menu-nutrition.js';

const match = (name: string, over: Partial<FoodMatch> = {}): FoodMatch => ({
  foodId: `id-${name}`,
  name,
  nameNorm: name,
  dishType: null,
  mainIngredient: null,
  cuisine: null,
  score: 1,
  matchedBy: 'exact',
  kcal: 400,
  proteinG: null,
  sodiumMg: null,
  servingG: 300,
  kcalPer100g: 133.3,
  nutritionFrom: null,
  ...over,
});

describe('parseMenuName', () => {
  it('태그·괄호·중량을 떼고 중량을 g 으로 남긴다', () => {
    const p = parseMenuName('[대표] 100% 수제닭꼬치 (130g) 1개');
    expect(p.cleaned).toBe('수제닭꼬치');
    expect(p.weight).toEqual({ value: 130, unit: 'g' });
    expect(p.portionAmbiguous).toBe(false);
    expect(p.isSet).toBe(false);
  });

  it('kg·cc·L 를 환산한다', () => {
    expect(parseMenuName('돼지한판 1.2kg').weight).toEqual({ value: 1200, unit: 'g' });
    expect(parseMenuName('500cc카스').weight).toEqual({ value: 500, unit: 'ml' });
    expect(parseMenuName('생맥주 1L').weight).toEqual({ value: 1000, unit: 'ml' });
  });

  it('세트·반반·모듬·결합 기호는 세트로 본다', () => {
    expect(parseMenuName('반반 2가지선택(대)').isSet).toBe(true);
    expect(parseMenuName('와규꽃살 3~4인 세트').isSet).toBe(true);
    expect(parseMenuName('돼지모듬 중 600g').isSet).toBe(true);
    expect(parseMenuName('치킨+콜라').isSet).toBe(true);
    expect(parseMenuName('통갈비살 900g-기본/양념').isSet).toBe(true);
    expect(parseMenuName('김치찌개').isSet).toBe(false);
    // 채소 '가지'는 세트가 아니다.
    expect(parseMenuName('가지볶음').isSet).toBe(false);
  });

  it('인분·크기·수량 표식은 1인분을 막는다', () => {
    expect(parseMenuName('부대찌개 2인분').portionAmbiguous).toBe(true);
    expect(parseMenuName('쟁반짜장 (중)').portionAmbiguous).toBe(true);
    expect(parseMenuName('쟁반짜장 (중)').cleaned).toBe('쟁반짜장');
    expect(parseMenuName('군만두 6개').portionAmbiguous).toBe(true);
    expect(parseMenuName('계란후라이(완숙)').portionAmbiguous).toBe(false);
    expect(parseMenuName('계란후라이(완숙)').cleaned).toBe('계란후라이');
  });

  it('등급 표식과 부연 괄호를 떼고, 괄호 안 한글은 힌트로 남긴다', () => {
    expect(parseMenuName('소고기타다끼(한우++)').cleaned).toBe('소고기타다끼');
    expect(parseMenuName('1++ 한우 육회').cleaned).toBe('한우 육회');
    expect(parseMenuName('부자찌개(된장찌개)').hints).toEqual(['된장찌개']);
    // 등급 표식이 섞인 괄호는 힌트가 아니다.
    expect(parseMenuName('소고기타다끼(한우++)').hints).toEqual([]);
    expect(parseMenuName('차돌박이(150g)').hints).toEqual([]);
  });
});

describe('stripLeadingModifiers / synonymVariants', () => {
  it('앞 수식어만 뗀다 — 재료어는 안 뗀다', () => {
    expect(stripLeadingModifiers('얼큰한 순두부찌개')).toBe('순두부찌개');
    expect(stripLeadingModifiers('명품한우해장국')).toBe('해장국');
    expect(stripLeadingModifiers('삼선 볶음밥')).toBeNull();
    expect(stripLeadingModifiers('김치찌개')).toBeNull();
    expect(stripLeadingModifiers('생면')).toBeNull();
  });

  it('동의어 변형을 양방향으로 만든다', () => {
    expect(synonymVariants('계란찜')).toEqual(['달걀찜']);
    expect(synonymVariants('오뎅탕')).toEqual(['어묵탕']);
    expect(synonymVariants('김치찌개')).toEqual([]);
  });
});

describe('decideMenuKcal', () => {
  it('정확 매칭 + 표식 없음 + 1인분 중량이 기준량보다 큼 → 1인분', () => {
    const r = decideMenuKcal(parseMenuName('김치찌개'), match('김치찌개'));
    expect(r.basis).toBe('per_serving');
    expect(r.kcal).toBe(400);
  });

  it('1인분 중량이 기준량(100g)이면 1인분이 아니라 100g당', () => {
    const r = decideMenuKcal(parseMenuName('돈가스'), match('돈가스', { kcal: 280, servingG: 100, kcalPer100g: 280 }));
    expect(r.basis).toBe('per_100g');
  });

  it('중량이 적힌 메뉴는 정확 매칭이라도 100g당', () => {
    const r = decideMenuKcal(parseMenuName('항정살 150g'), match('항정살'));
    expect(r.basis).toBe('per_100g');
    expect(r.kcal).toBe(133);
  });

  it('cc 중량은 100ml당', () => {
    const r = decideMenuKcal(parseMenuName('생맥주 500cc'), match('생맥주', { kcalPer100g: 42 }));
    expect(r.basis).toBe('per_100ml');
    expect(r.kcal).toBe(42);
  });

  it('인분·크기 표식이 있으면 100g당으로 내려간다', () => {
    expect(decideMenuKcal(parseMenuName('부대찌개 2인분'), match('부대찌개')).basis).toBe('per_100g');
    expect(decideMenuKcal(parseMenuName('쟁반짜장 (중)'), match('쟁반짜장')).basis).toBe('per_100g');
  });

  it('variant/hint/suffix 매칭은 100g당까지만', () => {
    for (const matchedBy of ['variant', 'hint', 'suffix'] as const) {
      const r = decideMenuKcal(parseMenuName('짜장면'), { ...match('짜장면'), matchedBy });
      expect(r.basis).toBe('per_100g');
    }
  });

  it('세트는 매칭돼도 미표시', () => {
    const r = decideMenuKcal(parseMenuName('김치찌개 세트'), match('김치찌개'));
    expect(r.basis).toBeNull();
    expect(r.reason).toBe('set');
  });

  it('퍼지 후보는 표시하지 않고 후보명만 남긴다', () => {
    const r = decideMenuKcal(parseMenuName('토마토라면'), null, '라면');
    expect(r.reason).toBe('fuzzy_rejected');
    expect(r.candidate).toBe('라면');
    expect(r.basis).toBeNull();
  });

  it('1인분 kcal 없고 100g당만 있으면 100g당, 둘 다 없으면 미표시', () => {
    const only100 = decideMenuKcal(parseMenuName('된장찌개'), match('된장찌개', { kcal: null, kcalPer100g: 60 }));
    expect(only100.basis).toBe('per_100g');
    const nothing = decideMenuKcal(parseMenuName('된장찌개'), match('된장찌개', { kcal: null, kcalPer100g: null }));
    expect(nothing.reason).toBe('no_kcal');
  });

  it('donor 추정 문구를 그대로 전달한다', () => {
    const r = decideMenuKcal(parseMenuName('불고기'), match('불고기', { nutritionFrom: '소불고기 외 2종 중앙값' }));
    expect(r.nutritionFrom).toBe('소불고기 외 2종 중앙값');
  });
});

describe('MenuNutritionResolver', () => {
  const catalog = new Map<string, FoodMatch>([
    ['순두부찌개', match('순두부찌개')],
    ['해장국', match('해장국')],
    ['항정살', match('항정살')],
    ['달걀찜', match('달걀찜')],
    ['삼겹살구이', match('삼겹살구이', { kcalPer100g: 467 })],
    ['된장찌개', match('된장찌개')],
    ['쟁반짜장', match('쟁반짜장')],
    ['국수', match('국수')],
  ]);
  const norm = (s: string) => s.replace(/\s+/g, '');
  let calls = 0;
  const lookup: MenuFoodLookup = {
    matchFood: async (name) => {
      calls += 1;
      const hit = catalog.get(norm(name));
      if (hit) return hit;
      // 퍼지 흉내 — 라면 후보만.
      return norm(name) === '토마토라면' ? match('라면', { matchedBy: 'fuzzy', score: 0.4 }) : null;
    },
    matchBySuffix: async (n) => {
      const keys = [...catalog.keys()].filter((k) => n.endsWith(k) && k !== n && k !== '국수');
      keys.sort((a, b) => b.length - a.length);
      return keys[0] ? catalog.get(keys[0])! : null;
    },
  };
  const resolver = new MenuNutritionResolver(lookup);

  it('수식어를 떼서 맞으면 modifier 매칭으로 1인분', async () => {
    const r = await resolver.resolve('얼큰한 순두부찌개');
    expect(r.matchedBy).toBe('modifier');
    expect(r.basis).toBe('per_serving');
    expect(r.foodName).toBe('순두부찌개');
  });

  it('여러 수식어도 뗀다 — 명품한우해장국 → 해장국', async () => {
    expect((await resolver.resolve('명품한우해장국')).foodName).toBe('해장국');
  });

  it('동의어 — 계란찜 → 달걀찜 1인분', async () => {
    const r = await resolver.resolve('계란찜');
    expect(r.matchedBy).toBe('synonym');
    expect(r.basis).toBe('per_serving');
  });

  it('부위 + 구이 — 생삼겹살 150g → 삼겹살구이 100g당', async () => {
    const r = await resolver.resolve('생삼겹살 150g');
    expect(r.matchedBy).toBe('variant');
    expect(r.foodName).toBe('삼겹살구이');
    expect(r.basis).toBe('per_100g');
    expect(r.kcal).toBe(467);
  });

  it('괄호 힌트 — 부자찌개(된장찌개) → 된장찌개 100g당', async () => {
    const r = await resolver.resolve('부자찌개(된장찌개)');
    expect(r.matchedBy).toBe('hint');
    expect(r.basis).toBe('per_100g');
  });

  it('핵심어 접미 — 해물쟁반짜장 → 쟁반짜장 100g당', async () => {
    const r = await resolver.resolve('해물쟁반짜장');
    expect(r.matchedBy).toBe('suffix');
    expect(r.foodName).toBe('쟁반짜장');
    expect(r.basis).toBe('per_100g');
  });

  it('퍼지는 표시하지 않고 후보만, 미매칭은 no_match, 세트는 조회 없이 set', async () => {
    const fuzzy = await resolver.resolve('토마토라면');
    expect(fuzzy.reason).toBe('fuzzy_rejected');
    expect(fuzzy.candidate).toBe('라면');
    expect((await resolver.resolve('트러플 갈비 솥밥')).reason).toBe('no_match');
    const before = calls;
    expect((await resolver.resolve('항정살 세트')).reason).toBe('set');
    expect(calls).toBe(before);
  });

  it('resolveMany 는 같은 이름을 한 번만 조회한다', async () => {
    const before = calls;
    const out = await resolver.resolveMany(['해장국', '해장국', '항정살']);
    expect(out.size).toBe(2);
    expect(calls - before).toBe(2);
  });
});
