import type { FoodItem as PrismaFoodItem, Prisma, PrismaClient } from '@prisma/client';
import {
  FoodAllergenStatus,
  FoodCuisine,
  FoodDishType,
  FoodMainIngredient,
  FoodSource,
  MealAllergen,
  FOOD_RESTAURANT_DATA_NOTICE,
  type FoodAdminCreateInputType,
  type FoodAdminListQueryType,
  type FoodAdminListResultType,
  type FoodAdminStatsType,
  type FoodAdminUpdateInputType,
  type FoodAllergenStatusType,
  type FoodCuisineType,
  type FoodDishTypeType,
  type FoodItemType,
  type FoodMainIngredientType,
  type MealAllergenType,
  type FoodRestaurantEvidenceType,
  type FoodRestaurantsQueryType,
  type FoodRestaurantsResultType,
  type FoodRestaurantType,
  type FoodSearchItemType,
  type FoodSourceType,
} from '@repo/api-contract';
import { haversineM } from '@repo/utils';
import { normalizeTerm } from '../../lib/text.js';
import {
  inferFoodAllergens,
  parseFoodAllergenStatus,
  serializeFoodAllergenMetadata,
  unknownFoodAllergens,
  verifiedFoodAllergens,
} from './food-allergen.js';

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

const parseFoodSourceRefs = (
  raw: string | null | undefined,
): { source: string; sourceId: string | null }[] => {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const source = (item as { source?: unknown }).source;
      const sourceId = (item as { sourceId?: unknown }).sourceId;
      if (typeof source !== 'string') return [];
      if (sourceId !== null && typeof sourceId !== 'string') return [];
      return [{ source, sourceId }];
    });
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
  r.kcal !== null ||
  r.carbG !== null ||
  r.proteinG !== null ||
  r.fatG !== null ||
  r.sodiumMg !== null ||
  r.sugarG !== null;

const parseAllergens = (raw: string): MealAllergenType[] =>
  parseJsonStringArray(raw).flatMap((value) => {
    const parsed = MealAllergen.safeParse(value);
    return parsed.success ? [parsed.data] : [];
  });

export const toFoodItem = (r: PrismaFoodItem): FoodItemType => ({
  id: r.id,
  name: r.name,
  repName: r.repName,
  aliases: parseJsonStringArray(r.aliasesJson),
  dishType: enumOrNull<FoodDishTypeType>(FoodDishType, r.dishType),
  mainIngredient: enumOrNull<FoodMainIngredientType>(FoodMainIngredient, r.mainIngredient),
  cuisine: enumOrNull<FoodCuisineType>(FoodCuisine, r.cuisine),
  ingredients: r.ingredientsJson === null ? null : parseJsonStringArray(r.ingredientsJson),
  allergens: parseAllergens(r.allergensJson),
  allergenEvidence: parseJsonStringArray(r.allergenEvidenceJson),
  allergenStatus:
    enumOrNull<FoodAllergenStatusType>(FoodAllergenStatus, r.allergenStatus) ?? 'unknown',
  servingG: r.servingG,
  nutrition: hasNutrition(r)
    ? {
        kcal: r.kcal,
        carbG: r.carbG,
        proteinG: r.proteinG,
        fatG: r.fatG,
        sodiumMg: r.sodiumMg,
        sugarG: r.sugarG,
      }
    : null,
  source: enumOrNull<FoodSourceType>(FoodSource, r.source) ?? 'manual',
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
      .sort(
        (a, b) =>
          a.k - b.k || b.r.popularity - a.r.popularity || a.r.name.localeCompare(b.r.name, 'ko'),
      )
      .slice(0, limit)
      .map(({ r }) => toFoodSearchItem(r));
  }

  // ── 매칭(인식 결과·수동 입력 → 카탈로그) ─────────────────────────────────
  // FoodItem → GlobalMenuCanonical → 식당 역검색. FoodItem의 menu-canonical
  // sourceId/sourceRefs 연결을 최우선으로 쓰고, 없거나 stale 하면 음식 이름·별칭의
  // 정규화 키를 globalKey와 정확 비교한다. 퍼지 매칭은 다른 메뉴를 파는 식당으로
  // 오안내할 위험이 있어 의도적으로 하지 않는다.
  async restaurants(
    foodId: string,
    query: FoodRestaurantsQueryType,
  ): Promise<FoodRestaurantsResultType> {
    const food = await this.prisma.foodItem.findUnique({
      where: { id: foodId },
      select: {
        id: true,
        name: true,
        nameNorm: true,
        aliasNormsJson: true,
        source: true,
        sourceId: true,
        sourceRefsJson: true,
      },
    });
    if (!food) throw new FoodServiceError('not_found', '음식을 찾을 수 없습니다');

    const referencedKeys = new Set<string>();
    if (food.source === 'menu-canonical' && food.sourceId?.trim()) {
      referencedKeys.add(food.sourceId.trim());
    }
    for (const ref of parseFoodSourceRefs(food.sourceRefsJson)) {
      if (ref.source === 'menu-canonical' && ref.sourceId?.trim()) {
        referencedKeys.add(ref.sourceId.trim());
      }
    }
    const fallbackKeys = new Set<string>([
      food.nameNorm,
      ...parseJsonStringArray(food.aliasNormsJson),
    ]);

    const findGlobals = (keys: string[]) =>
      keys.length === 0
        ? Promise.resolve([])
        : this.prisma.globalMenuCanonical.findMany({
            where: { globalKey: { in: keys } },
            select: {
              id: true,
              globalKey: true,
              displayName: true,
              links: {
                select: {
                  restaurantId: true,
                  menuCanonical: {
                    select: {
                      restaurantId: true,
                      nameNorm: true,
                      canonicalNorm: true,
                      restaurant: { select: { canonicalId: true } },
                    },
                  },
                },
              },
            },
          });

    let globals = await findGlobals([...referencedKeys]);
    // 매핑 출처가 아예 없거나 재그룹핑으로 stale 해진 경우에만 정확 이름/별칭 폴백.
    if (globals.length === 0) globals = await findGlobals([...fallbackKeys]);

    const baseResult = {
      foodId: food.id,
      foodName: food.name,
      matchedGlobalKeys: globals.map((g) => g.globalKey).sort(),
      notice: FOOD_RESTAURANT_DATA_NOTICE,
    } as const;
    if (globals.length === 0) return { ...baseResult, items: [] };

    const linkRows = globals.flatMap((global) =>
      global.links.map((link) => ({
        globalKey: global.globalKey,
        displayName: global.displayName,
        restaurantId: link.restaurantId,
        canonicalId: link.menuCanonical.restaurant.canonicalId,
        nameNorm: link.menuCanonical.nameNorm,
        canonicalNorm: link.menuCanonical.canonicalNorm,
      })),
    );
    if (linkRows.length === 0) return { ...baseResult, items: [] };

    const canonicalIds = [...new Set(linkRows.map((link) => link.canonicalId))];
    const restaurantRows = await this.prisma.restaurant.findMany({
      where: { canonicalId: { in: canonicalIds } },
      select: {
        id: true,
        source: true,
        placeId: true,
        name: true,
        category: true,
        address: true,
        rating: true,
        reviewCount: true,
        canonicalId: true,
        sourceMenus: { select: { name: true } },
        canonical: {
          select: {
            name: true,
            primaryCategory: true,
            latitude: true,
            longitude: true,
          },
        },
      },
    });

    // MenuCanonical은 리뷰에서 추출한 MenuMention.nameNorm을 정규화한 결과다.
    // 여러 global/local 링크가 한 식당에 병합될 수 있으므로 pair 단위로 한 번만 집계한다.
    const uniquePairs = [
      ...new Map(
        linkRows.map((link) => [
          `${link.restaurantId}\u0000${link.nameNorm}`,
          { restaurantId: link.restaurantId, nameNorm: link.nameNorm },
        ]),
      ).values(),
    ];
    const mentionRows = await this.prisma.menuMention.groupBy({
      by: ['restaurantId', 'nameNorm', 'sentiment'],
      where: {
        OR: uniquePairs.map((pair) => ({
          restaurantId: pair.restaurantId,
          nameNorm: pair.nameNorm,
        })),
      },
      _count: { _all: true },
    });
    const mentionsByPair = new Map<string, { total: number; positive: number; negative: number }>();
    for (const row of mentionRows) {
      const key = `${row.restaurantId}\u0000${row.nameNorm}`;
      const stat = mentionsByPair.get(key) ?? { total: 0, positive: 0, negative: 0 };
      const count = row._count._all;
      stat.total += count;
      if (row.sentiment === 'positive') stat.positive += count;
      else if (row.sentiment === 'negative') stat.negative += count;
      mentionsByPair.set(key, stat);
    }

    const restaurantsByCanonical = new Map<string, typeof restaurantRows>();
    for (const restaurant of restaurantRows) {
      const rows = restaurantsByCanonical.get(restaurant.canonicalId) ?? [];
      rows.push(restaurant);
      restaurantsByCanonical.set(restaurant.canonicalId, rows);
    }

    interface CandidateAggregate {
      item: FoodRestaurantType;
      evidence: Set<FoodRestaurantEvidenceType>;
      positive: number;
      negative: number;
    }
    const byPlaceId = new Map<string, CandidateAggregate>();
    for (const canonicalId of canonicalIds) {
      const linked = linkRows.filter((link) => link.canonicalId === canonicalId);
      const rows = restaurantsByCanonical.get(canonicalId) ?? [];
      const placeRows = rows.filter((row) => row.placeId !== null);
      if (linked.length === 0 || placeRows.length === 0) continue;

      const exactMenuNorms = new Set<string>([
        food.nameNorm,
        ...fallbackKeys,
        ...linked.flatMap((link) => [link.globalKey, link.nameNorm, link.canonicalNorm]),
      ]);
      const hasCatalogEvidence = rows.some((row) =>
        row.sourceMenus.some((menu) => exactMenuNorms.has(normalizeTerm(menu.name))),
      );
      const matchedMenus = [...new Set(linked.map((link) => link.displayName))].sort((a, b) =>
        a.localeCompare(b, 'ko'),
      );
      let mentionCount = 0;
      let positive = 0;
      let negative = 0;
      const seenPairs = new Set<string>();
      for (const link of linked) {
        const pairKey = `${link.restaurantId}\u0000${link.nameNorm}`;
        if (seenPairs.has(pairKey)) continue;
        seenPairs.add(pairKey);
        const stat = mentionsByPair.get(pairKey);
        if (!stat) continue;
        mentionCount += stat.total;
        positive += stat.positive;
        negative += stat.negative;
      }

      for (const row of placeRows) {
        const placeId = row.placeId!;
        const latitude = row.canonical.latitude;
        const longitude = row.canonical.longitude;
        let distanceM: number | null = null;
        if (query.lat !== undefined && query.lng !== undefined) {
          if (latitude === null || longitude === null) continue;
          distanceM = Math.round(
            haversineM({ lat: query.lat, lng: query.lng }, { lat: latitude, lng: longitude }),
          );
          if (distanceM > query.radiusM) continue;
        }

        // Global/MenuCanonical 링크 자체가 리뷰 메뉴 언급을 그룹한 결과이므로
        // 원본 MenuMention이 정리된 이후에도 review_mentions 근거는 유지한다.
        const evidence = new Set<FoodRestaurantEvidenceType>(['review_mentions']);
        if (hasCatalogEvidence) evidence.add('menu_catalog');
        const existing = byPlaceId.get(placeId);
        if (existing) {
          for (const value of evidence) existing.evidence.add(value);
          existing.item.mentionCount += mentionCount;
          existing.positive += positive;
          existing.negative += negative;
          existing.item.matchedMenus = [
            ...new Set([...existing.item.matchedMenus, ...matchedMenus]),
          ].sort((a, b) => a.localeCompare(b, 'ko'));
          continue;
        }
        byPlaceId.set(placeId, {
          evidence,
          positive,
          negative,
          item: {
            placeId,
            name: row.canonical.name || row.name,
            category: row.category ?? row.canonical.primaryCategory,
            address: row.address,
            latitude,
            longitude,
            rating: row.rating,
            reviewCount: row.reviewCount,
            distanceM,
            evidence: [],
            mentionCount,
            positiveRatio: null,
            matchedMenus,
          },
        });
      }
    }

    const candidates = [...byPlaceId.values()].map((candidate) => {
      const denominator = candidate.positive + candidate.negative;
      candidate.item.evidence = [...candidate.evidence].sort((a, b) => a.localeCompare(b));
      candidate.item.positiveRatio = denominator === 0 ? null : candidate.positive / denominator;
      return candidate.item;
    });
    candidates.sort((a, b) => {
      if (query.lat !== undefined && query.lng !== undefined) {
        return (
          (a.distanceM ?? Number.POSITIVE_INFINITY) - (b.distanceM ?? Number.POSITIVE_INFINITY) ||
          b.mentionCount - a.mentionCount ||
          (b.rating ?? -1) - (a.rating ?? -1)
        );
      }
      return (
        b.evidence.length - a.evidence.length ||
        b.mentionCount - a.mentionCount ||
        (b.rating ?? -1) - (a.rating ?? -1) ||
        (b.reviewCount ?? -1) - (a.reviewCount ?? -1) ||
        a.name.localeCompare(b.name, 'ko')
      );
    });
    return { ...baseResult, items: candidates.slice(0, query.limit) };
  }

  // 1) nameNorm 정확 2) 별칭 정확 3) 퍼지(bigram Jaccard/포함, 임계 FOOD_MATCH_FUZZY_MIN). 비활성 행 제외.
  /** 이미 고른 카탈로그 행의 1인분 영양만 읽는다(기록 저장 시 스냅샷용). */
  async getNutrition(foodId: string): Promise<{
    kcal: number | null;
    proteinG: number | null;
    sodiumMg: number | null;
    nutritionFrom: string | null;
  } | null> {
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
      if (
        score >= FOOD_MATCH_FUZZY_MIN &&
        (!best ||
          score > best.score ||
          (score === best.score && row.popularity > best.row.popularity))
      ) {
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
    if (query.allergenStatus) and.push({ allergenStatus: query.allergenStatus });
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
    const ingredients = input.ingredients ?? null;
    const allergenMetadata =
      input.allergenStatus === 'unknown'
        ? unknownFoodAllergens()
        : input.allergenStatus === 'inferred'
          ? inferFoodAllergens(ingredients)
          : input.allergenStatus === 'verified' || input.allergens !== undefined
            ? verifiedFoodAllergens(input.allergens ?? [])
            : inferFoodAllergens(ingredients);
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
        ingredientsJson: ingredients ? JSON.stringify(ingredients) : null,
        ...serializeFoodAllergenMetadata(allergenMetadata),
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
    const ingredients =
      input.ingredients !== undefined
        ? input.ingredients
        : row.ingredientsJson === null
          ? null
          : parseJsonStringArray(row.ingredientsJson);
    const currentStatus = parseFoodAllergenStatus(row.allergenStatus);
    if (input.allergenStatus === 'unknown') {
      Object.assign(data, serializeFoodAllergenMetadata(unknownFoodAllergens()));
    } else if (input.allergenStatus === 'inferred') {
      Object.assign(data, serializeFoodAllergenMetadata(inferFoodAllergens(ingredients)));
    } else if (input.allergenStatus === 'verified' || input.allergens !== undefined) {
      Object.assign(
        data,
        serializeFoodAllergenMetadata(
          verifiedFoodAllergens(input.allergens ?? parseAllergens(row.allergensJson)),
        ),
      );
    } else if (input.ingredients !== undefined && currentStatus !== 'verified') {
      Object.assign(data, serializeFoodAllergenMetadata(inferFoodAllergens(ingredients)));
    }
    if (input.active !== undefined) data.active = input.active;

    const updated = await this.prisma.foodItem.update({ where: { id }, data });
    return toFoodItem(updated);
  }

  async adminStats(): Promise<FoodAdminStatsType> {
    const hasAnyNutrition: Prisma.FoodItemWhereInput = {
      OR: [
        { kcal: { not: null } },
        { carbG: { not: null } },
        { proteinG: { not: null } },
        { fatG: { not: null } },
        { sodiumMg: { not: null } },
        { sugarG: { not: null } },
      ],
    };
    const [
      total,
      active,
      classified,
      sourceObservationCount,
      openMergeConflictCount,
      nutritionDirectCount,
      nutritionEstimatedCount,
      nutritionMissingCount,
      allergenUnknownCount,
      allergenInferredCount,
      allergenVerifiedCount,
      bySourceRaw,
      byDishRaw,
    ] = await Promise.all([
      this.prisma.foodItem.count(),
      this.prisma.foodItem.count({ where: { active: true } }),
      this.prisma.foodItem.count({
        where: { dishType: { not: null }, mainIngredient: { not: null }, cuisine: { not: null } },
      }),
      this.prisma.foodSourceObservation.count(),
      this.prisma.foodMergeConflict.count({ where: { status: 'open' } }),
      this.prisma.foodItem.count({ where: { AND: [{ nutritionFrom: null }, hasAnyNutrition] } }),
      this.prisma.foodItem.count({
        where: { AND: [{ nutritionFrom: { not: null } }, hasAnyNutrition] },
      }),
      this.prisma.foodItem.count({
        where: {
          kcal: null,
          carbG: null,
          proteinG: null,
          fatG: null,
          sodiumMg: null,
          sugarG: null,
        },
      }),
      this.prisma.foodItem.count({ where: { allergenStatus: 'unknown' } }),
      this.prisma.foodItem.count({ where: { allergenStatus: 'inferred' } }),
      this.prisma.foodItem.count({ where: { allergenStatus: 'verified' } }),
      this.prisma.foodItem.groupBy({ by: ['source'], _count: { _all: true } }),
      this.prisma.foodItem.groupBy({ by: ['dishType'], _count: { _all: true } }),
    ]);
    const bySource = bySourceRaw
      .map((g) => ({
        source: enumOrNull<FoodSourceType>(FoodSource, g.source),
        count: g._count._all,
      }))
      .filter((g): g is { source: FoodSourceType; count: number } => g.source !== null)
      .sort((a, b) => b.count - a.count);
    const byDishType = byDishRaw
      .map((g) => ({
        dishType: enumOrNull<FoodDishTypeType>(FoodDishType, g.dishType),
        count: g._count._all,
      }))
      .sort((a, b) => b.count - a.count);
    return {
      total,
      active,
      classified,
      sourceObservationCount,
      openMergeConflictCount,
      nutritionDirectCount,
      nutritionEstimatedCount,
      nutritionMissingCount,
      allergenUnknownCount,
      allergenInferredCount,
      allergenVerifiedCount,
      bySource,
      byDishType,
    };
  }
}
