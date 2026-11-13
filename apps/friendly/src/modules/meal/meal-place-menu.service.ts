import type { PrismaClient } from '@prisma/client';
import {
  FoodCuisine,
  FoodDishType,
  FoodMainIngredient,
  MEAL_SIDE_DEFAULT_DISH_TYPES,
  type MealPlaceMenuFoodType,
  type MealPlaceMenuType,
  type MealPlaceMenusResultType,
} from '@repo/api-contract';
import { normalizeTerm } from '../../lib/text.js';
import type { FoodService } from '../food/food.service.js';
import { mealServingNutrition, type ServingCatalogRow } from '../food/food-serving.js';
import { parseMenuName, type MenuKcalResult, type MenuNutritionResolver } from '../food/menu-nutrition.js';
import type { MealNutritionEstimator } from './meal-nutrition-estimate.js';

// 식당 메뉴에서 넣기 — 기록에 식당이 정해지면 그 집 등록 메뉴를 "넣을 음식"으로 바꿔 준다.
//
// 메뉴명은 그 집 표기 그대로 두고(항목의 menuName 스냅샷), 기록에 들어갈 이름은 메뉴 칼로리 규칙 엔진이 이은 카탈로그
// 음식의 이름(표준명)이다 — "특곰탕" → 곰탕, "차돌된장찌개" → 된장찌개. 통계는 표준명으로 묶이고 화면은 메뉴명을 앞에
// 보여 준다.
//   - 이름으로 쓰는 매칭은 같은 음식이라고 볼 수 있는 것만(standardFoodId) — 표기·수식어 차이, 그리고 이은 음식이
//     메뉴명의 절반 이상인 접미. 그 밖의 메뉴는 다듬은 메뉴명 그대로(foodId null) — 자유 입력과 같아서 저장할 때 서버가
//     다시 맞춰 보고 열량은 "○○ 기준 추정"으로 붙인다. LLM 매칭 캐시도 이름에 쓰지 않는다 — 그건 열량을 빌릴 가까운
//     음식이지 같은 음식이 아니다("우거지탕" → 해장국).
//   - '+'·'&' 로 이은 세트("돈가스 + 우동")는 구성요소가 **모두** 카탈로그로 이어질 때만 풀어 준다. 하나라도 못 이으면
//     ("야키토리 7종 + 우동 SET") 조각난 이름이 기록에 남으므로 메뉴 한 줄로 둔다.
//   - 열량은 저장 때와 같은 계산(mealServingNutrition → 못 채우면 이름 추정 캐시)이라 넣은 뒤 숫자가 달라지지 않는다.
// DB 만 읽는다(LLM·웹 호출 없음) — 식당을 고를 때마다 불린다.

// 폭주 방지 — 메뉴가 비정상적으로 많은 스냅샷(메뉴 칼로리와 같은 상한).
const MAX_MENUS = 200;
// 세트 한 메뉴가 풀리는 음식 수 상한.
const MAX_FOODS_PER_MENU = 6;
// 기록 항목 이름 한도(MealItemInput.name).
const ITEM_NAME_MAX = 60;

// 곁들임으로 넣는 조리 형태 — 김치·나물(빠른 추가·음식 찾기와 같은 기준)과 음료·주류(사진 인식도 음료는 곁들임으로 둔다).
const SIDE_DISH_TYPES: ReadonlySet<string> = new Set([...MEAL_SIDE_DEFAULT_DISH_TYPES, 'beverage', 'alcohol']);

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
  menus: { name: string; price?: string | null; recommend?: boolean | null }[];
}

export interface MealPlaceMenuServiceDeps {
  prisma: PrismaClient;
  food: Pick<FoodService, 'servingLexicon'>;
  resolver: Pick<MenuNutritionResolver, 'resolveMany'>;
  /** 카탈로그 행에 영양이 비었을 때만 본다(저장 경로와 같은 캐시 조회). 없으면 그 열량은 빈 채로. */
  estimator?: Pick<MealNutritionEstimator, 'lookup'>;
  /** placeId 의 식당 이름과 공개 메뉴(상세 응답과 같은 목록). 식당이 없으면 null. */
  loadPlace: (placeId: string) => Promise<MealPlaceMenuSource | null>;
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

export class MealPlaceMenuService {
  constructor(private readonly deps: MealPlaceMenuServiceDeps) {}

  async forPlace(placeId: string): Promise<MealPlaceMenusResultType | null> {
    const place = await this.deps.loadPlace(placeId);
    if (!place) return null;

    // 같은 메뉴가 '대표메뉴'와 제 분류에 두 번 실리는 일이 있다 — 처음 나온 자리에 한 번만, 대표 표시는 합친다.
    const byName = new Map<string, { price: number | null; recommend: boolean }>();
    for (const menu of place.menus) {
      const name = menu.name.trim();
      if (!name) continue;
      const seen = byName.get(name);
      if (seen) {
        seen.recommend ||= menu.recommend === true;
        seen.price ??= parseMenuPrice(menu.price);
        continue;
      }
      if (byName.size >= MAX_MENUS) continue;
      byName.set(name, { price: parseMenuPrice(menu.price), recommend: menu.recommend === true });
    }
    const names = [...byName.keys()];
    if (names.length === 0) return { placeId, placeName: place.name, menus: [] };

    const resolved = await this.deps.resolver.resolveMany(names);
    // 메뉴마다 넣을 음식의 재료 — 카탈로그로 이었으면 foodId, 못 이었으면 다듬은 이름.
    const plans = names.map((name) => ({ name, parts: partsOf(name, resolved.get(name)) }));
    const foodIds = [...new Set(plans.flatMap((p) => p.parts.flatMap((part) => (part.foodId ? [part.foodId] : []))))];
    const [rows, lexicon] = await Promise.all([
      foodIds.length > 0
        ? this.deps.prisma.foodItem.findMany({ where: { id: { in: foodIds }, active: true }, select: FOOD_SELECT })
        : Promise.resolve([]),
      this.deps.food.servingLexicon(),
    ]);
    const rowById = new Map<string, FoodRow>(rows.map((row) => [row.id, row]));

    const toFood = async (part: MenuPart): Promise<MealPlaceMenuFoodType> => {
      const row = part.foodId ? rowById.get(part.foodId) : undefined;
      if (!row) {
        return { name: part.fallbackName, foodId: null, dishType: null, mainIngredient: null, cuisine: null, isMain: true, kcal: null };
      }
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
        kcal: nutrition.kcal === null ? null : Math.round(nutrition.kcal),
      };
    };

    const menus: MealPlaceMenuType[] = [];
    for (const plan of plans) {
      const meta = byName.get(plan.name)!;
      let foods = await Promise.all(plan.parts.map(toFood));
      // 풀어 둔 구성요소 가운데 카탈로그 행이 사라진 것이 있으면(비활성) 세트를 다시 한 줄로 둔다.
      if (foods.length > 1 && foods.some((food) => food.foodId === null)) {
        foods = [await toFood({ foodId: null, fallbackName: plainName(plan.name) })];
      }
      menus.push({ menuName: plan.name, price: meta.price, recommend: meta.recommend, foods });
    }
    return { placeId, placeName: place.name, menus };
  }
}

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
