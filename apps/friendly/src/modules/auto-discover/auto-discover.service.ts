import type { FastifyBaseLogger } from 'fastify';
import type {
  AutoDiscoverCandidateType,
  AutoDiscoverJobInputType,
  AutoDiscoverJobStateType,
  AutoDiscoverKeywordType,
} from '@repo/api-contract';
import type { LLMProvider } from '../ai/adapters/llm-provider.js';
import type { AiConfigService } from '../ai/ai.config.service.js';
import { adapterCache, type AdapterCache } from '../ai/adapter-cache.js';
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

// 한 그룹에서 동시 진행할 크롤 수. 5 — 잡 레지스트리의 actor 슬롯과 일치.
const GROUP_SIZE = 5;

export interface AutoDiscoverServiceDeps {
  restaurants: RestaurantService;
  aiConfig: AiConfigService;
  crawl: CrawlService;
  registry?: AutoDiscoverRegistry;
  crawlRegistry?: JobRegistry;
  adapterCache?: AdapterCache;
  logger?: FastifyBaseLogger;
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

    this.registry.markRunning(jobId);
    try {
      // ── Phase 1: AI 키워드 생성 ──────────────────────────────────────────
      this.registry.setPhase(jobId, 'generating_keywords');
      const keywords = await this.generateKeywords(snapshot.input);
      if (abortSignal.aborted) {
        this.registry.markFinished(jobId, 'cancelled');
        return;
      }

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
            return { keyword: kw, items };
          } catch (e) {
            this.registry.upsertKeyword(jobId, {
              keyword: kw,
              state: 'failed',
              hitCount: 0,
              searchedAt: new Date().toISOString(),
              errorMessage: e instanceof Error ? e.message : String(e),
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
      if (deduped.size === 0) {
        // 후보 0건 — 잡은 done 으로 닫는다 (failed 아님, 검색은 정상 동작).
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

      if (targets.length === 0) {
        this.registry.markFinished(jobId, 'done');
        return;
      }

      // ── Phase 3: 그룹 직렬, 그룹 내 5병렬 크롤 ───────────────────────────
      this.registry.setPhase(jobId, 'crawling');
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
            const result = await this.runOneCrawl(jobId, actorId, t);
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
      this.deps.logger?.error(
        { err: e, jobId },
        '[auto-discover] runner crashed',
      );
      this.registry.markFinished(jobId, 'failed');
    }
  }

  // 후보 1건의 크롤 + 잡 완료 대기. CrawlService.startCrawl 호출 → 같은 jobId 의
  // crawl-job-registry 이벤트를 구독해 terminal 이벤트로 등록 outcome 결정.
  private async runOneCrawl(
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

    let crawlJobId: string | null = null;
    try {
      const start = await this.deps.crawl.startCrawl(
        item.rawSourceUrl,
        actorId,
        'create',
      );
      if (!start.ok) {
        this.failCandidate(
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
      void newCount;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.failCandidate(jobId, target, 'unknown', message);
    }
    return { crawlJobId };
  }

  private failCandidate(
    jobId: string,
    target: {
      item: NaverSearchResult;
      sourceKeyword: string;
      groupIndex: number;
    },
    _code: string,
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
  private async generateKeywords(
    input: AutoDiscoverJobInputType,
  ): Promise<string[]> {
    const resolved = await this.resolveProvider();
    if (!resolved) {
      this.deps.logger?.warn(
        '[auto-discover] LLM 미설정 — fallback 키워드 사용',
      );
      return buildFallbackKeywords(input);
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
        return buildFallbackKeywords(input);
      }
      const parsed = JSON.parse(candidate) as unknown;
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        !('keywords' in (parsed as Record<string, unknown>))
      ) {
        return buildFallbackKeywords(input);
      }
      const raw = (parsed as { keywords: unknown }).keywords;
      if (!Array.isArray(raw)) return buildFallbackKeywords(input);
      const clean = raw
        .filter((k): k is string => typeof k === 'string')
        .map((k) => k.replace(/\s+/g, ' ').trim())
        .filter((k, i, arr) => k.length > 0 && arr.indexOf(k) === i);
      if (clean.length === 0) return buildFallbackKeywords(input);
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
      return buildFallbackKeywords(input);
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
