import {
  MEAL_SIDE_DEFAULT_DISH_TYPES,
  type FoodSearchItemType,
  type FrequentMealItemType,
  type MealEntryType,
} from '@repo/api-contract';
import {
  FOOD_DISH_TYPE_LABEL,
  MEAL_PORTION_LABEL,
  MEAL_SLOT_LABEL,
  mealDateLabel,
} from '@repo/utils';
import { mealItemNameKey, type MealDraftItem } from '../stores/mealDraftStore.js';

// 음식 찾기 시트(웹 휴대폰·앱 공통, 2026-11-08) — 넣을 항목 만들기, 검색어 다듬기, 내 기록과 음식 목록의 겹침
// 정리, 줄의 보조 문구. 화면(시트 모양·키보드)은 플랫폼마다 따로, 넣고 빼는 규칙은 여기 하나로 둔다.
// 넣는 값은 빠른 추가 칩과 같은 규칙(mealDraftStore.toggleQuickItem)이라 후보를 모두 FrequentMealItem 모양으로 맞춘다.

export type MealFoodSheetMode = { kind: 'add' } | { kind: 'replace'; clientId: string };

/** 검색 요청은 타이핑이 잠잠해진 뒤에 — 키 입력마다 요청하면 "김치찌개" 하나에 여섯 번 나갔다. */
export const MEAL_FOOD_SEARCH_DEBOUNCE_MS = 200;
/** 음식 목록(카탈로그)은 두 글자부터 찾는다. 내 기록은 한 글자부터. */
export const MEAL_FOOD_CATALOG_MIN_CHARS = 2;
/** 최근 끼니 통째로 — 보여 줄 끼니 수. */
export const MEAL_FOOD_RECENT_MEALS = 5;
// 내 기록·음식 목록 검색어의 서버 한도(FrequentMealItemsQuery·FoodSearchQuery 의 q max).
const SEARCH_MAX_CHARS = 40;
const TRAILING_JAMO = /[ㄱ-ㆎ]+$/;

/**
 * 요청에 쓸 검색어. 끝에 붙은 낱자모는 한글 조합 중간 상태("김ㅊ")라 뗀다 — 음식 이름엔 낱자모가 없어 맞는 게
 * 없고, 떼면 직전 완성 글자("김")의 결과가 그대로 남는다. 조합 이벤트로 거르지 않는 이유: 한글은 마지막 글자가
 * 계속 조합 중이라 다 치고 멈춰도 검색이 나가지 않는다(iOS 앱 입력값에도 조합 중 글자가 들어온다).
 */
export const mealFoodSearchTerm = (q: string): string =>
  q.trim().replace(TRAILING_JAMO, '').trim().slice(0, SEARCH_MAX_CHARS).trim();

/** 음식 목록 한 줄 → 넣을 항목. 김치·나물은 반찬으로 — 서버가 준 1인분 열량도 같은 기준이다. */
export const mealQuickFromCatalog = (f: FoodSearchItemType): FrequentMealItemType => ({
  name: f.name,
  foodId: f.id,
  dishType: f.dishType,
  mainIngredient: f.mainIngredient,
  cuisine: f.cuisine,
  isMain: !MEAL_SIDE_DEFAULT_DISH_TYPES.includes(f.dishType ?? ''),
  portion: null,
  servings: null,
  portionSource: null,
  count: f.myCount,
  lastEatenDate: null,
  from: 'default',
  kcal: f.servingKcal,
});

/** 친 이름 그대로 — 목록에 없어도 이 이름으로 적는다(연결·분류 없음). */
export const mealQuickFromTyped = (name: string): FrequentMealItemType => ({
  name,
  foodId: null,
  dishType: null,
  mainIngredient: null,
  cuisine: null,
  isMain: true,
  portion: null,
  servings: null,
  portionSource: null,
  count: 0,
  lastEatenDate: null,
  from: 'default',
  kcal: null,
});

/** 지난 끼니의 한 음식 → 넣을 항목(그때의 양·주식/반찬 그대로). */
export const mealQuickFromEntryItem = (
  it: MealEntryType['items'][number],
): FrequentMealItemType => ({
  name: it.name,
  foodId: it.foodId,
  dishType: it.dishType,
  mainIngredient: it.mainIngredient,
  cuisine: it.cuisine,
  isMain: it.isMain,
  portion: it.portion,
  servings: it.servings,
  portionSource: it.portionSource,
  count: 0,
  lastEatenDate: null,
  from: 'history',
  kcal: it.kcal,
});

/**
 * 줄 하나를 바꿀 때 — 이름·연결·분류·양만 바꾸고 사진 인식 계보(recognitionDishId)는 남긴다. 고른 후보 순위는
 * 지운다(인식 후보에서 고른 게 아니다).
 */
export const mealItemReplacePatch = (q: FrequentMealItemType): Partial<MealDraftItem> => ({
  name: q.name,
  foodId: q.foodId,
  dishType: q.dishType,
  mainIngredient: q.mainIngredient,
  cuisine: q.cuisine,
  portion: q.portion,
  servings: q.servings,
  portionSource: q.portionSource,
  isMain: q.isMain,
  catalogMatchedBy: q.foodId ? 'food_id' : 'none',
  catalogMatchScore: q.foodId ? 1 : null,
  selectedCandidateRank: null,
  source: q.foodId ? 'catalog' : 'manual',
});

/** 자주 먹은 음식·내 기록 줄의 보조 문구 — "4번 · 반찬 · 지난번 많이". */
export const mealQuickSub = (m: FrequentMealItemType): string =>
  [
    m.from === 'history' ? `${m.count}번` : '기본',
    m.isMain ? null : '반찬',
    m.from === 'history' && m.portion ? `지난번 ${MEAL_PORTION_LABEL[m.portion]}` : null,
    m.from === 'history' && m.servings ? `지난번 ${m.servings}인분` : null,
  ]
    .filter(Boolean)
    .join(' · ');

/** 음식 목록 줄의 보조 문구 — "김치 · 반찬으로 · 내 기록 3번". */
export const mealCatalogSub = (f: FoodSearchItemType): string =>
  [
    f.dishType ? FOOD_DISH_TYPE_LABEL[f.dishType] : null,
    MEAL_SIDE_DEFAULT_DISH_TYPES.includes(f.dishType ?? '') ? '반찬으로' : null,
    f.myCount > 0 ? `내 기록 ${f.myCount}번` : null,
  ]
    .filter(Boolean)
    .join(' · ');

/**
 * 내 기록과 겹치는 음식 목록 줄은 뺀다(같은 foodId 이거나 같은 이름). exact — 친 이름과 같은 이름의 줄을 넣을
 * 항목으로(내 기록 먼저 — 지난번 양이 따라온다, 없으면 음식 목록). 있으면(exactKnown) '그대로 넣기' 줄을 감추고,
 * 엔터·키보드 완료 키도 그 줄을 고른 것으로 넣는다 — 친 이름 그대로 넣으면 연결·지난번 양이 빠지고 김치도 주식으로
 * 들어간다.
 */
export const splitMealFoodResults = (
  mine: readonly FrequentMealItemType[],
  catalog: readonly FoodSearchItemType[],
  typed: string,
): { catalog: FoodSearchItemType[]; exactKnown: boolean; exact: FrequentMealItemType | null } => {
  const mineKeys = new Set(mine.map((m) => mealItemNameKey(m.name)));
  const mineFoods = new Set(mine.flatMap((m) => (m.foodId ? [m.foodId] : [])));
  const rest = catalog.filter(
    (f) => !mineFoods.has(f.id) && !mineKeys.has(mealItemNameKey(f.name)),
  );
  const typedKey = mealItemNameKey(typed);
  const sameName = (name: string): boolean => mealItemNameKey(name) === typedKey;
  const inCatalog = rest.find((f) => sameName(f.name));
  const exact =
    typedKey.length === 0
      ? null
      : (mine.find((m) => sameName(m.name)) ?? (inCatalog ? mealQuickFromCatalog(inCatalog) : null));
  return { catalog: rest, exactKnown: exact !== null, exact };
};

export interface MealRecentMealOption {
  entry: MealEntryType;
  /** "김치찌개, 계란말이, 공기밥 외 2" */
  title: string;
  /** "어제 저녁 · 5개" */
  sub: string;
  /** 아는 열량만 더한 값 — 하나도 모르면 null. */
  kcal: number | null;
}

/** 최근 끼니 통째로 — 같은 차림(음식 이름 모음)은 가장 최근 한 번만, 음식 없는 기록은 건너뛴다. */
export const pickRecentMeals = (
  entries: readonly MealEntryType[],
  today: string,
  limit = MEAL_FOOD_RECENT_MEALS,
): MealRecentMealOption[] => {
  const seen = new Set<string>();
  const meals: MealRecentMealOption[] = [];
  for (const entry of entries) {
    if (meals.length >= limit) break;
    if (entry.items.length === 0) continue;
    const key = entry.items
      .map((it) => mealItemNameKey(it.name))
      .sort()
      .join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    const names = entry.items.map((it) => it.name);
    meals.push({
      entry,
      title: names.slice(0, 3).join(', ') + (names.length > 3 ? ` 외 ${names.length - 3}` : ''),
      sub: `${mealDateLabel(entry.eatenDate, today)} ${MEAL_SLOT_LABEL[entry.slot]} · ${names.length}개`,
      kcal: entry.items.reduce<number | null>(
        (sum, it) => (it.kcal === null ? sum : (sum ?? 0) + it.kcal),
        null,
      ),
    });
  }
  return meals;
};
