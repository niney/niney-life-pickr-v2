import type { PrismaClient } from '@prisma/client';
import type {
  FoodCuisineType,
  FoodDishTypeType,
  FoodMainIngredientType,
  MealAllergenType,
  MealNutritionBasisType,
  MealPreferenceType,
  MealSlotType,
  MealTypeType,
  MealWeightsType,
} from '@repo/api-contract';
import {
  FOOD_CUISINE_LABEL,
  FOOD_DISH_TYPE_LABEL,
  FOOD_MAIN_INGREDIENT_LABEL,
  MEAL_SLOT_LABEL,
  daysBetween,
} from '@repo/utils';
import { MealAllergen, MealWeightKeys } from '@repo/api-contract';
import { normalizeTerm } from '../../lib/text.js';
import {
  allergensInFoodName,
  inferFoodAllergens,
  parseFoodAllergenStatus,
} from '../food/food-allergen.js';
import { loadLexicon, type Lexicon } from '../food/engine/index.js';
import { mealServingNutrition, type ServingCatalogRow } from '../food/food-serving.js';
import { parseMealRecommendationFeedback } from './meal-recommendation.feedback.js';

// 추천의 "결정적" 절반 — 사용자 기록을 패턴 프로필로 집계하고, 후보 풀을 만들고, 가중치로
// 점수를 매긴다. LLM 은 이 결과 위에서 고르고 이유를 붙일 뿐이고, LLM 이 없거나 실패해도
// 이 점수 순위가 그대로 폴백이 된다(docs/PLAN-meal.md 결정 E).
//
// 원시 기록은 LLM 에 주지 않는다 — 여기서 만든 요약(빈도·마지막 섭취·분포)만 넘긴다.

const HISTORY_DAYS = 90;
// 취향(빈도) 집계 창 — 이보다 오래된 기록은 지수 감쇠로 거의 사라진다.
const DECAY_HALF_LIFE_DAYS = 30;
// "겹침"을 0 으로 보는 경과일 — 이 이상 안 먹었으면 variety 만점.
const VARIETY_FULL_DAYS = 14;
// 안 먹어 본 음식의 variety. "겹치지 않음"은 새로움(novelty) 한 곳에서만 센다 — 겹침 회피·균형·새로움이
// 모두 미경험에 만점을 주면 기본 가중치에서 내 취향 음식이 이길 수 없었다(2026-10-04 프로빙: 4명 모두
// 상위 8개가 전부 안 먹어 본 음식, 취향 0).
const VARIETY_UNKNOWN = 0.5;
// 싫다는 신호(덜 선호·👎)는 최종 점수에서 직접 깎는다. 취향(taste) 감점만으로는 안 먹어 본 음식에
// 효과가 없었다 — taste 가 이미 0 이라 더 내려가지 않는다(프로빙: 👎 한 시금치가 0.67 그대로 1위).
export const DISLIKE_SCORE_PENALTY = 0.5;
export const NEGATIVE_RATING_SCORE_PENALTY = 0.4;
// 아침으로 무거운 조리형태 — 아침 추천에서 점수를 덜어 낸다(점수에 끼니 구분이 없어 아침·점심·저녁이
// 같은 결과가 나왔다). 내가 그 끼니에 먹던 음식은 조금 올린다.
const BREAKFAST_HEAVY = new Set<FoodDishTypeType>([
  'grill',
  'fried',
  'stew',
  'braise',
  'stir_fry',
  'raw_fish',
]);
const BREAKFAST_LIGHT = new Set<FoodDishTypeType>(['bakery', 'soup', 'salad', 'steam']);
const BREAKFAST_HEAVY_FACTOR = 0.75;
const SLOT_HABIT_FACTOR = 1.1;
// 방금(오늘·어제·그제) 먹은 음식의 최종 점수 배수. variety 가중합만으로는 오늘 먹은 음식의 높은 취향
// (가장 최근이라 감쇠 가중이 최대)을 못 누른다(프로빙: 점심에 먹은 음식이 저녁 추천 1위로 돌아왔다).
const RECENT_EATEN_FACTOR = [0.2, 0.5, 0.8];
// 균형 계산 창.
const BALANCE_DAYS = 14;
const LEXICON_TTL_MS = 10 * 60 * 1000;
// 조리형태·주재료·계통을 하나도 모르는 음식의 balance.
const BALANCE_UNKNOWN = 0.5;
// 덜 선호는 후보를 지우지 않되, 취향 만점도 거의 0으로 낮출 만큼 강하게 감점한다.
export const SOFT_DISLIKE_TASTE_PENALTY = 0.85;
export const CANDIDATE_POOL_SIZE = 40;
// 후보 풀에서 카탈로그 인기·미경험이 차지하는 최대 수(취향 후보를 밀어내지 않게).
const CATALOG_POPULAR_MAX = 14;
const CATALOG_NOVEL_MAX = 8;
// 추천 대상에서 제외할 조리형태 — 끼니 추천에 음료·주류가 섞이면 쓸모가 없다. 김치·나물은 반찬이라
// "다음 끼니"로 내놓을 것이 아니다(프로빙: 시금치·가자미식해가 끼니 추천 상위에 올랐다).
const EXCLUDED_DISH_TYPES = new Set<FoodDishTypeType>([
  'beverage',
  'alcohol',
  'dairy',
  'kimchi',
  'namul',
]);
// 카탈로그 탐색 후보(인기·미경험)로 내놓기엔 반찬·곁들임인 행 — 내 기록·좋아함 후보에는 적용하지 않는다.
// 저칼로리 무침·냉국(해파리냉채 26kcal·오이냉국 19kcal)이 건강·새로움 가산을 함께 받아 거의 모든 설정에서
// 1위였고(2026-10-04 설정 점검: LLM 추천 13회 중 12회 해파리냉채), 분류 '기타'(소스/드레싱·견과)도 섞였다.
//  · '기타' 분류 — 장류·양념·견과·과일 등 끼니 요리가 아니고 이유를 설명할 수 없다.
//  · 무침·국 분류의 1인분 100kcal 미만 — 한 접시 반찬·맑은 국.
//  · 식약처 생채·무침류 중 샐러드가 아닌 300kcal 미만 — 무침·겉절이·생채·냉채(물회처럼 한 끼인 것은 남는다).
const SIDE_MAX_KCAL = 100;
const SIDE_CATEGORY_KEEP_KCAL = 300;
const SIDE_CATEGORY = '생채무침류';
export const isSideLikeCatalogRow = (row: {
  name: string;
  dishType: string | null;
  sourceCategory: string | null;
  kcal: number | null;
}): boolean => {
  if (row.dishType === 'other') return true;
  if (
    (row.dishType === 'salad' || row.dishType === 'soup') &&
    row.kcal !== null &&
    row.kcal < SIDE_MAX_KCAL
  ) {
    return true;
  }
  const category = (row.sourceCategory ?? '').replace(/[\s·ㆍ•,，()]/g, '');
  return (
    category === SIDE_CATEGORY &&
    !row.name.includes('샐러드') &&
    (row.kcal === null || row.kcal < SIDE_CATEGORY_KEEP_KCAL)
  );
};
// 원재료 카탈로그(생 감자·시금치 등)는 메뉴 칼로리 판정용이지 요리가 아니다 — 카탈로그 후보에서 뺀다.
// 내가 먹은 기록에서 온 후보(삼겹살 등)는 실제로 먹은 음식이라 남긴다.
const RAW_INGREDIENT_SOURCE = 'mfds-raw';
// 인기가 같은 카탈로그 후보의 순서 — 흔한 메뉴 출처를 앞에, 그 안에서는 날마다 바뀌는 고정 순서로 섞는다.
// 인기 정보가 없는 카탈로그(dev 등)에서 가나다순 앞쪽('가오리회무침·가자미식해…')만 후보가 되던 편향을 막는다.
const SOURCE_RANK: Record<string, number> = {
  curated: 0,
  'hansik-800': 1,
  'menu-canonical': 2,
  'mfds-recipe': 3,
  'mfds-nutrition': 4,
};
const stableHash = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};
// 외식 메뉴 어휘(menu-canonical)에서 조리형태가 'other' 인 행은 실제 요리가 아니라 범주어·부재료·
// 옵션인 경우가 많다 — 실측 458건에 "고기/반찬/사이드/소스/세트/마늘/신메뉴" 가 대거 섞여 있었다.
// 자동완성에는 남겨 두고(사용자가 "군고구마" 를 직접 적을 때 매칭돼야 한다) 추천 후보에서만 뺀다.
const isVagueMenuVocabulary = (source: string, dishType: string | null): boolean =>
  source === 'menu-canonical' && dishType === 'other';

export interface HistoryItem {
  eatenDate: string;
  slot: MealSlotType;
  name: string;
  nameNorm: string;
  foodId: string | null;
  dishType: FoodDishTypeType | null;
  mainIngredient: FoodMainIngredientType | null;
  cuisine: FoodCuisineType | null;
  isMain: boolean;
}

export interface FoodStat {
  name: string;
  nameNorm: string;
  count: number;
  // 감쇠 적용 빈도(취향 점수의 원자료).
  weight: number;
  lastEatenDate: string;
  daysSince: number | null;
  dishType: FoodDishTypeType | null;
  mainIngredient: FoodMainIngredientType | null;
  cuisine: FoodCuisineType | null;
}

export interface RecommendationFeedbackSignal {
  targetDate: string;
  candidateNames: string[];
  pickedName: string | null;
  rating: number | null;
  logged: boolean;
}

export interface RecommendationFeedbackStat {
  // 모두 최근 반응일수록 크게 반영된 지수 감쇠 합계다.
  chosenWeight: number;
  loggedWeight: number;
  ratingSum: number;
  ratingWeight: number;
}

export interface PatternProfile {
  entryCount: number;
  itemCount: number;
  // 자주 먹은 음식(감쇠 가중 상위).
  topFoods: FoodStat[];
  // 최근 7일 먹은 음식 이름(겹침 판단 근거로 LLM 에도 넘긴다).
  recentFoods: string[];
  // 대상 끼니에서 자주 먹은 음식.
  slotFoods: string[];
  // 최근 BALANCE_DAYS 분포(축별 비율 0~1).
  dishTypeShare: Record<string, number>;
  ingredientShare: Record<string, number>;
  cuisineShare: Record<string, number>;
  // 이름 정규화 → 마지막 섭취일.
  lastEatenByNorm: Map<string, string>;
  // 추천 선택·실제 기록·평가를 다음 추천 취향 점수에 반영한다.
  recommendationFeedbackByNorm: Map<string, RecommendationFeedbackStat>;
}

export interface CandidateInput {
  name: string;
  nameNorm: string;
  foodId: string | null;
  dishType: FoodDishTypeType | null;
  mainIngredient: FoodMainIngredientType | null;
  cuisine: FoodCuisineType | null;
  // 카탈로그 인기(외식 등장 식당 수 등) — 0~.
  popularity: number;
  // 사용자 이력에서 온 후보인지.
  fromHistory: boolean;
  // 선호 설정의 "좋아하는 음식"인지.
  liked: boolean;
  // 카탈로그 1인분 영양(있으면 health 점수에 쓴다).
  kcal: number | null;
  sodiumMg: number | null;
  proteinG: number | null;
  nutritionFrom: string | null;
  nutritionBasis: MealNutritionBasisType;
  // 재료 수 — 간편함(집밥) 근거.
  ingredientCount: number | null;
  // 재료 이름 — 비선호 재료 제외와 화면 표시에 쓴다(레시피 출처가 없으면 빈 배열).
  ingredients: string[];
  allergenWarnings: MealAllergenType[];
  allergenEvidence: string[];
  allergenMetadataKnown: boolean;
  // 음식명에 보이는 알레르겐(가능성) — 사용자가 밝힌 알레르기면 후보에서 뺀다. 화면 경고·메타에는 쓰지 않는다
  // (모든 사용자에게 '돼지고기'·'밀' 경고가 붙는다). 운영자 검수(verified) 행은 비운다.
  allergenNameHints?: MealAllergenType[];
}

export interface ScoreContext {
  profile: PatternProfile;
  preference: MealPreferenceType;
  targetSlot: MealSlotType;
  mealType: MealTypeType | null;
  // 계절(1~12월). 날씨 API 없이도 weather 가중치가 동작하게 계절을 기본 근거로 쓴다.
  month: number;
  // 있으면 계절보다 우선(5차에서 실제 관측 연결).
  tempC?: number | null;
  rain?: boolean | null;
  today: string;
}

export interface ScoredCandidate extends CandidateInput {
  score: number;
  // 왜 점수가 그렇게 나왔는지 — UI 태그·LLM 힌트로 쓴다.
  tags: string[];
  lastEatenDate: string | null;
  features: Record<string, number>;
}

// ── 프로필 ──────────────────────────────────────────────────────────────────

const decayWeight = (daysSince: number): number => Math.pow(0.5, daysSince / DECAY_HALF_LIFE_DAYS);

export const buildProfile = (
  history: HistoryItem[],
  targetSlot: MealSlotType,
  today: string,
  feedbackSignals: RecommendationFeedbackSignal[] = [],
): PatternProfile => {
  const byNorm = new Map<string, FoodStat>();
  const dishCount = new Map<string, number>();
  const ingredientCount = new Map<string, number>();
  const cuisineCount = new Map<string, number>();
  const recent = new Set<string>();
  const slotCount = new Map<string, number>();
  const entryKeys = new Set<string>();
  const recommendationFeedbackByNorm = new Map<string, RecommendationFeedbackStat>();
  let balanceTotal = 0;

  // 마지막 섭취일은 **곁들임까지** 본다. 빈도 순위(topFoods)에서 반찬을 빼는 건 맞지만,
  // "안 먹어봄" 판정까지 빼면 곁들임으로 적은 실제 요리가 새 음식으로 둔갑한다
  // (실측: 7일 전 냉면을 곁들임으로 적었더니 추천 카드에 '안 먹어봄'이 붙었다).
  const lastEatenAll = new Map<string, string>();

  for (const item of history) {
    entryKeys.add(`${item.eatenDate}|${item.slot}`);
    {
      const norm = item.nameNorm || normalizeTerm(item.name);
      const prev = lastEatenAll.get(norm);
      if (!prev || item.eatenDate > prev) lastEatenAll.set(norm, item.eatenDate);
    }
    if (!item.isMain) continue;
    const daysSince = daysBetween(item.eatenDate, today) ?? 0;
    const norm = item.nameNorm || normalizeTerm(item.name);
    const prev = byNorm.get(norm);
    if (!prev) {
      byNorm.set(norm, {
        name: item.name,
        nameNorm: norm,
        count: 1,
        weight: decayWeight(daysSince),
        lastEatenDate: item.eatenDate,
        daysSince,
        dishType: item.dishType,
        mainIngredient: item.mainIngredient,
        cuisine: item.cuisine,
      });
    } else {
      prev.count += 1;
      prev.weight += decayWeight(daysSince);
      if (item.eatenDate > prev.lastEatenDate) {
        prev.lastEatenDate = item.eatenDate;
        prev.daysSince = daysSince;
      }
      prev.dishType = prev.dishType ?? item.dishType;
      prev.mainIngredient = prev.mainIngredient ?? item.mainIngredient;
      prev.cuisine = prev.cuisine ?? item.cuisine;
    }
    if (daysSince <= 7) recent.add(item.name);
    if (item.slot === targetSlot) slotCount.set(item.name, (slotCount.get(item.name) ?? 0) + 1);
    if (daysSince <= BALANCE_DAYS) {
      balanceTotal += 1;
      if (item.dishType) dishCount.set(item.dishType, (dishCount.get(item.dishType) ?? 0) + 1);
      if (item.mainIngredient)
        ingredientCount.set(
          item.mainIngredient,
          (ingredientCount.get(item.mainIngredient) ?? 0) + 1,
        );
      if (item.cuisine) cuisineCount.set(item.cuisine, (cuisineCount.get(item.cuisine) ?? 0) + 1);
    }
  }

  const share = (m: Map<string, number>): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const [k, v] of m) out[k] = balanceTotal > 0 ? v / balanceTotal : 0;
    return out;
  };

  const topFoods = [...byNorm.values()].sort((a, b) => b.weight - a.weight);

  for (const signal of feedbackSignals) {
    const daysSince = Math.max(0, daysBetween(signal.targetDate, today) ?? 0);
    const weight = decayWeight(daysSince);
    const pickedNorm = signal.pickedName ? normalizeTerm(signal.pickedName) : '';
    const ratingTargets = pickedNorm
      ? [pickedNorm]
      : signal.candidateNames.map(normalizeTerm).filter((name) => name.length > 0);
    const targets = new Set(ratingTargets);
    if (pickedNorm) targets.add(pickedNorm);
    for (const norm of targets) {
      const stat = recommendationFeedbackByNorm.get(norm) ?? {
        chosenWeight: 0,
        loggedWeight: 0,
        ratingSum: 0,
        ratingWeight: 0,
      };
      if (norm === pickedNorm) {
        stat.chosenWeight += weight;
        if (signal.logged) stat.loggedWeight += weight;
      }
      if (signal.rating !== null && ratingTargets.includes(norm)) {
        stat.ratingSum += signal.rating * weight;
        stat.ratingWeight += weight;
      }
      recommendationFeedbackByNorm.set(norm, stat);
    }
  }

  return {
    entryCount: entryKeys.size,
    itemCount: history.length,
    topFoods: topFoods.slice(0, 15),
    recentFoods: [...recent].slice(0, 20),
    slotFoods: [...slotCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name]) => name),
    dishTypeShare: share(dishCount),
    ingredientShare: share(ingredientCount),
    cuisineShare: share(cuisineCount),
    lastEatenByNorm: lastEatenAll,
    recommendationFeedbackByNorm,
  };
};

// ── 점수 ────────────────────────────────────────────────────────────────────

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

const CHILLED_NAME = /냉국|냉채|냉면|물회|콩국수|냉모밀|냉소바/;

// 계절·날씨 적합도. 실제 기온이 있으면 그것을, 없으면 월로 판단한다.
const weatherFit = (
  c: CandidateInput,
  ctx: ScoreContext,
): { score: number; tag: string | null } => {
  const hot =
    ctx.tempC !== null && ctx.tempC !== undefined ? ctx.tempC >= 26 : [6, 7, 8].includes(ctx.month);
  const cold =
    ctx.tempC !== null && ctx.tempC !== undefined ? ctx.tempC <= 8 : [12, 1, 2].includes(ctx.month);
  const rainy = ctx.rain === true;
  // 차게 먹는 국물·면(오이냉국·물회·콩국수)은 국 분류여도 시원한 쪽이다(설정 점검: 추운 날 1위가 오이냉국).
  const chilled = CHILLED_NAME.test(c.name);
  const warmDish =
    !chilled &&
    (c.dishType === 'soup' ||
      c.dishType === 'stew' ||
      c.dishType === 'steam' ||
      c.dishType === 'braise');
  const coolDish =
    chilled ||
    c.dishType === 'noodle' ||
    c.dishType === 'salad' ||
    c.dishType === 'raw_fish' ||
    c.dishType === 'namul';
  if (rainy && (warmDish || c.dishType === 'pancake')) return { score: 1, tag: '비 오는 날' };
  if (cold && warmDish) return { score: 1, tag: '추운 날 국물' };
  if (hot && coolDish) return { score: 1, tag: '더운 날 시원하게' };
  if (cold && coolDish) return { score: 0.2, tag: null };
  if (hot && warmDish) return { score: 0.3, tag: null };
  return { score: 0.5, tag: null };
};

// 건강 — 영양이 있으면 수치로, 없으면 분류 규칙으로. 0(나쁨)~1(좋음).
const healthFit = (c: CandidateInput): { score: number; tag: string | null } => {
  let score = 0.5;
  let tag: string | null = null;
  if (c.dishType === 'fried' || c.dishType === 'bakery') score -= 0.25;
  if (c.dishType === 'salad' || c.dishType === 'namul' || c.dishType === 'steam') {
    score += 0.25;
    tag = '가벼운 한 끼';
  }
  if (
    c.mainIngredient === 'vegetable' ||
    c.mainIngredient === 'tofu_bean' ||
    c.mainIngredient === 'fish'
  ) {
    score += 0.15;
    tag = tag ?? '채소·단백질';
  }
  if (c.sodiumMg !== null) {
    // 1인분 나트륨 1,500mg 이상이면 감점(1일 권장 2,000mg 기준).
    if (c.sodiumMg >= 1500) score -= 0.2;
    else if (c.sodiumMg <= 700) score += 0.1;
  }
  if (c.kcal !== null) {
    if (c.kcal >= 900) score -= 0.15;
    else if (c.kcal <= 500) score += 0.1;
  }
  if (c.proteinG !== null && c.proteinG >= 20) {
    score += 0.1;
    tag = tag ?? '단백질 보충';
  }
  return { score: clamp01(score), tag };
};

const convenienceFit = (c: CandidateInput, ctx: ScoreContext): number => {
  if (ctx.mealType === 'home') {
    // 재료가 적을수록 간편. 모르면 중간.
    if (c.ingredientCount === null) return 0.5;
    return clamp01(1 - (c.ingredientCount - 3) / 12);
  }
  if (ctx.mealType === 'dining_out' || ctx.mealType === 'delivery') {
    // 외식·배달은 흔한 메뉴일수록 찾기 쉽다.
    return clamp01(Math.log10(1 + c.popularity) / 2);
  }
  return 0.5;
};

/** 이 끼니에 내가 실제로 먹던 음식인지(프로필의 끼니별 습관). */
const isSlotHabit = (c: Pick<CandidateInput, 'nameNorm'>, profile: PatternProfile): boolean =>
  profile.slotFoods.some((name) => normalizeTerm(name) === c.nameNorm);

// 끼니 적합 — 아침엔 무거운 요리를 덜고, 이 끼니에 내가 먹던 음식은 조금 올린다. 1 이 기준인 배수다.
// 내 습관이면 아침 무거운 요리라도 감점하지 않는다(아침에 고기를 먹는 사람).
const slotFit = (c: CandidateInput, ctx: ScoreContext): { factor: number; tag: string | null } => {
  if (isSlotHabit(c, ctx.profile)) {
    return { factor: SLOT_HABIT_FACTOR, tag: `${MEAL_SLOT_LABEL[ctx.targetSlot]}에 자주` };
  }
  if (ctx.targetSlot === 'breakfast' && c.dishType) {
    if (BREAKFAST_HEAVY.has(c.dishType)) return { factor: BREAKFAST_HEAVY_FACTOR, tag: null };
    if (BREAKFAST_LIGHT.has(c.dishType)) return { factor: 1, tag: '아침에 가볍게' };
  }
  return { factor: 1, tag: null };
};

/**
 * 끼니에 맞지 않는 후보를 LLM·폴백에 넘기기 전에 뺀다 — 지금은 아침의 무거운 요리(구이·튀김·찌개·조림·볶음·회).
 * 점수 감점만으로는 LLM 이 후보 안에서 그대로 골랐다(2026-10-04 프로빙: 아침 추천에 스테이크). 내가 아침에
 * 실제로 먹던 음식은 남기고, 빼고 나서 너무 적으면(minKeep 미만) 가벼운 것을 앞에 두고 무거운 것을 뒤에 붙인다.
 */
export const filterForSlot = <T extends Pick<CandidateInput, 'nameNorm' | 'dishType'>>(
  scored: T[],
  profile: PatternProfile,
  targetSlot: MealSlotType,
  minKeep = 3,
): T[] => {
  if (targetSlot !== 'breakfast') return scored;
  const fits = (c: T): boolean =>
    !(c.dishType && BREAKFAST_HEAVY.has(c.dishType)) || isSlotHabit(c, profile);
  const kept = scored.filter(fits);
  return kept.length >= minKeep ? kept : [...kept, ...scored.filter((c) => !fits(c))];
};

type WeightKey = keyof MealWeightsType;
// 이 이상이면서 가장 높은 중요도를 '이번 추천의 중심'으로 본다 — 프롬프트 문장과 후보 필터가 같은 기준을 쓴다.
// 기본값은 겹침 피하기·내 취향(4), 프리셋 '가볍게·건강'은 건강, '골고루'는 균형.
const FOCUS_MIN_WEIGHT = 4;
export const focusWeightKeys = (weights: MealWeightsType): WeightKey[] => {
  const max = Math.max(...MealWeightKeys.map((k) => weights[k]));
  return max >= FOCUS_MIN_WEIGHT ? MealWeightKeys.filter((k) => weights[k] === max) : [];
};
// 메모에 가볍게 먹고 싶다는 말이 있으면 건강도 중심으로 본다 — 메모는 LLM 에만 가서 후보·폴백엔 효과가 없었다
// (설정 점검: 메모 '가볍게'에 계란빵).
const LIGHT_NOTE = /가볍|가벼|담백|다이어트|저칼로리|라이트|건강/;
export const recommendationFocus = (
  weights: MealWeightsType,
  note: string | null | undefined,
): Set<WeightKey> => {
  const focus = new Set(focusWeightKeys(weights));
  if (note && LIGHT_NOTE.test(note)) focus.add('health');
  return focus;
};
// 건강 요소의 중립값 — 이보다 낮으면 튀김·빵·900kcal 이상·고나트륨 같은 감점이 가점보다 크다.
const HEALTH_NEUTRAL = 0.5;

const medianOf = (xs: number[]): number => {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted.length === 0 ? 0 : sorted[Math.floor((sorted.length - 1) / 2)]!;
};

/**
 * 이번 추천의 중심에 맞지 않는 후보를 LLM·폴백에 넘기기 전에 뺀다. 점수 감점만으로는 LLM 이 후보 안에서 그대로
 * 골랐다(2026-10-04 설정 점검: '가볍게·건강' 저녁에 양념 돼지고기튀김·야채빵, '골고루'에 늘 먹던 한식 국·찌개).
 *  · 건강 — 건강 요소가 중립 아래인 후보(튀김·빵·고열량·고나트륨).
 *  · 균형 — 균형 요소가 후보 중앙값 아래인 후보(최근 많이 먹은 조리형태·주재료·계통 쪽 절반).
 * 좋아함으로 둔 음식은 남기고, 빼고 나서 너무 적으면(minKeep 미만) 뺀 것을 뒤에 붙인다.
 */
export const filterForFocus = <T extends Pick<ScoredCandidate, 'features' | 'liked'>>(
  scored: T[],
  focus: ReadonlySet<WeightKey>,
  minKeep = 3,
): T[] => {
  const rules: ((c: T) => boolean)[] = [];
  if (focus.has('health')) {
    rules.push((c) => (c.features['health'] ?? HEALTH_NEUTRAL) >= HEALTH_NEUTRAL);
  }
  if (focus.has('balance')) {
    const balanceOf = (c: T): number => c.features['balance'] ?? BALANCE_UNKNOWN;
    const median = medianOf(scored.map(balanceOf));
    rules.push((c) => balanceOf(c) >= median);
  }
  if (rules.length === 0) return scored;
  const fits = (c: T): boolean => c.liked || rules.every((rule) => rule(c));
  const kept = scored.filter(fits);
  return kept.length >= minKeep ? kept : [...kept, ...scored.filter((c) => !fits(c))];
};

export const scoreCandidate = (c: CandidateInput, ctx: ScoreContext): ScoredCandidate => {
  const tags: string[] = [];
  const lastEaten = ctx.profile.lastEatenByNorm.get(c.nameNorm) ?? null;
  const daysSince = lastEaten ? (daysBetween(lastEaten, ctx.today) ?? 0) : null;

  // variety — 오래 안 먹었을수록 높다. 먹어 본 적 없으면 중립(새로움은 novelty 가 센다).
  const variety = daysSince === null ? VARIETY_UNKNOWN : clamp01(daysSince / VARIETY_FULL_DAYS);
  if (daysSince !== null && daysSince >= VARIETY_FULL_DAYS) tags.push(`${daysSince}일 만에`);

  // taste — 감쇠 빈도 상위일수록 높다. 좋아요 표시는 가산.
  const maxWeight = ctx.profile.topFoods[0]?.weight ?? 0;
  const own = ctx.profile.topFoods.find((f) => f.nameNorm === c.nameNorm);
  let taste = maxWeight > 0 && own ? clamp01(own.weight / maxWeight) : 0;
  const disliked = matchesFoodTerms(c, ctx.preference.dislikedFoods ?? []);
  if (c.liked && !disliked) {
    taste = clamp01(taste + 0.5);
    tags.push('좋아하는 음식');
  }
  if (own && own.count >= 3) tags.push(`${own.count}번 먹음`);

  const feedback = ctx.profile.recommendationFeedbackByNorm.get(c.nameNorm);
  let negativeRating = 0;
  if (feedback) {
    // 선택보다 실제 기록을 더 강하게, 평가는 방향(+/-)까지 반영한다. 각 항은 상한을 둬
    // 오래 쓴 사용자의 과거 반응이 최근 취향을 영구히 압도하지 않게 한다.
    const chosenBonus = 0.12 * Math.min(1, feedback.chosenWeight);
    const loggedBonus = 0.25 * Math.min(1, feedback.loggedWeight);
    const ratingAverage =
      feedback.ratingWeight > 0 ? feedback.ratingSum / feedback.ratingWeight : 0;
    // 합계 자체가 날짜 감쇠를 포함한다. 평균만 쓰면 30일 전 👍 하나도 오늘 👍 하나와 같은
    // 크기가 되어 감쇠가 사라지므로, 점수에는 감쇠 합계를 상한 처리해 쓴다.
    const ratingSignal = Math.max(-1, Math.min(1, feedback.ratingSum));
    const ratingBonus = 0.18 * ratingSignal;
    negativeRating = Math.max(0, -ratingSignal);
    taste = clamp01(taste + chosenBonus + loggedBonus + ratingBonus);
    if (feedback.loggedWeight > 0) tags.push('추천 후 먹었어요');
    else if (feedback.chosenWeight > 0) tags.push('추천에서 선택');
    if (ratingAverage > 0) tags.push('좋은 평가 반영');
  }
  if (disliked) {
    // 좋아요·과거 섭취·추천 반응보다 소프트 비선호를 우선한다. 후보는 남아 있어 다른
    // feature가 매우 좋거나 대안이 부족하면 최종 추천에 포함될 수 있다.
    taste = clamp01(taste - SOFT_DISLIKE_TASTE_PENALTY);
    tags.unshift('가능하면 피함');
  }

  // balance — 최근 분포에서 덜 먹은 축일수록 높다(아는 축만 평균, 셋 다 모르면 중립). 모르는 축을 비중 0
  // ('안 먹은 축')으로 세면 분류가 빈 음식이 늘 골고루에 맞는 것처럼 올라갔다(2026-10-04 설정 점검: 주재료·계통이
  // 빈 카레라이스 0.90).
  const axes: [Record<string, number>, string | null][] = [
    [ctx.profile.dishTypeShare, c.dishType],
    [ctx.profile.ingredientShare, c.mainIngredient],
    [ctx.profile.cuisineShare, c.cuisine],
  ];
  const knownShares = axes.flatMap(([rec, key]) => (key ? [rec[key] ?? 0] : []));
  const balance =
    knownShares.length === 0
      ? BALANCE_UNKNOWN
      : clamp01(1 - knownShares.reduce((s, v) => s + v, 0) / knownShares.length / 0.5);
  if (balance > 0.85 && c.dishType) tags.push(`요즘 안 먹은 ${FOOD_DISH_TYPE_LABEL[c.dishType]}`);

  const health = healthFit(c);
  if (health.tag && health.score > 0.6) tags.push(health.tag);

  const novelty = c.fromHistory || daysSince !== null ? 0 : 1;
  if (novelty === 1) tags.push('새로운 음식');

  const weather = weatherFit(c, ctx);
  if (weather.tag) tags.push(weather.tag);

  const convenience = convenienceFit(c, ctx);
  const slot = slotFit(c, ctx);
  if (slot.tag) tags.push(slot.tag);
  // 싫다는 신호는 가중합과 별개로 최종 점수에서 깎는다(안 먹어 본 음식에도 듣게).
  const aversion = Math.min(
    0.9,
    (disliked ? DISLIKE_SCORE_PENALTY : 0) + NEGATIVE_RATING_SCORE_PENALTY * negativeRating,
  );
  const recentFactor =
    daysSince !== null && daysSince >= 0 && daysSince < RECENT_EATEN_FACTOR.length
      ? RECENT_EATEN_FACTOR[daysSince]!
      : 1;

  const features: Record<string, number> = {
    variety,
    taste,
    balance,
    health: health.score,
    novelty,
    weather: weather.score,
    convenience,
    // 가중치가 아닌 배수 — 끼니 적합(1 기준)·싫다는 신호 감점(0~0.9)·방금 먹음(0.2~1).
    slot: slot.factor,
    aversion,
    recent: recentFactor,
  };

  const w = ctx.preference.weights;
  const totalWeight =
    w.variety + w.taste + w.balance + w.health + w.novelty + w.weather + w.convenience;
  const raw =
    w.variety * variety +
    w.taste * taste +
    w.balance * balance +
    w.health * health.score +
    w.novelty * novelty +
    w.weather * weather.score +
    w.convenience * convenience;
  const score =
    (totalWeight > 0 ? raw / totalWeight : 0) * slot.factor * (1 - aversion) * recentFactor;

  return {
    ...c,
    score: Math.round(score * 1000) / 1000,
    tags: tags.slice(0, 3),
    lastEatenDate: lastEaten,
    features,
  };
};

// 제외 음식 판정 — 이름 정규화 포함 매칭(예: 제외 '오이' → '오이냉국' 도 제외).
/**
 * 제외 목록에 걸리는 후보인지. 음식 이름뿐 아니라 **카탈로그 재료 목록**도 본다 — 사용자가
 * 적는 건 '오이'처럼 재료인 경우가 많은데, 이름만 보면 오이냉국은 걸러도 오이가 든 김밥은
 * 그대로 추천되기 때문이다. 재료 데이터가 있는 행은 1,097종뿐이라 이름 매칭도 계속 필요하다.
 */
export const matchesFoodTerms = (c: CandidateInput, terms: string[]): boolean => {
  const norms = terms.map((e) => normalizeTerm(e)).filter((e) => e.length > 0);
  if (norms.length === 0) return false;
  const ingredientNorms = (c.ingredients ?? []).map((i) => normalizeTerm(i));
  return norms.some((e) => c.nameNorm.includes(e) || ingredientNorms.some((i) => i.includes(e)));
};

export const isExcluded = (c: CandidateInput, excluded: string[]): boolean =>
  matchesFoodTerms(c, excluded);

// ── 후보 풀 + 서비스 ─────────────────────────────────────────────────────────

export class MealPatternService {
  constructor(private readonly prisma: PrismaClient) {}

  // 1인분 중량 어휘(코드 기본 + 어드민) — 식단 저장(FoodService)과 같은 10분 주기로 다시 읽는다.
  private lexiconCache: { value: Lexicon; at: number } | null = null;
  private async servingLexicon(): Promise<Lexicon> {
    if (this.lexiconCache && Date.now() - this.lexiconCache.at < LEXICON_TTL_MS)
      return this.lexiconCache.value;
    const value = await loadLexicon(this.prisma);
    this.lexiconCache = { value, at: Date.now() };
    return value;
  }

  async loadHistory(userId: string, today: string): Promise<HistoryItem[]> {
    const from = shiftDate(today, -HISTORY_DAYS);
    const rows = await this.prisma.mealEntry.findMany({
      where: { userId, eatenDate: { gte: from, lte: today } },
      select: {
        eatenDate: true,
        slot: true,
        items: {
          select: {
            name: true,
            nameNorm: true,
            foodId: true,
            dishType: true,
            mainIngredient: true,
            cuisine: true,
            isMain: true,
          },
        },
      },
      orderBy: { eatenAt: 'desc' },
      take: 400,
    });
    const out: HistoryItem[] = [];
    for (const r of rows) {
      for (const it of r.items) {
        out.push({
          eatenDate: r.eatenDate,
          slot: r.slot as MealSlotType,
          name: it.name,
          nameNorm: it.nameNorm,
          foodId: it.foodId,
          dishType: it.dishType as FoodDishTypeType | null,
          mainIngredient: it.mainIngredient as FoodMainIngredientType | null,
          cuisine: it.cuisine as FoodCuisineType | null,
          isMain: it.isMain,
        });
      }
    }
    return out;
  }

  async loadFeedbackSignals(
    userId: string,
    today: string,
  ): Promise<RecommendationFeedbackSignal[]> {
    const from = shiftDate(today, -HISTORY_DAYS);
    const rows = await this.prisma.mealRecommendation.findMany({
      where: { userId, targetDate: { gte: from, lte: today } },
      select: {
        targetDate: true,
        feedbackJson: true,
        events: {
          where: { kind: { in: ['candidate_picked', 'candidate_rated', 'logged'] } },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.flatMap((row) => {
      const feedback = parseMealRecommendationFeedback(row.feedbackJson);
      const pickedEvent = [...row.events]
        .reverse()
        .find((event) => event.kind === 'candidate_picked');
      const loggedEvent = [...row.events].reverse().find((event) => event.kind === 'logged');
      const pickedName =
        loggedEvent?.candidateName ?? pickedEvent?.candidateName ?? feedback?.pickedName ?? null;
      const out: RecommendationFeedbackSignal[] = [];
      if (pickedName) {
        out.push({
          targetDate: row.targetDate,
          candidateNames: [pickedName],
          pickedName,
          // 구버전 후보 선택+평가만 후보별 신호로 보존한다. 후보가 없는 세트 평가는 학습하지 않는다.
          rating: row.events.some((event) => event.kind === 'candidate_rated')
            ? null
            : (feedback?.rating ?? null),
          logged: Boolean(loggedEvent || feedback?.eatenEntryId),
        });
      }
      // 후보 평가는 현재 선호의 스냅샷이다. 같은 후보를 여러 번 누르거나
      // +1 후 -1로 바꿠었을 때 전부 합산하면 현재 의도가 왜곡된다. 정렬된 이벤트를
      // recommendation+정규화 후보 식별자로 덮어써 createdAt, id 기준 최신 1건만 학습한다.
      const latestCandidateRatings = new Map<string, { candidateName: string; rating: -1 | 1 }>();
      for (const event of row.events) {
        if (
          event.kind !== 'candidate_rated' ||
          !event.candidateName ||
          (event.rating !== -1 && event.rating !== 1)
        ) {
          continue;
        }
        latestCandidateRatings.set(normalizeTerm(event.candidateName), {
          candidateName: event.candidateName,
          rating: event.rating,
        });
      }
      for (const event of latestCandidateRatings.values()) {
        out.push({
          targetDate: row.targetDate,
          candidateNames: [event.candidateName],
          pickedName: null,
          rating: event.rating,
          logged: false,
        });
      }
      return out;
    });
  }

  // 후보 풀 = 내 이력(취향) + 좋아요 + 카탈로그 인기 + 미경험(탐험). 제외 음식·음료/주류는 뺀다.
  /**
   * @param seed 카탈로그 후보 섞기의 씨앗(보통 `사용자|오늘`) — 같은 날 같은 사람에겐 같은 후보, 날마다·사람마다 다른 탐색.
   */
  async buildCandidates(
    profile: PatternProfile,
    preference: MealPreferenceType,
    seed = '',
  ): Promise<CandidateInput[]> {
    const out: CandidateInput[] = [];
    const candidateByNorm = new Map<string, CandidateInput>();
    // 건강 판정용 영양은 한 끼 1인분 기준(식단 저장과 같은 mealServingNutrition). 식약처 식품중량(대개 100g)을
    // 그대로 쓰면 거의 모든 음식이 '500kcal 이하' 가점을 받아 건강 요소가 변별력을 잃었다(2026-10-04).
    const lex = await this.servingLexicon();
    const perMeal = (
      row: ServingCatalogRow | null,
    ): Pick<CandidateInput, 'kcal' | 'proteinG' | 'sodiumMg'> => {
      const n = mealServingNutrition(row, { isMain: true }, lex);
      return { kcal: n.kcal, proteinG: n.proteinG, sodiumMg: n.sodiumMg };
    };

    const push = (c: CandidateInput, source = ''): void => {
      const existing = candidateByNorm.get(c.nameNorm);
      if (existing) {
        // 같은 음식이 이력과 likedFoods 양쪽에서 오면 먼저 들어온 이력 후보를 버리지 말고
        // 좋아요 신호와 더 풍부한 카탈로그 필드를 합친다.
        existing.liked ||= c.liked;
        existing.fromHistory ||= c.fromHistory;
        existing.foodId ??= c.foodId;
        existing.dishType ??= c.dishType;
        existing.mainIngredient ??= c.mainIngredient;
        existing.cuisine ??= c.cuisine;
        existing.kcal ??= c.kcal;
        existing.sodiumMg ??= c.sodiumMg;
        existing.proteinG ??= c.proteinG;
        existing.nutritionFrom ??= c.nutritionFrom;
        if (existing.nutritionBasis === 'missing') existing.nutritionBasis = c.nutritionBasis;
        existing.ingredientCount ??= c.ingredientCount;
        if (existing.ingredients.length === 0 && c.ingredients.length > 0)
          existing.ingredients = c.ingredients;
        existing.allergenWarnings = [
          ...new Set([...existing.allergenWarnings, ...c.allergenWarnings]),
        ];
        existing.allergenEvidence = [
          ...new Set([...existing.allergenEvidence, ...c.allergenEvidence]),
        ].slice(0, 8);
        existing.allergenMetadataKnown ||= c.allergenMetadataKnown;
        existing.popularity = Math.max(existing.popularity, c.popularity);
        // 합친 근거로 알레르기에 걸리게 됐으면 뺀다.
        if (hitsUserAllergen(existing, preference.allergens ?? [])) {
          candidateByNorm.delete(c.nameNorm);
          out.splice(out.indexOf(existing), 1);
        }
        return;
      }
      if (c.dishType && EXCLUDED_DISH_TYPES.has(c.dishType)) return;
      if (isVagueMenuVocabulary(source, c.dishType)) return;
      if (isExcluded(c, preference.excludedFoods)) return;
      // 알레르기는 재료·표시 근거와 음식명(가능성)에 걸린 후보를 보수적으로 제거한다 — 좋아함·내 기록이어도.
      // 근거가 없다고 안전하다고 단정하지는 않는다(화면은 '원재료 정보 부족'으로 알린다).
      if (hitsUserAllergen(c, preference.allergens ?? [])) return;
      candidateByNorm.set(c.nameNorm, c);
      out.push(c);
    };

    // ① 내 이력 — 카탈로그 정보를 붙여 영양·재료까지 쓸 수 있게 한다.
    const historyNorms = profile.topFoods.map((f) => f.nameNorm);
    const historyRows = historyNorms.length
      ? await this.prisma.foodItem.findMany({
          where: { nameNorm: { in: historyNorms }, active: true },
        })
      : [];
    const byNorm = new Map(historyRows.map((r) => [r.nameNorm, r]));
    for (const f of profile.topFoods) {
      const row = byNorm.get(f.nameNorm);
      push({
        name: row?.name ?? f.name,
        nameNorm: f.nameNorm,
        foodId: row?.id ?? null,
        dishType: (row?.dishType as FoodDishTypeType | null) ?? f.dishType,
        mainIngredient: (row?.mainIngredient as FoodMainIngredientType | null) ?? f.mainIngredient,
        cuisine: (row?.cuisine as FoodCuisineType | null) ?? f.cuisine,
        popularity: row?.popularity ?? 0,
        fromHistory: true,
        liked: false,
        ...perMeal(row ?? null),
        nutritionFrom: row?.nutritionFrom ?? null,
        nutritionBasis: nutritionBasis(
          row?.nutritionFrom ?? null,
          row?.kcal ?? null,
          row?.proteinG ?? null,
          row?.sodiumMg ?? null,
        ),
        ingredientCount: countIngredients(row?.ingredientsJson ?? null),
        ingredients: parseIngredients(row?.ingredientsJson),
        ...allergenData(
          row?.name ?? f.name,
          row?.ingredientsJson,
          row?.allergensJson,
          row?.allergenEvidenceJson,
          row?.allergenStatus,
        ),
      });
    }

    // ② 좋아하는 음식(설정) — 카탈로그에 있으면 정보 포함.
    for (const liked of preference.likedFoods) {
      const norm = normalizeTerm(liked);
      if (!norm) continue;
      const row = await this.prisma.foodItem.findUnique({ where: { nameNorm: norm } });
      push({
        name: row?.name ?? liked,
        nameNorm: norm,
        foodId: row?.id ?? null,
        dishType: (row?.dishType as FoodDishTypeType | null) ?? null,
        mainIngredient: (row?.mainIngredient as FoodMainIngredientType | null) ?? null,
        cuisine: (row?.cuisine as FoodCuisineType | null) ?? null,
        popularity: row?.popularity ?? 0,
        fromHistory: false,
        liked: true,
        ...perMeal(row ?? null),
        nutritionFrom: row?.nutritionFrom ?? null,
        nutritionBasis: nutritionBasis(
          row?.nutritionFrom ?? null,
          row?.kcal ?? null,
          row?.proteinG ?? null,
          row?.sodiumMg ?? null,
        ),
        ingredientCount: countIngredients(row?.ingredientsJson ?? null),
        ingredients: parseIngredients(row?.ingredientsJson),
        ...allergenData(
          row?.name ?? liked,
          row?.ingredientsJson,
          row?.allergensJson,
          row?.allergenEvidenceJson,
          row?.allergenStatus,
        ),
      });
    }

    // 인기가 같으면 흔한 메뉴 출처 → 날마다 바뀌는 고정 순서(가나다순이 아니다).
    const shuffleKey = (row: { nameNorm: string }): number => stableHash(`${seed}|${row.nameNorm}`);
    const byPopularity = <T extends { popularity: number; source: string; nameNorm: string }>(
      rows: T[],
    ): T[] =>
      [...rows].sort(
        (a, b) =>
          b.popularity - a.popularity ||
          (SOURCE_RANK[a.source] ?? 9) - (SOURCE_RANK[b.source] ?? 9) ||
          shuffleKey(a) - shuffleKey(b),
      );

    // 카탈로그 후보는 적격 행 전체의 순서 키(이름·인기·출처)만 가볍게 읽어 정렬한 뒤, 고른 행만 다시 읽는다.
    // DB 에서 잘라 오면 인기가 같은 수천 행 중 가나다순 앞쪽만 남는다.
    const eligible = (
      await this.prisma.foodItem.findMany({
        where: {
          active: true,
          source: { not: RAW_INGREDIENT_SOURCE },
          dishType: { notIn: [...EXCLUDED_DISH_TYPES] },
        },
        select: {
          nameNorm: true,
          popularity: true,
          source: true,
          name: true,
          dishType: true,
          sourceCategory: true,
          kcal: true,
        },
      })
    ).filter((r) => !isSideLikeCatalogRow(r));
    const historySet = new Set(historyNorms);
    // ③ 카탈로그 인기 — 외식·배달에서 실제로 고를 수 있는 메뉴.
    const popularNorms = byPopularity(eligible)
      .slice(0, CATALOG_POPULAR_MAX * 2)
      .map((r) => r.nameNorm);
    // ④ 미경험 — 탐험용. 인기와 무관하게 분류가 있는 요리에서 날마다 다르게 고른다(설명 가능한 추천).
    const popularSet = new Set(popularNorms);
    const novelNorms = eligible
      .filter((r) => !historySet.has(r.nameNorm) && !popularSet.has(r.nameNorm))
      .sort((a, b) => shuffleKey(a) - shuffleKey(b))
      .slice(0, CATALOG_NOVEL_MAX * 3)
      .map((r) => r.nameNorm);
    const catalogRows = await this.prisma.foodItem.findMany({
      where: { nameNorm: { in: [...popularNorms, ...novelNorms] }, active: true },
    });
    const catalogByNorm = new Map(catalogRows.map((r) => [r.nameNorm, r]));
    for (const norm of popularNorms) {
      if (out.length >= CANDIDATE_POOL_SIZE - CATALOG_NOVEL_MAX) break;
      const row = catalogByNorm.get(norm);
      if (row) push({ ...toCandidate(row), ...perMeal(row) }, row.source);
    }
    for (const norm of novelNorms) {
      if (out.length >= CANDIDATE_POOL_SIZE) break;
      const row = catalogByNorm.get(norm);
      // 분류가 없는 행은 이유를 설명할 수 없어 탐험 후보로 쓰지 않는다.
      if (row?.dishType) push({ ...toCandidate(row), ...perMeal(row) }, row.source);
    }

    return out.slice(0, CANDIDATE_POOL_SIZE);
  }
}

const toCandidate = (row: {
  id: string;
  name: string;
  nameNorm: string;
  source: string;
  dishType: string | null;
  mainIngredient: string | null;
  cuisine: string | null;
  popularity: number;
  kcal: number | null;
  sodiumMg: number | null;
  proteinG: number | null;
  nutritionFrom: string | null;
  ingredientsJson: string | null;
  allergensJson: string;
  allergenEvidenceJson: string;
  allergenStatus: string;
}): CandidateInput => ({
  name: row.name,
  nameNorm: row.nameNorm,
  foodId: row.id,
  dishType: row.dishType as FoodDishTypeType | null,
  mainIngredient: row.mainIngredient as FoodMainIngredientType | null,
  cuisine: row.cuisine as FoodCuisineType | null,
  popularity: row.popularity,
  fromHistory: false,
  liked: false,
  kcal: row.kcal,
  sodiumMg: row.sodiumMg,
  proteinG: row.proteinG,
  nutritionFrom: row.nutritionFrom,
  nutritionBasis: nutritionBasis(row.nutritionFrom, row.kcal, row.proteinG, row.sodiumMg),
  ingredientCount: countIngredients(row.ingredientsJson),
  ingredients: parseIngredients(row.ingredientsJson),
  ...allergenData(
    row.name,
    row.ingredientsJson,
    row.allergensJson,
    row.allergenEvidenceJson,
    row.allergenStatus,
  ),
});

const nutritionBasis = (
  from: string | null,
  kcal: number | null,
  proteinG: number | null,
  sodiumMg: number | null,
): MealNutritionBasisType => {
  if (from) return 'donor_estimate';
  return kcal !== null || proteinG !== null || sodiumMg !== null ? 'direct' : 'missing';
};

const parseAllergenJson = (json: string | null | undefined): MealAllergenType[] => {
  if (!json) return [];
  try {
    const value: unknown = JSON.parse(json);
    if (!Array.isArray(value)) return [];
    return value.flatMap((item) => {
      const parsed = MealAllergen.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    });
  } catch {
    return [];
  }
};

const parseStringJson = (json: string | null | undefined): string[] => {
  if (!json) return [];
  try {
    const value: unknown = JSON.parse(json);
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
};

export const allergenData = (
  name: string,
  ingredientsJson: string | null | undefined,
  explicitJson: string | null | undefined,
  evidenceJson: string | null | undefined,
  statusValue: string | null | undefined = 'unknown',
): Pick<
  CandidateInput,
  'allergenWarnings' | 'allergenEvidence' | 'allergenMetadataKnown' | 'allergenNameHints'
> => {
  const ingredients = parseIngredients(ingredientsJson);
  const explicit = parseAllergenJson(explicitJson);
  const status = parseFoodAllergenStatus(statusValue ?? 'unknown');
  // verified는 운영자 판단을 그대로 신뢰한다. 그 외에는 마이그레이션 직후 아직
  // backfill되지 않은 행도 런타임에서 빠지지 않도록 같은 재료 규칙을 적용한다.
  const inferred = status === 'verified' ? null : inferFoodAllergens(ingredients);
  const warnings = new Set<MealAllergenType>([...explicit, ...(inferred?.allergens ?? [])]);
  const evidence = new Set(parseStringJson(evidenceJson));
  for (const item of inferred?.evidence ?? []) evidence.add(item);
  return {
    allergenWarnings: MealAllergen.options.filter((allergen) => warnings.has(allergen)),
    allergenEvidence: [...evidence].slice(0, 8),
    allergenMetadataKnown: status !== 'unknown' || explicit.length > 0 || ingredients.length > 0,
    allergenNameHints: status === 'verified' ? [] : allergensInFoodName(name),
  };
};

/** 사용자가 밝힌 알레르기에 걸리는 후보인가 — 재료·표시 근거와 음식명(가능성)을 함께 본다. */
export const hitsUserAllergen = (
  c: Pick<CandidateInput, 'allergenWarnings' | 'allergenNameHints'>,
  allergens: readonly MealAllergenType[],
): boolean =>
  allergens.some(
    (allergen) =>
      (c.allergenWarnings ?? []).includes(allergen) ||
      (c.allergenNameHints ?? []).includes(allergen),
  );

// 재료 이름 목록(레시피 출처가 있는 행만). 후보 필터·화면 표시에 쓴다.
export const parseIngredients = (json: string | null | undefined): string[] => {
  if (!json) return [];
  try {
    const v: unknown = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
};

const countIngredients = (json: string | null): number | null => {
  if (!json) return null;
  try {
    const v: unknown = JSON.parse(json);
    return Array.isArray(v) ? v.length : null;
  } catch {
    return null;
  }
};

const shiftDate = (key: string, days: number): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return key;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`;
};

// LLM 에 넘길 사람이 읽는 프로필 요약(원시 기록 없음).
export const describeProfile = (profile: PatternProfile, targetSlot: MealSlotType): string => {
  const lines: string[] = [];
  lines.push(`최근 90일 기록 ${profile.entryCount}끼.`);
  if (profile.topFoods.length > 0) {
    lines.push(
      `자주 먹는 음식: ${profile.topFoods
        .slice(0, 8)
        .map((f) => `${f.name}(${f.count}회, ${f.daysSince ?? '?'}일 전)`)
        .join(', ')}`,
    );
  }
  if (profile.recentFoods.length > 0) lines.push(`최근 7일: ${profile.recentFoods.join(', ')}`);
  if (profile.slotFoods.length > 0) {
    lines.push(`${MEAL_SLOT_LABEL[targetSlot]}에 자주: ${profile.slotFoods.join(', ')}`);
  }
  const feedback = [...profile.recommendationFeedbackByNorm.entries()]
    .filter(([, stat]) => stat.chosenWeight > 0 || stat.loggedWeight > 0 || stat.ratingWeight > 0)
    .sort((a, b) => b[1].loggedWeight + b[1].chosenWeight - (a[1].loggedWeight + a[1].chosenWeight))
    .slice(0, 5)
    .map(([name, stat]) => {
      const ratingSignal = Math.max(-1, Math.min(1, stat.ratingSum));
      return `${name}(선택 ${stat.chosenWeight.toFixed(1)}, 기록 ${stat.loggedWeight.toFixed(1)}, 평가 ${ratingSignal.toFixed(1)})`;
    });
  if (feedback.length > 0) lines.push(`최근 추천 반응: ${feedback.join(', ')}`);
  const shareLine = (
    label: string,
    rec: Record<string, number>,
    labels: Record<string, string>,
  ): string | null => {
    const top = Object.entries(rec)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k, v]) => `${labels[k] ?? k} ${Math.round(v * 100)}%`);
    return top.length > 0 ? `${label}: ${top.join(', ')}` : null;
  };
  const dish = shareLine('최근 2주 조리형태', profile.dishTypeShare, FOOD_DISH_TYPE_LABEL);
  const ing = shareLine('주재료', profile.ingredientShare, FOOD_MAIN_INGREDIENT_LABEL);
  const cui = shareLine('요리 계통', profile.cuisineShare, FOOD_CUISINE_LABEL);
  for (const l of [dish, ing, cui]) if (l) lines.push(l);
  return lines.join('\n');
};
