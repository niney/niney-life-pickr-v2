// 공개 식당 메뉴 칼로리 — placeId 단위로 판정해 LRU 캐시.
//
// 상세(getPublicDetail)에 끼워 넣지 않고 별도 엔드포인트로 둔다: 상세는 과다로드로 한 번 최적화한
// 이력이 있고, 칼로리는 메뉴 탭에서만 필요하다. 메뉴명은 식당 스냅샷에서 가져오되(loadMenuNames),
// 식당 도메인에 의존하지 않도록 함수로 주입받는다.
//
// 단계:
//   (1) 엔진(규칙, menu-nutrition.ts) — 동기. 결합 기호 세트는 구성요소까지 나눠 준다.
//   (2) 규칙이 못 잡은 이름(세트 구성요소 포함) → LLM 매칭 캐시(menu-llm-match.service). 캐시에 없으면
//       백그라운드로 묻는다. LLM 표준명은 엔진에 다시 넣어 수식어·접미 규칙을 적용한다.
//   (3) LLM 도 카탈로그에서 못 찾은 이름 → 웹 실측 추정 캐시(food-web-estimate.service).
//   (4) 구성이 이름에 없는 세트("모듬회") → LLM 분해 캐시(menu-llm-decompose.service) → 구성요소를 (1)~(2)로.
//       추정 구성이라 `partsEstimated` 로 표시한다.
// 진행 중이면 응답은 `llmPending: true` 로 나가고 LRU 에 넣지 않아 클라이언트가 다시 조회하면 채워진다.

import type { PrismaClient } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import { LRUCache } from 'lru-cache';
import {
  MENU_NUTRITION_NOTICE,
  type RestaurantMenuKcalItemType,
  type RestaurantMenuKcalPartType,
  type RestaurantMenuNutritionType,
} from '@repo/api-contract';
import type { FoodWebEstimateService } from './food-web-estimate.service.js';
import type { MenuLlmDecomposeService } from './menu-llm-decompose.service.js';
import type { MenuLlmMatchLookup, MenuLlmMatchService } from './menu-llm-match.service.js';
import { guessDishTypeFromName } from '@repo/utils';
import {
  DEFAULT_LEXICON,
  MenuNutritionResolver,
  computePortion,
  parseMenuName,
  type MenuKcalResult,
  type MenuNutritionEngine,
} from './menu-nutrition.js';
import { normalizeTerm } from '../../lib/text.js';

// 식당 하나의 메뉴명은 수십 개 → 카탈로그 조회 수백 번. 재크롤은 드물어 10분 캐시면 충분.
const CACHE_MAX = 500;
const CACHE_TTL_MS = 10 * 60 * 1000;
// 폭주 방지 — 메뉴가 비정상적으로 많은 스냅샷.
const MAX_MENU_NAMES = 200;

export interface MenuNutritionServiceDeps {
  prisma: PrismaClient;
  /** 테스트용 — 주면 Prisma 인덱스 대신 이 엔진으로 판정한다. */
  engine?: MenuNutritionEngine;
  /** placeId 의 공개 메뉴명(상세 응답과 같은 문자열). 식당이 없으면 null. */
  loadMenuNames: (placeId: string) => Promise<string[] | null>;
  /** 없으면 규칙 매칭만. */
  llm?: Pick<MenuLlmMatchService, 'lookupCached' | 'matchMany'>;
  /** 없으면 웹 추정 생략. llm 이 있어야 의미가 있다(질의어를 LLM 표준명에서 받는다). */
  web?: Pick<FoodWebEstimateService, 'lookupCached' | 'estimateMany'>;
  /** 없으면 구성이 이름에 없는 세트는 미표시. */
  decompose?: Pick<MenuLlmDecomposeService, 'lookupCached' | 'decomposeMany'>;
  logger?: FastifyBaseLogger;
}

/** 웹 추정 질의어 — LLM 표준명이 있으면 그것, 없으면 전처리한 메뉴명(세트·빈 이름은 null). */
export const webQueryFor = (menuName: string, canonical: string | null): string | null => {
  if (canonical?.trim()) {
    // 범주어(음료·고기·술)는 검색해도 특정 음식이 아니다 — 애매하면 미표시.
    if (DEFAULT_LEXICON.suffixBlock.has(normalizeTerm(canonical))) return null;
    return canonical.trim();
  }
  const parsed = parseMenuName(menuName);
  return parsed.isSet || !parsed.cleaned ? null : parsed.cleaned;
};

type Resolver = Pick<MenuNutritionResolver, 'resolveMany' | 'resolve'>;

interface SetDraft {
  name: string;
  components: MenuKcalResult[];
  estimated: boolean;
}

export class MenuNutritionService {
  private readonly cache = new LRUCache<string, RestaurantMenuNutritionType>({
    max: CACHE_MAX,
    ttl: CACHE_TTL_MS,
  });
  private readonly resolver: Resolver;
  // placeId → 진행 중인 백그라운드 판정(중복 기동 방지).
  private readonly inflight = new Map<string, Promise<void>>();

  constructor(private readonly deps: MenuNutritionServiceDeps) {
    this.resolver = deps.engine
      ? {
          resolveMany: async (names) => deps.engine!.resolveMany(names),
          resolve: async (name) => deps.engine!.resolve(name),
        }
      : new MenuNutritionResolver(deps.prisma);
  }

  async forPlace(placeId: string): Promise<RestaurantMenuNutritionType | null> {
    const hit = this.cache.get(placeId);
    if (hit) return hit;

    const names = await this.deps.loadMenuNames(placeId);
    if (names === null) return null;
    const unique = [...new Set(names.map((n) => n.trim()).filter((n) => n.length > 0))].slice(0, MAX_MENU_NAMES);
    const resolved = await this.resolver.resolveMany(unique);

    const items: RestaurantMenuKcalItemType[] = [];
    // 규칙이 못 잡은 이름(LLM 후보) — 메뉴명과 세트 구성요소 이름 모두.
    const unresolved = new Set<string>();
    const sets: SetDraft[] = [];
    // 구성이 이름에 없는 세트 — LLM 분해 후보.
    const opaqueSets: string[] = [];
    // 분해 결과가 한 개인 세트 — 세트명 → 주메뉴명(LLM·웹으로 채운다).
    const singleMains = new Map<string, string>();

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
          ...(r.portion ? { portion: r.portion } : {}),
        });
      } else if (r.reason === 'set') {
        if (r.components.length >= 2) {
          sets.push({ name, components: r.components, estimated: false });
          for (const c of r.components) if (!c.basis) unresolved.add(c.name);
        } else {
          opaqueSets.push(name);
        }
      } else if (r.reason === 'no_match' || r.reason === 'fuzzy_rejected') {
        unresolved.add(name);
      }
    }

    // (4) 구성이 이름에 없는 세트 — 분해 캐시.
    const unknownDecompose: string[] = [];
    if (this.deps.decompose && opaqueSets.length > 0) {
      const cached = await this.deps.decompose.lookupCached(opaqueSets);
      const toResolve: string[] = [];
      for (const name of opaqueSets) {
        if (!cached.has(name)) {
          unknownDecompose.push(name);
          continue;
        }
        const parts = cached.get(name);
        if (parts) toResolve.push(...parts);
      }
      const partResults = toResolve.length > 0 ? await this.resolver.resolveMany(toResolve) : new Map<string, MenuKcalResult>();
      for (const name of opaqueSets) {
        const parts = cached.get(name);
        if (!parts) continue;
        const components = parts.map((p) => partResults.get(p)!).filter(Boolean);
        if (components.length === 1) {
          // 주메뉴 하나짜리 세트 — 그 음식의 100g당(찬·양은 모른다). LLM 이 고른 이름이라 'llm' 로 표시.
          const c = components[0]!;
          if (c.kcalPer100g !== null && c.foodName) {
            items.push({ name, basis: 'per_100g', kcal: Math.round(c.kcalPer100g), foodName: c.foodName, matchedBy: 'llm', nutritionFrom: c.nutritionFrom });
          } else {
            unresolved.add(c.name);
            singleMains.set(name, c.name);
          }
          continue;
        }
        sets.push({ name, components, estimated: true });
        for (const c of components) if (!c.basis) unresolved.add(c.name);
      }
    }

    // (2) LLM 매칭 캐시 — 메뉴명과 구성요소를 한 번에.
    let pending = false;
    const llmByName = new Map<string, MenuLlmMatchLookup>();
    const llmResolved = new Map<string, { foodName: string; kcalPer100g: number; nutritionFrom: string | null; portionKey: string | null }>();
    const webQueries = new Map<string, string>(); // 이름 → 웹 질의어
    let unknownLlm: string[] = [];
    if (this.deps.llm && unresolved.size > 0) {
      const list = [...unresolved];
      const cached = await this.deps.llm.lookupCached(list);
      for (const [k, v] of cached) llmByName.set(k, v);
      unknownLlm = list.filter((n) => !cached.has(n));
      for (const name of list) {
        const m = cached.get(name);
        if (!m) continue;
        if (m.hit && m.hit.kcalPer100g !== null) {
          llmResolved.set(name, { foodName: m.hit.foodName, kcalPer100g: m.hit.kcalPer100g, nutritionFrom: m.hit.nutritionFrom, portionKey: m.hit.dishType });
          continue;
        }
        if (m.canonical) {
          // LLM 이 카탈로그 exact 로 못 붙인 표준명을 엔진(수식어·접미 규칙)에 다시 넣어 본다.
          const again = await this.resolver.resolve(m.canonical);
          if (again.kcalPer100g !== null && again.foodName) {
            llmResolved.set(name, { foodName: again.foodName, kcalPer100g: again.kcalPer100g, nutritionFrom: again.nutritionFrom, portionKey: again.portionKey });
            continue;
          }
        }
        if (this.deps.web) {
          const q = webQueryFor(name, m.canonical);
          if (q) webQueries.set(name, q);
        }
      }
    }

    // (3) 웹 실측 캐시.
    const webResolved = new Map<string, { foodName: string; kcalPer100g: number; nutritionFrom: string; portionKey: string | null }>();
    let unknownWeb: string[] = [];
    if (this.deps.web && webQueries.size > 0) {
      const webCached = await this.deps.web.lookupCached([...new Set(webQueries.values())]);
      for (const [name, q] of webQueries) {
        const w = webCached.get(q);
        if (w) {
          webResolved.set(name, {
            foodName: q,
            kcalPer100g: w.kcalPer100g,
            nutritionFrom: w.basis === 'single' ? `${w.source} 일반 항목` : `${w.source} ${w.agreeing}건 중앙값`,
            // 웹 항목은 카탈로그 행이 없어 이름으로 종류를 짐작한다.
            portionKey: guessDishTypeFromName(q),
          });
        }
      }
      unknownWeb = [...new Set([...webQueries.values()].filter((q) => !webCached.has(q)))];
    }

    // 단일 메뉴명의 LLM·웹 항목.
    for (const name of unresolved) {
      if (!unique.includes(name)) continue; // 구성요소·주메뉴 이름은 단독 항목으로 새지 않는다.
      const weight = parseMenuName(name).weight;
      const l = llmResolved.get(name);
      if (l) {
        const portion = computePortion(l.kcalPer100g, weight, l.portionKey, DEFAULT_LEXICON);
        items.push({ name, basis: 'per_100g', kcal: Math.round(l.kcalPer100g), foodName: l.foodName, matchedBy: 'llm', nutritionFrom: l.nutritionFrom, ...(portion ? { portion } : {}) });
        continue;
      }
      const w = webResolved.get(name);
      if (w) {
        const portion = computePortion(w.kcalPer100g, weight, w.portionKey, DEFAULT_LEXICON);
        items.push({ name, basis: 'per_100g', kcal: Math.round(w.kcalPer100g), foodName: w.foodName, matchedBy: 'web', nutritionFrom: w.nutritionFrom, ...(portion ? { portion } : {}) });
      }
    }

    for (const [setName, mainName] of singleMains) {
      const fill = llmResolved.get(mainName) ?? webResolved.get(mainName);
      if (fill) items.push({ name: setName, basis: 'per_100g', kcal: Math.round(fill.kcalPer100g), foodName: fill.foodName, matchedBy: 'llm', nutritionFrom: fill.nutritionFrom });
    }

    // 세트 항목 — 구성요소는 규칙 → LLM → 웹 순으로 채운다.
    for (const s of sets) {
      const parts: RestaurantMenuKcalPartType[] = [];
      for (const c of s.components) {
        if (c.basis && c.kcal !== null && c.foodName) {
          parts.push({ name: c.name, basis: c.basis, kcal: c.kcal, foodName: c.foodName });
          continue;
        }
        const fill = llmResolved.get(c.name) ?? webResolved.get(c.name);
        if (fill) parts.push({ name: c.name, basis: 'per_100g', kcal: Math.round(fill.kcalPer100g), foodName: fill.foodName });
      }
      if (parts.length === 0) continue;
      // 합계는 구성 전부가 1인분일 때만(분량을 모르면 합산하지 않는다).
      const allServing = parts.length === s.components.length && parts.every((p) => p.basis === 'per_serving');
      items.push({
        name: s.name,
        basis: 'components',
        kcal: allServing ? parts.reduce((a, p) => a + p.kcal, 0) : null,
        foodName: s.name,
        matchedBy: 'set',
        nutritionFrom: null,
        parts,
        partsTotal: s.components.length,
        ...(s.estimated ? { partsEstimated: true } : {}),
      });
    }

    if (unknownLlm.length > 0 || unknownWeb.length > 0 || unknownDecompose.length > 0) {
      pending = true;
      this.kickBackground(placeId, unknownLlm, unknownWeb, unknownDecompose);
    }

    // 원래 메뉴 순서대로.
    const order = new Map(unique.map((n, i) => [n, i]));
    items.sort((a, b) => (order.get(a.name) ?? 0) - (order.get(b.name) ?? 0));

    const result: RestaurantMenuNutritionType = { placeId, items, notice: MENU_NUTRITION_NOTICE, llmPending: pending };
    // 판정 중인 결과는 캐시하지 않는다 — 다음 조회에서 캐시를 다시 읽어 채운다.
    if (!pending) this.cache.set(placeId, result);
    return result;
  }

  // 세트 분해 → (분해된 구성요소 포함) LLM 판정 → 그 결과로 웹 질의어를 정해 웹 추정 순으로 이어서 돈다.
  private kickBackground(placeId: string, llmNames: string[], webQueries: string[], decomposeNames: string[]): void {
    if (this.inflight.has(placeId)) return;
    const run = (async () => {
      const toAsk = new Set(llmNames);
      if (decomposeNames.length > 0 && this.deps.decompose) {
        const parts = await this.deps.decompose.decomposeMany(decomposeNames);
        const names = [...parts.values()].flatMap((p) => p ?? []);
        if (names.length > 0) {
          const results = await this.resolver.resolveMany(names);
          for (const [n, r] of results) if (!r.basis) toAsk.add(n);
        }
      }
      const queries = new Set(webQueries);
      if (toAsk.size > 0 && this.deps.llm) {
        const verdicts = await this.deps.llm.matchMany([...toAsk]);
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
        this.deps.logger?.warn({ err: e instanceof Error ? e.message : String(e), placeId }, '[menu-nutrition] 백그라운드 판정 실패');
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
