import { createHash } from 'node:crypto';
import type { PrismaClient, TarotReading as TarotReadingRow } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import { LRUCache } from 'lru-cache';
import { z } from 'zod';
import {
  TarotReadingResult,
  type CreateTarotReadingInputType,
  type ListTarotReadingsQueryType,
  type ListTarotReadingsResultType,
  type TarotChoicesType,
  type TarotDrawnCardType,
  type TarotReadingResultType,
  type TarotReadingSummaryType,
  type TarotSpreadIdType,
  type TarotTopicType,
} from '@repo/api-contract';
import {
  getTarotCard,
  getTarotSpread,
  tarotCardKeywords,
  thinkOptionForModel,
  validateDrawnCards,
  type TarotDrawError,
  type TarotSpread,
} from '@repo/utils';
import { extractFirstJsonObject } from '../../lib/json.js';
import { adapterCache, type AdapterCache } from '../ai/adapter-cache.js';
import type { AiConfigService } from '../ai/ai.config.service.js';
import type { LLMProvider } from '../ai/adapters/llm-provider.js';
import type { UsageQuotaService } from '../usage-quota/usage-quota.service.js';
import { buildStaticReading } from './tarot-static.js';
import {
  TAROT_JSON_SCHEMA,
  TAROT_PROMPT_VERSION,
  TAROT_REPAIR_SUFFIX,
  TAROT_SYSTEM_PROMPT,
  buildTarotUserPrompt,
  type TarotPromptArgs,
  type TarotPromptCard,
} from './tarot.prompts.js';

// 타로 리딩 — 검증 → (회원 오늘의 카드 잠금) → 캐시 → 한도 → LLM(수리 1회) → 정적 폴백 → (회원 저장).
//
// - 질문 텍스트는 로그에 남기지 않는다(개인적일 수 있음). 텔레메트리는 토큰 수만 집계한다.
// - 캐시 키는 (프롬프트 버전, 스프레드, 주제, 정규화 질문, 선택지, 카드) — 같은 조합은 LLM 을 다시
//   부르지 않고 한도도 소비하지 않는다. 오늘의 카드(1장)는 156 조합뿐이라 사실상 전부 히트.
// - 게스트는 저장하지 않는다(공유 시 저장은 3차). 회원은 자동 저장 + 오늘의 카드 하루 1장.

export type TarotErrorCode =
  | 'spread_unavailable'
  | 'member_only'
  | 'invalid_cards'
  | 'choices_required'
  | 'not_found';

export class TarotError extends Error {
  constructor(
    public readonly code: TarotErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'TarotError';
  }
}

export interface TarotActor {
  userId: string | null;
  guestKey: string | null;
  ip: string;
}

export interface TarotServiceDeps {
  quota: UsageQuotaService;
  logger?: FastifyBaseLogger;
  cache?: AdapterCache;
  now?: () => Date;
  llmTimeoutMs?: number;
}

export const TAROT_QUOTA_FEATURE = 'tarot-reading' as const;

const LLM_TEMPERATURE = 0.8;
const LLM_NUM_CTX = 8192;
const LLM_TIMEOUT_MS = 20_000;
const CACHE_MAX = 2000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// 카드 수에 비례한 출력 상한 — 3장 ≈ 1,500, 켈틱 10장 ≈ 3,600.
const maxTokensFor = (cardCount: number): number => 600 + 300 * cardCount;

const DRAW_ERROR_MESSAGE: Record<TarotDrawError, string> = {
  count_mismatch: '스프레드 장수와 뽑은 카드 수가 다릅니다.',
  unknown_card: '알 수 없는 카드가 있습니다.',
  duplicate_card: '같은 카드를 두 번 뽑을 수 없습니다.',
  position_mismatch: '카드 자리 순서가 스프레드와 다릅니다.',
};

// 저장·캐시되는 해석 본문 — 계약 TarotReadingResult 의 해석 부분만.
const ReadingBody = TarotReadingResult.pick({
  source: true,
  model: true,
  cards: true,
  summary: true,
  advice: true,
  keyword: true,
  choice: true,
});
export type TarotReadingBody = z.infer<typeof ReadingBody>;

// ── LLM 출력 파싱 ───────────────────────────────────────────────────────────

const LlmOutput = z.object({
  cards: z.array(z.object({ position: z.string(), text: z.string().trim().min(1) })).min(1),
  summary: z.string().trim().min(1),
  advice: z.string().trim().min(1),
  keyword: z.string().trim().min(1).max(40),
  choice: z
    .object({
      recommended: z.enum(['A', 'B', 'either']),
      confidence: z.enum(['low', 'mid', 'high']),
      reason: z.string().trim().min(1),
    })
    .nullable()
    .optional(),
});
export type TarotLlmOutput = z.infer<typeof LlmOutput>;

// 잡음 섞인 응답에서 JSON 을 건져 검증한다. 자리(position)가 하나라도 빠지면 null — 수리 재시도.
export const parseTarotOutput = (text: string, positions: readonly string[]): TarotLlmOutput | null => {
  const candidate = extractFirstJsonObject(text) ?? text.trim();
  let json: unknown;
  try {
    json = JSON.parse(candidate);
  } catch {
    return null;
  }
  const parsed = LlmOutput.safeParse(json);
  if (!parsed.success) return null;
  const have = new Set(parsed.data.cards.map((c) => c.position));
  if (positions.some((p) => !have.has(p))) return null;
  return parsed.data;
};

export interface TarotLlmCall {
  output: TarotLlmOutput | null;
  calls: number;
  lastText: string;
}

// LLM 호출 + JSON 수리 재시도 1회. 프로브 스크립트(probe:tarot-reading)와 공유.
export const requestTarotLlm = async (
  provider: LLMProvider,
  model: string,
  args: TarotPromptArgs & { signal?: AbortSignal },
): Promise<TarotLlmCall> => {
  const prompt = buildTarotUserPrompt(args);
  const positions = args.cards.map((c) => c.drawn.position);
  let lastText = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await provider.complete({
      prompt: attempt === 0 ? prompt : `${prompt}\n\n${TAROT_REPAIR_SUFFIX}`,
      systemPrompt: TAROT_SYSTEM_PROMPT,
      model,
      temperature: LLM_TEMPERATURE,
      maxTokens: maxTokensFor(args.cards.length),
      numCtx: LLM_NUM_CTX,
      format: TAROT_JSON_SCHEMA as unknown as Record<string, unknown>,
      think: thinkOptionForModel(model),
      signal: args.signal,
    });
    lastText = res.text;
    const output = parseTarotOutput(res.text, positions);
    if (output) return { output, calls: attempt + 1, lastText };
  }
  return { output: null, calls: 2, lastText };
};

// LLM 출력 → 해석 본문. 카드 메타(이름·키워드)는 서버 데이터로 채운다(모델이 지어내지 못하게).
export const toLlmBody = (
  output: TarotLlmOutput,
  cards: readonly TarotPromptCard[],
  spread: TarotSpread,
  model: string,
): TarotReadingBody => {
  const byPos = new Map(output.cards.map((c) => [c.position, c.text]));
  return {
    source: 'llm',
    model,
    cards: cards.map((c) => ({
      cardId: c.card.id,
      position: c.drawn.position,
      positionLabel: c.positionLabel,
      reversed: c.drawn.reversed,
      nameKo: c.card.nameKo,
      nameEn: c.card.nameEn,
      keywords: [...tarotCardKeywords(c.card, c.drawn.reversed)],
      text: byPos.get(c.drawn.position)!,
    })),
    summary: output.summary,
    advice: output.advice,
    keyword: output.keyword,
    choice: spread.id === 'choice' ? (output.choice ?? null) : null,
  };
};

// ── 서비스 ──────────────────────────────────────────────────────────────────

export class TarotService {
  private readonly cache = new LRUCache<string, TarotReadingBody>({ max: CACHE_MAX, ttl: CACHE_TTL_MS });

  constructor(
    private readonly prisma: PrismaClient,
    private readonly aiConfig: AiConfigService,
    private readonly deps: TarotServiceDeps,
  ) {}

  get cacheSize(): number {
    return this.cache.size;
  }

  async createReading(input: CreateTarotReadingInputType, actor: TarotActor): Promise<TarotReadingResultType> {
    const spread = getTarotSpread(input.spreadId);
    if (!spread || !spread.available) {
      throw new TarotError('spread_unavailable', '지금은 제공하지 않는 스프레드입니다.');
    }
    if (spread.memberOnly && !actor.userId) {
      throw new TarotError('member_only', '로그인한 회원만 쓸 수 있는 스프레드입니다.');
    }
    const drawError = validateDrawnCards(spread, input.cards);
    if (drawError) throw new TarotError('invalid_cards', DRAW_ERROR_MESSAGE[drawError]);
    const choices = spread.id === 'choice' ? input.choices : null;
    if (spread.id === 'choice' && !choices) {
      throw new TarotError('choices_required', '선택 타로는 A·B 두 선택지가 필요합니다.');
    }
    const cards: TarotPromptCard[] = input.cards.map((drawn, i) => ({
      drawn,
      card: getTarotCard(drawn.cardId)!,
      positionLabel: spread.positions[i]!.label,
      positionHint: spread.positions[i]!.hint,
    }));
    const dayKey = this.deps.quota.today();

    // 오늘의 카드 계정 잠금 — 회원은 하루 1장. 이미 뽑았으면 그걸 돌려준다(한도 소비 없음).
    if (spread.id === 'daily' && actor.userId) {
      const existing = await this.prisma.tarotReading.findUnique({
        where: { dailyLockKey: dailyLockKeyOf(actor.userId, dayKey) },
      });
      if (existing) return rowToResult(existing, null);
    }

    const cacheKey = readingCacheKey(spread.id, input.topic, input.question, choices, input.cards);
    let body = this.cache.get(cacheKey) ?? null;
    let remaining: number | null = null;
    if (body) {
      remaining = await this.deps.quota.remainingForGuest(TAROT_QUOTA_FEATURE, actor);
    } else {
      const decision = await this.deps.quota.consume(TAROT_QUOTA_FEATURE, actor);
      remaining = decision.remainingToday;
      if (decision.allowed) {
        body = await this.readWithLlm(spread, input.topic, input.question, choices, cards);
        if (body) this.cache.set(cacheKey, body);
      } else {
        this.deps.logger?.debug({ reason: decision.reason, guest: !actor.userId }, '[tarot] 한도로 정적 해석');
      }
    }
    if (!body) {
      body = { source: 'static', model: null, ...buildStaticReading(spread, input.topic, cards, choices) };
    }

    const createdAt = this.deps.now?.() ?? new Date();
    if (actor.userId) {
      const row = await this.persist(actor.userId, spread, input, choices, body, dayKey, createdAt);
      return rowToResult(row, null);
    }
    return {
      readingId: null,
      spreadId: spread.id,
      topic: input.topic,
      question: input.question,
      choices,
      ...body,
      createdAt: createdAt.toISOString(),
      quota: { remainingToday: remaining },
    };
  }

  // 회원 기록 — 최신순 커서(id) 페이지네이션.
  async listMine(userId: string, query: ListTarotReadingsQueryType): Promise<ListTarotReadingsResultType> {
    const rows = await this.prisma.tarotReading.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, query.limit);
    return {
      items: page.map(rowToSummary),
      nextCursor: rows.length > query.limit ? page[page.length - 1]!.id : null,
    };
  }

  async getMine(userId: string, id: string): Promise<TarotReadingResultType> {
    const row = await this.prisma.tarotReading.findFirst({ where: { id, userId } });
    if (!row) throw new TarotError('not_found', '리딩을 찾을 수 없습니다.');
    return rowToResult(row, null);
  }

  async deleteMine(userId: string, id: string): Promise<void> {
    const res = await this.prisma.tarotReading.deleteMany({ where: { id, userId } });
    if (res.count === 0) throw new TarotError('not_found', '리딩을 찾을 수 없습니다.');
  }

  // ── 내부 ────────────────────────────────────────────────────────────────

  private async readWithLlm(
    spread: TarotSpread,
    topic: TarotTopicType,
    question: string,
    choices: TarotChoicesType | null,
    cards: TarotPromptCard[],
  ): Promise<TarotReadingBody | null> {
    const resolved = await this.aiConfig.getResolved('ollama-cloud', 'tarot');
    const model = resolved?.defaultModel.trim() ?? '';
    if (!resolved || !model) {
      this.deps.logger?.warn('[tarot] chat provider/모델 미설정 — 정적 해석');
      return null;
    }
    const provider = (this.deps.cache ?? adapterCache).get(resolved);
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.deps.llmTimeoutMs ?? LLM_TIMEOUT_MS);
    try {
      const { output, calls } = await requestTarotLlm(provider, model, {
        spread,
        topic,
        question,
        choices,
        cards,
        signal: ac.signal,
      });
      if (!output) {
        this.deps.logger?.warn({ model, calls }, '[tarot] LLM 응답 파싱 실패 — 정적 해석');
        return null;
      }
      return toLlmBody(output, cards, spread, model);
    } catch (e) {
      this.deps.logger?.warn({ err: e instanceof Error ? e.message : String(e), model }, '[tarot] LLM 호출 실패 — 정적 해석');
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  private async persist(
    userId: string,
    spread: TarotSpread,
    input: CreateTarotReadingInputType,
    choices: TarotChoicesType | null,
    body: TarotReadingBody,
    dayKey: string,
    createdAt: Date,
  ): Promise<TarotReadingRow> {
    const dailyLockKey = spread.id === 'daily' ? dailyLockKeyOf(userId, dayKey) : null;
    try {
      return await this.prisma.tarotReading.create({
        data: {
          userId,
          spreadId: spread.id,
          topic: input.topic,
          question: input.question,
          choicesJson: choices ? JSON.stringify(choices) : null,
          cardsJson: JSON.stringify(input.cards),
          resultJson: JSON.stringify(body),
          source: body.source,
          model: body.model,
          promptVersion: TAROT_PROMPT_VERSION,
          dayKey,
          dailyLockKey,
          createdAt,
        },
      });
    } catch (e) {
      // 오늘의 카드 동시 요청 — 먼저 저장된 행이 이긴다.
      if (dailyLockKey && isUniqueViolation(e)) {
        const existing = await this.prisma.tarotReading.findUnique({ where: { dailyLockKey } });
        if (existing) return existing;
      }
      throw e;
    }
  }
}

// ── 헬퍼 ────────────────────────────────────────────────────────────────────

const dailyLockKeyOf = (userId: string, dayKey: string): string => `${userId}:${dayKey}`;

const isUniqueViolation = (e: unknown): boolean =>
  typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002';

const normalizeQuestion = (q: string): string => q.trim().replace(/\s+/g, ' ').toLowerCase();

export const readingCacheKey = (
  spreadId: TarotSpreadIdType,
  topic: TarotTopicType,
  question: string,
  choices: TarotChoicesType | null,
  cards: readonly TarotDrawnCardType[],
): string =>
  createHash('sha1')
    .update(
      JSON.stringify([
        TAROT_PROMPT_VERSION,
        spreadId,
        topic,
        normalizeQuestion(question),
        choices ? [choices.a.trim(), choices.b.trim()] : null,
        cards.map((c) => [c.cardId, c.position, c.reversed]),
      ]),
    )
    .digest('hex');

const parseBody = (row: TarotReadingRow): TarotReadingBody => {
  const parsed = ReadingBody.safeParse(JSON.parse(row.resultJson));
  if (parsed.success) return parsed.data;
  // 저장 당시 계약과 어긋난 행(버전 차이) — 빈 해석보다는 원본을 최대한 살린다.
  const raw = JSON.parse(row.resultJson) as Partial<TarotReadingBody>;
  return {
    source: row.source === 'llm' ? 'llm' : 'static',
    model: row.model,
    cards: raw.cards ?? [],
    summary: raw.summary ?? '',
    advice: raw.advice ?? '',
    keyword: raw.keyword ?? '',
    choice: raw.choice ?? null,
  };
};

const rowToResult = (row: TarotReadingRow, remainingToday: number | null): TarotReadingResultType => {
  const body = parseBody(row);
  return {
    readingId: row.id,
    spreadId: row.spreadId as TarotSpreadIdType,
    topic: row.topic as TarotTopicType,
    question: row.question,
    choices: row.choicesJson ? (JSON.parse(row.choicesJson) as TarotChoicesType) : null,
    ...body,
    createdAt: row.createdAt.toISOString(),
    quota: { remainingToday },
  };
};

const rowToSummary = (row: TarotReadingRow): TarotReadingSummaryType => {
  const body = parseBody(row);
  const cards = JSON.parse(row.cardsJson) as TarotDrawnCardType[];
  return {
    id: row.id,
    spreadId: row.spreadId as TarotSpreadIdType,
    topic: row.topic as TarotTopicType,
    question: row.question,
    keyword: body.keyword,
    source: body.source,
    cards: cards.map((c) => ({ cardId: c.cardId, reversed: c.reversed })),
    createdAt: row.createdAt.toISOString(),
  };
};
