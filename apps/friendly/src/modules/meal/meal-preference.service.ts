import type { MealPreference as PrismaMealPreference, PrismaClient } from '@prisma/client';
import {
  MEAL_DEFAULT_WEIGHTS,
  MealSlot,
  MealType,
  MealWeights,
  type MealPreferenceType,
  type MealSlotType,
  type MealTypeType,
  type MealWeightsType,
  type UpdateMealPreferenceInputType,
} from '@repo/api-contract';
import { normalizeTerm } from '../../lib/text.js';
import { mealMutationBarrier } from './meal-mutation-barrier.js';

// 선호 설정 — 사용자당 1행(AirUserLocation 과 같은 PUT 덮어쓰기). 행이 없으면 기본값을 합성해
// 돌려주므로 클라이언트는 "설정 안 함" 분기를 몰라도 된다(onboarded=false 로만 구분).

const DEFAULT_SLOTS: MealSlotType[] = ['breakfast', 'lunch', 'dinner'];

const parseJsonArray = (json: string | null | undefined): string[] => {
  if (!json) return [];
  try {
    const v: unknown = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
};

export interface MealFoodPreferenceLists {
  excludedFoods: string[];
  dislikedFoods: string[];
  likedFoods: string[];
}

const uniqueFoodTerms = (values: readonly string[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = raw.trim();
    const norm = normalizeTerm(value);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    out.push(value);
    if (out.length >= 50) break;
  }
  return out;
};

/** 같은 음식이 여러 목록에 있으면 절대 제외 > 덜 선호 > 좋아요 순으로 하나만 남긴다. */
export const normalizeMealFoodPreferences = (
  input: MealFoodPreferenceLists,
): MealFoodPreferenceLists => {
  const excludedFoods = uniqueFoodTerms(input.excludedFoods);
  const excludedNorms = new Set(excludedFoods.map(normalizeTerm));
  const dislikedFoods = uniqueFoodTerms(input.dislikedFoods).filter(
    (food) => !excludedNorms.has(normalizeTerm(food)),
  );
  const dislikedNorms = new Set(dislikedFoods.map(normalizeTerm));
  const likedFoods = uniqueFoodTerms(input.likedFoods).filter((food) => {
    const norm = normalizeTerm(food);
    return !excludedNorms.has(norm) && !dislikedNorms.has(norm);
  });
  return { excludedFoods, dislikedFoods, likedFoods };
};

export const parseWeights = (json: string | null | undefined): MealWeightsType => {
  if (!json) return { ...MEAL_DEFAULT_WEIGHTS };
  try {
    const parsed = MealWeights.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : { ...MEAL_DEFAULT_WEIGHTS };
  } catch {
    return { ...MEAL_DEFAULT_WEIGHTS };
  }
};

export const toMealPreference = (row: PrismaMealPreference | null): MealPreferenceType => {
  const foodPreferences = normalizeMealFoodPreferences({
    excludedFoods: parseJsonArray(row?.excludedFoodsJson),
    dislikedFoods: parseJsonArray(row?.dislikedFoodsJson),
    likedFoods: parseJsonArray(row?.likedFoodsJson),
  });
  return {
    weights: parseWeights(row?.weightsJson),
    ...foodPreferences,
    mealTypes: parseJsonArray(row?.mealTypesJson).filter((v): v is MealTypeType => MealType.safeParse(v).success),
    slots: (() => {
      const parsed = parseJsonArray(row?.slotsJson).filter((v): v is MealSlotType => MealSlot.safeParse(v).success);
      return parsed.length > 0 ? parsed : [...DEFAULT_SLOTS];
    })(),
    onboarded: row?.onboarded ?? false,
    updatedAt: row?.updatedAt?.toISOString() ?? new Date(0).toISOString(),
  };
};

export class MealPreferenceService {
  constructor(private readonly prisma: PrismaClient) {}

  async get(userId: string): Promise<MealPreferenceType> {
    const row = await this.prisma.mealPreference.findUnique({ where: { userId } });
    return toMealPreference(row);
  }

  async update(userId: string, input: UpdateMealPreferenceInputType): Promise<MealPreferenceType> {
    return mealMutationBarrier.runExclusive(userId, () => this.updateUnlocked(userId, input));
  }

  private async updateUnlocked(userId: string, input: UpdateMealPreferenceInputType): Promise<MealPreferenceType> {
    const current = await this.prisma.mealPreference.findUnique({ where: { userId } });
    const foodPreferences = normalizeMealFoodPreferences({
      excludedFoods: input.excludedFoods ?? parseJsonArray(current?.excludedFoodsJson),
      dislikedFoods: input.dislikedFoods ?? parseJsonArray(current?.dislikedFoodsJson),
      likedFoods: input.likedFoods ?? parseJsonArray(current?.likedFoodsJson),
    });
    const merged = {
      weightsJson: JSON.stringify(input.weights ?? parseWeights(current?.weightsJson)),
      excludedFoodsJson: JSON.stringify(foodPreferences.excludedFoods),
      dislikedFoodsJson: JSON.stringify(foodPreferences.dislikedFoods),
      likedFoodsJson: JSON.stringify(foodPreferences.likedFoods),
      mealTypesJson: JSON.stringify(input.mealTypes ?? parseJsonArray(current?.mealTypesJson)),
      slotsJson: JSON.stringify(input.slots ?? (parseJsonArray(current?.slotsJson).length > 0 ? parseJsonArray(current?.slotsJson) : DEFAULT_SLOTS)),
      onboarded: input.onboarded ?? current?.onboarded ?? false,
    };
    const row = await this.prisma.mealPreference.upsert({
      where: { userId },
      create: { userId, ...merged },
      update: merged,
    });
    return toMealPreference(row);
  }
}
