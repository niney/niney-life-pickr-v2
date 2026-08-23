import type { PrismaClient } from '@prisma/client';
import type {
  FoodCuisineType,
  FoodDishTypeType,
  FoodMainIngredientType,
  MealPreferenceType,
  MealSlotType,
  MealTypeType,
} from '@repo/api-contract';
import {
  FOOD_CUISINE_LABEL,
  FOOD_DISH_TYPE_LABEL,
  FOOD_MAIN_INGREDIENT_LABEL,
  MEAL_SLOT_LABEL,
  daysBetween,
} from '@repo/utils';
import { normalizeTerm } from '../../lib/text.js';
import {
  parseMealRecommendationFeedback,
  parseMealRecommendationItems,
} from './meal-recommendation.feedback.js';

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
// 균형 계산 창.
const BALANCE_DAYS = 14;
// 덜 선호는 후보를 지우지 않되, 취향 만점도 거의 0으로 낮출 만큼 강하게 감점한다.
export const SOFT_DISLIKE_TASTE_PENALTY = 0.85;
export const CANDIDATE_POOL_SIZE = 40;
// 후보 풀에서 카탈로그 인기·미경험이 차지하는 최대 수(취향 후보를 밀어내지 않게).
const CATALOG_POPULAR_MAX = 14;
const CATALOG_NOVEL_MAX = 8;
// 추천 대상에서 제외할 조리형태 — 끼니 추천에 음료·주류가 섞이면 쓸모가 없다.
const EXCLUDED_DISH_TYPES = new Set<FoodDishTypeType>(['beverage', 'alcohol', 'dairy']);
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
  // 재료 수 — 간편함(집밥) 근거.
  ingredientCount: number | null;
  // 재료 이름 — 비선호 재료 제외와 화면 표시에 쓴다(레시피 출처가 없으면 빈 배열).
  ingredients: string[];
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

  for (const item of history) {
    entryKeys.add(`${item.eatenDate}|${item.slot}`);
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
      if (item.mainIngredient) ingredientCount.set(item.mainIngredient, (ingredientCount.get(item.mainIngredient) ?? 0) + 1);
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
    lastEatenByNorm: new Map([...byNorm.values()].map((f) => [f.nameNorm, f.lastEatenDate])),
    recommendationFeedbackByNorm,
  };
};

// ── 점수 ────────────────────────────────────────────────────────────────────

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

// 계절·날씨 적합도. 실제 기온이 있으면 그것을, 없으면 월로 판단한다.
const weatherFit = (c: CandidateInput, ctx: ScoreContext): { score: number; tag: string | null } => {
  const hot = ctx.tempC !== null && ctx.tempC !== undefined ? ctx.tempC >= 26 : [6, 7, 8].includes(ctx.month);
  const cold = ctx.tempC !== null && ctx.tempC !== undefined ? ctx.tempC <= 8 : [12, 1, 2].includes(ctx.month);
  const rainy = ctx.rain === true;
  const warmDish = c.dishType === 'soup' || c.dishType === 'stew' || c.dishType === 'steam' || c.dishType === 'braise';
  const coolDish = c.dishType === 'noodle' || c.dishType === 'salad' || c.dishType === 'raw_fish' || c.dishType === 'namul';
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
  if (c.mainIngredient === 'vegetable' || c.mainIngredient === 'tofu_bean' || c.mainIngredient === 'fish') {
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

export const scoreCandidate = (c: CandidateInput, ctx: ScoreContext): ScoredCandidate => {
  const tags: string[] = [];
  const lastEaten = ctx.profile.lastEatenByNorm.get(c.nameNorm) ?? null;
  const daysSince = lastEaten ? (daysBetween(lastEaten, ctx.today) ?? 0) : null;

  // variety — 오래 안 먹었을수록 높다. 먹어본 적 없으면 만점.
  const variety = daysSince === null ? 1 : clamp01(daysSince / VARIETY_FULL_DAYS);
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
  if (feedback) {
    // 선택보다 실제 기록을 더 강하게, 평가는 방향(+/-)까지 반영한다. 각 항은 상한을 둬
    // 오래 쓴 사용자의 과거 반응이 최근 취향을 영구히 압도하지 않게 한다.
    const chosenBonus = 0.12 * Math.min(1, feedback.chosenWeight);
    const loggedBonus = 0.25 * Math.min(1, feedback.loggedWeight);
    const ratingAverage = feedback.ratingWeight > 0 ? feedback.ratingSum / feedback.ratingWeight : 0;
    // 합계 자체가 날짜 감쇠를 포함한다. 평균만 쓰면 30일 전 👍 하나도 오늘 👍 하나와 같은
    // 크기가 되어 감쇠가 사라지므로, 점수에는 감쇠 합계를 상한 처리해 쓴다.
    const ratingSignal = Math.max(-1, Math.min(1, feedback.ratingSum));
    const ratingBonus = 0.18 * ratingSignal;
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

  // balance — 최근 분포에서 덜 먹은 축일수록 높다(세 축 평균).
  const shareOf = (rec: Record<string, number>, key: string | null): number => (key ? (rec[key] ?? 0) : 0);
  const balance = clamp01(
    1 -
      (shareOf(ctx.profile.dishTypeShare, c.dishType) +
        shareOf(ctx.profile.ingredientShare, c.mainIngredient) +
        shareOf(ctx.profile.cuisineShare, c.cuisine)) /
        3 /
        0.5,
  );
  if (balance > 0.85 && c.dishType) tags.push(`요즘 안 먹은 ${FOOD_DISH_TYPE_LABEL[c.dishType]}`);

  const health = healthFit(c);
  if (health.tag && health.score > 0.6) tags.push(health.tag);

  const novelty = c.fromHistory || daysSince !== null ? 0 : 1;
  if (novelty === 1) tags.push('새로운 음식');

  const weather = weatherFit(c, ctx);
  if (weather.tag) tags.push(weather.tag);

  const convenience = convenienceFit(c, ctx);

  const features: Record<string, number> = {
    variety,
    taste,
    balance,
    health: health.score,
    novelty,
    weather: weather.score,
    convenience,
  };

  const w = ctx.preference.weights;
  const totalWeight = w.variety + w.taste + w.balance + w.health + w.novelty + w.weather + w.convenience;
  const raw =
    w.variety * variety +
    w.taste * taste +
    w.balance * balance +
    w.health * health.score +
    w.novelty * novelty +
    w.weather * weather.score +
    w.convenience * convenience;
  const score = totalWeight > 0 ? raw / totalWeight : 0;

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

export const isExcluded = (c: CandidateInput, excluded: string[]): boolean => matchesFoodTerms(c, excluded);

// ── 후보 풀 + 서비스 ─────────────────────────────────────────────────────────

export class MealPatternService {
  constructor(private readonly prisma: PrismaClient) {}

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

  async loadFeedbackSignals(userId: string, today: string): Promise<RecommendationFeedbackSignal[]> {
    const from = shiftDate(today, -HISTORY_DAYS);
    const rows = await this.prisma.mealRecommendation.findMany({
      where: { userId, targetDate: { gte: from, lte: today }, feedbackJson: { not: null } },
      select: { targetDate: true, itemsJson: true, feedbackJson: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map((row) => {
      const feedback = parseMealRecommendationFeedback(row.feedbackJson);
      return {
        targetDate: row.targetDate,
        candidateNames: parseMealRecommendationItems(row.itemsJson).map((item) => item.name),
        pickedName: feedback?.pickedName ?? null,
        rating: feedback?.rating ?? null,
        logged: feedback?.eatenEntryId !== null && feedback?.eatenEntryId !== undefined,
      };
    });
  }

  // 후보 풀 = 내 이력(취향) + 좋아요 + 카탈로그 인기 + 미경험(탐험). 제외 음식·음료/주류는 뺀다.
  async buildCandidates(profile: PatternProfile, preference: MealPreferenceType): Promise<CandidateInput[]> {
    const out: CandidateInput[] = [];
    const candidateByNorm = new Map<string, CandidateInput>();

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
        existing.ingredientCount ??= c.ingredientCount;
        if (existing.ingredients.length === 0 && c.ingredients.length > 0) existing.ingredients = c.ingredients;
        existing.popularity = Math.max(existing.popularity, c.popularity);
        return;
      }
      if (c.dishType && EXCLUDED_DISH_TYPES.has(c.dishType)) return;
      if (isVagueMenuVocabulary(source, c.dishType)) return;
      if (isExcluded(c, preference.excludedFoods)) return;
      candidateByNorm.set(c.nameNorm, c);
      out.push(c);
    };

    // ① 내 이력 — 카탈로그 정보를 붙여 영양·재료까지 쓸 수 있게 한다.
    const historyNorms = profile.topFoods.map((f) => f.nameNorm);
    const historyRows = historyNorms.length
      ? await this.prisma.foodItem.findMany({ where: { nameNorm: { in: historyNorms }, active: true } })
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
        kcal: row?.kcal ?? null,
        sodiumMg: row?.sodiumMg ?? null,
        proteinG: row?.proteinG ?? null,
        ingredientCount: countIngredients(row?.ingredientsJson ?? null),
        ingredients: parseIngredients(row?.ingredientsJson),
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
        kcal: row?.kcal ?? null,
        sodiumMg: row?.sodiumMg ?? null,
        proteinG: row?.proteinG ?? null,
        ingredientCount: countIngredients(row?.ingredientsJson ?? null),
        ingredients: parseIngredients(row?.ingredientsJson),
      });
    }

    // ③ 카탈로그 인기 — 외식·배달에서 실제로 고를 수 있는 메뉴.
    const popular = await this.prisma.foodItem.findMany({
      where: {
        active: true,
        dishType: { notIn: [...EXCLUDED_DISH_TYPES] },
        NOT: { AND: [{ source: 'menu-canonical' }, { dishType: 'other' }] },
      },
      orderBy: [{ popularity: 'desc' }, { name: 'asc' }],
      take: CATALOG_POPULAR_MAX * 3,
    });
    for (const row of popular.slice(0, CATALOG_POPULAR_MAX * 2)) {
      if (out.length >= CANDIDATE_POOL_SIZE - CATALOG_NOVEL_MAX) break;
      push(toCandidate(row), row.source);
    }

    // ④ 미경험 — 탐험용. 인기 낮은 쪽에서 고르되 분류가 있는 행만(설명 가능한 추천).
    const novel = await this.prisma.foodItem.findMany({
      where: {
        active: true,
        dishType: { notIn: [...EXCLUDED_DISH_TYPES] },
        nameNorm: { notIn: historyNorms.length ? historyNorms : ['-'] },
        NOT: { OR: [{ dishType: null }, { AND: [{ source: 'menu-canonical' }, { dishType: 'other' }] }] },
      },
      orderBy: { updatedAt: 'desc' },
      take: CATALOG_NOVEL_MAX * 3,
    });
    for (const row of novel) {
      if (out.length >= CANDIDATE_POOL_SIZE) break;
      push(toCandidate(row), row.source);
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
  ingredientsJson: string | null;
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
  ingredientCount: countIngredients(row.ingredientsJson),
  ingredients: parseIngredients(row.ingredientsJson),
});

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
  const shareLine = (label: string, rec: Record<string, number>, labels: Record<string, string>): string | null => {
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
