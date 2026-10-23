// 식단 기록의 1인분 영양 — 카탈로그 행 + 어휘 → 양 배수를 곱하기 전의 "한 끼 1인분" 영양. 순수 함수.
//
// 카탈로그 1인분(kcal·servingG)은 식약처 '식품중량'을 그대로 쓴 값이라 분석 시료·급식 1회 제공량이 섞여 있다
// (제육볶음 외식 행이 100ml → 151kcal). 식약처 원본(100g당 값)은 고치지 않고 1인분 중량만 이 순서로 정한다:
//   1. 운영자가 이 음식의 1인분 중량을 어휘(portion, 말=음식명)로 정했으면 그것 — 직접값으로 본다.
//   2. 카탈로그 1인분 중량이 기준량(100g)보다 크면 카탈로그 값 그대로.
//   3. 주식이면 종류별 통상 1인분 중량(볶음 250g …) × 100g당 값 — `typical_portion`(추정)으로 밝힌다.
//      원재료 행(과일·채소·생고기 …)은 100g당 값만 있어 주식·반찬 구분 없이 식품군 1회 분량(바나나 100g)을 쓴다.
//   4. 그 밖(반찬·통상 중량을 모름) — 카탈로그 값 그대로. 반찬은 원래 적은 양이 맞다(감자조림 50g).
// 같은 계열에서 빌려 온 영양(nutritionFrom)은 중량 근거가 없어 손대지 않는다.
// 메뉴 칼로리 표시(engine/resolve computePortion)와 같은 기준량·같은 어휘를 쓴다.

import type { FoodDishTypeType, MealNutritionBasisType } from '@repo/api-contract';
import { FOOD_DISH_TYPE_LABEL } from '@repo/utils';
import { BASE_SERVING_G, foodPortionGrams, isRawCatalogRow, portionKeyFor, type Lexicon } from './engine/index.js';

export interface ServingCatalogRow {
  name: string;
  source: string;
  sourceCategory: string | null;
  dishType: string | null;
  servingG: number | null;
  kcal: number | null;
  kcalPer100g: number | null;
  proteinG: number | null;
  sodiumMg: number | null;
  nutritionFrom: string | null;
}

/** 양 배수를 곱하기 전의 1인분 영양. 값이 없으면 null(0 으로 채우지 않는다). */
export interface MealServingNutrition {
  kcal: number | null;
  proteinG: number | null;
  sodiumMg: number | null;
  nutritionFrom: string | null;
  basis: MealNutritionBasisType;
}

const RAW_PORTION_LABEL: Record<string, string> = {
  raw_meat: '고기',
  raw_seafood: '수산물',
  raw_fruit: '과일',
  raw_vegetable: '채소',
  raw_mushroom: '버섯',
  raw_potato: '감자·고구마',
  raw_grain: '곡류',
  raw_nut: '견과',
  raw_legume: '콩',
  raw_egg: '달걀',
};

const MISSING: MealServingNutrition = {
  kcal: null,
  proteinG: null,
  sodiumMg: null,
  nutritionFrom: null,
  basis: 'missing',
};

const portionLabel = (key: string): string =>
  FOOD_DISH_TYPE_LABEL[key as FoodDishTypeType] ?? RAW_PORTION_LABEL[key] ?? key;

/** 100g당 열량(에너지 밀도) — 원본 단위 값이 있으면 그것, 없으면 카탈로그 1인분 열량·중량으로 역산한다. */
export const kcalPer100gOf = (
  row: Pick<ServingCatalogRow, 'kcal' | 'kcalPer100g' | 'servingG'>,
): number | null =>
  row.kcalPer100g ??
  (row.kcal !== null && row.servingG && row.servingG > 0 ? (row.kcal * 100) / row.servingG : null);

export const mealServingNutrition = (
  row: ServingCatalogRow | null,
  opts: { isMain: boolean },
  lex: Lexicon,
): MealServingNutrition => {
  if (!row) return MISSING;
  const catalog = (): MealServingNutrition =>
    [row.kcal, row.proteinG, row.sodiumMg].some((v) => v !== null)
      ? {
          kcal: row.kcal,
          proteinG: row.proteinG,
          sodiumMg: row.sodiumMg,
          nutritionFrom: row.nutritionFrom,
          basis: row.nutritionFrom ? 'donor_estimate' : 'direct',
        }
      : MISSING;
  if (row.nutritionFrom) return catalog();

  // 100g당 — 열량은 원본 단위 값을 쓰고, 단백질·나트륨은 카탈로그 1인분 중량이 있을 때만 역산한다.
  const per100 = (v: number | null): number | null =>
    v !== null && row.servingG && row.servingG > 0 ? (v * 100) / row.servingG : null;
  const kcal100 = kcalPer100gOf(row);
  const protein100 = per100(row.proteinG);
  const sodium100 = per100(row.sodiumMg);
  const at = (grams: number): Pick<MealServingNutrition, 'kcal' | 'proteinG' | 'sodiumMg'> => ({
    kcal: kcal100 === null ? null : (kcal100 * grams) / 100,
    proteinG: protein100 === null ? null : (protein100 * grams) / 100,
    sodiumMg: sodium100 === null ? null : (sodium100 * grams) / 100,
  });

  const overrideG = foodPortionGrams(lex, row.name);
  if (overrideG && kcal100 !== null) return { ...at(overrideG), nutritionFrom: null, basis: 'direct' };

  if (row.servingG !== null && row.servingG > BASE_SERVING_G) {
    if (row.kcal === null && kcal100 !== null) return { ...at(row.servingG), nutritionFrom: null, basis: 'direct' };
    return catalog();
  }

  const key = opts.isMain || isRawCatalogRow(row) ? portionKeyFor(row) : null;
  const typicalG = key ? lex.portionGrams[key] : undefined;
  if (key && typicalG && kcal100 !== null) {
    return {
      ...at(typicalG),
      nutritionFrom: `${portionLabel(key)} 통상 1인분 ${typicalG}g`,
      basis: 'typical_portion',
    };
  }
  return catalog();
};
