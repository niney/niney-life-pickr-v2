import type { FoodItem as PrismaFoodItem, PrismaClient } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import { z } from 'zod';
import {
  FoodCuisine,
  FoodDishType,
  FoodMainIngredient,
  type FoodCuisineType,
  type FoodDishTypeType,
  type FoodMainIngredientType,
} from '@repo/api-contract';
import { extractFirstJsonObject } from '../../lib/json.js';
import type { AiConfigService } from '../ai/ai.config.service.js';
import { adapterCache, type AdapterCache } from '../ai/adapter-cache.js';
import type { LLMProvider } from '../ai/adapters/llm-provider.js';
import {
  FOOD_CLASSIFY_CHUNK_SIZE,
  FOOD_CLASSIFY_JSON_SCHEMA,
  FOOD_CLASSIFY_SYSTEM_PROMPT,
  FOOD_CLASSIFY_VERSION,
  buildFoodClassifyUserPrompt,
  type FoodClassifyInputItem,
} from './food.prompts.js';

// 음식 카탈로그 LLM 2축 분류 — 매핑 테이블·이름 규칙으로 못 채운 행(또는 이전 버전 분류)을 청크로
// 분류해 채운다. purpose 는 chat(메뉴 정규화·글로벌 머지와 동일 — 텍스트 분류). 모델 미설정이면
// 조용히 skip(카탈로그는 규칙 분류만으로도 동작).
//
// 합치기 규칙: dishType 은 원본 분류 매핑이 있으면 그것이 우선(행에 이미 있으면 유지), mainIngredient·
// cuisine 은 LLM 값이 구체적(other 아님)이면 덮어쓴다 — 이름 규칙 추정은 LLM 보다 약하다.

const LLM_TEMPERATURE = 0;
const LLM_MAX_TOKENS = 4000;
const LLM_NUM_CTX = 8192;
const LLM_TIMEOUT_MS = 90_000;
const CHUNK_RETRY_LIMIT = 2;

const LlmClassifyOutput = z.object({
  items: z.array(
    z.object({
      name: z.string(),
      dishType: z.string(),
      mainIngredient: z.string(),
      cuisine: z.string(),
    }),
  ),
});

export interface FoodClassification {
  dishType: FoodDishTypeType | null;
  mainIngredient: FoodMainIngredientType | null;
  cuisine: FoodCuisineType | null;
}

export interface FoodClassifyServiceOptions {
  cache?: AdapterCache;
  logger?: FastifyBaseLogger;
}

export interface ClassifyPendingOptions {
  signal?: AbortSignal;
  // 처리 상한(행). 미지정 = 전부.
  limit?: number;
  onProgress?: (processed: number, total: number) => void;
}

export interface ClassifyPendingResult {
  total: number;
  processed: number;
  updated: number;
  failedChunks: number;
  // chat provider/model 미설정 — 아무것도 안 함.
  noProvider: boolean;
  model: string | null;
}

const toEnumOrNull = <T extends string>(
  schema: { safeParse: (v: unknown) => { success: boolean; data?: T } },
  v: string,
): T | null => {
  const r = schema.safeParse(v.trim().toLowerCase());
  return r.success ? (r.data as T) : null;
};

export class FoodClassifyService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly aiConfig: AiConfigService,
    private readonly opts: FoodClassifyServiceOptions = {},
  ) {}

  private get log(): FastifyBaseLogger | null {
    return this.opts.logger ?? null;
  }

  // 이름 목록 분류 — 카탈로그 행이 아니어도 쓸 수 있다(2차 인식의 미매칭 음식명 등). 결과 Map 키는 입력 name.
  async classifyNames(
    items: FoodClassifyInputItem[],
    signal?: AbortSignal,
  ): Promise<{ results: Map<string, FoodClassification>; model: string | null; failedChunks: number }> {
    const results = new Map<string, FoodClassification>();
    if (items.length === 0) return { results, model: null, failedChunks: 0 };
    const resolved = await this.aiConfig.getResolved('ollama-cloud', 'chat');
    const model = resolved?.defaultModel?.trim() ?? '';
    if (!resolved || !model) return { results, model: null, failedChunks: 0 };
    const provider = (this.opts.cache ?? adapterCache).get(resolved);

    let failedChunks = 0;
    for (let i = 0; i < items.length; i += FOOD_CLASSIFY_CHUNK_SIZE) {
      if (signal?.aborted) break;
      const chunk = items.slice(i, i + FOOD_CLASSIFY_CHUNK_SIZE);
      const out = await this.callChunk(provider, model, chunk, signal);
      if (!out) {
        failedChunks += 1;
        continue;
      }
      for (const [name, c] of out) results.set(name, c);
    }
    return { results, model, failedChunks };
  }

  // 미분류(세 축 중 하나라도 null) 또는 이전 버전 분류의 활성 행을 분류해 반영.
  async classifyPending(opts: ClassifyPendingOptions = {}): Promise<ClassifyPendingResult> {
    const resolved = await this.aiConfig.getResolved('ollama-cloud', 'chat');
    const model = resolved?.defaultModel?.trim() ?? '';
    if (!resolved || !model) {
      return { total: 0, processed: 0, updated: 0, failedChunks: 0, noProvider: true, model: null };
    }
    const provider = (this.opts.cache ?? adapterCache).get(resolved);

    const where = {
      active: true,
      OR: [
        { dishType: null },
        { mainIngredient: null },
        { cuisine: null },
        { classifyVersion: null },
        { classifyVersion: { lt: FOOD_CLASSIFY_VERSION } },
      ],
    };
    const totalAll = await this.prisma.foodItem.count({ where });
    const total = opts.limit !== undefined ? Math.min(totalAll, opts.limit) : totalAll;
    let processed = 0;
    let updated = 0;
    let failedChunks = 0;
    opts.onProgress?.(0, total);

    // 커서 대신 "아직 이번 버전으로 분류 안 된 행"을 반복 조회 — 실패 청크는 classifyVersion 을 올리지
    // 않으므로 무한 루프를 막기 위해 id 로 건너뛴다.
    const seen = new Set<string>();
    while (processed < total) {
      if (opts.signal?.aborted) break;
      const rows = await this.prisma.foodItem.findMany({
        where: { ...where, ...(seen.size > 0 ? { id: { notIn: [...seen] } } : {}) },
        orderBy: [{ popularity: 'desc' }, { name: 'asc' }],
        take: Math.min(FOOD_CLASSIFY_CHUNK_SIZE, total - processed),
      });
      if (rows.length === 0) break;
      for (const r of rows) seen.add(r.id);

      const inputs: FoodClassifyInputItem[] = rows.map((r) => ({ name: r.name, hint: buildHint(r) }));
      const out = await this.callChunk(provider, model, inputs, opts.signal);
      processed += rows.length;
      if (!out) {
        failedChunks += 1;
        opts.onProgress?.(processed, total);
        continue;
      }
      for (const r of rows) {
        const c = out.get(r.name);
        if (!c) continue;
        const next = mergeClassification(r, c);
        await this.prisma.foodItem.update({
          where: { id: r.id },
          data: {
            dishType: next.dishType,
            mainIngredient: next.mainIngredient,
            cuisine: next.cuisine,
            classifyVersion: FOOD_CLASSIFY_VERSION,
            classifyModel: model,
          },
        });
        updated += 1;
      }
      opts.onProgress?.(processed, total);
    }
    return { total, processed, updated, failedChunks, noProvider: false, model };
  }

  private async callChunk(
    provider: LLMProvider,
    model: string,
    items: FoodClassifyInputItem[],
    outerSignal?: AbortSignal,
  ): Promise<Map<string, FoodClassification> | null> {
    const prompt = buildFoodClassifyUserPrompt(items);
    let lastError: string | null = null;
    for (let attempt = 0; attempt < CHUNK_RETRY_LIMIT; attempt += 1) {
      if (outerSignal?.aborted) return null;
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), LLM_TIMEOUT_MS);
      const onOuterAbort = (): void => ac.abort();
      outerSignal?.addEventListener('abort', onOuterAbort, { once: true });
      try {
        const res = await provider.complete({
          prompt,
          systemPrompt: FOOD_CLASSIFY_SYSTEM_PROMPT,
          model,
          temperature: LLM_TEMPERATURE,
          maxTokens: LLM_MAX_TOKENS,
          numCtx: LLM_NUM_CTX,
          format: FOOD_CLASSIFY_JSON_SCHEMA as unknown as Record<string, unknown>,
          signal: ac.signal,
        });
        const parsed = parseClassifyOutput(res.text);
        if (parsed) return parsed;
        lastError = 'parse_failed';
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
        if (outerSignal?.aborted) return null;
      } finally {
        clearTimeout(timer);
        outerSignal?.removeEventListener('abort', onOuterAbort);
      }
    }
    this.log?.warn({ err: lastError, size: items.length }, '[food-classify] chunk failed');
    return null;
  }
}

const buildHint = (r: PrismaFoodItem): string | null => {
  const parts: string[] = [];
  if (r.sourceCategory) parts.push(`원본 분류: ${r.sourceCategory}`);
  if (r.repName && r.repName !== r.name) parts.push(`대표식품: ${r.repName}`);
  if (r.dishType) parts.push(`현재 dishType: ${r.dishType}`);
  return parts.length > 0 ? parts.join(' / ') : null;
};

export const parseClassifyOutput = (text: string): Map<string, FoodClassification> | null => {
  const candidate = extractFirstJsonObject(text) ?? text.trim();
  let json: unknown;
  try {
    json = JSON.parse(candidate);
  } catch {
    return null;
  }
  const parsed = LlmClassifyOutput.safeParse(json);
  if (!parsed.success) return null;
  const map = new Map<string, FoodClassification>();
  for (const it of parsed.data.items) {
    map.set(it.name.trim(), {
      dishType: toEnumOrNull<FoodDishTypeType>(FoodDishType, it.dishType),
      mainIngredient: toEnumOrNull<FoodMainIngredientType>(FoodMainIngredient, it.mainIngredient),
      cuisine: toEnumOrNull<FoodCuisineType>(FoodCuisine, it.cuisine),
    });
  }
  return map;
};

// 기존 행 값과 LLM 값 합치기 — 위 주석의 규칙.
export const mergeClassification = (
  row: { dishType: string | null; mainIngredient: string | null; cuisine: string | null },
  llm: FoodClassification,
): FoodClassification => {
  const cur = {
    dishType: FoodDishType.safeParse(row.dishType).success ? (row.dishType as FoodDishTypeType) : null,
    mainIngredient: FoodMainIngredient.safeParse(row.mainIngredient).success
      ? (row.mainIngredient as FoodMainIngredientType)
      : null,
    cuisine: FoodCuisine.safeParse(row.cuisine).success ? (row.cuisine as FoodCuisineType) : null,
  };
  const pick = <T extends string>(current: T | null, next: T | null): T | null => {
    if (next !== null && next !== 'other') return next;
    return current ?? next;
  };
  return {
    dishType: cur.dishType ?? llm.dishType,
    mainIngredient: pick(cur.mainIngredient, llm.mainIngredient),
    cuisine: pick(cur.cuisine, llm.cuisine),
  };
};
