import type { CrawlNaverPlaceResultType, NaverPlaceDataType } from '@repo/api-contract';
import {
  fetchNaverPlaceWithPlaywright,
  PlaceParseError,
  PlaywrightFetchError,
} from './adapters/naver-place.playwright.adapter.js';
import {
  normalizeToPlaceId,
  RedirectFailedError,
  UnsupportedUrlError,
} from './url-normalizer.js';

const CACHE_TTL_MS = 30_000;
const RATE_LIMIT_WINDOW_MS = 1_000;

interface CacheEntry {
  data: NaverPlaceDataType;
  fetchedAt: string;
  expiresAt: number;
}

export class CrawlService {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly lastCallByActor = new Map<string, number>();

  async crawlNaverPlace(rawUrl: string, actorId: string): Promise<CrawlNaverPlaceResultType> {
    const startedAt = Date.now();

    const last = this.lastCallByActor.get(actorId) ?? 0;
    if (startedAt - last < RATE_LIMIT_WINDOW_MS) {
      return {
        ok: false,
        error: 'rate_limited',
        message: '잠시 후 다시 시도해 주세요.',
        triedUrl: rawUrl,
      };
    }
    this.lastCallByActor.set(actorId, startedAt);

    let normalized: Awaited<ReturnType<typeof normalizeToPlaceId>>;
    try {
      normalized = await normalizeToPlaceId(rawUrl);
    } catch (e) {
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
      return {
        ok: false,
        error: 'fetch_failed',
        message: e instanceof Error ? e.message : 'unknown error',
        triedUrl: rawUrl,
      };
    }

    const cached = this.cache.get(normalized.placeId);
    if (cached && cached.expiresAt > startedAt) {
      return {
        ok: true,
        data: cached.data,
        fetchedAt: cached.fetchedAt,
        durationMs: Date.now() - startedAt,
      };
    }

    try {
      const data = await fetchNaverPlaceWithPlaywright(
        normalized.placeId,
        normalized.canonicalUrl,
      );
      const fetchedAt = new Date().toISOString();
      this.cache.set(normalized.placeId, {
        data,
        fetchedAt,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });
      return {
        ok: true,
        data,
        fetchedAt,
        durationMs: Date.now() - startedAt,
      };
    } catch (e) {
      if (e instanceof PlaceParseError) {
        return {
          ok: false,
          error: 'parse_failed',
          message: e.message,
          triedUrl: normalized.canonicalUrl,
        };
      }
      if (e instanceof PlaywrightFetchError) {
        return {
          ok: false,
          error: 'fetch_failed',
          message: e.message,
          triedUrl: normalized.canonicalUrl,
        };
      }
      return {
        ok: false,
        error: 'fetch_failed',
        message: e instanceof Error ? e.message : 'unknown error',
        triedUrl: normalized.canonicalUrl,
      };
    }
  }
}
