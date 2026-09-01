// 공개 식당 메뉴 칼로리 — placeId 단위로 판정해 LRU 캐시.
//
// 상세(getPublicDetail)에 끼워 넣지 않고 별도 엔드포인트로 둔다: 상세는 과다로드로 한 번 최적화한
// 이력이 있고, 칼로리는 메뉴 탭에서만 필요하다. 메뉴명은 식당 스냅샷에서 가져오되(loadMenuNames),
// 식당 도메인에 의존하지 않도록 함수로 주입받는다.
//
// 세 단계:
//   (1) 규칙 매칭(menu-nutrition.ts) — 동기.
//   (2) 규칙이 못 잡은 이름 → LLM 매칭 캐시(menu-llm-match.service). 캐시에 없으면 백그라운드로 묻는다.
//   (3) LLM 도 카탈로그에서 못 찾은 이름 → 웹 실측 추정 캐시(food-web-estimate.service). 질의어는 LLM 이
//       낸 표준명(부타동→돼지고기덮밥), 없으면 전처리한 메뉴명. 캐시에 없으면 (2) 뒤에 이어서 조회한다.
// 진행 중이면 응답은 `llmPending: true` 로 나가고 LRU 에 넣지 않아 클라이언트가 다시 조회하면 채워진다.

import type { PrismaClient } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import { LRUCache } from 'lru-cache';
import {
  MENU_NUTRITION_NOTICE,
  type RestaurantMenuKcalItemType,
  type RestaurantMenuNutritionType,
} from '@repo/api-contract';
import { FoodService } from './food.service.js';
import type { FoodWebEstimateService } from './food-web-estimate.service.js';
import type { MenuLlmMatchService } from './menu-llm-match.service.js';
import { MenuNutritionResolver, createMenuFoodLookup, parseMenuName } from './menu-nutrition.js';

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
  /** 없으면 규칙 매칭만. */
  llm?: Pick<MenuLlmMatchService, 'lookupCached' | 'matchMany'>;
  /** 없으면 웹 추정 생략. llm 이 있어야 의미가 있다(질의어를 LLM 표준명에서 받는다). */
  web?: Pick<FoodWebEstimateService, 'lookupCached' | 'estimateMany'>;
  logger?: FastifyBaseLogger;
}

/** 웹 추정 질의어 — LLM 표준명이 있으면 그것, 없으면 전처리한 메뉴명(세트·빈 이름은 null). */
export const webQueryFor = (menuName: string, canonical: string | null): string | null => {
  if (canonical?.trim()) return canonical.trim();
  const parsed = parseMenuName(menuName);
  return parsed.isSet || !parsed.cleaned ? null : parsed.cleaned;
};

export class MenuNutritionService {
  private readonly cache = new LRUCache<string, RestaurantMenuNutritionType>({
    max: CACHE_MAX,
    ttl: CACHE_TTL_MS,
  });
  private readonly resolver: MenuNutritionResolver;
  // placeId → 진행 중인 백그라운드 판정(중복 기동 방지).
  private readonly inflight = new Map<string, Promise<void>>();

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
    const unresolved: string[] = [];
    for (const name of unique) {
      const r = resolved.get(name);
      if (!r) continue;
      if (r.basis && r.kcal !== null && r.foodName && r.matchedBy) {
        items.push({
          name,
          basis: r.basis,
          kcal: r.kcal,
          foodName: r.foodName,
          matchedBy: r.matchedBy,
          nutritionFrom: r.nutritionFrom,
        });
      } else if (r.reason === 'no_match' || r.reason === 'fuzzy_rejected') {
        unresolved.push(name);
      }
    }

    let pending = false;
    if (this.deps.llm && unresolved.length > 0) {
      const llmCached = await this.deps.llm.lookupCached(unresolved);
      const webQueries = new Map<string, string>(); // 메뉴명 → 웹 질의어
      for (const name of unresolved) {
        const m = llmCached.get(name);
        if (!m) continue;
        if (m.hit && m.hit.kcalPer100g !== null) {
          items.push({
            name,
            basis: 'per_100g',
            kcal: Math.round(m.hit.kcalPer100g),
            foodName: m.hit.foodName,
            matchedBy: 'llm',
            nutritionFrom: m.hit.nutritionFrom,
          });
        } else if (!m.hit && this.deps.web) {
          const q = webQueryFor(name, m.canonical);
          if (q) webQueries.set(name, q);
        }
      }
      const unknownLlm = unresolved.filter((n) => !llmCached.has(n));

      let unknownWeb: string[] = [];
      if (this.deps.web && webQueries.size > 0) {
        const webCached = await this.deps.web.lookupCached([...new Set(webQueries.values())]);
        for (const [name, q] of webQueries) {
          const w = webCached.get(q);
          if (w) {
            items.push({
              name,
              basis: 'per_100g',
              kcal: Math.round(w.kcalPer100g),
              foodName: q,
              matchedBy: 'web',
              nutritionFrom:
                w.basis === 'single' ? `${w.source} 일반 항목` : `${w.source} ${w.agreeing}건 중앙값`,
            });
          }
        }
        unknownWeb = [...new Set([...webQueries.values()].filter((q) => !webCached.has(q)))];
      }

      if (unknownLlm.length > 0 || unknownWeb.length > 0) {
        pending = true;
        this.kickBackground(placeId, unknownLlm, unknownWeb);
      }
    }

    // 원래 메뉴 순서대로.
    const order = new Map(unique.map((n, i) => [n, i]));
    items.sort((a, b) => (order.get(a.name) ?? 0) - (order.get(b.name) ?? 0));

    const result: RestaurantMenuNutritionType = {
      placeId,
      items,
      notice: MENU_NUTRITION_NOTICE,
      llmPending: pending,
    };
    // 판정 중인 결과는 캐시하지 않는다 — 다음 조회에서 캐시를 다시 읽어 채운다.
    if (!pending) this.cache.set(placeId, result);
    return result;
  }

  // LLM 판정 → 그 결과로 웹 질의어를 정해 웹 추정 순으로 이어서 돈다.
  private kickBackground(placeId: string, llmNames: string[], webQueries: string[]): void {
    if (this.inflight.has(placeId)) return;
    const run = (async () => {
      const queries = new Set(webQueries);
      if (llmNames.length > 0 && this.deps.llm) {
        const verdicts = await this.deps.llm.matchMany(llmNames);
        if (this.deps.web) {
          for (const [name, v] of verdicts) {
            if (v.hit) continue;
            const q = webQueryFor(name, v.canonical);
            if (q) queries.add(q);
          }
        }
      }
      if (queries.size > 0 && this.deps.web) await this.deps.web.estimateMany([...queries]);
    })()
      .catch((e: unknown) => {
        this.deps.logger?.warn(
          { err: e instanceof Error ? e.message : String(e), placeId },
          '[menu-nutrition] 백그라운드 판정 실패',
        );
      })
      .finally(() => {
        this.inflight.delete(placeId);
      });
    this.inflight.set(placeId, run);
  }

  /** 테스트·관리용 — 진행 중인 백그라운드 판정이 끝날 때까지 기다린다. */
  async waitForLlm(placeId: string): Promise<void> {
    await this.inflight.get(placeId);
  }

  /** 재크롤·카탈로그 재적재 뒤 호출용. placeId 없이 부르면 전체 비움. */
  invalidate(placeId?: string): void {
    if (placeId) this.cache.delete(placeId);
    else this.cache.clear();
  }
}
