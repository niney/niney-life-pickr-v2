import type { FoodItem as PrismaFoodItem, Prisma, PrismaClient } from '@prisma/client';
import {
  FoodAllergenStatus,
  FoodCuisine,
  FoodDishType,
  FoodMainIngredient,
  FoodSource,
  MealAllergen,
  FOOD_RESTAURANT_DATA_NOTICE,
  MEAL_SIDE_DEFAULT_DISH_TYPES,
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
import { DEFAULT_LEXICON, loadLexicon, synonymVariants, type Lexicon } from './engine/index.js';
import { mealServingNutrition, type ServingCatalogRow } from './food-serving.js';
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
export const FUZZY_CANDIDATE_LIMIT = 300;

// 흔한 표기 → 카탈로그 표기(정확·별칭 일치가 없을 때만). 직접 적은 식단 41끼 중 15개 음식이 표기 차이로
// 영양이 비었다(2026-10-04 — 계란말이·떡만둣국·크루아상·동그랑땡…). 표기 변형(계란↔달걀·둣국↔두국)은 메뉴
// 어휘의 synonymPairs 를 그대로 쓰고, 다른 이름은 이 표로 — 식단 매칭 전용(메뉴 칼로리 엔진의 '후라이드치킨'은 한 마리라
// 닭튀김 1인분으로 묶으면 안 된다). 비슷하기만 한 음식(까르보나라→스파게티)은 영양이 틀어질 수 있어 넣지 않는다.
const FOOD_NAME_SYNONYMS: Readonly<Record<string, string>> = {
  동그랑땡: '완자전',
  치킨무: '무초절임(치킨무)',
  요거트: '요구르트(호상)',
  플레인요거트: '요구르트(호상)',
  콘푸레이크: '시리얼',
  콘플레이크: '시리얼',
  // 프라이드치킨은 어휘의 후라이↔프라이로 여기에 닿는다.
  후라이드치킨: '닭튀김',
  쿠키: '비스킷/쿠키/크래커',
};
/** 정규화한 이름의 다른 표기 후보(정규화된 nameNorm) — 원래 이름은 빼고. */
export const foodNameVariants = (norm: string, lex: Lexicon = DEFAULT_LEXICON): string[] => {
  const out = new Set<string>();
  for (const spelled of [norm, ...synonymVariants(norm, lex)]) {
    out.add(spelled);
    const synonym = FOOD_NAME_SYNONYMS[spelled];
    if (synonym) out.add(normalizeTerm(synonym));
  }
  out.delete(norm);
  return [...out];
};
const SEARCH_CANDIDATE_MULTIPLIER = 4;
// 자동완성에서 '내가 먹은 음식'으로 앞에 놓는 기간.
const MY_FOOD_WINDOW_DAYS = 180;

// 현재 판매를 직접 보장할 수 없는 역검색에서는 가까운 리뷰 한 건보다 메뉴판과
// 리뷰가 함께 확인된 근거를 먼저 보여 준다. 같은 근거 등급 안에서만 거리를 쓴다.
const foodRestaurantEvidenceScore = (item: FoodRestaurantType): number =>
  (item.evidence.includes('menu_catalog') ? 2 : 0) +
  (item.evidence.includes('review_mentions') ? 1 : 0);

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
  kcalPer100g: r.kcalPer100g,
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

export const toFoodSearchItem = (
  r: PrismaFoodItem,
  extra: { servingKcal: number | null; myCount: number } = { servingKcal: null, myCount: 0 },
): FoodSearchItemType => ({
  id: r.id,
  name: r.name,
  repName: r.repName,
  dishType: enumOrNull<FoodDishTypeType>(FoodDishType, r.dishType),
  mainIngredient: enumOrNull<FoodMainIngredientType>(FoodMainIngredient, r.mainIngredient),
  cuisine: enumOrNull<FoodCuisineType>(FoodCuisine, r.cuisine),
  popularity: r.popularity,
  servingKcal: extra.servingKcal,
  myCount: extra.myCount,
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
  // 1인분 중량과 100g당 열량 — 메뉴 칼로리 표시(1인분/100g당 등급 판정)용.
  servingG: number | null;
  kcalPer100g: number | null;
  // 같은 계열에서 빌려온 값이면 그 출처 문구.
  nutritionFrom: string | null;
  // 통상 1인분 중량표 키 판정(생재료는 육류·수산물 키)용 원본 출처.
  source: string;
  sourceCategory: string | null;
}

const SERVING_ROW_SELECT = {
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
} as const satisfies Prisma.FoodItemSelect;

// ── 묶음 매칭(matchFoods) ── 활성 카탈로그를 한 번 읽어 메모리에서 matchFood 와 같은 순서로 판정한다.
// matchFood 는 이름마다 쿼리 3개 이상(별칭·퍼지는 카탈로그 전체 LIKE)이라, 식당 메뉴처럼 이름이 수십~백여 개면
// 수백 번 왕복한다(메뉴 141개 가게 449회 — 2026-11-14 실측).

// toMatch 에 필요한 열 + 판정에 쓰는 별칭·인기도.
const MATCH_ROW_SELECT = {
  id: true,
  name: true,
  nameNorm: true,
  aliasNormsJson: true,
  popularity: true,
  dishType: true,
  mainIngredient: true,
  cuisine: true,
  kcal: true,
  proteinG: true,
  sodiumMg: true,
  servingG: true,
  kcalPer100g: true,
  nutritionFrom: true,
  source: true,
  sourceCategory: true,
} as const satisfies Prisma.FoodItemSelect;
export type FoodMatchRow = Prisma.FoodItemGetPayload<{ select: typeof MATCH_ROW_SELECT }>;

// 색인이 없을 때, 이름이 이보다 적으면 카탈로그 전체를 읽는 것(약 5,500행 — 수십 ms)보다 하나씩 묻는 쪽이 싸다.
const MATCH_BATCH_MIN = 8;

export interface FoodMatchIndex {
  byNorm: Map<string, FoodMatchRow>;
  // matchFood 의 LIKE 와 같은 비교를 하려고 ASCII 만 소문자로 맞춘 글(SQLite LIKE 는 ASCII 대소문자만 가리지 않는다).
  names: { row: FoodMatchRow; text: string }[];
  aliases: { row: FoodMatchRow; text: string }[];
}

const asciiLower = (s: string): string => s.replace(/[A-Z]+/g, (m) => m.toLowerCase());

export const buildFoodMatchIndex = (rows: readonly FoodMatchRow[]): FoodMatchIndex => {
  const byNorm = new Map<string, FoodMatchRow>();
  const names: FoodMatchIndex['names'] = [];
  const aliases: FoodMatchIndex['aliases'] = [];
  for (const row of rows) {
    byNorm.set(row.nameNorm, row);
    names.push({ row, text: asciiLower(row.nameNorm) });
    // '[]' 보다 길어야 별칭이 있다.
    if (row.aliasNormsJson.length > 2) aliases.push({ row, text: asciiLower(row.aliasNormsJson) });
  }
  return { byNorm, names, aliases };
};

/**
 * 메모리 판정으로는 답을 정할 수 없는 이름 — 인기도가 같은 후보가 겹쳐 DB 가 돌려주는 순서에 답이 달렸다.
 * 이런 이름은 matchFood(DB)로 넘겨 결과를 같게 한다.
 */
export const FOOD_MATCH_UNDECIDED = Symbol('food-match-undecided');
export type IndexedFoodMatch =
  | { row: FoodMatchRow; score: number; matchedBy: FoodMatch['matchedBy'] }
  | null
  | typeof FOOD_MATCH_UNDECIDED;

// 별칭 일치 — DB 는 인기순 첫 행을 준다. 가장 인기 있는 행이 둘 이상이면 어느 쪽이 먼저인지 여기서는 알 수 없다.
const aliasInIndex = (index: FoodMatchIndex, norm: string): FoodMatchRow | null | typeof FOOD_MATCH_UNDECIDED => {
  const needle = `"${norm}"`;
  let best: FoodMatchRow | null = null;
  let tied = false;
  for (const alias of index.aliases) {
    if (!alias.text.includes(needle)) continue;
    if (!best || alias.row.popularity > best.popularity) {
      best = alias.row;
      tied = false;
    } else if (alias.row.popularity === best.popularity) {
      tied = true;
    }
  }
  return tied ? FOOD_MATCH_UNDECIDED : best;
};

// 퍼지 후보 가운데 가장 닮은 행(같으면 인기 있는 쪽). 닮음도 인기도 같은 행이 겹치면 tied.
const bestFuzzy = (
  norm: string,
  rows: readonly FoodMatchRow[],
): { row: FoodMatchRow; score: number; tied: boolean } | null => {
  let best: { row: FoodMatchRow; score: number } | null = null;
  let tied = false;
  for (const row of rows) {
    const score = foodNameSimilarity(norm, row.nameNorm);
    if (score < FOOD_MATCH_FUZZY_MIN) continue;
    if (!best || score > best.score || (score === best.score && row.popularity > best.row.popularity)) {
      best = { row, score };
      tied = false;
    } else if (score === best.score && row.popularity === best.row.popularity) {
      tied = true;
    }
  }
  return best ? { ...best, tied } : null;
};

/** matchFood 와 같은 순서(정확 → 별칭 → 표기 변형 → 퍼지)의 메모리 판정. norm 은 normalizeTerm 을 거친 이름. */
export const matchInFoodIndex = (norm: string, index: FoodMatchIndex, lexicon: Lexicon): IndexedFoodMatch => {
  if (!norm) return null;
  const exact = index.byNorm.get(norm);
  if (exact) return { row: exact, score: 1, matchedBy: 'exact' };

  const alias = aliasInIndex(index, norm);
  if (alias === FOOD_MATCH_UNDECIDED) return FOOD_MATCH_UNDECIDED;
  if (alias) return { row: alias, score: 0.95, matchedBy: 'alias' };

  for (const variant of foodNameVariants(norm, lexicon)) {
    const hit = index.byNorm.get(variant) ?? aliasInIndex(index, variant);
    if (hit === FOOD_MATCH_UNDECIDED) return FOOD_MATCH_UNDECIDED;
    if (hit) return { row: hit, score: 0.95, matchedBy: 'alias' };
  }

  if (norm.length < 2) return null;
  const head = norm.slice(0, 2);
  const tail = norm.slice(-2);
  const candidates: FoodMatchRow[] = [];
  for (const entry of index.names) {
    if (entry.text.includes(head) || entry.text.includes(tail)) candidates.push(entry.row);
  }
  if (candidates.length === 0) return null;

  // DB 는 후보를 인기순으로 FUZZY_CANDIDATE_LIMIT 개만 본다. 끊기는 자리의 인기도와 같은 행들은 일부만 들어가는데
  // 어느 것이 들어갔는지는 DB 순서에 달렸다 — 그 행들이 답을 바꿀 수 없을 때만 여기서 정한다.
  let sure = candidates;
  let partial: FoodMatchRow[] = [];
  if (candidates.length > FUZZY_CANDIDATE_LIMIT) {
    const sorted = [...candidates].sort((a, b) => b.popularity - a.popularity);
    const cutoff = sorted[FUZZY_CANDIDATE_LIMIT - 1]!.popularity;
    const atLeast = sorted.filter((row) => row.popularity >= cutoff);
    if (atLeast.length === FUZZY_CANDIDATE_LIMIT) {
      sure = atLeast;
    } else {
      sure = sorted.filter((row) => row.popularity > cutoff);
      partial = sorted.filter((row) => row.popularity === cutoff);
    }
  }
  const best = bestFuzzy(norm, sure);
  if (partial.length > 0) {
    // 일부만 들어간 행은 확실히 들어간 행보다 인기도가 낮다 — 더 닮았을 때만 답을 바꾼다.
    const among = bestFuzzy(norm, partial);
    if (among && (!best || among.score > best.score)) return FOOD_MATCH_UNDECIDED;
  }
  if (!best) return null;
  return best.tied ? FOOD_MATCH_UNDECIDED : { row: best.row, score: best.score, matchedBy: 'fuzzy' };
};

// 메뉴 칼로리 엔진의 인덱스 주기(INDEX_TTL)와 같다.
const LEXICON_TTL_MS = 10 * 60 * 1000;

export class FoodService {
  private lexiconCache: { value: Lexicon; at: number } | null = null;
  // 묶음 매칭용 카탈로그 색인 — 어휘와 같은 주기로 다시 읽는다. 가게마다 새로 읽으면 메뉴 몇 개짜리 가게는 하나씩
  // 묻던 때보다 느려진다(운영 사본 407곳 첫 조회 중앙 38 → 63ms, 2026-11-14).
  private matchIndexCache: { value: Promise<FoodMatchIndex>; at: number } | null = null;

  constructor(private readonly prisma: PrismaClient) {}

  // ── 사용자 자동완성 ──────────────────────────────────────────────────────
  // 일치도(정확 → 앞 → 포함)·인기순. userId 를 주면 내가 최근 180일 적은 음식을 앞에 놓는다(인기순 후보 창 밖이어도
  // 이름이 맞으면 넣는다). 결과마다 식단에 넣을 때와 같은 규칙의 1인분 열량을 붙인다.
  async search(q: string, limit: number, userId?: string): Promise<FoodSearchItemType[]> {
    const raw = q.trim();
    const norm = normalizeTerm(raw);
    if (!norm) return [];
    const match: Prisma.FoodItemWhereInput = {
      active: true,
      OR: [
        { nameNorm: { contains: norm } },
        { name: { contains: raw } },
        { aliasNormsJson: { contains: `"${norm}` } },
      ],
    };
    const [rows, mine, lexicon] = await Promise.all([
      this.prisma.foodItem.findMany({
        where: match,
        orderBy: [{ popularity: 'desc' }, { name: 'asc' }],
        take: Math.max(limit * SEARCH_CANDIDATE_MULTIPLIER, 40),
      }),
      userId ? this.myFoodCounts(userId) : Promise.resolve(new Map<string, number>()),
      this.servingLexicon(),
    ]);
    const seen = new Set(rows.map((r) => r.id));
    const missing = [...mine.keys()].filter((id) => !seen.has(id));
    const extra = missing.length
      ? await this.prisma.foodItem.findMany({ where: { AND: [match, { id: { in: missing } }] } })
      : [];
    const rank = (r: PrismaFoodItem): number => {
      if (r.nameNorm === norm) return 0;
      if (r.nameNorm.startsWith(norm)) return 1;
      if (r.nameNorm.includes(norm)) return 2;
      return 3;
    };
    return [...rows, ...extra]
      .map((r) => ({ r, k: rank(r), mine: mine.get(r.id) ?? 0 }))
      .sort(
        (a, b) =>
          b.mine - a.mine ||
          a.k - b.k ||
          b.r.popularity - a.r.popularity ||
          a.r.name.localeCompare(b.r.name, 'ko'),
      )
      .slice(0, limit)
      .map(({ r, mine: myCount }) => {
        const isMain = !MEAL_SIDE_DEFAULT_DISH_TYPES.includes(r.dishType ?? '');
        const kcal = mealServingNutrition(r, { isMain }, lexicon).kcal;
        return toFoodSearchItem(r, {
          servingKcal: kcal === null ? null : Math.round(kcal),
          myCount,
        });
      });
  }

  /** 내가 최근 MY_FOOD_WINDOW_DAYS 일 식단에 적은 카탈로그 음식별 횟수. */
  private async myFoodCounts(userId: string): Promise<Map<string, number>> {
    const since = new Date(Date.now() - MY_FOOD_WINDOW_DAYS * 86_400_000);
    const groups = await this.prisma.mealItem.groupBy({
      by: ['foodId'],
      where: { foodId: { not: null }, entry: { userId, eatenAt: { gte: since } } },
      _count: { _all: true },
    });
    return new Map(
      groups.flatMap((g) => (g.foodId ? [[g.foodId, g._count._all] as [string, number]] : [])),
    );
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
      const evidenceDiff = foodRestaurantEvidenceScore(b) - foodRestaurantEvidenceScore(a);
      if (query.lat !== undefined && query.lng !== undefined) {
        return (
          evidenceDiff ||
          (a.distanceM ?? Number.POSITIVE_INFINITY) - (b.distanceM ?? Number.POSITIVE_INFINITY) ||
          b.mentionCount - a.mentionCount ||
          (b.rating ?? -1) - (a.rating ?? -1)
        );
      }
      return (
        evidenceDiff ||
        b.mentionCount - a.mentionCount ||
        (b.rating ?? -1) - (a.rating ?? -1) ||
        (b.reviewCount ?? -1) - (a.reviewCount ?? -1) ||
        a.name.localeCompare(b.name, 'ko')
      );
    });
    return { ...baseResult, items: candidates.slice(0, query.limit) };
  }

  /**
   * 이미 고른 카탈로그 행의 1인분 영양과 1인분 중량 판정에 필요한 값(기록 저장 시 스냅샷용).
   * 한 끼 1인분은 이 값 그대로가 아니라 mealServingNutrition 이 어휘와 함께 정한다.
   */
  async getServingRow(foodId: string): Promise<ServingCatalogRow | null> {
    const r = await this.prisma.foodItem.findFirst({
      where: { id: foodId, active: true },
      select: SERVING_ROW_SELECT,
    });
    return r ?? null;
  }

  /**
   * 1인분 중량 판정용 어휘(코드 기본 + 어드민 메뉴 어휘). 메뉴 칼로리 엔진과 같은 주기(10분)로 다시 읽어
   * 어드민에서 고친 "1인분 기준 중량"이 배포 없이 식단 저장에도 반영된다.
   */
  async servingLexicon(): Promise<Lexicon> {
    if (this.lexiconCache && Date.now() - this.lexiconCache.at < LEXICON_TTL_MS) {
      return this.lexiconCache.value;
    }
    const value = await loadLexicon(this.prisma);
    this.lexiconCache = { value, at: Date.now() };
    return value;
  }

  // 1) nameNorm 정확 2) 별칭 정확 3) 퍼지(bigram Jaccard/포함, 임계 FOOD_MATCH_FUZZY_MIN). 비활성 행 제외.
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

    // 표기 변형·다른 이름(계란말이 → 달걀말이, 동그랑땡 → 완자전).
    for (const variant of foodNameVariants(norm, await this.servingLexicon())) {
      const hit =
        (await this.prisma.foodItem.findFirst({ where: { nameNorm: variant, active: true } })) ??
        (await this.prisma.foodItem.findFirst({
          where: { active: true, aliasNormsJson: { contains: `"${variant}"` } },
          orderBy: { popularity: 'desc' },
        }));
      if (hit) return this.toMatch(hit, 0.95, 'alias');
    }

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

  /**
   * 이름 여러 개를 한 번에 — 이름마다 결과는 matchFood 와 같다. 활성 카탈로그 색인을 메모리에서 판정하고,
   * 인기도가 같은 후보가 겹쳐 DB 순서에 답이 달린 이름(FOOD_MATCH_UNDECIDED)만 matchFood 로 넘긴다.
   * 색인은 어휘와 같은 주기(10분)로 다시 읽는다 — 그사이 카탈로그를 고친 것은 그만큼 늦게 보인다(메뉴 칼로리 엔진의
   * 색인과 같다). 색인이 없고 이름이 몇 개 안 되면 카탈로그를 읽지 않고 하나씩 묻는다.
   */
  async matchFoods(names: readonly string[]): Promise<Map<string, FoodMatch | null>> {
    const out = new Map<string, FoodMatch | null>();
    const distinct = [...new Set(names)];
    const fresh = this.matchIndexCache !== null && Date.now() - this.matchIndexCache.at < LEXICON_TTL_MS;
    if (!fresh && distinct.length < MATCH_BATCH_MIN) {
      for (const name of distinct) out.set(name, await this.matchFood(name));
      return out;
    }
    const [index, lexicon] = await Promise.all([this.matchIndex(), this.servingLexicon()]);
    // matchFood 는 정규화한 이름만 본다 — 표기만 다른 이름("김치 찌개"·"김치찌개")은 한 번만 판정한다.
    const byNorm = new Map<string, FoodMatch | null>();
    for (const name of distinct) {
      const norm = normalizeTerm(name);
      let match = byNorm.get(norm);
      if (match === undefined) {
        const hit = matchInFoodIndex(norm, index, lexicon);
        match =
          hit === FOOD_MATCH_UNDECIDED
            ? await this.matchFood(name)
            : hit
              ? this.toMatch(hit.row, hit.score, hit.matchedBy)
              : null;
        byNorm.set(norm, match);
      }
      out.set(name, match);
    }
    return out;
  }

  // 겹쳐 불려도 카탈로그는 한 번만 읽는다. 읽기에 실패하면 버려서 다음 호출이 다시 읽는다.
  private matchIndex(): Promise<FoodMatchIndex> {
    const cached = this.matchIndexCache;
    if (cached && Date.now() - cached.at < LEXICON_TTL_MS) return cached.value;
    const entry = {
      value: this.prisma.foodItem
        .findMany({ where: { active: true }, select: MATCH_ROW_SELECT })
        .then(buildFoodMatchIndex),
      at: Date.now(),
    };
    this.matchIndexCache = entry;
    entry.value.catch(() => {
      if (this.matchIndexCache === entry) this.matchIndexCache = null;
    });
    return entry.value;
  }

  private toMatch(r: FoodMatchRow, score: number, matchedBy: FoodMatch['matchedBy']): FoodMatch {
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
      servingG: r.servingG,
      kcalPer100g: r.kcalPer100g,
      nutritionFrom: r.nutritionFrom,
      source: r.source,
      sourceCategory: r.sourceCategory,
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
