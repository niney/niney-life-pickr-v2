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
// 표시는 항상 100g당(1인분 아님) — 소비처(menu-nutrition.service)가 그렇게 쓴다.

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
import { pickMenuCandidates } from './menu-nutrition-candidates.js';
import { synonymVariants } from './menu-nutrition.js';

const LLM_TIMEOUT_MS = 30_000;
const LLM_CONCURRENCY = 4;
// 한 번의 matchMany 에서 LLM 에 묻는 최대 이름 수(식당 하나 메뉴판 상한).
const MAX_ASK_PER_CALL = 60;

export interface MenuLlmMatchServiceOptions {
  // 비우면 chat 용도 기본 모델. 운영은 OLLAMA_MENU_MATCH_MODEL(gemma4:31b) 을 넘긴다.
  model?: string;
  logger?: FastifyBaseLogger;
  cache?: AdapterCache;
}

export interface MenuLlmMatchHit {
  foodId: string;
  foodName: string;
  /** 카탈로그의 현재 값. null 이면 표시할 수 없다(매칭은 남는다). */
  kcalPer100g: number | null;
  nutritionFrom: string | null;
}

interface CatalogRow {
  id: string;
  name: string;
  nameNorm: string;
  aliasNormsJson: string;
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

export class MenuLlmMatchService {
  private catalogCache: { rows: CatalogRow[]; byNorm: Map<string, CatalogRow>; loadedAt: number } | null =
    null;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly aiConfig: AiConfigService,
    private readonly opts: MenuLlmMatchServiceOptions = {},
  ) {}

  /** 캐시된 판정만 읽는다(LLM 호출 없음). 값 null = "물어봤고 매칭 없음", 키 없음 = 아직 안 물어봄. */
  async lookupCached(names: string[]): Promise<Map<string, MenuLlmMatchHit | null>> {
    const out = new Map<string, MenuLlmMatchHit | null>();
    if (names.length === 0) return out;
    const normToNames = new Map<string, string[]>();
    for (const n of names) {
      const norm = normalizeTerm(n);
      if (!norm) continue;
      normToNames.set(norm, [...(normToNames.get(norm) ?? []), n]);
    }
    const rows = await this.prisma.menuLlmMatch.findMany({
      where: { nameNorm: { in: [...normToNames.keys()] }, version: { gte: MENU_LLM_MATCH_VERSION } },
      select: { nameNorm: true, foodId: true },
    });
    const foodIds = [...new Set(rows.map((r) => r.foodId).filter((v): v is string => !!v))];
    const foods = foodIds.length
      ? await this.prisma.foodItem.findMany({
          where: { id: { in: foodIds }, active: true },
          select: { id: true, name: true, kcalPer100g: true, nutritionFrom: true },
        })
      : [];
    const foodById = new Map(foods.map((f) => [f.id, f]));
    for (const r of rows) {
      const food = r.foodId ? foodById.get(r.foodId) : undefined;
      const hit: MenuLlmMatchHit | null = food
        ? { foodId: food.id, foodName: food.name, kcalPer100g: food.kcalPer100g, nutritionFrom: food.nutritionFrom }
        : null;
      for (const n of normToNames.get(r.nameNorm) ?? []) out.set(n, hit);
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
  ): Promise<Map<string, MenuLlmMatchHit | null>> {
    const out = new Map<string, MenuLlmMatchHit | null>();
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
        const hit = await this.askOne(provider, model, catalog, name, opts.signal);
        if (hit === undefined) continue; // 오류 — 저장하지 않고 다음 요청에서 다시 묻는다.
        for (const n of pending) if (normalizeTerm(n) === norm) out.set(n, hit);
      }
    };
    await Promise.all(Array.from({ length: Math.min(LLM_CONCURRENCY, queue.length) }, worker));
    return out;
  }

  /** undefined = 호출 실패(저장 안 함), null = 매칭 없음(저장), 객체 = 매칭(저장). */
  private async askOne(
    provider: LLMProvider,
    model: string,
    catalog: { rows: CatalogRow[]; byNorm: Map<string, CatalogRow> },
    name: string,
    outerSignal?: AbortSignal,
  ): Promise<MenuLlmMatchHit | null | undefined> {
    const candidates = pickMenuCandidates(name, catalog.rows);
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
        return undefined;
      }
      const lookupByName = (n: string): CatalogRow | null => {
        const norm = normalizeTerm(n);
        if (catalog.byNorm.has(norm)) return catalog.byNorm.get(norm)!;
        for (const v of synonymVariants(norm)) if (catalog.byNorm.has(v)) return catalog.byNorm.get(v)!;
        return null;
      };
      const row = decideLlmMatch(parsed, candidates, lookupByName);
      await this.prisma.menuLlmMatch.upsert({
        where: { nameNorm: normalizeTerm(name) },
        create: {
          nameNorm: normalizeTerm(name),
          menuName: name,
          foodId: row?.id ?? null,
          foodName: row?.name ?? null,
          canonical: parsed.canonical,
          choice: parsed.choice,
          confidence: parsed.confidence,
          reason: parsed.reason,
          model,
          version: MENU_LLM_MATCH_VERSION,
        },
        update: {
          menuName: name,
          foodId: row?.id ?? null,
          foodName: row?.name ?? null,
          canonical: parsed.canonical,
          choice: parsed.choice,
          confidence: parsed.confidence,
          reason: parsed.reason,
          model,
          version: MENU_LLM_MATCH_VERSION,
        },
      });
      return row
        ? { foodId: row.id, foodName: row.name, kcalPer100g: row.kcalPer100g, nutritionFrom: row.nutritionFrom }
        : null;
    } catch (e) {
      this.opts.logger?.warn({ err: e instanceof Error ? e.message : String(e), name }, '[menu-llm-match] 호출 실패');
      return undefined;
    } finally {
      clearTimeout(timer);
      outerSignal?.removeEventListener('abort', onOuterAbort);
    }
  }

  // 카탈로그 전수(이름·별칭) — 후보 검색과 표준명 조회에 쓴다. 5분 캐시(적재는 월 1회).
  private async loadCatalog(): Promise<{ rows: CatalogRow[]; byNorm: Map<string, CatalogRow> }> {
    if (this.catalogCache && Date.now() - this.catalogCache.loadedAt < 5 * 60_000) return this.catalogCache;
    const rows = await this.prisma.foodItem.findMany({
      where: { active: true },
      select: { id: true, name: true, nameNorm: true, aliasNormsJson: true, kcalPer100g: true, nutritionFrom: true },
    });
    const byNorm = new Map<string, CatalogRow>();
    for (const row of rows) {
      byNorm.set(row.nameNorm, row);
      try {
        for (const a of JSON.parse(row.aliasNormsJson) as string[]) if (!byNorm.has(a)) byNorm.set(a, row);
      } catch {
        // 별칭 JSON 손상은 무시
      }
    }
    this.catalogCache = { rows, byNorm, loadedAt: Date.now() };
    return this.catalogCache;
  }
}
