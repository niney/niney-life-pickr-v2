import type { PrismaClient } from '@prisma/client';
import type {
  MealAllergenType,
  MealNutrientResultType,
  MealNutrientStatusType,
  MealNutritionAnalysisType,
  MealSexType,
} from '@repo/api-contract';
import { normalizeTerm } from '../../lib/text.js';
import { loadLexicon, type Lexicon } from '../food/engine/index.js';
import {
  kcalPer100gOf,
  mealServingNutrition,
  type ServingCatalogRow,
} from '../food/food-serving.js';
import { parseNutrientsPer100g, type NutrientsPer100g } from '../food/food-nutrients.js';
import { parseJsonStringArray } from '../food/food.service.js';
import { MealPreferenceService } from '../meal/meal-preference.service.js';
import { commonMealNorms } from '../meal-recommendation/common-meals.js';
import {
  allergenData,
  hitsUserAllergen,
  isExcluded,
  isExplorableCatalogRow,
  shiftDate,
} from '../meal-recommendation/meal-pattern.service.js';
import {
  DEFAULT_AGE_GROUP,
  ageGroupFor,
  energyRequirement,
  nutrientReference,
  type KdriAgeGroup,
  type KdriNutrient,
  type NutrientReference,
} from './kdri.js';
import { NOT_MEASURED_NUTRIENTS, NUTRIENT_DEFS, type NutrientDef } from './meal-nutrition.defs.js';

// 영양소 점검 — 최근 N일 식단 기록의 하루 평균 섭취를 2020 한국인 영양소 섭취기준과 견준다(결정적, LLM 없음).
// 영양제 조언(meal-nutrition-advice)은 이 결과만 근거로 쓴다.
//
// 섭취량: 식단 항목의 저장 열량(1인분 × 양 배수) ÷ 카탈로그 100g당 열량 = 먹은 g → × 100g당 비타민·무기질.
// 단백질·나트륨은 항목에 저장된 스냅샷을 그대로 쓴다. 두 끼 이상 기록한 날만 평균에 넣는다 — 한 끼만 적은 날이
// 섞이면 모든 영양소가 부족해 보인다. 그래도 기록이 덜 남았을 수 있어, 부족하다고 조언하기 전에 열량을 필요량만큼
// 채운 셈(최대 2배)으로 다시 보고 그래도 모자랄 때만 조언 대상(supplementCandidate)으로 둔다.

// 두 끼 이상 기록한 날이 이보다 적으면 판단하지 않는다.
export const MIN_ANALYZED_DAYS = 4;
// 그 영양소 값이 있는 기록의 열량 비율이 이보다 낮으면 판단을 미룬다.
export const MIN_COVERAGE = 0.6;
// 충분섭취량(ai)만 있는 영양소는 이 비율 아래를 '부족 가능성'으로 본다(평균필요량이 없어서).
const AI_LOW_RATIO = 0.7;
// 기록이 덜 남은 몫을 채워 볼 때 열량 배수 상한.
const MAX_ENERGY_ADJUST = 2;
const LEXICON_TTL_MS = 10 * 60 * 1000;
// 비타민·무기질이 사실상 없는 음료·주류 — 영양 정보가 없어도 '0'으로 알고 있는 셈 친다.
const DRINK_DISH_TYPES = new Set(['beverage', 'alcohol']);
const DRINK_CURATED_CATEGORIES = new Set(['주류', '음료']);
// 원재료 DB(과일·채소…) 행은 아직 비타민·무기질이 없다 — 이런 기록이 있으면 과일·채소에 많은 영양소는 적게 잡힌다.
const PRODUCE_RAW_CATEGORIES = new Set(['과일류', '채소류', '버섯류', '해조류']);
const SUGGESTIONS_PER_NUTRIENT = 3;
const TOP_SOURCES = 3;
// 음식 제안 — 1인분이 기준량의 이 비율은 채워야 하고, 1인분 나트륨이 이 이상이면 뺀다.
const SUGGESTION_MIN_SHARE = 0.1;
const SUGGESTION_MAX_SODIUM_MG = 1500;
// 나트륨을 이미 많이 먹는 사람에겐 더 엄격히 — 국물 요리는 빼고 1인분 나트륨도 낮춘다("국물을 줄이세요"와 모순되지 않게).
const SUGGESTION_MAX_SODIUM_MG_WHEN_HIGH = 800;
const SOUP_DISH_TYPES = new Set(['soup', 'stew']);
// 조리형태가 밥(국밥)·찜(닭볶음탕 등)으로 분류된 국물 요리도 이름으로 거른다.
const SOUP_NAME_RE = /(국밥|탕|찌개|전골|국)$/;
// 100g당 열량이 이 이상인 무거운 음식(족발·장어구이·튀김…)도 뺀다 — 끼니 추천 건강 점수의 고밀도 기준과 같다.
const SUGGESTION_MAX_KCAL_PER_100G = 200;

export interface AnalysisItem {
  eatenDate: string;
  entryId: string;
  name: string;
  foodId: string | null;
  dishType: string | null;
  kcal: number | null;
  proteinG: number | null;
  sodiumMg: number | null;
}

export interface AnalysisCatalogRow extends ServingCatalogRow {
  id: string;
  nutrientsPer100gJson: string | null;
}

export interface AnalysisProfile {
  sex: MealSexType | null;
  ageGroup: KdriAgeGroup;
  basis: 'user' | 'default';
  // 만 12세 미만 등 — 판단하지 않는 이유.
  unsupportedReason: string | null;
}

export const profileFrom = (
  sex: MealSexType | null | undefined,
  birthYear: number | null | undefined,
  today: string,
): AnalysisProfile => {
  const year = Number(today.slice(0, 4));
  const age = birthYear ? year - birthYear : null;
  if (age !== null && age < 12) {
    return {
      sex: sex ?? null,
      ageGroup: DEFAULT_AGE_GROUP,
      basis: 'user',
      unsupportedReason: '만 12세 미만은 영양소 점검을 하지 않아요. 어린이 영양제는 소아청소년과와 상의하세요.',
    };
  }
  const ageGroup = age !== null ? ageGroupFor(age) : null;
  return {
    sex: sex ?? null,
    ageGroup: ageGroup ?? DEFAULT_AGE_GROUP,
    basis: sex && ageGroup ? 'user' : 'default',
    unsupportedReason: null,
  };
};

const isDrinkRow = (row: AnalysisCatalogRow | null, itemDishType: string | null): boolean =>
  (itemDishType !== null && DRINK_DISH_TYPES.has(itemDishType)) ||
  (row !== null &&
    ((row.dishType !== null && DRINK_DISH_TYPES.has(row.dishType)) ||
      (row.source === 'curated' && DRINK_CURATED_CATEGORIES.has(row.sourceCategory ?? ''))));

const round = (v: number, digits = 1): number => {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
};

interface NutrientTotals {
  amount: number;
  coveredKcal: number;
  bySource: Map<string, number>;
}

export interface AssessInput {
  def: NutrientDef;
  intake: number | null;
  ref: NutrientReference;
  coverage: number;
  // 기록 열량 ÷ 필요량(모르면 null).
  energyRatio: number | null;
  insufficient: boolean;
  produceGap: boolean;
}

export interface Assessment {
  reference: MealNutrientResultType['reference'];
  upperLimit: number | null;
  percent: number | null;
  status: MealNutrientStatusType;
  supplementCandidate: boolean;
  note: string | null;
}

/** 한 영양소의 판단 — 순수 함수. */
export const assessNutrient = ({
  def,
  intake,
  ref,
  coverage,
  energyRatio,
  insufficient,
  produceGap,
}: AssessInput): Assessment => {
  const kind: 'rni' | 'ai' | 'cdrr' =
    def.key === 'sodium' ? 'cdrr' : ref.rni !== undefined ? 'rni' : 'ai';
  const amount = (kind === 'cdrr' ? ref.cdrr : kind === 'rni' ? ref.rni : ref.ai) ?? 0;
  const reference = { kind, amount, ear: ref.ear ?? null };
  const upperLimit = ref.ul ?? null;
  const percent = intake !== null && amount > 0 ? round((intake / amount) * 100, 0) : null;
  const base = { reference, upperLimit, percent };

  if (insufficient || intake === null) {
    return { ...base, status: 'unknown', supplementCandidate: false, note: null };
  }
  if (coverage < MIN_COVERAGE) {
    return {
      ...base,
      status: 'unknown',
      supplementCandidate: false,
      note: `이 영양소 정보가 있는 기록이 ${Math.round(coverage * 100)}%뿐이라 판단을 미뤄요.`,
    };
  }
  if (kind === 'cdrr') {
    return {
      ...base,
      status: intake > amount ? 'high' : 'ok',
      supplementCandidate: false,
      note: null,
    };
  }
  if (def.foodUpperLimit && upperLimit !== null && intake > upperLimit) {
    return { ...base, status: 'high', supplementCandidate: false, note: '상한섭취량을 넘었어요.' };
  }
  const low =
    kind === 'rni' ? ref.ear !== undefined && intake < ref.ear : intake < amount * AI_LOW_RATIO;
  const status: MealNutrientStatusType = low ? 'low' : intake < amount ? 'borderline' : 'ok';
  if (status === 'ok') return { ...base, status, supplementCandidate: false, note: null };

  // 기록이 덜 남았을 수 있다 — 열량을 필요량만큼 채운 셈(최대 2배)으로도 모자라야 조언한다.
  const adjust =
    energyRatio !== null && energyRatio > 0 ? Math.min(MAX_ENERGY_ADJUST, Math.max(1, 1 / energyRatio)) : 1;
  const stillShort = intake * adjust < amount;
  if (produceGap && def.produceSensitive) {
    return {
      ...base,
      status,
      supplementCandidate: false,
      note: '영양 정보가 없는 과일·채소 기록이 있어 실제보다 적게 잡혔을 수 있어요.',
    };
  }
  return {
    ...base,
    status,
    supplementCandidate: stillShort,
    note: stillShort ? null : '기록이 빠진 끼니를 채우면 기준에 닿을 수 있는 수준이에요.',
  };
};

export interface AnalyzeInput {
  items: AnalysisItem[];
  rowsById: ReadonlyMap<string, AnalysisCatalogRow>;
  profile: AnalysisProfile;
  from: string;
  to: string;
  days: number;
  // 영양소별 흔한 한 끼 제안(서비스가 미리 고른 것).
  suggestions?: ReadonlyMap<KdriNutrient, string[]>;
}

/** 분석 본체 — 순수 함수(DB 없이 테스트). */
export const analyzeMealNutrition = (input: AnalyzeInput): MealNutritionAnalysisType => {
  const { items, rowsById, profile } = input;
  const entriesByDate = new Map<string, Set<string>>();
  for (const it of items) {
    const set = entriesByDate.get(it.eatenDate) ?? new Set<string>();
    set.add(it.entryId);
    entriesByDate.set(it.eatenDate, set);
  }
  const analyzedDates = new Set(
    [...entriesByDate.entries()].filter(([, ids]) => ids.size >= 2).map(([d]) => d),
  );
  const analyzedDays = analyzedDates.size;
  const mealCount = new Set(items.map((i) => i.entryId)).size;
  const used = items.filter((i) => analyzedDates.has(i.eatenDate));

  // 먹은 g 과 영양소 합계.
  let energyKcal = 0;
  let nutrientCoveredKcal = 0;
  let produceGapCount = 0;
  const totals = new Map<KdriNutrient, NutrientTotals>(
    NUTRIENT_DEFS.map((d) => [d.key, { amount: 0, coveredKcal: 0, bySource: new Map() }]),
  );
  for (const it of used) {
    const row = it.foodId ? (rowsById.get(it.foodId) ?? null) : null;
    if (it.kcal === null) {
      if (row?.source === 'mfds-raw' && PRODUCE_RAW_CATEGORIES.has(row.sourceCategory ?? '')) {
        produceGapCount += 1;
      }
      continue;
    }
    energyKcal += it.kcal;
    const drink = isDrinkRow(row, it.dishType);
    const per100: NutrientsPer100g = row ? parseNutrientsPer100g(row.nutrientsPer100gJson) : {};
    const kcal100 = row ? kcalPer100gOf(row) : null;
    const grams = kcal100 && kcal100 > 0 ? (it.kcal / kcal100) * 100 : null;
    if (drink || (grams !== null && Object.keys(per100).length > 0)) nutrientCoveredKcal += it.kcal;
    if (
      !drink &&
      row?.source === 'mfds-raw' &&
      PRODUCE_RAW_CATEGORIES.has(row.sourceCategory ?? '') &&
      Object.keys(per100).length === 0
    ) {
      produceGapCount += 1;
    }
    for (const def of NUTRIENT_DEFS) {
      const t = totals.get(def.key)!;
      let value: number | null = null;
      if ('snapshot' in def.from) {
        value = def.from.snapshot === 'proteinG' ? it.proteinG : it.sodiumMg;
      } else if (drink) {
        value = 0;
      } else if (grams !== null && per100[def.from.per100] !== undefined) {
        value = (per100[def.from.per100]! * grams) / 100;
      }
      if (value === null) continue;
      t.amount += value;
      t.coveredKcal += it.kcal;
      if (value > 0) t.bySource.set(it.name, (t.bySource.get(it.name) ?? 0) + value);
    }
  }

  const unsupported = profile.unsupportedReason;
  const insufficient = unsupported !== null || analyzedDays < MIN_ANALYZED_DAYS;
  const insufficientReason =
    unsupported ??
    (analyzedDays < MIN_ANALYZED_DAYS
      ? `최근 ${input.days}일 중 두 끼 이상 기록한 날이 ${analyzedDays}일이에요. ${MIN_ANALYZED_DAYS}일 이상 기록하면 볼 수 있어요.`
      : null);
  const requirement = energyRequirement(profile.sex, profile.ageGroup);
  const energyPerDay = analyzedDays > 0 ? energyKcal / analyzedDays : null;
  const energyRatio = energyPerDay !== null ? energyPerDay / requirement : null;
  const produceGap = produceGapCount > 0;

  const nutrients: MealNutrientResultType[] = NUTRIENT_DEFS.map((def) => {
    const t = totals.get(def.key)!;
    const ref = nutrientReference(def.key, profile.sex, profile.ageGroup);
    const coverage = energyKcal > 0 ? t.coveredKcal / energyKcal : 0;
    const intake = analyzedDays > 0 && t.coveredKcal > 0 ? t.amount / analyzedDays : null;
    const a = assessNutrient({ def, intake, ref, coverage, energyRatio, insufficient, produceGap });
    return {
      key: def.key,
      label: def.label,
      unit: def.unit,
      intakePerDay: intake === null ? null : round(intake, intake < 10 ? 2 : 0),
      reference: a.reference,
      upperLimit: a.upperLimit,
      percent: a.percent,
      coverage: round(coverage, 2),
      status: a.status,
      supplementCandidate: a.supplementCandidate,
      topSources: [...t.bySource.entries()]
        .sort((x, y) => y[1] - x[1])
        .slice(0, TOP_SOURCES)
        .map(([name]) => name),
      foodSuggestions:
        a.status === 'low' || a.status === 'borderline'
          ? [...(input.suggestions?.get(def.key) ?? [])]
          : [],
      typicalFoods: [...def.typicalFoods],
      note: a.note,
    };
  });

  const notes: string[] = [];
  if (profile.basis === 'default' && !unsupported) {
    notes.push('성별·출생연도를 설정하면 내 기준으로 더 정확히 봐요(지금은 30-49세 성인 기준).');
  }
  if (!insufficient && energyRatio !== null && energyRatio < 0.7) {
    notes.push(
      `기록된 열량이 하루 필요량의 ${Math.round(energyRatio * 100)}%예요. 빠진 끼니·간식이 있으면 영양소도 실제보다 적게 보여요.`,
    );
  }
  if (!insufficient && produceGap) {
    notes.push(
      `과일·채소 기록 ${produceGapCount}개는 아직 영양 정보가 없어 비타민 C·칼륨·식이섬유가 실제보다 적게 잡혔을 수 있어요.`,
    );
  }

  return {
    from: input.from,
    to: input.to,
    days: input.days,
    analyzedDays,
    mealCount,
    profile: { sex: profile.sex, ageGroup: profile.ageGroup, basis: profile.basis },
    energy: {
      intakePerDay: energyPerDay === null ? null : Math.round(energyPerDay),
      requirement,
      percent: energyRatio === null ? null : Math.round(energyRatio * 100),
    },
    coverage: energyKcal > 0 ? round(nutrientCoveredKcal / energyKcal, 2) : 0,
    status: insufficient ? 'insufficient' : 'ok',
    insufficientReason,
    nutrients,
    notMeasured: [...NOT_MEASURED_NUTRIENTS],
    notes,
  };
};

export class MealNutritionService {
  private lexiconCache: { value: Lexicon; at: number } | null = null;

  constructor(private readonly prisma: PrismaClient) {}

  private async lexicon(): Promise<Lexicon> {
    if (this.lexiconCache && Date.now() - this.lexiconCache.at < LEXICON_TTL_MS) {
      return this.lexiconCache.value;
    }
    const value = await loadLexicon(this.prisma);
    this.lexiconCache = { value, at: Date.now() };
    return value;
  }

  async analyze(userId: string, today: string, days: number): Promise<MealNutritionAnalysisType> {
    const from = shiftDate(today, -(days - 1));
    const [preference, entries] = await Promise.all([
      new MealPreferenceService(this.prisma).get(userId),
      this.prisma.mealEntry.findMany({
        where: { userId, eatenDate: { gte: from, lte: today } },
        select: {
          id: true,
          eatenDate: true,
          items: {
            select: {
              name: true,
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
      e.items.map((i) => ({
        eatenDate: e.eatenDate,
        entryId: e.id,
        name: i.name,
        foodId: i.foodId,
        dishType: i.dishType,
        kcal: i.kcal,
        proteinG: i.proteinG,
        sodiumMg: i.sodiumMg,
      })),
    );
    const ids = [...new Set(items.map((i) => i.foodId).filter((id): id is string => !!id))];
    const rows = ids.length
      ? await this.prisma.foodItem.findMany({ where: { id: { in: ids } }, select: CATALOG_SELECT })
      : [];
    const profile = profileFrom(preference.sex, preference.birthYear, today);
    const base = analyzeMealNutrition({
      items,
      rowsById: new Map(rows.map((r) => [r.id, r])),
      profile,
      from,
      to: today,
      days,
    });
    const wanted = base.nutrients.filter((n) => n.status === 'low' || n.status === 'borderline');
    if (wanted.length === 0) return base;
    const suggestions = await this.foodSuggestions(
      new Map(wanted.map((n) => [n.key, { reference: n.reference.amount, upperLimit: n.upperLimit }])),
      preference.allergens,
      [...preference.excludedFoods, ...preference.dislikedFoods],
      { sodiumHigh: base.nutrients.some((n) => n.key === 'sodium' && n.status === 'high') },
    );
    return {
      ...base,
      nutrients: base.nutrients.map((n) =>
        suggestions.has(n.key) ? { ...n, foodSuggestions: suggestions.get(n.key) ?? [] } : n,
      ),
    };
  }

  /**
   * 부족한 영양소가 열량에 비해 많은 흔한 한 끼(common-meals) — 100kcal 당 양으로 줄 세우되 1인분이 기준량의 10% 는
   * 채워야 하고, 1인분 나트륨 1,500mg 이상인 국물·찌개는 뺀다(1인분 양으로만 세면 짬뽕·불고기전골·족발처럼 양 많고
   * 짠 음식이 위로 왔다). 나트륨을 이미 많이 먹는 사람에겐 국물 요리를 빼고 800mg 로 낮춘다. 1인분이 하루 상한을
   * 넘는 값은 원자료 오류로 보고 뺀다(초밥 니아신 150mg 등). 알레르기·제외·덜 선호 음식도 뺀다. 음식으로 먼저
   * 채우자는 제안의 근거라 끼니 추천 후보가 될 수 있는 행만 본다.
   */
  async foodSuggestions(
    targets: ReadonlyMap<KdriNutrient, { reference: number; upperLimit: number | null }>,
    allergens: readonly MealAllergenType[],
    avoid: string[],
    opts: { sodiumHigh: boolean } = { sodiumHigh: false },
  ): Promise<Map<KdriNutrient, string[]>> {
    const sodiumCap = opts.sodiumHigh ? SUGGESTION_MAX_SODIUM_MG_WHEN_HIGH : SUGGESTION_MAX_SODIUM_MG;
    const lex = await this.lexicon();
    const commonNorms = commonMealNorms(lex);
    const rows = await this.prisma.foodItem.findMany({
      where: { active: true, nutrientsPer100gJson: { not: null } },
      select: {
        ...CATALOG_SELECT,
        nameNorm: true,
        aliasNormsJson: true,
        mainIngredient: true,
        ingredientsJson: true,
        allergensJson: true,
        allergenEvidenceJson: true,
        allergenStatus: true,
      },
    });
    const usable = rows.filter(
      (r) =>
        (commonNorms.has(r.nameNorm) ||
          parseJsonStringArray(r.aliasNormsJson).some((a) => commonNorms.has(a))) &&
        isExplorableCatalogRow(r) &&
        !hitsUserAllergen(
          allergenData(r.name, r.ingredientsJson, r.allergensJson, r.allergenEvidenceJson, r.allergenStatus),
          allergens,
        ) &&
        !isExcluded(
          { nameNorm: normalizeTerm(r.name), ingredients: parseJsonStringArray(r.ingredientsJson) },
          avoid,
        ),
    );
    const servings = usable
      .map((r) => {
        const serving = mealServingNutrition(r, { isMain: true }, lex);
        const kcal100 = kcalPer100gOf(r);
        const grams = serving.kcal !== null && kcal100 ? (serving.kcal / kcal100) * 100 : null;
        return { row: r, serving, grams, kcal100 };
      })
      .filter(
        (s) =>
          s.serving.kcal !== null &&
          s.serving.kcal > 0 &&
          (s.serving.sodiumMg ?? 0) < sodiumCap &&
          !(
            opts.sodiumHigh &&
            (SOUP_DISH_TYPES.has(s.row.dishType ?? '') || SOUP_NAME_RE.test(s.row.nameNorm))
          ) &&
          (s.kcal100 ?? 0) < SUGGESTION_MAX_KCAL_PER_100G,
      );
    const out = new Map<KdriNutrient, string[]>();
    for (const [key, { reference, upperLimit }] of targets) {
      const def = NUTRIENT_DEFS.find((d) => d.key === key)!;
      if (def.key === 'sodium') continue;
      const scored = servings
        .map(({ row, serving, grams }) => {
          let amount = 0;
          if ('snapshot' in def.from) {
            amount = def.from.snapshot === 'proteinG' ? (serving.proteinG ?? 0) : 0;
          } else if (grams !== null) {
            const per100 = parseNutrientsPer100g(row.nutrientsPer100gJson)[def.from.per100];
            amount = per100 !== undefined ? (per100 * grams) / 100 : 0;
          }
          return { name: row.name, amount, density: amount / serving.kcal! };
        })
        .filter(
          (s) =>
            s.amount >= reference * SUGGESTION_MIN_SHARE &&
            (upperLimit === null || s.amount <= upperLimit),
        )
        .sort((a, b) => b.density - a.density);
      const names: string[] = [];
      for (const s of scored) {
        if (!names.includes(s.name)) names.push(s.name);
        if (names.length >= SUGGESTIONS_PER_NUTRIENT) break;
      }
      out.set(key, names);
    }
    return out;
  }
}

const CATALOG_SELECT = {
  id: true,
  name: true,
  source: true,
  sourceCategory: true,
  dishType: true,
  servingG: true,
  kcal: true,
  kcalPer100g: true,
  proteinG: true,
  sodiumMg: true,
  nutritionFrom: true,
  nutrientsPer100gJson: true,
} as const;
