import { describe, expect, it } from 'vitest';
import { DEFAULT_LEXICON_SOURCE, compileLexicon, mergeLexiconRows } from './engine/index.js';
import { mealServingNutrition, type ServingCatalogRow } from './food-serving.js';

// 식단 기록의 한 끼 1인분 — 식약처 식품중량(시료·급식 1회량)을 원본 수정 없이 바로잡는 규칙.

const lex = compileLexicon(DEFAULT_LEXICON_SOURCE);

// 제육볶음 외식 행 — 식품중량 100ml 라 카탈로그 1인분이 100g 짜리다.
const jeyuk: ServingCatalogRow = {
  name: '제육볶음',
  source: 'mfds-nutrition',
  sourceCategory: '볶음류',
  dishType: 'stir_fry',
  servingG: 100,
  kcal: 151,
  kcalPer100g: 151,
  proteinG: 12.2,
  sodiumMg: 220,
  nutritionFrom: null,
};

describe('mealServingNutrition', () => {
  it('카탈로그 1인분이 기준량(100g) 이하인 주식은 종류별 통상 1인분으로 환산해 추정으로 밝힌다', () => {
    const r = mealServingNutrition(jeyuk, { isMain: true }, lex);
    expect(r.basis).toBe('typical_portion');
    expect(r.nutritionFrom).toBe('볶음 통상 1인분 250g');
    expect(r.kcal).toBeCloseTo(377.5);
    // 단백질·나트륨은 카탈로그 1인분 중량으로 100g당을 역산해 같은 중량을 곱한다.
    expect(r.proteinG).toBeCloseTo(30.5);
    expect(r.sodiumMg).toBeCloseTo(550);
  });

  it('반찬은 원래 적은 양이 맞아 카탈로그 1인분을 그대로 쓴다', () => {
    const r = mealServingNutrition(jeyuk, { isMain: false }, lex);
    expect(r).toEqual({ kcal: 151, proteinG: 12.2, sodiumMg: 220, nutritionFrom: null, basis: 'direct' });
  });

  it('카탈로그 1인분이 기준량보다 크면(진짜 1인분) 그대로 쓴다', () => {
    const soup = { ...jeyuk, name: '미역국', dishType: 'soup', servingG: 400, kcal: 48, kcalPer100g: 12, proteinG: 2.6, sodiumMg: 672 };
    expect(mealServingNutrition(soup, { isMain: true }, lex)).toEqual({
      kcal: 48,
      proteinG: 2.6,
      sodiumMg: 672,
      nutritionFrom: null,
      basis: 'direct',
    });
  });

  it('운영자가 음식명으로 정한 1인분 중량이 카탈로그·통상표보다 앞서고 직접값으로 본다', () => {
    const withOverride = compileLexicon(
      mergeLexiconRows([{ kind: 'portion', term: '제육볶음', target: '300' }]),
    );
    const main = mealServingNutrition(jeyuk, { isMain: true }, withOverride);
    expect(main.basis).toBe('direct');
    expect(main.nutritionFrom).toBeNull();
    expect(main.kcal).toBeCloseTo(453);
    expect(main.sodiumMg).toBeCloseTo(660);
    // 음식 단위 지정은 반찬으로 적어도 같은 1인분이다(그 음식의 1인분을 운영자가 정했다).
    expect(mealServingNutrition(jeyuk, { isMain: false }, withOverride).kcal).toBeCloseTo(453);
    // 카탈로그 1인분이 100g 보다 커도 운영자 값이 이긴다.
    const soupLex = compileLexicon(mergeLexiconRows([{ kind: 'portion', term: '미역 국', target: '300' }]));
    const soup = { ...jeyuk, name: '미역국', dishType: 'soup', servingG: 400, kcal: 48, kcalPer100g: 12, proteinG: 2.6, sodiumMg: 672 };
    expect(mealServingNutrition(soup, { isMain: true }, soupLex).kcal).toBeCloseTo(36);
  });

  it('코드 기본 어휘의 음식명 지정 — 시리얼은 빵류 통상 100g 이 아니라 한 그릇 40g', () => {
    const cereal = { ...jeyuk, name: '시리얼', sourceCategory: '곡류, 서류 제품', dishType: 'bakery', servingG: 40, kcal: 178, kcalPer100g: 445, proteinG: 3, sodiumMg: 200 };
    const r = mealServingNutrition(cereal, { isMain: true }, lex);
    expect(r.basis).toBe('direct');
    expect(r.kcal).toBeCloseTo(178);
  });

  it('1인분 중량 없이 100g당만 아는 주식(생재료 등)도 통상 1인분으로 열량을 채운다', () => {
    const raw: ServingCatalogRow = {
      name: '삼겹살',
      source: 'mfds-raw',
      sourceCategory: '육류',
      dishType: null,
      servingG: null,
      kcal: null,
      kcalPer100g: 331,
      proteinG: null,
      sodiumMg: null,
      nutritionFrom: null,
    };
    const r = mealServingNutrition(raw, { isMain: true }, lex);
    expect(r.basis).toBe('typical_portion');
    expect(r.nutritionFrom).toBe('고기 통상 1인분 150g');
    expect(r.kcal).toBeCloseTo(496.5);
    // 100g당 단백질·나트륨은 근거가 없어 지어내지 않는다.
    expect(r.proteinG).toBeNull();
    expect(r.sodiumMg).toBeNull();
    // 반찬이면 근거 있는 1인분이 없으니 비운다.
    expect(mealServingNutrition(raw, { isMain: false }, lex).basis).toBe('missing');
  });

  it('1인분 중량 없이 1인분 값만 있는 행(레시피·수기)은 그대로 쓴다', () => {
    const recipe = { ...jeyuk, name: '영양덮밥', dishType: 'rice', servingG: null, kcal: 500, kcalPer100g: null, proteinG: 20, sodiumMg: 800 };
    expect(mealServingNutrition(recipe, { isMain: true }, lex)).toMatchObject({ kcal: 500, basis: 'direct' });
  });

  it('같은 계열에서 빌린 영양은 중량 근거가 없어 손대지 않는다', () => {
    const donor = { ...jeyuk, nutritionFrom: '버섯콩불고기 외 8종 중앙값' };
    expect(mealServingNutrition(donor, { isMain: true }, lex)).toEqual({
      kcal: 151,
      proteinG: 12.2,
      sodiumMg: 220,
      nutritionFrom: '버섯콩불고기 외 8종 중앙값',
      basis: 'donor_estimate',
    });
  });

  it('카탈로그에 없거나 영양이 비면 missing', () => {
    expect(mealServingNutrition(null, { isMain: true }, lex).basis).toBe('missing');
    const empty = { ...jeyuk, servingG: null, kcal: null, kcalPer100g: null, proteinG: null, sodiumMg: null };
    expect(mealServingNutrition(empty, { isMain: true }, lex).basis).toBe('missing');
  });
});
