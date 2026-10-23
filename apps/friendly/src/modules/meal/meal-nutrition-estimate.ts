import type { PrismaClient } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import { FOOD_DISH_TYPE_LABEL, guessDishTypeFromName, mealPortionFactor } from '@repo/utils';
import { AsyncGate } from '../../lib/async-gate.js';
import { normalizeTerm } from '../../lib/text.js';
import type { Lexicon } from '../food/engine/index.js';
import type { FoodService } from '../food/food.service.js';
import { mealServingNutrition, type MealServingNutrition } from '../food/food-serving.js';
import type { FoodWebEstimateService, WebEstimateHit } from '../food/food-web-estimate.service.js';
import type { MenuLlmMatchService } from '../food/menu-llm-match.service.js';
import type { MenuNutritionResolver } from '../food/menu-nutrition.js';
import { webQueryFor } from '../food/menu-nutrition.service.js';

// 식단 항목 이름 추정 — 카탈로그에서 짝을 못 찾아 열량이 빈 음식("우거지탕")을 맛집 메뉴 칼로리와 같은 뒤 단계로 채운다.
//
//   (1) 메뉴 칼로리 규칙 엔진 — 접미·수식어 규칙("우거지해장국" → 해장국). DB 만 본다.
//   (2) LLM 매칭 캐시(menu_llm_matches) — 가까운 카탈로그 표준명("우거지탕" → 해장국). 표준명은 엔진에 다시 넣는다.
//   (3) 웹 실측 캐시(food_web_estimates, fatsecret.kr 100g당) × 이름으로 짐작한 종류의 통상 1인분 중량.
//
// 숫자는 늘 카탈로그나 웹 실측에서 오고 LLM 은 어느 음식과 가까운지만 고른다(메뉴 칼로리와 같은 원칙). 결과는
// 'donor_estimate' 로 저장해 화면이 "해장국 기준 추정"으로 밝힌다. 저장할 때는 캐시만 보고(빠르게), 아직 안 물어본
// 이름은 저장 뒤 백그라운드로 물어 그 이름의 빈 항목을 채운다(맛집 메뉴와 캐시를 같이 쓰니 같은 이름은 한 번만 묻는다).

// 저장 뒤 백그라운드 판정 — 프로세스 전역 1개, 대기열 8(넘으면 이번엔 건너뛰고 다음 저장·어드민 재시도에서 다시).
const BACKGROUND_CHAINS = 1;
const BACKGROUND_QUEUE = 8;
// 한 번에 다시 채우는 빈 항목 상한(같은 이름이 수백 번 기록된 경우).
const FILL_LIMIT = 500;
// 너무 짧거나 긴 이름은 음식명이 아닐 공산이 크다 — 외부(LLM·웹)로 보내지 않는다.
const MIN_NAME_LENGTH = 2;
const MAX_NAME_LENGTH = 30;

export interface MealNutritionEstimatorDeps {
  prisma: PrismaClient;
  food: Pick<FoodService, 'getServingRow' | 'servingLexicon'>;
  resolver: Pick<MenuNutritionResolver, 'resolve'>;
  /** 없으면 규칙 단계만(테스트 환경). */
  llm?: Pick<MenuLlmMatchService, 'lookupCached' | 'matchMany'>;
  /** 없으면 웹 실측 생략. */
  web?: Pick<FoodWebEstimateService, 'lookupCached' | 'estimateMany'>;
  logger?: FastifyBaseLogger;
  gate?: AsyncGate;
}

export interface MealNameEstimateLookup {
  /** 1인분 영양(양 배수 전, basis donor_estimate). 못 찾았으면 null. */
  estimate: MealServingNutrition | null;
  /** LLM·웹에 아직 안 물어본 단계가 남았는지 — true 면 백그라운드로 물을 가치가 있다. */
  askable: boolean;
}

const NOT_FOUND: MealNameEstimateLookup = { estimate: null, askable: false };

const isEstimableName = (name: string): boolean => {
  const norm = normalizeTerm(name);
  return norm.length >= MIN_NAME_LENGTH && name.trim().length <= MAX_NAME_LENGTH;
};

const round = (v: number | null, digits: number): number | null => (v === null ? null : Number(v.toFixed(digits)));

const webLabel = (query: string, w: WebEstimateHit): string =>
  `${query}(${w.source} ${w.basis === 'single' ? '1건' : `${w.agreeing}건 중앙값`})`;

export class MealNutritionEstimator {
  private readonly gate: AsyncGate;
  // 백그라운드로 묻는 중인 이름(정규화) — 같은 이름을 겹쳐 묻지 않는다.
  private readonly inflight = new Set<string>();

  constructor(private readonly deps: MealNutritionEstimatorDeps) {
    this.gate = deps.gate ?? new AsyncGate(BACKGROUND_CHAINS, { maxQueue: BACKGROUND_QUEUE });
  }

  /** 캐시만 본다(LLM·웹 호출 없음). */
  async lookup(name: string, isMain: boolean): Promise<MealNameEstimateLookup> {
    const trimmed = name.trim();
    if (!isEstimableName(trimmed)) return NOT_FOUND;
    const lex = await this.deps.food.servingLexicon();

    const byRule = await this.fromResolved(trimmed, isMain, lex);
    if (byRule) return { estimate: byRule, askable: false };
    if (!this.deps.llm) return NOT_FOUND;

    const match = (await this.deps.llm.lookupCached([trimmed])).get(trimmed);
    if (!match) return { estimate: null, askable: true };
    const byLlm =
      (match.hit ? await this.fromFood(match.hit.foodId, match.hit.foodName, isMain, lex) : null) ??
      (match.canonical ? await this.fromResolved(match.canonical, isMain, lex) : null);
    if (byLlm) return { estimate: byLlm, askable: false };
    if (!this.deps.web) return NOT_FOUND;

    const query = webQueryFor(trimmed, match.canonical);
    if (!query) return NOT_FOUND;
    const web = (await this.deps.web.lookupCached([query])).get(query);
    if (web === undefined) return { estimate: null, askable: true };
    return { estimate: web ? this.fromWeb(query, web, lex) : null, askable: false };
  }

  /** 캐시에 없는 이름을 LLM → (LLM 이 카탈로그로 못 이은 것만) 웹 순으로 묻고 저장한다. */
  async ask(names: string[]): Promise<void> {
    const list = [...new Set(names.map((n) => n.trim()).filter(isEstimableName))];
    if (list.length === 0 || !this.deps.llm) return;
    await this.deps.llm.matchMany(list);
    if (!this.deps.web) return;
    const lex = await this.deps.food.servingLexicon();
    const cached = await this.deps.llm.lookupCached(list);
    const queries = new Set<string>();
    for (const name of list) {
      const match = cached.get(name);
      if (!match) continue; // LLM 이 실패했으면 다음 기회에
      const byLlm =
        (match.hit ? await this.fromFood(match.hit.foodId, match.hit.foodName, true, lex) : null) ??
        (match.canonical ? await this.fromResolved(match.canonical, true, lex) : null);
      if (byLlm) continue;
      const query = webQueryFor(name, match.canonical);
      if (query) queries.add(query);
    }
    if (queries.size > 0) await this.deps.web.estimateMany([...queries]);
  }

  /** 이 이름들의 열량이 빈 식단 항목(모든 사용자)을 캐시로 채운다. 채운 항목 수. */
  async fillMissingItems(names: string[]): Promise<number> {
    const norms = [...new Set(names.map(normalizeTerm).filter((n) => n.length > 0))];
    if (norms.length === 0) return 0;
    const items = await this.deps.prisma.mealItem.findMany({
      where: { nameNorm: { in: norms }, nutritionBasis: 'missing' },
      select: { id: true, name: true, isMain: true, portion: true, servings: true },
      take: FILL_LIMIT,
    });
    let filled = 0;
    for (const item of items) {
      const { estimate } = await this.lookup(item.name, item.isMain);
      if (!estimate) continue;
      const f = item.servings ?? mealPortionFactor(item.portion);
      // 그사이 사용자가 고쳐 저장했으면(항목이 바뀌었으면) 건드리지 않는다 — 여전히 빈 행만.
      const res = await this.deps.prisma.mealItem.updateMany({
        where: { id: item.id, nutritionBasis: 'missing' },
        data: {
          kcal: round(estimate.kcal === null ? null : estimate.kcal * f, 0),
          proteinG: round(estimate.proteinG === null ? null : estimate.proteinG * f, 1),
          sodiumMg: round(estimate.sodiumMg === null ? null : estimate.sodiumMg * f, 0),
          nutritionFrom: estimate.nutritionFrom,
          nutritionBasis: estimate.basis,
        },
      });
      filled += res.count;
    }
    return filled;
  }

  /**
   * 저장 뒤 백그라운드 — 묻고, 그 이름의 빈 항목을 채운다. 저장을 기다리게 하지 않고 실패도 삼킨다(빈 칸은 그대로).
   * 이미 묻는 중인 이름은 빼고, 자리·대기열이 꽉 차면 이번엔 기동하지 않는다. 기동한 이름 수를 돌려준다.
   */
  schedule(names: string[]): number {
    if (!this.deps.llm) return 0;
    const fresh = [...new Set(names.map((n) => n.trim()).filter(isEstimableName))].filter(
      (n) => !this.inflight.has(normalizeTerm(n)),
    );
    if (fresh.length === 0) return 0;
    const immediate = this.gate.tryAcquire();
    if (!immediate && this.gate.queued >= BACKGROUND_QUEUE) return 0;
    const norms = fresh.map(normalizeTerm);
    for (const n of norms) this.inflight.add(n);
    void (async () => {
      const release = immediate ?? (await this.gate.acquire());
      try {
        await this.ask(fresh);
        const filled = await this.fillMissingItems(fresh);
        if (filled > 0) this.deps.logger?.info({ names: fresh.length, filled }, '[meal-estimate] 빈 열량 채움');
      } finally {
        release();
      }
    })()
      .catch((e: unknown) => {
        this.deps.logger?.warn({ err: e instanceof Error ? e.message : String(e) }, '[meal-estimate] 백그라운드 추정 실패');
      })
      .finally(() => {
        for (const n of norms) this.inflight.delete(n);
      });
    return fresh.length;
  }

  // 규칙 엔진으로 카탈로그 행을 찾으면 그 행의 1인분. 세트("A+B" — basis 없음)·판정 없음은 null.
  private async fromResolved(name: string, isMain: boolean, lex: Lexicon): Promise<MealServingNutrition | null> {
    const r = await this.deps.resolver.resolve(name);
    if (!r.foodId || !r.foodName || !r.basis) return null;
    return this.fromFood(r.foodId, r.foodName, isMain, lex);
  }

  // 찾은 카탈로그 행의 1인분(식단 저장과 같은 mealServingNutrition) — 빌려 온 값이라 donor_estimate 로 밝힌다.
  private async fromFood(
    foodId: string,
    foodName: string,
    isMain: boolean,
    lex: Lexicon,
  ): Promise<MealServingNutrition | null> {
    const row = await this.deps.food.getServingRow(foodId);
    if (!row) return null;
    const n = mealServingNutrition(row, { isMain }, lex);
    if (n.basis === 'missing' || n.kcal === null) return null;
    return { ...n, nutritionFrom: n.nutritionFrom ? `${foodName} · ${n.nutritionFrom}` : foodName, basis: 'donor_estimate' };
  }

  // 웹 실측은 100g당뿐이라 이름으로 짐작한 종류의 통상 1인분 중량을 곱한다. 종류를 모르면 양을 정할 수 없어 쓰지 않는다.
  private fromWeb(query: string, w: WebEstimateHit, lex: Lexicon): MealServingNutrition | null {
    const key = guessDishTypeFromName(query);
    const grams = key ? lex.portionGrams[key] : undefined;
    if (!key || !grams) return null;
    return {
      kcal: (w.kcalPer100g * grams) / 100,
      proteinG: null,
      sodiumMg: null,
      nutritionFrom: `${webLabel(query, w)} · ${FOOD_DISH_TYPE_LABEL[key]} 통상 1인분 ${grams}g`,
      basis: 'donor_estimate',
    };
  }
}
