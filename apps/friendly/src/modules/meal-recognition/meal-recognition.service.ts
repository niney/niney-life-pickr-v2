import type { PrismaClient } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import { z } from 'zod';
import {
  MealPortion,
  type MealSlotType,
  type RecognizeMealResultType,
  type RecognizedDishType,
} from '@repo/api-contract';
import { MEAL_SLOT_LABEL } from '@repo/utils';
import { extractFirstJsonObject } from '../../lib/json.js';
import { adapterCache, type AdapterCache } from '../ai/adapter-cache.js';
import type { AiConfigService } from '../ai/ai.config.service.js';
import type { LLMProvider } from '../ai/adapters/llm-provider.js';
import { FoodService } from '../food/food.service.js';
import type { OperationLogService } from '../logs/operation-log.service.js';
import type { MealPhotoService } from '../meal/meal-photo.service.js';
import {
  MEAL_RECOGNITION_JSON_SCHEMA,
  MEAL_RECOGNITION_SYSTEM_PROMPT,
  MEAL_RECOGNITION_VERSION,
  buildMealRecognitionRepairPrompt,
  buildMealRecognitionUserPrompt,
} from './meal-recognition.prompts.js';

// 사진 → 음식 인식. 정산 영수증 추출과 같은 구조(동기 HTTP + 비전 1콜 + zod 검증)에 식단에서
// 필요한 3가지를 더한다: 사진 여러 장 한 번에, 카탈로그 매칭 부착, 파싱 실패 시 수리 재시도.
//
// 결과는 저장하지 않는다 — 사용자가 편집·확정한 뒤 MealEntry 로만 남는다(원본 후보는
// recognitionJson 에 함께 보존해 나중에 인식 품질을 측정한다).

const VISION_TIMEOUT_MS = 90_000;
const VISION_MAX_TOKENS = 2000;
const VISION_NUM_CTX = 8192;
const VISION_TEMPERATURE = 0;
const MAX_DISHES = 20;
// 이 값 미만이면 "확인이 필요하다"는 경고를 붙인다(사용자에게 후보 탭을 열어 보게 유도).
const LOW_CONFIDENCE = 0.4;
const OPLOG_ERROR_CAP = 300;

export class MealRecognitionError extends Error {
  constructor(
    readonly code: 'no_provider' | 'photo_not_found' | 'llm_failed' | 'parse_failed',
    message: string,
  ) {
    super(message);
    this.name = 'MealRecognitionError';
  }
}

const LlmDish = z.object({
  name: z.string(),
  candidates: z
    .array(z.object({ name: z.string(), confidence: z.number() }))
    .optional()
    .default([]),
  confidence: z.number(),
  isMain: z.boolean(),
  portion: z.string().nullable().optional(),
  isDrink: z.boolean().optional().default(false),
  photoIndex: z.number().int().optional().default(0),
});
const LlmOutput = z.object({
  dishes: z.array(LlmDish).default([]),
  notes: z.string().nullable().optional(),
});

export interface MealRecognitionDeps {
  photos: MealPhotoService;
  food?: FoodService;
  cache?: AdapterCache;
  logger?: FastifyBaseLogger;
  operationLog?: OperationLogService | null;
  // 장소 힌트 조회 — 라우트가 RestaurantService 를 주입한다(모듈 결합 회피).
  placeHint?: (placeId: string) => Promise<{ name: string; menuNames: string[] } | null>;
}

export interface RecognizeInput {
  userId: string;
  photoTokens: string[];
  placeId?: string | null;
  slot?: MealSlotType | null;
}

export class MealRecognitionService {
  private readonly food: FoodService;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly aiConfig: AiConfigService,
    private readonly deps: MealRecognitionDeps,
  ) {
    this.food = deps.food ?? new FoodService(prisma);
  }

  private get log(): FastifyBaseLogger | null {
    return this.deps.logger ?? null;
  }

  private async resolveProvider(): Promise<{ provider: LLMProvider; model: string } | null> {
    const resolved = await this.aiConfig.getResolved('ollama-cloud', 'meal-photo');
    if (!resolved) return null;
    const model = resolved.defaultModel.trim();
    if (!model) return null;
    return { provider: (this.deps.cache ?? adapterCache).get(resolved), model };
  }

  async recognize(input: RecognizeInput): Promise<RecognizeMealResultType> {
    const oplog = this.deps.operationLog ?? null;
    const opRunId = oplog
      ? await oplog.startRun({ feature: 'meal-recognition', trigger: 'user', meta: { photoCount: input.photoTokens.length } })
      : null;
    const step = (
      level: 'debug' | 'info' | 'warn' | 'error',
      stage: string,
      message: string,
      meta?: Record<string, unknown>,
    ): void => {
      if (oplog && opRunId) oplog.log({ runId: opRunId, stage, level, message, meta });
    };
    const started = Date.now();
    let errorCode: string | null = null;

    try {
      const resolved = await this.resolveProvider();
      if (!resolved) {
        errorCode = 'no_provider';
        throw new MealRecognitionError('no_provider', '사진 인식 모델이 설정되지 않았습니다.');
      }

      // 소유자 검증 포함 — 남의 토큰으로는 못 읽는다.
      const buffers = await this.deps.photos.readManyForOwner(input.userId, input.photoTokens);
      const images = buffers.map((b) => b.toString('base64'));

      let hint: { name: string; menuNames: string[] } | null = null;
      if (input.placeId && this.deps.placeHint) {
        hint = await this.deps.placeHint(input.placeId).catch(() => null);
      }
      const prompt = buildMealRecognitionUserPrompt({
        photoCount: images.length,
        restaurantName: hint?.name ?? null,
        menuNames: hint?.menuNames ?? [],
        slotLabel: input.slot ? MEAL_SLOT_LABEL[input.slot] : null,
      });

      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), VISION_TIMEOUT_MS);
      let rawText: string;
      try {
        const res = await resolved.provider.complete({
          prompt,
          systemPrompt: MEAL_RECOGNITION_SYSTEM_PROMPT,
          model: resolved.model,
          images,
          temperature: VISION_TEMPERATURE,
          maxTokens: VISION_MAX_TOKENS,
          numCtx: VISION_NUM_CTX,
          format: MEAL_RECOGNITION_JSON_SCHEMA as unknown as Record<string, unknown>,
          signal: ac.signal,
        });
        rawText = res.text;
      } catch (e) {
        errorCode = 'llm_failed';
        step('error', 'vision', 'LLM 호출 실패', { model: resolved.model });
        throw new MealRecognitionError('llm_failed', e instanceof Error ? e.message : 'LLM 호출 실패');
      } finally {
        clearTimeout(timer);
      }

      let parsed = parseRecognitionOutput(rawText);
      if (!parsed) {
        // Ollama Cloud 는 JSON 스키마를 강제하지 않아 형식이 깨지는 일이 있다 — 1회 수리 요청.
        step('warn', 'parse', 'JSON 파싱 실패 — 수리 재시도');
        const repairAc = new AbortController();
        const repairTimer = setTimeout(() => repairAc.abort(), VISION_TIMEOUT_MS);
        try {
          const repaired = await resolved.provider.complete({
            prompt: buildMealRecognitionRepairPrompt(rawText),
            model: resolved.model,
            temperature: 0,
            maxTokens: VISION_MAX_TOKENS,
            numCtx: VISION_NUM_CTX,
            format: 'json',
            signal: repairAc.signal,
          });
          parsed = parseRecognitionOutput(repaired.text);
        } catch {
          parsed = null;
        } finally {
          clearTimeout(repairTimer);
        }
      }
      if (!parsed) {
        errorCode = 'parse_failed';
        throw new MealRecognitionError('parse_failed', '인식 결과를 읽지 못했습니다. 직접 입력해 주세요.');
      }

      const dishes = await this.attachCatalog(parsed.dishes.slice(0, MAX_DISHES), images.length);
      const warning = buildWarning(dishes, parsed.notes ?? null);

      step('info', 'done', `음식 ${dishes.length}개 인식`, {
        model: resolved.model,
        dishCount: dishes.length,
        matched: dishes.filter((d) => d.foodId !== null).length,
        durationMs: Date.now() - started,
      });

      if (oplog && opRunId) {
        await oplog.finishRun(opRunId, {
          status: 'done',
          meta: { model: resolved.model, dishCount: dishes.length, durationMs: Date.now() - started },
        });
      }

      return {
        dishes,
        model: resolved.model,
        promptVersion: MEAL_RECOGNITION_VERSION,
        warning,
      };
    } catch (e) {
      if (oplog && opRunId) {
        await oplog.finishRun(opRunId, {
          status: 'failed',
          errorCode: errorCode ?? 'unknown',
          errorMessage: (e instanceof Error ? e.message : String(e)).slice(0, OPLOG_ERROR_CAP),
          meta: { durationMs: Date.now() - started },
        });
      }
      throw e;
    }
  }

  // 인식된 이름을 카탈로그에 매칭해 foodId·분류 스냅샷을 붙인다. 못 찾아도 실패가 아니다
  // (사용자가 자유 입력한 음식과 같은 취급 — 통계는 이름 정규화로 묶인다).
  private async attachCatalog(
    dishes: z.infer<typeof LlmOutput>['dishes'],
    photoCount: number,
  ): Promise<RecognizedDishType[]> {
    const out: RecognizedDishType[] = [];
    for (const d of dishes) {
      const name = d.name.trim();
      if (!name) continue;
      const match = await this.food.matchFood(name);
      const portion = MealPortion.safeParse(d.portion);
      out.push({
        name,
        candidates: (d.candidates ?? [])
          .filter((c) => c.name.trim().length > 0)
          .slice(0, 3)
          .map((c) => ({ name: c.name.trim(), confidence: clamp01(c.confidence) })),
        confidence: clamp01(d.confidence),
        isMain: d.isMain,
        portion: portion.success ? portion.data : null,
        isDrink: d.isDrink ?? false,
        photoIndex: Math.min(Math.max(0, d.photoIndex ?? 0), Math.max(0, photoCount - 1)),
        foodId: match?.foodId ?? null,
        matchedName: match?.name ?? null,
        dishType: match?.dishType ?? null,
        mainIngredient: match?.mainIngredient ?? null,
        cuisine: match?.cuisine ?? null,
      });
    }
    return out;
  }
}

const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

export const parseRecognitionOutput = (text: string): z.infer<typeof LlmOutput> | null => {
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

export const buildWarning = (dishes: RecognizedDishType[], notes: string | null): string | null => {
  if (dishes.length === 0) {
    return notes ?? '사진에서 음식을 찾지 못했습니다. 직접 입력해 주세요.';
  }
  const low = dishes.filter((d) => d.confidence < LOW_CONFIDENCE).length;
  if (low > 0) {
    return `${low}개 음식은 확신이 낮습니다. 이름을 확인해 주세요.`;
  }
  return notes ?? null;
};
