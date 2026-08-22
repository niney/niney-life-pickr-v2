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

export const parseWeights = (json: string | null | undefined): MealWeightsType => {
  if (!json) return { ...MEAL_DEFAULT_WEIGHTS };
  try {
    const parsed = MealWeights.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : { ...MEAL_DEFAULT_WEIGHTS };
  } catch {
    return { ...MEAL_DEFAULT_WEIGHTS };
  }
};

export const toMealPreference = (row: PrismaMealPreference | null): MealPreferenceType => ({
  weights: parseWeights(row?.weightsJson),
  excludedFoods: parseJsonArray(row?.excludedFoodsJson),
  likedFoods: parseJsonArray(row?.likedFoodsJson),
  mealTypes: parseJsonArray(row?.mealTypesJson).filter((v): v is MealTypeType => MealType.safeParse(v).success),
  slots: (() => {
    const parsed = parseJsonArray(row?.slotsJson).filter((v): v is MealSlotType => MealSlot.safeParse(v).success);
    return parsed.length > 0 ? parsed : [...DEFAULT_SLOTS];
  })(),
  onboarded: row?.onboarded ?? false,
  updatedAt: row?.updatedAt?.toISOString() ?? new Date(0).toISOString(),
});

export class MealPreferenceService {
  constructor(private readonly prisma: PrismaClient) {}

  async get(userId: string): Promise<MealPreferenceType> {
    const row = await this.prisma.mealPreference.findUnique({ where: { userId } });
    return toMealPreference(row);
  }

  async update(userId: string, input: UpdateMealPreferenceInputType): Promise<MealPreferenceType> {
    const current = await this.prisma.mealPreference.findUnique({ where: { userId } });
    const merged = {
      weightsJson: JSON.stringify(input.weights ?? parseWeights(current?.weightsJson)),
      excludedFoodsJson: JSON.stringify(input.excludedFoods ?? parseJsonArray(current?.excludedFoodsJson)),
      likedFoodsJson: JSON.stringify(input.likedFoods ?? parseJsonArray(current?.likedFoodsJson)),
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
