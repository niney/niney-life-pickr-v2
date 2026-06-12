import type { FastifyBaseLogger } from 'fastify';
import type {
  AutoDiscoverCandidateType,
  AutoDiscoverJobInputType,
  AutoDiscoverJobSnapshotType,
  AutoDiscoverJobStateType,
  AutoDiscoverKeywordType,
  OperationLogLevelType,
} from '@repo/api-contract';
import type { LLMProvider } from '../ai/adapters/llm-provider.js';
import type { AiConfigService } from '../ai/ai.config.service.js';
import { adapterCache, type AdapterCache } from '../ai/adapter-cache.js';
import type { OperationLogService } from '../logs/operation-log.service.js';
import {
  searchPlacesViaMapNaver,
  type NaverSearchResult,
} from '../crawl/adapters/naver-search.http.adapter.js';
import { jobRegistry as defaultCrawlRegistry } from '../crawl/job-registry.js';
import type { JobRegistry } from '../crawl/job-registry.js';
import type { CrawlService } from '../crawl/crawl.service.js';
import type { RestaurantService } from '../restaurant/restaurant.service.js';
import { extractFirstJsonObject } from '../summary/summary.service.js';
import {
  AUTO_DISCOVER_JSON_SCHEMA,
  AUTO_DISCOVER_KEYWORD_COUNT,
  AUTO_DISCOVER_SYSTEM_PROMPT,
  buildAutoDiscoverUserPrompt,
  buildFallbackKeywords,
} from './auto-discover.prompts.js';
import { autoDiscoverRegistry, type AutoDiscoverRegistry } from './auto-discover-registry.js';

const AI_TEMPERATURE = 0.7;
const AI_MAX_TOKENS = 800;
const AI_NUM_CTX = 4096;

// 한 그룹에서 동시 진행할 크롤 수. 1 — 레스토랑 간 병렬 요청이 네이버 블록을
// 유발할 수 있어 큐처럼 한 곳씩 순차 처리 (레스토랑 1건 내부 병렬은 유지).
const GROUP_SIZE = 1;

export interface AutoDiscoverServiceDeps {
  restaurants: RestaurantService;
  aiConfig: AiConfigService;
  crawl: CrawlService;
  registry?: AutoDiscoverRegistry;
  crawlRegistry?: JobRegistry;
  adapterCache?: AdapterCache;
  logger?: FastifyBaseLogger;
  // 작업 로그(OperationRun) 계측 — 미주입(단위 테스트 등) 시 계측만 생략되고
  // 비즈니스 흐름은 동일하게 동작한다.
  operationLog?: OperationLogService | null;
  // 테스트용 — AI 강제 결과/실패 주입.
  resolveProviderOverride?: () => Promise<{ provider: LLMProvider; model: string } | null>;
  // 검색 어댑터 주입 (테스트에서 fake 검색 결과 주입).
  searchOverride?: (keyword: string) => Promise<NaverSearchResult[]>;
}

// 자동 발견 잡을 백그라운드에서 실행. 라우트는 잡 생성 직후 이 메소드를
// fire-and-forget 으로 호출하고 즉시 snapshot 응답.
export class AutoDiscoverService {
  private readonly registry: AutoDiscoverRegistry;
  private readonly crawlRegistry: JobRegistry;
  private readonly cache: AdapterCache;

  constructor(private readonly deps: AutoDiscoverServiceDeps) {
    this.registry = deps.registry ?? autoDiscoverRegistry;
    this.crawlRegistry = deps.crawlRegistry ?? defaultCrawlRegistry;
    this.cache = deps.adapterCache ?? adapterCache;
  }

  // 잡 실행 — 라우트가 잡 생성 직후 호출. await 하지 말 것 (백그라운드 의도).
  async runAutoDiscover(jobId: string, actorId: string): Promise<void> {
    const snapshot = this.registry.get(jobId, actorId);
    if (!snapshot) return;
    const abortSignal = this.registry.abortSignal(jobId);
    if (!abortSignal) return;

    // 작업 로그 run — 어드민 수동 시작만 존재하므로 trigger='manual'.
    // awaiting_confirmation 무기한 대기 동안 run 이 장기 'running' 으로 남는
    // 것은 정상이고, 재시작 고아는 부팅 sweep(server_restart) 이 마감한다.
    const runId = this.deps.operationLog
      ? await this.deps.operationLog.startRun({
          feature: 'auto-discover',
          jobId,
          trigger: 'manual',
          meta: {
            q: snapshot.input.q,
            categories: snapshot.input.categories,
            targetCount: snapshot.input.targetCount,
          },
        })
      : null;
    this.step(
      runId,
      'queued',
      'info',
      `자동 발견 시작 — "${snapshot.input.q}" (목표 ${snapshot.input.targetCount}건)`,
    );

    this.registry.markRunning(jobId);
    // finishRun 매핑용 — catch 한 곳에서만 채워진다.
    let crashed: unknown = null;
    try {
      // ── Phase 1: AI 키워드 생성 ──────────────────────────────────────────
      this.registry.setPhase(jobId, 'generating_keywords');
      this.step(runId, 'generating_keywords', 'info', 'AI 키워드 생성 시작');
      const keywords = await this.generateKeywords(runId, snapshot.input);
      if (abortSignal.aborted) {
        this.registry.markFinished(jobId, 'cancelled');
        return;
      }
      this.step(
        runId,
        'generating_keywords',
        'info',
        `키워드 ${keywords.length}개 확보`,
        { keywords },
      );

      // 모든 키워드를 pending 으로 publish — UI 가 8 칸 즉시 채움.
      for (const kw of keywords) {
        this.registry.upsertKeyword(jobId, {
          keyword: kw,
          state: 'pending',
          hitCount: null,
          searchedAt: null,
          errorMessage: null,
        });
      }

      // ── Phase 2: 키워드별 검색 + dedupe ──────────────────────────────────
      this.registry.setPhase(jobId, 'searching');
      this.step(runId, 'searching', 'info', `키워드 ${keywords.length}개 검색 시작`);
      const searchResults = await Promise.all(
        keywords.map(async (kw) => {
          this.registry.upsertKeyword(jobId, {
            keyword: kw,
            state: 'searching',
            hitCount: null,
            searchedAt: null,
            errorMessage: null,
          });
          try {
            const items = await this.search(kw, abortSignal);
            this.registry.upsertKeyword(jobId, {
              keyword: kw,
              state: 'done',
              hitCount: items.length,
              searchedAt: new Date().toISOString(),
              errorMessage: null,
            });
            this.step(
              runId,
              'searching',
              'debug',
              `키워드 검색 완료 — "${kw}" ${items.length}건`,
              { keyword: kw, hitCount: items.length },
            );
            return { keyword: kw, items };
          } catch (e) {
            this.registry.upsertKeyword(jobId, {
              keyword: kw,
              state: 'failed',
              hitCount: 0,
              searchedAt: new Date().toISOString(),
              errorMessage: e instanceof Error ? e.message : String(e),
            });
            // 키워드 한 개의 검색 실패는 잡 실패가 아니다 — 나머지 키워드로 진행.
            this.step(runId, 'searching', 'warn', `키워드 검색 실패 — "${kw}"`, {
              keyword: kw,
              error: e instanceof Error ? e.message : String(e),
            });
            return { keyword: kw, items: [] };
          }
        }),
      );
      if (abortSignal.aborted) {
        this.registry.markFinished(jobId, 'cancelled');
        return;
      }

      // dedupe — placeId 첫 등장만 보존, sourceKeyword 도 그 첫 등장 키워드.
      const deduped = new Map<
        string,
        { item: NaverSearchResult; sourceKeyword: string }
      >();
      for (const { keyword, items } of searchResults) {
        for (const it of items) {
          if (!deduped.has(it.placeId)) {
            deduped.set(it.placeId, { item: it, sourceKeyword: keyword });
          }
        }
      }
      const totalHits = searchResults.reduce((n, r) => n + r.items.length, 0);
      this.step(
        runId,
        'searching',
        'info',
        `검색 결과 ${totalHits}건 → 중복 제거 후 ${deduped.size}건`,
        { totalHits, deduped: deduped.size },
      );
      if (deduped.size === 0) {
        // 후보 0건 — 잡은 done 으로 닫는다 (failed 아님, 검색은 정상 동작).
        this.step(runId, 'searching', 'info', '검색 후보 0건 — 등록 대상 없이 종료');
        this.registry.markFinished(jobId, 'done');
        return;
      }

      // 이미 등록된 placeId 분리.
      const allIds = [...deduped.keys()];
      const registered = await this.deps.restaurants.findRegisteredByPlaceIds(allIds);

      // 사전 제외(skipped) 후보 publish.
      for (const id of allIds) {
        if (!registered.has(id)) continue;
        const entry = deduped.get(id)!;
        this.registry.upsertCandidate(jobId, {
          placeId: id,
          name: entry.item.name,
          category: entry.item.category,
          roadAddress: entry.item.roadAddress,
          lat: entry.item.lat,
          lng: entry.item.lng,
          sourceKeyword: entry.sourceKeyword,
          groupIndex: -1,
          state: 'skipped',
          skipReason: 'already_registered',
          restaurantId: null,
          errorMessage: null,
          startedAt: null,
          finishedAt: new Date().toISOString(),
        });
      }

      // 진짜 처리 대상.
      const targets: Array<{
        item: NaverSearchResult;
        sourceKeyword: string;
        groupIndex: number;
      }> = [];
      let idx = 0;
      for (const id of allIds) {
        if (registered.has(id)) continue;
        const entry = deduped.get(id)!;
        targets.push({
          item: entry.item,
          sourceKeyword: entry.sourceKeyword,
          groupIndex: Math.floor(idx / GROUP_SIZE),
        });
        idx += 1;
      }

      // 모든 대상 후보를 pending 으로 미리 publish — UI 가 그룹 그리드 즉시 채움.
      for (const t of targets) {
        this.registry.upsertCandidate(jobId, {
          placeId: t.item.placeId,
          name: t.item.name,
          category: t.item.category,
          roadAddress: t.item.roadAddress,
          lat: t.item.lat,
          lng: t.item.lng,
          sourceKeyword: t.sourceKeyword,
          groupIndex: t.groupIndex,
          state: 'pending',
          skipReason: null,
          restaurantId: null,
          errorMessage: null,
          startedAt: null,
          finishedAt: null,
        });
      }

      this.step(
        runId,
        'searching',
        'info',
        `후보 ${deduped.size}건 중 기등록 ${registered.size}건 제외 — 처리 대상 ${targets.length}건`,
        {
          deduped: deduped.size,
          alreadyRegistered: registered.size,
          targets: targets.length,
        },
      );

      if (targets.length === 0) {
        // 전부 기등록 — 정상 종료 (failed 아님).
        this.step(runId, 'searching', 'info', '신규 처리 대상 0건 — 종료');
        this.registry.markFinished(jobId, 'done');
        return;
      }

      // ── Phase 2.5: 등록 리스트 확인 대기 ─────────────────────────────────
      // 후보 큐가 UI 에 다 깔린 상태에서 멈추고, 사용자의 "등록 시작"(confirm)
      // 또는 취소(abort) 까지 대기.
      this.registry.setPhase(jobId, 'awaiting_confirmation');
      this.step(
        runId,
        'awaiting_confirmation',
        'info',
        `후보 ${targets.length}건 — 등록 시작 확인 대기`,
      );
      await this.registry.waitForConfirmation(jobId);
      // abort 였다면 아래 그룹 루프는 시작 전에 빠지고(startedGroups=0), 잔여
      // 후보 전부 skipped(cancelled) 마킹 후 cancelled 로 종료된다.
      this.step(
        runId,
        'awaiting_confirmation',
        'info',
        abortSignal.aborted ? '취소로 확인 대기 해제' : '등록 시작 확인됨',
      );

      // ── Phase 3: 후보 큐 — 한 곳씩 순차 크롤 (GROUP_SIZE=1) ─────────────
      this.registry.setPhase(jobId, 'crawling');
      this.step(
        runId,
        'crawling',
        'info',
        `등록 시작 — 후보 ${targets.length}건, 목표 ${snapshot.input.targetCount}건`,
      );
      const groups: Array<typeof targets> = [];
      for (let i = 0; i < targets.length; i += GROUP_SIZE) {
        groups.push(targets.slice(i, i + GROUP_SIZE));
      }

      const targetCount = snapshot.input.targetCount;
      // 실제로 시작된 그룹 수 — abort/target 도달 시점 이후 그룹은 시작 자체를
      // 안 하므로 잔여 skipped 마킹의 시작 인덱스로 사용.
      let startedGroups = 0;
      for (const group of groups) {
        // 그룹 시작 직전 abort/target 체크.
        if (abortSignal.aborted) break;
        if (this.registry.getNewlyRegistered(jobId) >= targetCount) break;
        startedGroups += 1;

        const groupJobIds: Array<{ placeId: string; jobId: string | null }> = [];
        await Promise.all(
          group.map(async (t) => {
            const result = await this.runOneCrawl(runId, jobId, actorId, t);
            groupJobIds.push({
              placeId: t.item.placeId,
              jobId: result.crawlJobId,
            });
          }),
        );
        // 그룹 끝난 직후 abort 가 늦게 들어왔다면 진행 중 Naver 잡들에 cancel
        // 전파 — 다음 그룹 진입은 위 체크가 차단한다.
        if (abortSignal.aborted) {
          for (const g of groupJobIds) {
            if (g.jobId) this.deps.crawl.cancel(g.jobId, actorId);
          }
        }
        // phase 이벤트 — newlyRegistered 갱신 노출.
        this.registry.setPhase(jobId, 'crawling');
      }

      // 잔여 후보 — abort 또는 target 도달로 안 돌아간 것들.
      const wasCancelled = abortSignal.aborted;
      const wasTargetReached =
        !wasCancelled &&
        this.registry.getNewlyRegistered(jobId) >= targetCount;
      if (wasCancelled || wasTargetReached) {
        const reason = wasCancelled ? 'cancelled' : 'target_reached';
        const skippedCount = Math.max(
          0,
          targets.length - startedGroups * GROUP_SIZE,
        );
        this.step(
          runId,
          'crawling',
          'info',
          `잔여 후보 ${skippedCount}건 스킵 — ${wasCancelled ? '취소' : '목표 도달'}`,
          { reason, skipped: skippedCount },
        );
        // 시작된 그룹 이후의 후보들은 모두 pending 상태 — 그것만 skipped 로
        // 마킹. 시작된 그룹 안의 후보는 done/failed/running 으로 이미 종결되어
        // 있다.
        for (let i = startedGroups * GROUP_SIZE; i < targets.length; i += 1) {
          const t = targets[i];
          if (!t) continue;
          this.registry.upsertCandidate(jobId, {
            placeId: t.item.placeId,
            name: t.item.name,
            category: t.item.category,
            roadAddress: t.item.roadAddress,
            lat: t.item.lat,
            lng: t.item.lng,
            sourceKeyword: t.sourceKeyword,
            groupIndex: t.groupIndex,
            state: 'skipped',
            skipReason: reason,
            restaurantId: null,
            errorMessage: null,
            startedAt: null,
            finishedAt: new Date().toISOString(),
          });
        }
      }

      this.registry.markFinished(jobId, wasCancelled ? 'cancelled' : 'done');
    } catch (e) {
      crashed = e;
      this.deps.logger?.error(
        { err: e, jobId },
        '[auto-discover] runner crashed',
      );
      this.registry.markFinished(jobId, 'failed');
    } finally {
      // finishRun 은 이 경계 한 곳에서만 — markFinished 6개 지점마다 훅을 두면
      // 종료 경로가 분산되어 누락/이중 종료가 생긴다. registry 의 최종 상태를
      // run 상태로 매핑한다.
      await this.finishOperationRun(runId, jobId, actorId, crashed);
    }
  }

  // registry 최종 상태 → OperationRun 상태 매핑 (runAutoDiscover 종료 경계 전용).
  //   done → done (후보 집계 meta), cancelled → cancelled(분석 제외),
  //   failed/그 외 → failed + 크래시 메시지 (자동 분석 대상).
  private async finishOperationRun(
    runId: string | null,
    jobId: string,
    actorId: string,
    crashed: unknown,
  ): Promise<void> {
    if (!runId || !this.deps.operationLog) return;
    const snap = this.registry.get(jobId, actorId);
    const meta = this.candidateSummary(snap);
    if (snap?.state === 'done') {
      await this.deps.operationLog.finishRun(runId, { status: 'done', meta });
      return;
    }
    if (snap?.state === 'cancelled') {
      await this.deps.operationLog.finishRun(runId, {
        status: 'cancelled',
        errorCode: 'cancelled',
        meta,
      });
      return;
    }
    // failed — 종결 안 된 상태(이론상 없음)도 run 을 영원히 running 으로 남기지
    // 않기 위해 같은 경로로 닫는다.
    const message =
      crashed instanceof Error
        ? crashed.message
        : crashed !== null && crashed !== undefined
          ? String(crashed)
          : '자동 발견 잡이 비정상 종료되었습니다.';
    await this.deps.operationLog.finishRun(runId, {
      status: 'failed',
      errorCode: 'unknown',
      errorMessage: message,
      meta,
    });
  }

  // finishRun meta 용 후보 결과 집계 — 보고서 없이 run 헤더만으로도 결과를
  // 파악할 수 있게 한다.
  private candidateSummary(
    snap: AutoDiscoverJobSnapshotType | null,
  ): Record<string, unknown> {
    if (!snap) return {};
    const candidateStates: Record<string, number> = {};
    for (const c of snap.candidates) {
      candidateStates[c.state] = (candidateStates[c.state] ?? 0) + 1;
    }
    return {
      newlyRegistered: snap.newlyRegistered,
      candidates: snap.candidates.length,
      candidateStates,
    };
  }

  // 스텝 로그 헬퍼 — operationLog 미주입 시 no-op. SSE 는 auto-discover 전용
  // 채널(registry publish)이 따로 있으므로 channel 기본값('none') 그대로 둔다.
  private step(
    runId: string | null,
    stage: string,
    level: OperationLogLevelType,
    message: string,
    meta?: Record<string, unknown>,
    subjectId?: string,
  ): void {
    if (!runId || !this.deps.operationLog) return;
    this.deps.operationLog.log({
      runId,
      stage,
      level,
      message,
      ...(meta !== undefined ? { meta } : {}),
      ...(subjectId !== undefined ? { subjectId } : {}),
    });
  }

  // 후보 1건의 크롤 + 잡 완료 대기. CrawlService.startCrawl 호출 → 같은 jobId 의
  // crawl-job-registry 이벤트를 구독해 terminal 이벤트로 등록 outcome 결정.
  private async runOneCrawl(
    runId: string | null,
    jobId: string,
    actorId: string,
    target: {
      item: NaverSearchResult;
      sourceKeyword: string;
      groupIndex: number;
    },
  ): Promise<{ crawlJobId: string | null }> {
    const { item, sourceKeyword, groupIndex } = target;
    this.registry.upsertCandidate(jobId, {
      placeId: item.placeId,
      name: item.name,
      category: item.category,
      roadAddress: item.roadAddress,
      lat: item.lat,
      lng: item.lng,
      sourceKeyword,
      groupIndex,
      state: 'running',
      skipReason: null,
      restaurantId: null,
      errorMessage: null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
    });
    // 후보별 스텝은 subjectId=placeId 로 남긴다 — placeId 기준 로그 조회 가능.
    this.step(
      runId,
      'crawling',
      'debug',
      `후보 크롤 시작 — ${item.name}`,
      { placeId: item.placeId, sourceKeyword },
      item.placeId,
    );

    let crawlJobId: string | null = null;
    try {
      const start = await this.deps.crawl.startCrawl(
        item.rawSourceUrl,
        actorId,
        'create',
      );
      if (!start.ok) {
        this.failCandidate(
          runId,
          jobId,
          target,
          start.error,
          start.message ?? '크롤 시작 실패',
        );
        return { crawlJobId: null };
      }
      crawlJobId = start.jobId;
      await this.waitForCrawlTerminal(start.jobId);

      // 등록 결과 — placeId 로 restaurant 조회.
      const rest = await this.deps.restaurants.findByPlaceId(item.placeId);
      if (!rest) {
        // 등록은 실패했지만 done 이벤트가 떨어진 케이스 — 예외적이지만 안전망.
        this.failCandidate(
          runId,
          jobId,
          target,
          'unknown',
          '등록 결과를 찾지 못했습니다.',
        );
        return { crawlJobId };
      }

      const newCount = this.registry.incrementNewlyRegistered(jobId);
      this.registry.upsertCandidate(jobId, {
        placeId: item.placeId,
        name: item.name,
        category: item.category,
        roadAddress: item.roadAddress,
        lat: item.lat,
        lng: item.lng,
        sourceKeyword,
        groupIndex,
        state: 'done',
        skipReason: null,
        restaurantId: rest.id,
        errorMessage: null,
        startedAt: null,
        finishedAt: new Date().toISOString(),
      });
      // newlyRegistered 갱신을 한 번 더 phase 이벤트로 흘려준다 — FE 가
      // candidate done 이벤트만 받아도 카운트 계산은 자체적으로 하지만, phase
      // 이벤트는 명시 동기화 채널이다.
      this.registry.setPhase(jobId, 'crawling');
      this.step(
        runId,
        'crawling',
        'info',
        `후보 등록 완료 — ${item.name} (신규 누적 ${newCount}건)`,
        { placeId: item.placeId, restaurantId: rest.id, newlyRegistered: newCount },
        item.placeId,
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.failCandidate(runId, jobId, target, 'unknown', message);
    }
    return { crawlJobId };
  }

  private failCandidate(
    runId: string | null,
    jobId: string,
    target: {
      item: NaverSearchResult;
      sourceKeyword: string;
      groupIndex: number;
    },
    code: string,
    message: string,
  ): void {
    const { item, sourceKeyword, groupIndex } = target;
    this.registry.upsertCandidate(jobId, {
      placeId: item.placeId,
      name: item.name,
      category: item.category,
      roadAddress: item.roadAddress,
      lat: item.lat,
      lng: item.lng,
      sourceKeyword,
      groupIndex,
      state: 'failed',
      skipReason: null,
      restaurantId: null,
      errorMessage: message,
      startedAt: null,
      finishedAt: new Date().toISOString(),
    });
    // 후보 1건 실패는 잡 실패가 아니다(나머지 후보 계속) — warn 으로만 남긴다.
    this.step(
      runId,
      'crawling',
      'warn',
      `후보 등록 실패 — ${item.name}: ${message}`,
      { placeId: item.placeId, code },
      item.placeId,
    );
  }

  // crawl-job-registry 의 done/error 이벤트까지 대기. 등록 직후 호출 시 이미
  // 종료된 경우(예: 캐시 히트)면 즉시 resolve.
  private waitForCrawlTerminal(crawlJobId: string): Promise<void> {
    return new Promise<void>((resolve) => {
      const job = this.crawlRegistry.get(crawlJobId);
      if (!job) {
        resolve();
        return;
      }
      // 이미 종료된 잡 — events 안에 terminal 이 들어있다.
      if (job.status !== 'running') {
        resolve();
        return;
      }
      const unsubscribe = this.crawlRegistry.subscribe(crawlJobId, (ev) => {
        if (ev.type === 'done' || ev.type === 'error') {
          unsubscribe();
          resolve();
        }
      });
    });
  }

  // 검색 — 키워드 한 줄로 네이버 nx-api 호출. 옵션 주입 가능 (테스트용).
  private async search(
    keyword: string,
    signal: AbortSignal,
  ): Promise<NaverSearchResult[]> {
    if (this.deps.searchOverride) return this.deps.searchOverride(keyword);
    return searchPlacesViaMapNaver(keyword, { signal, pageSize: 50 });
  }

  // ── 키워드 생성 ──────────────────────────────────────────────────────────
  // LLM 실패/미설정은 전부 fallback 키워드로 흡수된다 — 잡 실패가 아니므로
  // 작업 로그에는 warn 스텝으로만 남긴다.
  private async generateKeywords(
    runId: string | null,
    input: AutoDiscoverJobInputType,
  ): Promise<string[]> {
    const fallback = (reason: string, meta?: Record<string, unknown>): string[] => {
      this.step(
        runId,
        'generating_keywords',
        'warn',
        `AI 키워드 실패 — fallback 키워드 사용 (${reason})`,
        meta,
      );
      return buildFallbackKeywords(input);
    };
    const resolved = await this.resolveProvider();
    if (!resolved) {
      this.deps.logger?.warn(
        '[auto-discover] LLM 미설정 — fallback 키워드 사용',
      );
      return fallback('no_llm');
    }
    const { provider, model } = resolved;
    try {
      const res = await provider.complete({
        prompt: buildAutoDiscoverUserPrompt(input),
        model,
        systemPrompt: AUTO_DISCOVER_SYSTEM_PROMPT,
        temperature: AI_TEMPERATURE,
        maxTokens: AI_MAX_TOKENS,
        numCtx: AI_NUM_CTX,
        format: AUTO_DISCOVER_JSON_SCHEMA,
      });
      const candidate = extractFirstJsonObject(res.text);
      if (!candidate) {
        this.deps.logger?.warn(
          { text: res.text.slice(0, 200) },
          '[auto-discover] AI 응답에서 JSON 객체를 찾지 못함 — fallback',
        );
        return fallback('no_json');
      }
      const parsed = JSON.parse(candidate) as unknown;
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        !('keywords' in (parsed as Record<string, unknown>))
      ) {
        return fallback('bad_shape');
      }
      const raw = (parsed as { keywords: unknown }).keywords;
      if (!Array.isArray(raw)) return fallback('bad_shape');
      const clean = raw
        .filter((k): k is string => typeof k === 'string')
        .map((k) => k.replace(/\s+/g, ' ').trim())
        .filter((k, i, arr) => k.length > 0 && arr.indexOf(k) === i);
      if (clean.length === 0) return fallback('empty_keywords');
      // AI 가 부족하게 줬으면 fallback 으로 보충.
      if (clean.length < AUTO_DISCOVER_KEYWORD_COUNT) {
        const fb = buildFallbackKeywords(input);
        for (const f of fb) {
          if (clean.length >= AUTO_DISCOVER_KEYWORD_COUNT) break;
          if (!clean.includes(f)) clean.push(f);
        }
      }
      return clean.slice(0, AUTO_DISCOVER_KEYWORD_COUNT);
    } catch (e) {
      this.deps.logger?.warn(
        { err: e },
        '[auto-discover] AI 호출 실패 — fallback 키워드',
      );
      return fallback('request_failed', {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  private async resolveProvider(): Promise<{
    provider: LLMProvider;
    model: string;
  } | null> {
    if (this.deps.resolveProviderOverride) {
      return this.deps.resolveProviderOverride();
    }
    const resolved = await this.deps.aiConfig.getResolved('ollama-cloud', 'chat');
    if (!resolved) return null;
    const model = resolved.defaultModel?.trim();
    if (!model) return null;
    const provider = this.cache.get(resolved);
    return { provider, model };
  }
}

// 테스트가 직접 enum 비교에 사용할 수 있게 노출.
export const AUTO_DISCOVER_GROUP_SIZE = GROUP_SIZE;

// 외부 타입 별칭 — 라우트에서 필요할 수 있는 enum re-export.
export type { AutoDiscoverJobStateType, AutoDiscoverKeywordType, AutoDiscoverCandidateType };
