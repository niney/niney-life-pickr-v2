import type {
  MealEntry as PrismaMealEntry,
  MealItem as PrismaMealItem,
  MealPhoto as PrismaMealPhoto,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import {
  FoodCuisine,
  FoodDishType,
  FoodMainIngredient,
  MEAL_MAX_ITEMS_PER_ENTRY,
  MealEntrySource,
  MealItemSource,
  MealNutritionBasis,
  MealPortion,
  MealPortionSource,
  MealSlot,
  MealType,
  RecognizedDish,
  type CreateMealEntryInputType,
  type FoodCuisineType,
  type FoodDishTypeType,
  type FoodMainIngredientType,
  type ListMealEntriesQueryType,
  type ListMealEntriesResultType,
  type MealCalendarResultType,
  type MealEntryType,
  type MealItemInputType,
  type MealItemType,
  type MealTimePresetsResultType,
  type RecentMealItemResultType,
  type MealPhotoType,
  type MealSlotType,
  type UpdateMealEntryInputType,
} from '@repo/api-contract';
import {
  MEAL_SLOTS,
  MEAL_SLOT_DEFAULT_TIME,
  formatTimeOfDay,
  mealPortionFactor,
  monthRange,
  parseTimeOfDay,
} from '@repo/utils';
import { normalizeTerm } from '../../lib/text.js';
import { FoodService } from '../food/food.service.js';
import {
  findMealRecommendationCandidate,
  parseMealRecommendationFeedback,
  parseMealRecommendationItems,
} from '../meal-recommendation/meal-recommendation.feedback.js';
import { mealMutationBarrier } from './meal-mutation-barrier.js';
import type { MealPhotoFileRef, MealPhotoService } from './meal-photo.service.js';

// 식단 기록 CRUD — 전부 소유자(userId) 스코프. 항목은 저장 시 카탈로그에 매칭해 분류 스냅샷을
// 채운다(FK 없음). 사용자가 이미 고른 값(foodId/dishType…)이 있으면 그대로 존중하고, 없을 때만
// 서버가 matchFood 로 보강한다 — 인식/자동완성에서 이미 붙여 온 값을 덮어쓰지 않기 위해서다.

export class MealServiceError extends Error {
  constructor(
    readonly code: 'not_found' | 'invalid' | 'photo_not_found',
    message: string,
  ) {
    super(message);
    this.name = 'MealServiceError';
  }
}

type EntryWithRelations = PrismaMealEntry & { items: PrismaMealItem[]; photos: PrismaMealPhoto[] };

const enumOrNull = <T extends string>(
  schema: { safeParse: (v: unknown) => { success: boolean; data?: T } },
  v: string | null,
): T | null => {
  if (v === null) return null;
  const r = schema.safeParse(v);
  return r.success ? (r.data as T) : null;
};

// 프리셋을 뽑는 기간과 최소 표본. 1~2건으로 "내 점심은 15시"라고 단정하면 오히려 방해가 된다.
const PRESET_WINDOW_DAYS = 90;
const PRESET_MIN_SAMPLES = 3;

/** UTC Date → Asia/Seoul 기준 자정으로부터의 분. 서버 시간대와 무관하게 계산한다. */
export const minutesOfDayInSeoul = (d: Date): number => {
  const hhmm = d.toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
  });
  return parseTimeOfDay(hhmm) ?? 0;
};

/**
 * 끼니별 대표 시각(중앙값). 표본이 모자라면 null(호출부가 일반값을 쓴다).
 *
 * 평균이 아니라 중앙값인 이유: 어쩌다 새벽 3시에 먹은 한 끼가 평균을 통째로 끌고 간다.
 * 야식은 자정을 걸쳐서(23:30, 00:30) 단순 중앙값이 정오로 튄다 — 그래서 새벽 시각을 +24시로
 * 펴서 계산하고 마지막에 되감는다.
 */
export const medianSlotTime = (slot: string, minutes: number[]): string | null => {
  if (minutes.length < PRESET_MIN_SAMPLES) return null;
  const unwrapped =
    slot === 'late_night' ? minutes.map((m) => (m < 6 * 60 ? m + 1440 : m)) : [...minutes];
  unwrapped.sort((a, b) => a - b);
  const mid =
    unwrapped.length % 2 === 1
      ? unwrapped[(unwrapped.length - 1) / 2]!
      : (unwrapped[unwrapped.length / 2 - 1]! + unwrapped[unwrapped.length / 2]!) / 2;
  return formatTimeOfDay(mid);
};

interface DecodedMealEntryCursor {
  eatenAt: Date;
  // null 은 전환 전 ISO eatenAt 단독 커서다.
  id: string | null;
}

/** eatenAt+id 복합 정렬 키를 클라이언트가 해석하지 않는 base64url 토큰으로 만든다. */
export const encodeMealEntryCursor = (eatenAt: Date, id: string): string =>
  Buffer.from(JSON.stringify({ v: 1, t: eatenAt.toISOString(), i: id }), 'utf8').toString(
    'base64url',
  );

/** 새 opaque 커서와 전환 전 ISO eatenAt 커서를 함께 읽는다. 잘못된 값은 기존처럼 무시한다. */
export const decodeMealEntryCursor = (cursor: string): DecodedMealEntryCursor | null => {
  try {
    const raw: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (typeof raw === 'object' && raw !== null) {
      const value = raw as { v?: unknown; t?: unknown; i?: unknown };
      if (
        value.v === 1 &&
        typeof value.t === 'string' &&
        typeof value.i === 'string' &&
        value.i.length > 0
      ) {
        const eatenAt = new Date(value.t);
        if (!Number.isNaN(eatenAt.getTime())) return { eatenAt, id: value.i };
      }
    }
  } catch {
    // 아래 ISO 커서 하위 호환 파싱으로 이어진다.
  }

  const legacy = new Date(cursor);
  return Number.isNaN(legacy.getTime()) ? null : { eatenAt: legacy, id: null };
};

const toItem = (r: PrismaMealItem): MealItemType => ({
  id: r.id,
  name: r.name,
  foodId: r.foodId,
  dishType: enumOrNull<FoodDishTypeType>(FoodDishType, r.dishType),
  mainIngredient: enumOrNull<FoodMainIngredientType>(FoodMainIngredient, r.mainIngredient),
  cuisine: enumOrNull<FoodCuisineType>(FoodCuisine, r.cuisine),
  portion: enumOrNull(MealPortion, r.portion),
  servings: r.servings,
  portionSource: enumOrNull(MealPortionSource, r.portionSource),
  isMain: r.isMain,
  confidence: r.confidence,
  recognitionDishId: r.recognitionDishId,
  selectedCandidateRank: r.selectedCandidateRank,
  catalogMatchedBy:
    r.catalogMatchedBy === 'food_id' ||
    r.catalogMatchedBy === 'normalized_name' ||
    r.catalogMatchedBy === 'alias' ||
    r.catalogMatchedBy === 'fuzzy' ||
    r.catalogMatchedBy === 'none'
      ? r.catalogMatchedBy
      : null,
  catalogMatchScore: r.catalogMatchScore,
  source: enumOrNull(MealItemSource, r.source) ?? 'manual',
  sortOrder: r.sortOrder,
  kcal: r.kcal,
  proteinG: r.proteinG,
  sodiumMg: r.sodiumMg,
  nutritionFrom: r.nutritionFrom,
  nutritionBasis: enumOrNull(MealNutritionBasis, r.nutritionBasis) ?? 'missing',
});

const toPhoto = (r: PrismaMealPhoto): MealPhotoType => ({
  token: r.token,
  width: r.width,
  height: r.height,
  byteSize: r.byteSize,
  sortOrder: r.sortOrder,
});

const parseRecognition = (json: string | null): MealEntryType['recognition'] => {
  if (!json) return null;
  try {
    const v: unknown = JSON.parse(json);
    if (typeof v !== 'object' || v === null) return null;
    const o = v as { model?: unknown; version?: unknown; dishes?: unknown };
    const model = typeof o.model === 'string' ? o.model.trim() : '';
    const version = o.version;
    const dishes = Array.isArray(o.dishes)
      ? o.dishes
          .flatMap((dish) => {
            const parsed = RecognizedDish.safeParse(dish);
            return parsed.success ? [parsed.data] : [];
          })
          .slice(0, MEAL_MAX_ITEMS_PER_ENTRY)
      : [];
    return {
      model: model.length > 0 && model.length <= 120 ? model : null,
      version:
        typeof version === 'number' &&
        Number.isInteger(version) &&
        version >= 1 &&
        version <= 10_000
          ? version
          : null,
      dishes,
    };
  } catch {
    return null;
  }
};

export const toMealEntry = (
  row: EntryWithRelations,
  opts: { withRecognition?: boolean; withPhotos?: boolean } = {},
): MealEntryType => ({
  id: row.id,
  eatenAt: row.eatenAt.toISOString(),
  eatenDate: row.eatenDate,
  slot: enumOrNull<MealSlotType>(MealSlot, row.slot) ?? 'lunch',
  mealType: enumOrNull(MealType, row.mealType),
  placeId: row.placeId,
  placeName: row.placeName,
  memo: row.memo,
  source: enumOrNull(MealEntrySource, row.source) ?? 'manual',
  originRecommendationId: row.originRecommendationId,
  items: [...row.items].sort((a, b) => a.sortOrder - b.sortOrder).map(toItem),
  photos:
    opts.withPhotos === false
      ? []
      : [...row.photos].sort((a, b) => a.sortOrder - b.sortOrder).map(toPhoto),
  recognition: opts.withRecognition ? parseRecognition(row.recognitionJson) : null,
  photoPurgedAt: row.photoPurgedAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

export interface MealServiceDeps {
  photos: MealPhotoService;
  food?: FoodService;
}

export class MealService {
  private readonly food: FoodService;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly deps: MealServiceDeps,
  ) {
    this.food = deps.food ?? new FoodService(prisma);
  }

  /**
   * 끼니별 "내가 보통 먹는 시각" — 시간 입력 프리셋. 최근 PRESET_WINDOW_DAYS 일 기록의 중앙값이고,
   * 표본이 적으면 일반 기본값을 쓴다.
   */
  async timePresets(userId: string): Promise<MealTimePresetsResultType> {
    const since = new Date(Date.now() - PRESET_WINDOW_DAYS * 86_400_000);
    const rows = await this.prisma.mealEntry.findMany({
      where: { userId, eatenAt: { gte: since } },
      select: { slot: true, eatenAt: true },
    });

    const byslot = new Map<string, number[]>();
    for (const r of rows) {
      const list = byslot.get(r.slot) ?? [];
      list.push(minutesOfDayInSeoul(r.eatenAt));
      byslot.set(r.slot, list);
    }

    return {
      presets: MEAL_SLOTS.map((slot) => {
        const minutes = byslot.get(slot) ?? [];
        const time = medianSlotTime(slot, minutes);
        return {
          slot,
          time: time ?? MEAL_SLOT_DEFAULT_TIME[slot],
          fromRecords: time !== null,
          sampleCount: minutes.length,
        };
      }),
    };
  }

  /**
   * "이 음식을 지난번에 어떻게 먹었나" — 수동 입력 보조. 같은 이름(정규화)으로 먹은 가장 최근
   * 기록에서 양·분류와 그 끼니의 대표 사진을 돌려준다. 사진은 참고용이고 붙일지는 화면이 정한다.
   */
  async findRecentItem(userId: string, name: string): Promise<RecentMealItemResultType> {
    const empty: RecentMealItemResultType = {
      found: false,
      name: null,
      lastEatenDate: null,
      portion: null,
      servings: null,
      portionSource: null,
      isMain: null,
      dishType: null,
      mainIngredient: null,
      cuisine: null,
      photoToken: null,
    };
    const nameNorm = normalizeTerm(name);
    if (!nameNorm) return empty;

    const item = await this.prisma.mealItem.findFirst({
      where: { nameNorm, entry: { userId } },
      orderBy: { entry: { eatenAt: 'desc' } },
      include: { entry: { include: { photos: { orderBy: { sortOrder: 'asc' }, take: 1 } } } },
    });
    if (!item) return empty;

    return {
      found: true,
      name: item.name,
      lastEatenDate: item.entry.eatenDate,
      portion: enumOrNull(MealPortion, item.portion),
      servings: item.servings,
      portionSource: enumOrNull(MealPortionSource, item.portionSource),
      isMain: item.isMain,
      dishType: enumOrNull<FoodDishTypeType>(FoodDishType, item.dishType),
      mainIngredient: enumOrNull<FoodMainIngredientType>(FoodMainIngredient, item.mainIngredient),
      cuisine: enumOrNull<FoodCuisineType>(FoodCuisine, item.cuisine),
      photoToken: item.entry.photos[0]?.token ?? null,
    };
  }

  // 항목 입력 → DB 행 데이터. 분류가 비어 있으면 카탈로그 매칭으로 채운다.
  private async buildItemData(
    items: MealItemInputType[],
  ): Promise<Omit<Prisma.MealItemCreateManyEntryInput, 'entryId'>[]> {
    const out: Omit<Prisma.MealItemCreateManyEntryInput, 'entryId'>[] = [];
    for (const [i, item] of items.entries()) {
      const name = item.name.trim();
      const nameNorm = normalizeTerm(name);
      let foodId = item.foodId ?? null;
      let dishType = item.dishType ?? null;
      let mainIngredient = item.mainIngredient ?? null;
      let cuisine = item.cuisine ?? null;
      let invalidSuppliedFoodId = false;
      let validSuppliedFoodId = false;
      // 영양은 항상 서버가 붙인다(클라이언트가 보내지 않는다). 클라이언트가 foodId 를 이미
      // 골라 왔으면 그 행을 그대로 보고, 아니면 이름으로 매칭한다.
      let nutrition: {
        kcal: number | null;
        proteinG: number | null;
        sodiumMg: number | null;
        nutritionFrom: string | null;
      } | null = null;
      if (foodId) {
        const row = await this.food.getNutrition(foodId);
        if (row) {
          nutrition = row;
          validSuppliedFoodId = true;
        } else {
          // 삭제·비활성·조작된 id를 이름 매칭 결과의 영양과 결합하지 않는다.
          foodId = null;
          invalidSuppliedFoodId = true;
        }
      }
      let fallbackMatch: Awaited<ReturnType<FoodService['matchFood']>> = null;
      if (!foodId || !dishType || !mainIngredient || !cuisine || !nutrition) {
        const match = await this.food.matchFood(name);
        fallbackMatch = match;
        if (match) {
          foodId = foodId ?? match.foodId;
          dishType = dishType ?? match.dishType;
          mainIngredient = mainIngredient ?? match.mainIngredient;
          cuisine = cuisine ?? match.cuisine;
          nutrition = nutrition ?? {
            kcal: match.kcal,
            proteinG: match.proteinG,
            sodiumMg: match.sodiumMg,
            nutritionFrom: match.nutritionFrom,
          };
        }
      }
      // 사용자가 직접 인분 수를 넣었으면 그 값이 우선이다. 없을 때만 서수(small/normal/large)
      // 배수를 쓴다. 사진에서 g/인분을 자동으로 만들어 내지는 않는다.
      const f = item.servings ?? mealPortionFactor(item.portion);
      const scale = (v: number | null, digits: number): number | null =>
        v === null ? null : Number((v * f).toFixed(digits));
      const hasNutrition =
        nutrition !== null &&
        [nutrition.kcal, nutrition.proteinG, nutrition.sodiumMg].some((value) => value !== null);
      const nutritionFrom = hasNutrition ? (nutrition?.nutritionFrom ?? null) : null;
      const inferredMatchedBy = validSuppliedFoodId
        ? 'food_id'
        : fallbackMatch
          ? fallbackMatch.matchedBy === 'exact'
            ? 'normalized_name'
            : fallbackMatch.matchedBy
          : foodId
            ? 'food_id'
            : 'none';
      const inferredMatchScore = validSuppliedFoodId
        ? 1
        : (fallbackMatch?.score ?? (foodId ? 1 : null));
      out.push({
        name,
        nameNorm,
        foodId,
        dishType,
        mainIngredient,
        cuisine,
        portion: item.portion ?? null,
        servings: item.servings ?? null,
        portionSource:
          item.portionSource ??
          (item.servings !== null && item.servings !== undefined
            ? 'user_serving'
            : item.portion
              ? 'vision_ordinal'
              : null),
        isMain: item.isMain,
        confidence: item.confidence ?? null,
        recognitionDishId: item.recognitionDishId ?? null,
        selectedCandidateRank: item.selectedCandidateRank ?? null,
        catalogMatchedBy: invalidSuppliedFoodId
          ? inferredMatchedBy
          : (item.catalogMatchedBy ?? inferredMatchedBy),
        catalogMatchScore: invalidSuppliedFoodId
          ? inferredMatchScore
          : (item.catalogMatchScore ?? inferredMatchScore),
        source: item.source,
        sortOrder: i,
        kcal: scale(nutrition?.kcal ?? null, 0),
        proteinG: scale(nutrition?.proteinG ?? null, 1),
        sodiumMg: scale(nutrition?.sodiumMg ?? null, 0),
        nutritionFrom,
        nutritionBasis: hasNutrition ? (nutritionFrom ? 'donor_estimate' : 'direct') : 'missing',
      });
    }
    return out;
  }

  async create(userId: string, input: CreateMealEntryInputType): Promise<MealEntryType> {
    return mealMutationBarrier.runExclusive(userId, () => this.createUnlocked(userId, input));
  }

  private async createUnlocked(
    userId: string,
    input: CreateMealEntryInputType,
  ): Promise<MealEntryType> {
    const originRecommendationId = input.originRecommendationId?.trim() || null;
    if ((input.source === 'recommendation') !== (originRecommendationId !== null)) {
      throw new MealServiceError('invalid', '추천 출처와 원본 추천 id가 일치하지 않습니다.');
    }
    // 토큰 오류가 기록 생성 뒤에 드러나 반쪽 기록이 남지 않도록 모든 DB 쓰기 전에 검증한다.
    if (input.photoTokens.length > 0) {
      await this.deps.photos.validateForEntry(userId, null, input.photoTokens);
    }
    const itemData = await this.buildItemData(input.items);
    const entry = await this.prisma.$transaction(async (tx) => {
      let recommendationFeedback: {
        id: string;
        pickedName: string;
        candidateFoodId: string | null;
        candidateRank: number;
        rankingVersion: number;
        rating: number | null;
      } | null = null;
      if (originRecommendationId) {
        const recommendation = await tx.mealRecommendation.findFirst({
          where: { id: originRecommendationId, userId },
          select: { id: true, itemsJson: true, feedbackJson: true, promptVersion: true },
        });
        if (!recommendation) throw new MealServiceError('invalid', '원본 추천을 찾을 수 없습니다.');
        const pickedName = findMealRecommendationCandidate(
          recommendation.itemsJson,
          input.items.filter((item) => item.isMain).map((item) => item.name),
        );
        if (!pickedName)
          throw new MealServiceError('invalid', '추천 후보와 일치하는 주 음식이 없습니다.');
        const previous = parseMealRecommendationFeedback(recommendation.feedbackJson);
        if (previous?.eatenEntryId) {
          throw new MealServiceError('invalid', '이미 식단 기록으로 연결된 추천입니다.');
        }
        const candidates = parseMealRecommendationItems(recommendation.itemsJson);
        const candidateRank = candidates.findIndex(
          (candidate) => normalizeTerm(candidate.name) === normalizeTerm(pickedName),
        );
        recommendationFeedback = {
          id: recommendation.id,
          pickedName,
          candidateFoodId: candidateRank >= 0 ? (candidates[candidateRank]?.foodId ?? null) : null,
          candidateRank: Math.max(0, candidateRank),
          rankingVersion: recommendation.promptVersion,
          rating: previous?.rating ?? null,
        };
      }
      const created = await tx.mealEntry.create({
        data: {
          userId,
          eatenAt: new Date(input.eatenAt),
          eatenDate: input.eatenDate,
          slot: input.slot,
          mealType: input.mealType ?? null,
          placeId: input.placeId ?? null,
          placeName: input.placeName ?? null,
          memo: input.memo ?? null,
          source: input.source,
          originRecommendationId,
          recognitionJson: input.recognition ? JSON.stringify(input.recognition) : null,
          items: { createMany: { data: itemData } },
        },
      });
      if (input.photoTokens.length > 0) {
        await this.deps.photos.attachToEntry(userId, created.id, input.photoTokens, tx);
      }
      if (recommendationFeedback) {
        await tx.mealRecommendation.update({
          where: { id: recommendationFeedback.id },
          data: {
            feedbackJson: JSON.stringify({
              pickedName: recommendationFeedback.pickedName,
              rating: recommendationFeedback.rating,
              eatenEntryId: created.id,
            }),
          },
        });
        await tx.mealRecommendationEvent.create({
          data: {
            recommendationId: recommendationFeedback.id,
            userId,
            kind: 'logged',
            candidateName: recommendationFeedback.pickedName,
            candidateFoodId: recommendationFeedback.candidateFoodId,
            candidateRank: recommendationFeedback.candidateRank,
            platform: 'server',
            rankingVersion: recommendationFeedback.rankingVersion,
          },
        });
      }
      return created;
    });
    return this.get(userId, entry.id);
  }

  async get(userId: string, id: string): Promise<MealEntryType> {
    const row = await this.prisma.mealEntry.findFirst({
      where: { id, userId },
      include: { items: true, photos: true },
    });
    if (!row) throw new MealServiceError('not_found', '기록을 찾을 수 없습니다.');
    return toMealEntry(row, { withRecognition: true });
  }

  async update(
    userId: string,
    id: string,
    input: UpdateMealEntryInputType,
  ): Promise<MealEntryType> {
    return mealMutationBarrier.runExclusive(userId, () => this.updateUnlocked(userId, id, input));
  }

  private async updateUnlocked(
    userId: string,
    id: string,
    input: UpdateMealEntryInputType,
  ): Promise<MealEntryType> {
    const existing = await this.prisma.mealEntry.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!existing) throw new MealServiceError('not_found', '기록을 찾을 수 없습니다.');

    // 항목/기록을 바꾸기 전에 토큰 전체의 소유권·미사용 상태를 먼저 확인한다.
    if (input.photoTokens !== undefined) {
      await this.deps.photos.validateForEntry(userId, id, input.photoTokens);
    }

    const data: Prisma.MealEntryUpdateInput = {};
    if (input.eatenAt !== undefined) data.eatenAt = new Date(input.eatenAt);
    if (input.eatenDate !== undefined) data.eatenDate = input.eatenDate;
    if (input.slot !== undefined) data.slot = input.slot;
    if (input.mealType !== undefined) data.mealType = input.mealType;
    if (input.placeId !== undefined) data.placeId = input.placeId;
    if (input.placeName !== undefined) data.placeName = input.placeName;
    if (input.memo !== undefined) data.memo = input.memo;
    // 보존 정책으로 사진만 정리된 기록에 새 사진을 붙이면 더 이상 "사진 정리됨" 상태가 아니다.
    // 사진 attach와 같은 transaction에서 해제해 메타데이터와 실제 연결이 엇갈리지 않게 한다.
    if (input.photoTokens !== undefined && input.photoTokens.length > 0) data.photoPurgedAt = null;
    // 영양/카탈로그 조회는 트랜잭션 밖에서 끝내 잠금 시간을 짧게 유지한다.
    const itemData = input.items !== undefined ? await this.buildItemData(input.items) : null;
    let detachedFiles: MealPhotoFileRef[] = [];
    await this.prisma.$transaction(async (tx) => {
      // 항목은 전량 교체 — 편집 화면이 항상 전체를 들고 있다(부분 패치 계약이 아니다).
      if (itemData !== null) {
        await tx.mealItem.deleteMany({ where: { entryId: id } });
        await tx.mealItem.createMany({ data: itemData.map((d) => ({ ...d, entryId: id })) });
      }
      if (Object.keys(data).length > 0) {
        await tx.mealEntry.update({ where: { id }, data });
      }
      if (input.photoTokens !== undefined) {
        detachedFiles = await this.deps.photos.attachToEntry(userId, id, input.photoTokens, tx);
      }
    });
    // 파일 삭제는 롤백할 수 없으므로 DB 커밋 뒤에만 실행한다.
    await this.deps.photos.removeFiles(detachedFiles);
    return this.get(userId, id);
  }

  async remove(userId: string, id: string): Promise<void> {
    return mealMutationBarrier.runExclusive(userId, () => this.removeUnlocked(userId, id));
  }

  private async removeUnlocked(userId: string, id: string): Promise<void> {
    const row = await this.prisma.mealEntry.findFirst({
      where: { id, userId },
      select: {
        id: true,
        originRecommendationId: true,
        photos: { select: { userId: true, token: true } },
      },
    });
    if (!row) throw new MealServiceError('not_found', '기록을 찾을 수 없습니다.');
    // 추천에서 만든 기록을 지우면 추천의 "실제 기록" 연결도 함께 해제한다. 선택·평가는
    // 사용자가 남긴 별도 신호이므로 보존한다. 둘은 같은 트랜잭션이어야 통계가 어긋나지 않는다.
    await this.prisma.$transaction(async (tx) => {
      await tx.mealEntry.delete({ where: { id } });
      if (row.originRecommendationId) {
        const recommendation = await tx.mealRecommendation.findFirst({
          where: { id: row.originRecommendationId, userId },
          select: { id: true, feedbackJson: true },
        });
        const feedback = parseMealRecommendationFeedback(recommendation?.feedbackJson ?? null);
        if (recommendation && feedback?.eatenEntryId === id) {
          await tx.mealRecommendation.update({
            where: { id: recommendation.id },
            data: { feedbackJson: JSON.stringify({ ...feedback, eatenEntryId: null }) },
          });
        }
      }
    });
    // DB 삭제가 실패했는데 파일만 먼저 사라지는 일이 없도록 커밋 뒤 파일을 지운다.
    await this.deps.photos.removeFiles(row.photos);
  }

  // 최신순 커서 페이지네이션. 새 커서는 eatenAt+id 복합 키라 같은 시각 기록도 빠지지 않는다.
  // 전환 전 ISO eatenAt 단독 커서는 하위 호환으로 기존 lt 동작을 유지한다.
  async list(userId: string, query: ListMealEntriesQueryType): Promise<ListMealEntriesResultType> {
    const where: Prisma.MealEntryWhereInput = { userId };
    if (query.from || query.to) {
      where.eatenDate = {
        ...(query.from ? { gte: query.from } : {}),
        ...(query.to ? { lte: query.to } : {}),
      };
    }
    if (query.slot) where.slot = query.slot;
    if (query.mealType) where.mealType = query.mealType;
    if (query.source) where.source = query.source;
    const and: Prisma.MealEntryWhereInput[] = [];
    if (query.q) {
      and.push({
        OR: [
          { placeName: { contains: query.q } },
          { memo: { contains: query.q } },
          { items: { some: { name: { contains: query.q } } } },
        ],
      });
    }
    if (query.cursor) {
      const cursor = decodeMealEntryCursor(query.cursor);
      if (cursor?.id) {
        and.push({
          OR: [
            { eatenAt: { lt: cursor.eatenAt } },
            { eatenAt: cursor.eatenAt, id: { lt: cursor.id } },
          ],
        });
      } else if (cursor) {
        where.eatenAt = { lt: cursor.eatenAt };
      }
    }
    if (and.length > 0) where.AND = and;
    const rows = await this.prisma.mealEntry.findMany({
      where,
      include: { items: true, photos: query.withPhotos !== false },
      orderBy: [{ eatenAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const page = rows.slice(0, query.limit);
    const last = page[page.length - 1];
    const nextCursor =
      rows.length > query.limit && last ? encodeMealEntryCursor(last.eatenAt, last.id) : null;
    return {
      items: page.map((r) =>
        toMealEntry({ ...r, photos: 'photos' in r ? r.photos : [] } as EntryWithRelations, {
          withPhotos: query.withPhotos !== false,
        }),
      ),
      nextCursor,
    };
  }

  async calendar(userId: string, month: string): Promise<MealCalendarResultType> {
    const range = monthRange(month);
    if (!range) throw new MealServiceError('invalid', '월 형식이 올바르지 않습니다.');
    const rows = await this.prisma.mealEntry.findMany({
      where: { userId, eatenDate: { gte: range.from, lte: range.to } },
      select: { eatenDate: true, slot: true, photos: { select: { token: true }, take: 1 } },
      orderBy: { eatenAt: 'asc' },
    });
    const byDate = new Map<string, { count: number; slots: Set<string>; hasPhoto: boolean }>();
    for (const r of rows) {
      let d = byDate.get(r.eatenDate);
      if (!d) {
        d = { count: 0, slots: new Set(), hasPhoto: false };
        byDate.set(r.eatenDate, d);
      }
      d.count += 1;
      d.slots.add(r.slot);
      if (r.photos.length > 0) d.hasPhoto = true;
    }
    return {
      month,
      days: [...byDate.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, v]) => ({
          date,
          count: v.count,
          slots: [...v.slots].filter((s): s is MealSlotType => MealSlot.safeParse(s).success),
          hasPhoto: v.hasPhoto,
        })),
    };
  }

  async countForUser(userId: string): Promise<number> {
    return this.prisma.mealEntry.count({ where: { userId } });
  }
}
