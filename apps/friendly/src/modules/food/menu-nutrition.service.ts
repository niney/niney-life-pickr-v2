// 공개 식당 메뉴 칼로리 — placeId 단위로 판정해 LRU 캐시.
//
// 상세(getPublicDetail)에 끼워 넣지 않고 별도 엔드포인트로 둔다: 상세는 과다로드로 한 번 최적화한
// 이력이 있고, 칼로리는 메뉴 탭에서만 필요하다. 메뉴명은 식당 스냅샷에서 가져오되(loadMenuNames),
// 식당 도메인에 의존하지 않도록 함수로 주입받는다.

import type { PrismaClient } from '@prisma/client';
import { LRUCache } from 'lru-cache';
import {
  MENU_NUTRITION_NOTICE,
  type RestaurantMenuKcalItemType,
  type RestaurantMenuNutritionType,
} from '@repo/api-contract';
import { FoodService } from './food.service.js';
import { MenuNutritionResolver, createMenuFoodLookup } from './menu-nutrition.js';

// 식당 하나의 메뉴명은 수십 개 → 카탈로그 조회 수백 번. 재크롤은 드물어 10분 캐시면 충분.
const CACHE_MAX = 500;
const CACHE_TTL_MS = 10 * 60 * 1000;
// 폭주 방지 — 메뉴가 비정상적으로 많은 스냅샷.
const MAX_MENU_NAMES = 200;

export interface MenuNutritionServiceDeps {
  prisma: PrismaClient;
  foodService?: Pick<FoodService, 'matchFood'>;
  /** placeId 의 공개 메뉴명(상세 응답과 같은 문자열). 식당이 없으면 null. */
  loadMenuNames: (placeId: string) => Promise<string[] | null>;
}

export class MenuNutritionService {
  private readonly cache = new LRUCache<string, RestaurantMenuNutritionType>({
    max: CACHE_MAX,
    ttl: CACHE_TTL_MS,
  });
  private readonly resolver: MenuNutritionResolver;

  constructor(private readonly deps: MenuNutritionServiceDeps) {
    const food = deps.foodService ?? new FoodService(deps.prisma);
    this.resolver = new MenuNutritionResolver(createMenuFoodLookup(deps.prisma, food));
  }

  async forPlace(placeId: string): Promise<RestaurantMenuNutritionType | null> {
    const hit = this.cache.get(placeId);
    if (hit) return hit;

    const names = await this.deps.loadMenuNames(placeId);
    if (names === null) return null;
    const unique = [...new Set(names.map((n) => n.trim()).filter((n) => n.length > 0))].slice(
      0,
      MAX_MENU_NAMES,
    );
    const resolved = await this.resolver.resolveMany(unique);

    const items: RestaurantMenuKcalItemType[] = [];
    for (const name of unique) {
      const r = resolved.get(name);
      if (!r || !r.basis || r.kcal === null || !r.foodName || !r.matchedBy) continue;
      items.push({
        name,
        basis: r.basis,
        kcal: r.kcal,
        foodName: r.foodName,
        matchedBy: r.matchedBy,
        nutritionFrom: r.nutritionFrom,
      });
    }
    const result: RestaurantMenuNutritionType = { placeId, items, notice: MENU_NUTRITION_NOTICE };
    this.cache.set(placeId, result);
    return result;
  }

  /** 재크롤·카탈로그 재적재 뒤 호출용. placeId 없이 부르면 전체 비움. */
  invalidate(placeId?: string): void {
    if (placeId) this.cache.delete(placeId);
    else this.cache.clear();
  }
}
