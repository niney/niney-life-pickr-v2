import type { PrismaClient } from '@prisma/client';
import type {
  MealGroupNutrientType,
  MealGroupNutritionType,
  MealStatsNutritionResultType,
} from '@repo/api-contract';
import { FOOD_CUISINE_LABEL, FOOD_DISH_TYPE_LABEL, FOOD_MAIN_INGREDIENT_LABEL } from '@repo/utils';
import type { KdriNutrient } from './kdri.js';
import { NUTRIENT_DEFS } from './meal-nutrition.defs.js';
import {
  itemMacroGrams,
  resolveItemNutrients,
  type AnalysisCatalogRow,
  type AnalysisItem,
  type MealNutritionService,
} from './meal-nutrition.service.js';

// 통계의 묶음별 영양 몫(2026-11-08) — 조리 형태·주재료·요리 계통 묶음마다 이 기간 내가 먹은 영양소 중 그 묶음이 채운 몫.
// "튀김을 먹으면 무엇을 먹은 셈인가"를 내 기록으로 답한다(예: 열량은 14% 인데 지방은 37%). 순수 함수(DB 없이 테스트).
//
// - 영양소 풀이는 영양소 점검과 같은 함수(resolveItemNutrients)라 두 화면 숫자가 어긋나지 않는다. 하루 평균이 아니라
//   기간 몫이라 두 끼 이상 기록한 날만 고르지 않는다.
// - 반찬도 그 묶음에 든다 — 그래야 묶음 몫을 다 더하면 100% 가 된다(김치·나물의 나트륨이 어디에도 안 들어가지 않게).
//   통계 막대의 '끼니 수'만 주식을 센다(mainCount).
// - 탄수화물·지방은 식단 항목에 저장되지 않아 카탈로그 1인분의 열량당 비율로 어림한다(itemMacroGrams).

type Axis = 'dishType' | 'mainIngredient' | 'cuisine';

export interface GroupItem extends AnalysisItem {
  isMain: boolean;
  mainIngredient: string | null;
  cuisine: string | null;
}

export interface GroupInput {
  items: GroupItem[];
  rowsById: ReadonlyMap<string, AnalysisCatalogRow>;
  refRowsByName?: ReadonlyMap<string, AnalysisCatalogRow>;
  from: string;
  to: string;
}

type MacroKey = 'kcal' | 'carb' | 'protein' | 'fat' | 'sodium';

const MACROS: ReadonlyArray<{ key: MacroKey; label: string; unit: string }> = [
  { key: 'kcal', label: '열량', unit: 'kcal' },
  { key: 'carb', label: '탄수화물', unit: 'g' },
  { key: 'protein', label: '단백질', unit: 'g' },
  { key: 'fat', label: '지방', unit: 'g' },
  { key: 'sodium', label: '나트륨', unit: 'mg' },
];

// 비타민·무기질(단백질·나트륨은 위 다섯 줄에 있다).
const MICRO_DEFS = NUTRIENT_DEFS.filter((d) => d.key !== 'protein' && d.key !== 'sodium');

// 많이 채운 비타민·무기질 — 몫이 이 이상이고 열량 몫의 이 배 이상, 그 묶음 열량 중 값을 아는 비율이 이 이상인 것만.
const HIGHLIGHT_MIN_SHARE = 0.1;
const HIGHLIGHT_OVER_KCAL = 1.2;
const HIGHLIGHT_MIN_COVERAGE = 0.5;
const MAX_HIGHLIGHTS = 3;
const MAX_FOODS = 4;

const UNKNOWN = 'unknown';
const UNKNOWN_LABEL = '미분류';

const AXIS_LABEL: Record<Axis, Record<string, string>> = {
  dishType: FOOD_DISH_TYPE_LABEL,
  mainIngredient: FOOD_MAIN_INGREDIENT_LABEL,
  cuisine: FOOD_CUISINE_LABEL,
};

interface Sum {
  amount: number;
  // 그 영양소 값을 아는 기록의 열량 — 비타민·무기질의 '아는 비율'을 본다.
  coveredKcal: number;
}

interface GroupAcc {
  key: string;
  mainCount: number;
  sideCount: number;
  knownCount: number;
  macroKnownCount: number;
  kcal: number;
  macros: Map<MacroKey, Sum>;
  micros: Map<KdriNutrient, Sum>;
  foods: Map<string, number>;
}

const newGroup = (key: string): GroupAcc => ({
  key,
  mainCount: 0,
  sideCount: 0,
  knownCount: 0,
  macroKnownCount: 0,
  kcal: 0,
  macros: new Map(),
  micros: new Map(),
  foods: new Map(),
});

const add = <K>(map: Map<K, Sum>, key: K, amount: number, kcal: number): void => {
  const s = map.get(key) ?? { amount: 0, coveredKcal: 0 };
  s.amount += amount;
  s.coveredKcal += kcal;
  map.set(key, s);
};

// 단위별 표시 자리 — kcal·mg 는 정수, g·μg 는 소수 첫째.
const roundAmount = (v: number, unit: string): number => {
  const digits = unit === 'kcal' || unit === 'mg' ? 0 : 1;
  const f = 10 ** digits;
  return Math.round(v * f) / f;
};
const roundShare = (v: number): number => Math.round(v * 1000) / 1000;

export const groupMealNutrition = (input: GroupInput): MealStatsNutritionResultType => {
  const refRows = input.refRowsByName ?? new Map<string, AnalysisCatalogRow>();
  const totals = { macros: new Map<MacroKey, Sum>(), micros: new Map<KdriNutrient, Sum>() };
  const groups: Record<Axis, Map<string, GroupAcc>> = {
    dishType: new Map(),
    mainIngredient: new Map(),
    cuisine: new Map(),
  };

  for (const it of input.items) {
    const keys: Record<Axis, string> = {
      dishType: it.dishType ?? UNKNOWN,
      mainIngredient: it.mainIngredient ?? UNKNOWN,
      cuisine: it.cuisine ?? UNKNOWN,
    };
    const accs = (Object.keys(groups) as Axis[]).map((axis) => {
      const map = groups[axis];
      const g = map.get(keys[axis]) ?? newGroup(keys[axis]);
      map.set(keys[axis], g);
      if (it.isMain) g.mainCount += 1;
      else g.sideCount += 1;
      g.foods.set(it.name, (g.foods.get(it.name) ?? 0) + 1);
      return g;
    });
    // 열량을 모르는 기록은 몫 계산에서 빠진다(횟수·음식에는 든다).
    if (it.kcal === null) continue;
    const kcal = it.kcal;
    const resolved = resolveItemNutrients(it, kcal, input.rowsById, refRows);
    const carb = itemMacroGrams(resolved, kcal, 'carbG');
    const fat = itemMacroGrams(resolved, kcal, 'fatG');
    const macroValues: Array<[MacroKey, number | null]> = [
      ['kcal', kcal],
      ['carb', carb],
      ['protein', resolved.values.get('protein') ?? null],
      ['fat', fat],
      ['sodium', resolved.values.get('sodium') ?? null],
    ];
    for (const [key, v] of macroValues) if (v !== null) add(totals.macros, key, v, kcal);
    for (const def of MICRO_DEFS) {
      const v = resolved.values.get(def.key);
      if (v !== undefined) add(totals.micros, def.key, v, kcal);
    }
    for (const g of accs) {
      g.knownCount += 1;
      g.kcal += kcal;
      if (carb !== null || fat !== null) g.macroKnownCount += 1;
      for (const [key, v] of macroValues) if (v !== null) add(g.macros, key, v, kcal);
      for (const def of MICRO_DEFS) {
        const v = resolved.values.get(def.key);
        if (v !== undefined) add(g.micros, def.key, v, kcal);
      }
    }
  }

  const share = (part: number, whole: number | undefined): number =>
    whole && whole > 0 ? roundShare(part / whole) : 0;

  const finish = (axis: Axis): MealGroupNutritionType[] =>
    [...groups[axis].values()]
      .map((g): MealGroupNutritionType => {
        const nutrients: MealGroupNutrientType[] = MACROS.flatMap((m) => {
          const s = g.macros.get(m.key);
          if (!s) return [];
          return [
            {
              key: m.key,
              label: m.label,
              unit: m.unit,
              amount: roundAmount(s.amount, m.unit),
              share: share(s.amount, totals.macros.get(m.key)?.amount),
            },
          ];
        });
        const kcalShare = share(g.kcal, totals.macros.get('kcal')?.amount);
        const highlights = MICRO_DEFS.flatMap((def): MealGroupNutrientType[] => {
          const s = g.micros.get(def.key);
          if (!s || g.kcal <= 0 || s.coveredKcal / g.kcal < HIGHLIGHT_MIN_COVERAGE) return [];
          const sh = share(s.amount, totals.micros.get(def.key)?.amount);
          if (sh < HIGHLIGHT_MIN_SHARE || sh < kcalShare * HIGHLIGHT_OVER_KCAL) return [];
          return [{ key: def.key, label: def.label, unit: def.unit, amount: roundAmount(s.amount, def.unit), share: sh }];
        })
          .sort((a, b) => b.share - a.share)
          .slice(0, MAX_HIGHLIGHTS);
        return {
          key: g.key,
          label: g.key === UNKNOWN ? UNKNOWN_LABEL : (AXIS_LABEL[axis][g.key] ?? UNKNOWN_LABEL),
          mainCount: g.mainCount,
          sideCount: g.sideCount,
          knownCount: g.knownCount,
          macroKnownCount: g.macroKnownCount,
          kcalPerItem: g.knownCount > 0 ? Math.round(g.kcal / g.knownCount) : null,
          nutrients,
          highlights,
          foods: [...g.foods.entries()]
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'))
            .slice(0, MAX_FOODS)
            .map(([name, count]) => ({ name, count })),
        };
      })
      // 열량 몫이 큰 순(같으면 주식 횟수) — 화면은 고른 막대 기준으로 다시 정렬한다.
      .sort(
        (a, b) =>
          (b.nutrients.find((n) => n.key === 'kcal')?.share ?? 0) -
            (a.nutrients.find((n) => n.key === 'kcal')?.share ?? 0) || b.mainCount - a.mainCount,
      );

  return {
    from: input.from,
    to: input.to,
    itemCount: input.items.length,
    totals: MACROS.flatMap((m) => {
      const s = totals.macros.get(m.key);
      return s ? [{ key: m.key, label: m.label, unit: m.unit, amount: roundAmount(s.amount, m.unit) }] : [];
    }),
    byDishType: finish('dishType'),
    byMainIngredient: finish('mainIngredient'),
    byCuisine: finish('cuisine'),
  };
};

/** 기간(from~to, 포함) 기록을 읽어 묶음별 몫을 낸다 — 카탈로그·영양 기준 음식은 영양소 점검과 같은 것을 쓴다. */
export class MealNutritionGroupsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly nutrition: MealNutritionService,
  ) {}

  async groups(userId: string, from: string, to: string): Promise<MealStatsNutritionResultType> {
    const entries = await this.prisma.mealEntry.findMany({
      where: { userId, eatenDate: { gte: from, lte: to } },
      select: {
        id: true,
        eatenDate: true,
        items: {
          select: {
            name: true,
            nameNorm: true,
            foodId: true,
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
    });
    const items: GroupItem[] = entries.flatMap((e) =>
      e.items.map((i) => ({ ...i, eatenDate: e.eatenDate, entryId: e.id })),
    );
    const { rowsById, refRowsByName } = await this.nutrition.catalogFor(items);
    return groupMealNutrition({ items, rowsById, refRowsByName, from, to });
  }
}
