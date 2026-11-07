// 영양 기준 음식 연결 — 규칙(food-nutrient-ref) → LLM(후보 중 선택) → 어드민. 결과는 food_nutrient_refs 에 이름 단위로.
//
// 쓰는 곳:
//   - 영양소 점검(meal-nutrition.service) — resolveIds: 저장된 판정(어드민 우선) → 없으면 규칙을 그 자리에서(저장 안 함).
//     그래서 일괄 연결을 아직 안 돌린 환경에서도 규칙으로 잡히는 음식(공기밥 → 쌀밥 등)은 바로 계산된다.
//   - 식단 저장 뒤(meal.service) — schedule: 영양소 없는 이름을 백그라운드로 규칙 → LLM 연결해 저장(전역 1·대기열 8).
//   - 스크립트 link:food-nutrients — 식단 기록에 나온 이름 + 흔한 한 끼 목록을 한 번에.
//   - 어드민 '영양 기준 음식' — 지정(admin)·해제·다시 묻기.
//
// LLM 은 메뉴 칼로리 매칭과 같은 chat 용도·모델(OLLAMA_MENU_MATCH_MODEL)을 쓰고 high 확신만 채택한다. 판정은 이름
// 단위 영구 캐시라 비용이 사용자·기록 수가 아니라 어휘 수에 비례한다.

import type { PrismaClient } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import type { FoodAdminNutrientRefsResultType } from '@repo/api-contract';
import { thinkOptionForModel } from '@repo/utils';
import { AsyncGate } from '../../lib/async-gate.js';
import { normalizeTerm } from '../../lib/text.js';
import { adapterCache, type AdapterCache } from '../ai/adapter-cache.js';
import type { AiConfigService } from '../ai/ai.config.service.js';
import type { LLMProvider } from '../ai/adapters/llm-provider.js';
import { loadLexicon, type Lexicon } from './engine/index.js';
import {
  FOOD_NUTRIENT_REF_METHODS,
  FOOD_NUTRIENT_REF_VERSION,
  buildNutrientRefIndex,
  isNutrientProfileRow,
  pickNutrientRefCandidates,
  resolveNutrientRefByRules,
  type FoodNutrientRefMethod,
  type NutrientRefCandidate,
  type NutrientRefIndex,
  type NutrientRefTarget,
} from './food-nutrient-ref.js';
import {
  FOOD_NUTRIENT_REF_JSON_SCHEMA,
  FOOD_NUTRIENT_REF_SYSTEM_PROMPT,
  buildFoodNutrientRefPrompt,
} from './food-nutrient-ref.prompts.js';
import { FailureBackoff, MENU_FAILURE_GIVE_UP_AFTER } from './menu-failure-backoff.js';
import { parseLlmMatchOutput, type LlmMatchOutput } from './menu-llm-match.service.js';

const INDEX_TTL_MS = 10 * 60 * 1000;
const LLM_TIMEOUT_MS = 30_000;
const LLM_CONCURRENCY = 4;
// 저장 뒤 백그라운드 — 프로세스 전역 1개, 대기열 8(넘으면 이번엔 건너뛰고 다음 저장·스크립트에서 다시).
const BACKGROUND_CHAINS = 1;
const BACKGROUND_QUEUE = 8;
const MAX_SCHEDULE_NAMES = 30;
// 이름 추정(meal-nutrition-estimate)과 같은 기준 — 너무 짧거나 긴 이름은 음식명이 아닐 공산이 크다.
const MIN_NAME_LENGTH = 2;
const MAX_NAME_LENGTH = 30;
const DRINK_DISH_TYPES = new Set(['beverage', 'alcohol']);

const ROW_SELECT = {
  id: true,
  name: true,
  nameNorm: true,
  aliasNormsJson: true,
  dishType: true,
  mainIngredient: true,
  kcal: true,
  servingG: true,
  kcalPer100g: true,
  nutritionFrom: true,
  nutrientsPer100gJson: true,
} as const;

export interface FoodNutrientRefServiceOptions {
  /** 없으면 규칙만(테스트·점검 전용 인스턴스). */
  aiConfig?: AiConfigService;
  /** 비우면 chat 용도 기본 모델. 운영은 OLLAMA_MENU_MATCH_MODEL. */
  model?: string;
  logger?: FastifyBaseLogger;
  cache?: AdapterCache;
  failures?: FailureBackoff;
  gate?: AsyncGate;
}

export interface FoodNutrientLinkStats {
  targets: number;
  /** 규칙으로 이은 수(same·borrowed·synonym·rule). */
  rules: number;
  llm: number;
  none: number;
  /** 어드민 지정이거나 이번 버전으로 이미 물어본 것. */
  kept: number;
  /** LLM 호출 실패(저장 안 함 — 다음에 다시). */
  failed: number;
}

export interface NutrientRefItemInput {
  name: string;
  foodId: string | null;
  dishType?: string | null;
}

const isLinkableName = (name: string): boolean => {
  const n = normalizeTerm(name);
  return n.length >= MIN_NAME_LENGTH && name.trim().length <= MAX_NAME_LENGTH;
};

export class FoodNutrientRefService {
  private indexCache: { index: NutrientRefIndex; lex: Lexicon; at: number } | null = null;
  private indexLoading: Promise<{ index: NutrientRefIndex; lex: Lexicon }> | null = null;
  private readonly failures: FailureBackoff;
  private readonly gate: AsyncGate;
  private readonly inflight = new Set<string>();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly opts: FoodNutrientRefServiceOptions = {},
  ) {
    this.failures = opts.failures ?? new FailureBackoff();
    this.gate = opts.gate ?? new AsyncGate(BACKGROUND_CHAINS, { maxQueue: BACKGROUND_QUEUE });
  }

  /** 기준 후보(영양소 + 100g당 열량이 있는 활성 행)와 어휘 — 10분 메모. 카탈로그 적재·어드민 수정 뒤엔 invalidate. */
  async context(): Promise<{ index: NutrientRefIndex; lex: Lexicon }> {
    const c = this.indexCache;
    if (c && Date.now() - c.at < INDEX_TTL_MS) return c;
    this.indexLoading ??= (async () => {
      try {
        const [rows, lex] = await Promise.all([
          this.prisma.foodItem.findMany({
            where: { active: true, nutrientsPer100gJson: { not: null } },
            select: ROW_SELECT,
          }),
          loadLexicon(this.prisma),
        ]);
        const candidates: NutrientRefCandidate[] = rows.filter(isNutrientProfileRow).map((r) => ({
          id: r.id,
          name: r.name,
          nameNorm: r.nameNorm,
          aliasNormsJson: r.aliasNormsJson,
          dishType: r.dishType,
          mainIngredient: r.mainIngredient,
          kcal: r.kcal,
          servingG: r.servingG,
          kcalPer100g: r.kcalPer100g,
        }));
        const value = { index: buildNutrientRefIndex(candidates), lex };
        this.indexCache = { ...value, at: Date.now() };
        return value;
      } finally {
        this.indexLoading = null;
      }
    })();
    return this.indexLoading;
  }

  invalidate(): void {
    this.indexCache = null;
  }

  /**
   * 점검용 — 이름(정규화) → 기준 음식 행 id. 어드민 지정이 먼저(해제면 없음), 그다음 저장된 판정, 없으면 규칙을 그 자리에서.
   * 저장된 id 가 더는 기준 후보가 아니면(비활성·영양소 삭제) 규칙으로 다시 본다.
   */
  async resolveIds(targets: readonly NutrientRefTarget[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const uniq = dedupeTargets(targets);
    if (uniq.length === 0) return out;
    const { index, lex } = await this.context();
    // 연결 표 조회가 실패해도(마이그레이션 전 DB 등) 점검은 규칙만으로 계속한다 — 보조 단계가 점검을 막지 않게.
    const stored = await this.prisma.foodNutrientRef
      .findMany({
        where: { nameNorm: { in: uniq.map((t) => t.nameNorm) } },
        select: { nameNorm: true, refFoodId: true, method: true },
      })
      .catch((e: unknown) => {
        this.opts.logger?.warn({ err: e instanceof Error ? e.message : String(e) }, '[food-nutrient-ref] 저장된 연결 조회 실패 — 규칙만');
        return [] as { nameNorm: string; refFoodId: string | null; method: string }[];
      });
    const storedBy = new Map(stored.map((s) => [s.nameNorm, s]));
    for (const t of uniq) {
      const s = storedBy.get(t.nameNorm);
      if (s?.method === 'admin') {
        if (s.refFoodId && index.byId.has(s.refFoodId)) out.set(t.nameNorm, s.refFoodId);
        continue;
      }
      if (s?.refFoodId && index.byId.has(s.refFoodId)) {
        out.set(t.nameNorm, s.refFoodId);
        continue;
      }
      const v = resolveNutrientRefByRules(t, index, lex);
      if (v) out.set(t.nameNorm, v.candidate.id);
    }
    return out;
  }

  /** 식단 항목(이름·카탈로그 행) → 연결 대상. 행 자신이 기준 음식이거나 음료·주류면 뺀다. */
  async targetsForItems(items: readonly NutrientRefItemInput[]): Promise<NutrientRefTarget[]> {
    const ids = [...new Set(items.map((i) => i.foodId).filter((v): v is string => !!v))];
    const rows = ids.length
      ? await this.prisma.foodItem.findMany({ where: { id: { in: ids } }, select: ROW_SELECT })
      : [];
    const rowById = new Map(rows.map((r) => [r.id, r]));
    const out: NutrientRefTarget[] = [];
    for (const it of items) {
      const row = it.foodId ? rowById.get(it.foodId) : undefined;
      if (row) {
        if (isNutrientProfileRow(row) || DRINK_DISH_TYPES.has(row.dishType ?? '')) continue;
        out.push({
          name: row.name,
          nameNorm: row.nameNorm,
          dishType: row.dishType,
          mainIngredient: row.mainIngredient,
          nutritionFrom: row.nutritionFrom,
        });
        continue;
      }
      if (DRINK_DISH_TYPES.has(it.dishType ?? '') || !isLinkableName(it.name)) continue;
      out.push({ name: it.name.trim(), nameNorm: normalizeTerm(it.name), dishType: it.dishType ?? null, nutritionFrom: null });
    }
    return dedupeTargets(out);
  }

  /**
   * 대상을 규칙 → (llm 이면) LLM 으로 잇고 저장한다. 어드민 지정은 건드리지 않는다. 규칙 판정은 매번 다시 계산해 저장하고,
   * 규칙이 더는 안 맞는 옛 규칙 판정은 지운다. LLM·'없음' 판정은 이번 버전이면 다시 묻지 않는다(force 면 묻는다).
   */
  async link(
    targets: readonly NutrientRefTarget[],
    opts: { llm?: boolean; force?: boolean; signal?: AbortSignal; onProgress?: (done: number, total: number) => void } = {},
  ): Promise<FoodNutrientLinkStats> {
    const uniq = dedupeTargets(targets);
    const stats: FoodNutrientLinkStats = { targets: uniq.length, rules: 0, llm: 0, none: 0, kept: 0, failed: 0 };
    if (uniq.length === 0) return stats;
    const { index, lex } = await this.context();
    const stored = await this.prisma.foodNutrientRef.findMany({
      where: { nameNorm: { in: uniq.map((t) => t.nameNorm) } },
      select: { nameNorm: true, method: true, version: true, refFoodId: true },
    });
    const storedBy = new Map(stored.map((s) => [s.nameNorm, s]));
    const pending: NutrientRefTarget[] = [];
    for (const t of uniq) {
      const s = storedBy.get(t.nameNorm);
      if (s?.method === 'admin') {
        stats.kept += 1;
        continue;
      }
      const v = resolveNutrientRefByRules(t, index, lex);
      if (v) {
        // 같은 판정이면 다시 쓰지 않는다(식단을 저장할 때마다 같은 이름이 들어온다).
        const unchanged = s && s.method === v.method && s.refFoodId === v.candidate.id && s.version >= FOOD_NUTRIENT_REF_VERSION;
        if (!unchanged) await this.save(t, v.candidate, v.method, { reason: v.reason });
        stats.rules += 1;
        continue;
      }
      if (s && (s.method === 'llm' || s.method === 'none')) {
        if (!opts.force && s.version >= FOOD_NUTRIENT_REF_VERSION) {
          stats.kept += 1;
          continue;
        }
      } else if (s) {
        // 규칙이 더는 안 맞는 옛 규칙 판정(후보가 바뀜) — 지우고 LLM 으로 다시 본다.
        await this.prisma.foodNutrientRef.delete({ where: { nameNorm: t.nameNorm } }).catch(() => undefined);
      }
      pending.push(t);
    }
    opts.onProgress?.(uniq.length - pending.length, uniq.length);
    if (!opts.llm || pending.length === 0) return stats;

    const resolved = this.opts.aiConfig ? await this.opts.aiConfig.getResolved('ollama-cloud', 'chat') : null;
    const model = (this.opts.model?.trim() || resolved?.defaultModel?.trim()) ?? '';
    if (!resolved || !model) {
      this.opts.logger?.warn('[food-nutrient-ref] chat provider/모델 미설정 — LLM 단계 건너뜀');
      return stats;
    }
    const provider = (this.opts.cache ?? adapterCache).get(resolved);
    const queue = pending.filter((t) => !this.failures.isBackingOff(t.nameNorm));
    let next = 0;
    let done = uniq.length - pending.length;
    const worker = async (): Promise<void> => {
      while (next < queue.length) {
        if (opts.signal?.aborted) return;
        const t = queue[next++]!;
        const verdict = await this.askOne(provider, model, index, t, opts.signal);
        if (verdict === 'failed') stats.failed += 1;
        else if (verdict === 'none') stats.none += 1;
        else stats.llm += 1;
        done += 1;
        opts.onProgress?.(done, uniq.length);
      }
    };
    await Promise.all(Array.from({ length: Math.min(LLM_CONCURRENCY, queue.length) }, worker));
    stats.failed += pending.length - queue.length;
    return stats;
  }

  /** 식단 저장 뒤 — 영양소 없는 이름을 백그라운드로 잇는다. LLM 이 없으면(테스트) 아무것도 하지 않는다(점검이 규칙을 바로 쓴다). */
  schedule(items: readonly NutrientRefItemInput[]): number {
    if (!this.opts.aiConfig) return 0;
    const fresh = items
      .filter((i) => i.name && !this.inflight.has(normalizeTerm(i.name)))
      .slice(0, MAX_SCHEDULE_NAMES);
    if (fresh.length === 0) return 0;
    const immediate = this.gate.tryAcquire();
    if (!immediate && this.gate.queued >= BACKGROUND_QUEUE) return 0;
    const norms = fresh.map((i) => normalizeTerm(i.name));
    for (const n of norms) this.inflight.add(n);
    void (async () => {
      const release = immediate ?? (await this.gate.acquire());
      try {
        const targets = await this.targetsForItems(fresh);
        if (targets.length === 0) return;
        const stats = await this.link(targets, { llm: true });
        if (stats.rules + stats.llm > 0) this.opts.logger?.info(stats, '[food-nutrient-ref] 영양 기준 음식 연결');
      } finally {
        release();
      }
    })()
      .catch((e: unknown) => {
        this.opts.logger?.warn({ err: e instanceof Error ? e.message : String(e) }, '[food-nutrient-ref] 백그라운드 연결 실패');
      })
      .finally(() => {
        for (const n of norms) this.inflight.delete(n);
      });
    return fresh.length;
  }

  /** 어드민 목록 — 저장된 판정을 '없음' 먼저, 그다음 식단 기록이 많은 순. 사용자는 드러내지 않고 기록 수만. */
  async list(limit = 200): Promise<FoodAdminNutrientRefsResultType> {
    const rows = await this.prisma.$queryRaw<
      {
        nameNorm: string;
        name: string;
        method: string;
        refFoodId: string | null;
        refFoodName: string | null;
        confidence: string | null;
        reason: string | null;
        candidateFoodId: string | null;
        candidateFoodName: string | null;
        updatedAt: Date | string | number;
        itemCount: bigint | number;
      }[]
    >`
      SELECT r.nameNorm, r.name, r.method, r.refFoodId, f.name AS refFoodName, r.confidence, r.reason,
             r.candidateFoodId, cf.name AS candidateFoodName, r.updatedAt,
             (SELECT COUNT(*) FROM meal_items i
               WHERE i.nameNorm = r.nameNorm
                  OR i.foodId IN (SELECT c.id FROM food_items c WHERE c.nameNorm = r.nameNorm)) AS itemCount
      FROM food_nutrient_refs r
      LEFT JOIN food_items f ON f.id = r.refFoodId
      LEFT JOIN food_items cf ON cf.id = r.candidateFoodId
      ORDER BY (r.refFoodId IS NULL) DESC, itemCount DESC, r.updatedAt DESC
      LIMIT ${limit}`;
    const [linked, unlinked] = await Promise.all([
      this.prisma.foodNutrientRef.count({ where: { refFoodId: { not: null } } }),
      this.prisma.foodNutrientRef.count({ where: { refFoodId: null } }),
    ]);
    return {
      items: rows.map((r) => ({
        name: r.name,
        nameNorm: r.nameNorm,
        method: (FOOD_NUTRIENT_REF_METHODS as readonly string[]).includes(r.method)
          ? (r.method as FoodNutrientRefMethod)
          : 'none',
        refFoodId: r.refFoodId,
        refFoodName: r.refFoodName,
        confidence: r.confidence,
        reason: r.reason,
        // 후보 행이 그새 사라졌으면(카탈로그 정리) 이름이 없다 — 화면에 '이걸로' 단추를 내지 않게 둘 다 비운다.
        candidateFoodId: r.candidateFoodName ? r.candidateFoodId : null,
        candidateFoodName: r.candidateFoodName,
        itemCount: Number(r.itemCount),
        updatedAt: new Date(r.updatedAt).toISOString(),
      })),
      linked,
      unlinked,
    };
  }

  /** 어드민 '바꾸기' — 기준이 될 수 있는 음식(영양소 + 100g당 열량)만, 이름·별칭 근접 순. */
  async candidates(q: string, limit = 10): Promise<{ id: string; name: string; dishType: string | null }[]> {
    const { index } = await this.context();
    return pickNutrientRefCandidates(q, index, limit).map((c) => ({ id: c.id, name: c.name, dishType: c.dishType }));
  }

  /**
   * 어드민 '다시 연결' — 이름을 주면 그 이름의 저장 판정을 지우고 다시 묻는다(force). 비우면 식단 기록에 나온 이름 전체를
   * 규칙 → AI 로(이번 버전으로 물어본 것은 그대로). 대상을 정한 뒤 연결은 백그라운드 — 보낸 대상 수를 돌려준다.
   */
  async relink(names?: readonly string[]): Promise<number> {
    if (!this.opts.aiConfig) return 0;
    let targets: NutrientRefTarget[];
    if (names && names.length > 0) {
      const norms = [...new Set(names.map(normalizeTerm).filter(Boolean))];
      const rows = await this.prisma.foodItem.findMany({ where: { nameNorm: { in: norms } }, select: ROW_SELECT });
      const rowByNorm = new Map(rows.map((r) => [r.nameNorm, r]));
      targets = names.flatMap((n) => {
        const norm = normalizeTerm(n);
        const row = rowByNorm.get(norm);
        if (row && isNutrientProfileRow(row)) return [];
        return [
          row
            ? { name: row.name, nameNorm: row.nameNorm, dishType: row.dishType, mainIngredient: row.mainIngredient, nutritionFrom: row.nutritionFrom }
            : { name: n.trim(), nameNorm: norm, dishType: null, nutritionFrom: null },
        ];
      });
      for (const t of targets) await this.clear(t.name);
    } else {
      const items = await this.prisma.mealItem.findMany({
        where: { kcal: { not: null } },
        select: { name: true, nameNorm: true, foodId: true, dishType: true },
        distinct: ['nameNorm', 'foodId'],
      });
      targets = await this.targetsForItems(items);
    }
    targets = dedupeTargets(targets);
    if (targets.length === 0) return 0;
    const release = this.gate.tryAcquire();
    if (!release && this.gate.queued >= BACKGROUND_QUEUE) return 0;
    const force = !!names?.length;
    void (async () => {
      const done = release ?? (await this.gate.acquire());
      try {
        const stats = await this.link(targets, { llm: true, force });
        this.opts.logger?.info(stats, '[food-nutrient-ref] 어드민 다시 연결');
      } finally {
        done();
      }
    })().catch((e: unknown) => {
      this.opts.logger?.warn({ err: e instanceof Error ? e.message : String(e) }, '[food-nutrient-ref] 어드민 다시 연결 실패');
    });
    return targets.length;
  }

  /** 어드민 지정(refFoodId null = "기준 음식 없음"으로 고정). 일괄 재실행이 덮지 않는다. */
  async setAdmin(name: string, refFoodId: string | null): Promise<void> {
    const nameNorm = normalizeTerm(name);
    if (!nameNorm) return;
    const ref = refFoodId
      ? await this.prisma.foodItem.findUnique({ where: { id: refFoodId }, select: ROW_SELECT })
      : null;
    if (refFoodId && !ref) throw new FoodNutrientRefError('not_found', '기준 음식을 찾을 수 없습니다.');
    if (ref && !isNutrientProfileRow(ref)) {
      throw new FoodNutrientRefError('invalid', '비타민·무기질과 100g당 열량이 있는 음식만 기준으로 지정할 수 있습니다.');
    }
    const data = {
      name: name.trim(),
      refFoodId: ref?.id ?? null,
      method: 'admin',
      confidence: null,
      reason: ref ? `어드민 지정: ${ref.name}` : '어드민: 기준 음식 없음',
      model: null,
      candidateFoodId: null,
      version: FOOD_NUTRIENT_REF_VERSION,
    };
    await this.prisma.foodNutrientRef.upsert({ where: { nameNorm }, create: { nameNorm, ...data }, update: data });
  }

  /** 저장된 판정을 지운다(어드민 지정 해제 포함) — 다음 점검은 규칙, 다음 연결은 규칙 → LLM 으로 다시 본다. */
  async clear(name: string): Promise<void> {
    const nameNorm = normalizeTerm(name);
    if (!nameNorm) return;
    await this.prisma.foodNutrientRef.deleteMany({ where: { nameNorm } });
    this.failures.clear(nameNorm);
  }

  private async askOne(
    provider: LLMProvider,
    model: string,
    index: NutrientRefIndex,
    t: NutrientRefTarget,
    outerSignal?: AbortSignal,
  ): Promise<'llm' | 'none' | 'failed'> {
    const candidates = pickNutrientRefCandidates(t.name, index);
    if (candidates.length === 0) {
      await this.save(t, null, 'none', { reason: '후보 없음', model });
      return 'none';
    }
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), LLM_TIMEOUT_MS);
    const onOuterAbort = (): void => ac.abort();
    outerSignal?.addEventListener('abort', onOuterAbort, { once: true });
    try {
      const res = await provider.complete({
        prompt: buildFoodNutrientRefPrompt(t.name, candidates.map((c) => c.name)),
        systemPrompt: FOOD_NUTRIENT_REF_SYSTEM_PROMPT,
        model,
        temperature: 0,
        maxTokens: 300,
        numCtx: 4096,
        format: FOOD_NUTRIENT_REF_JSON_SCHEMA as unknown as Record<string, unknown>,
        think: thinkOptionForModel(model),
        signal: ac.signal,
      });
      const parsed = parseLlmMatchOutput(res.text);
      if (!parsed) {
        this.opts.logger?.warn({ name: t.name, text: res.text.slice(0, 120) }, '[food-nutrient-ref] 파싱 실패');
        if (this.failures.record(t.nameNorm, true) < MENU_FAILURE_GIVE_UP_AFTER) return 'failed';
        await this.save(t, null, 'none', { reason: `응답 해석 실패 ${MENU_FAILURE_GIVE_UP_AFTER}회 — 판정 포기`, model });
        this.failures.clear(t.nameNorm);
        return 'none';
      }
      const hit = decideNutrientRef(parsed, candidates);
      // 고르긴 했는데 확신이 high 가 아니면 채택하지 않고 후보로만 남긴다 — 어드민이 '이걸로' 한 번에 지정한다.
      const unsure = hit ? null : (candidates.find((c) => c.name === parsed.choice) ?? null);
      await this.save(t, hit, hit ? 'llm' : 'none', {
        reason: parsed.reason,
        confidence: parsed.confidence,
        model,
        candidateId: unsure?.id ?? null,
      });
      this.failures.clear(t.nameNorm);
      return hit ? 'llm' : 'none';
    } catch (e) {
      this.opts.logger?.warn({ err: e instanceof Error ? e.message : String(e), name: t.name }, '[food-nutrient-ref] 호출 실패');
      // 업스트림 장애 — 이름 탓이 아니므로 간격만 두고 포기하지 않는다(호출자 취소는 제외).
      if (!outerSignal?.aborted) this.failures.record(t.nameNorm, false);
      return 'failed';
    } finally {
      clearTimeout(timer);
      outerSignal?.removeEventListener('abort', onOuterAbort);
    }
  }

  private async save(
    t: NutrientRefTarget,
    candidate: Pick<NutrientRefCandidate, 'id'> | null,
    method: FoodNutrientRefMethod,
    extra: { reason?: string | null; confidence?: string | null; model?: string | null; candidateId?: string | null },
  ): Promise<void> {
    const data = {
      name: t.name,
      refFoodId: candidate?.id ?? null,
      method,
      confidence: extra.confidence ?? null,
      reason: extra.reason ?? null,
      model: extra.model ?? null,
      candidateFoodId: extra.candidateId ?? null,
      version: FOOD_NUTRIENT_REF_VERSION,
    };
    await this.prisma.foodNutrientRef.upsert({
      where: { nameNorm: t.nameNorm },
      create: { nameNorm: t.nameNorm, ...data },
      update: data,
    });
  }
}

export class FoodNutrientRefError extends Error {
  constructor(
    readonly code: 'not_found' | 'invalid',
    message: string,
  ) {
    super(message);
    this.name = 'FoodNutrientRefError';
  }
}

/** LLM 판정 채택 — 후보 문자열을 글자 그대로 골랐고 high 일 때만(순수). */
export const decideNutrientRef = <T extends { name: string }>(out: LlmMatchOutput, candidates: readonly T[]): T | null => {
  if (!out.choice || out.confidence !== 'high') return null;
  return candidates.find((c) => c.name === out.choice) ?? null;
};

const dedupeTargets = (targets: readonly NutrientRefTarget[]): NutrientRefTarget[] => {
  const seen = new Map<string, NutrientRefTarget>();
  for (const t of targets) {
    const nameNorm = t.nameNorm || normalizeTerm(t.name);
    if (!nameNorm || seen.has(nameNorm)) continue;
    seen.set(nameNorm, { ...t, nameNorm });
  }
  return [...seen.values()];
};
