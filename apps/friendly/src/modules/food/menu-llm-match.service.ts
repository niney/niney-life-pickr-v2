// 규칙 매칭이 못 잡은 메뉴명을 LLM 에게 카탈로그 음식으로 연결시키고, 결과를 어휘 단위로 영구 캐시한다.
//
// 왜 어휘 단위인가: 같은 메뉴명("후라이드치킨")은 식당이 달라도 답이 같다. 한 번 물은 이름은
// 부정 결과(null)까지 저장해 다시 묻지 않는다 — 비용이 식당 수가 아니라 어휘 수에 비례한다.
//
// 채택 규칙(프로브 실측, menu-llm-match.prompts.ts 참고):
//   1) 후보 선택 + confidence=high → 그 카탈로그 행 (gemma4:31b 29/30).
//   2) 아니면 자유형 표준명이 카탈로그 이름/별칭과 정확히 같으면 → 그 행 (후보 검색으로 못 닿는
//      지식형: 부타동→돼지고기덮밥). 단 후보를 골랐는데 low 면 표준명도 버린다.
//   3) 그 외 → 매칭 없음(저장은 한다).
// 표시는 항상 100g당(1인분 아님) — 소비처(menu-nutrition.service)가 그렇게 쓴다. 그래서 후보와 표준명 조회는 100g당 열량이
// 있는 행이 먼저다(v2, 2026-11-08) — 외식 메뉴 어휘는 이름만 있고 영양이 빈 행이 많아, LLM 이 그런 행을 '완전 일치'로 골라
// 칼로리를 못 냈다.

import type { PrismaClient } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import { thinkOptionForModel } from '@repo/utils';
import { extractFirstJsonObject } from '../../lib/json.js';
import { normalizeTerm } from '../../lib/text.js';
import { adapterCache, type AdapterCache } from '../ai/adapter-cache.js';
import type { AiConfigService } from '../ai/ai.config.service.js';
import type { LLMProvider } from '../ai/adapters/llm-provider.js';
import {
  MENU_LLM_MATCH_JSON_SCHEMA,
  MENU_LLM_MATCH_SYSTEM_PROMPT,
  MENU_LLM_MATCH_VERSION,
  buildMenuLlmMatchPrompt,
} from './menu-llm-match.prompts.js';
import { FailureBackoff, MENU_FAILURE_GIVE_UP_AFTER } from './menu-failure-backoff.js';
import { pickMenuCandidates } from './menu-nutrition-candidates.js';
import { DEFAULT_LEXICON, synonymVariants } from './menu-nutrition.js';

const LLM_TIMEOUT_MS = 30_000;
const LLM_CONCURRENCY = 4;
// 한 번의 matchMany 에서 LLM 에 묻는 최대 이름 수(식당 하나 메뉴판 상한).
const MAX_ASK_PER_CALL = 60;
// 이 버전부터의 옛 판정은 지금도 열량 있는 행을 가리키면 그대로 쓴다(v2 는 후보만 좁혔다 — 그 판정은 v2 로 물어도
// 같은 행을 골랐을 것). 영양 없는 행을 골랐거나 매칭 없음이던 옛 판정만 다시 묻는다.
const KEEP_OLD_KCAL_HITS_FROM = 1;

// 범주어 행(음료·고기·술·소스·샐러드…, 어휘 suffixBlock)은 특정 음식이 아니다 — 웹 질의어(webQueryFor)와 같은 기준으로 LLM
// 답에서도 뺀다. 운영 사본에서 '음료수'가 '음료'(미숫가루 음료 등을 빌린 100g당 128kcal)로 high 판정됐다.
const isCategoryRow = (row: { nameNorm: string }): boolean => DEFAULT_LEXICON.suffixBlock.has(row.nameNorm);

export interface MenuLlmMatchServiceOptions {
  // 비우면 chat 용도 기본 모델. 운영은 OLLAMA_MENU_MATCH_MODEL(gemma4:31b) 을 넘긴다.
  model?: string;
  logger?: FastifyBaseLogger;
  cache?: AdapterCache;
  // 실패한 이름의 재시도 간격(테스트 주입용). 기본 30분, 응답 해석 실패 3회면 '포기'를 저장한다.
  failures?: FailureBackoff;
}

const NO_MATCH: MenuLlmMatchLookup = { hit: null, canonical: null };

/** 캐시/판정 조회 결과 — hit 이 null 이면 "물어봤고 매칭 없음". canonical 은 웹 추정(food-web-estimate)의 질의어. */
export interface MenuLlmMatchLookup {
  hit: MenuLlmMatchHit | null;
  canonical: string | null;
}

export interface MenuLlmMatchHit {
  foodId: string;
  foodName: string;
  /** 카탈로그의 현재 값. null 이면 표시할 수 없다(매칭은 남는다). */
  kcalPer100g: number | null;
  nutritionFrom: string | null;
  /** 통상 1인분 중량표 키(dishType). */
  dishType: string | null;
}

interface CatalogRow {
  id: string;
  name: string;
  nameNorm: string;
  aliasNormsJson: string;
  dishType: string | null;
  kcalPer100g: number | null;
  nutritionFrom: string | null;
}

export interface LlmMatchOutput {
  choice: string | null;
  canonical: string | null;
  confidence: 'high' | 'medium' | 'low' | null;
  reason: string | null;
}

export const parseLlmMatchOutput = (text: string): LlmMatchOutput | null => {
  const raw = extractFirstJsonObject(text) ?? text.trim();
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!json || typeof json !== 'object') return null;
  const o = json as Record<string, unknown>;
  const str = (v: unknown): string | null =>
    typeof v === 'string' && v.trim() && v.trim().toLowerCase() !== 'null' ? v.trim() : null;
  const conf = str(o['confidence'])?.toLowerCase();
  return {
    choice: str(o['choice']),
    canonical: str(o['canonical']),
    confidence: conf === 'high' || conf === 'medium' || conf === 'low' ? conf : null,
    reason: str(o['reason']),
  };
};

/**
 * 모델 출력 + 후보 + 카탈로그 조회로 채택 여부를 정한다(순수). 반환은 카탈로그 행 또는 null.
 */
export const decideLlmMatch = <T extends { name: string }>(
  out: LlmMatchOutput,
  candidates: T[],
  lookupByName: (name: string) => T | null,
): T | null => {
  if (out.choice && out.confidence === 'high') {
    const hit = candidates.find((c) => c.name === out.choice);
    if (hit) return hit;
  }
  // confidence 는 "고른 후보"에 대한 확신이라, 후보가 없어 choice=null 이면 low 라도 표준명은 믿을 만하다
  // (실측: 마늘보쌈→수육·미니족→족발이 [low]+choice 없음으로 나왔다). 표준명은 카탈로그 이름/별칭과
  // 글자 그대로 같아야만 채택되므로 그 자체가 강한 필터다. 후보를 골랐는데 low 면 표준명도 믿지 않는다.
  if (out.canonical && (out.choice === null || out.confidence !== 'low')) {
    const hit = lookupByName(out.canonical);
    if (hit) return hit;
  }
  return null;
};

interface LoadedCatalog {
  // LLM 에 보여 줄 후보 — 100g당 열량이 있는 행만(v2). 영양 없는 외식 어휘 행을 '완전 일치'로 골라 칼로리를 못 냈다.
  candidates: CatalogRow[];
  // 표준명 조회 — 열량 있는 행을 먼저(같은 키를 별칭으로 가진 영양 있는 행), 없으면 전체.
  byNormWithKcal: Map<string, CatalogRow>;
  byNorm: Map<string, CatalogRow>;
  loadedAt: number;
}

export class MenuLlmMatchService {
  private catalogCache: LoadedCatalog | null = null;
  private readonly failures: FailureBackoff;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly aiConfig: AiConfigService,
    private readonly opts: MenuLlmMatchServiceOptions = {},
  ) {
    this.failures = opts.failures ?? new FailureBackoff();
  }

  /**
   * 캐시된 판정만 읽는다(LLM 호출 없음). 값 hit=null = "물어봤고 매칭 없음", 키 없음 = 아직 안 물어봄.
   * 최근 실패해 재시도 간격 안인 이름도 "매칭 없음"으로 준다 — 다시 묻지 않고, 응답도 대기(llmPending)로 남지 않는다.
   */
  async lookupCached(names: string[]): Promise<Map<string, MenuLlmMatchLookup>> {
    const out = await this.lookupStored(names);
    for (const n of names) {
      if (!out.has(n) && this.failures.isBackingOff(normalizeTerm(n))) out.set(n, NO_MATCH);
    }
    return out;
  }

  private async lookupStored(names: string[]): Promise<Map<string, MenuLlmMatchLookup>> {
    const out = new Map<string, MenuLlmMatchLookup>();
    if (names.length === 0) return out;
    const normToNames = new Map<string, string[]>();
    for (const n of names) {
      const norm = normalizeTerm(n);
      if (!norm) continue;
      normToNames.set(norm, [...(normToNames.get(norm) ?? []), n]);
    }
    const rows = await this.prisma.menuLlmMatch.findMany({
      where: { nameNorm: { in: [...normToNames.keys()] }, version: { gte: KEEP_OLD_KCAL_HITS_FROM } },
      select: { nameNorm: true, foodId: true, canonical: true, version: true },
    });
    const foodIds = [...new Set(rows.map((r) => r.foodId).filter((v): v is string => !!v))];
    const foods = foodIds.length
      ? await this.prisma.foodItem.findMany({
          where: { id: { in: foodIds }, active: true },
          select: { id: true, name: true, nameNorm: true, kcalPer100g: true, nutritionFrom: true, dishType: true },
        })
      : [];
    const foodById = new Map(foods.filter((f) => !isCategoryRow(f)).map((f) => [f.id, f]));
    for (const r of rows) {
      const food = r.foodId ? foodById.get(r.foodId) : undefined;
      // 옛 판정은 열량 있는 행을 가리킬 때만 — 나머지는 "아직 안 물어봄"으로 두어 지금 규칙으로 다시 묻는다.
      if (r.version < MENU_LLM_MATCH_VERSION && (!food || food.kcalPer100g === null)) continue;
      const hit: MenuLlmMatchHit | null = food
        ? { foodId: food.id, foodName: food.name, kcalPer100g: food.kcalPer100g, nutritionFrom: food.nutritionFrom, dishType: food.dishType }
        : null;
      for (const n of normToNames.get(r.nameNorm) ?? []) out.set(n, { hit, canonical: r.canonical });
    }
    return out;
  }

  /**
   * 캐시에 없는 이름만 LLM 에 묻고 저장한다. provider/모델이 없으면 아무것도 묻지 않고 빈 Map.
   * 반환은 이번에 새로 판정한 이름들만.
   */
  async matchMany(
    names: string[],
    opts: { signal?: AbortSignal } = {},
  ): Promise<Map<string, MenuLlmMatchLookup>> {
    const out = new Map<string, MenuLlmMatchLookup>();
    const cached = await this.lookupCached(names);
    const pending = [...new Set(names.filter((n) => normalizeTerm(n) && !cached.has(n)))].slice(
      0,
      MAX_ASK_PER_CALL,
    );
    if (pending.length === 0) return out;

    const resolved = await this.aiConfig.getResolved('ollama-cloud', 'chat');
    const model = (this.opts.model?.trim() || resolved?.defaultModel?.trim()) ?? '';
    if (!resolved || !model) {
      this.opts.logger?.warn('[menu-llm-match] chat provider/모델 미설정 — 건너뜀');
      return out;
    }
    const provider = (this.opts.cache ?? adapterCache).get(resolved);
    const catalog = await this.loadCatalog();

    // 같은 정규화 키는 한 번만 묻는다.
    const byNorm = new Map<string, string>();
    for (const n of pending) {
      const norm = normalizeTerm(n);
      if (!byNorm.has(norm)) byNorm.set(norm, n);
    }
    const queue = [...byNorm.entries()];
    let next = 0;
    const worker = async () => {
      while (next < queue.length) {
        if (opts.signal?.aborted) return;
        const [norm, name] = queue[next++]!;
        const verdict = await this.askOne(provider, model, catalog, name, opts.signal);
        if (verdict === undefined) continue; // 오류 — 저장하지 않고 다음 요청에서 다시 묻는다.
        for (const n of pending) if (normalizeTerm(n) === norm) out.set(n, verdict);
      }
    };
    await Promise.all(Array.from({ length: Math.min(LLM_CONCURRENCY, queue.length) }, worker));
    return out;
  }

  /** undefined = 호출 실패(저장 안 함). 그 외는 저장된 판정(hit null = 매칭 없음). */
  private async askOne(
    provider: LLMProvider,
    model: string,
    catalog: LoadedCatalog,
    name: string,
    outerSignal?: AbortSignal,
  ): Promise<MenuLlmMatchLookup | undefined> {
    const candidates = pickMenuCandidates(name, catalog.candidates);
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), LLM_TIMEOUT_MS);
    const onOuterAbort = (): void => ac.abort();
    outerSignal?.addEventListener('abort', onOuterAbort, { once: true });
    try {
      const res = await provider.complete({
        prompt: buildMenuLlmMatchPrompt(name, candidates.map((c) => c.name)),
        systemPrompt: MENU_LLM_MATCH_SYSTEM_PROMPT,
        model,
        temperature: 0,
        maxTokens: 300,
        numCtx: 4096,
        format: MENU_LLM_MATCH_JSON_SCHEMA as unknown as Record<string, unknown>,
        think: thinkOptionForModel(model),
        signal: ac.signal,
      });
      const parsed = parseLlmMatchOutput(res.text);
      if (!parsed) {
        this.opts.logger?.warn({ name, text: res.text.slice(0, 120) }, '[menu-llm-match] 파싱 실패');
        // 이름에 묶인 실패 — 간격을 두고, 거듭되면 '포기'(매칭 없음)로 저장해 다시 묻지 않는다.
        if (this.failures.record(normalizeTerm(name), true) < MENU_FAILURE_GIVE_UP_AFTER) return undefined;
        await this.saveVerdict(name, model, null, {
          choice: null,
          canonical: null,
          confidence: null,
          reason: `응답 해석 실패 ${MENU_FAILURE_GIVE_UP_AFTER}회 — 판정 포기`,
        });
        this.failures.clear(normalizeTerm(name));
        return NO_MATCH;
      }
      const lookupIn = (map: Map<string, CatalogRow>, norm: string): CatalogRow | null => {
        if (map.has(norm)) return map.get(norm)!;
        for (const v of synonymVariants(norm)) if (map.has(v)) return map.get(v)!;
        return null;
      };
      const lookupByName = (n: string): CatalogRow | null => {
        const norm = normalizeTerm(n);
        const row = lookupIn(catalog.byNormWithKcal, norm) ?? lookupIn(catalog.byNorm, norm);
        return row && !isCategoryRow(row) ? row : null;
      };
      const row = decideLlmMatch(parsed, candidates, lookupByName);
      await this.saveVerdict(name, model, row, parsed);
      this.failures.clear(normalizeTerm(name));
      return {
        hit: row
          ? { foodId: row.id, foodName: row.name, kcalPer100g: row.kcalPer100g, nutritionFrom: row.nutritionFrom, dishType: row.dishType }
          : null,
        canonical: parsed.canonical,
      };
    } catch (e) {
      this.opts.logger?.warn({ err: e instanceof Error ? e.message : String(e), name }, '[menu-llm-match] 호출 실패');
      // 업스트림 장애(타임아웃·429·5xx) — 이름 탓이 아니므로 간격만 두고 포기하지 않는다(호출자 취소는 제외).
      if (!outerSignal?.aborted) this.failures.record(normalizeTerm(name), false);
      return undefined;
    } finally {
      clearTimeout(timer);
      outerSignal?.removeEventListener('abort', onOuterAbort);
    }
  }

  private async saveVerdict(
    name: string,
    model: string,
    row: CatalogRow | null,
    parsed: LlmMatchOutput,
  ): Promise<void> {
    const data = {
      menuName: name,
      foodId: row?.id ?? null,
      foodName: row?.name ?? null,
      canonical: parsed.canonical,
      choice: parsed.choice,
      confidence: parsed.confidence,
      reason: parsed.reason,
      model,
      version: MENU_LLM_MATCH_VERSION,
    };
    await this.prisma.menuLlmMatch.upsert({
      where: { nameNorm: normalizeTerm(name) },
      create: { nameNorm: normalizeTerm(name), ...data },
      update: data,
    });
  }

  // 카탈로그 전수(이름·별칭) — 후보 검색과 표준명 조회에 쓴다. 5분 캐시(적재는 월 1회).
  private async loadCatalog(): Promise<LoadedCatalog> {
    if (this.catalogCache && Date.now() - this.catalogCache.loadedAt < 5 * 60_000) return this.catalogCache;
    const rows = await this.prisma.foodItem.findMany({
      where: { active: true },
      select: { id: true, name: true, nameNorm: true, aliasNormsJson: true, kcalPer100g: true, nutritionFrom: true, dishType: true },
    });
    const keyMap = (list: CatalogRow[]): Map<string, CatalogRow> => {
      const byNorm = new Map<string, CatalogRow>();
      for (const row of list) {
        byNorm.set(row.nameNorm, row);
        try {
          for (const a of JSON.parse(row.aliasNormsJson) as string[]) if (!byNorm.has(a)) byNorm.set(a, row);
        } catch {
          // 별칭 JSON 손상은 무시
        }
      }
      return byNorm;
    };
    const candidates = rows.filter((r) => r.kcalPer100g !== null && !isCategoryRow(r));
    this.catalogCache = {
      candidates,
      byNormWithKcal: keyMap(candidates),
      byNorm: keyMap(rows),
      loadedAt: Date.now(),
    };
    return this.catalogCache;
  }
}
