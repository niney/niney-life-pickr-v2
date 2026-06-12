import type { PrismaClient } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import type {
  AnalyticsOverviewType,
  CategoryTreeNodeType,
  GlobalMenuQueryType,
  GlobalMenuResultType,
  GlobalMenuStatType,
} from '@repo/api-contract';
import type { LLMProvider } from '../ai/adapters/llm-provider.js';
import type { AiConfigService } from '../ai/ai.config.service.js';
import { adapterCache, type AdapterCache } from '../ai/adapter-cache.js';
import { classifyError } from '../ai/ai.service.js';
import type {
  OperationLogInput,
  OperationLogService,
} from '../logs/operation-log.service.js';
import { extractFirstJsonObject, normalizeTerm } from '../summary/summary.service.js';
import { buildCategoryTree, type CategoryTreeLeaf } from './category-tree.js';
import {
  GLOBAL_MERGE_CHUNK_SIZE,
  GLOBAL_MERGE_SYSTEM_PROMPT,
  GLOBAL_MERGE_VERSION,
  buildGlobalMergePrompt,
} from './global-merge.prompts.js';

const TEMPERATURE = 0.1;
const MAX_TOKENS = 4000;
const NUM_CTX = 8192;

// 통계 read 결과 TTL 캐시 — 반복 페이지 진입 / 잦은 새로고침 시 raw 쿼리
// 부하 줄이기. 같은 키 동시 요청은 in-flight promise 공유로 dogpile 방어.
// 단일 인스턴스 + 단일 프로세스 가정 (CLAUDE.md "Redis 사용 금지").
// 머지/그룹핑 잡이 끝나면 invalidate (runGlobalMerge 안에서 clear).
class TtlCache<V> {
  private readonly store = new Map<string, { value: V; expiresAt: number }>();
  private readonly pending = new Map<string, Promise<V>>();
  constructor(private readonly ttlMs: number) {}

  async getOrCompute(key: string, compute: () => Promise<V>): Promise<V> {
    const entry = this.store.get(key);
    if (entry && entry.expiresAt >= Date.now()) return entry.value;
    if (entry) this.store.delete(key);

    const inFlight = this.pending.get(key);
    if (inFlight) return inFlight;

    const promise = compute()
      .then((value) => {
        this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
        return value;
      })
      .finally(() => {
        this.pending.delete(key);
      });
    this.pending.set(key, promise);
    return promise;
  }

  clear(): void {
    this.store.clear();
    // pending 은 그대로 — 진행 중 요청은 끝까지 가게 두고, 결과만 캐시 미저장.
    // (위 .then 에서 set 하지만, clear() 직후라도 stale 한 값이 한 번만 들어가고
    //  다음 호출은 다시 compute. 일관성보단 단순함.)
  }
}

const ANALYTICS_CACHE_TTL_MS = 60_000;

// LLM 출력 path 정규화 — 다양한 구분자(>, /, ›, →, |) 와 공백 변형을 표준
// " > " 로 통일. 최상위가 화이트리스트에 없으면 "기타" prepend. 빈 입력은 null.
// 화이트리스트 = 재료·메뉴군 최상위(음식 종류 아님). global-merge.prompts.ts 의
// [카테고리 path 규칙] 최상위 목록과 반드시 동기화 — 안 맞으면 LLM 의 정상
// 출력이 전부 "기타 > …" 로 떨어진다. 복합어는 가운뎃점(·) — '/' 는 구분자라
// "국/탕" 으로 쓰면 두 segment 로 쪼개진다.
const TOP_WHITELIST = new Set([
  '고기',
  '해산물',
  '밥',
  '면',
  '국·탕',
  '찌개·전골',
  '김치',
  '반찬',
  '튀김',
  '회·초밥',
  '분식',
  '디저트',
  '음료',
  '주류',
  '기타',
]);

export const normalizeCategoryPath = (raw: unknown): string | null => {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const segments = trimmed
    .split(/\s*[>/›→|]\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (segments.length === 0) return null;
  if (!TOP_WHITELIST.has(segments[0]!)) {
    segments.unshift('기타');
  }
  return segments.join(' > ');
};

export class AnalyticsError extends Error {
  constructor(
    public readonly code: 'no_provider' | 'no_inputs',
    message: string,
  ) {
    super(message);
    this.name = 'AnalyticsError';
  }
}

export interface AnalyticsServiceOptions {
  cache?: AdapterCache;
  resolveOverride?: () => Promise<{ provider: LLMProvider; model: string } | null>;
  logger?: FastifyBaseLogger;
  // 범용 작업 로그(OperationRun/스텝) 계측 — 미주입이면 계측 없이 머지 로직만
  // 수행한다 (단위 테스트 / 아직 배선 안 된 호출자 호환).
  operationLog?: OperationLogService | null;
}

// 머지 잡 진행 콜백. service 가 LLM 호출하면서 호출자(잡 러너)에게 chunk 단위
// 진행을 알린다 — SSE event 변환은 라우트 측 책임.
export interface GlobalMergeProgress {
  onChunk?: (info: {
    pass: number;
    chunkIndex: number;
    chunkTotal: number;
    mappedInChunk: number;
  }) => void;
}

export interface GlobalMergeResult {
  inputCount: number;
  finalGroupCount: number;
  totalChunks: number;
  doneChunks: number;
  model: string;
  version: number;
}

export class AnalyticsService {
  // 통계 read 캐시 — overview/getGlobalMenus/getCategoryTree 공용. 키:
  //   - 'overview'
  //   - `menus:${JSON.stringify(query)}`
  //   - 'tree'
  // 머지 잡 done 시 clear, 그 외엔 60s TTL.
  // unknown 캐스트는 동일 캐시로 세 종류 결과 보관하기 위함 — 키별 형이 다름.
  private readonly readCache = new TtlCache<unknown>(ANALYTICS_CACHE_TTL_MS);

  constructor(
    private readonly prisma: PrismaClient,
    private readonly aiConfig: AiConfigService,
    private readonly opts: AnalyticsServiceOptions = {},
  ) {}

  private get log(): FastifyBaseLogger | null {
    return this.opts.logger ?? null;
  }

  // 외부에서도 invalidate 가능 — menu-grouping 잡이 끝났을 때 호출자가 부를 수 있다.
  invalidateReadCache(): void {
    this.readCache.clear();
  }

  // 모든 MenuCanonical 그룹을 distinct canonicalName 으로 모아 두-패스 LLM
  // 머지 후 GlobalMenuCanonical + Link 에 저장. full=false 면 이미 링크된
  // 식당 그룹은 건드리지 않고 새로 추가된 것만 머지 대상에 추가.
  //
  // OperationRun 계측은 여기(서비스 내부)서 감싼다 — 호출자가 둘(어드민
  // 라우트=jobId 보유 / 스케줄러=parentRunId 전달)이라 호출자별 계측은 누락이
  // 생긴다. jobId/parentRunId 는 run 헤더용 메타일 뿐 머지 로직과 무관.
  async runGlobalMerge(
    opts: {
      full: boolean;
      parentRunId?: string | null;
      // 어드민 라우트 경로의 globalMergeJobRegistry 잡 ID — OperationRun.jobId
      // 로만 쓰인다 (스케줄 경로는 미전달 → null).
      jobId?: string | null;
    },
    progress: GlobalMergeProgress = {},
  ): Promise<GlobalMergeResult> {
    const oplog = this.opts.operationLog ?? null;
    if (!oplog) {
      return this.executeGlobalMerge(opts.full, progress, null);
    }
    const runId = await oplog.startRun({
      feature: 'global-merge',
      jobId: opts.jobId ?? null,
      parentRunId: opts.parentRunId ?? null,
      // jobId 있는 경로 = 어드민 수동 실행. 스케줄 경로의 트리거(cron/manual)는
      // 부모 run 쪽에 기록되므로 여기서 추측해 오기록하지 않는다.
      trigger: opts.jobId != null ? 'manual' : null,
      meta: { full: opts.full },
    });
    try {
      const result = await this.executeGlobalMerge(opts.full, progress, runId);
      // totalChunks=0 은 full=false 에서 신규(미링크) 입력이 없던 정상 스킵 —
      // failed 로 기록하면 cron 경로에 무의미한 실패 run 이 쌓인다.
      const skipped = result.totalChunks === 0;
      await oplog.finishRun(runId, {
        status: 'done',
        meta: {
          ...(skipped ? { skipped: 'no_new_inputs' } : {}),
          inputCount: result.inputCount,
          finalGroupCount: result.finalGroupCount,
          totalChunks: result.totalChunks,
          doneChunks: result.doneChunks,
          model: result.model,
          version: result.version,
        },
      });
      return result;
    } catch (e) {
      if (e instanceof AnalyticsError && e.code === 'no_inputs') {
        // 머지할 입력이 아직 없는 것은 cron 경로의 정상 상태 — run 은 done 으로
        // 마감하되 호출자 계약(AnalyticsError throw)은 그대로 유지한다.
        this.logStep(runId, {
          stage: 'load',
          level: 'info',
          message: '머지할 메뉴 그룹이 없어 종료',
        });
        await oplog.finishRun(runId, {
          status: 'done',
          meta: { skipped: 'no_inputs' },
        });
      } else if (e instanceof AnalyticsError) {
        // no_provider — 설정 부재. 자동분석 제외 errorCode 라 보고서가 따라붙지 않는다.
        this.logStep(runId, {
          stage: 'resolve_provider',
          level: 'error',
          message: e.message,
        });
        await oplog.finishRun(runId, {
          status: 'failed',
          errorCode: e.code,
          errorMessage: e.message,
        });
      } else {
        const message = e instanceof Error ? e.message : String(e);
        this.logStep(runId, { stage: 'merge', level: 'error', message });
        await oplog.finishRun(runId, {
          status: 'failed',
          errorCode: 'unknown',
          errorMessage: message,
        });
      }
      throw e;
    }
  }

  // 스텝 로그 헬퍼 — 계측 미주입(runId null)이면 무음. channel 기본 'none'
  // (global-merge 는 SSE 로그 채널이 없음 — 잡 진행은 registry 가 따로 publish).
  private logStep(
    runId: string | null,
    input: Omit<OperationLogInput, 'runId'>,
  ): void {
    if (runId === null) return;
    this.opts.operationLog?.log({ runId, ...input });
  }

  private async executeGlobalMerge(
    full: boolean,
    progress: GlobalMergeProgress,
    runId: string | null,
  ): Promise<GlobalMergeResult> {
    const resolved = await this.resolveProvider();
    if (!resolved) {
      throw new AnalyticsError('no_provider', 'LLM provider/model not configured');
    }
    const { provider, model } = resolved;

    // distinct (canonicalNorm, canonicalName) 중 가장 빈도 높은 표기를 input.
    const targets = await this.prisma.menuCanonical.findMany({
      select: {
        id: true,
        canonicalName: true,
        canonicalNorm: true,
        globalLink: { select: { id: true } },
      },
    });

    if (targets.length === 0) {
      throw new AnalyticsError('no_inputs', 'No menu canonicals to merge yet');
    }

    // canonicalNorm 별 가장 빈번한 canonicalName 선정 — 동률은 사전순 첫 표기.
    const nameByNorm = new Map<string, string>();
    const countByNorm = new Map<string, number>();
    for (const t of targets) {
      countByNorm.set(t.canonicalNorm, (countByNorm.get(t.canonicalNorm) ?? 0) + 1);
      const cur = nameByNorm.get(t.canonicalNorm);
      if (!cur || t.canonicalName < cur) nameByNorm.set(t.canonicalNorm, t.canonicalName);
    }

    const distinctNorms = [...nameByNorm.keys()];
    const inputVariants = distinctNorms.map((n) => nameByNorm.get(n)!);

    // full=false: 이미 모든 식당 그룹이 링크돼 있고 새로 추가된 것이 없으면 noop.
    if (!full) {
      const unlinked = targets.filter((t) => !t.globalLink);
      if (unlinked.length === 0) {
        this.logStep(runId, {
          stage: 'load',
          level: 'info',
          message: '신규(미링크) 메뉴 그룹 없음 — 머지 스킵',
          meta: { full, targetCount: targets.length },
        });
        return {
          inputCount: 0,
          finalGroupCount: 0,
          totalChunks: 0,
          doneChunks: 0,
          model,
          version: GLOBAL_MERGE_VERSION,
        };
      }
      // 효율: 미링크 그룹의 norm 만 입력에 포함. 단, 정확도 위해 이미 매핑된
      // 그룹의 displayName 도 chunk 의 컨텍스트로 같이 보낸다 — 모델이 새
      // 항목을 기존 글로벌 그룹에 묶을 수 있도록.
      // 단순화: 이번 단계는 "전체 재매핑 또는 신규만"의 두 모드 중 신규만은
      // 컨텍스트 join 없이 단순 chunking. 기존 매핑 유지가 목적이라면 full=true 권장.
    }

    // 진행 콜백과 스텝 로그를 같은 지점에서 — onChunk(레지스트리/SSE 변환은
    // 호출자 책임) 의미는 그대로 두고 영속 스텝 로그만 추가한다.
    const emitChunk: NonNullable<GlobalMergeProgress['onChunk']> = (info) => {
      progress.onChunk?.(info);
      this.logStep(runId, {
        stage: `pass${info.pass}`,
        level: 'info',
        message: `${info.pass}차 청크 ${info.chunkIndex + 1}/${info.chunkTotal} 완료 — 매핑 ${info.mappedInChunk}건`,
        meta: { ...info },
      });
    };

    // pass 1: chunk 별 매핑. v2 부터 응답이 { canonical, categoryPath } 객체.
    const chunks1 = chunk(inputVariants, GLOBAL_MERGE_CHUNK_SIZE);
    const variantToCanonical = new Map<string, string>();
    const variantToCategoryPath = new Map<string, string | null>();
    let totalChunks = chunks1.length;
    let doneChunks = 0;
    this.log?.info({ total: inputVariants.length, chunks: chunks1.length }, '[global-merge] pass1 start');
    this.logStep(runId, {
      stage: 'pass1',
      level: 'info',
      message: `1차 머지 시작 — 입력 ${inputVariants.length}개, 청크 ${chunks1.length}개`,
      meta: { full, total: inputVariants.length, chunks: chunks1.length },
    });

    for (let i = 0; i < chunks1.length; i += 1) {
      const ch = chunks1[i]!;
      const map = await this.callOneChunk(provider, model, ch, runId);
      let mapped = 0;
      for (const v of ch) {
        const entry = map[v];
        const canonical =
          entry && entry.canonical.trim().length > 0 ? entry.canonical.trim() : v;
        variantToCanonical.set(v, canonical);
        variantToCategoryPath.set(v, entry?.categoryPath ?? null);
        if (entry) mapped += 1;
      }
      doneChunks += 1;
      emitChunk({
        pass: 1,
        chunkIndex: i,
        chunkTotal: chunks1.length,
        mappedInChunk: mapped,
      });
    }

    // pass 2: pass1 결과의 distinct canonical 들 사이의 충돌 해소. pass2 가 새
    // categoryPath 를 주면 우선 적용, 안 주면 pass1 의 path 보존.
    const pass1Canonicals = [...new Set(variantToCanonical.values())];
    const variantToFinal = new Map<string, string>();
    const finalCategoryByCanonical = new Map<string, string | null>(); // pass2 결과
    const runPass2 = async (chunks2: string[][]): Promise<void> => {
      this.logStep(runId, {
        stage: 'pass2',
        level: 'info',
        message: `2차 머지 시작 — 후보 ${pass1Canonicals.length}개, 청크 ${chunks2.length}개`,
        meta: { total: pass1Canonicals.length, chunks: chunks2.length },
      });
      const pass2Map = new Map<string, string>();
      for (let i = 0; i < chunks2.length; i += 1) {
        const ch = chunks2[i]!;
        const map = await this.callOneChunk(provider, model, ch, runId);
        let mapped = 0;
        for (const v of ch) {
          const entry = map[v];
          const finalName =
            entry && entry.canonical.trim().length > 0 ? entry.canonical.trim() : v;
          pass2Map.set(v, finalName);
          if (entry?.categoryPath) {
            finalCategoryByCanonical.set(finalName, entry.categoryPath);
          }
          if (entry) mapped += 1;
        }
        doneChunks += 1;
        emitChunk({
          pass: 2,
          chunkIndex: i,
          chunkTotal: chunks2.length,
          mappedInChunk: mapped,
        });
      }
      for (const [variant, c1] of variantToCanonical) {
        variantToFinal.set(variant, pass2Map.get(c1) ?? c1);
      }
    };

    if (pass1Canonicals.length > GLOBAL_MERGE_CHUNK_SIZE) {
      const chunks2 = chunk(pass1Canonicals, GLOBAL_MERGE_CHUNK_SIZE);
      totalChunks += chunks2.length;
      this.log?.info({ pass1: pass1Canonicals.length, chunks: chunks2.length }, '[global-merge] pass2 start');
      await runPass2(chunks2);
    } else if (pass1Canonicals.length > 0) {
      totalChunks += 1;
      await runPass2([pass1Canonicals]);
    } else {
      // pass1 결과가 없으면 그대로.
      for (const [variant, c1] of variantToCanonical) {
        variantToFinal.set(variant, c1);
      }
    }

    // norm 별 → final displayName + globalKey + categoryPath 결정.
    // path 는 pass2 응답이 우선, 없으면 pass1 응답, 둘 다 없으면 null.
    // 같은 globalKey 에 대해 여러 norm 의 path 가 다를 수 있어 first non-null 채택.
    const finalByNorm = new Map<
      string,
      { displayName: string; globalKey: string; categoryPath: string | null }
    >();
    const pathByGlobalKey = new Map<string, string>();
    for (const [norm, name] of nameByNorm) {
      const finalName = variantToFinal.get(name) ?? name;
      const globalKey = normalizeTerm(finalName) || norm;
      // path 결정: pass2 우선 → pass1 fallback.
      const pass2Path = finalCategoryByCanonical.get(finalName);
      const pass1Path = variantToCategoryPath.get(name);
      const path = normalizeCategoryPath(pass2Path) ?? normalizeCategoryPath(pass1Path);
      // globalKey 단위로 first non-null path 보존 — 충돌 시 처음 본 값 유지.
      if (path && !pathByGlobalKey.has(globalKey)) {
        pathByGlobalKey.set(globalKey, path);
      }
      finalByNorm.set(norm, {
        displayName: finalName,
        globalKey,
        categoryPath: path,
      });
    }
    // 같은 globalKey 의 다른 norm 이 path null 이었던 경우 보강 — first non-null 이
    // 들어왔을 수 있다.
    for (const [norm, info] of finalByNorm) {
      if (info.categoryPath === null) {
        const fallback = pathByGlobalKey.get(info.globalKey) ?? null;
        if (fallback) finalByNorm.set(norm, { ...info, categoryPath: fallback });
      }
    }

    // DB 적용. full=true 면 기존 GlobalMenuCanonical / Link 모두 비우고 새로
    // 작성. full=false 도 같은 방식 — 모델 호출이 끝났으니 멱등성 유지가 단순.
    const now = new Date();
    const distinctGlobalKeys = new Set([...finalByNorm.values()].map((v) => v.globalKey));

    await this.prisma.$transaction(async (tx) => {
      // GlobalMenuCanonical upsert by globalKey.
      const keyToId = new Map<string, string>();
      // 기존 row 들의 id + categoryPath 미리 가져오기. path 는 비파괴 보존용.
      const existing = await tx.globalMenuCanonical.findMany({
        select: { id: true, globalKey: true, categoryPath: true },
      });
      const existingPathByKey = new Map<string, string | null>();
      for (const e of existing) {
        keyToId.set(e.globalKey, e.id);
        existingPathByKey.set(e.globalKey, e.categoryPath);
      }

      // 변경 요약 — full 이면 모든 row 갱신, 아니면 부족한 것만 추가.
      // 같은 globalKey 가 여러 norm 에서 나오면 첫 번째 path 가 채택되도록 dedup.
      const seenKeys = new Set<string>();
      for (const [, info] of finalByNorm) {
        if (seenKeys.has(info.globalKey)) continue;
        seenKeys.add(info.globalKey);
        if (keyToId.has(info.globalKey)) {
          // 이번 런이 path 를 못 주면(빈 응답/모델 누락) 기존 path 보존 —
          // 약한 런이 좋은 categoryPath 를 null 로 덮어쓰는 사고 방지.
          const nextPath =
            info.categoryPath ?? existingPathByKey.get(info.globalKey) ?? null;
          await tx.globalMenuCanonical.update({
            where: { id: keyToId.get(info.globalKey)! },
            data: {
              displayName: info.displayName,
              categoryPath: nextPath,
              version: GLOBAL_MERGE_VERSION,
              model,
              updatedAt: now,
            },
          });
        } else {
          const created = await tx.globalMenuCanonical.create({
            data: {
              globalKey: info.globalKey,
              displayName: info.displayName,
              categoryPath: info.categoryPath,
              version: GLOBAL_MERGE_VERSION,
              model,
            },
            select: { id: true },
          });
          keyToId.set(info.globalKey, created.id);
        }
      }

      // 사용 안 되는 globalKey row 삭제 (full 이면 distinct 이외 모두, 아니면
      // 같은 처리 — 멱등 유지).
      const usedKeys = new Set([...finalByNorm.values()].map((v) => v.globalKey));
      const toDelete = existing.filter((e) => !usedKeys.has(e.globalKey));
      if (toDelete.length > 0) {
        await tx.globalMenuCanonical.deleteMany({
          where: { id: { in: toDelete.map((e) => e.id) } },
        });
      }

      // Link 모두 비우고 다시 작성. menu_canonicals 가 onDelete: Cascade 라
      // 식당 삭제 시 자동 정리되므로 단순 reset 가능.
      await tx.globalMenuCanonicalLink.deleteMany({});
      const links: {
        menuCanonicalId: string;
        restaurantId: string;
        localCanonicalNorm: string;
        globalCanonicalId: string;
      }[] = [];
      // targets 에서 (id, restaurantId, canonicalNorm) 다시 가져와야 — Link
      // 행은 menuCanonicalId 가 있어야 한다. 위에서 select 안 된 컬럼이 있어
      // 다시 조회.
      const targetRows = await tx.menuCanonical.findMany({
        select: { id: true, restaurantId: true, canonicalNorm: true },
      });
      for (const r of targetRows) {
        const info = finalByNorm.get(r.canonicalNorm);
        if (!info) continue;
        const gid = keyToId.get(info.globalKey);
        if (!gid) continue;
        links.push({
          menuCanonicalId: r.id,
          restaurantId: r.restaurantId,
          localCanonicalNorm: r.canonicalNorm,
          globalCanonicalId: gid,
        });
      }
      if (links.length > 0) {
        await tx.globalMenuCanonicalLink.createMany({ data: links });
      }
    });

    // 머지가 끝나면 통계 read 캐시 모두 무효화 — overview/menus/tree 모두 변함.
    this.readCache.clear();

    this.logStep(runId, {
      stage: 'save',
      level: 'info',
      message: `저장 완료 — 글로벌 그룹 ${distinctGlobalKeys.size}개`,
      meta: {
        finalGroupCount: distinctGlobalKeys.size,
        inputCount: inputVariants.length,
        totalChunks,
        doneChunks,
      },
    });

    return {
      inputCount: inputVariants.length,
      finalGroupCount: distinctGlobalKeys.size,
      totalChunks,
      doneChunks,
      model,
      version: GLOBAL_MERGE_VERSION,
    };
  }

  // v2 응답 형태: { variant: { canonical, categoryPath } }.
  // v1 호환을 위해 string 값도 받아 { canonical: <string>, categoryPath: null } 로
  // 풀어쓴다 — 모델이 가끔 v1 형태로 떨어질 때 fallback.
  private parseMergeResponse(
    text: string,
  ): Record<string, { canonical: string; categoryPath: string | null }> {
    const candidate = extractFirstJsonObject(text);
    if (!candidate) return {};
    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate);
    } catch {
      return {};
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    const out: Record<string, { canonical: string; categoryPath: string | null }> = {};
    const add = (variant: unknown, canonical: unknown, categoryPath: unknown): void => {
      if (typeof variant !== 'string' || variant.length === 0) return;
      if (typeof canonical !== 'string' || canonical.length === 0) return;
      out[variant] = {
        canonical,
        categoryPath: typeof categoryPath === 'string' ? categoryPath : null,
      };
    };

    const mappings = (parsed as { mappings?: unknown }).mappings;
    if (Array.isArray(mappings)) {
      // 신규 형식: { mappings: [{ variant, canonical, categoryPath }] }.
      for (const m of mappings) {
        if (m && typeof m === 'object') {
          const o = m as { variant?: unknown; canonical?: unknown; categoryPath?: unknown };
          add(o.variant, o.canonical, o.categoryPath);
        }
      }
    } else {
      // 구형 호환: { variant: { canonical, categoryPath } } / { variant: "canonical" }.
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'string') add(k, v, null);
        else if (v && typeof v === 'object') {
          const o = v as { canonical?: unknown; categoryPath?: unknown };
          add(k, o.canonical, o.categoryPath);
        }
      }
    }
    return out;
  }

  private async callOneChunk(
    provider: LLMProvider,
    model: string,
    variants: string[],
    runId: string | null = null,
  ): Promise<Record<string, { canonical: string; categoryPath: string | null }>> {
    // structured-output `format`(grammar)을 쓰지 않는다. 이 provider/모델 조합
    // (ollama-cloud)에서 format 을 주면 응답이 통째로 비거나 categoryPath 가
    // 빠진 채로 와서, 그 청크의 메뉴가 식별 매핑으로 떨어진다(grouping·
    // categoryPath 동시 소실). probe:merge 로 확인 — format 없이 프롬프트만
    // 주면 { mappings: [...] } 가 path 까지 안정적으로 온다. 파서가 JSON 을
    // 견고하게 추출하므로 grammar 강제 없이도 파싱 실패율이 낮다.
    try {
      const res = await provider.complete({
        prompt: buildGlobalMergePrompt(variants),
        model,
        systemPrompt: GLOBAL_MERGE_SYSTEM_PROMPT,
        temperature: TEMPERATURE,
        maxTokens: MAX_TOKENS,
        numCtx: NUM_CTX,
      });
      return this.parseMergeResponse(res.text);
    } catch (e) {
      const { error, message } = classifyError(e);
      this.log?.warn(
        { error, message: message.slice(0, 200) },
        '[global-merge] chunk failed — falling back to identity',
      );
      // run 전체는 계속 진행(식별 매핑 폴백)이지만, 어떤 청크가 왜 죽었는지는
      // 영속 로그에 남겨야 사후 분석이 가능하다 — 실패가 흡수돼 done 으로
      // 끝나는 run 에서 유일한 단서.
      this.logStep(runId, {
        stage: 'merge_chunk',
        level: 'warn',
        message: `청크 LLM 호출 실패 — 식별 매핑으로 폴백: ${message.slice(0, 200)}`,
        meta: { error, size: variants.length },
      });
      return {};
    }
  }

  // ── 통계 조회 ──────────────────────────────────────────────────────

  async getOverview(): Promise<AnalyticsOverviewType> {
    return this.readCache.getOrCompute('overview', () =>
      this.computeOverview(),
    ) as Promise<AnalyticsOverviewType>;
  }

  private async computeOverview(): Promise<AnalyticsOverviewType> {
    const [
      restaurantCount,
      analyzedReviewCount,
      totalMentionCount,
      perRestaurantGroupCount,
      globalLinkedCount,
      globalGroupCount,
      lastGlobal,
    ] = await Promise.all([
      this.prisma.restaurant.count(),
      this.prisma.reviewSummary.count({ where: { status: 'done' } }),
      this.prisma.menuMention.count(),
      this.prisma.menuCanonical.count(),
      this.prisma.globalMenuCanonicalLink.count(),
      this.prisma.globalMenuCanonical.count(),
      this.prisma.globalMenuCanonical.aggregate({ _max: { updatedAt: true } }),
    ]);

    const globalLinkedRatio =
      perRestaurantGroupCount === 0 ? null : globalLinkedCount / perRestaurantGroupCount;

    return {
      restaurantCount,
      analyzedReviewCount,
      totalMentionCount,
      perRestaurantGroupCount,
      globalLinkedCount,
      globalGroupCount,
      globalLinkedRatio,
      lastGlobalMergeAt: lastGlobal._max.updatedAt
        ? lastGlobal._max.updatedAt.toISOString()
        : null,
      globalVersion: GLOBAL_MERGE_VERSION,
    };
  }

  async getGlobalMenus(query: GlobalMenuQueryType): Promise<GlobalMenuResultType> {
    // 키는 query 직렬화 — 정렬/필터 조합마다 별개 캐시.
    return this.readCache.getOrCompute(
      `menus:${JSON.stringify(query)}`,
      () => this.computeGlobalMenus(query),
    ) as Promise<GlobalMenuResultType>;
  }

  private async computeGlobalMenus(query: GlobalMenuQueryType): Promise<GlobalMenuResultType> {
    // 매핑된 항목과 (옵션) 매핑 안 된 항목 두 갈래 처리.
    const linked = await this.prisma.globalMenuCanonical.findMany({
      include: {
        links: {
          include: {
            menuCanonical: {
              select: {
                restaurantId: true,
                canonicalNorm: true,
                restaurant: { select: { placeId: true, name: true } },
              },
            },
          },
        },
      },
    });

    // 식당별 (restaurantId, canonicalNorm) → 멘션 통계 미리 계산.
    // MenuMention.nameNorm 이 MenuCanonical 의 nameNorm 과 매칭되므로 join.
    // GROUP BY (restaurantId, canonicalNorm) — but canonicalNorm 은 mention 에
    // 직접 없으므로 menuCanonical 을 join 해서 계산.
    const mentionStats = await this.prisma.$queryRaw<
      Array<{
        restaurantId: string;
        canonicalNorm: string;
        sentiment: string;
        cnt: number | bigint;
      }>
    >`SELECT mc.restaurantId AS restaurantId,
             mc.canonicalNorm AS canonicalNorm,
             mm.sentiment AS sentiment,
             COUNT(*) AS cnt
        FROM menu_mentions mm
        JOIN menu_canonicals mc
          ON mc.restaurantId = mm.restaurantId
         AND mc.nameNorm = mm.nameNorm
        GROUP BY mc.restaurantId, mc.canonicalNorm, mm.sentiment`;

    // (restaurantId, canonicalNorm) → { positive, negative, neutral, total }
    const statByLocal = new Map<
      string,
      { positive: number; negative: number; neutral: number; total: number }
    >();
    for (const r of mentionStats) {
      const key = `${r.restaurantId}::${r.canonicalNorm}`;
      const cur = statByLocal.get(key) ?? { positive: 0, negative: 0, neutral: 0, total: 0 };
      const cnt = Number(r.cnt);
      cur.total += cnt;
      if (r.sentiment === 'positive') cur.positive += cnt;
      else if (r.sentiment === 'negative') cur.negative += cnt;
      else cur.neutral += cnt;
      statByLocal.set(key, cur);
    }

    interface RestaurantContrib {
      placeId: string;
      name: string;
      mentionCount: number;
      positive: number;
      negative: number;
    }
    const items: GlobalMenuStatType[] = [];

    for (const g of linked) {
      let total = 0;
      let positive = 0;
      let negative = 0;
      let neutral = 0;
      // 한 글로벌 메뉴에 동일 식당의 여러 MenuCanonical 이 링크될 수 있으므로
      // (예: "김치찌개" + "묵은지김치찌개" → 글로벌 "김치찌개") placeId 단위로
      // 합산. 합산 없이 push 하면 React key 중복 + restaurantCount 부풀어짐.
      const byPlace = new Map<string, RestaurantContrib>();
      for (const link of g.links) {
        const mc = link.menuCanonical;
        const stat =
          statByLocal.get(`${link.restaurantId}::${mc.canonicalNorm}`) ?? {
            positive: 0,
            negative: 0,
            neutral: 0,
            total: 0,
          };
        total += stat.total;
        positive += stat.positive;
        negative += stat.negative;
        neutral += stat.neutral;
        if (stat.total > 0) {
          // 다이닝코드 행은 placeId 가 null — 1차 스코프상 어드민 analytics 는 네이버
          // 전용. 스키마 응답은 placeId: z.string() 이라 그대로 두면 직렬화 실패.
          const placeId = mc.restaurant.placeId;
          if (placeId === null) continue;
          const cur = byPlace.get(placeId);
          if (cur) {
            cur.mentionCount += stat.total;
            cur.positive += stat.positive;
            cur.negative += stat.negative;
          } else {
            byPlace.set(placeId, {
              placeId,
              name: mc.restaurant.name,
              mentionCount: stat.total,
              positive: stat.positive,
              negative: stat.negative,
            });
          }
        }
      }
      const restaurants = [...byPlace.values()];
      const topRestaurants = restaurants
        .sort((a, b) => b.mentionCount - a.mentionCount)
        .slice(0, 3)
        .map((r) => {
          const denom = r.positive + r.negative;
          return {
            placeId: r.placeId,
            name: r.name,
            mentionCount: r.mentionCount,
            positive: r.positive,
            negative: r.negative,
            positiveRatio: denom === 0 ? null : r.positive / denom,
          };
        });
      const denom = positive + negative;
      items.push({
        globalKey: g.globalKey,
        displayName: g.displayName,
        categoryPath: g.categoryPath,
        totalMentions: total,
        restaurantCount: restaurants.length,
        positive,
        negative,
        neutral,
        positiveRatio: denom === 0 ? null : positive / denom,
        topRestaurants,
      });
    }

    if (query.includeUnlinked) {
      // 링크 없는 식당 그룹들 — 자기 자신을 globalKey 로 fallback.
      const unlinkedTargets = await this.prisma.menuCanonical.findMany({
        where: { globalLink: null },
        select: {
          canonicalNorm: true,
          canonicalName: true,
          restaurantId: true,
          restaurant: { select: { placeId: true, name: true } },
        },
      });
      // linked 분기와 동일하게 placeId 단위 합산이 필요. unlinked 그룹 안에서도
       // 같은 placeId 가 여러 MenuCanonical 행으로 들어올 수 있음(데이터상 PK 보장
       // 부재 또는 동일 식당의 canonicalNorm 중복) → key 중복 회피 + 부풀린
       // restaurantCount 방지.
      const byKey = new Map<
        string,
        {
          displayName: string;
          total: number;
          positive: number;
          negative: number;
          neutral: number;
          byPlace: Map<string, RestaurantContrib>;
        }
      >();
      for (const t of unlinkedTargets) {
        const key = `unlinked:${t.canonicalNorm}`;
        const stat = statByLocal.get(`${t.restaurantId}::${t.canonicalNorm}`) ?? {
          positive: 0,
          negative: 0,
          neutral: 0,
          total: 0,
        };
        const cur = byKey.get(key) ?? {
          displayName: t.canonicalName,
          total: 0,
          positive: 0,
          negative: 0,
          neutral: 0,
          byPlace: new Map<string, RestaurantContrib>(),
        };
        cur.total += stat.total;
        cur.positive += stat.positive;
        cur.negative += stat.negative;
        cur.neutral += stat.neutral;
        if (stat.total > 0) {
          // 다이닝코드 행은 placeId 가 null — analytics 는 네이버 전용 스코프.
          const placeId = t.restaurant.placeId;
          if (placeId === null) continue;
          const existing = cur.byPlace.get(placeId);
          if (existing) {
            existing.mentionCount += stat.total;
            existing.positive += stat.positive;
            existing.negative += stat.negative;
          } else {
            cur.byPlace.set(placeId, {
              placeId,
              name: t.restaurant.name,
              mentionCount: stat.total,
              positive: stat.positive,
              negative: stat.negative,
            });
          }
        }
        byKey.set(key, cur);
      }
      for (const [key, b] of byKey) {
        const restaurants = [...b.byPlace.values()];
        const denom = b.positive + b.negative;
        const topRestaurants = restaurants
          .sort((a, b2) => b2.mentionCount - a.mentionCount)
          .slice(0, 3)
          .map((r) => {
            const d = r.positive + r.negative;
            return {
              placeId: r.placeId,
              name: r.name,
              mentionCount: r.mentionCount,
              positive: r.positive,
              negative: r.negative,
              positiveRatio: d === 0 ? null : r.positive / d,
            };
          });
        items.push({
          globalKey: key,
          displayName: b.displayName,
          categoryPath: null,
          totalMentions: b.total,
          restaurantCount: restaurants.length,
          positive: b.positive,
          negative: b.negative,
          neutral: b.neutral,
          positiveRatio: denom === 0 ? null : b.positive / denom,
          topRestaurants,
        });
      }
    }

    // 검색 + 필터.
    let filtered = items.filter((i) => i.totalMentions >= query.minMentions);
    if (query.q) {
      const q = query.q.trim().toLowerCase();
      filtered = filtered.filter(
        (i) =>
          i.displayName.toLowerCase().includes(q) ||
          i.globalKey.toLowerCase().includes(q),
      );
    }
    // 카테고리 prefix 필터 — "한식" → "한식 > %" 모두, "한식 > 찌개" → 그 prefix.
    if (query.category) {
      const cat = query.category.trim();
      filtered = filtered.filter((i) => {
        if (i.categoryPath === null) return false;
        return i.categoryPath === cat || i.categoryPath.startsWith(`${cat} > `);
      });
    }

    filtered.sort((a, b) => sortGlobal(a, b, query.sort));

    // 페이지네이션 — 정렬 후 슬라이스. total 은 슬라이스 전 길이(필터 적용 후).
    const total = filtered.length;
    const offset = (query.page - 1) * query.pageSize;
    const pageItems = filtered.slice(offset, offset + query.pageSize);

    const linkedTotal = await this.prisma.menuCanonical.count();
    const linkedRatio = linkedTotal === 0 ? null : linked.reduce((sum, g) => sum + g.links.length, 0) / linkedTotal;

    return {
      totalGroups: linked.length,
      linkedRestaurantCount: new Set(
        linked.flatMap((g) => g.links.map((l) => l.restaurantId)),
      ).size,
      linkedRatio,
      currentVersion: GLOBAL_MERGE_VERSION,
      items: pageItems,
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  // 카테고리별 누적 통계 트리. categoryPath 가 채워진 글로벌 메뉴만 대상.
  // path segment 별로 트리를 만들어 leaf 의 멘션 통계를 부모로 누적 합산.
  async getCategoryTree(): Promise<CategoryTreeNodeType[]> {
    return this.readCache.getOrCompute('tree', () =>
      this.computeCategoryTree(),
    ) as Promise<CategoryTreeNodeType[]>;
  }

  private async computeCategoryTree(): Promise<CategoryTreeNodeType[]> {
    const linked = await this.prisma.globalMenuCanonical.findMany({
      where: { categoryPath: { not: null } },
      select: { id: true, categoryPath: true, links: { select: { menuCanonical: { select: { restaurantId: true, canonicalNorm: true } } } } },
    });
    if (linked.length === 0) return [];

    // 한 번에 모든 링크 식당의 멘션 통계 — getGlobalMenus 와 같은 raw 쿼리 재사용.
    const mentionStats = await this.prisma.$queryRaw<
      Array<{
        restaurantId: string;
        canonicalNorm: string;
        sentiment: string;
        cnt: number | bigint;
      }>
    >`SELECT mc.restaurantId AS restaurantId,
             mc.canonicalNorm AS canonicalNorm,
             mm.sentiment AS sentiment,
             COUNT(*) AS cnt
        FROM menu_mentions mm
        JOIN menu_canonicals mc
          ON mc.restaurantId = mm.restaurantId
         AND mc.nameNorm = mm.nameNorm
        GROUP BY mc.restaurantId, mc.canonicalNorm, mm.sentiment`;
    const statByLocal = new Map<
      string,
      { positive: number; negative: number; total: number }
    >();
    for (const r of mentionStats) {
      const key = `${r.restaurantId}::${r.canonicalNorm}`;
      const cur = statByLocal.get(key) ?? { positive: 0, negative: 0, total: 0 };
      const cnt = Number(r.cnt);
      cur.total += cnt;
      if (r.sentiment === 'positive') cur.positive += cnt;
      else if (r.sentiment === 'negative') cur.negative += cnt;
      statByLocal.set(key, cur);
    }

    // categoryPath 별 멘션 통계를 잎으로 모아 트리 빌더에 넘긴다.
    const leaves: CategoryTreeLeaf[] = [];
    for (const g of linked) {
      let total = 0;
      let positive = 0;
      let negative = 0;
      for (const link of g.links) {
        const stat = statByLocal.get(
          `${link.menuCanonical.restaurantId}::${link.menuCanonical.canonicalNorm}`,
        );
        if (!stat) continue;
        total += stat.total;
        positive += stat.positive;
        negative += stat.negative;
      }
      if (total === 0) continue;
      leaves.push({ categoryPath: g.categoryPath!, total, positive, negative });
    }

    return buildCategoryTree(leaves);
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

const sortGlobal = (
  a: GlobalMenuStatType,
  b: GlobalMenuStatType,
  sort: GlobalMenuQueryType['sort'],
): number => {
  switch (sort) {
    case 'positive':
      return b.positive - a.positive || b.totalMentions - a.totalMentions;
    case 'positiveRatio': {
      const ar = a.positiveRatio;
      const br = b.positiveRatio;
      if (ar === null && br === null) return b.totalMentions - a.totalMentions;
      if (ar === null) return 1;
      if (br === null) return -1;
      return br - ar || b.totalMentions - a.totalMentions;
    }
    case 'restaurants':
      return b.restaurantCount - a.restaurantCount || b.totalMentions - a.totalMentions;
    case 'mentions':
    default:
      return b.totalMentions - a.totalMentions;
  }
};

const chunk = <T>(arr: T[], n: number): T[][] => {
  if (n <= 0) return [arr];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};
