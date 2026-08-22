import { describe, expect, it } from 'vitest';
import {
  FOOD_CUISINES,
  FOOD_CUISINE_LABEL,
  FOOD_DISH_TYPES,
  FOOD_DISH_TYPE_LABEL,
  FOOD_MAIN_INGREDIENTS,
  FOOD_MAIN_INGREDIENT_LABEL,
  FOOD_SOURCES,
  FOOD_SOURCE_LABEL,
  guessCuisineFromName,
  guessDishTypeFromName,
  guessMainIngredientFromName,
  hansikCategoryToDishType,
  isFoodDishType,
  menuCanonicalRootHint,
  mfdsCategoryToDishType,
  rcpWayToDishType,
} from './foodTaxonomy.js';

describe('foodTaxonomy — 키/라벨', () => {
  it('모든 키에 라벨이 있다', () => {
    for (const k of FOOD_DISH_TYPES) expect(FOOD_DISH_TYPE_LABEL[k]).toBeTruthy();
    for (const k of FOOD_MAIN_INGREDIENTS) expect(FOOD_MAIN_INGREDIENT_LABEL[k]).toBeTruthy();
    for (const k of FOOD_CUISINES) expect(FOOD_CUISINE_LABEL[k]).toBeTruthy();
    for (const k of FOOD_SOURCES) expect(FOOD_SOURCE_LABEL[k]).toBeTruthy();
    expect(isFoodDishType('stew')).toBe(true);
    expect(isFoodDishType('soupy')).toBe(false);
  });
});

describe('foodTaxonomy — 원본 분류 매핑', () => {
  it('식약처 식품대분류(표기 흔들림 포함)', () => {
    expect(mfdsCategoryToDishType('찌개 및 전골류')).toBe('stew');
    expect(mfdsCategoryToDishType('전·적 및 부침류')).toBe('pancake');
    expect(mfdsCategoryToDishType('전ㆍ적및부침류')).toBe('pancake');
    expect(mfdsCategoryToDishType('장류, 양념류')).toBe('other');
    expect(mfdsCategoryToDishType('빵 및 과자류')).toBe('bakery');
    expect(mfdsCategoryToDishType('알 수 없음')).toBeNull();
    expect(mfdsCategoryToDishType(null)).toBeNull();
  });
  it('한식 800선 / 레시피 조리법 / 택소노미 v3 루트', () => {
    expect(hansikCategoryToDishType('적·산적')).toBe('pancake');
    expect(hansikCategoryToDishType('음청류')).toBe('beverage');
    expect(rcpWayToDishType('끓이기')).toBe('soup');
    expect(rcpWayToDishType('튀기기')).toBe('fried');
    expect(menuCanonicalRootHint('회·초밥 > 광어회')).toEqual({ dishType: 'raw_fish', mainIngredient: 'fish' });
    expect(menuCanonicalRootHint('분식 > 떡볶이')).toEqual({ cuisine: 'fast_food' });
    expect(menuCanonicalRootHint(null)).toEqual({});
  });
});

describe('foodTaxonomy — 이름 규칙', () => {
  it('조리형태', () => {
    expect(guessDishTypeFromName('삼계탕')).toBe('soup');
    expect(guessDishTypeFromName('김치찌개')).toBe('stew');
    expect(guessDishTypeFromName('칼국수')).toBe('noodle');
    expect(guessDishTypeFromName('비빔밥')).toBe('rice');
    expect(guessDishTypeFromName('삼겹살')).toBe('grill');
    expect(guessDishTypeFromName('제육볶음')).toBe('grill');
    expect(guessDishTypeFromName('떡볶이')).toBe('stir_fry');
    expect(guessDishTypeFromName('갈비찜')).toBe('steam');
    expect(guessDishTypeFromName('수육')).toBe('steam');
    expect(guessDishTypeFromName('탕수육')).toBe('fried');
    expect(guessDishTypeFromName('장조림')).toBe('braise');
    expect(guessDishTypeFromName('돈까스')).toBe('fried');
    expect(guessDishTypeFromName('연어초밥')).toBe('raw_fish');
    expect(guessDishTypeFromName('아메리카노')).toBe('beverage');
    expect(guessDishTypeFromName('소주')).toBe('alcohol');
    expect(guessDishTypeFromName('크루아상')).toBe('bakery');
    expect(guessDishTypeFromName('')).toBeNull();
    expect(guessDishTypeFromName('알수없는음식')).toBeNull();
  });
  it('주재료', () => {
    expect(guessMainIngredientFromName('삼계탕')).toBe('chicken');
    expect(guessMainIngredientFromName('김치찌개')).toBe('pork');
    expect(guessMainIngredientFromName('갈비탕')).toBe('beef');
    expect(guessMainIngredientFromName('고등어구이')).toBe('fish');
    expect(guessMainIngredientFromName('오징어볶음')).toBe('seafood');
    expect(guessMainIngredientFromName('된장찌개')).toBe('tofu_bean');
    expect(guessMainIngredientFromName('계란말이')).toBe('egg');
    expect(guessMainIngredientFromName('시금치나물')).toBe('vegetable');
    expect(guessMainIngredientFromName('잔치국수')).toBe('grain');
    expect(guessMainIngredientFromName('딸기주스')).toBe('fruit');
  });
  it('요리 계통', () => {
    expect(guessCuisineFromName('짜장면')).toBe('chinese');
    expect(guessCuisineFromName('연어초밥')).toBe('japanese');
    expect(guessCuisineFromName('까르보나라 파스타')).toBe('western');
    expect(guessCuisineFromName('쌀국수')).toBe('asian');
    expect(guessCuisineFromName('떡볶이')).toBe('fast_food');
    expect(guessCuisineFromName('김치찌개')).toBe('korean');
    expect(guessCuisineFromName('xyz')).toBeNull();
  });
});
