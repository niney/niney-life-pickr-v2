import type { PrismaClient } from '@prisma/client';
import type {
  MealStatsNutrientKeyType,
  MealStatsNutrientRowType,
  MealStatsNutrientsResultType,
} from '@repo/api-contract';
import { dateKeyRange } from '@repo/utils';
import { MealPreferenceService } from '../meal/meal-preference.service.js';
import { ENERGY_RATIO_RANGE, SATURATED_FAT_MAX_RATIO_ADULT, isAdultAgeGroup } from './kdri.js';
import { NUTRIENT_DEFS } from './meal-nutrition.defs.js';
import {
  analyzeMealNutrition,
  itemMacroGrams,
  itemPer100Amount,
  profileFrom,
  resolveItemNutrients,
  type AnalysisCatalogRow,
  type AnalysisItem,
  type AnalysisProfile,
  type MealNutritionService,
} from './meal-nutrition.service.js';

// 통계의 영양소별 하루 평균·흐름·많이 준 음식(2026-11-08) — 고른 기간(통계의 1주·1달·3달)을 영양 탭과 같은 셈으로 본다.
// - 하루 평균·판정은 영양소 점검(analyzeMealNutrition)을 이 기간에 그대로 돌린 값이다 — 두 끼 이상 기록한 날만, 같은 섭취기준.
//   같은 기간이면 영양 탭과 숫자가 같고, 통계 화면(막대 위 한 줄·묶음 카드)도 이 판정을 쓴다.
// - 점검에 없는 탄수화물·당류·지방·포화지방·콜레스테롤도 같은 날·같은 풀이(항목의 카탈로그 행 → 영양 기준 음식)로 더한다.
//   판정은 하지 않고, 양 기준이 없는 셋(탄수화물·지방·포화지방)은 열량 중 비율과 에너지적정비율을 나란히 준다.
// - 열량 중 비율과 많이 준 음식은 기간의 모든 기록에서 낸다(통계 분포 막대·묶음 카드의 '내 평균'과 같은 셈). 날마다 흐름도
//   모든 날 — 한 끼만 기록한 날도 값을 주고 평균에는 넣지 않는다(화면이 흐리게 그린다).

type ExtraKey = 'kcal' | 'carb' | 'sugar' | 'fat' | 'saturatedFat' | 'cholesterol';

const EXTRA: Readonly<Record<ExtraKey, { label: string; unit: string; kcalPerG: number | null }>> = {
  kcal: { label: '열량', unit: 'kcal', kcalPerG: null },
  carb: { label: '탄수화물', unit: 'g', kcalPerG: 4 },
  sugar: { label: '당류', unit: 'g', kcalPerG: 4 },
  fat: { label: '지방', unit: 'g', kcalPerG: 9 },
  saturatedFat: { label: '포화지방', unit: 'g', kcalPerG: 9 },
  cholesterol: { label: '콜레스테롤', unit: 'mg', kcalPerG: null },
};
const isExtra = (key: MealStatsNutrientKeyType): key is ExtraKey => key in EXTRA;

// 위 묶음 차례 — 열량, 탄수화물(당류)·단백질·지방(포화지방)의 '탄단지', 나트륨, 콜레스테롤(통계 화면이 이 차례 그대로 그린다).
// 나머지(식이섬유·비타민·무기질)는 점검 차례 그대로 — 화면이 영양 탭처럼 판정 순으로 다시 늘어놓는다.
const CORE: readonly MealStatsNutrientKeyType[] = [
  'kcal',
  'carb',
  'sugar',
  'protein',
  'fat',
  'saturatedFat',
  'sodium',
  'cholesterol',
];
const PARENT: Partial<Record<MealStatsNutrientKeyType, MealStatsNutrientKeyType>> = {
  sugar: 'carb',
  saturatedFat: 'fat',
};
const MAX_TOP_FOODS = 5;

interface Acc {
  daily: (number | null)[];
  // 두 끼 이상 기록한 날의 합과, 그 값을 아는 기록의 열량(정보 비율의 분자).
  analyzedSum: number;
  analyzedKcal: number;
  // 기간 모든 기록의 합과, 그 값을 아는 기록의 열량(열량 중 비율·음식 몫의 분모).
  total: number;
  totalKcal: number;
  foods: Map<string, { amount: number; count: number }>;
}

export interface StatsInput {
  items: AnalysisItem[];
  rowsById: ReadonlyMap<string, AnalysisCatalogRow>;
  refRowsByName?: ReadonlyMap<string, AnalysisCatalogRow>;
  profile: AnalysisProfile;
  from: string;
  to: string;
}

const round = (v: number, digits: number): number => {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
};
// 화면 숫자 모양(formatNutrientAmount)과 같은 자리 — 100 이상 정수, 10 이상 소수 첫째, 그 아래 둘째.
const displayAmount = (v: number): number => round(v, v < 10 ? 2 : v < 100 ? 1 : 0);

/** 분석 본체 — 순수 함수(DB 없이 테스트). */
export const statsMealNutrients = (input: StatsInput): MealStatsNutrientsResultType => {
  const { items, rowsById, profile } = input;
  const refRows = input.refRowsByName ?? new Map<string, AnalysisCatalogRow>();
  const dates = dateKeyRange(input.from, input.to);
  const index = new Map(dates.map((d, i) => [d, i]));
  const entries = new Map<string, Set<string>>();
  for (const it of items) {
    const set = entries.get(it.eatenDate) ?? new Set<string>();
    set.add(it.entryId);
    entries.set(it.eatenDate, set);
  }
  const meals = dates.map((d) => entries.get(d)?.size ?? 0);
  const analysis = analyzeMealNutrition({
    items,
    rowsById,
    refRowsByName: refRows,
    profile,
    from: input.from,
    to: input.to,
    days: dates.length,
  });

  const keys: MealStatsNutrientKeyType[] = [
    ...(Object.keys(EXTRA) as ExtraKey[]),
    ...NUTRIENT_DEFS.map((d) => d.key),
  ];
  const accs = new Map<MealStatsNutrientKeyType, Acc>(
    keys.map((k) => [
      k,
      { daily: dates.map(() => null), analyzedSum: 0, analyzedKcal: 0, total: 0, totalKcal: 0, foods: new Map() },
    ]),
  );
  let analyzedKcal = 0;
  // 열량 구성 — 탄수화물·단백질·지방을 다 아는 기록만(따로 더하면 단백질 쪽으로 쏠린다 — 묶음 카드의 '내 평균'과 같은 셈).
  const comp = { carb: 0, protein: 0, fat: 0 };

  for (const it of items) {
    const i = index.get(it.eatenDate);
    // 열량을 모르는 기록은 점검처럼 빠진다(끼니 수에는 든다).
    if (i === undefined || it.kcal === null) continue;
    const kcal = it.kcal;
    const analyzed = meals[i]! >= 2;
    if (analyzed) analyzedKcal += kcal;
    const r = resolveItemNutrients(it, kcal, rowsById, refRows);
    const carb = itemMacroGrams(r, kcal, 'carbG');
    const fat = itemMacroGrams(r, kcal, 'fatG');
    const protein = r.values.get('protein') ?? null;
    if (carb !== null && fat !== null && protein !== null) {
      comp.carb += carb * 4;
      comp.protein += protein * 4;
      comp.fat += fat * 9;
    }
    const values: Array<[MealStatsNutrientKeyType, number | null]> = [
      ['kcal', kcal],
      ['carb', carb],
      ['sugar', itemMacroGrams(r, kcal, 'sugarG')],
      ['fat', fat],
      ['saturatedFat', itemPer100Amount(r, 'saturatedFatG')],
      ['cholesterol', itemPer100Amount(r, 'cholesterolMg')],
      ...NUTRIENT_DEFS.map((d): [MealStatsNutrientKeyType, number | null] => [d.key, r.values.get(d.key) ?? null]),
    ];
    for (const [key, v] of values) {
      if (v === null) continue;
      const a = accs.get(key)!;
      a.daily[i] = (a.daily[i] ?? 0) + v;
      a.total += v;
      a.totalKcal += kcal;
      if (analyzed) {
        a.analyzedSum += v;
        a.analyzedKcal += kcal;
      }
      if (v > 0) {
        const f = a.foods.get(it.name) ?? { amount: 0, count: 0 };
        f.amount += v;
        f.count += 1;
        a.foods.set(it.name, f);
      }
    }
  }

  const days = analysis.analyzedDays;
  const compSum = comp.carb + comp.protein + comp.fat;
  const compShare = (k: keyof typeof comp): number | null => (compSum > 0 ? round(comp[k] / compSum, 3) : null);
  // 만 12세 미만(점검 안 함)에는 적정 비율도 붙이지 않는다.
  const ranges = profile.unsupportedReason === null;

  const row = (key: MealStatsNutrientKeyType): MealStatsNutrientRowType => {
    const a = accs.get(key)!;
    const shared = {
      key,
      group: CORE.includes(key) ? ('core' as const) : ('micro' as const),
      parent: PARENT[key] ?? null,
      daily: a.daily.map((v) => (v === null ? null : displayAmount(v))),
      topFoods: [...a.foods.entries()]
        .sort((x, y) => y[1].amount - x[1].amount || x[0].localeCompare(y[0], 'ko'))
        .slice(0, MAX_TOP_FOODS)
        .map(([name, f]) => ({ name, share: a.total > 0 ? round(f.amount / a.total, 3) : 0, count: f.count })),
    };
    if (key === 'kcal') {
      return {
        ...shared,
        label: EXTRA.kcal.label,
        unit: EXTRA.kcal.unit,
        intakePerDay: analysis.energy.intakePerDay,
        coverage: analyzedKcal > 0 ? 1 : 0,
        reference: { kind: 'eer', amount: analysis.energy.requirement },
        percent: analysis.energy.percent,
        energyShare: null,
        energyRange: null,
        status: null,
        recordGap: false,
        note: null,
      };
    }
    if (isExtra(key)) {
      const e = EXTRA[key];
      const energyShare =
        key === 'carb' || key === 'fat'
          ? compShare(key)
          : e.kcalPerG !== null && a.totalKcal > 0
            ? round((a.total * e.kcalPerG) / a.totalKcal, 3)
            : null;
      const range =
        !ranges
          ? null
          : key === 'carb' || key === 'fat'
            ? ENERGY_RATIO_RANGE[key]
            : key === 'saturatedFat' && isAdultAgeGroup(profile.ageGroup)
              ? { min: null, max: SATURATED_FAT_MAX_RATIO_ADULT }
              : null;
      return {
        ...shared,
        label: e.label,
        unit: e.unit,
        intakePerDay: days > 0 && a.analyzedKcal > 0 ? displayAmount(a.analyzedSum / days) : null,
        coverage: analyzedKcal > 0 ? round(a.analyzedKcal / analyzedKcal, 2) : 0,
        reference: null,
        percent: null,
        energyShare,
        energyRange: range ? { min: range.min, max: range.max } : null,
        status: null,
        recordGap: false,
        note: null,
      };
    }
    // 섭취기준 영양소 — 영양 탭 점검의 값·판정을 그대로.
    const n = analysis.nutrients.find((x) => x.key === key)!;
    return {
      ...shared,
      label: n.label,
      unit: n.unit,
      intakePerDay: n.intakePerDay,
      coverage: n.coverage,
      reference: { kind: n.reference.kind, amount: n.reference.amount },
      percent: n.percent,
      energyShare: key === 'protein' ? compShare('protein') : null,
      energyRange: key === 'protein' && ranges ? { ...ENERGY_RATIO_RANGE.protein } : null,
      status: n.status,
      recordGap: n.recordGap,
      note: n.note,
    };
  };

  return {
    from: input.from,
    to: input.to,
    days: dates.length,
    analyzedDays: analysis.analyzedDays,
    status: analysis.status,
    insufficientReason: analysis.insufficientReason,
    profile: analysis.profile,
    dates,
    meals,
    rows: [...CORE, ...NUTRIENT_DEFS.map((d) => d.key).filter((k) => !CORE.includes(k))].map(row),
    notes: analysis.notes,
  };
};

/** 기간(from~to, 포함) 기록을 읽어 영양소별 하루 평균·흐름을 낸다 — 카탈로그·영양 기준 음식은 영양소 점검과 같은 것을 쓴다. */
export class MealNutritionStatsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly nutrition: MealNutritionService,
  ) {}

  async nutrients(userId: string, from: string, to: string, today: string): Promise<MealStatsNutrientsResultType> {
    const [preference, entries] = await Promise.all([
      new MealPreferenceService(this.prisma).get(userId),
      this.prisma.mealEntry.findMany({
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
              kcal: true,
              proteinG: true,
              sodiumMg: true,
            },
          },
        },
      }),
    ]);
    const items: AnalysisItem[] = entries.flatMap((e) =>
      e.items.map((i) => ({ ...i, eatenDate: e.eatenDate, entryId: e.id })),
    );
    const { rowsById, refRowsByName } = await this.nutrition.catalogFor(items);
    const profile = profileFrom(preference.sex, preference.birthYear, today);
    return statsMealNutrients({ items, rowsById, refRowsByName, profile, from, to });
  }
}
