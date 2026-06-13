import type {
  CatchtableSearchQueryType,
  CatchtableSearchResponseType,
  CatchtableShopDataType,
  CatchtableShopMenusResponseType,
  CatchtableShopReviewOverviewResponseType,
  CrawlEventType,
  CrawlErrorCodeType,
  CrawlModeType,
  CrawlNaverPlaceResultType,
  CrawlSearchResultType,
  CrawlStageType,
  DiningcodeSearchQueryType,
  DiningcodeSearchResponseType,
  DiningcodeShopDataType,
  DiningcodeShopReviewsResponseType,
  NaverPlaceDataType,
  SaveDiningcodeShopResultType,
  SaveTablingShopResultType,
  SaveTablingPlaceResultType,
  TablingShopDataType,
  TablingShopReviewsResponseType,
  TablingSearchQueryType,
  TablingSearchResponseType,
  TablingDiscoverQueryType,
  TablingDiscoverResultType,
  StartCrawlResultType,
  VisitorReviewType,
} from '@repo/api-contract';
import {
  CrawlCancelledError,
  fetchNaverPlaceWithPlaywright,
  PlaceParseError,
  PlaywrightFetchError,
  type ExistingReviewKeys,
} from './adapters/naver-place.playwright.adapter.js';
import { searchPlacesViaMapNaver } from './adapters/naver-search.http.adapter.js';
import { searchCatchtablePlaces } from './adapters/catchtable-search.playwright.adapter.js';
import { searchDiningcodePlaces } from './adapters/diningcode-search.http.adapter.js';
import {
  fetchDiningcodeShop,
  fetchDiningcodeShopReviews,
} from './adapters/diningcode-shop.http.adapter.js';
import {
  fetchTablingShop,
  fetchTablingShopReviews,
} from './adapters/tabling-shop.http.adapter.js';
import { fetchTablingPlace } from './adapters/tabling-place.http.adapter.js';
import { fetchTablingSitemap } from './adapters/tabling-sitemap.http.adapter.js';
import { fetchTablingSearch } from './adapters/tabling-search.http.adapter.js';
import {
  fetchCatchtableShop,
  fetchCatchtableShopMenus,
  fetchCatchtableShopReviewOverview,
} from './adapters/catchtable-shop.playwright.adapter.js';
import { jobRegistry, type JobRegistry } from './job-registry.js';
import type {
  FinishRunInput,
  OperationLogService,
} from '../logs/operation-log.service.js';
import { diningcodeBulkSaveRegistry } from './diningcode-bulk-save-registry.js';
import { tablingBulkSaveRegistry } from './tabling-bulk-save-registry.js';
import {
  normalizeToPlaceId,
  RedirectFailedError,
  UnsupportedUrlError,
} from './url-normalizer.js';
import { RestaurantService } from '../restaurant/restaurant.service.js';
import type { SummaryService } from '../summary/summary.service.js';
import type { ProposalService } from '../canonical/proposal.service.js';
import type { CanonicalService } from '../canonical/canonical.service.js';
import { scoreMatch } from '../../lib/matching.js';

const CACHE_TTL_MS = 30_000;

// Distributive Omit — applies Omit to each branch of a discriminated union
// independently, so the result stays a union TS can narrow on. A plain
// `Omit<CrawlEventType, 'seq' | 'at'>` collapses the union and rejects any
// branch-specific field when constructing.
type EmitInput = CrawlEventType extends infer E
  ? E extends CrawlEventType
    ? Omit<E, 'seq' | 'at'>
    : never
  : never;

interface CacheEntry {
  data: NaverPlaceDataType;
  fetchedAt: string;
  expiresAt: number;
}

// Per-actor FIFO of jobs waiting for a concurrency slot. The closure carries
// every input runJob needs; once a running job ends we pop the next entry
// for that actor and invoke it.
interface PendingStart {
  jobId: string;
  actorId: string;
  start: () => void;
}

// 자동 DC 매칭 임계 (C안 — 자동 머지). 사용자 확정값:
//   - 이름 유사도 ≥ 0.85 (Jaccard on bigrams)
//   - 거리 ≤ 50m (좌표 둘 다 있을 때만 의미. 좌표 없으면 자동 매칭 skip)
//   - top1.score - top2.score ≥ 0.1 (애매한 경우 사람 컨펌으로 떨어뜨림)
// 정책 변경 시 여기만 손대면 됨.
const AUTO_DC_NAME_THRESHOLD = 0.85;
const AUTO_DC_DISTANCE_THRESHOLD_M = 50;
const AUTO_DC_TIE_GAP = 0.1;

export class CrawlService {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly registry: JobRegistry;
  private readonly restaurants: RestaurantService;
  private readonly summaries: SummaryService;
  private readonly proposals: ProposalService | null;
  // 자동 DC 매칭이 머지 단계에서 canonical merge 를 호출해야 해서 inject.
  // null 이면 자동 매칭 skip — 테스트 단순화용.
  private readonly canonical: CanonicalService | null;
  // 범용 작업 로그 — null 이면 run/스텝 기록 없이 silent (테스트 단순화).
  // 운영 라우트는 항상 app.operationLog 를 주입한다.
  private readonly operationLog: OperationLogService | null;
  // jobId → OperationRun id. startCrawl 에서 등록, 종료 경로에서 정리 —
  // runJob/cancel 이 같은 run 에 스텝과 마감을 연결하기 위한 매핑.
  private readonly runIdsByJob = new Map<string, string>();
  private readonly pending: PendingStart[] = [];
  private nextSeq = 1;

  constructor(
    restaurants: RestaurantService,
    summaries: SummaryService,
    registry: JobRegistry = jobRegistry,
    // null 이면 후보 큐 생성 skip — 테스트가 단순화 위해 생략할 때 사용.
    proposals: ProposalService | null = null,
    canonical: CanonicalService | null = null,
    operationLog: OperationLogService | null = null,
  ) {
    this.registry = registry;
    this.restaurants = restaurants;
    this.summaries = summaries;
    this.proposals = proposals;
    this.canonical = canonical;
    this.operationLog = operationLog;
  }

  // 크롤 잡 스텝 로그. feature/jobId/subjectId 는 startRun 컨텍스트가 보충
  // 하므로 stage/level/message 만 넘긴다. runId 미등록(미주입·캐시히트 등)
  // 이면 no-op — 기존 jobLog null 허용 의미론 유지.
  private logStep(
    jobId: string,
    stage: string,
    level: 'info' | 'warn' | 'error',
    message: string,
    meta?: Record<string, unknown>,
  ): void {
    this.logStepWithRun(
      this.runIdsByJob.get(jobId) ?? null,
      stage,
      level,
      message,
      meta,
    );
  }

  // runId 직접 지정판 — finishJobRun 이 runIdsByJob 매핑을 지운 뒤에 settle
  // 되는 비동기 작업(persist tail 등)이 매핑 조회 실패로 무음 탈락하지 않고
  // 원래 run 에 기록을 남길 수 있게 한다.
  private logStepWithRun(
    runId: string | null,
    stage: string,
    level: 'info' | 'warn' | 'error',
    message: string,
    meta?: Record<string, unknown>,
  ): void {
    if (!runId || !this.operationLog) return;
    this.operationLog.log({
      runId,
      stage,
      level,
      message,
      ...(meta ? { meta } : {}),
      channel: 'crawl',
    });
  }

  // run 마감 + jobId 매핑 정리. finishRun 은 절대 던지지 않으므로 호출자가
  // await 하지 않아도 안전하다.
  private finishJobRun(jobId: string, input: FinishRunInput): Promise<void> {
    const runId = this.runIdsByJob.get(jobId);
    this.runIdsByJob.delete(jobId);
    if (!runId || !this.operationLog) return Promise.resolve();
    return this.operationLog.finishRun(runId, input);
  }

  // 등록 직후 자동 매칭 후크. 새 가게의 canonicalId 로 cross-source 후보를 큐에
  // 적재. 실패해도 등록 흐름은 막지 않음 — 큐는 보조 채널이고 어드민이 수동
  // "전체 다시 돌리기" 로 보강 가능.
  private async generateProposalsForRestaurant(restaurantId: string): Promise<void> {
    if (!this.proposals) return;
    try {
      const canonical = await this.restaurants.getCanonicalIdForRestaurant(restaurantId);
      if (!canonical) return;
      await this.proposals.generateForCanonical(canonical);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[crawl] proposal hook failed', e);
    }
  }

  // Naver 크롤 종료 직후 자동 DC 매칭. 같은 가게의 다이닝코드 행이 존재하면
  // DB 에 저장하고 같은 canonical 로 묶는다(=풀 자동 머지, C안).
  //
  // 호출 전 단계 검증:
  //   1) this.canonical 주입 여부
  //   2) canonical 에 DC source 가 아직 없음 (이미 있으면 duplicate)
  //   3) canonical 좌표 보유 (50m 컷이 좌표 없이는 무의미)
  // 임계 통과 못 하면 silent skip — ProposalService 가 별도 채널로 후보 큐 적재.
  //
  // 실패해도 Naver 흐름은 막지 않음 (fire-and-forget 호출 + try/catch).
  private async tryAutoMatchDiningcode(canonicalId: string): Promise<void> {
    if (!this.canonical) return;
    try {
      const core = await this.restaurants.getCanonicalCoreForAutoMatch(canonicalId);
      if (!core) return;
      if (core.sources.includes('diningcode')) return;
      if (core.latitude === null || core.longitude === null) return;

      // 1차 검색 — 좌표 기준 200m 반경. 50m 컷은 후보 점수화 단계에서.
      // strictDistance=true 가 기본이라 fallback 광역 결과는 자동 제거됨.
      const search = await searchDiningcodePlaces(core.name, {
        lat: core.latitude,
        lng: core.longitude,
        distance: 200,
        size: 5,
        order: 'r_score',
      });
      if (search.items.length === 0) return;

      // 이미 등록된 vRid 제외 — 다른 canonical 에 묶여 있을 수 있어
      // 또 saveDiningcodeShop 호출하면 충돌.
      const registered = await this.restaurants.findRegisteredDiningcodeByVRids(
        search.items.map((it) => it.vRid),
      );
      const registeredSet = new Set(registered.map((r) => r.vRid));
      const candidates = search.items.filter(
        (it) => !registeredSet.has(it.vRid) && it.lat !== null && it.lng !== null,
      );
      if (candidates.length === 0) return;

      // 점수 계산 후 내림차순 정렬.
      const scored = candidates
        .map((it) => ({
          item: it,
          score: scoreMatch(
            {
              name: core.name,
              latitude: core.latitude,
              longitude: core.longitude,
            },
            { name: it.name, latitude: it.lat, longitude: it.lng },
          ),
        }))
        .sort((a, b) => b.score.score - a.score.score);

      const top = scored[0]!;
      if (top.score.nameScore < AUTO_DC_NAME_THRESHOLD) return;
      if (
        top.score.distanceM === null ||
        top.score.distanceM > AUTO_DC_DISTANCE_THRESHOLD_M
      ) {
        return;
      }
      // 차순위와 격차 — 동률에 가까운 후보가 있으면 사람 컨펌으로.
      const second = scored[1];
      if (second && top.score.score - second.score.score < AUTO_DC_TIE_GAP) return;

      // DC 저장 → 자기 canonical 생성됨 → Naver canonical 로 머지.
      const result = await this.saveDiningcodeShop(top.item.vRid);
      const dcCanonicalId = await this.restaurants.getCanonicalIdForRestaurant(
        result.restaurantId,
      );
      if (!dcCanonicalId || dcCanonicalId === canonicalId) return;
      await this.canonical.merge(dcCanonicalId, canonicalId);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[crawl] auto DC match failed', e);
    }
  }

  // Kick off a crawl. Returns immediately with the jobId; the actual work
  // runs in the background and reports progress through the registry's
  // event stream. Caching, in-flight dedupe, and concurrency caps all happen
  // here before any Playwright work starts.
  //
  // 의도적으로 actor 단위 rate-limit 은 두지 않는다 — 어드민 발견 페이지의
  // 정상 사용 패턴이 "다중 선택 후 한 번에 N개 시작"이라 짧은 윈도우조차
  // 둘째부터 막힌다. 같은 가게 중복 시작은 findInFlightByPlace 가, 시스템
  // 전체 폭주는 max_concurrent + queue 가 책임진다.
  async startCrawl(
    rawUrl: string,
    actorId: string,
    mode: CrawlModeType = 'create',
  ): Promise<StartCrawlResultType> {
    const now = Date.now();

    let normalized: Awaited<ReturnType<typeof normalizeToPlaceId>>;
    try {
      normalized = await normalizeToPlaceId(rawUrl);
    } catch (e) {
      const fail = this.normalizeUrlError(e, rawUrl);
      if (fail) return fail;
      return {
        ok: false,
        error: 'fetch_failed',
        message: e instanceof Error ? e.message : 'unknown error',
        triedUrl: rawUrl,
      };
    }

    // In-flight dedupe — same actor + same place already running → return that.
    const existing = this.registry.findInFlightByPlace(actorId, normalized.placeId);
    if (existing) {
      return { ok: true, jobId: existing, deduped: true };
    }

    // Cache hit short-circuit — synthesize a one-shot job that emits
    // start → done immediately. Keeps callers on a single code path.
    // Recrawl/update modes always need fresh data (the whole point is to
    // bypass cached state), so we skip the short-circuit for them.
    if (mode === 'create') {
      const cached = this.cache.get(normalized.placeId);
      if (cached && cached.expiresAt > now) {
        const created = this.registry.create({
          url: rawUrl,
          placeId: normalized.placeId,
          actorId,
        });
        // Cache hits don't consume a Playwright slot but we still flip the
        // phase so countActive stays consistent and the job appears in lists
        // as having actually run.
        this.registry.markActive(created.id);
        this.emit(created.id, {
          type: 'progress',
          stage: 'done',
          message: 'cache hit',
        });
        this.emit(created.id, {
          type: 'done',
          result: {
            ok: true,
            data: cached.data,
            fetchedAt: cached.fetchedAt,
            durationMs: 0,
          },
        });
        // 캐시 히트 단락 잡도 run 으로 남긴다 — 어드민 로그 화면에서 "왜 잡이
        // 즉시 끝났는지(cacheHit)" 를 추적 가능하게. 스텝 로그는 없음.
        if (this.operationLog) {
          const runId = await this.operationLog.startRun({
            feature: 'crawl',
            jobId: created.id,
            subjectId: normalized.placeId,
            trigger: 'manual',
            meta: { url: rawUrl, mode, actorId, cacheHit: true },
          });
          await this.operationLog.finishRun(runId, {
            status: 'done',
            meta: { durationMs: 0 },
          });
        }
        return { ok: true, jobId: created.id, deduped: false };
      }
    }

    const { id: jobId, abortSignal } = this.registry.create({
      url: rawUrl,
      placeId: normalized.placeId,
      actorId,
    });

    // run 경계 시작 — registry.create 직후. startRun 은 DB 실패해도 id 를
    // 반환하므로 이후 스텝/마감은 항상 이 runId 에 연결된다.
    if (this.operationLog) {
      const runId = await this.operationLog.startRun({
        feature: 'crawl',
        jobId,
        subjectId: normalized.placeId,
        trigger: 'manual',
        meta: { url: rawUrl, mode, actorId },
      });
      this.runIdsByJob.set(jobId, runId);
    }

    // startRun await 동안 cancel() 이 먼저 처리될 수 있다 — 취소로 끝난 잡을
    // start/pending 에 올리면 죽은 잡이 재가동되므로 여기서 run 만 마감하고
    // 중단한다 (cancel 시점엔 runId 매핑이 없어 그쪽 finishJobRun 은 no-op).
    const regJob = this.registry.get(jobId);
    if (!regJob || regJob.phase === 'finished' || abortSignal.aborted) {
      await this.finishJobRun(jobId, {
        status: 'cancelled',
        errorCode: 'cancelled',
        errorMessage: '시작 준비 중에 취소되었습니다.',
      });
      return { ok: true, jobId, deduped: false };
    }

    this.logStep(jobId, 'queued', 'info', '크롤 잡 생성', {
      url: rawUrl,
      mode,
      actorId,
    });

    const start = () => {
      this.registry.markActive(jobId);
      // Fire-and-forget — runJob handles all errors by emitting events.
      // After the job ends we drain the queue so any waiting jobs for this
      // actor pick up the freed slot.
      void this.runJob(jobId, abortSignal, normalized.placeId, normalized.canonicalUrl, mode)
        .catch(() => undefined)
        .finally(() => this.flushQueue(actorId));
    };

    if (this.registry.hasSlotForActor(actorId)) {
      start();
      return { ok: true, jobId, deduped: false };
    }
    // Emit a 'queued' stage event so SSE subscribers immediately see the
    // waiting badge — without this the stream would be silent until a slot
    // frees and the adapter starts emitting its own progress events.
    this.emit(jobId, { type: 'progress', stage: 'queued' });
    this.logStep(jobId, 'queued', 'info', '동시성 한도 — 대기열 등록');
    this.pending.push({ jobId, actorId, start });
    return { ok: true, jobId, deduped: false, queued: true };
  }

  // 키워드 검색 — 어드민 /discover 페이지 전용. nx-api GraphQL 직접 호출(HTTP).
  // bbox 가 들어오면 어댑터가 center 좌표로 추출해 영역 한정 검색.
  // 빈 query 는 어댑터 안에서 DEFAULT_QUERY ("맛집") 로 fallback — 사용자가
  // 검색바를 비우고 "이 지역 재검색" 만 눌러도 동작.
  async searchPlaces(query: string, bbox?: string): Promise<CrawlSearchResultType> {
    const items = await searchPlacesViaMapNaver(query, { bbox, pageSize: 50 });
    return { items, source: 'http' };
  }

  // 캐치테이블 키워드 검색 — 어드민 /catchtable-test 전용. Playwright 페이지를
  // 띄워 그 안에서 캐치테이블 자체 API 를 호출한다(CF 봇 보호 우회).
  async searchCatchtable(
    query: CatchtableSearchQueryType,
  ): Promise<CatchtableSearchResponseType> {
    const coord =
      query.lat !== undefined && query.lon !== undefined
        ? { lat: query.lat, lon: query.lon }
        : undefined;
    return searchCatchtablePlaces(query.q, {
      coord,
      offset: query.offset,
      limit: query.limit,
      contractedOnly: query.contractedOnly,
    });
  }

  // 다이닝코드 키워드 검색 — 어드민 /diningcode-test 전용. CORS 가 열려있고
  // CF 보호 없음이라 HTTP 직접 호출. lat/lng 한쪽만 있으면 어댑터가 무시.
  async searchDiningcode(
    query: DiningcodeSearchQueryType,
  ): Promise<DiningcodeSearchResponseType> {
    const hasCoord =
      typeof query.lat === 'number' && typeof query.lng === 'number';
    return searchDiningcodePlaces(query.q, {
      from: query.from,
      size: query.size,
      order: query.order,
      lat: hasCoord ? query.lat : undefined,
      lng: hasCoord ? query.lng : undefined,
      distance: hasCoord ? query.distance : undefined,
    });
  }

  // 다이닝코드 가게 상세 — 검색 카드 "상세 보기" 진입. /API/profile/ 한 방에
  // 메뉴·사진·리뷰 첫 페이지·블로그·평점 분포 모두 옴.
  // 이미 DB 에 저장된 가게면 reviewsFirstPage 의 각 리뷰에 우리 ReviewSummary.text
  // 를 join 해서 채워준다(외부 응답은 그대로 두고 summaryText 만 덮어씀).
  async fetchDiningcodeShopDetail(vRid: string): Promise<DiningcodeShopDataType> {
    const detail = await fetchDiningcodeShop(vRid);
    const summaryMap = await this.restaurants.getDiningcodeReviewSummaryMap(
      vRid,
      detail.reviewsFirstPage.list.map((r) => r.rvId),
    );
    if (summaryMap.size > 0) {
      detail.reviewsFirstPage = {
        ...detail.reviewsFirstPage,
        list: detail.reviewsFirstPage.list.map((r) => ({
          ...r,
          summaryText: summaryMap.get(r.rvId) ?? null,
        })),
      };
    }
    return detail;
  }

  // 다이닝코드 리뷰 페이지네이션 — 상세 페이지에서 "더 보기" 클릭 시. 같은
  // endpoint 호출이지만 review 섹션만 추려서 반환 (응답 자체는 16섹션 다 옴).
  async fetchDiningcodeShopReviewsPage(
    vRid: string,
    page: number,
  ): Promise<DiningcodeShopReviewsResponseType> {
    const resp = await fetchDiningcodeShopReviews(vRid, page);
    const summaryMap = await this.restaurants.getDiningcodeReviewSummaryMap(
      vRid,
      resp.list.map((r) => r.rvId),
    );
    if (summaryMap.size === 0) return resp;
    return {
      ...resp,
      list: resp.list.map((r) => ({
        ...r,
        summaryText: summaryMap.get(r.rvId) ?? null,
      })),
    };
  }

  // 다이닝코드 가게 + 모든 리뷰 페이지를 DB 에 저장하고 AI 분석 큐에 태운다.
  // 비용 분포: profile 호출 1회 + 리뷰 페이지 (totalPage - 1) 회. 한 가게당 보통
  // 1~5 페이지. 페이지 간 200ms 간격으로 다이닝코드에 부담 안 주게 직렬화.
  //
  // restaurantId 는 (source='diningcode', sourceId=vRid) upsert 결과. 신규 리뷰만
  // 다시 AI 분석 큐에 들어가서 재호출 시 idempotent.
  //
  // opts — bulk-save 같은 상위 run 컨텍스트에서 호출될 때 파생 요약 run 을
  // 부모에 연결하기 위한 식별자. 단독 저장 라우트는 생략 — 기존 동작 유지.
  async saveDiningcodeShop(
    vRid: string,
    opts?: { jobId?: string | null; parentRunId?: string | null },
  ): Promise<SaveDiningcodeShopResultType> {
    const startedAt = Date.now();
    const detail = await fetchDiningcodeShop(vRid);

    // 첫 페이지는 detail.reviewsFirstPage 에 이미 들어있다. 2페이지부터 끝까지 추가
    // fetch. totalPage 가 0/1 이면 추가 fetch 없이 첫 페이지만 사용.
    const allReviews: DiningcodeShopDataType['reviewsFirstPage']['list'] = [
      ...detail.reviewsFirstPage.list,
    ];
    let fetchedPages = 1;
    const totalPage = detail.reviewsFirstPage.totalPage;
    for (let page = 2; page <= totalPage; page += 1) {
      // 다이닝코드 부담 줄이려 페이지 간 200ms 간격. 어드민 작업이라 동기 응답은 받지만
      // 평균적으로 가게당 수 초 이내 끝난다.
      await new Promise((resolve) => setTimeout(resolve, 200));
      const pageResp = await fetchDiningcodeShopReviews(vRid, page);
      allReviews.push(...pageResp.list);
      fetchedPages += 1;
    }

    const { id: restaurantId } =
      await this.restaurants.upsertRestaurantFromDiningcode(detail);

    // 등록 직후 자동 매칭 후크 — cross-source 같은 가게 짝을 검토 큐에 적재.
    await this.generateProposalsForRestaurant(restaurantId);

    const raw = allReviews.map((rv) =>
      RestaurantService.mapDiningcodeReviewToRaw(rv),
    );
    const { newReviews } = await this.restaurants.persistReviewBatch(restaurantId, raw);

    if (newReviews.length > 0) {
      // 다이닝코드 체인 키는 'dc:<vRid>' — 네이버 placeId 와 충돌 안 나게. 내부 run()
      // 은 reviewId 로만 조회하므로 키 형태는 자유.
      this.summaries.queueSummariesForReviews(
        `dc:${vRid}`,
        newReviews.map((r) => r.id),
        opts?.jobId ?? null,
        null,
        opts?.parentRunId ?? null,
      );
    }

    return {
      vRid,
      restaurantId,
      fetchedPages,
      totalReviewsReported: detail.reviewsFirstPage.totalCount,
      newReviewCount: newReviews.length,
      queuedForAnalysis: newReviews.length,
      elapsedMs: Date.now() - startedAt,
    };
  }

  // 다이닝코드 일괄 저장 — 정식 /admin/diningcode 페이지의 일괄 저장 액션.
  // vRid 들을 순차로 saveDiningcodeShop 호출 (직렬화 — 동시 호출 시 다이닝코드
  // 부담 + 우리 DB 의 (source, sourceId) unique upsert 가 같은 vRid 두 번 들어
  // 와도 안전하지만 SSE 이벤트 순서 직관 유지 목적). 잡 progress 는 registry 가
  // 직접 publish 하므로 service 는 결과만 전달.
  async runDiningcodeBulkSave(jobId: string, vRids: string[]): Promise<void> {
    diningcodeBulkSaveRegistry.markRunning(jobId);
    const abortSignal = diningcodeBulkSaveRegistry.abortSignal(jobId);

    // 일괄 저장도 run 으로 기록. registry 의 자체 SSE 는 그대로 두고(변경
    // 금지) OperationLog 에는 항목 단위 스텝만 추가한다. 대상이 여러 가게라
    // subjectId 는 비워둔다 — 항목별 vRid 는 스텝 meta 로.
    const runId = this.operationLog
      ? await this.operationLog.startRun({
          feature: 'diningcode-bulk-save',
          jobId,
          trigger: 'manual',
          meta: { total: vRids.length },
        })
      : null;
    const step = (
      stage: string,
      level: 'debug' | 'info' | 'warn' | 'error',
      message: string,
      meta?: Record<string, unknown>,
    ): void => {
      if (!runId || !this.operationLog) return;
      this.operationLog.log({
        runId,
        stage,
        level,
        message,
        ...(meta ? { meta } : {}),
      });
    };

    let okCount = 0;
    let failCount = 0;
    let skipCount = 0;
    try {
      for (const vRid of vRids) {
        if (abortSignal?.aborted) {
          skipCount += 1;
          diningcodeBulkSaveRegistry.finishItem(jobId, vRid, {
            skipped: true,
            reason: '잡이 취소되어 시작 전 건너뜀',
          });
          step('item_skipped', 'warn', '취소로 항목 건너뜀', { vRid });
          continue;
        }
        diningcodeBulkSaveRegistry.markItemStart(jobId, vRid);
        // 시작 스텝은 debug — 항목당 2행씩 쌓이는 잡음을 SSE/기본 조회에서
        // 빼고 DB 에만 남긴다 (실패 시간 구간 추적용).
        step('item_start', 'debug', '항목 저장 시작', { vRid });
        try {
          // jobId/parentRunId 전달 — 항목별 파생 요약 run 이 이 bulk run 의
          // 자식으로 연결돼야 어드민 로그 화면에서 출처 추적이 된다.
          const result = await this.saveDiningcodeShop(vRid, {
            jobId,
            parentRunId: runId,
          });
          okCount += 1;
          diningcodeBulkSaveRegistry.finishItem(jobId, vRid, {
            ok: true,
            restaurantId: result.restaurantId,
            fetchedPages: result.fetchedPages,
            newReviewCount: result.newReviewCount,
          });
          step('item_done', 'info', '항목 저장 완료', {
            vRid,
            restaurantId: result.restaurantId,
            fetchedPages: result.fetchedPages,
            newReviewCount: result.newReviewCount,
          });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          failCount += 1;
          diningcodeBulkSaveRegistry.finishItem(jobId, vRid, {
            ok: false,
            errorCode: 'save_failed',
            errorMessage: message,
          });
          step('item_failed', 'error', `항목 저장 실패: ${message}`, { vRid });
        }
      }
    } finally {
      diningcodeBulkSaveRegistry.markFinished(jobId);
      if (runId && this.operationLog) {
        const counts = {
          total: vRids.length,
          done: okCount,
          failed: failCount,
          skipped: skipCount,
        };
        // 취소 판정은 registry 상태가 아닌 abortSignal 기준 — registry 는
        // 전부 skipped 여도 'done' 으로 마감하므로 여기서 구분해야 한다.
        if (abortSignal?.aborted) {
          await this.operationLog.finishRun(runId, {
            status: 'cancelled',
            errorCode: 'cancelled',
            errorMessage: '어드민이 일괄 저장을 취소했습니다.',
            meta: counts,
          });
        } else if (vRids.length > 0 && failCount === vRids.length) {
          await this.operationLog.finishRun(runId, {
            status: 'failed',
            errorCode: 'all_items_failed',
            errorMessage: '모든 항목 저장이 실패했습니다.',
            meta: counts,
          });
        } else {
          await this.operationLog.finishRun(runId, {
            status: 'done',
            meta: counts,
          });
        }
      }
    }
  }

  // ── 테이블링 ───────────────────────────────────────────────────────────
  // 키워드 검색 — POST /v1/search/restaurants/map 정규화. 사이트맵 전수열거와
  // 별개로 키워드로 partner idx 를 바로 찾는 경로. 응답 카드에 좌표·평점·추천
  // 메뉴가 실려 별도 상세 호출 없이 등록 후보 추리기에 충분하다.
  async searchTabling(
    query: TablingSearchQueryType,
  ): Promise<TablingSearchResponseType> {
    return fetchTablingSearch(query.q, {
      cursor: query.cursor ?? null,
      pageSize: query.pageSize,
      sort: query.sort,
    });
  }

  // 가게 상세 — GET /v1/restaurant/:idx + /menu + /review 합본. 이미 DB 에 저장된
  // 가게면 reviewsFirstPage 각 리뷰에 우리 ReviewSummary.text 를 join.
  async fetchTablingShopDetail(idx: number): Promise<TablingShopDataType> {
    const detail = await fetchTablingShop(idx);
    const summaryMap = await this.restaurants.getTablingReviewSummaryMap(
      idx,
      detail.reviewsFirstPage.list.map((r) => r.idx),
    );
    if (summaryMap.size > 0) {
      detail.reviewsFirstPage = {
        ...detail.reviewsFirstPage,
        list: detail.reviewsFirstPage.list.map((r) => ({
          ...r,
          summaryText: summaryMap.get(r.idx) ?? null,
        })),
      };
    }
    return detail;
  }

  // 리뷰 커서 페이지네이션 — 상세 페이지 "더 보기" 클릭 시.
  async fetchTablingShopReviewsPage(
    idx: number,
    cursorId: string | null,
  ): Promise<TablingShopReviewsResponseType> {
    const resp = await fetchTablingShopReviews(idx, cursorId);
    const summaryMap = await this.restaurants.getTablingReviewSummaryMap(
      idx,
      resp.list.map((r) => r.idx),
    );
    if (summaryMap.size === 0) return resp;
    return {
      ...resp,
      list: resp.list.map((r) => ({
        ...r,
        summaryText: summaryMap.get(r.idx) ?? null,
      })),
    };
  }

  // 테이블링 가게 + 리뷰(커서 전 페이지)를 DB 저장 + AI 분석 큐 + 좌표 기반
  // 로컬 canonical 자동매칭. 페이지 간 200ms 간격(다이닝코드와 동일 저부하 정책).
  async saveTablingShop(idx: number): Promise<SaveTablingShopResultType> {
    const startedAt = Date.now();
    const detail = await fetchTablingShop(idx);

    // 첫 페이지는 detail.reviewsFirstPage. 커서로 끝까지 추가 fetch.
    const allReviews: TablingShopDataType['reviewsFirstPage']['list'] = [
      ...detail.reviewsFirstPage.list,
    ];
    let fetchedPages = 1;
    // 다음 페이지 커서 = 마지막 리뷰의 idx(ObjectId). 테이블링 lastIdx 규약.
    let cursor =
      allReviews.length > 0 ? allReviews[allReviews.length - 1]!.idx : null;
    // 안전 상한 — 폭주 방지(200페이지 × pageSize).
    while (cursor && fetchedPages < 200) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      const pageResp = await fetchTablingShopReviews(idx, cursor);
      if (pageResp.list.length === 0) break;
      allReviews.push(...pageResp.list);
      fetchedPages += 1;
      cursor = pageResp.nextCursor;
    }

    const { id: restaurantId } =
      await this.restaurants.upsertRestaurantFromTabling(detail);

    // 등록 직후 cross-source 제안 후크 — 좌표 박스로 기존 네이버/DC canonical 과
    // 같은 가게 짝을 검토 큐에 적재.
    await this.generateProposalsForRestaurant(restaurantId);

    const raw = allReviews.map((rv) => RestaurantService.mapTablingReviewToRaw(rv));
    const { newReviews } = await this.restaurants.persistReviewBatch(restaurantId, raw);

    if (newReviews.length > 0) {
      this.summaries.queueSummariesForReviews(
        `tb:${idx}`,
        newReviews.map((r) => r.id),
      );
    }

    // 좌표 기반 로컬 자동매칭(역방향) — 우리 DB 만 검색하므로 가볍다. 동기 실행해
    // 결과를 응답에 싣는다(다이닝코드는 외부 저장이라 fire-and-forget).
    const canonicalId =
      await this.restaurants.getCanonicalIdForRestaurant(restaurantId);
    const matched = canonicalId ? await this.tryAutoMatchTabling(canonicalId) : null;

    // partner 저장 후 같은 가게의 미입점 place 행이 있으면 partner(풍부) 쪽으로
    // 승격(머지). auto-match 로 canonical 이 바뀌었을 수 있어 최종 canonical 기준.
    const finalCanonicalId = matched ?? canonicalId;
    if (finalCanonicalId) {
      await this.tryLinkTablingPlacePartner(finalCanonicalId, true);
    }

    return {
      idx,
      restaurantId,
      fetchedPages,
      totalReviewsReported: detail.reviewsFirstPage.totalCount,
      newReviewCount: newReviews.length,
      queuedForAnalysis: newReviews.length,
      autoMatched: matched !== null,
      matchedCanonicalId: matched,
      elapsedMs: Date.now() - startedAt,
    };
  }

  // 미입점 place(JSON-LD 얕은 티어) 저장 + 자동매칭. 메뉴·리뷰 없음.
  async saveTablingPlace(objectId: string): Promise<SaveTablingPlaceResultType> {
    const data = await fetchTablingPlace(objectId);
    const { id: restaurantId } =
      await this.restaurants.upsertRestaurantFromTablingPlace(data);
    await this.generateProposalsForRestaurant(restaurantId);
    const canonicalId =
      await this.restaurants.getCanonicalIdForRestaurant(restaurantId);
    const matched = canonicalId ? await this.tryAutoMatchTabling(canonicalId) : null;

    // place 저장 후 같은 가게의 partner(입점) 행이 이미 있으면 place 를 partner
    // 쪽으로 흡수(머지). 보통은 partner 저장이 주 트리거지만, partner 가 먼저
    // 들어온 경우를 위한 대칭 경로. matched(naver/DC) 후 최종 canonical 기준.
    const finalCanonicalId = matched ?? canonicalId;
    if (finalCanonicalId) {
      await this.tryLinkTablingPlacePartner(finalCanonicalId, false);
    }

    return {
      objectId,
      restaurantId,
      autoMatched: matched !== null,
      matchedCanonicalId: matched,
    };
  }

  // 테이블링 저장 직후 좌표 기반 로컬 자동매칭(역방향). 테이블링 canonical 을
  // 기존 네이버/DC canonical 에 자동 머지한다 — 외부 검색 API 불필요, 우리 DB 의
  // 좌표 박스 안 후보만 스코어링. 임계는 DC 자동매칭과 동일(이름 ≥0.85, 거리
  // ≤50m, top1-top2 ≥0.1). 미달이면 머지 안 하고 null(제안 큐가 보조 채널).
  // 반환: 머지된 대상(keep) canonicalId, 없으면 null.
  private async tryAutoMatchTabling(
    tablingCanonicalId: string,
  ): Promise<string | null> {
    if (!this.canonical) return null;
    try {
      const core =
        await this.restaurants.getCanonicalCoreForAutoMatch(tablingCanonicalId);
      if (!core) return null;
      if (core.latitude === null || core.longitude === null) return null;

      const candidates = await this.restaurants.findCanonicalAutoMatchCandidates(
        tablingCanonicalId,
        core.latitude,
        core.longitude,
      );
      // 이미 테이블링 source 를 가진 canonical 은 제외(중복 머지 방지).
      const eligible = candidates.filter((c) => !c.sources.includes('tabling'));
      if (eligible.length === 0) return null;

      const scored = eligible
        .map((c) => ({
          item: c,
          score: scoreMatch(
            { name: core.name, latitude: core.latitude, longitude: core.longitude },
            { name: c.name, latitude: c.latitude, longitude: c.longitude },
          ),
        }))
        .sort((a, b) => b.score.score - a.score.score);

      const top = scored[0]!;
      if (top.score.nameScore < AUTO_DC_NAME_THRESHOLD) return null;
      if (
        top.score.distanceM === null ||
        top.score.distanceM > AUTO_DC_DISTANCE_THRESHOLD_M
      ) {
        return null;
      }
      const second = scored[1];
      if (second && top.score.score - second.score.score < AUTO_DC_TIE_GAP) {
        return null;
      }

      // 테이블링 canonical 을 기존 canonical(keep) 로 머지.
      await this.canonical.merge(tablingCanonicalId, top.item.id);
      return top.item.id;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[crawl] auto tabling match failed', e);
      return null;
    }
  }

  // place(미입점 JSON-LD)행과 partner(입점, 풍부)행은 둘 다 source='tabling' 이라
  // tryAutoMatchTabling(다른 source 만 후보) 과 제안 큐(새 source 만 제안) 양쪽이
  // 모두 건너뛴다 → 같은 가게가 영구히 별도 canonical 로 남는 사각지대. 이 후크가
  // 좌표+이름으로 둘을 잇고 partner(풍부) 쪽으로 머지("승격"). 임계는 DC 자동매칭과
  // 동일(이름 ≥0.85, 거리 ≤50m, top1-top2 ≥0.1). 반환: 머지가 일어났으면 남는
  // (keep=partner) canonicalId, 아니면 null.
  //
  // selfIsPartner: 방금 저장한 쪽이 partner(true)면 근처 place-only canonical 을,
  // place(false)면 근처 partner 보유 canonical 을 찾는다. 어느 방향이든 keep=partner.
  private async tryLinkTablingPlacePartner(
    selfCanonicalId: string,
    selfIsPartner: boolean,
  ): Promise<string | null> {
    if (!this.canonical) return null;
    try {
      const core =
        await this.restaurants.getCanonicalCoreForAutoMatch(selfCanonicalId);
      if (!core) return null;
      if (core.latitude === null || core.longitude === null) return null;

      const nearby = await this.restaurants.findTablingCanonicalsNear(
        selfCanonicalId,
        core.latitude,
        core.longitude,
      );
      const isPlaceOnly = (ids: string[]): boolean =>
        ids.length > 0 && ids.every((s) => s.startsWith('place:'));
      const hasPartner = (ids: string[]): boolean =>
        ids.some((s) => !s.startsWith('place:'));

      // 반대 역할만 후보. self=partner → place-only 후보(아직 partner 없음).
      // self=place → partner 보유 후보(place 섞여 있어도 partner 만 있으면 인정).
      const eligible = nearby.filter((c) =>
        selfIsPartner
          ? isPlaceOnly(c.tablingSourceIds)
          : hasPartner(c.tablingSourceIds),
      );
      if (eligible.length === 0) return null;

      const scored = eligible
        .map((c) => ({
          item: c,
          score: scoreMatch(
            { name: core.name, latitude: core.latitude, longitude: core.longitude },
            { name: c.name, latitude: c.latitude, longitude: c.longitude },
          ),
        }))
        .sort((a, b) => b.score.score - a.score.score);

      const top = scored[0]!;
      if (top.score.nameScore < AUTO_DC_NAME_THRESHOLD) return null;
      if (
        top.score.distanceM === null ||
        top.score.distanceM > AUTO_DC_DISTANCE_THRESHOLD_M
      ) {
        return null;
      }
      const second = scored[1];
      if (second && top.score.score - second.score.score < AUTO_DC_TIE_GAP) {
        return null;
      }

      // keep=partner, drop=place. self=partner 면 self 가 keep / 후보(place)가 drop,
      // self=place 면 self 가 drop / 후보(partner)가 keep. merge(drop, keep).
      const keep = selfIsPartner ? selfCanonicalId : top.item.id;
      const drop = selfIsPartner ? top.item.id : selfCanonicalId;
      if (keep === drop) return null;
      await this.canonical.merge(drop, keep);
      return keep;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[crawl] tabling place-partner link failed', e);
      return null;
    }
  }

  // 사이트맵 기반 발견 — 검색 API 가 없어 전수 발견 백본. tier=shop(partner idx)
  // | place(미입점 objectId, page 1~5).
  async discoverTabling(
    query: TablingDiscoverQueryType,
  ): Promise<TablingDiscoverResultType> {
    const res = await fetchTablingSitemap(query.tier, query.page);
    return {
      tier: query.tier,
      ids: res.ids,
      total: res.total,
      source: 'sitemap',
      elapsedMs: res.elapsedMs,
    };
  }

  // 테이블링 일괄 저장 — 발견에서 다수 선택한 idx 를 순차로 saveTablingShop 호출.
  // 직렬화(동시 호출 시 부담 + SSE 이벤트 순서 직관 유지). saveTablingShop 안에서
  // 리뷰 페이지 간 200ms 간격. 진행 publish 는 registry 가 담당.
  async runTablingBulkSave(jobId: string, idxs: number[]): Promise<void> {
    tablingBulkSaveRegistry.markRunning(jobId);
    const abortSignal = tablingBulkSaveRegistry.abortSignal(jobId);

    for (const idx of idxs) {
      if (abortSignal?.aborted) {
        tablingBulkSaveRegistry.finishItem(jobId, idx, {
          skipped: true,
          reason: '잡이 취소되어 시작 전 건너뜀',
        });
        continue;
      }
      tablingBulkSaveRegistry.markItemStart(jobId, idx);
      try {
        const result = await this.saveTablingShop(idx);
        tablingBulkSaveRegistry.finishItem(jobId, idx, {
          ok: true,
          restaurantId: result.restaurantId,
          fetchedPages: result.fetchedPages,
          newReviewCount: result.newReviewCount,
          autoMatched: result.autoMatched,
          matchedCanonicalId: result.matchedCanonicalId,
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        tablingBulkSaveRegistry.finishItem(jobId, idx, {
          ok: false,
          errorCode: 'save_failed',
          errorMessage: message,
        });
      }
    }
    tablingBulkSaveRegistry.markFinished(jobId);
  }

  // 캐치테이블 가게 상세 (가벼운 미리보기). 검색 카드에서 "상세 보기" 클릭 시
  // 호출. 메뉴/리뷰는 lazy 라 어댑터가 best-effort 로 채운다.
  async fetchCatchtableShopDetail(shopRef: string): Promise<CatchtableShopDataType> {
    return fetchCatchtableShop(shopRef);
  }

  // 가게 메뉴 — 상세 페이지에서 "메뉴 불러오기" 클릭 시 호출. 별도 페이지 진입
  // (/menuAllList) + display/v2/.../tabs/menu 응답 가로채기.
  async fetchCatchtableShopMenus(shopRef: string): Promise<CatchtableShopMenusResponseType> {
    return fetchCatchtableShopMenus(shopRef);
  }

  // AI 리뷰 종합 — 캐치테이블이 자체 생성한 가게 한 줄 + 3-4 문장.
  async fetchCatchtableShopReviewOverview(
    shopRef: string,
  ): Promise<CatchtableShopReviewOverviewResponseType> {
    return fetchCatchtableShopReviewOverview(shopRef);
  }

  cancel(jobId: string, actorId: string): boolean {
    const outcome = this.registry.cancel(jobId, actorId);
    if (outcome === 'noop') return false;
    this.logStep(jobId, 'finalizing', 'warn', '잡 취소 요청', {
      actorId,
      outcome,
    });
    if (outcome === 'queued-cancelled') {
      // Drop the deferred start so it never fires. The registry will record
      // the cancellation event below.
      const idx = this.pending.findIndex((p) => p.jobId === jobId);
      if (idx >= 0) this.pending.splice(idx, 1);
      this.emit(jobId, {
        type: 'error',
        error: 'cancelled',
        message: '대기 중에 취소되었습니다.',
      });
      // 대기열 취소는 runJob 이 영영 돌지 않으므로 여기서 run 을 마감한다.
      // 실행 중 취소('aborted')는 runJob 의 catch 가 cancelled 로 마감.
      void this.finishJobRun(jobId, {
        status: 'cancelled',
        errorCode: 'cancelled',
        errorMessage: '대기 중에 취소되었습니다.',
      });
    }
    return true;
  }

  // Pop the next queued job for this actor and start it, repeating while
  // there's still slack. Called when a slot frees (job finished) or right
  // after queueing a new job (in case a slot is still available).
  private flushQueue(actorId: string): void {
    while (this.registry.hasSlotForActor(actorId)) {
      const idx = this.pending.findIndex((p) => p.actorId === actorId);
      if (idx < 0) return;
      const next = this.pending.splice(idx, 1)[0];
      if (!next) return;
      next.start();
    }
  }

  private async runJob(
    jobId: string,
    signal: AbortSignal,
    placeId: string,
    canonicalUrl: string,
    mode: CrawlModeType,
  ): Promise<void> {
    const startedAt = Date.now();
    // finishJobRun 이 runIdsByJob 매핑을 지운 뒤에도 persist tail 의 늦은
    // settle 이 같은 run 에 로그/parentRunId 를 연결해야 하므로 진입 시점에
    // 스냅샷한다 — 클로저가 매핑 조회 대신 이 값을 직접 쓴다.
    const runId = this.runIdsByJob.get(jobId) ?? null;

    this.logStep(jobId, 'launching', 'info', '잡 실행 시작', {
      mode,
      canonicalUrl,
    });

    let restaurantId: string | null = null;
    let existingKeys: ExistingReviewKeys | undefined;

    // The persistence path is fire-and-forget so it doesn't block the next
    // page click — but we must still serialize *within* a job, since two
    // concurrent persistReviewBatch calls for the same restaurant would
    // race on the existing-keys snapshot. A simple in-flight tail keeps the
    // contract: each batch is persisted before the next one starts, but
    // the adapter is never blocked.
    let persistTail: Promise<void> = Promise.resolve();

    const persistBatch = (batch: VisitorReviewType[]): void => {
      if (batch.length === 0) return;
      persistTail = persistTail
        .then(async () => {
          if (!restaurantId) return;
          const { newReviews } = await this.restaurants.persistReviewBatch(
            restaurantId,
            batch.map((r) => ({ ...r, externalId: r.externalId ?? null })),
          );
          if (newReviews.length > 0) {
            // 크롤 run 을 부모로 연결 — 요약 run 이 어느 크롤에서 파생됐는지
            // 어드민 로그 화면에서 추적 가능하게. 매핑 조회 대신 스냅샷 사용
            // — run 마감 후 settle 돼도 연결이 끊기지 않는다.
            this.summaries.queueSummariesForReviews(
              placeId,
              newReviews.map((r) => r.id),
              jobId,
              null,
              runId,
            );
          }
          this.logStepWithRun(runId, 'paginating_visitor', 'info', '리뷰 배치 영속', {
            batchSize: batch.length,
            newCount: newReviews.length,
            dedupedCount: batch.length - newReviews.length,
          });
          this.emit(jobId, {
            type: 'visitor_batch',
            reviews: batch,
            addedCount: newReviews.length,
            persistedReviews: newReviews.map((r) => ({
              id: r.id,
              externalId: r.externalId,
              authorName: r.authorName,
              rating: r.rating,
              body: r.body,
              visitedAt: r.visitedAt,
              imageUrls: r.imageUrls,
              videos: r.videos ?? [],
              fetchedAt: r.fetchedAt,
            })),
          });
        })
        .catch((err) => {
          // Don't drop subsequent batches — log and continue. Crawl errors
          // are handled by the outer try/catch via the adapter; this branch
          // is purely DB/AI fallout.
          this.logStepWithRun(runId, 'paginating_visitor', 'error', '리뷰 배치 저장 실패', {
            batchSize: batch.length,
            error: err instanceof Error ? err.message : String(err),
          });
        });
    };

    try {
      // Pre-flight: when the user asked for a recrawl/update, find the
      // existing restaurant row first. Recrawl wipes its reviews so the new
      // crawl starts from a clean slate; update collects the existing review
      // keys so the adapter can stop pagination once it sees only known rows.
      //
      // try 안에 두는 이유 — 여기서 던지면 catch 의 finishJobRun 을 거치지
      // 못해 run 이 영구 'running' 으로 남고 runIdsByJob 매핑이 누수된다.
      if (mode !== 'create') {
        const r = await this.restaurants.findByPlaceId(placeId);
        if (r) {
          restaurantId = r.id;
          if (mode === 'recrawl') {
            await this.restaurants.clearReviewsAndSummaries(r.id);
            this.logStep(jobId, 'launching', 'info', '재크롤 — 기존 리뷰/요약 삭제', {
              restaurantId: r.id,
            });
          } else {
            existingKeys = await this.restaurants.getExistingReviewKeys(r.id);
          }
        }
      }

      const data = await fetchNaverPlaceWithPlaywright(placeId, canonicalUrl, {
        signal,
        onStage: (stage) => this.emit(jobId, { type: 'progress', stage }),
        onPartial: (partial) => {
          this.emit(jobId, { type: 'partial', data: partial });
          // Capture the restaurant row id as soon as we have enough data.
          // Subsequent visitor batches need this. Persist serially via the
          // persist tail so we don't race with onVisitorBatch callbacks.
          persistTail = persistTail.then(async () => {
            const { id } = await this.restaurants.upsertRestaurantFromCrawl(partial);
            restaurantId = id;
          });
        },
        onVisitorProgress: (count) =>
          this.emit(jobId, { type: 'visitor_progress', count }),
        onVisitorBatch: (batch) => persistBatch(batch),
        existingReviewKeys: existingKeys,
      });

      const fetchedAt = new Date().toISOString();
      this.cache.set(placeId, {
        data,
        fetchedAt,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });

      // Re-upsert the restaurant with the now-complete snapshot. All reviews
      // (SSR initial + wire pages) have already been persisted via
      // onVisitorBatch — the adapter emits the SSR-injected first page from
      // the document response handler — so no review-level final pass needed.
      persistTail = persistTail.then(async () => {
        const { id } = await this.restaurants.upsertRestaurantFromCrawl(data);
        restaurantId = id;
      });

      // Wait for any outstanding persistence to finish before emitting
      // 'done'. The UI relies on the visitor_batch addedCount sequence to
      // drive its summary progress UI; emitting 'done' first would race.
      await persistTail;

      // 등록(또는 갱신) 직후 자동 매칭 후크. 신규 canonical 이라면 cross-source
      // 후보를 검토 큐에 적재. 기존 canonical 이면 idempotent skip.
      if (restaurantId) {
        await this.generateProposalsForRestaurant(restaurantId);
        // 추가로 다이닝코드 자동 매칭 시도 — 같은 가게 DC 행이 외부에 존재하면
        // 저장 + 머지까지 자동(C안 정책). 백그라운드 실행 — Naver done 이벤트를
        // 막지 않게 fire-and-forget. saveDiningcodeShop 자체가 수 초 단위 작업.
        const canonicalIdForAuto =
          await this.restaurants.getCanonicalIdForRestaurant(restaurantId);
        if (canonicalIdForAuto) {
          void this.tryAutoMatchDiningcode(canonicalIdForAuto);
        }
      }

      this.logStep(jobId, 'done', 'info', '크롤 완료', {
        durationMs: Date.now() - startedAt,
        reviewCount: data.visitorReviews.length,
        restaurantId,
      });
      await this.finishJobRun(jobId, {
        status: 'done',
        meta: {
          durationMs: Date.now() - startedAt,
          reviewCount: data.visitorReviews.length,
          restaurantId,
        },
      });

      this.emit(jobId, {
        type: 'done',
        result: {
          ok: true,
          data,
          fetchedAt,
          durationMs: Date.now() - startedAt,
        },
      });
    } catch (e) {
      const { error, message } = this.classifyAdapterError(e);
      // run 마감 전에 잔여 persist 작업을 드레인 — 마감과 동시에 runIdsByJob
      // 매핑이 사라져, 이후 settle 되는 배치의 스텝 로그가 무음 탈락하는 것
      // 을 막는다 (실패 자체는 각 링크의 catch 가 이미 삼킨다).
      await persistTail.catch(() => undefined);
      this.logStep(jobId, 'finalizing', 'error', `크롤 실패: ${message}`, {
        errorCode: error,
        durationMs: Date.now() - startedAt,
      });
      // 실행 중 취소(cancelled)는 실패가 아닌 의도된 중단 — 상태를 분리해
      // 자동 분석이 따라붙지 않게 한다.
      await this.finishJobRun(jobId, {
        status: error === 'cancelled' ? 'cancelled' : 'failed',
        errorCode: error,
        errorMessage: message,
      });
      this.emit(jobId, { type: 'error', error, message });
    }
  }

  // Centralized event-emit helper — assigns sequence numbers and timestamps
  // so the registry/route don't have to duplicate this for every event.
  private emit(jobId: string, partial: EmitInput): void {
    const event = {
      ...partial,
      seq: this.nextSeq++,
      at: new Date().toISOString(),
    } as CrawlEventType;
    this.registry.addEvent(jobId, event);
  }

  private normalizeUrlError(e: unknown, rawUrl: string): StartCrawlResultType | null {
    if (e instanceof UnsupportedUrlError) {
      return {
        ok: false,
        error: 'unsupported_format',
        message: e.message,
        triedUrl: rawUrl,
      };
    }
    if (e instanceof RedirectFailedError) {
      return {
        ok: false,
        error: 'redirect_failed',
        message: e.message,
        triedUrl: rawUrl,
      };
    }
    return null;
  }

  private classifyAdapterError(e: unknown): {
    error: CrawlErrorCodeType;
    message: string;
  } {
    if (e instanceof CrawlCancelledError) {
      return { error: 'cancelled', message: '요청이 취소되었습니다.' };
    }
    if (e instanceof PlaceParseError) {
      return { error: 'parse_failed', message: e.message };
    }
    if (e instanceof PlaywrightFetchError) {
      return { error: 'fetch_failed', message: e.message };
    }
    return {
      error: 'fetch_failed',
      message: e instanceof Error ? e.message : 'unknown error',
    };
  }
}

// Re-exported for tests that want to assert against the same stage set.
export type { CrawlStageType, CrawlNaverPlaceResultType };
