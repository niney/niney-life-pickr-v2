import type { PrismaClient } from '@prisma/client';
import type { MealStatsResultType } from '@repo/api-contract';
import {
  FOOD_CUISINE_LABEL,
  FOOD_DISH_TYPE_LABEL,
  FOOD_MAIN_INGREDIENT_LABEL,
  MEAL_SLOT_LABEL,
  MEAL_SLOT_ORDER,
  MEAL_TYPE_LABEL,
  dateKeyRange,
  daysBetween,
  type FoodCuisine,
  type FoodDishType,
  type FoodMainIngredient,
  type MealSlot,
  type MealType,
} from '@repo/utils';

// 기간 통계 — 집계 로직은 순수 함수(computeMealStats)로 두고 서비스는 조회만 한다.
// "겹침(repeatRate)"·"연속(streakDays)"은 추천의 variety 가중치와 같은 정의를 쓴다.

export interface StatEntryRow {
  eatenDate: string;
  slot: string;
  mealType: string | null;
  items: {
    name: string;
    nameNorm: string;
    dishType: string | null;
    mainIngredient: string | null;
    cuisine: string | null;
    isMain: boolean;
    // 저장 시점 영양 스냅샷(양 배수 반영). 카탈로그에 값이 없던 항목은 null 이라 합계에서 빠진다.
    kcal?: number | null;
    proteinG?: number | null;
    sodiumMg?: number | null;
  }[];
}

const TOP_FOODS_LIMIT = 10;
// 같은 음식을 며칠 안에 다시 먹으면 "겹침"으로 볼지.
export const REPEAT_WINDOW_DAYS = 7;

const bucket = <K extends string>(
  counts: Map<string, number>,
  label: (k: string) => string,
  order?: Record<K, number>,
): { key: string; label: string; count: number }[] => {
  const arr = [...counts.entries()].map(([key, count]) => ({ key, label: label(key), count }));
  if (order) {
    return arr.sort(
      (a, b) => (order[a.key as K] ?? 99) - (order[b.key as K] ?? 99) || b.count - a.count,
    );
  }
  return arr.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
};

const labelOf = <T extends string>(map: Record<T, string>, key: string): string =>
  (map as Record<string, string>)[key] ?? '미분류';

export const computeMealStats = (
  rows: StatEntryRow[],
  from: string,
  to: string,
  today: string,
): MealStatsResultType => {
  const days = dateKeyRange(from, to);
  const bySlot = new Map<string, number>();
  const byDishType = new Map<string, number>();
  const byIngredient = new Map<string, number>();
  const byCuisine = new Map<string, number>();
  const byMealType = new Map<string, number>();
  const byDate = new Map<string, number>();
  // 음식별 먹은 날짜(중복 없이, 오름차순).
  const foodDates = new Map<string, { name: string; dates: string[] }>();

  let itemCount = 0;
  for (const row of rows) {
    bySlot.set(row.slot, (bySlot.get(row.slot) ?? 0) + 1);
    byDate.set(row.eatenDate, (byDate.get(row.eatenDate) ?? 0) + 1);
    if (row.mealType) byMealType.set(row.mealType, (byMealType.get(row.mealType) ?? 0) + 1);
    for (const item of row.items) {
      itemCount += 1;
      // 분포는 "주식"만 — 반찬까지 넣으면 김치·나물이 모든 축을 지배한다.
      if (!item.isMain) continue;
      byDishType.set(item.dishType ?? 'unknown', (byDishType.get(item.dishType ?? 'unknown') ?? 0) + 1);
      byIngredient.set(item.mainIngredient ?? 'unknown', (byIngredient.get(item.mainIngredient ?? 'unknown') ?? 0) + 1);
      byCuisine.set(item.cuisine ?? 'unknown', (byCuisine.get(item.cuisine ?? 'unknown') ?? 0) + 1);
      const key = item.nameNorm || item.name;
      let f = foodDates.get(key);
      if (!f) {
        f = { name: item.name, dates: [] };
        foodDates.set(key, f);
      }
      if (!f.dates.includes(row.eatenDate)) f.dates.push(row.eatenDate);
    }
  }

  // 겹침: 같은 음식을 REPEAT_WINDOW_DAYS 안에 다시 먹은 "재등장" 횟수 / 전체 주식 등장 횟수.
  let repeats = 0;
  let occurrences = 0;
  const topFoods: { name: string; count: number; lastEatenDate: string }[] = [];
  for (const f of foodDates.values()) {
    const dates = [...f.dates].sort();
    occurrences += dates.length;
    for (let i = 1; i < dates.length; i += 1) {
      const gap = daysBetween(dates[i - 1]!, dates[i]!);
      if (gap !== null && gap <= REPEAT_WINDOW_DAYS) repeats += 1;
    }
    topFoods.push({ name: f.name, count: dates.length, lastEatenDate: dates[dates.length - 1]! });
  }
  topFoods.sort((a, b) => b.count - a.count || b.lastEatenDate.localeCompare(a.lastEatenDate));

  // 연속 기록 일수 — 오늘(또는 기간 마지막 날)부터 거꾸로 기록이 있는 날을 센다. 오늘 아직
  // 기록이 없으면 어제부터 세어 "어제까지 N일 연속"을 보여 준다(0 으로 떨어뜨리지 않는다).
  const recorded = new Set(byDate.keys());
  const anchor = recorded.has(today) ? today : shiftDate(today, -1);
  let streak = 0;
  let cursor = anchor;
  while (cursor && recorded.has(cursor) && streak < 400) {
    streak += 1;
    cursor = shiftDate(cursor, -1);
  }

  // 영양 — 값이 있는 항목만 더한다. 그래서 합계는 실제보다 **적게** 나오고, coverage 로 그
  // 사실을 함께 내려보낸다(UI 가 "78% 반영"이라고 밝힌다). 나눔의 분모는 기간 전체가 아니라
  // **기록이 있는 날**이다 — 안 먹은 게 아니라 안 적은 날이기 때문이다.
  let sumKcal = 0;
  let sumProtein = 0;
  let sumSodium = 0;
  let itemsWithNutrition = 0;
  for (const row of rows) {
    for (const item of row.items) {
      if (item.kcal === null || item.kcal === undefined) continue;
      itemsWithNutrition += 1;
      sumKcal += item.kcal;
      sumProtein += item.proteinG ?? 0;
      sumSodium += item.sodiumMg ?? 0;
    }
  }
  const nutritionDays = byDate.size;
  const perDay = (total: number): number | null =>
    itemsWithNutrition === 0 || nutritionDays === 0 ? null : Math.round((total / nutritionDays) * 10) / 10;

  return {
    from,
    to,
    entryCount: rows.length,
    itemCount,
    nutrition: {
      avgKcalPerDay: perDay(sumKcal),
      avgProteinGPerDay: perDay(sumProtein),
      avgSodiumMgPerDay: perDay(sumSodium),
      coverage: itemCount === 0 ? 0 : Math.round((itemsWithNutrition / itemCount) * 100) / 100,
      itemsWithNutrition,
    },
    recordedDays: recorded.size,
    totalDays: days.length,
    bySlot: bucket<MealSlot>(bySlot, (k) => labelOf(MEAL_SLOT_LABEL, k), MEAL_SLOT_ORDER),
    byDishType: bucket<FoodDishType>(byDishType, (k) => labelOf(FOOD_DISH_TYPE_LABEL, k)),
    byMainIngredient: bucket<FoodMainIngredient>(byIngredient, (k) => labelOf(FOOD_MAIN_INGREDIENT_LABEL, k)),
    byCuisine: bucket<FoodCuisine>(byCuisine, (k) => labelOf(FOOD_CUISINE_LABEL, k)),
    byMealType: bucket<MealType>(byMealType, (k) => labelOf(MEAL_TYPE_LABEL, k)),
    topFoods: topFoods.slice(0, TOP_FOODS_LIMIT),
    repeatRate: occurrences > 0 ? Math.round((repeats / occurrences) * 1000) / 1000 : 0,
    streakDays: streak,
    byDate: days.map((date) => ({ date, count: byDate.get(date) ?? 0 })),
  };
};

// 'YYYY-MM-DD' 를 days 만큼 이동. 잘못된 형식이면 빈 문자열(호출부 루프가 멈춘다).
const shiftDate = (key: string, days: number): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return '';
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const mo = `${d.getMonth() + 1}`.padStart(2, '0');
  const da = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${mo}-${da}`;
};

export class MealStatsService {
  constructor(private readonly prisma: PrismaClient) {}

  async load(userId: string, from: string, to: string): Promise<StatEntryRow[]> {
    const rows = await this.prisma.mealEntry.findMany({
      where: { userId, eatenDate: { gte: from, lte: to } },
      select: {
        eatenDate: true,
        slot: true,
        mealType: true,
        items: {
          select: {
            name: true,
            nameNorm: true,
            dishType: true,
            mainIngredient: true,
            cuisine: true,
            isMain: true,
            kcal: true,
            proteinG: true,
            sodiumMg: true,
          },
        },
      },
      orderBy: { eatenAt: 'asc' },
    });
    return rows;
  }

  async stats(userId: string, from: string, to: string, today: string): Promise<MealStatsResultType> {
    const rows = await this.load(userId, from, to);
    return computeMealStats(rows, from, to, today);
  }
}
