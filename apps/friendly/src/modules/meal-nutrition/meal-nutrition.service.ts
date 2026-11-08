import type { PrismaClient } from '@prisma/client';
import { MEAL_NUTRIENT_MIN_COVERAGE } from '@repo/api-contract';
import type {
  MealAllergenType,
  MealNutrientResultType,
  MealNutrientStatusType,
  MealNutritionAnalysisType,
  MealSexType,
} from '@repo/api-contract';
import { normalizeTerm } from '../../lib/text.js';
import { foodPortionGrams, loadLexicon, type Lexicon } from '../food/engine/index.js';
import {
  kcalPer100gOf,
  mealServingNutrition,
  type ServingCatalogRow,
} from '../food/food-serving.js';
import { parseNutrientsPer100g, type NutrientsPer100g } from '../food/food-nutrients.js';
import { isNutrientProfileRow, type NutrientRefTarget } from '../food/food-nutrient-ref.js';
import type { FoodNutrientRefService } from '../food/food-nutrient-ref.service.js';
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
import { COMMON_SIDE_PORTION_G, commonSideNorms } from './common-sides.js';
import { NOT_MEASURED_NUTRIENTS, NUTRIENT_DEFS, isAdditiveNutrientSource, type NutrientDef } from './meal-nutrition.defs.js';

// 영양소 점검 — 최근 N일 식단 기록의 하루 평균 섭취를 2020 한국인 영양소 섭취기준과 견준다(결정적, LLM 없음).
// 영양제 조언(meal-nutrition-advice)은 이 결과만 근거로 쓴다.
//
// 섭취량: 식단 항목의 저장 열량(1인분 × 양 배수) ÷ 카탈로그 100g당 열량 = 먹은 g → × 100g당 비타민·무기질.
// 단백질·나트륨은 항목에 저장된 스냅샷을 그대로 쓴다. 두 끼 이상 기록한 날만 평균에 넣는다 — 한 끼만 적은 날이
// 섞이면 모든 영양소가 부족해 보인다. 그래도 기록이 덜 남았을 수 있어, 부족하다고 조언하기 전에 열량을 필요량만큼
// 채운 셈(최대 2배)으로 다시 보고 그래도 모자랄 때만 조언 대상(supplementCandidate)으로 둔다.

// 두 끼 이상 기록한 날이 이보다 적으면 판단하지 않는다.
export const MIN_ANALYZED_DAYS = 4;
// 그 영양소 값이 있는 기록의 열량 비율이 이보다 낮으면 판단을 미룬다(통계의 영양 표와 같은 문턱 — 계약 상수).
export const MIN_COVERAGE = MEAL_NUTRIENT_MIN_COVERAGE;
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
// 2026-11-07 10% → 25%: 비타민 C 가 모자란 사람에게 피자·모듬 김밥·김밥(1인분이 기준의 11~16%)이 '한 끼로는'으로
// 나왔다. 넘는 음식이 없으면 한 끼 제안을 비우고 곁들임·많이 든 음식으로 안내한다.
const SUGGESTION_MIN_SHARE = 0.25;
const SUGGESTION_MAX_SODIUM_MG = 1500;
// 나트륨을 이미 많이 먹는 사람에겐 더 엄격히 — 국물 요리는 빼고 1인분 나트륨도 낮춘다("국물을 줄이세요"와 모순되지 않게).
const SUGGESTION_MAX_SODIUM_MG_WHEN_HIGH = 800;
const SOUP_DISH_TYPES = new Set(['soup', 'stew']);
// 조리형태가 밥(국밥)·찜(닭볶음탕 등)으로 분류된 국물 요리도 이름으로 거른다.
const SOUP_NAME_RE = /(국밥|탕|찌개|전골|국)$/;
// 100g당 열량이 이 이상인 무거운 음식(족발·장어구이·튀김…)도 뺀다 — 끼니 추천 건강 점수의 고밀도 기준과 같다.
const SUGGESTION_MAX_KCAL_PER_100G = 200;
// 곁들임 제안(common-sides: 과일·나물·유제품…) — 양이 적어 한 끼보다 문턱을 낮추고, 1회 열량·나트륨으로 무거운 것을 뺀다.
const SIDE_MIN_SHARE = 0.15;
const SIDE_MAX_KCAL = 250;
const SIDE_MAX_SODIUM_MG = 600;
const SIDE_MAX_SODIUM_MG_WHEN_HIGH = 300;
// 1회 분량을 카탈로그가 모르는 곁들임(메뉴 어휘의 과일·채소 행 — 딸기·당근 등) — 기준량 100g 으로 본다.
const SIDE_DEFAULT_GRAMS = 100;
// 비슷한 음식(영양 기준 음식)의 영양 구성으로 추정한 열량이 이 비율 이상이면 notes 에 밝힌다.
const REF_NOTE_MIN_SHARE = 0.2;
// 기록 열량이 필요량의 이 비율 아래면 notes 에 밝힌다 — 빠진 끼니가 있으면 모든 영양소가 함께 낮게 보인다.
// 2026-11-07 0.7 → 0.85: 아침을 거의 안 적는 사용자(필요량의 71~75%)에게 15개 중 10개가 '부족'으로 보였는데 안내가 없었다.
const ENERGY_NOTE_RATIO = 0.85;

export interface AnalysisItem {
  eatenDate: string;
  entryId: string;
  name: string;
  /** 식단 항목 이름의 정규화 키 — 카탈로그 밖 이름의 영양 기준 음식을 찾는다(없으면 이름으로 계산). */
  nameNorm?: string | null;
  foodId: string | null;
  dishType: string | null;
  kcal: number | null;
  proteinG: number | null;
  sodiumMg: number | null;
}

export interface AnalysisCatalogRow extends ServingCatalogRow {
  id: string;
  nameNorm?: string;
  nutrientsPer100gJson: string | null;
  /** 1인분 탄수화물·지방·당류(g) — 1인분 열량(kcal)과 같은 변형에서 온 값. 없으면 null. */
  carbG?: number | null;
  fatG?: number | null;
  sugarG?: number | null;
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

// 점검이 보는 비타민·무기질 키(100g당) — 단백질·나트륨(스냅샷 우선)은 '정보 있음' 판단에서 뺀다.
const VITAMIN_MINERAL_KEYS = NUTRIENT_DEFS.flatMap((d) => ('per100' in d.from ? [d.from.per100] : []));
const hasVitaminMinerals = (per100: NutrientsPer100g): boolean =>
  VITAMIN_MINERAL_KEYS.some((k) => per100[k] !== undefined);

/** 기준 행의 100g당 단백질·나트륨 — JSON(원재료·2026-11 이후 적재분)이 먼저, 없으면 1인분 ÷ 1인분 중량. */
const per100Of = (
  row: AnalysisCatalogRow,
  per100: NutrientsPer100g,
  key: 'proteinG' | 'sodiumMg',
): number | null => {
  const v = per100[key];
  if (v !== undefined) return v;
  const serving = key === 'proteinG' ? row.proteinG : row.sodiumMg;
  return serving !== null && row.servingG && row.servingG > 0 ? (serving * 100) / row.servingG : null;
};

/**
 * 열량 1kcal 당 탄수화물·지방·당류(g) — 카탈로그 1인분(1인분 탄단지 ÷ 1인분 열량)이 먼저, 없으면 100g당(원재료·표준 음식의
 * 100g당 값 ÷ 100g당 열량, 2026-11-08). 1인분이 없는 원재료(회·참치·닭가슴살·과일)는 100g당으로만 낼 수 있다. 모르면 null.
 */
const macroPerKcal = (c: AnalysisCatalogRow, key: 'carbG' | 'fatG' | 'sugarG'): number | null => {
  const serving = c[key];
  if (serving !== null && serving !== undefined && c.kcal !== null && c.kcal > 0) return serving / c.kcal;
  const per100 = parseNutrientsPer100g(c.nutrientsPer100gJson)[key];
  const kcal100 = kcalPer100gOf(c);
  return per100 !== undefined && kcal100 !== null && kcal100 > 0 ? per100 / kcal100 : null;
};

// 탄수화물·지방을 이 행에서 바로 어림할 수 있는지(1인분이든 100g당이든) — 아니면 탄단지 기준 음식을 찾는다.
const hasMacroGrams = (row: AnalysisCatalogRow): boolean =>
  macroPerKcal(row, 'carbG') !== null && macroPerKcal(row, 'fatG') !== null;

const isDrinkRow = (row: AnalysisCatalogRow | null, itemDishType: string | null): boolean =>
  (itemDishType !== null && DRINK_DISH_TYPES.has(itemDishType)) ||
  (row !== null &&
    ((row.dishType !== null && DRINK_DISH_TYPES.has(row.dishType)) ||
      (row.source === 'curated' && DRINK_CURATED_CATEGORIES.has(row.sourceCategory ?? ''))));

/** 항목 하나의 영양소 풀이 — 점검(analyzeMealNutrition)과 통계의 묶음별 몫(groupMealNutrition)이 같은 규칙을 쓴다. */
export interface ItemNutrients {
  row: AnalysisCatalogRow | null;
  /** 비타민·무기질을 빌려 온 영양 기준 음식(항목의 카탈로그 행에 없을 때). */
  ref: AnalysisCatalogRow | null;
  drink: boolean;
  /** 비타민·무기질 값을 아는가(음료는 0 으로 아는 셈이지만 여기는 false). */
  hasVitamins: boolean;
  /** 영양소별 먹은 양 — 값을 아는 영양소만 들어 있다. */
  values: Map<KdriNutrient, number>;
  /** 기준 행의 100g당 값과 먹은 양의 100g 배수(먹은 열량 ÷ 100g당 열량) — 점검 밖 성분(포화지방·콜레스테롤)을 같은 풀이로 꺼낸다. */
  per100: NutrientsPer100g;
  factor: number | null;
  /**
   * 탄수화물·지방·당류(그리고 포화지방·콜레스테롤)를 빌릴 기준 음식 — 탄단지를 아는 후보 안에서 찾은 것(macroRows). 행 자신이
   * 비타민은 가졌지만 탄단지가 빈 경우(공기밥 ← 쌀밥)에도 찾는다. 비타민 풀이(ref·values)에는 쓰지 않는다.
   */
  macroRef: AnalysisCatalogRow | null;
  macroPer100: NutrientsPer100g;
  macroFactor: number | null;
}

/**
 * 먹은 열량 × 기준 행의 열량당 영양소(100g당 값 ÷ 100g당 열량). 기준 행은 항목의 카탈로그 행이 비타민·무기질과
 * 100g당 열량을 가지면 그 행, 아니면 영양 기준 음식(refRows — 행 이름, 카탈로그 밖이면 항목 이름으로 찾는다).
 * 단백질·나트륨은 저장 스냅샷이 먼저, 비면 기준 행의 100g당 값. 음료·주류는 비타민·무기질을 0 으로 본다.
 */
export const resolveItemNutrients = (
  it: AnalysisItem,
  kcal: number,
  rowsById: ReadonlyMap<string, AnalysisCatalogRow>,
  refRows: ReadonlyMap<string, AnalysisCatalogRow>,
  macroRows?: ReadonlyMap<string, AnalysisCatalogRow>,
): ItemNutrients => {
  const row = it.foodId ? (rowsById.get(it.foodId) ?? null) : null;
  const itemNorm = it.nameNorm || normalizeTerm(it.name);
  const drink = isDrinkRow(row, it.dishType);
  const own = row && isNutrientProfileRow(row) ? row : null;
  const ref = own
    ? null
    : ((row?.nameNorm ? refRows.get(row.nameNorm) : undefined) ?? refRows.get(itemNorm) ?? null);
  const basis = own ?? ref ?? row;
  const per100: NutrientsPer100g = basis ? parseNutrientsPer100g(basis.nutrientsPer100gJson) : {};
  const kcal100 = basis ? kcalPer100gOf(basis) : null;
  // 먹은 열량 ÷ 기준 행의 100g당 열량 = 기준 행으로 환산한 100g 단위 양.
  const factor = kcal100 && kcal100 > 0 ? kcal / kcal100 : null;
  const hasVitamins = factor !== null && hasVitaminMinerals(per100);
  const values = new Map<KdriNutrient, number>();
  for (const def of NUTRIENT_DEFS) {
    let value: number | null = null;
    if ('snapshot' in def.from) {
      // 저장 스냅샷이 먼저 — 비면(1인분이 없는 원재료·기준 음식으로 추정한 항목) 기준 행의 100g당 값으로.
      value = def.from.snapshot === 'proteinG' ? it.proteinG : it.sodiumMg;
      if (value === null && factor !== null && basis) {
        const p = per100Of(basis, per100, def.from.snapshot);
        if (p !== null) value = p * factor;
      }
    } else if (drink) {
      value = 0;
    } else if (factor !== null && per100[def.from.per100] !== undefined) {
      value = per100[def.from.per100]! * factor;
    }
    if (value !== null) values.set(def.key, value);
  }
  const macroRef =
    (row?.nameNorm ? macroRows?.get(row.nameNorm) : undefined) ?? macroRows?.get(itemNorm) ?? null;
  const macroKcal100 = macroRef ? kcalPer100gOf(macroRef) : null;
  return {
    row,
    ref,
    drink,
    hasVitamins,
    values,
    per100,
    factor,
    macroRef,
    macroPer100: macroRef ? parseNutrientsPer100g(macroRef.nutrientsPer100gJson) : {},
    macroFactor: macroKcal100 && macroKcal100 > 0 ? kcal / macroKcal100 : null,
  };
};

/**
 * 탄수화물·지방·당류(g) — 식단 항목 스냅샷에 없어 열량당 비율 × 먹은 열량으로 어림한다(항목의 카탈로그 행 → 영양 기준 음식 →
 * 탄단지 기준 음식 순, 각 행은 1인분 → 100g당 순 — macroPerKcal). 1인분 영양은 적재 때 같은 변형에서 함께 온 값이라 비율이
 * 맞는다. 모르면 null.
 */
export const itemMacroGrams = (
  r: ItemNutrients,
  kcal: number,
  key: 'carbG' | 'fatG' | 'sugarG',
): number | null => {
  for (const c of [r.row, r.ref, r.macroRef]) {
    const d = c ? macroPerKcal(c, key) : null;
    if (d !== null) return d * kcal;
  }
  return null;
};

/**
 * 점검 밖 100g당 성분(포화지방·콜레스테롤) — 비타민·무기질과 같은 기준 행 × 먹은 양, 그 행이 모르면 탄단지 기준 음식으로.
 * 모르면 null(음료도 0 으로 보지 않는다).
 */
export const itemPer100Amount = (r: ItemNutrients, key: 'saturatedFatG' | 'cholesterolMg'): number | null => {
  const v = r.per100[key];
  if (v !== undefined && r.factor !== null) return v * r.factor;
  const m = r.macroPer100[key];
  return m !== undefined && r.macroFactor !== null ? m * r.macroFactor : null;
};

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
  // low·borderline 인데 열량을 필요량만큼 채우면 기준에 닿는다 — 화면은 '기록 더 필요'로(status 는 그대로).
  recordGap: boolean;
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
  let percent = intake !== null && amount > 0 ? round((intake / amount) * 100, 0) : null;
  // 기준에 못 미치는데 반올림으로 100% 가 되면 '조금 부족 (100%)'처럼 어긋나 보인다.
  if (percent !== null && intake !== null && intake < amount && percent >= 100) percent = 99;
  const base = { reference, upperLimit, percent, recordGap: false };

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
  // 판정(status)은 기록 그대로 두고, 채워 보면 기준에 닿는 것만 표시를 바꾼다(사용자 결정 2026-11-07 A안 —
  // '부족'과 '기록이 빠진 끼니를 채우면 닿을 수준'이 함께 뜨던 어긋남).
  return {
    ...base,
    status,
    supplementCandidate: stillShort,
    recordGap: !stillShort,
    note: stillShort ? null : '기록이 빠진 끼니를 채우면 기준에 닿을 수 있는 수준이에요.',
  };
};

export interface AnalyzeInput {
  items: AnalysisItem[];
  rowsById: ReadonlyMap<string, AnalysisCatalogRow>;
  /**
   * 영양 기준 음식 — 이름(정규화) → 영양소 있는 표준 음식 행. 항목의 카탈로그 행에 비타민·무기질이 없으면 행 이름,
   * 카탈로그 밖 이름이면 항목 이름으로 찾는다(FoodNutrientRefService.resolveIds).
   */
  refRowsByName?: ReadonlyMap<string, AnalysisCatalogRow>;
  profile: AnalysisProfile;
  from: string;
  to: string;
  days: number;
  // 영양소별 흔한 한 끼·곁들임 제안(서비스가 미리 고른 것).
  suggestions?: ReadonlyMap<KdriNutrient, string[]>;
  sides?: ReadonlyMap<KdriNutrient, string[]>;
}

/**
 * 하루 섭취량 표시값 — 화면 숫자 모양(formatNutrientAmount: 100 이상 정수·10 이상 소수 첫째·그 아래 둘째)과 같은 자리로
 * 반올림한다. 기준에 못 미치는데 반올림으로 기준과 같아지면 한 자리 더(식이섬유 19.8g 이 '20g / 20g' 으로 보이지 않게).
 */
export const intakeForDisplay = (v: number, reference: number): number => {
  const digits = v < 10 ? 2 : v < 100 ? 1 : 0;
  const r = round(v, digits);
  return v < reference && r >= reference ? round(v, digits + 1) : r;
};

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

  // 영양소 합계 — 먹은 열량 × 기준 행의 열량당 영양소(100g당 값 ÷ 100g당 열량). 기준 행은 항목의 카탈로그 행이
  // 비타민·무기질과 100g당 열량을 가지면 그 행(예전 "먹은 g = 열량 ÷ 100g당 열량 × 100" 과 같은 값), 아니면 영양 기준
  // 음식(refRowsByName). 1인분 무게를 몰라도 되므로 g 환산이 안 되던 행·웹 실측 열량만 있는 이름도 들어온다.
  let energyKcal = 0;
  let nutrientCoveredKcal = 0;
  let produceGapCount = 0;
  let refKcal = 0;
  const refNames = new Map<string, number>();
  // 열량을 몰라 점검에서 빠진 음식(음료·과일·채소 공백은 따로 센다) — 정보 비율의 분모에도 안 들어가 조용히 빠졌다.
  const missingKcalNames: string[] = [];
  const refRows = input.refRowsByName ?? new Map<string, AnalysisCatalogRow>();
  const totals = new Map<KdriNutrient, NutrientTotals>(
    NUTRIENT_DEFS.map((d) => [d.key, { amount: 0, coveredKcal: 0, bySource: new Map() }]),
  );
  for (const it of used) {
    const row = it.foodId ? (rowsById.get(it.foodId) ?? null) : null;
    if (it.kcal === null) {
      if (row?.source === 'mfds-raw' && PRODUCE_RAW_CATEGORIES.has(row.sourceCategory ?? '')) {
        produceGapCount += 1;
      } else if (!isDrinkRow(row, it.dishType)) {
        missingKcalNames.push(it.name);
      }
      continue;
    }
    energyKcal += it.kcal;
    const { drink, ref, hasVitamins, values } = resolveItemNutrients(it, it.kcal, rowsById, refRows);
    if (drink || hasVitamins) nutrientCoveredKcal += it.kcal;
    if (!drink && ref && hasVitamins) {
      refKcal += it.kcal;
      refNames.set(it.name, (refNames.get(it.name) ?? 0) + it.kcal);
    }
    if (
      !drink &&
      row?.source === 'mfds-raw' &&
      PRODUCE_RAW_CATEGORIES.has(row.sourceCategory ?? '') &&
      !hasVitamins
    ) {
      produceGapCount += 1;
    }
    for (const def of NUTRIENT_DEFS) {
      const t = totals.get(def.key)!;
      const value = values.get(def.key);
      if (value === undefined) continue;
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
    const short = a.status === 'low' || a.status === 'borderline';
    return {
      key: def.key,
      label: def.label,
      unit: def.unit,
      intakePerDay: intake === null ? null : intakeForDisplay(intake, a.reference.amount),
      reference: a.reference,
      upperLimit: a.upperLimit,
      percent: a.percent,
      coverage: round(coverage, 2),
      status: a.status,
      supplementCandidate: a.supplementCandidate,
      recordGap: a.recordGap,
      topSources: [...t.bySource.entries()]
        .sort((x, y) => y[1] - x[1])
        .slice(0, TOP_SOURCES)
        .map(([name]) => name),
      foodSuggestions: short ? [...(input.suggestions?.get(def.key) ?? [])] : [],
      sideSuggestions: short ? [...(input.sides?.get(def.key) ?? [])] : [],
      typicalFoods: [...def.typicalFoods],
      note: a.note,
    };
  });

  const notes: string[] = [];
  if (profile.basis === 'default' && !unsupported) {
    notes.push('성별·출생연도를 설정하면 내 기준으로 더 정확히 봐요(지금은 30-49세 성인 기준).');
  }
  if (!insufficient && energyRatio !== null && energyRatio < ENERGY_NOTE_RATIO) {
    notes.push(
      `기록된 열량이 하루 필요량의 ${Math.round(energyRatio * 100)}%예요. 빠진 끼니·간식이 있으면 영양소도 실제보다 적게 보여요.`,
    );
  }
  if (!insufficient && missingKcalNames.length > 0) {
    const names = [...new Set(missingKcalNames)];
    notes.push(
      `열량을 모르는 음식 ${missingKcalNames.length}개(${names.slice(0, 2).join('·')}${names.length > 2 ? ' 등' : ''})는 점검에서 빠졌어요.`,
    );
  }
  if (!insufficient && produceGap) {
    notes.push(
      `과일·채소 기록 ${produceGapCount}개는 아직 영양 정보가 없어 비타민 C·칼륨·식이섬유가 실제보다 적게 잡혔을 수 있어요.`,
    );
  }
  // 비슷한 음식의 영양 구성으로 추정한 몫이 크면 밝힌다(사용자 결정 2026-11-07: 그 몫이 클 때 한 줄).
  if (!insufficient && energyKcal > 0 && refKcal / energyKcal >= REF_NOTE_MIN_SHARE) {
    const top = [...refNames.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
    const examples = top.slice(0, 2).join('·');
    notes.push(
      `${examples}${top.length > 2 ? ' 등' : ''} ${top.length}가지 음식은 비슷한 음식의 영양 구성으로 추정했어요(기록 열량의 ${Math.round((refKcal / energyKcal) * 100)}%).`,
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

/** 음식 제안 후보 한 행 — 카탈로그·어휘에서만 정해지는 값(파싱·1인분 환산)을 미리 계산해 둔다. */
interface SuggestionCandidate {
  name: string;
  nameNorm: string;
  // isExcluded 는 저장된 nameNorm 이 아니라 이름을 다시 정규화한 값으로 비교해 왔다.
  excludeKey: { nameNorm: string; ingredients: string[] };
  allergen: ReturnType<typeof allergenData>;
  dishType: string | null;
  serving: ReturnType<typeof mealServingNutrition>;
  grams: number | null;
  per100: NutrientsPer100g;
}

type SuggestionPool = 'meal' | 'side';
type SuggestionTargets = ReadonlyMap<KdriNutrient, { reference: number; upperLimit: number | null }>;

/**
 * 후보를 영양소별로 줄 세운다(순수) — 1인분(1회 분량)이 기준량의 minShare 이상인 것만 100kcal 당 양 순으로 3개.
 * 1인분이 하루 상한을 넘는 값은 원자료 오류로 보고 뺀다(초밥 니아신 150mg 등). 나트륨은 제안하지 않는다.
 */
const rankSuggestions = (
  pool: readonly SuggestionCandidate[],
  targets: SuggestionTargets,
  minShare: number,
): Map<KdriNutrient, string[]> => {
  const out = new Map<KdriNutrient, string[]>();
  for (const [key, { reference, upperLimit }] of targets) {
    const def = NUTRIENT_DEFS.find((d) => d.key === key)!;
    if (def.key === 'sodium') continue;
    const scored = pool
      .map(({ name, nameNorm, serving, grams, per100 }) => {
        let amount = 0;
        // 가공육의 비타민 C(첨가물일 수 있는 값)로는 권하지 않는다.
        if (isAdditiveNutrientSource(key, nameNorm)) return { name, amount: 0, density: 0 };
        if ('snapshot' in def.from) {
          // 원재료 행은 1인분 단백질이 없다 — 100g당 값 × 1회 분량.
          const p100 = per100[def.from.snapshot];
          amount =
            (def.from.snapshot === 'proteinG' ? serving.proteinG : serving.sodiumMg) ??
            (p100 !== undefined && grams !== null ? (p100 * grams) / 100 : 0);
        } else if (grams !== null) {
          const value = per100[def.from.per100];
          amount = value !== undefined ? (value * grams) / 100 : 0;
        }
        return { name, amount, density: amount / serving.kcal! };
      })
      .filter((s) => s.amount >= reference * minShare && (upperLimit === null || s.amount <= upperLimit))
      .sort((a, b) => b.density - a.density);
    const names: string[] = [];
    for (const s of scored) {
      if (!names.includes(s.name)) names.push(s.name);
      if (names.length >= SUGGESTIONS_PER_NUTRIENT) break;
    }
    out.set(key, names);
  }
  return out;
};

export class MealNutritionService {
  private lexiconCache: { value: Lexicon; at: number } | null = null;
  // 카탈로그 파생 제안 후보(사용자와 무관) — 어휘와 같은 10분 TTL. 요청마다 1,200여 행(영양 JSON 포함)을
  // 읽고 영양소마다 JSON 을 다시 파싱하던 것을 없앤다. 요청에서는 사용자 알레르기·제외·나트륨 필터와 정렬만 한다.
  // 흔한 한 끼(meal)와 흔한 곁들임(side) 두 묶음.
  private readonly poolCache = new Map<SuggestionPool, { at: number; lexicon: Lexicon; list: SuggestionCandidate[] }>();
  private readonly poolLoading = new Map<SuggestionPool, Promise<SuggestionCandidate[]>>();

  constructor(
    private readonly prisma: PrismaClient,
    // 영양 기준 음식 — 없으면(옛 호출부·일부 테스트) 카탈로그 행 자신의 영양소만 쓴다.
    private readonly deps: { refs?: Pick<FoodNutrientRefService, 'resolveIds'> } = {},
  ) {}

  private async lexicon(): Promise<Lexicon> {
    if (this.lexiconCache && Date.now() - this.lexiconCache.at < LEXICON_TTL_MS) {
      return this.lexiconCache.value;
    }
    const value = await loadLexicon(this.prisma);
    this.lexiconCache = { value, at: Date.now() };
    return value;
  }

  private async suggestionPool(kind: SuggestionPool): Promise<SuggestionCandidate[]> {
    const lex = await this.lexicon();
    const cached = this.poolCache.get(kind);
    if (cached && cached.lexicon === lex && Date.now() - cached.at < LEXICON_TTL_MS) return cached.list;
    // 동시에 들어온 첫 요청들은 한 번만 읽는다.
    let loading = this.poolLoading.get(kind);
    if (!loading) {
      loading = (async () => {
        try {
          const list =
            kind === 'meal' ? await this.loadSuggestionCandidates(lex) : await this.loadSideCandidates(lex);
          this.poolCache.set(kind, { at: Date.now(), lexicon: lex, list });
          return list;
        } finally {
          this.poolLoading.delete(kind);
        }
      })();
      this.poolLoading.set(kind, loading);
    }
    return loading;
  }

  /**
   * 흔한 곁들임(common-sides) 후보 — 반찬 1회 분량(카탈로그 값·원재료는 식품군 1회 분량), 모르면 100g. 1회 열량이
   * 무거운 것(SIDE_MAX_KCAL 초과)은 뺀다. 나트륨·알레르기·제외 음식은 요청마다 거른다.
   */
  private async loadSideCandidates(lex: Lexicon): Promise<SuggestionCandidate[]> {
    const sideNorms = [...commonSideNorms(lex)];
    const rows = await this.prisma.foodItem.findMany({
      where: { active: true, nutrientsPer100gJson: { not: null }, nameNorm: { in: sideNorms } },
      select: {
        ...CATALOG_SELECT,
        nameNorm: true,
        ingredientsJson: true,
        allergensJson: true,
        allergenEvidenceJson: true,
        allergenStatus: true,
      },
    });
    const out: SuggestionCandidate[] = [];
    for (const r of rows) {
      const kcal100 = kcalPer100gOf(r);
      if (kcal100 === null || kcal100 <= 0) continue;
      const per100 = parseNutrientsPer100g(r.nutrientsPer100gJson);
      const catalog = mealServingNutrition(r, { isMain: false }, lex);
      const catalogGrams = catalog.kcal !== null && catalog.kcal > 0 ? (catalog.kcal / kcal100) * 100 : null;
      // 1회 양 — 운영자 어휘(portion) → 곁들임 통상 분량(우유 한 컵 등) → 카탈로그 1인분 → 100g.
      const grams =
        foodPortionGrams(lex, r.name) ?? COMMON_SIDE_PORTION_G[r.name] ?? catalogGrams ?? SIDE_DEFAULT_GRAMS;
      const kcal = (kcal100 * grams) / 100;
      if (kcal > SIDE_MAX_KCAL) continue;
      // 1인분 단백질·나트륨은 카탈로그 양 기준이라 1회 양으로 늘리거나 줄인다(없으면 100g당 값으로).
      const scaled = (serving: number | null, key: 'proteinG' | 'sodiumMg'): number | null =>
        serving !== null && catalogGrams !== null
          ? (serving * grams) / catalogGrams
          : per100[key] !== undefined
            ? (per100[key]! * grams) / 100
            : null;
      out.push({
        name: r.name,
        nameNorm: r.nameNorm,
        excludeKey: { nameNorm: normalizeTerm(r.name), ingredients: parseJsonStringArray(r.ingredientsJson) },
        allergen: allergenData(r.name, r.ingredientsJson, r.allergensJson, r.allergenEvidenceJson, r.allergenStatus),
        dishType: r.dishType,
        serving: {
          ...catalog,
          kcal,
          proteinG: scaled(catalog.proteinG, 'proteinG'),
          sodiumMg: scaled(catalog.sodiumMg, 'sodiumMg'),
        },
        grams,
        per100,
      });
    }
    return out;
  }

  private async loadSuggestionCandidates(lex: Lexicon): Promise<SuggestionCandidate[]> {
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
    const out: SuggestionCandidate[] = [];
    for (const r of rows) {
      if (
        !(commonNorms.has(r.nameNorm) || parseJsonStringArray(r.aliasNormsJson).some((a) => commonNorms.has(a))) ||
        !isExplorableCatalogRow(r)
      ) {
        continue;
      }
      const serving = mealServingNutrition(r, { isMain: true }, lex);
      const kcal100 = kcalPer100gOf(r);
      if (serving.kcal === null || serving.kcal <= 0 || (kcal100 ?? 0) >= SUGGESTION_MAX_KCAL_PER_100G) continue;
      out.push({
        name: r.name,
        nameNorm: r.nameNorm,
        excludeKey: { nameNorm: normalizeTerm(r.name), ingredients: parseJsonStringArray(r.ingredientsJson) },
        allergen: allergenData(r.name, r.ingredientsJson, r.allergensJson, r.allergenEvidenceJson, r.allergenStatus),
        dishType: r.dishType,
        serving,
        grams: kcal100 ? (serving.kcal / kcal100) * 100 : null,
        per100: parseNutrientsPer100g(r.nutrientsPer100gJson),
      });
    }
    return out;
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
      e.items.map((i) => ({
        eatenDate: e.eatenDate,
        entryId: e.id,
        name: i.name,
        nameNorm: i.nameNorm,
        foodId: i.foodId,
        dishType: i.dishType,
        kcal: i.kcal,
        proteinG: i.proteinG,
        sodiumMg: i.sodiumMg,
      })),
    );
    const { rowsById, refRowsByName } = await this.catalogFor(items);
    const profile = profileFrom(preference.sex, preference.birthYear, today);
    const base = analyzeMealNutrition({
      items,
      rowsById,
      refRowsByName,
      profile,
      from,
      to: today,
      days,
    });
    const wanted = base.nutrients.filter((n) => n.status === 'low' || n.status === 'borderline');
    if (wanted.length === 0) return base;
    const targets: SuggestionTargets = new Map(
      wanted.map((n) => [n.key, { reference: n.reference.amount, upperLimit: n.upperLimit }]),
    );
    const avoid = [...preference.excludedFoods, ...preference.dislikedFoods];
    const opts = { sodiumHigh: base.nutrients.some((n) => n.key === 'sodium' && n.status === 'high') };
    const [meals, sides] = await Promise.all([
      this.foodSuggestions(targets, preference.allergens, avoid, opts),
      this.sideSuggestions(targets, preference.allergens, avoid, opts),
    ]);
    return {
      ...base,
      nutrients: base.nutrients.map((n) =>
        meals.has(n.key) || sides.has(n.key)
          ? {
              ...n,
              foodSuggestions: meals.get(n.key) ?? n.foodSuggestions,
              sideSuggestions: sides.get(n.key) ?? n.sideSuggestions,
            }
          : n,
      ),
    };
  }

  /**
   * 항목들의 카탈로그 행과 영양 기준 음식 행 — 영양소 점검과 통계(묶음별 몫·영양소별 하루 평균)가 같이 쓴다.
   * macros: 탄수화물·지방을 빌릴 기준 음식도(통계만 — 점검은 탄단지를 보지 않는다).
   */
  async catalogFor(
    items: readonly AnalysisItem[],
    opts: { macros?: boolean } = {},
  ): Promise<{
    rowsById: Map<string, AnalysisCatalogRow>;
    refRowsByName: Map<string, AnalysisCatalogRow>;
    macroRowsByName: Map<string, AnalysisCatalogRow>;
  }> {
    const ids = [...new Set(items.map((i) => i.foodId).filter((id): id is string => !!id))];
    const rows = ids.length
      ? await this.prisma.foodItem.findMany({ where: { id: { in: ids } }, select: CATALOG_SELECT })
      : [];
    const rowsById = new Map<string, AnalysisCatalogRow>(rows.map((r) => [r.id, r]));
    const [refRowsByName, macroRowsByName] = await Promise.all([
      this.refRows(items, rowsById),
      opts.macros ? this.macroRefRows(items, rowsById) : Promise.resolve(new Map<string, AnalysisCatalogRow>()),
    ]);
    return { rowsById, refRowsByName, macroRowsByName };
  }

  /**
   * 영양 기준 음식 행 — 비타민·무기질이 없는 카탈로그 행(이름)과 카탈로그 밖 항목 이름을 기준 음식에 잇는다.
   * 열량이 없는 항목·음료는 점검에서 어차피 빠지거나 0 으로 세므로 묻지 않는다.
   */
  private async refRows(
    items: readonly AnalysisItem[],
    rowsById: ReadonlyMap<string, AnalysisCatalogRow>,
  ): Promise<Map<string, AnalysisCatalogRow>> {
    const out = new Map<string, AnalysisCatalogRow>();
    if (!this.deps.refs) return out;
    const targets: NutrientRefTarget[] = [];
    for (const it of items) {
      if (it.kcal === null) continue;
      const row = it.foodId ? rowsById.get(it.foodId) : undefined;
      if (row) {
        if (isNutrientProfileRow(row) || isDrinkRow(row, it.dishType) || !row.nameNorm) continue;
        targets.push({ name: row.name, nameNorm: row.nameNorm, dishType: row.dishType, nutritionFrom: row.nutritionFrom });
      } else if (!isDrinkRow(null, it.dishType)) {
        targets.push({ name: it.name, nameNorm: it.nameNorm || normalizeTerm(it.name), dishType: it.dishType, nutritionFrom: null });
      }
    }
    return this.rowsForRefs(await this.deps.refs.resolveIds(targets));
  }

  /**
   * 탄수화물·지방 기준 음식 행 — 탄단지(1인분 탄수화물·지방·열량)를 모르는 카탈로그 행과 카탈로그 밖 이름을 탄단지를 아는
   * 기준 음식에 잇는다. 비타민 기준과 달리 행 자신이 비타민을 가져도 묻는다(공기밥 ← 쌀밥: 비타민만 빌려 와 탄단지가 비었다).
   */
  private async macroRefRows(
    items: readonly AnalysisItem[],
    rowsById: ReadonlyMap<string, AnalysisCatalogRow>,
  ): Promise<Map<string, AnalysisCatalogRow>> {
    if (!this.deps.refs) return new Map();
    const targets: NutrientRefTarget[] = [];
    for (const it of items) {
      if (it.kcal === null) continue;
      const row = it.foodId ? rowsById.get(it.foodId) : undefined;
      if (row) {
        if (hasMacroGrams(row) || isDrinkRow(row, it.dishType) || !row.nameNorm) continue;
        targets.push({ name: row.name, nameNorm: row.nameNorm, dishType: row.dishType, nutritionFrom: row.nutritionFrom });
      } else if (!isDrinkRow(null, it.dishType)) {
        targets.push({ name: it.name, nameNorm: it.nameNorm || normalizeTerm(it.name), dishType: it.dishType, nutritionFrom: null });
      }
    }
    if (targets.length === 0) return new Map();
    return this.rowsForRefs(await this.deps.refs.resolveIds(targets, { macros: true }));
  }

  /** 이름 → 기준 음식 id 를 이름 → 행으로. */
  private async rowsForRefs(ids: ReadonlyMap<string, string>): Promise<Map<string, AnalysisCatalogRow>> {
    const out = new Map<string, AnalysisCatalogRow>();
    if (ids.size === 0) return out;
    const refRows = await this.prisma.foodItem.findMany({
      where: { id: { in: [...new Set(ids.values())] } },
      select: CATALOG_SELECT,
    });
    const byId = new Map(refRows.map((r) => [r.id, r]));
    for (const [nameNorm, id] of ids) {
      const r = byId.get(id);
      if (r) out.set(nameNorm, r);
    }
    return out;
  }

  /**
   * 부족한 영양소가 열량에 비해 많은 흔한 한 끼(common-meals) — 100kcal 당 양으로 줄 세우되 1인분이 기준량의 25% 는
   * 채워야 하고, 1인분 나트륨 1,500mg 이상인 국물·찌개는 뺀다(1인분 양으로만 세면 짬뽕·불고기전골·족발처럼 양 많고
   * 짠 음식이 위로 왔다). 나트륨을 이미 많이 먹는 사람에겐 국물 요리를 빼고 800mg 로 낮춘다. 1인분이 하루 상한을
   * 넘는 값은 원자료 오류로 보고 뺀다(초밥 니아신 150mg 등). 알레르기·제외·덜 선호 음식도 뺀다. 음식으로 먼저
   * 채우자는 제안의 근거라 끼니 추천 후보가 될 수 있는 행만 본다.
   */
  async foodSuggestions(
    targets: SuggestionTargets,
    allergens: readonly MealAllergenType[],
    avoid: string[],
    opts: { sodiumHigh: boolean } = { sodiumHigh: false },
  ): Promise<Map<KdriNutrient, string[]>> {
    const sodiumCap = opts.sodiumHigh ? SUGGESTION_MAX_SODIUM_MG_WHEN_HIGH : SUGGESTION_MAX_SODIUM_MG;
    const servings = (await this.suggestionPool('meal')).filter(
      (c) =>
        !hitsUserAllergen(c.allergen, allergens) &&
        !isExcluded(c.excludeKey, avoid) &&
        (c.serving.sodiumMg ?? 0) < sodiumCap &&
        !(opts.sodiumHigh && (SOUP_DISH_TYPES.has(c.dishType ?? '') || SOUP_NAME_RE.test(c.nameNorm))),
    );
    return rankSuggestions(servings, targets, SUGGESTION_MIN_SHARE);
  }

  /**
   * 부족한 영양소를 곁들임(common-sides: 과일·나물·유제품…)으로 — 1회 분량이 기준량의 15% 이상인 것만 100kcal 당 양
   * 순으로. 1회 나트륨 600mg(나트륨이 많으면 300mg) 이상은 빼고, 알레르기·제외·덜 선호 음식도 뺀다.
   */
  async sideSuggestions(
    targets: SuggestionTargets,
    allergens: readonly MealAllergenType[],
    avoid: string[],
    opts: { sodiumHigh: boolean } = { sodiumHigh: false },
  ): Promise<Map<KdriNutrient, string[]>> {
    const sodiumCap = opts.sodiumHigh ? SIDE_MAX_SODIUM_MG_WHEN_HIGH : SIDE_MAX_SODIUM_MG;
    const sides = (await this.suggestionPool('side')).filter(
      (c) =>
        !hitsUserAllergen(c.allergen, allergens) &&
        !isExcluded(c.excludeKey, avoid) &&
        (c.serving.sodiumMg ?? 0) < sodiumCap,
    );
    return rankSuggestions(sides, targets, SIDE_MIN_SHARE);
  }
}

const CATALOG_SELECT = {
  id: true,
  name: true,
  nameNorm: true,
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
  carbG: true,
  fatG: true,
  sugarG: true,
} as const;
