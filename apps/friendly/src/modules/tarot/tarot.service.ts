import { createHash, randomBytes } from 'node:crypto';
import type { PrismaClient, TarotReading as TarotReadingRow } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import { LRUCache } from 'lru-cache';
import { z } from 'zod';
import {
  Routes,
  TarotReadingResult,
  type CreateTarotReadingInputType,
  type CreateTarotShareInputType,
  type ListTarotReadingsQueryType,
  type ListTarotReadingsResultType,
  type SharedTarotReadingType,
  type TarotChoicesType,
  type TarotDrawnCardType,
  type TarotMenuVerdictType,
  type TarotReadingResultType,
  type TarotReadingSummaryType,
  type TarotShareResultType,
  type TarotSpreadIdType,
  type TarotTopicType,
} from '@repo/api-contract';
import {
  getTarotCard,
  getTarotSpread,
  selectTarotMenus,
  tarotCardKeywords,
  thinkOptionForModel,
  validateDrawnCards,
  type TarotDrawError,
  type TarotMenuSelection,
  type TarotSpread,
} from '@repo/utils';
import { extractFirstJsonObject } from '../../lib/json.js';
import { normalizeTerm } from '../../lib/text.js';
import { adapterCache, type AdapterCache } from '../ai/adapter-cache.js';
import type { AiConfigService } from '../ai/ai.config.service.js';
import type { LLMProvider } from '../ai/adapters/llm-provider.js';
import type { UsageQuotaService } from '../usage-quota/usage-quota.service.js';
import { buildStaticMenuVerdict, buildStaticReading } from './tarot-static.js';
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
// - 메뉴 타로(menu): 주제는 food 로 고정. 후보 메뉴는 utils(selectTarotMenus)가 카드로 결정적으로
//   고르고, LLM 은 후보별 이유만 쓴다(menuId 검증 — 없는 메뉴 금지). 칼로리는 음식 카탈로그 이름 매칭.
// - 게스트는 저장하지 않는다. 회원은 자동 저장 + 오늘의 카드 하루 1장.
// - 공유: 게스트는 리딩 입력을 다시 보내고 서버가 본문을 (캐시/LLM/정적으로) 확보해 행을 만든다 —
//   클라이언트 텍스트를 게시하지 않기 위해. 회원은 저장된 행에 토큰만 단다.

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
  menu: true,
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
  menu: z
    .object({ picks: z.array(z.object({ menuId: z.string(), reason: z.string().trim().min(1) })) })
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
// 메뉴 타로는 정적 후보(menuBase) 위에 LLM 이유만 덮는다 — 후보에 없는 menuId 는 무시, 빠진 후보는
// 정적 이유 유지. 키워드는 추천 메뉴 이름으로 고정(공유 제목·기록 목록에 메뉴가 보이게).
export const toLlmBody = (
  output: TarotLlmOutput,
  cards: readonly TarotPromptCard[],
  spread: TarotSpread,
  model: string,
  menuBase: TarotMenuVerdictType | null = null,
): TarotReadingBody => {
  const byPos = new Map(output.cards.map((c) => [c.position, c.text]));
  const llmReasons = new Map((output.menu?.picks ?? []).map((p) => [p.menuId, p.reason]));
  const menu: TarotMenuVerdictType | null = menuBase
    ? { ...menuBase, picks: menuBase.picks.map((p) => ({ ...p, reason: llmReasons.get(p.menuId) ?? p.reason })) }
    : null;
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
    keyword: menu ? menu.picks[0]!.name : output.keyword,
    choice: spread.id === 'choice' ? (output.choice ?? null) : null,
    menu,
  };
};

// 메뉴 타로 입력 정규화 — 주제 food 고정, 선택지 없음. 캐시 키·저장 행·응답이 전부 이 값을 쓴다.
export const normalizeTarotInput = (input: CreateTarotReadingInputType): CreateTarotReadingInputType =>
  input.spreadId === 'menu' ? { ...input, topic: 'food', choices: null } : input;

// 검증을 통과한 리딩 입력.
interface PreparedReading {
  spread: TarotSpread;
  choices: TarotChoicesType | null;
  cards: TarotPromptCard[];
  // 메뉴 타로 후보(카드로 결정적). 다른 스프레드는 null.
  menuSelection: TarotMenuSelection | null;
}

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

  async createReading(rawInput: CreateTarotReadingInputType, actor: TarotActor): Promise<TarotReadingResultType> {
    const input = normalizeTarotInput(rawInput);
    const prepared = this.prepare(input, actor);
    const { spread, choices } = prepared;
    const dayKey = this.deps.quota.today();

    // 오늘의 카드 계정 잠금 — 회원은 하루 1장. 이미 뽑았으면 그걸 돌려준다(한도 소비 없음).
    if (spread.id === 'daily' && actor.userId) {
      const existing = await this.prisma.tarotReading.findUnique({
        where: { dailyLockKey: dailyLockKeyOf(actor.userId, dayKey) },
      });
      if (existing) return rowToResult(existing, null);
    }

    const { body, remaining } = await this.resolveBody(input, prepared, actor);
    const createdAt = this.deps.now?.() ?? new Date();
    if (actor.userId) {
      const row = await this.persist({ userId: actor.userId, guestKey: null, spread, input, choices, body, dayKey, createdAt });
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

  // 공유 토큰 발급. 회원은 저장된 행에 토큰을 달고, 게스트는 입력으로 본문을 다시 확보해 행을 만든다.
  async createShare(input: CreateTarotShareInputType, actor: TarotActor): Promise<TarotShareResultType> {
    let row: TarotReadingRow | null = null;
    if (input.readingId) {
      if (!actor.userId) throw new TarotError('not_found', '리딩을 찾을 수 없습니다.');
      row = await this.prisma.tarotReading.findFirst({ where: { id: input.readingId, userId: actor.userId } });
      if (!row) throw new TarotError('not_found', '리딩을 찾을 수 없습니다.');
      if (!row.shareToken) {
        row = await this.prisma.tarotReading.update({
          where: { id: row.id },
          data: { shareToken: await this.uniqueShareToken(), shareQuestion: input.includeQuestion },
        });
      } else if (row.shareQuestion !== input.includeQuestion) {
        row = await this.prisma.tarotReading.update({
          where: { id: row.id },
          data: { shareQuestion: input.includeQuestion },
        });
      }
    } else if (input.reading) {
      const reading = normalizeTarotInput(input.reading);
      const prepared = this.prepare(reading, actor);
      const { body } = await this.resolveBody(reading, prepared, actor);
      row = await this.persist({
        userId: actor.userId,
        guestKey: actor.userId ? null : actor.guestKey,
        spread: prepared.spread,
        input: reading,
        choices: prepared.choices,
        body,
        dayKey: this.deps.quota.today(),
        createdAt: this.deps.now?.() ?? new Date(),
        shareToken: await this.uniqueShareToken(),
        shareQuestion: input.includeQuestion,
        // 공유용 행은 오늘의 카드 잠금에 끼지 않는다(회원의 오늘 카드는 createReading 이 이미 잠갔다).
        skipDailyLock: true,
      });
    }
    if (!row?.shareToken) throw new TarotError('not_found', '공유할 리딩이 없습니다.');
    return { token: row.shareToken, path: Routes.Tarot.sharePage(row.shareToken), includeQuestion: row.shareQuestion };
  }

  async getShared(token: string): Promise<SharedTarotReadingType> {
    const row = await this.prisma.tarotReading.findUnique({ where: { shareToken: token } });
    if (!row) throw new TarotError('not_found', '공유 링크를 찾을 수 없습니다.');
    const result = rowToResult(row, null);
    return {
      spreadId: result.spreadId,
      topic: result.topic,
      question: row.shareQuestion ? result.question : '',
      choices: result.choices,
      source: result.source,
      model: result.model,
      cards: result.cards,
      summary: result.summary,
      advice: result.advice,
      keyword: result.keyword,
      choice: result.choice,
      menu: result.menu,
      createdAt: result.createdAt,
      token,
      includeQuestion: row.shareQuestion,
    };
  }

  // OG 미리보기용 요약 — 없는 토큰이면 null(프리렌더가 일반 OG 로 폴백).
  async getSharePreviewMeta(
    token: string,
  ): Promise<{ spreadName: string; keyword: string; cardNames: string[]; summary: string; updatedAt: string } | null> {
    try {
      const shared = await this.getShared(token);
      return {
        spreadName: getTarotSpread(shared.spreadId)?.nameKo ?? '타로',
        keyword: shared.keyword,
        cardNames: shared.cards.map((c) => `${c.nameKo}${c.reversed ? '(역)' : ''}`),
        summary: shared.summary,
        updatedAt: shared.createdAt,
      };
    } catch (e) {
      if (e instanceof TarotError) return null;
      throw e;
    }
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

  private prepare(input: CreateTarotReadingInputType, actor: TarotActor): PreparedReading {
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
    const menuSelection = spread.id === 'menu' ? selectTarotMenus(input.cards) : null;
    return { spread, choices, cards, menuSelection };
  }

  // 본문 확보 — 캐시 → 한도 → LLM → 정적. remaining 은 게스트 기기 잔여 횟수.
  private async resolveBody(
    input: CreateTarotReadingInputType,
    prepared: PreparedReading,
    actor: TarotActor,
  ): Promise<{ body: TarotReadingBody; remaining: number | null }> {
    const { spread, choices, cards, menuSelection } = prepared;
    const cacheKey = readingCacheKey(spread.id, input.topic, input.question, choices, input.cards);
    let body = this.cache.get(cacheKey) ?? null;
    let remaining: number | null;
    if (body) {
      remaining = await this.deps.quota.remainingForGuest(TAROT_QUOTA_FEATURE, actor);
    } else {
      // 메뉴 후보(정적 이유·칼로리)는 LLM·정적 어느 경로든 바탕이 된다.
      const menuBase = menuSelection
        ? buildStaticMenuVerdict(menuSelection, cards, await this.kcalByMenuId(menuSelection))
        : null;
      const decision = await this.deps.quota.consume(TAROT_QUOTA_FEATURE, actor);
      remaining = decision.remainingToday;
      if (decision.allowed) {
        body = await this.readWithLlm(spread, input.topic, input.question, choices, cards, menuSelection, menuBase);
        if (body) this.cache.set(cacheKey, body);
      } else {
        this.deps.logger?.debug({ reason: decision.reason, guest: !actor.userId }, '[tarot] 한도로 정적 해석');
      }
      if (!body) body = { source: 'static', model: null, ...buildStaticReading(spread, input.topic, cards, choices, menuBase) };
    }
    return { body, remaining };
  }

  // 후보 메뉴 이름 → 음식 카탈로그 1인분 kcal(정확히 같은 정규화 이름만). 없으면 빈 맵 — 표시가 빠질 뿐.
  private async kcalByMenuId(selection: TarotMenuSelection): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    const normById = selection.picks.map((p) => [p.id, normalizeTerm(p.name)] as const);
    try {
      const rows = await this.prisma.foodItem.findMany({
        where: { nameNorm: { in: normById.map(([, n]) => n) }, kcal: { not: null } },
        select: { nameNorm: true, kcal: true },
      });
      const byNorm = new Map(rows.map((r) => [r.nameNorm, r.kcal!]));
      for (const [id, norm] of normById) {
        const kcal = byNorm.get(norm);
        if (kcal !== undefined) out.set(id, Math.round(kcal));
      }
    } catch (e) {
      this.deps.logger?.warn({ err: e instanceof Error ? e.message : String(e) }, '[tarot] 메뉴 칼로리 조회 실패');
    }
    return out;
  }

  private async readWithLlm(
    spread: TarotSpread,
    topic: TarotTopicType,
    question: string,
    choices: TarotChoicesType | null,
    cards: TarotPromptCard[],
    menuSelection: TarotMenuSelection | null,
    menuBase: TarotMenuVerdictType | null,
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
        menu: menuSelection,
        signal: ac.signal,
      });
      if (!output) {
        this.deps.logger?.warn({ model, calls }, '[tarot] LLM 응답 파싱 실패 — 정적 해석');
        return null;
      }
      return toLlmBody(output, cards, spread, model, menuBase);
    } catch (e) {
      this.deps.logger?.warn({ err: e instanceof Error ? e.message : String(e), model }, '[tarot] LLM 호출 실패 — 정적 해석');
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  private async persist(args: {
    userId: string | null;
    guestKey: string | null;
    spread: TarotSpread;
    input: CreateTarotReadingInputType;
    choices: TarotChoicesType | null;
    body: TarotReadingBody;
    dayKey: string;
    createdAt: Date;
    shareToken?: string;
    shareQuestion?: boolean;
    skipDailyLock?: boolean;
  }): Promise<TarotReadingRow> {
    const { userId, spread, input, choices, body, dayKey, createdAt } = args;
    const dailyLockKey = spread.id === 'daily' && userId && !args.skipDailyLock ? dailyLockKeyOf(userId, dayKey) : null;
    try {
      return await this.prisma.tarotReading.create({
        data: {
          userId,
          guestKey: args.guestKey,
          shareToken: args.shareToken ?? null,
          shareQuestion: args.shareQuestion ?? false,
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

  // 추측 불가능한 7바이트 base64url 토큰 = 10자(정산 공유와 동일). 충돌 시 재생성.
  private async uniqueShareToken(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = randomBytes(7).toString('base64url');
      const clash = await this.prisma.tarotReading.findUnique({ where: { shareToken: candidate }, select: { id: true } });
      if (!clash) return candidate;
    }
    throw new TarotError('not_found', '공유 토큰 생성에 실패했습니다. 다시 시도해 주세요.');
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
    menu: raw.menu ?? null,
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
