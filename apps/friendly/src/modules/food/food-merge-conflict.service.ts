import type {
  FoodMergeConflict as PrismaFoodMergeConflict,
  FoodSourceObservation as PrismaFoodSourceObservation,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import {
  FoodCuisine,
  FoodDishType,
  FoodMainIngredient,
  FoodMergeConflictField,
  FoodSource,
  FoodSourceObservationField,
  type FoodMergeConflictActionType,
  type FoodMergeConflictFieldType,
  type FoodMergeConflictItemType,
  type FoodMergeConflictListQueryType,
  type FoodMergeConflictListResultType,
  type FoodMergeConflictStatusType,
  type FoodObservedValueType,
  type FoodSourceObservationType,
} from '@repo/api-contract';
import { parseObservedValueJson, serializeFoodItemField } from './food-source-audit.js';

export class FoodMergeConflictError extends Error {
  constructor(
    readonly code: 'not_found' | 'already_resolved' | 'stale' | 'invalid',
    message: string,
  ) {
    super(message);
    this.name = 'FoodMergeConflictError';
  }
}

type ConflictWithFood = PrismaFoodMergeConflict & {
  foodItem: { id: string; name: string };
};

const parseSource = (raw: string) => {
  const result = FoodSource.safeParse(raw);
  if (!result.success) {
    throw new FoodMergeConflictError('invalid', `알 수 없는 음식 출처입니다: ${raw}`);
  }
  return result.data;
};

const toObservation = (row: PrismaFoodSourceObservation): FoodSourceObservationType | null => {
  const field = FoodSourceObservationField.safeParse(row.field);
  if (!field.success) return null;
  try {
    return {
      id: row.id,
      field: field.data,
      value: parseObservedValueJson(row.valueJson),
      source: parseSource(row.source),
      sourceId: row.sourceId,
      observedAt: row.observedAt.toISOString(),
    };
  } catch {
    // 손상된 이전 관측 1건이 전체 검토 큐를 가리지 않게 한다.
    return null;
  }
};

const pairKey = (foodItemId: string, field: string): string => `${foodItemId}\u0000${field}`;

const buildUpdateData = (
  field: FoodMergeConflictFieldType,
  value: FoodObservedValueType,
): Prisma.FoodItemUpdateInput => {
  const requireString = (): string => {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new FoodMergeConflictError('invalid', '문자열 필드의 대안 값이 올바르지 않습니다');
    }
    return value.trim();
  };
  const requireNumber = (positive = false): number => {
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < 0 ||
      (positive && value <= 0)
    ) {
      throw new FoodMergeConflictError('invalid', '숫자 필드의 대안 값이 올바르지 않습니다');
    }
    return value;
  };

  switch (field) {
    case 'repName':
      return { repName: requireString() };
    case 'dishType': {
      const parsed = FoodDishType.safeParse(requireString());
      if (!parsed.success) throw new FoodMergeConflictError('invalid', '알 수 없는 조리형태입니다');
      return { dishType: parsed.data };
    }
    case 'mainIngredient': {
      const parsed = FoodMainIngredient.safeParse(requireString());
      if (!parsed.success) throw new FoodMergeConflictError('invalid', '알 수 없는 주재료입니다');
      return { mainIngredient: parsed.data };
    }
    case 'cuisine': {
      const parsed = FoodCuisine.safeParse(requireString());
      if (!parsed.success)
        throw new FoodMergeConflictError('invalid', '알 수 없는 요리 계통입니다');
      return { cuisine: parsed.data };
    }
    case 'ingredients': {
      if (
        !Array.isArray(value) ||
        value.length === 0 ||
        value.length > 40 ||
        value.some((item) => item.trim().length === 0 || item.length > 120)
      ) {
        throw new FoodMergeConflictError('invalid', '재료 대안 값이 올바르지 않습니다');
      }
      return { ingredientsJson: JSON.stringify(value) };
    }
    case 'servingG':
      return { servingG: requireNumber(true) };
    case 'kcal':
      return { kcal: requireNumber() };
    case 'carbG':
      return { carbG: requireNumber() };
    case 'proteinG':
      return { proteinG: requireNumber() };
    case 'fatG':
      return { fatG: requireNumber() };
    case 'sodiumMg':
      return { sodiumMg: requireNumber() };
    case 'sugarG':
      return { sugarG: requireNumber() };
    case 'sourceCategory':
      return { sourceCategory: requireString() };
  }
};

export class FoodMergeConflictService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(query: FoodMergeConflictListQueryType): Promise<FoodMergeConflictListResultType> {
    const where: Prisma.FoodMergeConflictWhereInput = { status: query.status };
    const [rows, total] = await Promise.all([
      this.prisma.foodMergeConflict.findMany({
        where,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: query.offset,
        take: query.limit,
        include: { foodItem: { select: { id: true, name: true } } },
      }),
      this.prisma.foodMergeConflict.count({ where }),
    ]);
    return { items: await this.enrich(rows), total };
  }

  async resolve(
    id: string,
    action: FoodMergeConflictActionType,
    actorUserId: string,
  ): Promise<FoodMergeConflictItemType> {
    await this.prisma.$transaction(async (tx) => {
      const conflict = await tx.foodMergeConflict.findUnique({
        where: { id },
        include: { foodItem: true },
      });
      if (!conflict) throw new FoodMergeConflictError('not_found', '병합 충돌을 찾을 수 없습니다');
      if (conflict.status !== 'open') {
        throw new FoodMergeConflictError('already_resolved', '이미 해결된 병합 충돌입니다');
      }
      const parsedField = FoodMergeConflictField.safeParse(conflict.field);
      if (!parsedField.success) {
        throw new FoodMergeConflictError('invalid', '수정을 허용하지 않는 카탈로그 필드입니다');
      }

      // dismiss는 현재 대표값과 무관하게 큐에서만 제거한다. keep/accept는 큐가
      // 생긴 뒤 다른 관리자가 필드를 수정했을 수 있으므로 optimistic baseline을 검사한다.
      if (action !== 'dismiss') {
        const currentValueJson = serializeFoodItemField(conflict.foodItem, parsedField.data);
        if (currentValueJson !== conflict.existingValueJson) {
          throw new FoodMergeConflictError(
            'stale',
            '카탈로그 값이 이미 바뀌었습니다. 목록을 새로고침한 뒤 다시 확인해 주세요',
          );
        }
      }

      const resolvedAt = new Date();
      const status: FoodMergeConflictStatusType =
        action === 'keep_existing'
          ? 'kept_existing'
          : action === 'accept_incoming'
            ? 'accepted_incoming'
            : 'dismissed';
      const resolutionJson = JSON.stringify({
        action,
        actorUserId,
        resolvedAt: resolvedAt.toISOString(),
      });

      if (action === 'accept_incoming') {
        const incoming = parseObservedValueJson(conflict.incomingValueJson);
        const data = buildUpdateData(parsedField.data, incoming);
        await tx.foodItem.update({ where: { id: conflict.foodItemId }, data });
      }

      const claimed = await tx.foodMergeConflict.updateMany({
        where: { id, status: 'open' },
        data: { status, resolutionJson, resolvedAt },
      });
      if (claimed.count !== 1) {
        throw new FoodMergeConflictError('already_resolved', '이미 해결된 병합 충돌입니다');
      }

      if (action === 'accept_incoming') {
        // 같은 값을 제안한 중복 큐만 닫는다. 다른 대안은 새 대표값을 baseline으로 다시
        // 맞춰 open 상태를 유지해야 운영자의 미검토 의사결정이 사라지지 않는다.
        await tx.foodMergeConflict.updateMany({
          where: {
            foodItemId: conflict.foodItemId,
            field: conflict.field,
            status: 'open',
            id: { not: id },
            incomingValueJson: conflict.incomingValueJson,
          },
          data: {
            status: 'dismissed',
            resolvedAt,
            resolutionJson: JSON.stringify({
              action: 'dismiss',
              reason: 'superseded_by_accept',
              conflictId: id,
              actorUserId,
              resolvedAt: resolvedAt.toISOString(),
            }),
          },
        });
        await tx.foodMergeConflict.updateMany({
          where: {
            foodItemId: conflict.foodItemId,
            field: conflict.field,
            status: 'open',
            id: { not: id },
            incomingValueJson: { not: conflict.incomingValueJson },
          },
          data: {
            existingValueJson: conflict.incomingValueJson,
            resolutionJson: null,
            resolvedAt: null,
          },
        });
      }
    });

    return this.get(id);
  }

  private async get(id: string): Promise<FoodMergeConflictItemType> {
    const row = await this.prisma.foodMergeConflict.findUnique({
      where: { id },
      include: { foodItem: { select: { id: true, name: true } } },
    });
    if (!row) throw new FoodMergeConflictError('not_found', '병합 충돌을 찾을 수 없습니다');
    const [item] = await this.enrich([row]);
    if (!item) throw new FoodMergeConflictError('not_found', '병합 충돌을 찾을 수 없습니다');
    return item;
  }

  private async enrich(rows: ConflictWithFood[]): Promise<FoodMergeConflictItemType[]> {
    if (rows.length === 0) return [];
    const pairs = [
      ...new Map(
        rows.map((row) => [
          pairKey(row.foodItemId, row.field),
          { foodItemId: row.foodItemId, field: row.field },
        ]),
      ).values(),
    ];
    const observations = await this.prisma.foodSourceObservation.findMany({
      where: { OR: pairs },
      orderBy: [{ observedAt: 'desc' }, { id: 'desc' }],
      // 페이지 최대 100건 × 항목당 최대 20건. 보통은 source 4~6건이다.
      take: Math.min(2_000, Math.max(100, pairs.length * 20)),
    });
    const observationsByPair = new Map<string, FoodSourceObservationType[]>();
    for (const observation of observations) {
      const mapped = toObservation(observation);
      if (!mapped) continue;
      const key = pairKey(observation.foodItemId, observation.field);
      const list = observationsByPair.get(key) ?? [];
      if (list.length < 20) list.push(mapped);
      observationsByPair.set(key, list);
    }

    return rows.map((row) => {
      const field = FoodMergeConflictField.safeParse(row.field);
      if (!field.success) {
        throw new FoodMergeConflictError('invalid', `알 수 없는 충돌 필드입니다: ${row.field}`);
      }
      return {
        id: row.id,
        foodItem: row.foodItem,
        field: field.data,
        existingValue: parseObservedValueJson(row.existingValueJson),
        incomingValue: parseObservedValueJson(row.incomingValueJson),
        source: parseSource(row.source),
        sourceId: row.sourceId,
        status: row.status as FoodMergeConflictStatusType,
        createdAt: row.createdAt.toISOString(),
        resolvedAt: row.resolvedAt?.toISOString() ?? null,
        observations: observationsByPair.get(pairKey(row.foodItemId, row.field)) ?? [],
      };
    });
  }
}
