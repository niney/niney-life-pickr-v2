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
  fetchCatchtableShop,
  fetchCatchtableShopMenus,
  fetchCatchtableShopReviewOverview,
} from './adapters/catchtable-shop.playwright.adapter.js';
import { jobRegistry, type JobRegistry } from './job-registry.js';
import { diningcodeBulkSaveRegistry } from './diningcode-bulk-save-registry.js';
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
  private readonly pending: PendingStart[] = [];
  private nextSeq = 1;

  constructor(
    restaurants: RestaurantService,
    summaries: SummaryService,
    registry: JobRegistry = jobRegistry,
    // null 이면 후보 큐 생성 skip — 테스트가 단순화 위해 생략할 때 사용.
    proposals: ProposalService | null = null,
    canonical: CanonicalService | null = null,
  ) {
    this.registry = registry;
    this.restaurants = restaurants;
    this.summaries = summaries;
    this.proposals = proposals;
    this.canonical = canonical;
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
        return { ok: true, jobId: created.id, deduped: false };
      }
    }

    const { id: jobId, abortSignal } = this.registry.create({
      url: rawUrl,
      placeId: normalized.placeId,
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
  async saveDiningcodeShop(vRid: string): Promise<SaveDiningcodeShopResultType> {
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

    for (const vRid of vRids) {
      if (abortSignal?.aborted) {
        diningcodeBulkSaveRegistry.finishItem(jobId, vRid, {
          skipped: true,
          reason: '잡이 취소되어 시작 전 건너뜀',
        });
        continue;
      }
      diningcodeBulkSaveRegistry.markItemStart(jobId, vRid);
      try {
        const result = await this.saveDiningcodeShop(vRid);
        diningcodeBulkSaveRegistry.finishItem(jobId, vRid, {
          ok: true,
          restaurantId: result.restaurantId,
          fetchedPages: result.fetchedPages,
          newReviewCount: result.newReviewCount,
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        diningcodeBulkSaveRegistry.finishItem(jobId, vRid, {
          ok: false,
          errorCode: 'save_failed',
          errorMessage: message,
        });
      }
    }
    diningcodeBulkSaveRegistry.markFinished(jobId);
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

    // Pre-flight: when the user asked for a recrawl/update, find the
    // existing restaurant row first. Recrawl wipes its reviews so the new
    // crawl starts from a clean slate; update collects the existing review
    // keys so the adapter can stop pagination once it sees only known rows.
    let restaurantId: string | null = null;
    let existingKeys: ExistingReviewKeys | undefined;
    if (mode !== 'create') {
      const r = await this.restaurants.findByPlaceId(placeId);
      if (r) {
        restaurantId = r.id;
        if (mode === 'recrawl') {
          await this.restaurants.clearReviewsAndSummaries(r.id);
        } else {
          existingKeys = await this.restaurants.getExistingReviewKeys(r.id);
        }
      }
    }

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
            this.summaries.queueSummariesForReviews(
              placeId,
              newReviews.map((r) => r.id),
            );
          }
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
          // eslint-disable-next-line no-console
          console.error('[crawl] persistBatch failed', err);
        });
    };

    try {
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
