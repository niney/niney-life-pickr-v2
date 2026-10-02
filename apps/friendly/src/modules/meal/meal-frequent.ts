// 입력 화면 빠른 추가 — 내 기록에서 자주 먹은 음식을 고르고, 모자라면 기본 목록으로 채운다. 순수 함수.
//
// 점수는 끼니(entry) 단위로 센다(한 끼에 김치를 두 번 적어도 한 번). 최근일수록 무겁게(반감기 30일),
// 고른 끼니와 같은 끼니에 먹은 기록은 두 배로 — 아침엔 아침에 먹던 것이 앞에 온다.
// 값(이름 표기·카탈로그 연결·양)은 가장 최근 기록을 따르고, 주식/반찬 구분은 다수결이다. 기록이 한 번뿐인
// 기본 목록 음식은 기본값(반찬)을 따른다 — 입력 화면이 새 항목을 '주식'으로 넣던 시절의 한 번이 굳지 않게.

import type {
  FoodCuisineType,
  FoodDishTypeType,
  FoodMainIngredientType,
  FrequentMealItemType,
  MealPortionSourceType,
  MealPortionType,
  MealSlotType,
} from '@repo/api-contract';

// 기록이 적을 때 빠른 추가를 채우는 기본 목록 — 백반 상차림의 단골. 전부 곁들임(반찬)이다: 통계의 음식
// 분포는 주식만 세므로 공기밥·김치를 주식으로 넣으면 분포가 밥·김치로 쏠린다.
export const MEAL_QUICK_DEFAULT_NAMES = [
  '공기밥',
  '배추김치',
  '깍두기',
  '달걀후라이',
  '김구이',
  '된장국',
  '미역국',
] as const;

export const FREQUENT_WINDOW_DAYS = 90;
const HALF_LIFE_DAYS = 30;
const SLOT_BOOST = 2;

export interface FrequentOccurrence {
  entryId: string;
  eatenAt: Date;
  eatenDate: string;
  slot: string;
  name: string;
  nameNorm: string;
  foodId: string | null;
  dishType: FoodDishTypeType | null;
  mainIngredient: FoodMainIngredientType | null;
  cuisine: FoodCuisineType | null;
  isMain: boolean;
  portion: MealPortionType | null;
  servings: number | null;
  portionSource: MealPortionSourceType | null;
}

/** 기본 목록 한 줄 — 카탈로그에서 찾은 연결(없으면 이름만). */
export interface FrequentDefault {
  name: string;
  nameNorm: string;
  foodId: string | null;
  dishType: FoodDishTypeType | null;
  mainIngredient: FoodMainIngredientType | null;
  cuisine: FoodCuisineType | null;
}

interface Group {
  latest: FrequentOccurrence;
  entries: Map<string, FrequentOccurrence>;
  score: number;
}

export const rankFrequentMealItems = (
  occurrences: readonly FrequentOccurrence[],
  opts: { slot?: MealSlotType; limit: number; now: Date; defaults: readonly FrequentDefault[] },
): FrequentMealItemType[] => {
  const defaultNorms = new Set(opts.defaults.map((d) => d.nameNorm));
  const groups = new Map<string, Group>();
  for (const o of occurrences) {
    const key = o.nameNorm || o.name.trim();
    if (!key) continue;
    let g = groups.get(key);
    if (!g) {
      g = { latest: o, entries: new Map(), score: 0 };
      groups.set(key, g);
    }
    if (o.eatenAt > g.latest.eatenAt) g.latest = o;
    // 같은 끼니에 같은 음식이 여러 줄이면 한 번만 센다(첫 줄의 구분으로 투표).
    const prev = g.entries.get(o.entryId);
    if (!prev) {
      g.entries.set(o.entryId, o);
      const ageDays = Math.max(0, (opts.now.getTime() - o.eatenAt.getTime()) / 86_400_000);
      g.score += 0.5 ** (ageDays / HALF_LIFE_DAYS) * (opts.slot && o.slot === opts.slot ? SLOT_BOOST : 1);
    }
  }

  const ranked = [...groups.entries()].sort(
    ([, a], [, b]) =>
      b.score - a.score ||
      b.latest.eatenAt.getTime() - a.latest.eatenAt.getTime() ||
      a.latest.name.localeCompare(b.latest.name),
  );

  const out: FrequentMealItemType[] = [];
  const taken = new Set<string>();
  for (const [key, g] of ranked) {
    if (out.length >= opts.limit) break;
    const entries = [...g.entries.values()];
    const mainVotes = entries.filter((e) => e.isMain).length;
    const sideVotes = entries.length - mainVotes;
    const isMain =
      entries.length >= 2
        ? mainVotes === sideVotes
          ? g.latest.isMain
          : mainVotes > sideVotes
        : defaultNorms.has(key)
          ? false
          : g.latest.isMain;
    out.push({
      name: g.latest.name,
      foodId: g.latest.foodId,
      dishType: g.latest.dishType,
      mainIngredient: g.latest.mainIngredient,
      cuisine: g.latest.cuisine,
      isMain,
      portion: g.latest.portion,
      servings: g.latest.servings,
      portionSource: g.latest.portionSource,
      count: entries.length,
      lastEatenDate: g.latest.eatenDate,
      from: 'history',
    });
    taken.add(key);
  }

  for (const d of opts.defaults) {
    if (out.length >= opts.limit) break;
    if (taken.has(d.nameNorm)) continue;
    out.push({
      name: d.name,
      foodId: d.foodId,
      dishType: d.dishType,
      mainIngredient: d.mainIngredient,
      cuisine: d.cuisine,
      isMain: false,
      portion: null,
      servings: null,
      portionSource: null,
      count: 0,
      lastEatenDate: null,
      from: 'default',
    });
    taken.add(d.nameNorm);
  }
  return out;
};
