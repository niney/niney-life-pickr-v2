import type { PrismaClient } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import {
  FoodCuisine,
  FoodDishType,
  FoodMainIngredient,
  MEAL_SIDE_DEFAULT_DISH_TYPES,
  type MealPlaceMenuChoiceType,
  type MealPlaceMenuFoodType,
  type MealPlaceMenuType,
  type MealPlaceMenusResultType,
  type MealPortionType,
} from '@repo/api-contract';
import { mealPortionFactor } from '@repo/utils';
import { AsyncGate } from '../../lib/async-gate.js';
import { normalizeTerm } from '../../lib/text.js';
import type { FoodMatch, FoodService } from '../food/food.service.js';
import { mealServingNutrition, type ServingCatalogRow } from '../food/food-serving.js';
import { compositionKey, isCompositionCandidate, type MenuComposition } from '../food/menu-composition.js';
import type { MenuCompositionService, MenuLine } from '../food/menu-composition.service.js';
import { parseMenuName, type MenuKcalResult, type MenuNutritionResolver } from '../food/menu-nutrition.js';
import type { MealNutritionEstimator } from './meal-nutrition-estimate.js';

// 식당 메뉴에서 넣기 — 기록에 식당이 정해지면 그 집 등록 메뉴를 "넣을 음식"으로 바꿔 준다.
//
// 메뉴명은 그 집 표기 그대로 두고(항목의 menuName 스냅샷), 기록에 들어갈 이름은 메뉴 칼로리 규칙 엔진이 이은 카탈로그
// 음식의 이름(표준명)이다 — "특곰탕" → 곰탕, "차돌된장찌개" → 된장찌개. 통계는 표준명으로 묶이고 화면은 메뉴명을 앞에
// 보여 준다.
//   - 이름으로 쓰는 매칭은 같은 음식이라고 볼 수 있는 것만(standardFoodId) — 표기·수식어 차이, 그리고 이은 음식이
//     메뉴명의 절반 이상인 접미. 그 밖의 메뉴는 다듬은 메뉴명 그대로(foodId null) — 자유 입력과 같아서 저장할 때 서버가
//     다시 맞춰 본다. LLM 매칭 캐시도 이름에 쓰지 않는다 — 그건 열량을 빌릴 가까운 음식이지 같은 음식이 아니다
//     ("우거지탕" → 해장국).
//   - '+'·'&' 로 이은 세트("돈가스 + 우동")는 구성요소가 **모두** 카탈로그로 이어질 때만 풀어 준다. 하나라도 못 이으면
//     ("야키토리 7종 + 우동 SET") 조각난 이름이 기록에 남으므로 메뉴 한 줄로 둔다.
//   - 이름으로 못 이은 코스·세트("이 코스(2인이상)")는 **설명**에 적힌 구성으로 푼다 — 읽는 것은 LLM 이 한 번 해 두고
//     (menu_llm_compositions) 여기서는 저장된 구성만 본다. 정해진 구성은 foods, 그중 하나를 고르는 것("짜장, 짬뽕 택1")은
//     choices. 코스는 여러 접시를 조금씩 먹으니 구성마다 양을 '조금'으로 준다.
//   - 열량은 저장 때와 같은 계산(카탈로그 매칭 → mealServingNutrition → 이름 추정 캐시)이라 넣은 뒤 숫자가 달라지지 않는다.
// 응답은 DB 만 읽는다(식당을 고를 때마다 불린다). 아직 읽지 않은 구성이 있으면 응답 뒤 백그라운드로 읽고(pending),
// 화면이 잠시 뒤 다시 부른다.

// 폭주 방지 — 메뉴가 비정상적으로 많은 스냅샷(메뉴 칼로리와 같은 상한).
const MAX_MENUS = 200;
// 세트 한 메뉴가 풀리는 음식 수 상한.
const MAX_FOODS_PER_MENU = 6;
// 기록 항목 이름 한도(MealItemInput.name).
const ITEM_NAME_MAX = 60;

// 구성 읽기(백그라운드) — 프로세스 전역 1개, 대기 2. 한 식당에서 한 번에 읽는 양은 readMany 상한(30) × 이 횟수.
const READ_CHAINS = 1;
const READ_QUEUE = 2;
const MAX_READ_ROUNDS = 4;
// 한 줄도 못 읽었으면(LLM 미설정·장애) 이만큼은 그 식당을 다시 시도하지 않는다 — 화면이 pending 만 보고 돌지 않게.
const READ_RETRY_AFTER_MS = 10 * 60_000;
// 읽은 구성의 음식 가운데 열량을 모르는 이름을 미리 물어 두는 상한(이름 추정 — 저장 때 쓰는 것과 같은 캐시).
const WARM_NAMES_MAX = 40;
// 이름 → 카탈로그 매칭 메모(같은 식당을 다시 부를 때 — pending 동안 몇 초 간격으로 불린다).
const MATCH_MEMO_TTL_MS = 10 * 60_000;
const MATCH_MEMO_MAX = 5000;

// 곁들임으로 넣는 조리 형태 — 김치·나물(빠른 추가·음식 찾기와 같은 기준)과 음료·주류(사진 인식도 음료는 곁들임으로 둔다).
const SIDE_DISH_TYPES: ReadonlySet<string> = new Set([...MEAL_SIDE_DEFAULT_DISH_TYPES, 'beverage', 'alcohol']);

// 코스 — 여러 접시를 조금씩 먹는다. 구성마다 양을 '조금'으로 넣는다.
const COURSE_RE = /코스|course/i;
// 가격 칸이 '무료'인 줄은 메뉴가 아니라 안내문이다("매장 식사 시 순두부찌개 제공") — 구성으로 읽지 않는다.
const FREE_RE = /무료/;

const FOOD_SELECT = {
  id: true,
  name: true,
  source: true,
  sourceCategory: true,
  dishType: true,
  mainIngredient: true,
  cuisine: true,
  servingG: true,
  kcal: true,
  kcalPer100g: true,
  proteinG: true,
  sodiumMg: true,
  nutritionFrom: true,
} as const;

type FoodRow = ServingCatalogRow & { id: string; mainIngredient: string | null; cuisine: string | null };

export interface MealPlaceMenuSource {
  name: string;
  menus: { name: string; price?: string | null; recommend?: boolean | null; description?: string | null }[];
}

export interface MealPlaceMenuServiceDeps {
  prisma: PrismaClient;
  food: Pick<FoodService, 'servingLexicon' | 'matchFood'>;
  resolver: Pick<MenuNutritionResolver, 'resolveMany'>;
  /** 카탈로그 행에 영양이 비었을 때만 본다(저장 경로와 같은 캐시 조회). 없으면 그 열량은 빈 채로. */
  estimator?: Pick<MealNutritionEstimator, 'lookup' | 'ask'>;
  /** 메뉴 설명의 구성 읽기(LLM, 글 단위 캐시). 없으면 구성을 풀지 않는다(테스트 환경). */
  compositions?: Pick<MenuCompositionService, 'lookupCached' | 'readMany'>;
  /** placeId 의 식당 이름과 공개 메뉴(상세 응답과 같은 목록). 식당이 없으면 null. */
  loadPlace: (placeId: string) => Promise<MealPlaceMenuSource | null>;
  logger?: FastifyBaseLogger;
  gate?: AsyncGate;
}

/** 식당이 적은 가격 표기 → 원. "9,000원"·"9000"만 값으로 보고 "가격 변동"·"무료"·범위("16,000~31,000원")는 null. */
export const parseMenuPrice = (raw: string | null | undefined): number | null => {
  if (!raw) return null;
  const digits = raw.replace(/[,\s]/g, '').replace(/원$/, '');
  return /^\d{1,9}$/.test(digits) ? Number(digits) : null;
};

/** 카탈로그로 못 이은 메뉴의 기록 이름 — 태그·중량·인분 표식을 뗀 이름. 다 떼어져 비면 원래 표기. */
const plainName = (menuName: string): string => {
  const cleaned = parseMenuName(menuName).cleaned.trim();
  return (cleaned || menuName.trim()).slice(0, ITEM_NAME_MAX);
};

const enumOrNull = <T extends string>(
  schema: { safeParse: (v: unknown) => { success: boolean; data?: T } },
  v: string | null,
): T | null => {
  if (v === null) return null;
  const r = schema.safeParse(v);
  return r.success ? (r.data as T) : null;
};

const foodKey = (name: string): string => name.trim().toLocaleLowerCase().replace(/\s+/g, '');

interface MenuMeta {
  price: number | null;
  recommend: boolean;
  description: string | null;
  /** 가격 칸이 '무료' — 안내문. */
  free: boolean;
}

export class MealPlaceMenuService {
  private readonly gate: AsyncGate;
  // 구성을 읽는 중인 식당.
  private readonly reading = new Set<string>();
  // 한 줄도 못 읽은 식당 → 다시 시도할 수 있는 시각.
  private readonly retryAt = new Map<string, number>();
  private readonly matchMemo = new Map<string, { at: number; match: FoodMatch | null }>();

  constructor(private readonly deps: MealPlaceMenuServiceDeps) {
    this.gate = deps.gate ?? new AsyncGate(READ_CHAINS, { maxQueue: READ_QUEUE });
  }

  async forPlace(placeId: string): Promise<MealPlaceMenusResultType | null> {
    const place = await this.deps.loadPlace(placeId);
    if (!place) return null;

    // 같은 메뉴가 '대표메뉴'와 제 분류에 두 번 실리는 일이 있다 — 처음 나온 자리에 한 번만, 대표 표시는 합친다.
    const byName = new Map<string, MenuMeta>();
    for (const menu of place.menus) {
      const name = menu.name.trim();
      if (!name) continue;
      const seen = byName.get(name);
      if (seen) {
        seen.recommend ||= menu.recommend === true;
        seen.price ??= parseMenuPrice(menu.price);
        seen.description ??= menu.description?.trim() || null;
        continue;
      }
      if (byName.size >= MAX_MENUS) continue;
      byName.set(name, {
        price: parseMenuPrice(menu.price),
        recommend: menu.recommend === true,
        description: menu.description?.trim() || null,
        free: FREE_RE.test(menu.price ?? ''),
      });
    }
    const names = [...byName.keys()];
    if (names.length === 0) return { placeId, placeName: place.name, menus: [] };

    const resolved = await this.deps.resolver.resolveMany(names);
    // 메뉴마다 넣을 음식의 재료 — 카탈로그로 이었으면 foodId, 못 이었으면 다듬은 이름.
    const plans = names.map((name) => ({ name, parts: partsOf(name, resolved.get(name)) }));

    // 이름으로 못 이은 한 줄 메뉴 가운데 구성·고르기 표식이 있는 것 — 저장된 구성이 있으면 그것으로 푼다.
    const lineOf = new Map<string, MenuLine>();
    if (this.deps.compositions) {
      for (const plan of plans) {
        const meta = byName.get(plan.name)!;
        if (plan.parts.length !== 1 || plan.parts[0]!.foodId !== null || meta.free) continue;
        if (isCompositionCandidate(plan.name, meta.description)) {
          lineOf.set(plan.name, { name: plan.name, description: meta.description });
        }
      }
    }
    const lines = [...lineOf.values()];
    const cached =
      lines.length > 0 ? await this.deps.compositions!.lookupCached(lines) : new Map<string, MenuComposition | null>();
    const compositionOf = (name: string): MenuComposition | null => {
      const line = lineOf.get(name);
      return line ? (cached.get(compositionKey(line.name, line.description)) ?? null) : null;
    };
    const unread = lines.filter((line) => !cached.has(compositionKey(line.name, line.description)));

    // 구성 음식 이름도 엔진으로 먼저 잇는다(수식어·표기 차이까지 같은 음식으로 본다).
    const componentNames = [
      ...new Set(
        plans.flatMap((plan) => {
          const c = compositionOf(plan.name);
          return c ? [...c.fixed, ...c.choices.flatMap((g) => g.options)] : [];
        }),
      ),
    ];
    const componentResolved =
      componentNames.length > 0
        ? await this.deps.resolver.resolveMany(componentNames)
        : new Map<string, MenuKcalResult>();
    const componentFoodId = (name: string): string | null => standardFoodId(name, componentResolved.get(name));

    const foodIds = [
      ...new Set([
        ...plans.flatMap((p) => p.parts.flatMap((part) => (part.foodId ? [part.foodId] : []))),
        ...componentNames.flatMap((name) => {
          const id = componentFoodId(name);
          return id ? [id] : [];
        }),
      ]),
    ];
    const [rows, lexicon] = await Promise.all([
      foodIds.length > 0
        ? this.deps.prisma.foodItem.findMany({ where: { id: { in: foodIds }, active: true }, select: FOOD_SELECT })
        : Promise.resolve([]),
      this.deps.food.servingLexicon(),
    ]);
    const rowById = new Map<string, FoodRow>(rows.map((row) => [row.id, row]));

    const scaled = (kcal: number | null, portion: MealPortionType | undefined): number | null =>
      kcal === null ? null : Math.round(kcal * mealPortionFactor(portion));

    // 카탈로그 행으로 이은 음식 — 표준명·분류·1인분 열량.
    const fromRow = async (row: FoodRow, portion?: MealPortionType): Promise<MealPlaceMenuFoodType> => {
      const isMain = !SIDE_DISH_TYPES.has(row.dishType ?? '');
      let nutrition = mealServingNutrition(row, { isMain }, lexicon);
      if (nutrition.basis === 'missing' && this.deps.estimator) {
        const { estimate } = await this.deps.estimator.lookup(row.name, isMain);
        if (estimate) nutrition = estimate;
      }
      return {
        name: row.name,
        foodId: row.id,
        dishType: enumOrNull(FoodDishType, row.dishType),
        mainIngredient: enumOrNull(FoodMainIngredient, row.mainIngredient),
        cuisine: enumOrNull(FoodCuisine, row.cuisine),
        isMain,
        kcal: scaled(nutrition.kcal, portion),
        ...(portion ? { portion } : {}),
      };
    };

    // 엔진이 못 이은 이름 — 기록에는 그 이름 그대로 들어가고(자유 입력과 같다), 열량은 저장할 때 서버가 붙일 값을
    // 미리 같은 순서로 계산해 보여 준다(카탈로그 이름 매칭 → 1인분 → 이름 추정 캐시). 이름이 정확히 같은 카탈로그
    // 음식이 있을 때만 표준명·분류를 싣는다 — 퍼지로 닿은 음식은 다른 음식일 수 있다.
    const fromName = async (name: string, portion?: MealPortionType): Promise<MealPlaceMenuFoodType> => {
      const match = await this.matchFood(name);
      const same = match && match.matchedBy !== 'fuzzy' ? match : null;
      const isMain = !SIDE_DISH_TYPES.has(same?.dishType ?? '');
      let nutrition = mealServingNutrition(match, { isMain }, lexicon);
      if (nutrition.basis === 'missing' && this.deps.estimator) {
        const { estimate } = await this.deps.estimator.lookup(name, isMain);
        if (estimate) nutrition = estimate;
      }
      return {
        name: same?.name ?? name,
        foodId: same?.foodId ?? null,
        dishType: same?.dishType ?? null,
        mainIngredient: same?.mainIngredient ?? null,
        cuisine: same?.cuisine ?? null,
        isMain,
        kcal: scaled(nutrition.kcal, portion),
        ...(portion ? { portion } : {}),
      };
    };

    const component = (name: string, portion?: MealPortionType): Promise<MealPlaceMenuFoodType> => {
      const id = componentFoodId(name);
      const row = id ? rowById.get(id) : undefined;
      return row ? fromRow(row, portion) : fromName(name.slice(0, ITEM_NAME_MAX), portion);
    };

    const menus: MealPlaceMenuType[] = [];
    for (const plan of plans) {
      const meta = byName.get(plan.name)!;
      const base = { menuName: plan.name, price: meta.price, recommend: meta.recommend };

      const composition = compositionOf(plan.name);
      if (composition) {
        const portion: MealPortionType | undefined = COURSE_RE.test(plan.name) ? 'small' : undefined;
        const composed = await composeMenu(composition, (name) => component(name, portion));
        if (composed) {
          menus.push({ ...base, ...composed });
          continue;
        }
      }

      let foods: MealPlaceMenuFoodType[];
      const rowsOfParts = plan.parts.map((part) => (part.foodId ? rowById.get(part.foodId) : undefined));
      if (rowsOfParts.every((row) => row !== undefined)) {
        foods = await Promise.all(rowsOfParts.map((row) => fromRow(row!)));
      } else {
        // 못 이은 메뉴이거나, 풀어 둔 구성요소 가운데 카탈로그 행이 사라진 것이 있으면(비활성) 메뉴 한 줄로 둔다.
        const single = await fromName(plainName(plan.name));
        // 메뉴명은 그 집 표기라, 이름이 같은 카탈로그 음식이 있더라도 여기서는 잇지 않는다(엔진이 같은 음식으로 보지 않았다).
        foods = [{ ...single, name: plainName(plan.name), foodId: null, dishType: null, mainIngredient: null, cuisine: null }];
      }
      menus.push({ ...base, foods });
    }

    const pending = unread.length > 0 ? this.startReading(placeId, unread) : this.reading.has(placeId);
    return { placeId, placeName: place.name, menus, ...(pending ? { pending: true } : {}) };
  }

  private async matchFood(name: string): Promise<FoodMatch | null> {
    const key = normalizeTerm(name);
    const hit = this.matchMemo.get(key);
    if (hit && Date.now() - hit.at < MATCH_MEMO_TTL_MS) return hit.match;
    const match = await this.deps.food.matchFood(name);
    if (this.matchMemo.size >= MATCH_MEMO_MAX) this.matchMemo.clear();
    this.matchMemo.set(key, { at: Date.now(), match });
    return match;
  }

  /**
   * 아직 읽지 않은 메뉴 글을 백그라운드로 읽는다. 읽는 중(이미 읽고 있었거나 지금 시작)이면 true — 화면이 잠시 뒤 다시
   * 부른다. 자리가 없거나 방금 한 줄도 못 읽은 식당이면 false(다음에 그 식당을 고를 때 다시 시도).
   */
  private startReading(placeId: string, lines: MenuLine[]): boolean {
    if (!this.deps.compositions) return false;
    if (this.reading.has(placeId)) return true;
    if ((this.retryAt.get(placeId) ?? 0) > Date.now()) return false;
    const immediate = this.gate.tryAcquire();
    if (!immediate && this.gate.queued >= READ_QUEUE) return false;
    this.reading.add(placeId);
    void (async () => {
      const release = immediate ?? (await this.gate.acquire());
      try {
        const read = await this.readAndWarm(lines);
        if (read === 0) this.retryAt.set(placeId, Date.now() + READ_RETRY_AFTER_MS);
        else this.retryAt.delete(placeId);
      } finally {
        release();
      }
    })()
      .catch((e: unknown) => {
        this.retryAt.set(placeId, Date.now() + READ_RETRY_AFTER_MS);
        this.deps.logger?.warn(
          { err: e instanceof Error ? e.message : String(e), placeId },
          '[meal-place-menu] 메뉴 구성 읽기 실패',
        );
      })
      .finally(() => {
        this.reading.delete(placeId);
      });
    return true;
  }

  // 구성을 읽고, 읽은 구성의 음식 가운데 열량을 모르는 이름은 이름 추정(LLM·웹)을 미리 물어 둔다 — 저장할 때 쓰는 것과
  // 같은 캐시라 코스를 넣기 전에도 목록에 열량이 보인다. 이번에 판정한 글 수를 돌려준다.
  private async readAndWarm(lines: MenuLine[]): Promise<number> {
    const fresh: MenuComposition[] = [];
    let read = 0;
    let remaining = lines;
    for (let round = 0; round < MAX_READ_ROUNDS && remaining.length > 0; round += 1) {
      const got = await this.deps.compositions!.readMany(remaining);
      if (got.size === 0) break;
      read += got.size;
      for (const composition of got.values()) if (composition) fresh.push(composition);
      remaining = remaining.filter((line) => !got.has(compositionKey(line.name, line.description)));
    }
    const estimator = this.deps.estimator;
    if (!estimator || fresh.length === 0) return read;
    const names = [...new Set(fresh.flatMap((c) => [...c.fixed, ...c.choices.flatMap((g) => g.options)]))];
    const ask: string[] = [];
    for (const name of names) {
      if (ask.length >= WARM_NAMES_MAX) break;
      const { estimate, askable } = await estimator.lookup(name, true);
      if (!estimate && askable) ask.push(name);
    }
    if (ask.length > 0) await estimator.ask(ask);
    return read;
  }
}

/**
 * 읽어 둔 구성 → 넣을 음식(정해진 구성)과 고르는 묶음. 표준명으로 바꾸고 나면 같은 음식이 되는 것은 하나로 합친다
 * ("참이슬, 처음처럼" → 소주) — 묶음의 선택지가 하나만 남으면 고를 것이 없으니 정해진 구성으로 옮긴다.
 * 정해진 구성이 표준명으로는 선택지와 같은 음식이 되면("백짬뽕 + (짜장, 짬뽕 택1)" 의 백짬뽕 → 짬뽕) 묶음은 그대로
 * 두고 그 구성을 적힌 이름으로 넣는다 — 고르는 것을 지우면 안 고른 음식까지 기록된다.
 * 남는 것이 없으면 null(메뉴 한 줄로 둔다).
 */
const composeMenu = async (
  composition: MenuComposition,
  toFood: (name: string) => Promise<MealPlaceMenuFoodType>,
): Promise<{ foods: MealPlaceMenuFoodType[]; choices?: MealPlaceMenuChoiceType[] } | null> => {
  // 묶음부터 — 묶음 안에서 같은 음식이 된 선택지는 하나로.
  const groups: { label: string | null; options: MealPlaceMenuFoodType[] }[] = [];
  const optionKeys = new Set<string>();
  for (const group of composition.choices) {
    const options: MealPlaceMenuFoodType[] = [];
    const keys = new Set<string>();
    for (const name of group.options) {
      const food = await toFood(name);
      const key = foodKey(food.name);
      if (keys.has(key)) continue;
      keys.add(key);
      options.push(food);
    }
    groups.push({ label: group.label, options });
    if (options.length >= 2) for (const key of keys) optionKeys.add(key);
  }

  const seen = new Set<string>();
  const foods: MealPlaceMenuFoodType[] = [];
  const addFixed = (food: MealPlaceMenuFoodType, written: string): void => {
    let fixed = food;
    if (optionKeys.has(foodKey(fixed.name))) {
      // 적힌 이름까지 선택지와 같으면 고르는 쪽이 맞다.
      if (optionKeys.has(foodKey(written))) return;
      fixed = { ...fixed, name: written, foodId: null, dishType: null, mainIngredient: null, cuisine: null };
    }
    const key = foodKey(fixed.name);
    if (seen.has(key)) return;
    seen.add(key);
    foods.push(fixed);
  };
  for (const name of composition.fixed) addFixed(await toFood(name), name.slice(0, ITEM_NAME_MAX));

  const choices: MealPlaceMenuChoiceType[] = [];
  for (const group of groups) {
    if (group.options.length >= 2) choices.push(group);
    else if (group.options.length === 1) addFixed(group.options[0]!, group.options[0]!.name);
  }
  if (foods.length === 0 && choices.length === 0) return null;
  return { foods, ...(choices.length > 0 ? { choices } : {}) };
};

interface MenuPart {
  foodId: string | null;
  fallbackName: string;
}

// 이름이 같은 음식이라고 볼 수 있는 매칭(메뉴 칼로리가 1인분 표시를 허용하는 것과 같은 묶음) — 표기 차이·수식어뿐이다.
const SAME_FOOD_MATCHES: ReadonlySet<string> = new Set(['exact', 'alias', 'synonym', 'modifier']);
// 접미 매칭("차돌된장찌개" → 된장찌개)은 이은 음식 이름이 메뉴명의 이만큼은 차지할 때만 이름으로 쓴다. 운영 메뉴
// 6,125종 실측(2026-11-13): 접미로 이어진 1,417종에 "어향완자가지" → 가지, "(씬) 불고기 깻잎 피자" → 피자처럼 끝말만
// 같은 것이 섞여 있다 — 열량을 빌리기엔 괜찮아도 기록의 이름으로는 다른 음식이다.
const SUFFIX_MIN_COVERAGE = 0.5;

/**
 * 엔진이 이은 카탈로그 음식을 기록의 이름(표준명)으로 써도 되는지. 재료로 되돌린 매칭(variant: "대하구이" → 대하)과
 * 괄호 힌트(hint: "초당옥수수(치즈)" → 치즈)는 열량용 근사라 쓰지 않는다 — 그런 메뉴는 메뉴명 그대로 들어가고,
 * 저장할 때 서버가 자유 입력과 같이 열량만 "○○ 기준 추정"으로 붙인다.
 */
export const standardFoodId = (menuName: string, r: MenuKcalResult | undefined): string | null => {
  if (!r?.foodId || !r.foodName || !r.matchedBy) return null;
  if (SAME_FOOD_MATCHES.has(r.matchedBy)) return r.foodId;
  if (r.matchedBy !== 'suffix') return null;
  const whole = normalizeTerm(parseMenuName(menuName).cleaned).length;
  return whole > 0 && normalizeTerm(r.foodName).length / whole >= SUFFIX_MIN_COVERAGE ? r.foodId : null;
};

// 풀어 넣는 세트는 '+'·'&' 로 이은 것만 — 쉼표·빗금은 고르는 것일 수 있다("음료수(콜라,사이다)", "파스타 / 리조또").
const JOINED_SET_RE = /[+&]/;
const CHOICE_RE = /[,/]/;

const partsOf = (menuName: string, r: MenuKcalResult | undefined): MenuPart[] => {
  const single: MenuPart[] = [{ foodId: standardFoodId(menuName, r), fallbackName: plainName(menuName) }];
  const components = r?.components ?? [];
  if (components.length < 2 || components.length > MAX_FOODS_PER_MENU) return single;
  if (!JOINED_SET_RE.test(menuName) || CHOICE_RE.test(menuName)) return single;
  // 구성요소가 모두 이어질 때만 푼다. 같은 음식이 두 번이면(같은 표준명) 풀 뜻이 없다.
  const ids = components.map((c) => standardFoodId(c.name, c));
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) return single;
  return components.map((c, i) => ({ foodId: ids[i]!, fallbackName: plainName(c.name) }));
};
