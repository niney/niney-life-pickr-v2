import { createHash } from 'node:crypto';
import type { MealRecommendation as PrismaMealRecommendation, PrismaClient } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import { z } from 'zod';
import {
  FoodCuisine,
  FoodDishType,
  FoodMainIngredient,
  MealRecommendationStatus,
  type CreateMealRecommendationInputType,
  type MealPreferenceType,
  type MealRecommendationContextType,
  type MealRecommendationFeedbackInputType,
  type MealRecommendationFeedbackType,
  type MealRecommendationItemType,
  type MealRecommendationStatusType,
  type MealRecommendationType,
  type MealSlotType,
} from '@repo/api-contract';
import { extractFirstJsonObject } from '../../lib/json.js';
import { thinkOptionForModel } from '@repo/utils';
import { normalizeTerm } from '../../lib/text.js';
import { adapterCache, type AdapterCache } from '../ai/adapter-cache.js';
import type { AiConfigService } from '../ai/ai.config.service.js';
import type { LLMProvider } from '../ai/adapters/llm-provider.js';
import type { OperationLogService } from '../logs/operation-log.service.js';
import { MealPreferenceService } from '../meal/meal-preference.service.js';
import {
  MealPatternService,
  buildProfile,
  describeProfile,
  scoreCandidate,
  type ScoredCandidate,
} from './meal-pattern.service.js';
import {
  MEAL_RECOMMENDATION_JSON_SCHEMA,
  MEAL_RECOMMENDATION_SYSTEM_PROMPT,
  MEAL_RECOMMENDATION_VERSION,
  buildMealRecommendationUserPrompt,
  fallbackReason,
} from './meal-recommendation.prompts.js';

// 다음 끼니 추천 — 결정적 점수(패턴 서비스) 위에 LLM 이 고르고 이유를 붙인다.
// LLM 이 없거나 실패하면 점수 상위 + 템플릿 이유로 폴백한다(status='fallback').
// 같은 날·끼니·프로필이면 캐시된 결과를 재사용한다(force 로만 새로 호출).

const LLM_TIMEOUT_MS = 60_000;
const LLM_MAX_TOKENS = 1200;
const LLM_NUM_CTX = 8192;
const LLM_TEMPERATURE = 0.4;
const PICK_MIN = 3;
const PICK_MAX = 5;
// LLM 에 넘길 후보 수 — 너무 많으면 프롬프트가 길어지고 선택이 흐려진다.
const PROMPT_CANDIDATES = 25;
const HISTORY_LIMIT = 50;
// 기록이 이보다 적으면 콜드 스타트 안내를 붙인다.
const COLD_START_ENTRIES = 5;

const LlmOutput = z.object({
  items: z.array(z.object({ name: z.string(), reason: z.string() })).default([]),
  summary: z.string().default(''),
});

export class MealRecommendationError extends Error {
  constructor(
    readonly code: 'not_found' | 'invalid',
    message: string,
  ) {
    super(message);
    this.name = 'MealRecommendationError';
  }
}

export interface MealRecommendationDeps {
  cache?: AdapterCache;
  logger?: FastifyBaseLogger;
  operationLog?: OperationLogService | null;
  pattern?: MealPatternService;
  preferences?: MealPreferenceService;
  // 좌표가 오면 현재 기온·강수를 채워 weather 가중치를 계절 추정 대신 실측으로 쓴다.
  // 실패·미설정(키 없음)은 조용히 null — 추천이 날씨 때문에 막히면 안 된다.
  weather?: (lat: number, lng: number) => Promise<{ tempC: number | null; rain: boolean | null } | null>;
}

export class MealRecommendationService {
  private readonly pattern: MealPatternService;
  private readonly preferences: MealPreferenceService;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly aiConfig: AiConfigService,
    private readonly deps: MealRecommendationDeps = {},
  ) {
    this.pattern = deps.pattern ?? new MealPatternService(prisma);
    this.preferences = deps.preferences ?? new MealPreferenceService(prisma);
  }

  private get log(): FastifyBaseLogger | null {
    return this.deps.logger ?? null;
  }

  private async resolveProvider(): Promise<{ provider: LLMProvider; model: string } | null> {
    const resolved = await this.aiConfig.getResolved('ollama-cloud', 'meal-recommend');
    if (!resolved) return null;
    const model = resolved.defaultModel.trim();
    if (!model) return null;
    return { provider: (this.deps.cache ?? adapterCache).get(resolved), model };
  }

  // 추천 화면 진입용 — 기록 수·최근 음식·선호·직전 추천을 한 번에.
  async context(userId: string, today: string): Promise<MealRecommendationContextType> {
    const [preference, entryCount, latest, recent] = await Promise.all([
      this.preferences.get(userId),
      this.prisma.mealEntry.count({ where: { userId } }),
      this.prisma.mealRecommendation.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } }),
      this.prisma.mealItem.findMany({
        where: { entry: { userId }, isMain: true },
        orderBy: { entry: { eatenAt: 'desc' } },
        select: { name: true },
        take: 12,
      }),
    ]);
    void today;
    return {
      entryCount,
      recentFoods: [...new Set(recent.map((r) => r.name))].slice(0, 8),
      preference,
      latest: latest ? toRecommendation(latest) : null,
    };
  }

  async list(userId: string, limit: number): Promise<MealRecommendationType[]> {
    const rows = await this.prisma.mealRecommendation.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map(toRecommendation);
  }

  async create(
    userId: string,
    input: CreateMealRecommendationInputType,
    today: string,
  ): Promise<{ recommendation: MealRecommendationType; cached: boolean }> {
    const preference = await this.preferences.get(userId);
    const history = await this.pattern.loadHistory(userId, today);
    const profile = buildProfile(history, input.targetSlot, today);
    const candidatesRaw = await this.pattern.buildCandidates(profile, preference);

    const month = Number(input.targetDate.slice(5, 7)) || new Date().getMonth() + 1;
    // 날씨는 있으면 쓰고 없으면 계절로 — 어느 쪽이든 추천은 나온다.
    const weather =
      this.deps.weather && input.lat !== null && input.lat !== undefined && input.lng !== null && input.lng !== undefined
        ? await this.deps.weather(input.lat, input.lng).catch(() => null)
        : null;
    const scored = candidatesRaw
      .map((c) =>
        scoreCandidate(c, {
          profile,
          preference,
          targetSlot: input.targetSlot,
          mealType: input.mealType ?? null,
          month,
          tempC: weather?.tempC ?? null,
          rain: weather?.rain ?? null,
          today,
        }),
      )
      .sort((a, b) => b.score - a.score);

    // 캐시 키 — 같은 날·끼니에 프로필·가중치·컨텍스트가 그대로면 다시 LLM 을 부르지 않는다.
    const hash = profileHash({
      preference,
      profileText: describeProfile(profile, input.targetSlot),
      targetSlot: input.targetSlot,
      targetDate: input.targetDate,
      mealType: input.mealType ?? null,
      note: input.note ?? null,
      // 날씨가 바뀌면 근거도 바뀌므로 캐시 키에 넣는다(기온은 5도 단위로 뭉갠다).
      weatherBucket: weather?.tempC !== null && weather?.tempC !== undefined ? Math.round(weather.tempC / 5) : null,
      rain: weather?.rain ?? null,
      candidateNames: scored.slice(0, PROMPT_CANDIDATES).map((c) => c.name),
    });
    if (!input.force) {
      const cached = await this.prisma.mealRecommendation.findFirst({
        where: { userId, targetDate: input.targetDate, targetSlot: input.targetSlot, profileHash: hash },
        orderBy: { createdAt: 'desc' },
      });
      if (cached) return { recommendation: toRecommendation(cached), cached: true };
    }

    if (scored.length === 0) {
      // 카탈로그가 비었고 기록도 없다 — 추천할 재료가 없다.
      const saved = await this.save(userId, input, hash, {
        items: [],
        summary: '추천할 음식 정보가 아직 없어요. 음식 카탈로그를 먼저 적재해 주세요.',
        status: 'fallback',
        model: null,
        notice: null,
        profileText: describeProfile(profile, input.targetSlot),
      });
      return { recommendation: saved, cached: false };
    }

    const oplog = this.deps.operationLog ?? null;
    const opRunId = oplog
      ? await oplog.startRun({ feature: 'meal-recommendation', trigger: 'user', meta: { candidateCount: scored.length } })
      : null;
    const started = Date.now();

    const notice =
      profile.entryCount < COLD_START_ENTRIES
        ? '기록이 아직 적어 추천 근거가 약해요. 몇 끼만 더 남겨 주세요.'
        : null;

    let items: MealRecommendationItemType[] = [];
    let summary = '';
    let status: MealRecommendationStatusType = 'fallback';
    let model: string | null = null;

    const resolved = await this.resolveProvider();
    if (resolved) {
      model = resolved.model;
      const prompt = buildMealRecommendationUserPrompt({
        profileText: describeProfile(profile, input.targetSlot),
        candidates: scored.slice(0, PROMPT_CANDIDATES),
        targetSlot: input.targetSlot,
        targetDate: input.targetDate,
        mealType: input.mealType ?? null,
        weights: preference.weights,
        excludedFoods: preference.excludedFoods,
        note: input.note ?? null,
        entryCount: profile.entryCount,
      });
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), LLM_TIMEOUT_MS);
      try {
        const res = await resolved.provider.complete({
          prompt,
          systemPrompt: MEAL_RECOMMENDATION_SYSTEM_PROMPT,
          model: resolved.model,
          temperature: LLM_TEMPERATURE,
          maxTokens: LLM_MAX_TOKENS,
          numCtx: LLM_NUM_CTX,
          format: MEAL_RECOMMENDATION_JSON_SCHEMA as unknown as Record<string, unknown>,
          // 이유 문장만 받으면 되므로 사고는 끈다(추론 모델이면 출력 토큰을 다 먹는다).
          think: thinkOptionForModel(resolved.model),
          signal: ac.signal,
        });
        const parsed = parseRecommendationOutput(res.text);
        if (parsed) {
          items = mapLlmItems(parsed.items, scored);
          summary = parsed.summary.trim();
          if (items.length > 0) status = 'done';
        }
        if (oplog && opRunId) {
          oplog.log({
            runId: opRunId,
            stage: 'llm',
            level: items.length > 0 ? 'info' : 'warn',
            message: items.length > 0 ? `추천 ${items.length}개` : 'LLM 응답에서 유효한 후보를 찾지 못함',
            meta: { model: resolved.model, picked: items.length },
          });
        }
      } catch (e) {
        this.log?.warn({ err: e }, '[meal-recommendation] LLM 호출 실패 — 점수 폴백');
        if (oplog && opRunId) {
          oplog.log({ runId: opRunId, stage: 'llm', level: 'error', message: 'LLM 호출 실패', meta: { model: resolved.model } });
        }
      } finally {
        clearTimeout(timer);
      }
    }

    // 부족분(또는 전량)은 점수 상위로 채운다 — LLM 이 없어도 추천은 나온다.
    if (items.length < PICK_MIN) {
      const taken = new Set(items.map((i) => normalizeTerm(i.name)));
      for (const c of scored) {
        if (items.length >= PICK_MIN) break;
        if (taken.has(c.nameNorm)) continue;
        taken.add(c.nameNorm);
        items.push(toItem(c, fallbackReason(c)));
      }
      if (!summary) {
        summary =
          profile.entryCount === 0
            ? '아직 기록이 없어 인기 있는 음식으로 골랐어요.'
            : '최근 식단과 겹치지 않는 쪽으로 골랐어요.';
      }
    }
    items = items.slice(0, PICK_MAX);

    const saved = await this.save(userId, input, hash, {
      items,
      summary,
      status,
      model: status === 'done' ? model : null,
      notice,
      profileText: describeProfile(profile, input.targetSlot),
    });

    if (oplog && opRunId) {
      await oplog.finishRun(opRunId, {
        status: 'done',
        meta: { status, itemCount: items.length, durationMs: Date.now() - started, model: model ?? undefined },
      });
    }
    return { recommendation: saved, cached: false };
  }

  async feedback(
    userId: string,
    id: string,
    input: MealRecommendationFeedbackInputType,
  ): Promise<MealRecommendationType> {
    const row = await this.prisma.mealRecommendation.findFirst({ where: { id, userId } });
    if (!row) throw new MealRecommendationError('not_found', '추천을 찾을 수 없습니다.');
    const prev = parseFeedback(row.feedbackJson);
    const merged: MealRecommendationFeedbackType = {
      pickedName: input.pickedName !== undefined ? input.pickedName : (prev?.pickedName ?? null),
      rating: input.rating !== undefined ? input.rating : (prev?.rating ?? null),
      eatenEntryId: input.eatenEntryId !== undefined ? input.eatenEntryId : (prev?.eatenEntryId ?? null),
    };
    const updated = await this.prisma.mealRecommendation.update({
      where: { id },
      data: { feedbackJson: JSON.stringify(merged) },
    });
    return toRecommendation(updated);
  }

  private async save(
    userId: string,
    input: CreateMealRecommendationInputType,
    hash: string,
    out: {
      items: MealRecommendationItemType[];
      summary: string;
      status: MealRecommendationStatusType;
      model: string | null;
      notice: string | null;
      profileText: string;
    },
  ): Promise<MealRecommendationType> {
    // 이력이 무한히 쌓이지 않게 — 사용자당 최근 HISTORY_LIMIT 개만 남긴다.
    const old = await this.prisma.mealRecommendation.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: HISTORY_LIMIT - 1,
      select: { id: true },
    });
    if (old.length > 0) {
      await this.prisma.mealRecommendation.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
    }
    const row = await this.prisma.mealRecommendation.create({
      data: {
        userId,
        targetDate: input.targetDate,
        targetSlot: input.targetSlot,
        contextJson: JSON.stringify({ mealType: input.mealType ?? null, note: input.note ?? null }),
        profileJson: JSON.stringify({ text: out.profileText }),
        itemsJson: JSON.stringify(out.items),
        summary: out.summary,
        notice: out.notice,
        status: out.status,
        model: out.model,
        promptVersion: MEAL_RECOMMENDATION_VERSION,
        profileHash: hash,
      },
    });
    return toRecommendation(row);
  }
}

// ── 순수 헬퍼 ───────────────────────────────────────────────────────────────

export const parseRecommendationOutput = (text: string): z.infer<typeof LlmOutput> | null => {
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

// LLM 이 고른 이름을 후보 풀에 맞춘다. 풀 밖 이름은 버린다(없는 음식 추천 방지).
export const mapLlmItems = (
  llmItems: { name: string; reason: string }[],
  pool: ScoredCandidate[],
): MealRecommendationItemType[] => {
  const byNorm = new Map(pool.map((c) => [c.nameNorm, c]));
  const out: MealRecommendationItemType[] = [];
  const used = new Set<string>();
  for (const it of llmItems) {
    const norm = normalizeTerm(it.name);
    const match = byNorm.get(norm);
    if (!match || used.has(norm)) continue;
    used.add(norm);
    out.push(toItem(match, it.reason.trim() || fallbackReason(match)));
    if (out.length >= PICK_MAX) break;
  }
  return out;
};

const toItem = (c: ScoredCandidate, reason: string): MealRecommendationItemType => ({
  name: c.name,
  foodId: c.foodId,
  dishType: c.dishType,
  mainIngredient: c.mainIngredient,
  cuisine: c.cuisine,
  reason,
  tags: c.tags,
  score: c.score,
  lastEatenDate: c.lastEatenDate,
});

const profileHash = (input: unknown): string =>
  createHash('sha1').update(JSON.stringify(input)).digest('hex').slice(0, 16);

const parseFeedback = (json: string | null): MealRecommendationFeedbackType | null => {
  if (!json) return null;
  try {
    const v = JSON.parse(json) as Partial<MealRecommendationFeedbackType>;
    return {
      pickedName: typeof v.pickedName === 'string' ? v.pickedName : null,
      rating: typeof v.rating === 'number' ? v.rating : null,
      eatenEntryId: typeof v.eatenEntryId === 'string' ? v.eatenEntryId : null,
    };
  } catch {
    return null;
  }
};

const parseItems = (json: string): MealRecommendationItemType[] => {
  try {
    const v: unknown = JSON.parse(json);
    if (!Array.isArray(v)) return [];
    return v
      .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null)
      .map((x) => ({
        name: String(x['name'] ?? ''),
        foodId: typeof x['foodId'] === 'string' ? x['foodId'] : null,
        dishType: FoodDishType.safeParse(x['dishType']).success ? (x['dishType'] as never) : null,
        mainIngredient: FoodMainIngredient.safeParse(x['mainIngredient']).success ? (x['mainIngredient'] as never) : null,
        cuisine: FoodCuisine.safeParse(x['cuisine']).success ? (x['cuisine'] as never) : null,
        reason: String(x['reason'] ?? ''),
        tags: Array.isArray(x['tags']) ? (x['tags'] as unknown[]).filter((t): t is string => typeof t === 'string') : [],
        score: typeof x['score'] === 'number' ? x['score'] : 0,
        lastEatenDate: typeof x['lastEatenDate'] === 'string' ? x['lastEatenDate'] : null,
      }))
      .filter((i) => i.name.length > 0);
  } catch {
    return [];
  }
};

export const toRecommendation = (row: PrismaMealRecommendation): MealRecommendationType => ({
  id: row.id,
  targetDate: row.targetDate,
  targetSlot: row.targetSlot as MealSlotType,
  items: parseItems(row.itemsJson),
  summary: row.summary,
  status: MealRecommendationStatus.safeParse(row.status).success
    ? (row.status as MealRecommendationStatusType)
    : 'fallback',
  model: row.model,
  promptVersion: row.promptVersion,
  notice: row.notice,
  feedback: parseFeedback(row.feedbackJson),
  createdAt: row.createdAt.toISOString(),
});

export type { MealPreferenceType };
