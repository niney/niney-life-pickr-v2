import { createHash, randomBytes } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import { LRUCache } from 'lru-cache';
import { z } from 'zod';
import {
  SAJU_SECTION_IDS,
  SAJU_THEME_IDS,
  SajuAdviceSection,
  SajuCareerSection,
  SajuCycleSection,
  SajuDailyResult,
  SajuLoveSection,
  SajuPersonalitySection,
  SajuWealthSection,
  SajuYearSection,
  type CreateSajuThemesInputType,
  type SajuAskInputType,
  type SajuAskResultType,
  type SajuBirthInputType,
  type SajuChartType,
  type SajuDailyInputType,
  type SajuDailyResultType,
  type SajuDatePickInputType,
  type SajuDatePickResultType,
  type SajuDayType,
  type SajuFoodInputType,
  type SajuFoodResultType,
  type SajuJobPollResultType,
  type SajuMatchInputType,
  type SajuMatchResultType,
  type SajuReadingResultType,
  type SajuSectionIdType,
  type SajuSectionsType,
  type SajuSourceType,
  type SajuThemeIdType,
  type SajuThemesJobPollResultType,
  type SajuThemesResultType,
  type SajuThemesType,
} from '@repo/api-contract';
import {
  chartSignature,
  computeSajuChart,
  dailyFortune,
  kstDayNumberOfDate,
  matchCharts,
  pickDates,
  SAJU_ASK_TOPIC_META,
  sajuAskBlockedReason,
  sajuAskOf,
  sajuDateFromDayNumber,
  sajuDayNumber,
  SajuInputError,
  selectSajuFood,
  thinkOptionFor,
  thinkOptionForModel,
  thinkTokenMult,
  type SajuChart,
  type ThinkOption,
  type SajuDayScore,
  type SajuDatePickResult,
  type SajuFoodSelection,
} from '@repo/utils';
import { extractFirstJsonObject } from '../../lib/json.js';
import { normalizeTerm } from '../../lib/text.js';
import { adapterCache, type AdapterCache } from '../ai/adapter-cache.js';
import type { AiConfigService } from '../ai/ai.config.service.js';
import type { LLMProvider } from '../ai/adapters/llm-provider.js';
import type { UsageQuotaService } from '../usage-quota/usage-quota.service.js';
import { SajuJobRegistry, sourceOf } from './saju-jobs.js';
import {
  buildStaticDaily,
  buildStaticDateReasons,
  buildStaticFoodReasons,
  buildStaticAsk,
  buildStaticMatch,
  buildStaticSections,
  buildStaticThemes,
  luckyOf,
} from './saju-static.js';
import {
  SAJU_ASK_JSON_SCHEMA,
  SAJU_DAILY_JSON_SCHEMA,
  SAJU_DATE_PICK_JSON_SCHEMA,
  SAJU_FOOD_JSON_SCHEMA,
  SAJU_MATCH_JSON_SCHEMA,
  SAJU_PROMPT_VERSION,
  SAJU_REPAIR_SUFFIX,
  SAJU_SECTION_JSON_SCHEMA,
  SAJU_SECTION_MAX_TOKENS,
  SAJU_SYSTEM_PROMPT,
  SAJU_THEME_JSON_SCHEMA,
  SAJU_THEME_MAX_TOKENS,
  buildSajuAskPrompt,
  buildSajuDailyPrompt,
  buildSajuDatePickPrompt,
  buildSajuFoodPrompt,
  buildSajuMatchPrompt,
  buildSajuSectionPrompt,
  buildSajuThemePrompt,
} from './saju.prompts.js';

// 사주 서비스 — 입력 → 원국(utils 재계산) → 캐시 → 한도 → LLM → 정적 폴백 → (회원 저장).
//
// - 전체 풀이(full)는 섹션 4개를 병렬로 부르고 즉시 응답한다(정적 본문 + jobId). 섹션이 도착하면 job 에
//   확정되고 클라이언트가 long-poll 로 받는다. 4개가 다 끝나면 회원 행을 저장하고 readingId 를 job 에 붙인다.
// - 캐시 키는 (프롬프트 버전, 8글자, 성별, 대운 방향·시작, 기준 연도) — 같은 사람은 연도가 바뀔 때까지 히트.
//   섹션별로 따로 캐시해 일부만 실패해도 나머지는 재사용한다.
// - 오늘·궁합·택일·음식은 단일 호출. 한도는 전부 feature 'saju-reading' 1건씩.
// - 테마(인연·재물·직업, 8차)는 전체 풀이와 별도 job(3개 병렬, 한도 1건). 테마별 캐시. 회원이면 readingId 행의
//   resultJson 에 themes 를 병합해 기록 상세에서도 보인다.
// - 생년월일시는 로그에 남기지 않는다.

export type SajuErrorCode = 'invalid_input' | 'not_found' | 'job_gone';

export class SajuError extends Error {
  constructor(
    public readonly code: SajuErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SajuError';
  }
}

export interface SajuActor {
  userId: string | null;
  guestKey: string | null;
  ip: string;
}

export interface SajuServiceDeps {
  quota: UsageQuotaService;
  logger?: FastifyBaseLogger;
  cache?: AdapterCache;
  jobs?: SajuJobRegistry;
  themeJobs?: SajuJobRegistry<SajuThemesType>;
  now?: () => Date;
  llmTimeoutMs?: number;
}

export const SAJU_QUOTA_FEATURE = 'saju-reading' as const;

const LLM_TEMPERATURE = 0.8;
const LLM_NUM_CTX = 8192;
const LLM_TIMEOUT_MS = 25_000;
// 어드민이 추론(thinking)을 켜면 사고 토큰이 num_predict 를 먹는다 — 레벨별 배수는 utils thinkTokenMult(kimi-k3 실측:
// max 는 ×3 에서 2/12 잘림, ×5 에서 0/12). 지연도 같이 늘므로(max p50 12→29s, max 58s) 타임아웃을 배수만큼 키운다(상한 120s).
const THINK_TIMEOUT_MAX_MS = 120_000;
const CACHE_MAX = 4000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// ── LLM 출력 스키마 ─────────────────────────────────────────────────────────

const SectionOutput: Record<SajuSectionIdType, z.ZodTypeAny> = {
  personality: SajuPersonalitySection.omit({ status: true, source: true, model: true }).extend({
    strengths: z.array(z.string().trim().min(1)).min(1).max(5),
    cautions: z.array(z.string().trim().min(1)).min(1).max(4),
  }),
  year: SajuYearSection.omit({ status: true, source: true, model: true }).extend({
    months: z.array(z.object({ month: z.coerce.number().int().min(1).max(12), note: z.string().trim().min(1) })).max(6),
  }),
  cycle: SajuCycleSection.omit({ status: true, source: true, model: true }),
  advice: SajuAdviceSection.omit({ status: true, source: true, model: true }),
};
const ThemeOutput: Record<SajuThemeIdType, z.ZodTypeAny> = {
  love: SajuLoveSection.omit({ status: true, source: true, model: true }).extend({ tips: z.array(z.string().trim().min(1)).min(1).max(5) }),
  wealth: SajuWealthSection.omit({ status: true, source: true, model: true }).extend({ tips: z.array(z.string().trim().min(1)).min(1).max(5) }),
  career: SajuCareerSection.omit({ status: true, source: true, model: true }).extend({
    jobs: z.array(z.string().trim().min(1)).min(1).max(6),
    tips: z.array(z.string().trim().min(1)).min(1).max(5),
  }),
};
const DailyOutput = z.object({ body: z.string().trim().min(1), advice: z.string().trim().min(1) });
const AskOutput = z.object({
  answer: z.string().trim().min(1),
  conditions: z.array(z.string().trim().min(1)).min(1).max(4),
  timingNote: z.string().trim().min(1),
});
const MatchOutput = z.object({
  summary: z.string().trim().min(1),
  strengths: z.array(z.string().trim().min(1)).min(1).max(5),
  cautions: z.array(z.string().trim().min(1)).min(1).max(4),
  advice: z.string().trim().min(1),
});
const DateReasonsOutput = z.object({ reasons: z.array(z.object({ date: z.string(), reason: z.string().trim().min(1) })) });
const FoodReasonsOutput = z.object({ picks: z.array(z.object({ menuId: z.string(), reason: z.string().trim().min(1) })) });

// zod 버전과 무관한 구조적 스키마 타입 — safeParse 만 쓴다.
export interface JsonSchemaLike<T> {
  safeParse: (v: unknown) => { success: true; data: T } | { success: false; error?: unknown };
}

export const parseSajuJson = <T>(text: string, schema: JsonSchemaLike<T>): T | null => {
  const candidate = extractFirstJsonObject(text) ?? text.trim();
  let json: unknown;
  try {
    json = JSON.parse(candidate);
  } catch {
    return null;
  }
  const parsed = schema.safeParse(json);
  return parsed.success ? parsed.data : null;
};

export interface SajuLlmRequest<T> {
  prompt: string;
  schema: JsonSchemaLike<T>;
  jsonSchema: Record<string, unknown>;
  maxTokens: number;
  signal?: AbortSignal;
  /** 추론(thinking) 강제 — 없으면 모델 규칙(thinkOptionForModel). 프로브가 비교용으로 쓴다. */
  think?: boolean | 'low' | 'medium' | 'high' | 'max';
}

// LLM 호출 + JSON 수리 재시도 1회. 프로브 스크립트(probe:saju-reading)와 공유.
export const requestSajuLlm = async <T>(
  provider: LLMProvider,
  model: string,
  req: SajuLlmRequest<T>,
): Promise<{ output: T | null; calls: number; lastText: string; doneReason: string | null; completionTokens: number | null }> => {
  let lastText = '';
  let doneReason: string | null = null;
  let completionTokens: number | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await provider.complete({
      prompt: attempt === 0 ? req.prompt : `${req.prompt}\n\n${SAJU_REPAIR_SUFFIX}`,
      systemPrompt: SAJU_SYSTEM_PROMPT,
      model,
      temperature: LLM_TEMPERATURE,
      maxTokens: req.maxTokens,
      numCtx: LLM_NUM_CTX,
      format: req.jsonSchema,
      think: req.think ?? thinkOptionForModel(model),
      signal: req.signal,
    });
    lastText = res.text;
    doneReason = res.doneReason ?? null;
    completionTokens = res.completionTokens;
    const output = parseSajuJson(res.text, req.schema);
    if (output) return { output, calls: attempt + 1, lastText, doneReason, completionTokens };
  }
  return { output: null, calls: 2, lastText, doneReason, completionTokens };
};

// ── 캐시 키 ─────────────────────────────────────────────────────────────────

const chartCacheBase = (chart: SajuChart): string =>
  JSON.stringify([
    SAJU_PROMPT_VERSION,
    chartSignature(chart),
    chart.input.gender,
    chart.luck.forward,
    chart.luck.startAgeYears,
    chart.asOf.year,
    chart.favorable.primary,
  ]);
const sha = (s: string): string => createHash('sha1').update(s).digest('hex');
export const sectionCacheKey = (chart: SajuChart, section: SajuSectionIdType): string => sha(`section:${section}:${chartCacheBase(chart)}`);
export const themeCacheKey = (chart: SajuChart, theme: SajuThemeIdType): string => sha(`theme:${theme}:${chartCacheBase(chart)}`);
export const dailyCacheKey = (chart: SajuChart, dayKey: string): string =>
  sha(`daily:${SAJU_PROMPT_VERSION}:${chart.pillars.day.ko}:${chart.favorable.primary}:${dayKey}`);
const matchCacheKey = (a: SajuChart, b: SajuChart, labels: { a: string; b: string }): string =>
  sha(`match:${chartCacheBase(a)}|${chartCacheBase(b)}|${labels.a}|${labels.b}`);
const datePickCacheKey = (chart: SajuChart, purpose: string, from: number, days: number): string =>
  sha(`date:${SAJU_PROMPT_VERSION}:${chartSignature(chart)}:${chart.favorable.primary}:${purpose}:${from}:${days}`);
const askCacheKey = (chart: SajuChart, input: SajuAskInputType, partnerSig: string | null): string =>
  sha(`ask:${SAJU_PROMPT_VERSION}:${chartCacheBase(chart)}:${input.topic}:${JSON.stringify(input.when)}:${input.question.trim().replace(/\s+/g, ' ').toLowerCase()}:${partnerSig ?? '-'}`);
const foodCacheKey = (chart: SajuChart, dayKey: string | null): string =>
  sha(`food:${SAJU_PROMPT_VERSION}:${chartSignature(chart)}:${chart.favorable.primary}:${dayKey ?? '-'}`);

type SectionValue = SajuSectionsType[SajuSectionIdType];
type ThemeValue = SajuThemesType[SajuThemeIdType];
/** 해석된 LLM — 어댑터·모델·추론 옵션(tokenMult>1 이면 토큰·타임아웃을 키운다). */
interface ResolvedLlm {
  provider: LLMProvider;
  model: string;
  think: ThinkOption;
  tokenMult: number;
}

// ── 서비스 ──────────────────────────────────────────────────────────────────

export class SajuService {
  private readonly cache = new LRUCache<string, object>({ max: CACHE_MAX, ttl: CACHE_TTL_MS });
  readonly jobs: SajuJobRegistry;
  readonly themeJobs: SajuJobRegistry<SajuThemesType>;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly aiConfig: AiConfigService,
    private readonly deps: SajuServiceDeps,
  ) {
    this.jobs = deps.jobs ?? new SajuJobRegistry();
    this.themeJobs = deps.themeJobs ?? new SajuJobRegistry<SajuThemesType>();
  }

  get cacheSize(): number {
    return this.cache.size;
  }

  /** 입력 → 원국. 입력 오류는 SajuError('invalid_input'). */
  chartOf(birth: SajuBirthInputType): SajuChart {
    try {
      return computeSajuChart(birth, { asOf: this.now() });
    } catch (e) {
      if (e instanceof SajuInputError) throw new SajuError('invalid_input', e.message);
      throw e;
    }
  }

  // ── 전체 풀이 ─────────────────────────────────────────────────────────

  async createReading(input: { birth: SajuBirthInputType }, actor: SajuActor): Promise<SajuReadingResultType> {
    const chart = this.chartOf(input.birth);
    const createdAt = this.now();
    const statics = buildStaticSections(chart);
    const cached: Partial<Record<SajuSectionIdType, SectionValue>> = {};
    for (const s of SAJU_SECTION_IDS) {
      const hit = this.cache.get(sectionCacheKey(chart, s)) as SectionValue | undefined;
      if (hit) cached[s] = hit;
    }
    const missing = SAJU_SECTION_IDS.filter((s) => !cached[s]);
    const quotaOf = async (): Promise<number | null> => this.deps.quota.remainingForGuest(SAJU_QUOTA_FEATURE, actor);

    // 전부 캐시 — LLM·한도 없이 즉시.
    if (missing.length === 0) {
      const sections = { ...statics, ...cached } as SajuSectionsType;
      const readingId = actor.userId ? (await this.persistFull(actor.userId, input.birth, chart, sections, createdAt)).id : null;
      return this.fullResult(readingId, null, chart, sections, createdAt, await quotaOf());
    }

    const decision = await this.deps.quota.consume(SAJU_QUOTA_FEATURE, actor);
    const provider = decision.allowed ? await this.resolveProvider() : null;
    if (!provider) {
      if (!decision.allowed) this.deps.logger?.debug({ reason: decision.reason, guest: !actor.userId }, '[saju] 한도로 정적 풀이');
      const sections = { ...statics, ...cached } as SajuSectionsType;
      const readingId = actor.userId ? (await this.persistFull(actor.userId, input.birth, chart, sections, createdAt)).id : null;
      return this.fullResult(readingId, null, chart, sections, createdAt, decision.remainingToday);
    }

    // 섹션 병렬 — 정적 본문(pending)으로 job 을 만들고 즉시 응답.
    const jobId = randomBytes(9).toString('base64url');
    const initial = { ...statics, ...cached } as SajuSectionsType;
    for (const s of missing) initial[s] = { ...initial[s], status: 'pending' } as never;
    this.jobs.create(jobId, initial, missing, { expectReading: !!actor.userId });
    void this.runSections(jobId, chart, missing, provider, actor.userId, input.birth, createdAt);
    return this.fullResult(null, jobId, chart, initial, createdAt, decision.remainingToday);
  }

  async pollJob(jobId: string, after: number, waitMs: number): Promise<SajuJobPollResultType> {
    const snap = await this.jobs.wait(jobId, after, waitMs);
    if (!snap) throw new SajuError('job_gone', '풀이 작업을 찾을 수 없어요. 다시 시도해 주세요.');
    return snap;
  }

  private async runSections(
    jobId: string,
    chart: SajuChart,
    sections: readonly SajuSectionIdType[],
    provider: ResolvedLlm,
    userId: string | null,
    birth: SajuBirthInputType,
    createdAt: Date,
  ): Promise<void> {
    await Promise.all(
      sections.map(async (section) => {
        const value = await this.readSection(chart, section, provider);
        if (value) this.cache.set(sectionCacheKey(chart, section), value);
        const job = this.jobs.get(jobId);
        const fallback = job ? ({ ...job.sections[section], status: 'static', source: 'static', model: null } as SectionValue) : null;
        this.jobs.settle(jobId, section, (value ?? fallback ?? buildStaticSections(chart)[section]) as never);
      }),
    );
    if (userId) {
      const job = this.jobs.get(jobId);
      if (!job) return;
      try {
        const row = await this.persistFull(userId, birth, chart, job.sections, createdAt);
        this.jobs.attachReading(jobId, row.id);
      } catch (e) {
        this.deps.logger?.warn({ err: e instanceof Error ? e.message : String(e) }, '[saju] 회원 저장 실패');
        this.jobs.abandonReading(jobId);
      }
    }
  }

  private async readSection(
    chart: SajuChart,
    section: SajuSectionIdType,
    p: ResolvedLlm,
  ): Promise<SectionValue | null> {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.timeoutFor(p));
    try {
      const { output, calls } = await requestSajuLlm(p.provider, p.model, {
        prompt: buildSajuSectionPrompt(chart, section),
        schema: SectionOutput[section] as JsonSchemaLike<Record<string, unknown>>,
        jsonSchema: SAJU_SECTION_JSON_SCHEMA[section],
        maxTokens: this.maxTokensFor(p, SAJU_SECTION_MAX_TOKENS[section]),
        think: p.think,
        signal: ac.signal,
      });
      if (!output) {
        this.deps.logger?.warn({ model: p.model, section, calls }, '[saju] LLM 응답 파싱 실패 — 정적 섹션');
        return null;
      }
      const base = { status: 'ready' as const, source: 'llm' as const, model: p.model };
      // 구조값(lucky)은 정적이 진실 — LLM 이 옮겨 쓴 값이 어긋나면 정적으로 덮는다.
      if (section === 'advice') return { ...base, ...(output as object), lucky: luckyOf(chart) } as SectionValue;
      return { ...base, ...(output as object) } as SectionValue;
    } catch (e) {
      this.deps.logger?.warn({ err: e instanceof Error ? e.message : String(e), model: p.model, section }, '[saju] LLM 호출 실패 — 정적 섹션');
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  private fullResult(
    readingId: string | null,
    jobId: string | null,
    chart: SajuChart,
    sections: SajuSectionsType,
    createdAt: Date,
    remaining: number | null,
  ): SajuReadingResultType {
    const source = sourceOf(sections);
    const model = Object.values(sections).find((s) => s.model)?.model ?? null;
    return { readingId, jobId, chart: toChartDto(chart), sections, themes: this.themesCached(chart), source, model, createdAt: createdAt.toISOString(), quota: { remainingToday: remaining } };
  }

  private async persistFull(userId: string, birth: SajuBirthInputType, chart: SajuChart, sections: SajuSectionsType, createdAt: Date) {
    const source = sourceOf(sections);
    return this.prisma.sajuReading.create({
      data: {
        userId,
        kind: 'full',
        inputJson: JSON.stringify(birth),
        chartJson: JSON.stringify(chart),
        resultJson: JSON.stringify(sections),
        source,
        model: Object.values(sections).find((s) => s.model)?.model ?? null,
        promptVersion: SAJU_PROMPT_VERSION,
        dayKey: this.deps.quota.today(),
        createdAt,
      },
    });
  }

  // ── 테마(8차) — 인연·재물·직업 ────────────────────────────────────────

  async createThemes(input: CreateSajuThemesInputType, actor: SajuActor): Promise<SajuThemesResultType> {
    const chart = this.chartOf(input.birth);
    const createdAt = this.now();
    const statics = buildStaticThemes(chart);
    const cached: Partial<Record<SajuThemeIdType, ThemeValue>> = {};
    for (const t of SAJU_THEME_IDS) {
      const hit = this.cache.get(themeCacheKey(chart, t)) as ThemeValue | undefined;
      if (hit) cached[t] = hit;
    }
    const missing = SAJU_THEME_IDS.filter((t) => !cached[t]);
    const persist = actor.userId && input.readingId ? { userId: actor.userId, readingId: input.readingId } : null;

    if (missing.length === 0) {
      const themes = { ...statics, ...cached } as SajuThemesType;
      const saved = persist ? await this.persistThemes(persist.userId, persist.readingId, chart, themes) : null;
      return this.themesResult(saved, null, themes, createdAt, await this.deps.quota.remainingForGuest(SAJU_QUOTA_FEATURE, actor));
    }

    const decision = await this.deps.quota.consume(SAJU_QUOTA_FEATURE, actor);
    const provider = decision.allowed ? await this.resolveProvider() : null;
    if (!provider) {
      if (!decision.allowed) this.deps.logger?.debug({ reason: decision.reason, guest: !actor.userId }, '[saju] 한도로 정적 테마');
      const themes = { ...statics, ...cached } as SajuThemesType;
      const saved = persist ? await this.persistThemes(persist.userId, persist.readingId, chart, themes) : null;
      return this.themesResult(saved, null, themes, createdAt, decision.remainingToday);
    }

    const jobId = randomBytes(9).toString('base64url');
    const initial = { ...statics, ...cached } as SajuThemesType;
    for (const t of missing) initial[t] = { ...initial[t], status: 'pending' } as never;
    this.themeJobs.create(jobId, initial, missing, { expectReading: !!persist });
    void this.runThemes(jobId, chart, missing, provider, persist);
    return this.themesResult(null, jobId, initial, createdAt, decision.remainingToday);
  }

  async pollThemeJob(jobId: string, after: number, waitMs: number): Promise<SajuThemesJobPollResultType> {
    const snap = await this.themeJobs.wait(jobId, after, waitMs);
    if (!snap) throw new SajuError('job_gone', '테마 풀이 작업을 찾을 수 없어요. 다시 시도해 주세요.');
    return { jobId: snap.jobId, version: snap.version, themes: snap.sections, done: snap.done, readingId: snap.readingId, source: snap.source };
  }

  private async runThemes(
    jobId: string,
    chart: SajuChart,
    themes: readonly SajuThemeIdType[],
    provider: ResolvedLlm,
    persist: { userId: string; readingId: string } | null,
  ): Promise<void> {
    await Promise.all(
      themes.map(async (theme) => {
        const value = await this.readTheme(chart, theme, provider);
        if (value) this.cache.set(themeCacheKey(chart, theme), value);
        const job = this.themeJobs.get(jobId);
        const fallback = job ? ({ ...job.sections[theme], status: 'static', source: 'static', model: null } as ThemeValue) : null;
        this.themeJobs.settle(jobId, theme, (value ?? fallback ?? buildStaticThemes(chart)[theme]) as never);
      }),
    );
    if (persist) {
      const job = this.themeJobs.get(jobId);
      if (!job) return;
      const saved = await this.persistThemes(persist.userId, persist.readingId, chart, job.sections);
      if (saved) this.themeJobs.attachReading(jobId, saved);
      else this.themeJobs.abandonReading(jobId);
    }
  }

  private async readTheme(chart: SajuChart, theme: SajuThemeIdType, p: ResolvedLlm): Promise<ThemeValue | null> {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.timeoutFor(p));
    try {
      const { output, calls } = await requestSajuLlm(p.provider, p.model, {
        prompt: buildSajuThemePrompt(chart, theme),
        schema: ThemeOutput[theme] as JsonSchemaLike<Record<string, unknown>>,
        jsonSchema: SAJU_THEME_JSON_SCHEMA[theme],
        maxTokens: this.maxTokensFor(p, SAJU_THEME_MAX_TOKENS[theme]),
        think: p.think,
        signal: ac.signal,
      });
      if (!output) {
        this.deps.logger?.warn({ model: p.model, theme, calls }, '[saju] 테마 LLM 응답 파싱 실패 — 정적');
        return null;
      }
      return { status: 'ready' as const, source: 'llm' as const, model: p.model, ...(output as object) } as ThemeValue;
    } catch (e) {
      this.deps.logger?.warn({ err: e instanceof Error ? e.message : String(e), model: p.model, theme }, '[saju] 테마 LLM 호출 실패 — 정적');
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  private themesResult(readingId: string | null, jobId: string | null, themes: SajuThemesType, createdAt: Date, remaining: number | null): SajuThemesResultType {
    const source = sourceOf(themes);
    const model = Object.values(themes).find((s) => s.model)?.model ?? null;
    return { readingId, jobId, themes, source, model, createdAt: createdAt.toISOString(), quota: { remainingToday: remaining } };
  }

  /** 회원 전체 풀이 행(readingId)에 themes 를 병합 — 같은 사주의 행일 때만. 성공하면 행 id, 아니면 null. */
  private async persistThemes(userId: string, readingId: string, chart: SajuChart, themes: SajuThemesType): Promise<string | null> {
    try {
      const row = await this.prisma.sajuReading.findFirst({ where: { id: readingId, userId, kind: 'full' } });
      if (!row) return null;
      const stored = JSON.parse(row.chartJson) as SajuChart;
      if (chartSignature(stored) !== chartSignature(chart) || stored.input.gender !== chart.input.gender) return null;
      const result = JSON.parse(row.resultJson) as Record<string, unknown>;
      await this.prisma.sajuReading.update({ where: { id: row.id }, data: { resultJson: JSON.stringify({ ...result, themes }) } });
      return row.id;
    } catch (e) {
      this.deps.logger?.warn({ err: e instanceof Error ? e.message : String(e) }, '[saju] 테마 저장 실패');
      return null;
    }
  }

  /** 테마 3개가 전부 캐시에 있을 때만(전체 풀이 응답에 얹는다 — 재방문 시 탭이 즉시 찬다). */
  themesCached(chart: SajuChart): SajuThemesType | null {
    const out: Partial<Record<SajuThemeIdType, ThemeValue>> = {};
    for (const t of SAJU_THEME_IDS) {
      const hit = this.cache.get(themeCacheKey(chart, t)) as ThemeValue | undefined;
      if (!hit) return null;
      out[t] = hit;
    }
    return out as SajuThemesType;
  }

  /** 공유·기록용 — 캐시된 테마, 아니면 정적. LLM 을 새로 부르지 않는다. */
  themesForShare(chart: SajuChart): SajuThemesType {
    const statics = buildStaticThemes(chart);
    const out = { ...statics } as SajuThemesType;
    for (const t of SAJU_THEME_IDS) {
      const hit = this.cache.get(themeCacheKey(chart, t)) as ThemeValue | undefined;
      if (hit) out[t] = hit as never;
    }
    return out;
  }

  // ── 사주에 묻기(9차) ──────────────────────────────────────────────────

  async ask(input: SajuAskInputType, actor: SajuActor): Promise<SajuAskResultType> {
    const chart = this.chartOf(input.birth);
    const facts = sajuAskOf(chart, { topic: input.topic, when: input.when });
    const meta = SAJU_ASK_TOPIC_META[input.topic];
    // 상대(결혼·고백) — 궁합 점수만 근거에 더한다. 서버에 남기지 않는다.
    let match: SajuAskResultType['match'] = null;
    let partnerSig: string | null = null;
    if (input.partner) {
      const b = this.chartOf(input.partner);
      const m = matchCharts(chart, b);
      match = { score: m.score, gradeKo: m.gradeKo, label: input.partnerLabel?.trim() || '상대' };
      partnerSig = `${chartSignature(b)}|${b.input.gender}`;
    }
    const base = {
      topic: input.topic,
      topicKo: facts.topicKo,
      when: input.when,
      whenKo: facts.whenKo,
      question: input.question.trim(),
      verdict: facts.verdict,
      verdictKo: facts.verdictKo,
      window: facts.window,
      alternatives: facts.alternatives,
      basis: facts.basis,
      themeSummary: facts.themeSummary,
      luckNote: facts.luckNote,
      match,
      tarotTopic: meta.tarotTopic,
    };
    // 답하지 않는 주제 — LLM·한도·저장 없이 정적 안내.
    const blocked = sajuAskBlockedReason(input.question);
    if (blocked) {
      return {
        ...base,
        blocked,
        answer: `${blocked} 주제는 사주로 답하지 않아요. 몸·법·돈의 확률은 전문가와 상의하는 게 맞아요. 대신 "${facts.topicKo}"의 시기와 태도는 아래 근거로 볼 수 있어요.`,
        conditions: ['전문가 상담이 먼저', '사주는 시기와 마음가짐만 참고'],
        timingNote: facts.alternatives.length ? `시기만 보면 ${facts.alternatives.map((a) => a.label).join(' · ')}이 더 좋아요.` : '',
        source: 'static',
        model: null,
        readingId: null,
        quota: { remainingToday: await this.deps.quota.remainingForGuest(SAJU_QUOTA_FEATURE, actor) },
      };
    }
    const key = askCacheKey(chart, input, partnerSig);
    type Text = { answer: string; conditions: string[]; timingNote: string; model: string | null };
    const cached = this.cache.get(key) as Text | undefined;
    let text: (Text & { source: SajuSourceType }) | null = cached ? { ...cached, source: 'llm' } : null;
    let remaining: number | null;
    if (text) remaining = await this.deps.quota.remainingForGuest(SAJU_QUOTA_FEATURE, actor);
    else {
      const decision = await this.deps.quota.consume(SAJU_QUOTA_FEATURE, actor);
      remaining = decision.remainingToday;
      const p = decision.allowed ? await this.resolveProvider() : null;
      if (p) {
        const out = await this.callJson(p, buildSajuAskPrompt(chart, facts, input.question, match), AskOutput, SAJU_ASK_JSON_SCHEMA, 700, 'ask');
        if (out) {
          text = { ...out, model: p.model, source: 'llm' };
          this.cache.set(key, { ...out, model: p.model });
        }
      }
    }
    if (!text) text = { ...buildStaticAsk(facts, match), model: null, source: 'static' };
    const result: SajuAskResultType = { ...base, blocked: null, answer: text.answer, conditions: text.conditions, timingNote: text.timingNote, source: text.source, model: text.model, readingId: null, quota: { remainingToday: remaining } };
    if (actor.userId) {
      try {
        const { quota: _q, readingId: _r, ...stored } = result;
        void _q;
        void _r;
        const row = await this.prisma.sajuReading.create({
          data: {
            userId: actor.userId,
            kind: 'question',
            inputJson: JSON.stringify({ birth: input.birth, topic: input.topic, when: input.when, question: input.question }),
            chartJson: JSON.stringify(chart),
            resultJson: JSON.stringify(stored),
            source: result.source,
            model: result.model,
            promptVersion: SAJU_PROMPT_VERSION,
            dayKey: this.deps.quota.today(),
            createdAt: this.now(),
          },
        });
        result.readingId = row.id;
      } catch (e) {
        this.deps.logger?.warn({ err: e instanceof Error ? e.message : String(e) }, '[saju] 질문 저장 실패');
      }
    }
    return result;
  }

  // ── 오늘의 운세 ───────────────────────────────────────────────────────

  async daily(input: SajuDailyInputType, actor: SajuActor): Promise<SajuDailyResultType> {
    const chart = this.chartOf(input.birth);
    const now = this.now();
    let date = now;
    if (input.date) {
      const [y, m, d] = input.date.split('-').map(Number) as [number, number, number];
      const target = sajuDayNumber(y, m, d);
      const todayNo = kstDayNumberOfDate(now);
      if (Math.abs(target - todayNo) > 7) throw new SajuError('invalid_input', '오늘 앞뒤 7일까지만 볼 수 있어요.');
      date = new Date(Date.UTC(y, m - 1, d, 3, 0)); // KST 정오
    }
    const fortune = dailyFortune(chart, date);
    const dayKey = `${fortune.day.date.year}-${String(fortune.day.date.month).padStart(2, '0')}-${String(fortune.day.date.day).padStart(2, '0')}`;
    // 회원 하루 1회 잠금 — 같은 사주(8글자·성별)의 오늘 운세는 저장된 행을 돌려준다(서버 재시작·캐시 만료와 무관, LLM 재호출 없음).
    // 오늘이 아닌 날짜(앞뒤 7일 조회)는 잠그지 않는다.
    const lockKey = actor.userId && dayKey === this.deps.quota.today() ? dailyLockKeyOf(actor.userId, chart, dayKey) : null;
    if (lockKey) {
      const row = await this.prisma.sajuReading.findUnique({ where: { dailyLockKey: lockKey } });
      if (row) {
        const parsed = SajuDailyResult.safeParse(JSON.parse(row.resultJson));
        if (parsed.success) return { ...parsed.data, quota: { remainingToday: null } };
      }
    }
    const key = dailyCacheKey(chart, dayKey);
    const cached = this.cache.get(key) as { body: string; advice: string; model: string } | undefined;
    let text: { body: string; advice: string; model: string | null; source: SajuSourceType } | null = cached ? { ...cached, source: 'llm' } : null;
    let remaining: number | null;
    if (text) remaining = await this.deps.quota.remainingForGuest(SAJU_QUOTA_FEATURE, actor);
    else {
      const decision = await this.deps.quota.consume(SAJU_QUOTA_FEATURE, actor);
      remaining = decision.remainingToday;
      const p = decision.allowed ? await this.resolveProvider() : null;
      if (p) {
        const out = await this.callJson(p, buildSajuDailyPrompt(chart, fortune), DailyOutput, SAJU_DAILY_JSON_SCHEMA, 400, 'daily');
        if (out) {
          text = { ...out, model: p.model, source: 'llm' };
          this.cache.set(key, { ...out, model: p.model });
        }
      }
    }
    if (!text) text = { ...buildStaticDaily(chart, fortune), model: null, source: 'static' };
    const result: SajuDailyResultType = {
      dayKey,
      day: dayToContract(fortune.day),
      dayMaster: chart.dayMaster,
      headline: fortune.headline,
      body: text.body,
      advice: text.advice,
      lucky: luckyOf(chart),
      source: text.source,
      model: text.model,
      quota: { remainingToday: remaining },
    };
    if (lockKey && actor.userId) {
      try {
        await this.prisma.sajuReading.create({
          data: {
            userId: actor.userId,
            kind: 'daily',
            inputJson: JSON.stringify(input.birth),
            chartJson: JSON.stringify(chart),
            resultJson: JSON.stringify(result),
            source: result.source,
            model: result.model,
            promptVersion: SAJU_PROMPT_VERSION,
            dayKey,
            dailyLockKey: lockKey,
            createdAt: now,
          },
        });
      } catch (e) {
        // 동시 요청 — 먼저 저장된 행이 이긴다. 그 외 오류는 응답에 영향 없이 기록만.
        if (!isUniqueViolation(e)) this.deps.logger?.warn({ err: e instanceof Error ? e.message : String(e) }, '[saju] 오늘의 운세 저장 실패');
      }
    }
    return result;
  }

  // ── 궁합 ──────────────────────────────────────────────────────────────

  async match(input: SajuMatchInputType, actor: SajuActor): Promise<SajuMatchResultType> {
    const a = this.chartOf(input.a);
    const b = this.chartOf(input.b);
    const labels = { a: input.labels.a || '나', b: input.labels.b || '상대' };
    const m = matchCharts(a, b);
    const key = matchCacheKey(a, b, labels);
    type Text = { summary: string; strengths: string[]; cautions: string[]; advice: string; model: string | null };
    const cached = this.cache.get(key) as Text | undefined;
    let text: (Text & { source: SajuSourceType }) | null = cached ? { ...cached, source: 'llm' } : null;
    let remaining: number | null;
    if (text) remaining = await this.deps.quota.remainingForGuest(SAJU_QUOTA_FEATURE, actor);
    else {
      const decision = await this.deps.quota.consume(SAJU_QUOTA_FEATURE, actor);
      remaining = decision.remainingToday;
      const p = decision.allowed ? await this.resolveProvider() : null;
      if (p) {
        const out = await this.callJson(p, buildSajuMatchPrompt(a, b, m, labels), MatchOutput, SAJU_MATCH_JSON_SCHEMA, 900, 'match');
        if (out) {
          text = { ...out, model: p.model, source: 'llm' };
          this.cache.set(key, { ...out, model: p.model });
        }
      }
    }
    if (!text) text = { ...buildStaticMatch(m, labels), model: null, source: 'static' };
    const brief = (c: SajuChart, label: string) => ({
      label,
      dayMaster: c.dayMaster,
      zodiac: { ...c.zodiac, hidden: [...c.zodiac.hidden] },
      signature: chartSignature(c),
    });
    return {
      score: m.score,
      grade: m.grade,
      gradeKo: m.gradeKo,
      breakdown: m.breakdown.map((x) => ({ ...x })),
      relations: m.relations.map((r) => ({ ...r, pillars: [...r.pillars], chars: [...r.chars] })),
      mutual: m.mutual,
      a: brief(a, labels.a),
      b: brief(b, labels.b),
      summary: text.summary,
      strengths: text.strengths,
      cautions: text.cautions,
      advice: text.advice,
      source: text.source,
      model: text.model,
      quota: { remainingToday: remaining },
    };
  }

  // ── 택일 ──────────────────────────────────────────────────────────────

  async datePick(input: SajuDatePickInputType, actor: SajuActor): Promise<SajuDatePickResultType> {
    const chart = this.chartOf(input.birth);
    const todayNo = kstDayNumberOfDate(this.now());
    let from = todayNo;
    if (input.from) {
      const [y, m, d] = input.from.split('-').map(Number) as [number, number, number];
      from = Math.max(todayNo, sajuDayNumber(y, m, d));
      if (from - todayNo > 365) throw new SajuError('invalid_input', '1년 이내의 날짜만 볼 수 있어요.');
    }
    const result = pickDates(chart, from, input.days, input.purpose);
    const key = datePickCacheKey(chart, input.purpose, from, input.days);
    type Text = { reasons: Map<number, string>; model: string | null };
    const cached = this.cache.get(key) as { reasons: [number, string][]; model: string } | undefined;
    let text: (Text & { source: SajuSourceType }) | null = cached ? { reasons: new Map(cached.reasons), model: cached.model, source: 'llm' } : null;
    let remaining: number | null;
    if (text) remaining = await this.deps.quota.remainingForGuest(SAJU_QUOTA_FEATURE, actor);
    else {
      const decision = await this.deps.quota.consume(SAJU_QUOTA_FEATURE, actor);
      remaining = decision.remainingToday;
      const p = decision.allowed ? await this.resolveProvider() : null;
      if (p) {
        const out = await this.callJson(p, buildSajuDatePickPrompt(chart, result, input.purpose), DateReasonsOutput, SAJU_DATE_PICK_JSON_SCHEMA, 600, 'date-pick');
        if (out) {
          const byDate = new Map(out.reasons.map((r) => [r.date, r.reason]));
          const reasons = new Map<number, string>();
          for (const d of result.top) {
            const r = byDate.get(dateKeyOf(d));
            if (r) reasons.set(d.dayNumber, r);
          }
          if (reasons.size > 0) {
            text = { reasons, model: p.model, source: 'llm' };
            this.cache.set(key, { reasons: [...reasons], model: p.model });
          }
        }
      }
    }
    const statics = buildStaticDateReasons(result, input.purpose);
    if (!text) text = { reasons: statics, model: null, source: 'static' };
    return {
      purpose: input.purpose,
      from: dateKeyOfDayNumber(from),
      days: result.days.map((d) => ({ ...dayToContract(d), purposeScore: d.purposeScore, purposeStars: d.purposeStars })),
      top: result.top.map((d) => ({
        ...dayToContract(d),
        purposeScore: d.purposeScore,
        purposeStars: d.purposeStars,
        reason: text.reasons.get(d.dayNumber) ?? statics.get(d.dayNumber) ?? '',
      })),
      source: text.source,
      model: text.model,
      quota: { remainingToday: remaining },
    };
  }

  // ── 오행 음식 ─────────────────────────────────────────────────────────

  async food(input: SajuFoodInputType, actor: SajuActor): Promise<SajuFoodResultType> {
    const chart = this.chartOf(input.birth);
    const now = this.now();
    const dayKey = input.today ? this.deps.quota.today() : null;
    const dayElement = input.today ? dailyFortune(chart, now).day.element : null;
    const selection = selectSajuFood(chart, { dayElement, seedSalt: dayKey ?? undefined });
    const key = foodCacheKey(chart, dayKey);
    const cached = this.cache.get(key) as { reasons: [string, string][]; model: string } | undefined;
    let text: { reasons: Map<string, string>; model: string | null; source: SajuSourceType } | null = cached
      ? { reasons: new Map(cached.reasons), model: cached.model, source: 'llm' }
      : null;
    let remaining: number | null;
    if (text) remaining = await this.deps.quota.remainingForGuest(SAJU_QUOTA_FEATURE, actor);
    else {
      const decision = await this.deps.quota.consume(SAJU_QUOTA_FEATURE, actor);
      remaining = decision.remainingToday;
      const p = decision.allowed ? await this.resolveProvider() : null;
      if (p) {
        const out = await this.callJson(p, buildSajuFoodPrompt(chart, selection), FoodReasonsOutput, SAJU_FOOD_JSON_SCHEMA, 500, 'food');
        if (out) {
          const valid = new Set(selection.picks.map((x) => x.item.id));
          const reasons = new Map(out.picks.filter((x) => valid.has(x.menuId)).map((x) => [x.menuId, x.reason] as [string, string]));
          if (reasons.size > 0) {
            text = { reasons, model: p.model, source: 'llm' };
            this.cache.set(key, { reasons: [...reasons], model: p.model });
          }
        }
      }
    }
    const statics = buildStaticFoodReasons(selection);
    if (!text) text = { reasons: statics, model: null, source: 'static' };
    const kcal = await this.kcalByMenuId(selection);
    return {
      picks: selection.picks.map((p) => ({
        menuId: p.item.id,
        name: p.item.name,
        cuisine: p.item.cuisine,
        dishType: p.item.dishType,
        kcal: kcal.get(p.item.id) ?? null,
        elements: [...p.elements],
        reason: text.reasons.get(p.item.id) ?? statics.get(p.item.id) ?? '',
      })),
      primary: selection.primary,
      secondary: selection.secondary,
      avoid: [...selection.avoid],
      dayElement: selection.dayElement,
      profile: selection.profile,
      avoidText: selection.avoidText,
      source: text.source,
      model: text.model,
      quota: { remainingToday: remaining },
    };
  }

  /** 공유·기록용 — 캐시된 섹션(전부 있을 때만 LLM 본문), 아니면 정적. LLM 을 새로 부르지 않는다. */
  sectionsForShare(chart: SajuChart): SajuSectionsType {
    const statics = buildStaticSections(chart);
    const out = { ...statics } as SajuSectionsType;
    for (const id of SAJU_SECTION_IDS) {
      const hit = this.cache.get(sectionCacheKey(chart, id)) as SectionValue | undefined;
      if (hit) out[id] = hit as never;
    }
    return out;
  }

  // ── 내부 ──────────────────────────────────────────────────────────────

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  private async resolveProvider(): Promise<ResolvedLlm | null> {
    const resolved = await this.aiConfig.getResolved('ollama-cloud', 'saju');
    const model = resolved?.defaultModel.trim() ?? '';
    if (!resolved || !model) {
      this.deps.logger?.warn('[saju] provider/모델 미설정 — 정적 풀이');
      return null;
    }
    // 어드민 "추론" 설정 — kimi 계열에만 반영, 그 외 모델은 규칙(thinkOptionForModel).
    const think = thinkOptionFor(model, resolved.thinking);
    return { provider: (this.deps.cache ?? adapterCache).get(resolved), model, think, tokenMult: thinkTokenMult(think) };
  }

  private timeoutFor(p: ResolvedLlm): number {
    return this.deps.llmTimeoutMs ?? Math.min(THINK_TIMEOUT_MAX_MS, Math.round(LLM_TIMEOUT_MS * p.tokenMult));
  }
  private maxTokensFor(p: ResolvedLlm, base: number): number {
    return Math.round(base * p.tokenMult);
  }

  private async callJson<T>(
    p: ResolvedLlm,
    prompt: string,
    schema: JsonSchemaLike<T>,
    jsonSchema: Record<string, unknown>,
    maxTokens: number,
    tag: string,
  ): Promise<T | null> {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.timeoutFor(p));
    try {
      const { output, calls } = await requestSajuLlm(p.provider, p.model, { prompt, schema, jsonSchema, maxTokens: this.maxTokensFor(p, maxTokens), think: p.think, signal: ac.signal });
      if (!output) this.deps.logger?.warn({ model: p.model, tag, calls }, '[saju] LLM 응답 파싱 실패 — 정적');
      return output;
    } catch (e) {
      this.deps.logger?.warn({ err: e instanceof Error ? e.message : String(e), model: p.model, tag }, '[saju] LLM 호출 실패 — 정적');
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  // 후보 메뉴 이름 → 음식 카탈로그 1인분 kcal(타로 메뉴와 동일 규칙).
  private async kcalByMenuId(selection: SajuFoodSelection): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    const normById = selection.picks.map((p) => [p.item.id, normalizeTerm(p.item.name)] as const);
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
      this.deps.logger?.warn({ err: e instanceof Error ? e.message : String(e) }, '[saju] 메뉴 칼로리 조회 실패');
    }
    return out;
  }
}

// ── 헬퍼 ────────────────────────────────────────────────────────────────────

// utils 원국(readonly 배열) → 계약 DTO. 구조는 같고 readonly 만 다르다(friendly saju.test 가 zod 로 검증).
export const toChartDto = (chart: SajuChart): SajuChartType => chart as unknown as SajuChartType;

// 오늘의 운세 잠금 키 — "userId:<8글자+성별 해시>:yyyy-mm-dd". 프로필 id 대신 사주 자체로 잠가 게스트 입력·프로필 어느 경로든 같다.
export const dailyLockKeyOf = (userId: string, chart: SajuChart, dayKey: string): string =>
  `${userId}:${sha(`${chartSignature(chart)}|${chart.input.gender}`).slice(0, 16)}:${dayKey}`;

const isUniqueViolation = (e: unknown): boolean => typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002';

const dateKeyOf = (d: SajuDayScore): string =>
  `${d.date.year}-${String(d.date.month).padStart(2, '0')}-${String(d.date.day).padStart(2, '0')}`;
const dateKeyOfDayNumber = (n: number): string => {
  const d = sajuDateFromDayNumber(n);
  return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
};

export const dayToContract = (d: SajuDayScore): SajuDayType => ({
  date: dateKeyOf(d),
  lunar: d.lunar,
  weekday: d.weekday,
  ko: d.ko,
  hanja: d.hanja,
  element: d.element,
  stemTenGod: d.stemTenGod,
  twelveStage: d.twelveStage,
  score: d.score,
  stars: d.stars,
  tags: [...d.tags],
});

export type { SajuDatePickResult };
