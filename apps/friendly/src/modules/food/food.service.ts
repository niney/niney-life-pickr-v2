import type { FoodItem as PrismaFoodItem, Prisma, PrismaClient } from '@prisma/client';
import {
  FoodCuisine,
  FoodDishType,
  FoodMainIngredient,
  FoodSource,
  type FoodAdminCreateInputType,
  type FoodAdminListQueryType,
  type FoodAdminListResultType,
  type FoodAdminStatsType,
  type FoodAdminUpdateInputType,
  type FoodCuisineType,
  type FoodDishTypeType,
  type FoodItemType,
  type FoodMainIngredientType,
  type FoodSearchItemType,
  type FoodSourceType,
} from '@repo/api-contract';
import { normalizeTerm } from '../../lib/text.js';

// 음식 카탈로그 조회/매칭/어드민 편집. 적재(import)와 LLM 분류는 별도 서비스.
//
// 매칭 키는 nameNorm(normalizeTerm — 소문자·공백·기호 제거). 별칭도 같은 정규화로 aliasNormsJson 에
// 두고 LIKE 로 찾는다(카탈로그 수천 행 전제 — 인덱스 없이도 충분).

export class FoodServiceError extends Error {
  constructor(
    readonly code: 'not_found' | 'duplicate_name' | 'invalid',
    message: string,
  ) {
    super(message);
    this.name = 'FoodServiceError';
  }
}

// 퍼지 매칭 임계 — bigram Jaccard 또는 포함 비율. "김치찌게"↔"김치찌개" 0.5, "묵은지김치찌개"↔"김치찌개"
// 포함 4/7≈0.57 는 통과, "된장찌개"↔"김치찌개" 0.2 는 탈락.
export const FOOD_MATCH_FUZZY_MIN = 0.5;
const FUZZY_CANDIDATE_LIMIT = 300;
const SEARCH_CANDIDATE_MULTIPLIER = 4;

export const parseJsonStringArray = (s: string | null | undefined): string[] => {
  if (!s) return [];
  try {
    const v: unknown = JSON.parse(s);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
};

const enumOrNull = <T extends string>(
  schema: { safeParse: (v: unknown) => { success: boolean; data?: T } },
  v: string | null,
): T | null => {
  if (v === null) return null;
  const r = schema.safeParse(v);
  return r.success ? (r.data as T) : null;
};

const hasNutrition = (r: PrismaFoodItem): boolean =>
  r.kcal !== null || r.carbG !== null || r.proteinG !== null || r.fatG !== null || r.sodiumMg !== null || r.sugarG !== null;

export const toFoodItem = (r: PrismaFoodItem): FoodItemType => ({
  id: r.id,
  name: r.name,
  repName: r.repName,
  aliases: parseJsonStringArray(r.aliasesJson),
  dishType: enumOrNull<FoodDishTypeType>(FoodDishType, r.dishType),
  mainIngredient: enumOrNull<FoodMainIngredientType>(FoodMainIngredient, r.mainIngredient),
  cuisine: enumOrNull<FoodCuisineType>(FoodCuisine, r.cuisine),
  ingredients: r.ingredientsJson === null ? null : parseJsonStringArray(r.ingredientsJson),
  servingG: r.servingG,
  nutrition: hasNutrition(r)
    ? { kcal: r.kcal, carbG: r.carbG, proteinG: r.proteinG, fatG: r.fatG, sodiumMg: r.sodiumMg, sugarG: r.sugarG }
    : null,
  source: (enumOrNull<FoodSourceType>(FoodSource, r.source) ?? 'manual'),
  sourceId: r.sourceId,
  sourceCategory: r.sourceCategory,
  popularity: r.popularity,
  active: r.active,
  classifyVersion: r.classifyVersion,
  classifyModel: r.classifyModel,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});

export const toFoodSearchItem = (r: PrismaFoodItem): FoodSearchItemType => ({
  id: r.id,
  name: r.name,
  repName: r.repName,
  dishType: enumOrNull<FoodDishTypeType>(FoodDishType, r.dishType),
  mainIngredient: enumOrNull<FoodMainIngredientType>(FoodMainIngredient, r.mainIngredient),
  cuisine: enumOrNull<FoodCuisineType>(FoodCuisine, r.cuisine),
  popularity: r.popularity,
});

// 별칭 정규화 — 빈 값·자기 이름과 같은 값·중복 제거.
export const buildAliasNorms = (aliases: string[], nameNorm: string): string[] => {
  const out: string[] = [];
  for (const a of aliases) {
    const n = normalizeTerm(a);
    if (!n || n === nameNorm || out.includes(n)) continue;
    out.push(n);
  }
  return out;
};

const bigrams = (s: string): Set<string> => {
  const set = new Set<string>();
  for (let i = 0; i < s.length - 1; i += 1) set.add(s.slice(i, i + 2));
  return set;
};

// 정규화된 두 문자열의 유사도 [0,1] — bigram Jaccard 와 포함 비율(짧은 쪽/긴 쪽) 중 큰 값.
export const foodNameSimilarity = (aNorm: string, bNorm: string): number => {
  if (!aNorm || !bNorm) return 0;
  if (aNorm === bNorm) return 1;
  let contain = 0;
  if (aNorm.includes(bNorm) || bNorm.includes(aNorm)) {
    contain = Math.min(aNorm.length, bNorm.length) / Math.max(aNorm.length, bNorm.length);
  }
  const A = bigrams(aNorm);
  const B = bigrams(bNorm);
  if (A.size === 0 || B.size === 0) return contain;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter += 1;
  const jaccard = inter / (A.size + B.size - inter);
  return Math.max(jaccard, contain);
};

export interface FoodMatch {
  foodId: string;
  name: string;
  nameNorm: string;
  dishType: FoodDishTypeType | null;
  mainIngredient: FoodMainIngredientType | null;
  cuisine: FoodCuisineType | null;
  score: number;
  matchedBy: 'exact' | 'alias' | 'fuzzy';
  // 1인분 영양(양 배수 적용 전). 카탈로그에 값이 없으면 null.
  kcal: number | null;
  proteinG: number | null;
  sodiumMg: number | null;
  // 같은 계열에서 빌려온 값이면 그 출처 문구.
  nutritionFrom: string | null;
}

export class FoodService {
  constructor(private readonly prisma: PrismaClient) {}

  // ── 사용자 자동완성 ──────────────────────────────────────────────────────
  async search(q: string, limit: number): Promise<FoodSearchItemType[]> {
    const raw = q.trim();
    const norm = normalizeTerm(raw);
    if (!norm) return [];
    const rows = await this.prisma.foodItem.findMany({
      where: {
        active: true,
        OR: [
          { nameNorm: { contains: norm } },
          { name: { contains: raw } },
          { aliasNormsJson: { contains: `"${norm}` } },
        ],
      },
      orderBy: [{ popularity: 'desc' }, { name: 'asc' }],
      take: Math.max(limit * SEARCH_CANDIDATE_MULTIPLIER, 40),
    });
    const rank = (r: PrismaFoodItem): number => {
      if (r.nameNorm === norm) return 0;
      if (r.nameNorm.startsWith(norm)) return 1;
      if (r.nameNorm.includes(norm)) return 2;
      return 3;
    };
    return rows
      .map((r) => ({ r, k: rank(r) }))
      .sort((a, b) => a.k - b.k || b.r.popularity - a.r.popularity || a.r.name.localeCompare(b.r.name, 'ko'))
      .slice(0, limit)
      .map(({ r }) => toFoodSearchItem(r));
  }

  // ── 매칭(인식 결과·수동 입력 → 카탈로그) ─────────────────────────────────
  // 1) nameNorm 정확 2) 별칭 정확 3) 퍼지(bigram Jaccard/포함, 임계 FOOD_MATCH_FUZZY_MIN). 비활성 행 제외.
  /** 이미 고른 카탈로그 행의 1인분 영양만 읽는다(기록 저장 시 스냅샷용). */
  async getNutrition(
    foodId: string,
  ): Promise<{ kcal: number | null; proteinG: number | null; sodiumMg: number | null; nutritionFrom: string | null } | null> {
    const r = await this.prisma.foodItem.findFirst({
      where: { id: foodId, active: true },
      select: { kcal: true, proteinG: true, sodiumMg: true, nutritionFrom: true },
    });
    return r ?? null;
  }

  async matchFood(name: string): Promise<FoodMatch | null> {
    const norm = normalizeTerm(name);
    if (!norm) return null;
    const exact = await this.prisma.foodItem.findFirst({ where: { nameNorm: norm, active: true } });
    if (exact) return this.toMatch(exact, 1, 'exact');

    const aliasHit = await this.prisma.foodItem.findFirst({
      where: { active: true, aliasNormsJson: { contains: `"${norm}"` } },
      orderBy: { popularity: 'desc' },
    });
    if (aliasHit) return this.toMatch(aliasHit, 0.95, 'alias');

    if (norm.length < 2) return null;
    const head = norm.slice(0, 2);
    const tail = norm.slice(-2);
    const candidates = await this.prisma.foodItem.findMany({
      where: {
        active: true,
        OR: [{ nameNorm: { contains: head } }, { nameNorm: { contains: tail } }],
      },
      orderBy: { popularity: 'desc' },
      take: FUZZY_CANDIDATE_LIMIT,
    });
    let best: { row: PrismaFoodItem; score: number } | null = null;
    for (const row of candidates) {
      const score = foodNameSimilarity(norm, row.nameNorm);
      if (score >= FOOD_MATCH_FUZZY_MIN && (!best || score > best.score || (score === best.score && row.popularity > best.row.popularity))) {
        best = { row, score };
      }
    }
    return best ? this.toMatch(best.row, best.score, 'fuzzy') : null;
  }

  private toMatch(r: PrismaFoodItem, score: number, matchedBy: FoodMatch['matchedBy']): FoodMatch {
    return {
      foodId: r.id,
      name: r.name,
      nameNorm: r.nameNorm,
      dishType: enumOrNull<FoodDishTypeType>(FoodDishType, r.dishType),
      mainIngredient: enumOrNull<FoodMainIngredientType>(FoodMainIngredient, r.mainIngredient),
      cuisine: enumOrNull<FoodCuisineType>(FoodCuisine, r.cuisine),
      score,
      matchedBy,
      kcal: r.kcal,
      proteinG: r.proteinG,
      sodiumMg: r.sodiumMg,
      nutritionFrom: r.nutritionFrom,
    };
  }

  // ── 어드민 ───────────────────────────────────────────────────────────────
  async adminList(query: FoodAdminListQueryType): Promise<FoodAdminListResultType> {
    const where: Prisma.FoodItemWhereInput = {};
    const and: Prisma.FoodItemWhereInput[] = [];
    if (query.q) {
      const raw = query.q.trim();
      const norm = normalizeTerm(raw);
      if (norm) {
        and.push({
          OR: [
            { nameNorm: { contains: norm } },
            { name: { contains: raw } },
            { repName: { contains: raw } },
            { aliasNormsJson: { contains: norm } },
          ],
        });
      }
    }
    if (query.dishType) and.push({ dishType: query.dishType });
    if (query.mainIngredient) and.push({ mainIngredient: query.mainIngredient });
    if (query.cuisine) and.push({ cuisine: query.cuisine });
    if (query.source) and.push({ source: query.source });
    if (query.active !== undefined) and.push({ active: query.active });
    if (query.unclassified) {
      and.push({ OR: [{ dishType: null }, { mainIngredient: null }, { cuisine: null }] });
    }
    if (and.length > 0) where.AND = and;

    const orderBy: Prisma.FoodItemOrderByWithRelationInput[] =
      query.sort === 'name'
        ? [{ name: 'asc' }]
        : query.sort === 'updatedAt'
          ? [{ updatedAt: 'desc' }]
          : [{ popularity: 'desc' }, { name: 'asc' }];

    const [rows, total] = await Promise.all([
      this.prisma.foodItem.findMany({ where, orderBy, skip: query.offset, take: query.limit }),
      this.prisma.foodItem.count({ where }),
    ]);
    return { items: rows.map(toFoodItem), total };
  }

  async adminGet(id: string): Promise<FoodItemType> {
    const row = await this.prisma.foodItem.findUnique({ where: { id } });
    if (!row) throw new FoodServiceError('not_found', '음식을 찾을 수 없습니다');
    return toFoodItem(row);
  }

  async adminCreate(input: FoodAdminCreateInputType): Promise<FoodItemType> {
    const name = input.name.trim();
    const nameNorm = normalizeTerm(name);
    if (!nameNorm) throw new FoodServiceError('invalid', '음식명이 비어 있습니다');
    const dup = await this.prisma.foodItem.findUnique({ where: { nameNorm } });
    if (dup) throw new FoodServiceError('duplicate_name', `이미 있는 음식명입니다: ${dup.name}`);
    const aliases = (input.aliases ?? []).map((a) => a.trim()).filter((a) => a.length > 0);
    const row = await this.prisma.foodItem.create({
      data: {
        name,
        nameNorm,
        repName: input.repName ?? null,
        aliasesJson: JSON.stringify(aliases),
        aliasNormsJson: JSON.stringify(buildAliasNorms(aliases, nameNorm)),
        dishType: input.dishType ?? null,
        mainIngredient: input.mainIngredient ?? null,
        cuisine: input.cuisine ?? null,
        ingredientsJson: input.ingredients ? JSON.stringify(input.ingredients) : null,
        source: 'manual',
        sourceId: null,
        sourceCategory: null,
        active: input.active ?? true,
      },
    });
    return toFoodItem(row);
  }

  async adminUpdate(id: string, input: FoodAdminUpdateInputType): Promise<FoodItemType> {
    const row = await this.prisma.foodItem.findUnique({ where: { id } });
    if (!row) throw new FoodServiceError('not_found', '음식을 찾을 수 없습니다');

    const data: Prisma.FoodItemUpdateInput = {};
    let nameNorm = row.nameNorm;
    if (input.name !== undefined) {
      const name = input.name.trim();
      const norm = normalizeTerm(name);
      if (!norm) throw new FoodServiceError('invalid', '음식명이 비어 있습니다');
      if (norm !== row.nameNorm) {
        const dup = await this.prisma.foodItem.findUnique({ where: { nameNorm: norm } });
        if (dup && dup.id !== id) {
          throw new FoodServiceError('duplicate_name', `이미 있는 음식명입니다: ${dup.name}`);
        }
      }
      data.name = name;
      data.nameNorm = norm;
      nameNorm = norm;
    }
    if (input.repName !== undefined) data.repName = input.repName;
    if (input.aliases !== undefined) {
      const aliases = input.aliases.map((a) => a.trim()).filter((a) => a.length > 0);
      data.aliasesJson = JSON.stringify(aliases);
      data.aliasNormsJson = JSON.stringify(buildAliasNorms(aliases, nameNorm));
    } else if (input.name !== undefined) {
      // 이름이 바뀌면 별칭 정규화 목록에서 새 이름과 같은 값은 빠져야 한다.
      data.aliasNormsJson = JSON.stringify(
        buildAliasNorms(parseJsonStringArray(row.aliasesJson), nameNorm),
      );
    }
    if (input.dishType !== undefined) data.dishType = input.dishType;
    if (input.mainIngredient !== undefined) data.mainIngredient = input.mainIngredient;
    if (input.cuisine !== undefined) data.cuisine = input.cuisine;
    if (input.ingredients !== undefined) {
      data.ingredientsJson = input.ingredients === null ? null : JSON.stringify(input.ingredients);
    }
    if (input.active !== undefined) data.active = input.active;

    const updated = await this.prisma.foodItem.update({ where: { id }, data });
    return toFoodItem(updated);
  }

  async adminStats(): Promise<FoodAdminStatsType> {
    const [total, active, classified, bySourceRaw, byDishRaw] = await Promise.all([
      this.prisma.foodItem.count(),
      this.prisma.foodItem.count({ where: { active: true } }),
      this.prisma.foodItem.count({
        where: { dishType: { not: null }, mainIngredient: { not: null }, cuisine: { not: null } },
      }),
      this.prisma.foodItem.groupBy({ by: ['source'], _count: { _all: true } }),
      this.prisma.foodItem.groupBy({ by: ['dishType'], _count: { _all: true } }),
    ]);
    const bySource = bySourceRaw
      .map((g) => ({ source: enumOrNull<FoodSourceType>(FoodSource, g.source), count: g._count._all }))
      .filter((g): g is { source: FoodSourceType; count: number } => g.source !== null)
      .sort((a, b) => b.count - a.count);
    const byDishType = byDishRaw
      .map((g) => ({ dishType: enumOrNull<FoodDishTypeType>(FoodDishType, g.dishType), count: g._count._all }))
      .sort((a, b) => b.count - a.count);
    return { total, active, classified, bySource, byDishType };
  }
}
