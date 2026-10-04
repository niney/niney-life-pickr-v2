import { createHash } from 'node:crypto';
import type {
  MealNutritionAdvice as PrismaMealNutritionAdvice,
  PrismaClient,
} from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import { z } from 'zod';
import {
  MealNutritionAnalysis,
  MealSupplementAdviceItem,
  type CreateMealNutritionAdviceInputType,
  type MealNutrientResultType,
  type MealNutritionAdviceType,
  type MealNutritionAnalysisType,
  type MealSupplementAdviceItemType,
} from '@repo/api-contract';
import {
  MEAL_NUTRIENT_REFERENCE_LABEL,
  formatNutrientAmount,
  thinkOptionFor,
  thinkTokenMult,
  type ThinkOption,
} from '@repo/utils';
import { extractFirstJsonObject } from '../../lib/json.js';
import { adapterCache, type AdapterCache } from '../ai/adapter-cache.js';
import type { AiConfigService } from '../ai/ai.config.service.js';
import type { LLMProvider } from '../ai/adapters/llm-provider.js';
import type { OperationLogService } from '../logs/operation-log.service.js';
import { mealDataGeneration, mealMutationBarrier } from '../meal/meal-mutation-barrier.js';
import { NUTRIENT_DEFS, NUTRITION_DISCLAIMER, type NutrientDef } from './meal-nutrition.defs.js';
import {
  MEAL_NUTRITION_ADVICE_SYSTEM_PROMPT,
  MEAL_NUTRITION_ADVICE_VERSION,
  buildMealNutritionAdviceJsonSchema,
  buildMealNutritionAdviceUserPrompt,
  shortfallOf,
  supplementAllowed,
} from './meal-nutrition.prompts.js';
import { MealNutritionService } from './meal-nutrition.service.js';

// 영양제 조언 — 영양소 점검(결정적)이 고른 '조언 대상'만 텍스트 LLM(meal-supplement, 기본 kimi-k3)이 풀어 쓴다.
// 모델 문장은 검사한다: 후보 밖 영양소·한자·질병 효능(치료·예방)·프롬프트에 없는 용량 숫자가 있으면 그 칸만 서버 문장으로
// 바꾼다. 부족분·상한·주의 문구는 서버 값이다. LLM 이 없거나 실패하면 서버 문장만으로 조언한다(status=fallback).
// 같은 날·같은 점검 결과면 저장된 조언을 다시 준다(일일 한도 미차감, force 로만 새로).

const LLM_TIMEOUT_MS = 90_000;
// 어드민이 추론을 켜면 사고 토큰만큼 출력 예산·타임아웃을 배수로 키운다(상한).
const LLM_TIMEOUT_MAX_MS = 180_000;
const LLM_MAX_TOKENS = 2000;
const LLM_NUM_CTX = 8192;
const LLM_TEMPERATURE = 0.3;
// 한 번에 조언할 영양소 수 — 많으면 우선순위(부족 → 조금 부족, 비율 낮은 순)로 자른다.
const MAX_ADVICE_ITEMS = 6;
// 사용자별 보관 이력.
const HISTORY_LIMIT = 20;
// 모델 문장 한 칸의 최대 길이 — 넘으면 잘린 문장 대신 서버 문장을 쓴다.
const TEXT_MAX = 400;

const LlmOutput = z.object({
  summary: z.string().default(''),
  items: z
    .array(
      z.object({
        nutrient: z.string(),
        reason: z.string().default(''),
        foodTip: z.string().default(''),
        supplementTip: z.string().nullable().default(''),
      }),
    )
    .default([]),
});
type LlmOutputType = z.infer<typeof LlmOutput>;

export class MealNutritionAdviceError extends Error {
  constructor(
    readonly code: 'quota' | 'conflict',
    message: string,
  ) {
    super(message);
    this.name = 'MealNutritionAdviceError';
  }
}

export interface MealNutritionAdviceDeps {
  cache?: AdapterCache;
  logger?: FastifyBaseLogger;
  operationLog?: OperationLogService | null;
  nutrition?: MealNutritionService;
  // LLM 경로에 들어가기 직전(캐시 miss·조언 대상 있음)에만 호출한다. false 면 호출·저장을 모두 막는다.
  consumeQuota?: (userId: string) => boolean | Promise<boolean>;
  llmTimeoutMs?: number;
}

interface ResolvedLlm {
  provider: LLMProvider;
  model: string;
  think: ThinkOption;
  tokenMult: number;
}

export class MealNutritionAdviceService {
  private readonly nutrition: MealNutritionService;
  private readonly inFlight = new Map<
    string,
    Promise<{ advice: MealNutritionAdviceType; cached: boolean }>
  >();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly aiConfig: AiConfigService,
    private readonly deps: MealNutritionAdviceDeps = {},
  ) {
    this.nutrition = deps.nutrition ?? new MealNutritionService(prisma);
  }

  async latest(userId: string): Promise<MealNutritionAdviceType | null> {
    const row = await this.prisma.mealNutritionAdvice.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return row ? toAdvice(row) : null;
  }

  async create(
    userId: string,
    input: CreateMealNutritionAdviceInputType,
    today: string,
  ): Promise<{ advice: MealNutritionAdviceType; cached: boolean }> {
    // 연타는 첫 Promise 에 합류한다(LLM·한도 1회). 점검·LLM(최대 90~180초)은 사용자 쓰기 장벽 밖에서 하고
    // 저장할 때만 장벽을 잡는다 — 그동안 같은 사용자의 기록 저장이 막히지 않는다. 전체 삭제와의 경합은 데이터
    // 세대로 막는다(계산 전에 읽은 세대가 저장 시점에 바뀌었으면 버린다 — 지운 기록의 분석이 다시 생기지 않는다).
    const key = JSON.stringify([userId, today, input.days, input.force]);
    const existing = this.inFlight.get(key);
    if (existing) return existing;
    const pending = this.createOnce(userId, input, today);
    this.inFlight.set(key, pending);
    try {
      return await pending;
    } finally {
      if (this.inFlight.get(key) === pending) this.inFlight.delete(key);
    }
  }

  private async resolveProvider(): Promise<ResolvedLlm | null> {
    const resolved = await this.aiConfig.getResolved('ollama-cloud', 'meal-supplement');
    if (!resolved) return null;
    const model = resolved.defaultModel.trim();
    if (!model) return null;
    // 어드민 "추론" 설정 — kimi 계열에만 반영, 그 외 모델은 규칙(thinkOptionForModel).
    const think = thinkOptionFor(model, resolved.thinking);
    return {
      provider: (this.deps.cache ?? adapterCache).get(resolved),
      model,
      think,
      tokenMult: thinkTokenMult(think),
    };
  }

  private async createOnce(
    userId: string,
    input: CreateMealNutritionAdviceInputType,
    today: string,
  ): Promise<{ advice: MealNutritionAdviceType; cached: boolean }> {
    // 점검 근거를 읽기 전에 세대를 잡는다 — 이후 전체 삭제가 끼면 저장 시점에 알아챈다.
    const generation = mealDataGeneration.read(userId, 'all');
    const analysis = await this.nutrition.analyze(userId, today, input.days);
    const candidates = adviceCandidates(analysis);
    const hash = adviceHash(input.days, analysis);

    // 서버 문장으로 끝난 조언(fallback)은 재사용하지 않는다 — 다시 누르면 모델을 다시 불러 본다.
    if (!input.force) {
      const cached = await this.prisma.mealNutritionAdvice.findFirst({
        where: {
          userId,
          targetDate: today,
          inputHash: hash,
          promptVersion: MEAL_NUTRITION_ADVICE_VERSION,
          status: { in: ['done', 'insufficient'] },
        },
        orderBy: { createdAt: 'desc' },
      });
      const advice = cached ? toAdvice(cached) : null;
      if (advice) return { advice, cached: true };
    }

    // 기록이 모자라거나 조언할 영양소가 없으면 모델을 부르지 않는다(한도 미차감).
    if (analysis.status !== 'ok' || candidates.length === 0) {
      const advice = await this.save(userId, today, hash, generation, {
        analysis,
        items: [],
        summary: fallbackSummary(analysis, candidates),
        status: analysis.status === 'ok' ? 'done' : 'insufficient',
        model: null,
      });
      return { advice, cached: false };
    }

    if (this.deps.consumeQuota && !(await this.deps.consumeQuota(userId))) {
      throw new MealNutritionAdviceError(
        'quota',
        '오늘 영양제 조언 한도를 모두 썼습니다. 내일 다시 시도해 주세요.',
      );
    }

    const oplog = this.deps.operationLog ?? null;
    const opRunId = oplog
      ? await oplog.startRun({
          feature: 'meal-nutrition-advice',
          trigger: 'user',
          meta: { candidates: candidates.map((c) => c.key).join(',') },
        })
      : null;
    const started = Date.now();

    let items = candidates.map(fallbackAdviceItem);
    let summary = fallbackSummary(analysis, candidates);
    let status: 'done' | 'fallback' = 'fallback';
    let model: string | null = null;
    let repairs: string[] = [];

    const resolved = await this.resolveProvider();
    if (resolved) {
      model = resolved.model;
      const prompt = buildMealNutritionAdviceUserPrompt({
        analysis,
        candidates,
        sodiumHigh: analysis.nutrients.find((n) => n.key === 'sodium' && n.status === 'high') ?? null,
      });
      const ac = new AbortController();
      const timer = setTimeout(
        () => ac.abort(),
        this.deps.llmTimeoutMs ??
          Math.min(LLM_TIMEOUT_MAX_MS, Math.round(LLM_TIMEOUT_MS * resolved.tokenMult)),
      );
      try {
        const res = await resolved.provider.complete({
          prompt,
          systemPrompt: MEAL_NUTRITION_ADVICE_SYSTEM_PROMPT,
          model: resolved.model,
          temperature: LLM_TEMPERATURE,
          maxTokens: Math.round(LLM_MAX_TOKENS * resolved.tokenMult),
          numCtx: LLM_NUM_CTX,
          format: buildMealNutritionAdviceJsonSchema(candidates.map((c) => c.key)) as unknown as Record<
            string,
            unknown
          >,
          think: resolved.think,
          signal: ac.signal,
        });
        const parsed = parseAdviceOutput(res.text);
        if (parsed) {
          const checked = sanitizeAdvice(parsed, {
            analysis,
            candidates,
            allowedNumbers: allowedNumbersFor(prompt, candidates),
          });
          if (checked.llmItems > 0) {
            items = checked.items;
            summary = checked.summary;
            repairs = checked.repairs;
            status = 'done';
          }
        }
        if (status !== 'done') {
          this.log?.warn(
            { model: resolved.model, doneReason: res.doneReason ?? null },
            '[meal-nutrition-advice] LLM 응답에서 유효한 조언을 찾지 못함 — 서버 문장',
          );
        }
        if (oplog && opRunId) {
          oplog.log({
            runId: opRunId,
            stage: 'llm',
            level: status === 'done' ? (repairs.length > 0 ? 'warn' : 'info') : 'warn',
            message:
              status === 'done'
                ? `조언 ${items.length}개${repairs.length > 0 ? ` · 서버 문장으로 바꾼 칸 ${repairs.length}` : ''}`
                : 'LLM 응답에서 유효한 조언을 찾지 못함',
            meta: { model: resolved.model, repairs: repairs.join(',') },
          });
        }
      } catch (e) {
        this.log?.warn({ err: e }, '[meal-nutrition-advice] LLM 호출 실패 — 서버 문장');
        if (oplog && opRunId) {
          oplog.log({
            runId: opRunId,
            stage: 'llm',
            level: 'error',
            message: 'LLM 호출 실패',
            meta: { model: resolved.model },
          });
        }
      } finally {
        clearTimeout(timer);
      }
    }

    let advice: MealNutritionAdviceType;
    try {
      advice = await this.save(userId, today, hash, generation, {
        analysis,
        items,
        summary,
        status,
        model: status === 'done' ? model : null,
      });
    } catch (e) {
      // 계산 중 전체 삭제로 버린 결과(conflict)는 실패가 아니라 취소로 남긴다.
      if (oplog && opRunId) {
        await oplog.finishRun(opRunId, {
          status: e instanceof MealNutritionAdviceError && e.code === 'conflict' ? 'cancelled' : 'failed',
          errorCode: e instanceof MealNutritionAdviceError ? e.code : 'save_failed',
          meta: { durationMs: Date.now() - started },
        });
      }
      throw e;
    }
    if (oplog && opRunId) {
      await oplog.finishRun(opRunId, {
        status: 'done',
        meta: {
          status,
          itemCount: items.length,
          durationMs: Date.now() - started,
          model: model ?? undefined,
        },
      });
    }
    return { advice, cached: false };
  }

  private get log(): FastifyBaseLogger | null {
    return this.deps.logger ?? null;
  }

  private async save(
    userId: string,
    today: string,
    hash: string,
    generation: number,
    out: {
      analysis: MealNutritionAnalysisType;
      items: MealSupplementAdviceItemType[];
      summary: string;
      status: 'done' | 'fallback' | 'insufficient';
      model: string | null;
    },
  ): Promise<MealNutritionAdviceType> {
    return mealMutationBarrier.runExclusive(userId, async () => {
      if (mealDataGeneration.read(userId, 'all') !== generation) {
        throw new MealNutritionAdviceError(
          'conflict',
          '조언을 만드는 동안 식단 데이터가 삭제되어 저장하지 않았습니다. 다시 시도해 주세요.',
        );
      }
      const old = await this.prisma.mealNutritionAdvice.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: HISTORY_LIMIT - 1,
        select: { id: true },
      });
      if (old.length > 0) {
        await this.prisma.mealNutritionAdvice.deleteMany({
          where: { id: { in: old.map((o) => o.id) } },
        });
      }
      const row = await this.prisma.mealNutritionAdvice.create({
        data: {
          userId,
          targetDate: today,
          analysisJson: JSON.stringify(out.analysis),
          itemsJson: JSON.stringify(out.items),
          summary: out.summary,
          status: out.status,
          model: out.model,
          promptVersion: MEAL_NUTRITION_ADVICE_VERSION,
          inputHash: hash,
        },
      });
      return toAdvice(row, out.analysis)!;
    });
  }
}

// ── 순수 헬퍼 ───────────────────────────────────────────────────────────────

const defOf = (key: string): NutrientDef => NUTRIENT_DEFS.find((d) => d.key === key)!;

const roundAmount = (v: number): number => Number(formatNutrientAmount(v).replace(/,/g, ''));

/** 조언 대상 — 열량을 채워 봐도 모자란 영양소(supplementCandidate)만, 부족 → 조금 부족·비율 낮은 순. */
export const adviceCandidates = (analysis: MealNutritionAnalysisType): MealNutrientResultType[] =>
  analysis.status !== 'ok'
    ? []
    : analysis.nutrients
        .filter((n) => n.supplementCandidate && (n.status === 'low' || n.status === 'borderline'))
        .sort((a, b) =>
          a.status === b.status
            ? (a.percent ?? 0) - (b.percent ?? 0)
            : a.status === 'low'
              ? -1
              : 1,
        )
        .slice(0, MAX_ADVICE_ITEMS);

const fallbackReason = (n: MealNutrientResultType): string => {
  const head =
    n.intakePerDay !== null && n.percent !== null
      ? `기록으로 본 하루 평균은 ${formatNutrientAmount(n.intakePerDay)}${n.unit}, ${MEAL_NUTRIENT_REFERENCE_LABEL[n.reference.kind]}(${formatNutrientAmount(n.reference.amount)}${n.unit})의 ${n.percent}% 수준이에요.`
      : `기록으로 보면 ${MEAL_NUTRIENT_REFERENCE_LABEL[n.reference.kind]}보다 적어요.`;
  return n.topSources.length > 0
    ? `${head} 주로 ${n.topSources.slice(0, 2).join('·')}에서 얻었어요.`
    : head;
};

const fallbackFoodTip = (n: MealNutrientResultType): string => {
  const typical = n.typicalFoods.slice(0, 3).join('·');
  if (n.foodSuggestions.length > 0) {
    return `한 끼로는 ${n.foodSuggestions.slice(0, 2).join('·')}, 평소에는 ${typical} 같은 음식을 챙겨 보세요.`;
  }
  return `${typical} 같은 음식으로 먼저 채워 보세요.`;
};

const fallbackSupplementTip = (n: MealNutrientResultType): string | null => {
  const def = defOf(n.key);
  if (!supplementAllowed(n)) return null;
  const shortfall = shortfallOf(n);
  const parts = [`영양제를 고른다면: ${def.supplementForms}.`];
  if (shortfall !== null && shortfall > 0) {
    parts.push(`하루 부족분(약 ${formatNutrientAmount(shortfall)}${n.unit}) 정도면 충분해요.`);
  }
  if (n.upperLimit !== null) parts.push(`상한섭취량(${formatNutrientAmount(n.upperLimit)}${n.unit})은 넘기지 마세요.`);
  return parts.join(' ');
};

/** 서버 문장만으로 쓴 조언 한 칸 — LLM 이 없거나 그 칸이 검사에 걸렸을 때. */
export const fallbackAdviceItem = (n: MealNutrientResultType): MealSupplementAdviceItemType => {
  const def = defOf(n.key);
  const shortfall = shortfallOf(n);
  return {
    nutrient: n.key,
    label: n.label,
    reason: fallbackReason(n),
    foodTip: fallbackFoodTip(n),
    supplementTip: fallbackSupplementTip(n),
    unit: n.unit,
    shortfallPerDay: shortfall === null ? null : roundAmount(shortfall),
    upperLimit: n.upperLimit,
    caution: def.caution,
  };
};

export const fallbackSummary = (
  analysis: MealNutritionAnalysisType,
  candidates: readonly MealNutrientResultType[],
): string => {
  if (analysis.status !== 'ok') {
    return analysis.insufficientReason ?? '기록이 더 쌓이면 영양소를 점검할 수 있어요.';
  }
  const sodium = analysis.nutrients.some((n) => n.key === 'sodium' && n.status === 'high');
  const sodiumText = sodium ? ' 나트륨은 기준보다 많아 국물·젓갈을 줄이면 좋아요.' : '';
  if (candidates.length === 0) {
    const unknown = analysis.nutrients.some((n) => n.status === 'unknown');
    return (
      `최근 ${analysis.days}일 기록으로 보면 따로 챙길 만큼 모자란 영양소는 없어요.` +
      (unknown ? ' 정보가 부족한 영양소는 판단을 미뤘어요.' : '') +
      sodiumText
    );
  }
  const supplements = candidates.filter(supplementAllowed).length;
  return (
    `최근 ${analysis.days}일 중 ${analysis.analyzedDays}일 기록으로 보면 ${candidates.map((n) => n.label).join('·')} 쪽이 모자라요.` +
    (supplements > 0
      ? ' 음식으로 먼저 채워 보고, 어렵다면 영양제를 참고하세요.'
      : ' 음식으로 채워 보세요.') +
    (supplements >= 3
      ? ' 영양제로 채울 게 여러 개라 하나씩 따로 사기보다 종합비타민 하나로 시작하는 편이 간편해요.'
      : '') +
    sodiumText
  );
};

export const parseAdviceOutput = (text: string): LlmOutputType | null => {
  const candidate = extractFirstJsonObject(text) ?? text.trim();
  let json: unknown;
  try {
    json = JSON.parse(candidate);
  } catch {
    return null;
  }
  const parsed = LlmOutput.safeParse(json);
  return parsed.success ? parsed.data : null;
};

const NUMBER_RE = /\d+(?:,\d{3})*(?:\.\d+)?/g;
// 용량·비율로 읽히는 숫자 — 이것만 프롬프트와 대조한다('하루 1~2번'·'15~20분' 같은 건 보지 않는다).
const DOSE_RE =
  /(\d+(?:,\d{3})*(?:\.\d+)?)\s*(mg|μg|µg|㎍|mcg|ug|iu|kcal|g|%|밀리그램|마이크로그램|그램)/giu;
const HAN_RE = /\p{Script=Han}/u;
// 병을 고치거나 막는다는 말 — 진단·치료 조언처럼 읽히지 않게.
const CLAIM_RE = /치료|완치|예방/;
// 점검하지 않은 영양소·흔한 건강기능식품 — 기록 근거 없이 권하게 되므로 말하지 않는다(NOT_MEASURED_NUTRIENTS 등).
const OFF_LIST_RE =
  /마그네슘|아연|엽산|오메가|요오드|셀레늄|유산균|프로바이오틱스|루테인|밀크씨슬|콜라겐|코엔자임|비오틴|비타민\s?(?:B6|B12|E|K)(?![A-Za-z0-9])/;

const toNumber = (raw: string): number => Number(raw.replace(/,/g, ''));

/** 프롬프트에 나온 숫자(+ 기준 대비 % 의 나머지) — 모델 문장의 용량·비율은 이 안에 있어야 한다. */
export const allowedNumbersFor = (
  prompt: string,
  candidates: readonly MealNutrientResultType[],
): Set<number> => {
  const out = new Set<number>();
  for (const m of prompt.matchAll(NUMBER_RE)) out.add(toNumber(m[0]));
  for (const n of candidates) if (n.percent !== null) out.add(100 - n.percent);
  return out;
};

/** 모델 문장 한 칸의 문제 — 없으면 null. */
export const textProblem = (text: string, allowed: ReadonlySet<number>): string | null => {
  if (text.length === 0) return 'empty';
  if (text.length > TEXT_MAX) return 'long';
  if (HAN_RE.test(text)) return 'hanja';
  if (CLAIM_RE.test(text)) return 'claim';
  if (OFF_LIST_RE.test(text)) return 'offlist';
  for (const m of text.matchAll(DOSE_RE)) {
    if (!allowed.has(toNumber(m[1]!))) return 'number';
  }
  return null;
};

export interface SanitizedAdvice {
  items: MealSupplementAdviceItemType[];
  summary: string;
  // 후보 중 모델이 조언을 쓴 수(0 이면 실패로 본다).
  llmItems: number;
  // 서버 문장으로 바꾼 칸 — "calcium.supplementTip:number" 꼴.
  repairs: string[];
}

/** 모델 출력을 후보·검사에 맞춘다 — 후보 순서대로, 빠진 영양소·걸린 칸은 서버 문장. */
export const sanitizeAdvice = (
  out: LlmOutputType,
  ctx: {
    analysis: MealNutritionAnalysisType;
    candidates: readonly MealNutrientResultType[];
    allowedNumbers: ReadonlySet<number>;
  },
): SanitizedAdvice => {
  const repairs: string[] = [];
  let llmItems = 0;
  const pick = (label: string, text: string | null | undefined, fallback: string): string => {
    const trimmed = (text ?? '').trim();
    const problem = textProblem(trimmed, ctx.allowedNumbers);
    if (problem) {
      repairs.push(`${label}:${problem}`);
      return fallback;
    }
    return trimmed;
  };
  const items = ctx.candidates.map((n) => {
    const base = fallbackAdviceItem(n);
    const llm = out.items.find((it) => it.nutrient.trim() === n.key);
    if (!llm) {
      repairs.push(`${n.key}:missing`);
      return base;
    }
    llmItems += 1;
    return {
      ...base,
      reason: pick(`${n.key}.reason`, llm.reason, base.reason),
      foodTip: pick(`${n.key}.foodTip`, llm.foodTip, base.foodTip),
      // 영양제를 권하지 않는 영양소(음식으로만·조금 부족)는 모델이 뭐라 써도 영양제 칸을 비운다.
      supplementTip:
        base.supplementTip !== null
          ? pick(`${n.key}.supplementTip`, llm.supplementTip, base.supplementTip)
          : null,
    };
  });
  const summary = pick('summary', out.summary, fallbackSummary(ctx.analysis, ctx.candidates));
  return { items, summary, llmItems, repairs };
};

export const adviceHash = (days: number, analysis: MealNutritionAnalysisType): string =>
  createHash('sha1')
    .update(JSON.stringify([MEAL_NUTRITION_ADVICE_VERSION, days, analysis]))
    .digest('hex')
    .slice(0, 16);

const ADVICE_STATUSES = new Set(['done', 'fallback', 'insufficient']);

/** 저장 행 → 계약. 점검 결과 스냅샷이 지금 계약과 맞지 않으면(옛 버전) null. */
export const toAdvice = (
  row: PrismaMealNutritionAdvice,
  known?: MealNutritionAnalysisType,
): MealNutritionAdviceType | null => {
  let analysis = known;
  if (!analysis) {
    try {
      const parsed = MealNutritionAnalysis.safeParse(JSON.parse(row.analysisJson));
      if (!parsed.success) return null;
      analysis = parsed.data;
    } catch {
      return null;
    }
  }
  let items: MealSupplementAdviceItemType[] = [];
  try {
    const parsed = z.array(MealSupplementAdviceItem).safeParse(JSON.parse(row.itemsJson));
    if (parsed.success) items = parsed.data;
  } catch {
    // 깨진 행은 항목 없이 보여 준다.
  }
  return {
    id: row.id,
    targetDate: row.targetDate,
    status: ADVICE_STATUSES.has(row.status)
      ? (row.status as MealNutritionAdviceType['status'])
      : 'fallback',
    model: row.model,
    summary: row.summary,
    items,
    disclaimer: NUTRITION_DISCLAIMER,
    analysis,
    createdAt: row.createdAt.toISOString(),
  };
};
