import type { PrismaClient } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import type {
  MenuGroupRunResultType,
  MenuGroupingRestaurantStatusListType,
  MenuGroupingRestaurantStatusQueryType,
  MenuGroupingRestaurantStatusType,
  MenuRankingItemType,
  MenuRankingQueryType,
  MenuRankingResultType,
} from '@repo/api-contract';
import type { LLMProvider } from '../ai/adapters/llm-provider.js';
import type { AiConfigService } from '../ai/ai.config.service.js';
import type { OperationLogService } from '../logs/operation-log.service.js';
import { adapterCache, type AdapterCache } from '../ai/adapter-cache.js';
import { classifyError } from '../ai/ai.service.js';
import { normalizeTerm, extractFirstJsonObject } from '../summary/summary.service.js';
import {
  MENU_GROUPING_CHUNK_SIZE,
  MENU_GROUPING_JSON_SCHEMA,
  MENU_GROUPING_MERGE_CHUNK_SIZE,
  MENU_GROUPING_SYSTEM_PROMPT,
  MENU_GROUPING_VERSION,
  buildGroupingUserPrompt,
} from './menu-grouping.prompts.js';
import { packBySimilarity } from './menu-grouping.similarity.js';

// gpt-oss 권장 온도 ≈ 1.0 — v1 의 0.1 은 reasoning 반복 루프로 토큰 예산을
// 태우는 보조 원인이었다 (2026-06 parse_failed 운영 장애 분석).
const TEMPERATURE = 1.0;
// 출력은 "병합 그룹 인덱스" 수십 토큰뿐 — 나머지는 전부 reasoning 여유분.
// thinking 모델은 사고 토큰도 num_predict(eval_count)에 합산되는 점에 주의.
const MAX_TOKENS = 2000;
const NUM_CTX = 8192;
// 대표 머지 라운드 상한 — 1라운드가 단일 콜(전 대표 전수 비교)이면 즉시 종료.
const MAX_MERGE_ROUNDS = 2;

export class MenuGroupingError extends Error {
  constructor(
    public readonly code: 'no_provider' | 'no_menus' | 'restaurant_not_found',
    message: string,
  ) {
    super(message);
    this.name = 'MenuGroupingError';
  }
}

export interface MenuGroupingServiceOptions {
  cache?: AdapterCache;
  resolveOverride?: () => Promise<{ provider: LLMProvider; model: string } | null>;
  logger?: FastifyBaseLogger;
  // 테스트용 호출 크기 오버라이드 — 기본은 prompts 의 상수.
  chunkSize?: number;
  mergeChunkSize?: number;
  // 범용 작업 로그 계측 — null/미주입이면 run 기록 없이 기존 흐름 그대로
  // (기존 테스트가 계측 없이도 깨지지 않게).
  operationLog?: OperationLogService | null;
}

// LLM 호출 한 번의 실패 — diag 는 HTTP 는 성공했는데 parse 가 실패했을 때만
// 채워진다 (응답 스니펫/토큰 수/done_reason). "사고가 예산을 다 먹었다 vs
// 형식 이탈" 을 운영 로그에서 한눈에 가르는 신호.
interface GroupingCallFailure {
  code: string;
  message: string;
  diag?: Record<string, unknown>;
}

export interface GroupForRestaurantOpts {
  // 부모 run(schedule 등)이 자식 run 을 연계할 때 전달.
  parentRunId?: string | null;
  // 벌크 잡 라우트의 groupingJobRegistry jobId — OperationRun.jobId 로 기록.
  jobId?: string | null;
  trigger?: string | null;
}

export class MenuGroupingService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly aiConfig: AiConfigService,
    private readonly opts: MenuGroupingServiceOptions = {},
  ) {}

  private get log(): FastifyBaseLogger | null {
    return this.opts.logger ?? null;
  }

  // 단일 식당의 distinct nameNorm 들을 LLM 으로 canonical 그룹에 매핑.
  // 기존 매핑은 모두 삭제 후 새로 작성 (idempotent). LLM 미설정/오류 시
  // MenuGroupingError 던짐 — 호출자(라우트)가 4xx/5xx 로 변환.
  // run 경계 = 이 메서드 1회. opts.parentRunId 로 부모 run(schedule 등)과 연계.
  async groupForRestaurant(
    placeId: string,
    opts?: GroupForRestaurantOpts,
  ): Promise<MenuGroupRunResultType> {
    const oplog = this.opts.operationLog ?? null;
    const runId = oplog
      ? await oplog.startRun({
          feature: 'menu-grouping',
          jobId: opts?.jobId ?? null,
          subjectId: placeId,
          parentRunId: opts?.parentRunId ?? null,
          trigger: opts?.trigger ?? null,
        })
      : null;
    const step = (
      level: 'info' | 'warn' | 'error',
      stage: string,
      message: string,
      meta?: Record<string, unknown>,
    ): void => {
      if (oplog && runId) {
        oplog.log({ runId, stage, level, message, ...(meta !== undefined ? { meta } : {}) });
      }
    };
    // finishRun 은 정확히 한 번 — 성공/실패 매핑 경로가 먼저 마감하면
    // finally 의 방어 마감은 no-op 이 된다 (run 이 영원히 running 으로
    // 남는 사고 방지).
    let finished = false;
    const finish = async (input: {
      status: 'done' | 'failed' | 'cancelled';
      errorCode?: string;
      errorMessage?: string;
      meta?: Record<string, unknown>;
    }): Promise<void> => {
      if (!oplog || !runId || finished) return;
      finished = true;
      await oplog.finishRun(runId, input);
    };

    try {
      const result = await this.doGroupForRestaurant(placeId, step, finish);
      return result;
    } catch (e) {
      if (e instanceof MenuGroupingError) {
        if (e.code === 'no_menus') {
          // 정상 스킵 — 아직 분석된 멘션이 없을 뿐 실패가 아니다.
          // failed 로 기록하면 매번 무의미한 자동 분석이 붙는다.
          step('info', 'load', '그룹핑할 메뉴 멘션이 없어 스킵');
          await finish({ status: 'done', meta: { skipped: 'no_menus' } });
        } else {
          // no_provider 는 자동 분석 제외 코드 — finishRun 이 알아서 거른다.
          const stage = e.code === 'no_provider' ? 'resolve_provider' : 'load';
          step('error', stage, e.message, { code: e.code });
          await finish({ status: 'failed', errorCode: e.code, errorMessage: e.message });
        }
      } else {
        const message = e instanceof Error ? e.message : String(e);
        step('error', 'run', message);
        await finish({ status: 'failed', errorCode: 'unknown', errorMessage: message });
      }
      throw e;
    } finally {
      // 위 경로들이 모두 마감하지만, 누락 시에도 running 고아를 남기지 않는다.
      await finish({
        status: 'failed',
        errorCode: 'unknown',
        errorMessage: 'run finished without explicit status',
      });
    }
  }

  // 실제 그룹핑 본문 — step/finish 는 groupForRestaurant 가 만든 계측 헬퍼.
  // 성공 경로의 finishRun(done/all_chunks_failed)도 여기서 호출한다 —
  // 전 호출 실패는 비즈니스 결과(identity fallback 저장)는 유지하되
  // run 만 실패로 승격해야 해서 throw 로 표현할 수 없기 때문.
  private async doGroupForRestaurant(
    placeId: string,
    step: (
      level: 'info' | 'warn' | 'error',
      stage: string,
      message: string,
      meta?: Record<string, unknown>,
    ) => void,
    finish: (input: {
      status: 'done' | 'failed' | 'cancelled';
      errorCode?: string;
      errorMessage?: string;
      meta?: Record<string, unknown>;
    }) => Promise<void>,
  ): Promise<MenuGroupRunResultType> {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { placeId },
      select: { id: true, name: true, category: true },
    });
    if (!restaurant) {
      throw new MenuGroupingError('restaurant_not_found', `Restaurant not found: ${placeId}`);
    }

    // distinct nameNorm + 그 nameNorm 의 대표 원문 (가장 빈도 높은 표기).
    // SQLite 에서 raw groupBy 두 번 — distinct nameNorm 들 + 각 nameNorm 의
    // 가장 빈도 높은 원문 name. 대안은 menuMention 전체 read 후 JS 에서 집계인데,
    // 메뉴 멘션 수가 많을 수 있어 DB 에서 처리.
    const grouped = await this.prisma.menuMention.groupBy({
      by: ['nameNorm', 'name'],
      where: { restaurantId: restaurant.id },
      _count: { _all: true },
    });
    if (grouped.length === 0) {
      throw new MenuGroupingError('no_menus', 'No menu mentions to group yet');
    }

    // nameNorm 별로 가장 빈도 높은 원문 표기를 input variant 로 사용.
    // norm 별 총 멘션 수는 canonical 동률(같은 길이) 판정의 빈도 기준.
    const bestNameByNorm = new Map<string, { name: string; count: number }>();
    const totalByNorm = new Map<string, number>();
    for (const row of grouped) {
      const count = row._count._all;
      totalByNorm.set(row.nameNorm, (totalByNorm.get(row.nameNorm) ?? 0) + count);
      const cur = bestNameByNorm.get(row.nameNorm);
      if (!cur || count > cur.count) {
        bestNameByNorm.set(row.nameNorm, { name: row.name, count });
      }
    }

    // 변형 = 대표 원문들 (LLM 입력). nameNorm → variant 매핑은 결과를
    // 다시 nameNorm 으로 풀어쓸 때 사용.
    const variantToNorm = new Map<string, string>();
    const countByVariant = new Map<string, number>();
    const variants: string[] = [];
    for (const [norm, { name }] of bestNameByNorm) {
      variantToNorm.set(name, norm);
      countByVariant.set(name, totalByNorm.get(norm) ?? 0);
      variants.push(name);
    }
    step('info', 'load', `메뉴 변형 적재 완료 — distinct ${variants.length}개`, {
      distinctMenus: variants.length,
    });

    const resolved = await this.resolveProvider();
    if (!resolved) {
      throw new MenuGroupingError(
        'no_provider',
        'LLM provider/model not configured (check AI providers admin page)',
      );
    }
    const { provider, model } = resolved;
    step('info', 'resolve_provider', `LLM 결정 — ${model}`, { model });

    // ── 파이프라인: 유사도 패킹 분할 → 청크 내 그룹핑(LLM, 병렬) →
    // 대표 머지(LLM) → union-find 확정. 출력 계약이 "병합 그룹 인덱스"뿐이라
    // 호출당 출력이 식당 크기와 무관하게 수십 토큰으로 고정되고, 청크가
    // 갈라놓은 쌍은 대표 머지 라운드가 커버한다 (v1 의 "같은 청크 안에서만
    // 묶인다" 제약 제거).
    const chunkSize = this.opts.chunkSize ?? MENU_GROUPING_CHUNK_SIZE;
    const mergeChunkSize = this.opts.mergeChunkSize ?? MENU_GROUPING_MERGE_CHUNK_SIZE;
    const chunks = packBySimilarity(variants, chunkSize);
    step('info', 'plan', `청크 계획 — ${variants.length}개 → ${chunks.length}청크 (유사도 패킹)`, {
      chunks: chunks.length,
      sizes: chunks.map((c) => c.length),
    });
    this.log?.info(
      { placeId, total: variants.length, chunks: chunks.length, model },
      '[menu-grouping] start',
    );

    // union-find — 변형 이름 키. 1단계와 머지 라운드의 모든 병합이 모이고,
    // 서로 다른 호출의 판정도 전이적으로 합쳐진다 (a~b, b~c ⇒ a~c).
    const parent = new Map<string, string>();
    const find = (x: string): string => {
      const p = parent.get(x);
      if (p === undefined || p === x) return x;
      const r = find(p);
      parent.set(x, r);
      return r;
    };
    const union = (a: string, b: string): boolean => {
      const ra = find(a);
      const rb = find(b);
      if (ra === rb) return false;
      parent.set(rb, ra);
      return true;
    };
    const currentGroups = (): string[][] => {
      const byRoot = new Map<string, string[]>();
      for (const v of variants) {
        const r = find(v);
        const arr = byRoot.get(r) ?? [];
        arr.push(v);
        byRoot.set(r, arr);
      }
      return [...byRoot.values()];
    };

    const ctx = { restaurantName: restaurant.name, category: restaurant.category };
    let llmCalls = 0;
    let failedCalls = 0;
    const failedChunks: { index: number; code: string }[] = [];
    const mergeFailures: { round: number; code: string }[] = [];
    let lastFailure: GroupingCallFailure | null = null;

    // ── 1단계: 청크 내 그룹핑 — 병렬 (동시성은 어댑터 게이트가 조절).
    // 실패 청크의 항목들은 identity 확정이 아니라 singleton 으로 머지
    // 라운드에 진입한다 — 실패가 "포기"에서 "문맥 약화"로 강등된다.
    const outcomes = await Promise.all(
      chunks.map((ch, idx) =>
        this.callChunkWithSplit(provider, model, ctx, ch, (level, message, meta) =>
          step(level, 'chunk', `청크 ${idx + 1}/${chunks.length} ${message}`, {
            index: idx,
            ...meta,
          }),
        ),
      ),
    );
    for (const [idx, out] of outcomes.entries()) {
      llmCalls += out.calls;
      failedCalls += out.failedCalls;
      for (const f of out.failures) {
        failedChunks.push({ index: idx, code: f.code });
        lastFailure = f;
      }
      let merges = 0;
      for (const g of out.groups) {
        for (let i = 1; i < g.length; i += 1) {
          if (union(g[0]!, g[i]!)) merges += 1;
        }
      }
      if (out.calls > 0 && out.failedCalls === 0) {
        step('info', 'chunk', `청크 ${idx + 1}/${chunks.length} 완료 — 병합 ${merges}건`, {
          index: idx,
          size: chunks[idx]!.length,
          merges,
        });
      }
    }

    // ── 2단계: 대표 머지 — 청크가 갈라놓은 쌍을 그룹 대표끼리 재판정.
    // 병합은 union 이라 단조적 — 라운드를 더 돌아도 과병합 방향으로
    // 흐르지 않는다. 대표가 한 콜에 다 들어가면 전수 비교 — one-shot 과
    // 동등한 커버리지가 그 콜에서 성립한다.
    let mergeRounds = 0;
    let mergeMerged = 0;
    while (mergeRounds < MAX_MERGE_ROUNDS) {
      const groups = currentGroups();
      if (groups.length < 2) break;
      const reps = groups.map((members) => pickCanonicalName(members, countByVariant));
      const repUnits = packBySimilarity(reps, mergeChunkSize);
      const callable = repUnits.filter((u) => u.length >= 2);
      if (callable.length === 0) break;
      mergeRounds += 1;
      const roundNo = mergeRounds;
      step(
        'info',
        'merge',
        `대표 머지 라운드 ${roundNo} — 대표 ${reps.length}개 / ${callable.length}콜`,
        { round: roundNo, reps: reps.length, calls: callable.length },
      );
      const results = await Promise.all(
        callable.map((unit) => this.callIndexGroups(provider, model, ctx, unit)),
      );
      let roundMerges = 0;
      for (const res of results) {
        llmCalls += 1;
        if (!res.ok) {
          failedCalls += 1;
          mergeFailures.push({ round: roundNo, code: res.failure.code });
          lastFailure = res.failure;
          step('warn', 'merge', `머지 콜 실패(${res.failure.code}) — 기존 그룹 유지`, {
            round: roundNo,
            code: res.failure.code,
            message: res.failure.message.slice(0, 300),
            ...(res.failure.diag ?? {}),
          });
          continue;
        }
        for (const g of res.groups) {
          for (let i = 1; i < g.length; i += 1) {
            if (union(g[0]!, g[i]!)) roundMerges += 1;
          }
        }
      }
      mergeMerged += roundMerges;
      step('info', 'merge', `라운드 ${roundNo} 완료 — 병합 ${roundMerges}건`, {
        round: roundNo,
        merges: roundMerges,
      });
      // 단일 콜이었으면 전수 비교 완료, 병합 0건이면 fixpoint — 종료.
      if (repUnits.length === 1 || roundMerges === 0) break;
    }

    // ── 확정: canonical 은 코드가 결정 (최단 표기 → 멘션 빈도 → 사전순).
    // LLM 은 membership 만 판정했으므로 입력에 없는 이름이 canonical 로
    // 저장될 수 없다.
    const canonicalByVariant = new Map<string, string>();
    for (const members of currentGroups()) {
      const canonical = pickCanonicalName(members, countByVariant);
      for (const m of members) canonicalByVariant.set(m, canonical);
    }

    // DB 적용 — delete + createMany in transaction.
    const now = new Date();
    const rows = variants.map((variant) => {
      const canonical = canonicalByVariant.get(variant) ?? variant;
      const norm = variantToNorm.get(variant)!;
      return {
        restaurantId: restaurant.id,
        nameNorm: norm,
        canonicalName: canonical,
        canonicalNorm: normalizeTerm(canonical) || norm,
        version: MENU_GROUPING_VERSION,
        model,
        createdAt: now,
      };
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.menuCanonical.deleteMany({ where: { restaurantId: restaurant.id } });
      if (rows.length > 0) await tx.menuCanonical.createMany({ data: rows });
    });

    const groupCount = new Set(rows.map((r) => r.canonicalNorm)).size;
    step('info', 'save', `매핑 저장 완료 — ${rows.length}건 / ${groupCount}그룹`, {
      mapped: rows.length,
      groups: groupCount,
    });
    this.log?.info(
      { placeId, mapped: rows.length, groups: groupCount, model },
      '[menu-grouping] done',
    );

    const runMeta: Record<string, unknown> = {
      inputCount: variants.length,
      chunks: chunks.length,
      llmCalls,
      failedCalls,
      groupCount,
      mappedCount: rows.length,
      model,
      mergeRounds,
      mergeMerged,
      ...(failedChunks.length > 0 ? { failedChunks } : {}),
      ...(mergeFailures.length > 0 ? { mergeFailures } : {}),
    };
    if (llmCalls > 0 && failedCalls === llmCalls) {
      // 전 호출 실패 — 저장된 매핑이 전부 identity fallback 이라 사실상
      // 그룹핑이 안 된 상태. 비즈니스 결과는 유지하되 run 은 실패로 승격.
      step('error', 'chunk', `전 호출(${llmCalls}건) 실패 — 결과 전부 identity fallback`, {
        failedCalls,
      });
      await finish({
        status: 'failed',
        errorCode: 'all_chunks_failed',
        errorMessage: lastFailure
          ? `${lastFailure.code}: ${lastFailure.message}`
          : 'all LLM calls failed',
        meta: runMeta,
      });
    } else {
      await finish({ status: 'done', meta: runMeta });
    }

    return {
      ok: true,
      placeId,
      inputCount: variants.length,
      groupCount,
      mappedCount: rows.length,
      model,
      version: MENU_GROUPING_VERSION,
    };
  }

  // 1단계 한 청크: 호출 1회 + 실패 시 이분할 재시도 1단계. 어느 조각이
  // 끝내 실패해도 그 항목들은 singleton 으로 머지 라운드에 진입하므로
  // (호출자 책임) 여기서는 성공 조각의 병합 그룹만 모아 돌려준다.
  private async callChunkWithSplit(
    provider: LLMProvider,
    model: string,
    ctx: { restaurantName: string; category: string | null },
    names: string[],
    stepChunk: (
      level: 'info' | 'warn',
      message: string,
      meta?: Record<string, unknown>,
    ) => void,
  ): Promise<{
    groups: string[][];
    failures: GroupingCallFailure[];
    calls: number;
    failedCalls: number;
  }> {
    // 항목 1개는 비교 대상이 없다 — 호출 없이 singleton 으로 통과.
    if (names.length < 2) return { groups: [], failures: [], calls: 0, failedCalls: 0 };

    const first = await this.callIndexGroups(provider, model, ctx, names);
    if (first.ok) return { groups: first.groups, failures: [], calls: 1, failedCalls: 0 };

    stepChunk('warn', `실패(${first.failure.code}) — 이분할 재시도`, {
      size: names.length,
      code: first.failure.code,
      message: first.failure.message.slice(0, 300),
      ...(first.failure.diag ?? {}),
    });
    const out = {
      groups: [] as string[][],
      failures: [first.failure],
      calls: 1,
      failedCalls: 1,
    };
    const mid = Math.ceil(names.length / 2);
    for (const half of [names.slice(0, mid), names.slice(mid)]) {
      if (half.length < 2) continue;
      const res = await this.callIndexGroups(provider, model, ctx, half);
      out.calls += 1;
      if (res.ok) {
        out.groups.push(...res.groups);
      } else {
        out.failedCalls += 1;
        out.failures.push(res.failure);
        stepChunk(
          'warn',
          `절반(${half.length}개) 재시도 실패(${res.failure.code}) — singleton 진입`,
          {
            size: half.length,
            code: res.failure.code,
            message: res.failure.message.slice(0, 300),
            ...(res.failure.diag ?? {}),
          },
        );
      }
    }
    return out;
  }

  // 인덱스-그룹 판정 호출 한 번. 출력 {"groups":[[i,j],…]} 를 변형 이름
  // 그룹으로 풀어 반환. 범위 밖/비정수/중복 인덱스는 버리고 유효 인덱스
  // 2개 미만 그룹은 무시 — LLM 의 형식 이탈이 병합 오류로 번지지 않게
  // 방어적으로 좁힌다. 1단계(청크)와 2단계(대표 머지)가 같은 계약을 쓴다.
  private async callIndexGroups(
    provider: LLMProvider,
    model: string,
    ctx: { restaurantName: string; category: string | null },
    names: string[],
  ): Promise<{ ok: true; groups: string[][] } | { ok: false; failure: GroupingCallFailure }> {
    try {
      const res = await provider.complete({
        prompt: buildGroupingUserPrompt({
          restaurantName: ctx.restaurantName,
          category: ctx.category,
          variants: names,
        }),
        model,
        systemPrompt: MENU_GROUPING_SYSTEM_PROMPT,
        temperature: TEMPERATURE,
        maxTokens: MAX_TOKENS,
        numCtx: NUM_CTX,
        format: MENU_GROUPING_JSON_SCHEMA,
        // gpt-oss 는 thinking 을 끌 수 없고 기본 medium — low 로 줄여 토큰
        // 예산을 지킨다. 다른 모델은 think 미지원일 수 있어 보내지 않는다.
        ...(model.includes('gpt-oss') ? { think: 'low' as const } : {}),
      });
      const diag: Record<string, unknown> = {
        snippet: res.text.slice(0, 200),
        completionTokens: res.completionTokens,
        doneReason: res.doneReason ?? null,
      };
      const candidate = extractFirstJsonObject(res.text);
      if (!candidate) {
        // '{' 가 없거나(빈 응답 포함) 끝까지 닫히지 않은(잘린) 경우 모두.
        return {
          ok: false,
          failure: {
            code: 'parse_failed',
            message: 'no complete JSON object in LLM response',
            diag,
          },
        };
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(candidate);
      } catch {
        return {
          ok: false,
          failure: { code: 'parse_failed', message: 'invalid JSON in LLM response', diag },
        };
      }
      const rawGroups =
        parsed && typeof parsed === 'object' ? (parsed as { groups?: unknown }).groups : undefined;
      if (!Array.isArray(rawGroups)) {
        return {
          ok: false,
          failure: { code: 'parse_failed', message: 'LLM JSON has no groups array', diag },
        };
      }
      const groups: string[][] = [];
      for (const g of rawGroups) {
        if (!Array.isArray(g)) continue;
        const idxs = new Set<number>();
        for (const x of g) {
          if (typeof x === 'number' && Number.isInteger(x) && x >= 0 && x < names.length) {
            idxs.add(x);
          }
        }
        if (idxs.size >= 2) groups.push([...idxs].map((i) => names[i]!));
      }
      return { ok: true, groups };
    } catch (e) {
      const { error, message } = classifyError(e);
      this.log?.warn({ error, message: message.slice(0, 200) }, '[menu-grouping] LLM call failed');
      return { ok: false, failure: { code: error, message } };
    }
  }

  // 식당 단위 메뉴 순위. canonical 매핑이 없는 nameNorm 은 자기 자신을 그룹키로
  // fallback. unmappedMenus 에 그 변형들을 같이 노출.
  async getRanking(placeId: string, query: MenuRankingQueryType): Promise<MenuRankingResultType> {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { placeId },
      select: { id: true },
    });
    if (!restaurant) {
      throw new MenuGroupingError('restaurant_not_found', `Restaurant not found: ${placeId}`);
    }

    const [mentions, canonicals] = await Promise.all([
      this.prisma.menuMention.findMany({
        where: { restaurantId: restaurant.id },
        select: {
          name: true,
          nameNorm: true,
          sentiment: true,
          traitsJson: true,
          summaryId: true,
          summary: { select: { reviewId: true } },
        },
      }),
      this.prisma.menuCanonical.findMany({
        where: { restaurantId: restaurant.id },
        select: {
          nameNorm: true,
          canonicalName: true,
          canonicalNorm: true,
          version: true,
          createdAt: true,
          // 글로벌 비교 위젯 — 이 메뉴가 GlobalMenuCanonical 에 링크돼 있는지.
          globalLink: {
            select: {
              global: { select: { id: true, globalKey: true, displayName: true } },
            },
          },
        },
      }),
    ]);

    const canonByNorm = new Map(canonicals.map((c) => [c.nameNorm, c]));

    // 글로벌 비교 통계 — 우리 식당의 메뉴들이 링크된 globalCanonical id 수집 후
    // 그 globalId 들에 매핑된 모든 식당의 멘션을 합산. 식당당 1쿼리로 바운드 — 보통
    // 한 globalKey 에 식당 1~10개 사이라 OK. 더 빨라야 하면 raw SQL 로 단일 쿼리화.
    const targetGlobalIds = canonicals
      .map((c) => c.globalLink?.global.id)
      .filter((id): id is string => !!id);

    interface GlobalAgg {
      id: string;
      globalKey: string;
      displayName: string;
      totalMentions: number;
      positive: number;
      negative: number;
      restaurants: Set<string>;
    }
    const globalAggById = new Map<string, GlobalAgg>();

    if (targetGlobalIds.length > 0) {
      // 같은 글로벌에 링크된 모든 식당 그룹을 끌어온다 — (restaurantId, nameNorm)
      // 으로 menu_mentions 와 join 하기 위함.
      const siblings = await this.prisma.menuCanonical.findMany({
        where: { globalLink: { globalCanonicalId: { in: targetGlobalIds } } },
        select: {
          restaurantId: true,
          nameNorm: true,
          globalLink: {
            select: {
              global: { select: { id: true, globalKey: true, displayName: true } },
            },
          },
        },
      });

      // restaurantId → [{ nameNorm, globalId }] — 식당별로 한 번에 멘션 끌어옴.
      const siblingsByRestaurant = new Map<
        string,
        { nameNorm: string; global: { id: string; globalKey: string; displayName: string } }[]
      >();
      for (const s of siblings) {
        if (!s.globalLink) continue;
        const arr = siblingsByRestaurant.get(s.restaurantId) ?? [];
        arr.push({ nameNorm: s.nameNorm, global: s.globalLink.global });
        siblingsByRestaurant.set(s.restaurantId, arr);
      }

      for (const [restId, sibs] of siblingsByRestaurant) {
        const norms = sibs.map((s) => s.nameNorm);
        const siblingMentions = await this.prisma.menuMention.findMany({
          where: { restaurantId: restId, nameNorm: { in: norms } },
          select: { sentiment: true, nameNorm: true },
        });
        // 이 식당의 nameNorm → globalId 매핑.
        const globalByNorm = new Map(sibs.map((s) => [s.nameNorm, s.global]));
        for (const mm of siblingMentions) {
          const g = globalByNorm.get(mm.nameNorm);
          if (!g) continue;
          let agg = globalAggById.get(g.id);
          if (!agg) {
            agg = {
              id: g.id,
              globalKey: g.globalKey,
              displayName: g.displayName,
              totalMentions: 0,
              positive: 0,
              negative: 0,
              restaurants: new Set<string>(),
            };
            globalAggById.set(g.id, agg);
          }
          agg.totalMentions += 1;
          if (mm.sentiment === 'positive') agg.positive += 1;
          else if (mm.sentiment === 'negative') agg.negative += 1;
          // neutral 은 카운트만 totalMentions 에 들어가고 별도 트랙 안 함 — UI 가 안 씀.
          agg.restaurants.add(restId);
        }
      }
    }
    interface Bucket {
      canonicalName: string;
      canonicalKey: string;
      mapped: boolean;
      mentionCount: number;
      positive: number;
      negative: number;
      neutral: number;
      variantCounts: Map<string, number>;
      traitCounts: Map<string, number>;
      sampleReviewByPolarity: { positive?: string; negative?: string; neutral?: string };
    }
    const buckets = new Map<string, Bucket>();

    for (const m of mentions) {
      const canon = canonByNorm.get(m.nameNorm);
      const key = canon ? canon.canonicalNorm : m.nameNorm;
      const displayName = canon ? canon.canonicalName : m.name;
      const mapped = !!canon;

      let b = buckets.get(key);
      if (!b) {
        b = {
          canonicalName: displayName,
          canonicalKey: key,
          mapped,
          mentionCount: 0,
          positive: 0,
          negative: 0,
          neutral: 0,
          variantCounts: new Map(),
          traitCounts: new Map(),
          sampleReviewByPolarity: {},
        };
        buckets.set(key, b);
      }
      b.mentionCount += 1;
      if (m.sentiment === 'positive') b.positive += 1;
      else if (m.sentiment === 'negative') b.negative += 1;
      else b.neutral += 1;

      b.variantCounts.set(m.name, (b.variantCounts.get(m.name) ?? 0) + 1);

      try {
        const traits = JSON.parse(m.traitsJson) as unknown;
        if (Array.isArray(traits)) {
          for (const t of traits) {
            if (typeof t === 'string' && t.trim().length > 0) {
              b.traitCounts.set(t, (b.traitCounts.get(t) ?? 0) + 1);
            }
          }
        }
      } catch {
        // ignore malformed traitsJson
      }

      const polarity =
        m.sentiment === 'positive' || m.sentiment === 'negative' ? m.sentiment : 'neutral';
      if (!b.sampleReviewByPolarity[polarity] && m.summary?.reviewId) {
        b.sampleReviewByPolarity[polarity] = m.summary.reviewId;
      }
    }

    // canonicalNorm → globalCanonical 정보 매핑 (이 식당 한정).
    const globalByLocalNorm = new Map<
      string,
      { id: string; globalKey: string; displayName: string }
    >();
    for (const c of canonicals) {
      if (c.globalLink) {
        globalByLocalNorm.set(c.canonicalNorm, c.globalLink.global);
      }
    }

    const items: MenuRankingItemType[] = [];
    for (const b of buckets.values()) {
      if (b.mentionCount < query.minMentions) continue;
      const denom = b.positive + b.negative;
      const positiveRatio = denom === 0 ? null : b.positive / denom;
      // 변형은 빈도 내림차순.
      const variants = [...b.variantCounts.entries()]
        .sort((a, c) => c[1] - a[1])
        .map(([n]) => n);
      const topTraits = [...b.traitCounts.entries()]
        .sort((a, c) => c[1] - a[1])
        .slice(0, 3)
        .map(([n]) => n);
      const sampleReviewIds = [
        b.sampleReviewByPolarity.positive,
        b.sampleReviewByPolarity.negative,
        b.sampleReviewByPolarity.neutral,
      ].filter((x): x is string => !!x);

      const globalRef = b.mapped ? globalByLocalNorm.get(b.canonicalKey) : undefined;
      let globalField: MenuRankingItemType['global'] = null;
      if (globalRef) {
        const agg = globalAggById.get(globalRef.id);
        if (agg) {
          const gDenom = agg.positive + agg.negative;
          globalField = {
            globalKey: agg.globalKey,
            displayName: agg.displayName,
            totalMentions: agg.totalMentions,
            positive: agg.positive,
            negative: agg.negative,
            positiveRatio: gDenom === 0 ? null : agg.positive / gDenom,
            restaurantCount: agg.restaurants.size,
          };
        } else {
          // 글로벌 링크가 있긴 한데 멘션 집계가 아직 없는 케이스
          // (멘션 0이지만 매핑만 있는 코너 케이스). 표시용으로 빈 값 채움.
          globalField = {
            globalKey: globalRef.globalKey,
            displayName: globalRef.displayName,
            totalMentions: 0,
            positive: 0,
            negative: 0,
            positiveRatio: null,
            restaurantCount: 0,
          };
        }
      }
      items.push({
        canonicalName: b.canonicalName,
        canonicalKey: b.canonicalKey,
        mapped: b.mapped,
        mentionCount: b.mentionCount,
        positive: b.positive,
        negative: b.negative,
        neutral: b.neutral,
        positiveRatio,
        global: globalField,
        variants,
        topTraits,
        sampleReviewIds,
      });
    }

    // 정렬.
    items.sort((a, b) => sortRanking(a, b, query.sort));

    // 마지막 그룹핑 메타데이터.
    let groupedAt: string | null = null;
    let storedVersion: number | null = null;
    for (const c of canonicals) {
      if (!groupedAt || c.createdAt.toISOString() > groupedAt) {
        groupedAt = c.createdAt.toISOString();
      }
      if (storedVersion === null || c.version < storedVersion) {
        storedVersion = c.version;
      }
    }

    const unmappedMenus = items
      .filter((i) => !i.mapped)
      .flatMap((i) => i.variants);

    const totalMentions = mentions.length;
    const groupedCount = items.filter((i) => i.mapped).length;

    return {
      placeId,
      totalMentions,
      groupedCount,
      unmappedMenus,
      groupedAt,
      modelVersion: storedVersion,
      currentVersion: MENU_GROUPING_VERSION,
      items,
    };
  }

  // 관리자 페이지 메인 테이블용 — 식당별 정규화 상태. 쿼리(검색·필터·정렬·
  // 페이지) 적용 후 현재 페이지만 반환. groupBy 집계 자체는 전체에 대해
  // 한 번 돌리고 메모리에서 필터/정렬/슬라이스 — 식당 수천 단위까지는 부담
  // 미미하고, "처리 필요" 카운트(attentionCount)도 같은 패스로 한 번에 계산.
  // 진짜 수만 단위 진입 시 SQL raw 로 옮기는 게 다음 단계.
  async getRestaurantsStatus(
    query: MenuGroupingRestaurantStatusQueryType,
  ): Promise<Omit<MenuGroupingRestaurantStatusListType, 'currentVersion'>> {
    // 식당 + 그 통계 한 방에. SQLite + 단일 인스턴스라 N+1 가 부담이라
    // groupBy 로 묶는다. 단일 식당 수가 수백~수천 단위 범위라 OK.
    const restaurants = await this.prisma.restaurant.findMany({
      // 메뉴 그루핑 어드민 화면은 네이버 전용 (placeId 가 응답 키).
      where: { source: 'naver' },
      select: {
        id: true,
        placeId: true,
        name: true,
        category: true,
        _count: { select: { visitorReviews: true } },
      },
    });

    if (restaurants.length === 0) {
      return {
        items: [],
        total: 0,
        totalRestaurants: 0,
        attentionCount: 0,
        page: query.page,
        pageSize: query.pageSize,
      };
    }

    const ids = restaurants.map((r) => r.id);

    // distinct nameNorm 수, mapped 수, 마지막 그룹핑 시각/버전, 분석 done 수
    // 모두 한 번씩의 groupBy 로. 식당 수가 많아도 한 번에 처리.
    const [mentionGroups, canonicalGroups, latestCanonical, analyzedSummaries] =
      await Promise.all([
        this.prisma.menuMention.groupBy({
          by: ['restaurantId', 'nameNorm'],
          where: { restaurantId: { in: ids } },
        }),
        this.prisma.menuCanonical.groupBy({
          by: ['restaurantId', 'nameNorm'],
          where: { restaurantId: { in: ids } },
        }),
        this.prisma.menuCanonical.groupBy({
          by: ['restaurantId'],
          where: { restaurantId: { in: ids } },
          _max: { createdAt: true },
          _min: { version: true },
        }),
        // 분석 done 수 — review 의 restaurantId 로 풀어내야 해서 select 후 메모리 집계.
        // done 행은 보통 식당당 수십~수백이라 부하 미미.
        this.prisma.reviewSummary.findMany({
          where: { status: 'done', review: { restaurantId: { in: ids } } },
          select: { review: { select: { restaurantId: true } } },
        }),
      ]);

    const analyzedMap = new Map<string, number>();
    for (const s of analyzedSummaries) {
      const rid = s.review.restaurantId;
      analyzedMap.set(rid, (analyzedMap.get(rid) ?? 0) + 1);
    }

    const distinctMenuByRest = new Map<string, number>();
    for (const g of mentionGroups) {
      distinctMenuByRest.set(g.restaurantId, (distinctMenuByRest.get(g.restaurantId) ?? 0) + 1);
    }
    const mappedByRest = new Map<string, number>();
    for (const g of canonicalGroups) {
      mappedByRest.set(g.restaurantId, (mappedByRest.get(g.restaurantId) ?? 0) + 1);
    }
    const lastByRest = new Map<string, { at: Date | null; version: number | null }>();
    for (const g of latestCanonical) {
      lastByRest.set(g.restaurantId, {
        at: g._max.createdAt,
        version: g._min.version ?? null,
      });
    }

    const rows: MenuGroupingRestaurantStatusType[] = restaurants.map((r) => {
      const distinct = distinctMenuByRest.get(r.id) ?? 0;
      const mapped = mappedByRest.get(r.id) ?? 0;
      const last = lastByRest.get(r.id);
      return {
        // source='naver' 필터로 placeId non-null.
        placeId: r.placeId!,
        name: r.name,
        category: r.category,
        totalReviews: r._count.visitorReviews,
        analyzedReviews: analyzedMap.get(r.id) ?? 0,
        distinctMenus: distinct,
        mappedMenus: mapped,
        unmappedMenus: Math.max(0, distinct - mapped),
        lastGroupedAt: last?.at ? last.at.toISOString() : null,
        storedVersion: last?.version ?? null,
      };
    });

    // attentionCount 는 항상 전체 기준 — 필터/페이지와 무관하게 sticky bar
    // 표시가 안정적이어야 한다. UI 의 needsAttention 정의와 동일.
    const needsAttention = (r: MenuGroupingRestaurantStatusType): boolean =>
      r.unmappedMenus > 0 ||
      (r.storedVersion !== null && r.storedVersion < MENU_GROUPING_VERSION);
    const attentionCount = rows.filter(needsAttention).length;

    // 필터.
    let filtered = rows;
    const q = query.q?.trim().toLowerCase();
    if (q) filtered = filtered.filter((r) => r.name.toLowerCase().includes(q));
    if (query.attention) filtered = filtered.filter(needsAttention);

    // 정렬 — 동률은 항상 name asc 로 안정 정렬.
    const cmpName = (a: MenuGroupingRestaurantStatusType, b: MenuGroupingRestaurantStatusType) =>
      a.name.localeCompare(b.name);
    filtered.sort((a, b) => {
      switch (query.sort) {
        case 'analyzed':
          return b.analyzedReviews - a.analyzedReviews || cmpName(a, b);
        case 'name':
          return cmpName(a, b);
        case 'unmapped':
        default:
          return b.unmappedMenus - a.unmappedMenus || cmpName(a, b);
      }
    });

    const total = filtered.length;
    const offset = (query.page - 1) * query.pageSize;
    const items = filtered.slice(offset, offset + query.pageSize);

    return {
      items,
      total,
      totalRestaurants: rows.length,
      attentionCount,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  private async resolveProvider(): Promise<{ provider: LLMProvider; model: string } | null> {
    if (this.opts.resolveOverride) return this.opts.resolveOverride();
    const resolved = await this.aiConfig.getResolved('ollama-cloud', 'chat');
    if (!resolved) return null;
    const model = resolved.defaultModel?.trim();
    if (!model) return null;
    const provider = (this.opts.cache ?? adapterCache).get(resolved);
    return { provider, model };
  }
}

const sortRanking = (
  a: MenuRankingItemType,
  b: MenuRankingItemType,
  sort: MenuRankingQueryType['sort'],
): number => {
  switch (sort) {
    case 'positive':
      return b.positive - a.positive || b.mentionCount - a.mentionCount;
    case 'negative':
      return b.negative - a.negative || b.mentionCount - a.mentionCount;
    case 'positiveRatio': {
      // null (긍/부 모두 0) 은 마지막.
      const ar = a.positiveRatio;
      const br = b.positiveRatio;
      if (ar === null && br === null) return b.mentionCount - a.mentionCount;
      if (ar === null) return 1;
      if (br === null) return -1;
      return br - ar || b.mentionCount - a.mentionCount;
    }
    case 'mentions':
    default:
      return b.mentionCount - a.mentionCount;
  }
};

// 그룹 대표 = 저장될 canonicalName 선정 — 결정적: ① 최단 표기 ② 동률 시
// 멘션 빈도 최다 ③ 그래도 동률이면 사전순. 머지 라운드가 비교하는 "대표"
// 와 저장되는 canonical 이 같은 규칙이라, 머지에서 비교된 이름이 곧
// 최종 표시 이름이다. 테스트에서 직접 검증할 수 있게 export.
export const pickCanonicalName = (
  members: string[],
  countByVariant: Map<string, number>,
): string => {
  let best = members[0]!;
  for (let i = 1; i < members.length; i += 1) {
    const m = members[i]!;
    if (m.length < best.length) {
      best = m;
      continue;
    }
    if (m.length > best.length) continue;
    const cm = countByVariant.get(m) ?? 0;
    const cb = countByVariant.get(best) ?? 0;
    if (cm > cb || (cm === cb && m < best)) best = m;
  }
  return best;
};

