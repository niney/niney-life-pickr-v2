import { createHash } from 'node:crypto';
import type {
  MealRecommendation as PrismaMealRecommendation,
  MealRecommendationEvent as PrismaMealRecommendationEvent,
  PrismaClient,
} from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import { z } from 'zod';
import {
  MealRecommendationStatus,
  type CreateMealRecommendationInputType,
  type MealPreferenceType,
  type MealRecommendationContextType,
  type MealRecommendationFeedbackInputType,
  type MealRecommendationFeedbackType,
  type MealRecommendationEventInputType,
  type MealRecommendationEventType,
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
import { mealMutationBarrier } from '../meal/meal-mutation-barrier.js';
import {
  MealPatternService,
  buildProfile,
  describeProfile,
  scoreCandidate,
  type ScoredCandidate,
} from './meal-pattern.service.js';
import {
  findMealRecommendationCandidate,
  parseMealRecommendationFeedback,
  parseMealRecommendationItems,
} from './meal-recommendation.feedback.js';
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
    readonly code: 'not_found' | 'invalid' | 'quota',
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
  weather?: (
    lat: number,
    lng: number,
  ) => Promise<{ tempC: number | null; rain: boolean | null } | null>;
  // 캐시 miss 에서만, LLM 가능 경로에 들어가기 전에 호출한다. false 면 호출·저장을 모두 막는다.
  consumeQuota?: (userId: string) => boolean | Promise<boolean>;
}

export class MealRecommendationService {
  private readonly pattern: MealPatternService;
  private readonly preferences: MealPreferenceService;
  private readonly inFlight = new Map<
    string,
    Promise<{ recommendation: MealRecommendationType; cached: boolean }>
  >();

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
      this.prisma.mealRecommendation.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        include: { events: { orderBy: { createdAt: 'asc' } } },
      }),
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
      include: { events: { orderBy: { createdAt: 'asc' } } },
    });
    return rows.map(toRecommendation);
  }

  async create(
    userId: string,
    input: CreateMealRecommendationInputType,
    today: string,
  ): Promise<{ recommendation: MealRecommendationType; cached: boolean }> {
    // 동일 사용자의 같은 요청은 첫 Promise 에 합류한다. force 요청도 동시에 연타된 한 묶음은
    // LLM·quota 를 한 번만 소비하되, 완료 뒤 다시 누르면 새 요청으로 처리한다.
    const inFlightKey = JSON.stringify([
      userId,
      today,
      input.targetDate,
      input.targetSlot,
      input.mealType === undefined ? '__preference__' : input.mealType,
      input.note ?? null,
      input.lat ?? null,
      input.lng ?? null,
      input.force,
    ]);
    const existing = this.inFlight.get(inFlightKey);
    if (existing) return existing;

    // 동일 요청 합류 Map은 장벽 바깥에 둔다. 첫 Promise만 사용자 FIFO에 들어가므로 quota/LLM도
    // 한 번이고, 전체 삭제는 이 Promise(LLM과 저장 포함)가 끝난 뒤 실행된다. 즉 장기 LLM 중
    // 들어온 삭제도 기다린다. 그래야 삭제 응답 뒤 이전 추천 저장이 다시 생기는 창이 없다.
    const pending = mealMutationBarrier.runExclusive(userId, () =>
      this.createOnce(userId, input, today),
    );
    this.inFlight.set(inFlightKey, pending);
    try {
      return await pending;
    } finally {
      if (this.inFlight.get(inFlightKey) === pending) this.inFlight.delete(inFlightKey);
    }
  }

  private async createOnce(
    userId: string,
    input: CreateMealRecommendationInputType,
    today: string,
  ): Promise<{ recommendation: MealRecommendationType; cached: boolean }> {
    const preference = await this.preferences.get(userId);
    // mealType을 생략한 호출(홈 카드·구버전 클라이언트)은 저장한 주 식사 유형을 실제 점수에
    // 사용한다. null은 사용자가 명시적으로 "상황 무관"을 고른 값이라 덮어쓰지 않는다.
    const effectiveMealType =
      input.mealType === undefined ? (preference.mealTypes[0] ?? null) : input.mealType;
    const effectiveInput: CreateMealRecommendationInputType = {
      ...input,
      mealType: effectiveMealType,
    };
    const [history, feedbackSignals] = await Promise.all([
      this.pattern.loadHistory(userId, today),
      this.pattern.loadFeedbackSignals(userId, today),
    ]);
    const profile = buildProfile(history, input.targetSlot, today, feedbackSignals);
    const candidatesRaw = await this.pattern.buildCandidates(profile, preference);

    const month = Number(input.targetDate.slice(5, 7)) || new Date().getMonth() + 1;
    // 날씨는 있으면 쓰고 없으면 계절로 — 어느 쪽이든 추천은 나온다.
    const weather =
      this.deps.weather &&
      input.lat !== null &&
      input.lat !== undefined &&
      input.lng !== null &&
      input.lng !== undefined
        ? await this.deps.weather(input.lat, input.lng).catch(() => null)
        : null;
    const scored = candidatesRaw
      .map((c) =>
        scoreCandidate(c, {
          profile,
          preference,
          targetSlot: input.targetSlot,
          mealType: effectiveMealType,
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
      mealType: effectiveMealType,
      note: input.note ?? null,
      // 날씨가 바뀌면 근거도 바뀌므로 캐시 키에 넣는다(기온은 5도 단위로 뭉갠다).
      weatherBucket:
        weather?.tempC !== null && weather?.tempC !== undefined
          ? Math.round(weather.tempC / 5)
          : null,
      rain: weather?.rain ?? null,
      candidateNames: scored.slice(0, PROMPT_CANDIDATES).map((c) => c.name),
    });
    if (!input.force) {
      const cached = await this.prisma.mealRecommendation.findFirst({
        where: {
          userId,
          targetDate: input.targetDate,
          targetSlot: input.targetSlot,
          profileHash: hash,
        },
        orderBy: { createdAt: 'desc' },
        include: { events: { orderBy: { createdAt: 'asc' } } },
      });
      if (cached) return { recommendation: toRecommendation(cached), cached: true };
    }

    // 일반/force 모두 cache miss 가 확정된 이 지점에서 먼저 차감한다. 한도 초과면 아래의
    // provider resolve/complete 에 도달하지 않으므로 비싼 호출이 새어 나가지 않는다.
    if (this.deps.consumeQuota && !(await this.deps.consumeQuota(userId))) {
      throw new MealRecommendationError(
        'quota',
        '오늘 추천 한도를 모두 썼습니다. 내일 다시 시도해 주세요.',
      );
    }

    if (scored.length === 0) {
      // 카탈로그가 비었고 기록도 없다 — 추천할 재료가 없다.
      const saved = await this.save(userId, effectiveInput, hash, {
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
      ? await oplog.startRun({
          feature: 'meal-recommendation',
          trigger: 'user',
          meta: { candidateCount: scored.length },
        })
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
        mealType: effectiveMealType,
        weights: preference.weights,
        excludedFoods: preference.excludedFoods,
        dislikedFoods: preference.dislikedFoods,
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
            message:
              items.length > 0 ? `추천 ${items.length}개` : 'LLM 응답에서 유효한 후보를 찾지 못함',
            meta: { model: resolved.model, picked: items.length },
          });
        }
      } catch (e) {
        this.log?.warn({ err: e }, '[meal-recommendation] LLM 호출 실패 — 점수 폴백');
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

    const saved = await this.save(userId, effectiveInput, hash, {
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
        meta: {
          status,
          itemCount: items.length,
          durationMs: Date.now() - started,
          model: model ?? undefined,
        },
      });
    }
    return { recommendation: saved, cached: false };
  }

  async feedback(
    userId: string,
    id: string,
    input: MealRecommendationFeedbackInputType,
  ): Promise<MealRecommendationType> {
    return mealMutationBarrier.runExclusive(userId, () => this.feedbackUnlocked(userId, id, input));
  }

  private async feedbackUnlocked(
    userId: string,
    id: string,
    input: MealRecommendationFeedbackInputType,
  ): Promise<MealRecommendationType> {
    const row = await this.prisma.mealRecommendation.findFirst({
      where: { id, userId },
      include: { events: { orderBy: { createdAt: 'asc' } } },
    });
    if (!row) throw new MealRecommendationError('not_found', '추천을 찾을 수 없습니다.');
    const prev = parseMealRecommendationFeedback(row.feedbackJson);
    if (input.eatenEntryId === null && prev?.eatenEntryId) {
      throw new MealRecommendationError('invalid', '추천과 식단 기록의 연결은 해제할 수 없습니다.');
    }
    if (input.eatenEntryId && prev?.eatenEntryId && input.eatenEntryId !== prev.eatenEntryId) {
      throw new MealRecommendationError('invalid', '이미 다른 식단 기록과 연결된 추천입니다.');
    }

    let pickedName = input.pickedName !== undefined ? input.pickedName : (prev?.pickedName ?? null);
    if (pickedName) {
      pickedName = findMealRecommendationCandidate(row.itemsJson, [pickedName]);
      if (!pickedName) throw new MealRecommendationError('invalid', '추천 후보에 없는 음식입니다.');
    }
    const eatenEntryId =
      input.eatenEntryId !== undefined ? input.eatenEntryId : (prev?.eatenEntryId ?? null);
    if (eatenEntryId) {
      const entry = await this.prisma.mealEntry.findFirst({
        where: { id: eatenEntryId, userId },
        select: {
          originRecommendationId: true,
          items: { where: { isMain: true }, select: { name: true } },
        },
      });
      if (!entry || entry.originRecommendationId !== id) {
        throw new MealRecommendationError(
          'invalid',
          '이 추천에서 만든 본인 식단 기록만 연결할 수 있습니다.',
        );
      }
      const entryCandidate = findMealRecommendationCandidate(
        row.itemsJson,
        entry.items.map((item) => item.name),
      );
      if (
        !entryCandidate ||
        (pickedName && normalizeTerm(pickedName) !== normalizeTerm(entryCandidate))
      ) {
        throw new MealRecommendationError(
          'invalid',
          '선택한 추천 음식과 식단 기록이 일치하지 않습니다.',
        );
      }
      pickedName = entryCandidate;
    }
    const merged: MealRecommendationFeedbackType = {
      pickedName,
      rating: input.rating !== undefined ? input.rating : (prev?.rating ?? null),
      eatenEntryId,
    };
    const candidateItems = parseMealRecommendationItems(row.itemsJson);
    const eventData: Array<
      Parameters<typeof this.prisma.mealRecommendationEvent.create>[0]['data']
    > = [];
    if (input.pickedName !== undefined && input.pickedName !== prev?.pickedName && pickedName) {
      const rank = candidateItems.findIndex(
        (item) => normalizeTerm(item.name) === normalizeTerm(pickedName),
      );
      eventData.push({
        recommendationId: id,
        userId,
        kind: 'candidate_picked',
        candidateName: pickedName,
        candidateFoodId: rank >= 0 ? (candidateItems[rank]?.foodId ?? null) : null,
        candidateRank: rank >= 0 ? rank : null,
        platform: 'server',
        rankingVersion: row.promptVersion,
      });
    }
    if (input.rating !== undefined && input.rating !== prev?.rating && input.rating !== null) {
      eventData.push({
        recommendationId: id,
        userId,
        kind: 'set_rated',
        rating: input.rating,
        platform: 'server',
        rankingVersion: row.promptVersion,
      });
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const recommendation = await tx.mealRecommendation.update({
        where: { id },
        data: { feedbackJson: JSON.stringify(merged) },
        include: { events: { orderBy: { createdAt: 'asc' } } },
      });
      for (const data of eventData) await tx.mealRecommendationEvent.create({ data });
      if (eventData.length === 0) return recommendation;
      return tx.mealRecommendation.findUniqueOrThrow({
        where: { id },
        include: { events: { orderBy: { createdAt: 'asc' } } },
      });
    });
    return toRecommendation(updated);
  }

  async recordEvent(
    userId: string,
    id: string,
    input: MealRecommendationEventInputType,
  ): Promise<MealRecommendationEventType> {
    return mealMutationBarrier.runExclusive(userId, () =>
      this.recordEventUnlocked(userId, id, input),
    );
  }

  private async recordEventUnlocked(
    userId: string,
    id: string,
    input: MealRecommendationEventInputType,
  ): Promise<MealRecommendationEventType> {
    const row = await this.prisma.mealRecommendation.findFirst({ where: { id, userId } });
    if (!row) throw new MealRecommendationError('not_found', '추천을 찾을 수 없습니다.');
    if (input.kind === 'logged') {
      throw new MealRecommendationError(
        'invalid',
        '실제 식단 기록이 저장될 때만 섭취 완료로 기록할 수 있습니다.',
      );
    }

    const candidates = parseMealRecommendationItems(row.itemsJson);
    let candidateName: string | null = null;
    let candidateFoodId: string | null = null;
    let candidateRank: number | null = null;
    if (input.candidateName) {
      candidateName = findMealRecommendationCandidate(row.itemsJson, [input.candidateName]);
      if (!candidateName)
        throw new MealRecommendationError('invalid', '추천 후보에 없는 음식입니다.');
      const canonicalCandidateName = candidateName;
      candidateRank = candidates.findIndex(
        (item) => normalizeTerm(item.name) === normalizeTerm(canonicalCandidateName),
      );
      const candidate = candidateRank >= 0 ? candidates[candidateRank] : null;
      candidateFoodId = candidate?.foodId ?? null;
      if (input.candidateRank != null && input.candidateRank !== candidateRank) {
        throw new MealRecommendationError('invalid', '추천 후보 순위가 일치하지 않습니다.');
      }
      if (input.candidateFoodId != null && input.candidateFoodId !== candidateFoodId) {
        throw new MealRecommendationError('invalid', '추천 후보 음식 id가 일치하지 않습니다.');
      }
    }

    const created = await this.prisma.$transaction(async (tx) => {
      if (input.kind === 'candidate_picked' && candidateName) {
        const previous = parseMealRecommendationFeedback(row.feedbackJson);
        await tx.mealRecommendation.update({
          where: { id },
          data: {
            feedbackJson: JSON.stringify({
              pickedName: candidateName,
              rating: previous?.rating ?? null,
              eatenEntryId: previous?.eatenEntryId ?? null,
            }),
          },
        });
      } else if (input.kind === 'set_rated') {
        const previous = parseMealRecommendationFeedback(row.feedbackJson);
        await tx.mealRecommendation.update({
          where: { id },
          data: {
            feedbackJson: JSON.stringify({
              pickedName: previous?.pickedName ?? null,
              rating: input.rating ?? null,
              eatenEntryId: previous?.eatenEntryId ?? null,
            }),
          },
        });
      }
      return tx.mealRecommendationEvent.create({
        data: {
          recommendationId: id,
          userId,
          kind: input.kind,
          candidateName,
          candidateFoodId,
          candidateRank,
          rating: input.rating ?? null,
          platform: input.platform,
          rankingVersion: row.promptVersion,
        },
      });
    });
    return toRecommendationEvent(created);
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
    // 반응이 없는 캐시 이력만 최근 HISTORY_LIMIT 개로 정리한다. 노출·선택·기록·
    // 평가 등 불변 이벤트가 하나라도 있는 행은 학습·통계 근거이므로 보존한다.
    const old = await this.prisma.mealRecommendation.findMany({
      where: { userId, feedbackJson: null, events: { none: {} } },
      orderBy: { createdAt: 'desc' },
      skip: HISTORY_LIMIT - 1,
      select: { id: true },
    });
    if (old.length > 0) {
      await this.prisma.mealRecommendation.deleteMany({
        where: { id: { in: old.map((o) => o.id) } },
      });
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

// 카드에 보여 줄 주재료 수 — 재료 문자열이 길어(레시피 원문) 앞쪽 몇 개만 쓴다.
const INGREDIENT_SHOW_MAX = 5;

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
  // 주재료는 레시피 출처가 있는 음식만 갖는다 — 화면은 있을 때만 보여 준다.
  ingredients: c.ingredients.slice(0, INGREDIENT_SHOW_MAX),
  allergenWarnings: c.allergenWarnings ?? [],
  allergenEvidence: c.allergenEvidence ?? [],
  allergenAssessment:
    (c.allergenWarnings?.length ?? 0) > 0
      ? 'possible'
      : c.allergenMetadataKnown
        ? 'none_known'
        : 'unknown',
  nutritionBasis: c.nutritionBasis ?? (c.nutritionFrom ? 'donor_estimate' : 'missing'),
  nutritionFrom: c.nutritionFrom ?? null,
});

const profileHash = (input: unknown): string =>
  createHash('sha1').update(JSON.stringify(input)).digest('hex').slice(0, 16);

type RecommendationWithEvents = PrismaMealRecommendation & {
  events?: PrismaMealRecommendationEvent[];
};

const candidateRatings = (events: readonly PrismaMealRecommendationEvent[] | undefined) => {
  const latest = new Map<string, { name: string; rating: -1 | 1 }>();
  for (const event of events ?? []) {
    if (
      event.kind !== 'candidate_rated' ||
      !event.candidateName ||
      (event.rating !== -1 && event.rating !== 1)
    )
      continue;
    latest.set(normalizeTerm(event.candidateName), {
      name: event.candidateName,
      rating: event.rating,
    });
  }
  return [...latest.values()];
};

export const toRecommendation = (row: RecommendationWithEvents): MealRecommendationType => ({
  id: row.id,
  targetDate: row.targetDate,
  targetSlot: row.targetSlot as MealSlotType,
  items: parseMealRecommendationItems(row.itemsJson),
  summary: row.summary,
  status: MealRecommendationStatus.safeParse(row.status).success
    ? (row.status as MealRecommendationStatusType)
    : 'fallback',
  model: row.model,
  promptVersion: row.promptVersion,
  notice: row.notice,
  feedback: parseMealRecommendationFeedback(row.feedbackJson),
  candidateRatings: candidateRatings(row.events),
  createdAt: row.createdAt.toISOString(),
});

export const toRecommendationEvent = (
  row: PrismaMealRecommendationEvent,
): MealRecommendationEventType => ({
  id: row.id,
  recommendationId: row.recommendationId,
  kind: row.kind as MealRecommendationEventType['kind'],
  candidateName: row.candidateName,
  candidateFoodId: row.candidateFoodId,
  candidateRank: row.candidateRank,
  rating: row.rating === -1 || row.rating === 1 ? row.rating : null,
  platform: row.platform as MealRecommendationEventType['platform'],
  rankingVersion: row.rankingVersion,
  createdAt: row.createdAt.toISOString(),
});

export type { MealPreferenceType };
