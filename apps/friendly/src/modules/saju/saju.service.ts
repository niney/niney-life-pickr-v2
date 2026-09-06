import { createHash, randomBytes } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import { LRUCache } from 'lru-cache';
import { z } from 'zod';
import {
  SAJU_SECTION_IDS,
  SajuAdviceSection,
  SajuCycleSection,
  SajuPersonalitySection,
  SajuYearSection,
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
} from '@repo/api-contract';
import {
  chartSignature,
  computeSajuChart,
  dailyFortune,
  kstDayNumberOfDate,
  matchCharts,
  pickDates,
  sajuDateFromDayNumber,
  sajuDayNumber,
  SajuInputError,
  selectSajuFood,
  thinkOptionForModel,
  type SajuChart,
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
  buildStaticMatch,
  buildStaticSections,
  luckyOf,
} from './saju-static.js';
import {
  SAJU_DAILY_JSON_SCHEMA,
  SAJU_DATE_PICK_JSON_SCHEMA,
  SAJU_FOOD_JSON_SCHEMA,
  SAJU_MATCH_JSON_SCHEMA,
  SAJU_PROMPT_VERSION,
  SAJU_REPAIR_SUFFIX,
  SAJU_SECTION_JSON_SCHEMA,
  SAJU_SECTION_MAX_TOKENS,
  SAJU_SYSTEM_PROMPT,
  buildSajuDailyPrompt,
  buildSajuDatePickPrompt,
  buildSajuFoodPrompt,
  buildSajuMatchPrompt,
  buildSajuSectionPrompt,
} from './saju.prompts.js';

// 사주 서비스 — 입력 → 원국(utils 재계산) → 캐시 → 한도 → LLM → 정적 폴백 → (회원 저장).
//
// - 전체 풀이(full)는 섹션 4개를 병렬로 부르고 즉시 응답한다(정적 본문 + jobId). 섹션이 도착하면 job 에
//   확정되고 클라이언트가 long-poll 로 받는다. 4개가 다 끝나면 회원 행을 저장하고 readingId 를 job 에 붙인다.
// - 캐시 키는 (프롬프트 버전, 8글자, 성별, 대운 방향·시작, 기준 연도) — 같은 사람은 연도가 바뀔 때까지 히트.
//   섹션별로 따로 캐시해 일부만 실패해도 나머지는 재사용한다.
// - 오늘·궁합·택일·음식은 단일 호출. 한도는 전부 feature 'saju-reading' 1건씩.
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
  now?: () => Date;
  llmTimeoutMs?: number;
}

export const SAJU_QUOTA_FEATURE = 'saju-reading' as const;

const LLM_TEMPERATURE = 0.8;
const LLM_NUM_CTX = 8192;
const LLM_TIMEOUT_MS = 25_000;
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
const DailyOutput = z.object({ body: z.string().trim().min(1), advice: z.string().trim().min(1) });
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
}

// LLM 호출 + JSON 수리 재시도 1회. 프로브 스크립트(probe:saju-reading)와 공유.
export const requestSajuLlm = async <T>(
  provider: LLMProvider,
  model: string,
  req: SajuLlmRequest<T>,
): Promise<{ output: T | null; calls: number; lastText: string }> => {
  let lastText = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await provider.complete({
      prompt: attempt === 0 ? req.prompt : `${req.prompt}\n\n${SAJU_REPAIR_SUFFIX}`,
      systemPrompt: SAJU_SYSTEM_PROMPT,
      model,
      temperature: LLM_TEMPERATURE,
      maxTokens: req.maxTokens,
      numCtx: LLM_NUM_CTX,
      format: req.jsonSchema,
      think: thinkOptionForModel(model),
      signal: req.signal,
    });
    lastText = res.text;
    const output = parseSajuJson(res.text, req.schema);
    if (output) return { output, calls: attempt + 1, lastText };
  }
  return { output: null, calls: 2, lastText };
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
export const dailyCacheKey = (chart: SajuChart, dayKey: string): string =>
  sha(`daily:${SAJU_PROMPT_VERSION}:${chart.pillars.day.ko}:${chart.favorable.primary}:${dayKey}`);
const matchCacheKey = (a: SajuChart, b: SajuChart, labels: { a: string; b: string }): string =>
  sha(`match:${chartCacheBase(a)}|${chartCacheBase(b)}|${labels.a}|${labels.b}`);
const datePickCacheKey = (chart: SajuChart, purpose: string, from: number, days: number): string =>
  sha(`date:${SAJU_PROMPT_VERSION}:${chartSignature(chart)}:${chart.favorable.primary}:${purpose}:${from}:${days}`);
const foodCacheKey = (chart: SajuChart, dayKey: string | null): string =>
  sha(`food:${SAJU_PROMPT_VERSION}:${chartSignature(chart)}:${chart.favorable.primary}:${dayKey ?? '-'}`);

type SectionValue = SajuSectionsType[SajuSectionIdType];

// ── 서비스 ──────────────────────────────────────────────────────────────────

export class SajuService {
  private readonly cache = new LRUCache<string, object>({ max: CACHE_MAX, ttl: CACHE_TTL_MS });
  readonly jobs: SajuJobRegistry;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly aiConfig: AiConfigService,
    private readonly deps: SajuServiceDeps,
  ) {
    this.jobs = deps.jobs ?? new SajuJobRegistry();
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
    provider: { provider: LLMProvider; model: string },
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
    p: { provider: LLMProvider; model: string },
  ): Promise<SectionValue | null> {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.deps.llmTimeoutMs ?? LLM_TIMEOUT_MS);
    try {
      const { output, calls } = await requestSajuLlm(p.provider, p.model, {
        prompt: buildSajuSectionPrompt(chart, section),
        schema: SectionOutput[section] as JsonSchemaLike<Record<string, unknown>>,
        jsonSchema: SAJU_SECTION_JSON_SCHEMA[section],
        maxTokens: SAJU_SECTION_MAX_TOKENS[section],
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
    return { readingId, jobId, chart: toChartDto(chart), sections, source, model, createdAt: createdAt.toISOString(), quota: { remainingToday: remaining } };
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
    return {
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

  private async resolveProvider(): Promise<{ provider: LLMProvider; model: string } | null> {
    const resolved = await this.aiConfig.getResolved('ollama-cloud', 'saju');
    const model = resolved?.defaultModel.trim() ?? '';
    if (!resolved || !model) {
      this.deps.logger?.warn('[saju] provider/모델 미설정 — 정적 풀이');
      return null;
    }
    return { provider: (this.deps.cache ?? adapterCache).get(resolved), model };
  }

  private async callJson<T>(
    p: { provider: LLMProvider; model: string },
    prompt: string,
    schema: JsonSchemaLike<T>,
    jsonSchema: Record<string, unknown>,
    maxTokens: number,
    tag: string,
  ): Promise<T | null> {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.deps.llmTimeoutMs ?? LLM_TIMEOUT_MS);
    try {
      const { output, calls } = await requestSajuLlm(p.provider, p.model, { prompt, schema, jsonSchema, maxTokens, signal: ac.signal });
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

