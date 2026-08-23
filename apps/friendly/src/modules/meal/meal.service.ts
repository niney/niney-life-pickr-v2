import type { MealEntry as PrismaMealEntry, MealItem as PrismaMealItem, MealPhoto as PrismaMealPhoto, Prisma, PrismaClient } from '@prisma/client';
import {
  FoodCuisine,
  FoodDishType,
  FoodMainIngredient,
  MealEntrySource,
  MealItemSource,
  MealPortion,
  MealSlot,
  MealType,
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
import type { MealPhotoService } from './meal-photo.service.js';

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
  const hhmm = d.toLocaleTimeString('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' });
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

const toItem = (r: PrismaMealItem): MealItemType => ({
  id: r.id,
  name: r.name,
  foodId: r.foodId,
  dishType: enumOrNull<FoodDishTypeType>(FoodDishType, r.dishType),
  mainIngredient: enumOrNull<FoodMainIngredientType>(FoodMainIngredient, r.mainIngredient),
  cuisine: enumOrNull<FoodCuisineType>(FoodCuisine, r.cuisine),
  portion: enumOrNull(MealPortion, r.portion),
  isMain: r.isMain,
  confidence: r.confidence,
  source: enumOrNull(MealItemSource, r.source) ?? 'manual',
  sortOrder: r.sortOrder,
  kcal: r.kcal,
  proteinG: r.proteinG,
  sodiumMg: r.sodiumMg,
  nutritionFrom: r.nutritionFrom,
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
    return {
      model: typeof o.model === 'string' ? o.model : null,
      version: typeof o.version === 'number' ? o.version : null,
      dishes: Array.isArray(o.dishes) ? o.dishes : [],
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
  items: [...row.items].sort((a, b) => a.sortOrder - b.sortOrder).map(toItem),
  photos:
    opts.withPhotos === false ? [] : [...row.photos].sort((a, b) => a.sortOrder - b.sortOrder).map(toPhoto),
  recognition: opts.withRecognition ? parseRecognition(row.recognitionJson) : null,
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
      // 영양은 항상 서버가 붙인다(클라이언트가 보내지 않는다). 클라이언트가 foodId 를 이미
      // 골라 왔으면 그 행을 그대로 보고, 아니면 이름으로 매칭한다.
      let nutrition: { kcal: number | null; proteinG: number | null; sodiumMg: number | null; nutritionFrom: string | null } | null =
        null;
      if (foodId) {
        const row = await this.food.getNutrition(foodId);
        if (row) nutrition = row;
      }
      if (!foodId || !dishType || !mainIngredient || !cuisine || !nutrition) {
        const match = await this.food.matchFood(name);
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
      // 1인분 값 × 눈대중 배수. 소수점은 표시 단위(kcal 1, g 0.1)까지만 남긴다.
      const f = mealPortionFactor(item.portion);
      const scale = (v: number | null, digits: number): number | null =>
        v === null ? null : Number((v * f).toFixed(digits));
      out.push({
        name,
        nameNorm,
        foodId,
        dishType,
        mainIngredient,
        cuisine,
        portion: item.portion ?? null,
        isMain: item.isMain,
        confidence: item.confidence ?? null,
        source: item.source,
        sortOrder: i,
        kcal: scale(nutrition?.kcal ?? null, 0),
        proteinG: scale(nutrition?.proteinG ?? null, 1),
        sodiumMg: scale(nutrition?.sodiumMg ?? null, 0),
        nutritionFrom: nutrition?.nutritionFrom ?? null,
      });
    }
    return out;
  }

  async create(userId: string, input: CreateMealEntryInputType): Promise<MealEntryType> {
    const itemData = await this.buildItemData(input.items);
    const entry = await this.prisma.mealEntry.create({
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
        recognitionJson: input.recognition ? JSON.stringify(input.recognition) : null,
        items: { createMany: { data: itemData } },
      },
    });
    if (input.photoTokens.length > 0) {
      await this.deps.photos.attachToEntry(userId, entry.id, input.photoTokens);
    }
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

  async update(userId: string, id: string, input: UpdateMealEntryInputType): Promise<MealEntryType> {
    const existing = await this.prisma.mealEntry.findFirst({ where: { id, userId }, select: { id: true } });
    if (!existing) throw new MealServiceError('not_found', '기록을 찾을 수 없습니다.');

    const data: Prisma.MealEntryUpdateInput = {};
    if (input.eatenAt !== undefined) data.eatenAt = new Date(input.eatenAt);
    if (input.eatenDate !== undefined) data.eatenDate = input.eatenDate;
    if (input.slot !== undefined) data.slot = input.slot;
    if (input.mealType !== undefined) data.mealType = input.mealType;
    if (input.placeId !== undefined) data.placeId = input.placeId;
    if (input.placeName !== undefined) data.placeName = input.placeName;
    if (input.memo !== undefined) data.memo = input.memo;
    if (input.source !== undefined) data.source = input.source;

    // 항목은 전량 교체 — 편집 화면이 항상 전체를 들고 있다(부분 패치 계약이 아니다).
    if (input.items !== undefined) {
      const itemData = await this.buildItemData(input.items);
      await this.prisma.mealItem.deleteMany({ where: { entryId: id } });
      await this.prisma.mealItem.createMany({ data: itemData.map((d) => ({ ...d, entryId: id })) });
    }
    if (Object.keys(data).length > 0) {
      await this.prisma.mealEntry.update({ where: { id }, data });
    }
    if (input.photoTokens !== undefined) {
      await this.deps.photos.attachToEntry(userId, id, input.photoTokens);
    }
    return this.get(userId, id);
  }

  async remove(userId: string, id: string): Promise<void> {
    const row = await this.prisma.mealEntry.findFirst({ where: { id, userId }, select: { id: true } });
    if (!row) throw new MealServiceError('not_found', '기록을 찾을 수 없습니다.');
    // 파일은 Cascade 가 안 지운다 — 행 삭제 전에 먼저 지운다.
    await this.deps.photos.removeForEntry(id);
    await this.prisma.mealEntry.delete({ where: { id } });
  }

  // 최신순 커서 페이지네이션. 커서는 직전 페이지 마지막 항목의 eatenAt(ISO) — 같은 시각이
  // 여럿이면 id 내림차순으로 tie-break 한다.
  async list(userId: string, query: ListMealEntriesQueryType): Promise<ListMealEntriesResultType> {
    const where: Prisma.MealEntryWhereInput = { userId };
    if (query.from || query.to) {
      where.eatenDate = {
        ...(query.from ? { gte: query.from } : {}),
        ...(query.to ? { lte: query.to } : {}),
      };
    }
    if (query.slot) where.slot = query.slot;
    if (query.cursor) {
      const cursorDate = new Date(query.cursor);
      if (!Number.isNaN(cursorDate.getTime())) where.eatenAt = { lt: cursorDate };
    }
    const rows = await this.prisma.mealEntry.findMany({
      where,
      include: { items: true, photos: query.withPhotos !== false },
      orderBy: [{ eatenAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const page = rows.slice(0, query.limit);
    const nextCursor = rows.length > query.limit ? (page[page.length - 1]?.eatenAt.toISOString() ?? null) : null;
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
