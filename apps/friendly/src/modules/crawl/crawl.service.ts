import type {
  CrawlEventType,
  CrawlErrorCodeType,
  CrawlModeType,
  CrawlNaverPlaceResultType,
  CrawlStageType,
  NaverPlaceDataType,
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
import {
  jobRegistry,
  MaxConcurrentJobsError,
  type JobRegistry,
} from './job-registry.js';
import {
  normalizeToPlaceId,
  RedirectFailedError,
  UnsupportedUrlError,
} from './url-normalizer.js';
import type { RestaurantService } from '../restaurant/restaurant.service.js';
import type { SummaryService } from '../summary/summary.service.js';

const CACHE_TTL_MS = 30_000;
const RATE_LIMIT_WINDOW_MS = 1_000;

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

export class CrawlService {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly lastCallByActor = new Map<string, number>();
  private readonly registry: JobRegistry;
  private readonly restaurants: RestaurantService;
  private readonly summaries: SummaryService;
  private nextSeq = 1;

  constructor(
    restaurants: RestaurantService,
    summaries: SummaryService,
    registry: JobRegistry = jobRegistry,
  ) {
    this.registry = registry;
    this.restaurants = restaurants;
    this.summaries = summaries;
  }

  // Kick off a crawl. Returns immediately with the jobId; the actual work
  // runs in the background and reports progress through the registry's
  // event stream. Caching, rate-limiting, in-flight dedupe, and concurrency
  // caps all happen here before any Playwright work starts.
  async startCrawl(
    rawUrl: string,
    actorId: string,
    mode: CrawlModeType = 'create',
  ): Promise<StartCrawlResultType> {
    const now = Date.now();

    const last = this.lastCallByActor.get(actorId) ?? 0;
    if (now - last < RATE_LIMIT_WINDOW_MS) {
      return {
        ok: false,
        error: 'rate_limited',
        message: '잠시 후 다시 시도해 주세요.',
        triedUrl: rawUrl,
      };
    }
    this.lastCallByActor.set(actorId, now);

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
        const created = this.tryCreateJob(rawUrl, normalized.placeId, actorId);
        if (created.kind === 'error') return created.payload;
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

    const created = this.tryCreateJob(rawUrl, normalized.placeId, actorId);
    if (created.kind === 'error') return created.payload;

    // Fire-and-forget — runJob handles all errors by emitting events; nothing
    // here should reject. We tag the promise to silence unhandled-rejection
    // warnings just in case.
    void this.runJob(
      created.id,
      created.signal,
      normalized.placeId,
      normalized.canonicalUrl,
      mode,
    ).catch(() => undefined);

    return { ok: true, jobId: created.id, deduped: false };
  }

  cancel(jobId: string, actorId: string): boolean {
    return this.registry.cancel(jobId, actorId);
  }

  private tryCreateJob(
    url: string,
    placeId: string,
    actorId: string,
  ):
    | { kind: 'ok'; id: string; signal: AbortSignal }
    | { kind: 'error'; payload: StartCrawlResultType } {
    try {
      const { id, abortSignal } = this.registry.create({ url, placeId, actorId });
      return { kind: 'ok', id, signal: abortSignal };
    } catch (e) {
      if (e instanceof MaxConcurrentJobsError) {
        return {
          kind: 'error',
          payload: {
            ok: false,
            error: 'max_concurrent',
            message: `동시 실행 제한 (${e.cap}개) 초과`,
            triedUrl: url,
          },
        };
      }
      throw e;
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
          const { newReviewIds } = await this.restaurants.persistReviewBatch(
            restaurantId,
            batch.map((r) => ({ ...r, externalId: r.externalId ?? null })),
          );
          if (newReviewIds.length > 0) {
            this.summaries.queueSummariesForReviews(newReviewIds);
          }
          this.emit(jobId, {
            type: 'visitor_batch',
            reviews: batch,
            addedCount: newReviewIds.length,
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

      // Final pass — Apollo's initial render (~20 reviews) is included in
      // `data.visitorReviews` but never went through onVisitorBatch. Run it
      // through the same persistence path; dedup makes the call idempotent.
      persistBatch(data.visitorReviews);
      // Also re-upsert the restaurant with the now-complete snapshot.
      persistTail = persistTail.then(async () => {
        const { id } = await this.restaurants.upsertRestaurantFromCrawl(data);
        restaurantId = id;
      });

      // Wait for any outstanding persistence to finish before emitting
      // 'done'. The UI relies on the visitor_batch addedCount sequence to
      // drive its summary progress UI; emitting 'done' first would race.
      await persistTail;

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
