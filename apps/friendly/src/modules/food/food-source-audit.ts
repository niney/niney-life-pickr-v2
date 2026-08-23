import type { FoodItem as PrismaFoodItem, Prisma, PrismaClient } from '@prisma/client';
import {
  FoodMergeConflictField,
  FoodObservedValue,
  type FoodMergeConflictFieldType,
  type FoodObservedValueType,
  type FoodSourceObservationFieldType,
} from '@repo/api-contract';
import type { FoodSeed } from './food-import.service.js';
import { parseJsonStringArray } from './food.service.js';

// FoodItem의 대표값과 달라도 외부 소스가 보낸 값을 버리지 않는 감사 레이어.
// 같은 source/sourceId/field/value는 월간 재적재에서 다시 늘어나지 않게 응용 단에서
// 디듀프한다. DB 모델에 유니크 키를 걸지 않은 것은 이후 필드별 정규화 정책을 바꾸어도
// 기존 관측을 잃지 않기 위함이다.

type FoodAuditClient = PrismaClient | Prisma.TransactionClient;

export interface FoodSeedObservation {
  field: FoodSourceObservationFieldType;
  value: FoodObservedValueType;
  valueJson: string;
}

const canonicalString = (value: string): string => value.replace(/\s+/g, ' ').trim();

const canonicalStringArray = (values: string[]): string[] =>
  [...new Set(values.map(canonicalString).filter((value) => value.length > 0))].sort((a, b) =>
    a.localeCompare(b, 'ko'),
  );

const canonicalNumber = (value: number): number | null =>
  Number.isFinite(value) ? Number(value.toFixed(6)) : null;

export const canonicalObservedValue = (value: unknown): FoodObservedValueType | null => {
  if (typeof value === 'string') {
    const normalized = canonicalString(value);
    return normalized.length > 0 ? normalized : null;
  }
  if (typeof value === 'number') return canonicalNumber(value);
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
    const normalized = canonicalStringArray(value);
    return normalized.length > 0 ? normalized : null;
  }
  return null;
};

export const observedValueJson = (value: FoodObservedValueType): string => JSON.stringify(value);

const makeObservation = (
  field: FoodSourceObservationFieldType,
  raw: unknown,
): FoodSeedObservation | null => {
  const value = canonicalObservedValue(raw);
  return value === null ? null : { field, value, valueJson: observedValueJson(value) };
};

export const collectFoodSeedObservations = (seed: FoodSeed): FoodSeedObservation[] => {
  const nutrition = seed.nutrition;
  const candidates: Array<FoodSeedObservation | null> = [
    makeObservation('name', seed.name),
    makeObservation('repName', seed.repName),
    makeObservation('aliases', seed.aliases),
    makeObservation('dishType', seed.dishType),
    makeObservation('mainIngredient', seed.mainIngredient),
    makeObservation('cuisine', seed.cuisine),
    makeObservation('ingredients', seed.ingredients),
    makeObservation('servingG', seed.servingG),
    makeObservation('kcal', nutrition?.kcal),
    makeObservation('carbG', nutrition?.carbG),
    makeObservation('proteinG', nutrition?.proteinG),
    makeObservation('fatG', nutrition?.fatG),
    makeObservation('sodiumMg', nutrition?.sodiumMg),
    makeObservation('sugarG', nutrition?.sugarG),
    makeObservation('sourceCategory', seed.sourceCategory),
    // 0도 소스가 제공한 명시적 값이므로 관측으로 남긴다.
    seed.popularity === undefined ? null : makeObservation('popularity', seed.popularity),
  ];
  return candidates.filter((item): item is FoodSeedObservation => item !== null);
};

export const parseObservedValueJson = (raw: string): FoodObservedValueType => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('저장된 소스 관측 값을 해석할 수 없습니다');
  }
  const result = FoodObservedValue.safeParse(parsed);
  if (!result.success) throw new Error('저장된 소스 관측 값의 형식이 올바르지 않습니다');
  return result.data;
};

export const serializeFoodItemField = (
  row: PrismaFoodItem,
  field: FoodMergeConflictFieldType,
): string | null => {
  let raw: unknown;
  switch (field) {
    case 'repName':
      raw = row.repName;
      break;
    case 'dishType':
      raw = row.dishType;
      break;
    case 'mainIngredient':
      raw = row.mainIngredient;
      break;
    case 'cuisine':
      raw = row.cuisine;
      break;
    case 'ingredients':
      raw = row.ingredientsJson === null ? null : parseJsonStringArray(row.ingredientsJson);
      break;
    case 'servingG':
      raw = row.servingG;
      break;
    case 'kcal':
      raw = row.kcal;
      break;
    case 'carbG':
      raw = row.carbG;
      break;
    case 'proteinG':
      raw = row.proteinG;
      break;
    case 'fatG':
      raw = row.fatG;
      break;
    case 'sodiumMg':
      raw = row.sodiumMg;
      break;
    case 'sugarG':
      raw = row.sugarG;
      break;
    case 'sourceCategory':
      raw = row.sourceCategory;
      break;
  }
  const value = canonicalObservedValue(raw);
  return value === null ? null : observedValueJson(value);
};

export interface FoodAuditResult {
  observationsCreated: number;
  conflictsCreated: number;
}

export const auditIncomingFoodSeed = async (
  prisma: FoodAuditClient,
  foodItem: PrismaFoodItem,
  seed: FoodSeed,
): Promise<FoodAuditResult> => {
  const candidates = collectFoodSeedObservations(seed);
  if (candidates.length === 0) return { observationsCreated: 0, conflictsCreated: 0 };

  const sourceId = seed.sourceId ?? null;
  const existingObservations = await prisma.foodSourceObservation.findMany({
    where: { foodItemId: foodItem.id, source: seed.source, sourceId },
    select: { field: true, valueJson: true },
  });
  const observed = new Set(
    existingObservations.map((item) => `${item.field}\u0000${item.valueJson}`),
  );
  const observationData = candidates
    .filter((item) => !observed.has(`${item.field}\u0000${item.valueJson}`))
    .map((item) => ({
      foodItemId: foodItem.id,
      field: item.field,
      valueJson: item.valueJson,
      source: seed.source,
      sourceId,
    }));
  if (observationData.length > 0) {
    await prisma.foodSourceObservation.createMany({ data: observationData });
  }

  const conflictCandidates = candidates.flatMap((item) => {
    const parsedField = FoodMergeConflictField.safeParse(item.field);
    if (!parsedField.success) return [];
    const existingValueJson = serializeFoodItemField(foodItem, parsedField.data);
    if (existingValueJson === null || existingValueJson === item.valueJson) return [];
    return [
      {
        field: parsedField.data,
        existingValueJson,
        incomingValueJson: item.valueJson,
      },
    ];
  });

  let conflictsCreated = 0;
  if (conflictCandidates.length > 0) {
    // 이미 결정한 동일 대안을 매월 다시 열지 않는다. 소스별 추적은 위의
    // FoodSourceObservation에 따로 남으므로 충돌 큐는 대표값/대안 쌍으로 접는다.
    const prior = await prisma.foodMergeConflict.findMany({
      where: {
        foodItemId: foodItem.id,
        OR: conflictCandidates.map((item) => ({
          field: item.field,
          existingValueJson: item.existingValueJson,
          incomingValueJson: item.incomingValueJson,
        })),
      },
      select: { field: true, existingValueJson: true, incomingValueJson: true },
    });
    const priorKeys = new Set(
      prior.map(
        (item) => `${item.field}\u0000${item.existingValueJson}\u0000${item.incomingValueJson}`,
      ),
    );
    const createData = conflictCandidates
      .filter(
        (item) =>
          !priorKeys.has(
            `${item.field}\u0000${item.existingValueJson}\u0000${item.incomingValueJson}`,
          ),
      )
      .map((item) => ({
        foodItemId: foodItem.id,
        field: item.field,
        existingValueJson: item.existingValueJson,
        incomingValueJson: item.incomingValueJson,
        source: seed.source,
        sourceId,
      }));
    if (createData.length > 0) {
      await prisma.foodMergeConflict.createMany({ data: createData });
      conflictsCreated = createData.length;
    }
  }

  return { observationsCreated: observationData.length, conflictsCreated };
};
