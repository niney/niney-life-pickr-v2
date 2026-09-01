import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LEXICON,
  MenuNutritionEngine,
  buildCatalogIndex,
  catalogRow,
  decideMenuKcal,
  parseMenuName,
  stripLeadingModifiers,
  synonymVariants,
  type MatchInput,
} from './menu-nutrition.js';

const match = (name: string, over: Partial<MatchInput> = {}): MatchInput => ({
  foodId: `id-${name}`,
  name,
  matchedBy: 'exact',
  kcal: 400,
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
    // 맛 선택("기본/양념")은 세트가 아니다 — 떼고 본다. 음식이 둘인 결합은 여전히 세트.
    const option = parseMenuName('통갈비살 900g-기본/양념');
    expect(option.isSet).toBe(false);
    expect(option.cleaned).toBe('통갈비살');
    expect(parseMenuName('통새우/가리비관자/소세지').isSet).toBe(true);
    expect(parseMenuName('버터갈릭/달콤베이컨 감자튀김').isSet).toBe(true);
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

describe('MenuNutritionEngine', () => {
  const engine = new MenuNutritionEngine(
    buildCatalogIndex([
      catalogRow('순두부찌개', { kcal: 400, servingG: 300, kcalPer100g: 133 }),
      catalogRow('해장국', { kcal: 400, servingG: 300, kcalPer100g: 133 }),
      catalogRow('항정살', { kcal: 400, servingG: 300, kcalPer100g: 133 }),
      catalogRow('달걀찜', { kcal: 400, servingG: 300, kcalPer100g: 133 }),
      catalogRow('삼겹살구이', { kcal: 400, servingG: 300, kcalPer100g: 467 }),
      catalogRow('된장찌개', { kcal: 400, servingG: 300, kcalPer100g: 133 }),
      catalogRow('쟁반짜장', { kcal: 400, servingG: 300, kcalPer100g: 133 }),
      catalogRow('국수', { kcal: 400, servingG: 300, kcalPer100g: 133 }),
      catalogRow('족발', { kcal: 583, servingG: 250, kcalPer100g: 233 }),
      catalogRow('짬뽕', { kcal: 500, servingG: 900, kcalPer100g: 58 }),
      catalogRow('소앞다리', { kcalPer100g: 188, source: 'mfds-raw' }),
      catalogRow('소차돌박이', { kcalPer100g: 375, source: 'mfds-raw', aliases: ['차돌박이', '차돌', '우삼겹'] }),
      catalogRow('돼지삼겹살', { kcalPer100g: 325, source: 'mfds-raw', aliases: ['삼겹살', '냉삼'] }),
      catalogRow('돼지목심', { kcalPer100g: 227, source: 'mfds-raw', aliases: ['목살'] }),
      catalogRow('닭모래주머니', { kcalPer100g: 84, source: 'mfds-raw', aliases: ['닭똥집'] }),
      catalogRow('스테이크', { kcalPer100g: 194 }),
      catalogRow('사케', { kcal: 315, servingG: 300, kcalPer100g: 105, aliases: ['도쿠리'] }),
      catalogRow('하이볼', { kcal: 165, servingG: 300, kcalPer100g: 55 }),
      catalogRow('닭꼬치구이', { kcalPer100g: 181 }),
      catalogRow('아메리카노', { kcal: 7, servingG: 350, kcalPer100g: 2 }),
      catalogRow('물회', { kcal: 532, servingG: 500, kcalPer100g: 106 }),
      catalogRow('토닉워터', { kcalPer100g: 34, aliases: ['토닉'] }),
      catalogRow('대하', { kcalPer100g: 82, source: 'mfds-raw', sourceCategory: '어패류 및 기타 수산물', aliases: ['새우'] }),
      catalogRow('깐쇼새우', { kcalPer100g: 150 }),
    ], DEFAULT_LEXICON.extraAliases),
  );

  it('수식어를 떼서 맞으면 modifier 매칭으로 1인분', () => {
    const r = engine.resolve('얼큰한 순두부찌개');
    expect(r.matchedBy).toBe('modifier');
    expect(r.basis).toBe('per_serving');
    expect(r.foodName).toBe('순두부찌개');
  });

  it('여러 수식어도 뗀다 — 명품한우해장국 → 해장국', () => {
    expect(engine.resolve('명품한우해장국').foodName).toBe('해장국');
  });

  it('동의어 — 계란찜 → 달걀찜 1인분', () => {
    const r = engine.resolve('계란찜');
    expect(r.matchedBy).toBe('synonym');
    expect(r.basis).toBe('per_serving');
  });

  it('부위 + 구이 — 생삼겹살 150g 은 별칭이 없으면 삼겹살구이 100g당', () => {
    const r = engine.resolve('생목살구이 150g');
    expect(r.foodName).toBe('돼지목심');
    const v = engine.resolve('생삼겹 150g');
    expect(v.reason).toBe('no_match');
  });

  it('조리 접미 제거 → 원재료 — 닭똥집 소금구이 → 닭모래주머니', () => {
    const r = engine.resolve('닭똥집 소금구이');
    expect(r.matchedBy).toBe('variant');
    expect(r.foodName).toBe('닭모래주머니');
    expect(r.basis).toBe('per_100g');
  });

  it('괄호 힌트 — 부자찌개(된장찌개) → 된장찌개 100g당. 생재료 힌트는 쓰지 않고 본체 접미가 이긴다', () => {
    const r = engine.resolve('부자찌개(된장찌개)');
    expect(r.matchedBy).toBe('hint');
    expect(r.basis).toBe('per_100g');
    expect(engine.resolve('화덕통구이족발(앞다리)').foodName).toBe('족발');
    expect(engine.resolve('차돌해물짬뽕(우삼겹)').foodName).toBe('짬뽕');
  });

  it('핵심어 접미 — 해물쟁반짜장 → 쟁반짜장 100g당. 범주어(국수)·2자 별칭(토닉)에는 붙지 않는다', () => {
    const r = engine.resolve('해물쟁반짜장');
    expect(r.matchedBy).toBe('suffix');
    expect(r.foodName).toBe('쟁반짜장');
    expect(r.basis).toBe('per_100g');
    expect(engine.resolve('동치미국수').reason).toBe('no_match');
    expect(engine.resolve('진토닉').reason).toBe('no_match');
  });

  it('생재료 접미는 고기 부위만 — 망고목살은 목살이지만 칠리새우는 새우(생것)가 아니다', () => {
    expect(engine.resolve('망고 목살').foodName).toBe('돼지목심');
    const r = engine.resolve('칠리새우');
    expect(r.reason).toBe('no_match');
    expect(r.trace).toContain('suffix:칠리새우 ✗raw(대하)');
  });

  it('크기 수식어(미니·점보)는 떼되 1인분 표시를 막는다', () => {
    const r = engine.resolve('미니족');
    expect(r.foodName).toBe('족발');
    expect(r.basis).toBe('per_100g');
  });

  it('한판·반판은 부위를 찾으면 100g당, 못 찾으면 세트', () => {
    const r = engine.resolve('냉삼한판(600g)');
    expect(r.foodName).toBe('돼지삼겹살');
    expect(r.basis).toBe('per_100g');
    expect(engine.resolve('차돌한판(450g)').foodName).toBe('소차돌박이');
    expect(engine.resolve('돼지한판(600g)').reason).toBe('set');
  });

  it('세트어는 토큰 앞뒤에서만 — 쿄코코스테이크는 세트가 아니고, 맛 선택·온도 선택도 세트가 아니다', () => {
    expect(engine.resolve('쿄코코스테이크 (400g)').foodName).toBe('스테이크');
    expect(engine.resolve('도쿠리 (냉/온)').foodName).toBe('사케');
    expect(engine.resolve('Y,G,R 티나 하이볼').foodName).toBe('하이볼');
    expect(engine.resolve('100% 수제닭꼬치 10개 (3가지맛선택)').foodName).toBe('닭꼬치구이');
    expect(engine.resolve('반반 2가지선택(대)').reason).toBe('set');
    expect(engine.resolve('커플세트').reason).toBe('set');
  });

  it('ICE 태그는 HOT 처럼 떼고, "2인이상"은 1인분 표시를 막는다', () => {
    expect(engine.resolve('ICE 아메리카노').basis).toBe('per_serving');
    expect(engine.resolve('물회(2인이상)').basis).toBe('per_100g');
  });

  it('결합 기호 세트는 구성요소를 따로 판정해 둔다', () => {
    const r = engine.resolve('족발+냉삼');
    expect(r.reason).toBe('set');
    expect(r.components.map((c) => [c.name, c.foodName])).toEqual([
      ['족발', '족발'],
      ['냉삼', '돼지삼겹살'],
    ]);
  });

  it('트레이스에 시도한 단계가 남는다', () => {
    const r = engine.resolve('해물쟁반짜장');
    expect(r.trace[0]).toMatch(/^direct:해물쟁반짜장 ✗/);
    expect(r.trace.at(-1)).toBe('suffix:해물쟁반짜장 ✓쟁반짜장');
  });

  it('resolveMany 는 같은 이름을 한 번만 담는다', () => {
    const out = engine.resolveMany(['해장국', '해장국', '항정살']);
    expect(out.size).toBe(2);
  });
});
