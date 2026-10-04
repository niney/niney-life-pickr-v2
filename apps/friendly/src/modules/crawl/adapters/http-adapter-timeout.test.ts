import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A-8 — 호출자 signal(잡 취소)을 받아도 어댑터 자체 타임아웃이 살아 있어야 한다. 예전엔 signal 을
// 받으면 타임아웃을 꺼서 업스트림이 멈추면 undici 기본(~300초)까지 매달렸다(랜덤 크롤·자동 발견).
// 네트워크는 abort 될 때까지 응답하지 않는 fetch 스텁으로 흉내 낸다(외부 호출 없음).

const hangingFetch = vi.fn(
  (_input: string | URL | Request, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (!signal) return;
      if (signal.aborted) {
        reject(signal.reason);
        return;
      }
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }),
);

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('CRAWL_SEARCH_HTTP_TIMEOUT_MS', '60');
  vi.stubEnv('CRAWL_REVIEW_STATS_HTTP_TIMEOUT_MS', '60');
  vi.stubGlobal('fetch', hangingFetch);
  hangingFetch.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('naver HTTP adapters — signal + timeout 합성', () => {
  it('검색: 호출자 signal 이 있어도 자체 타임아웃으로 끝난다', async () => {
    const { searchPlacesViaMapNaver, NaverSearchError } = await import('./naver-search.http.adapter.js');
    const job = new AbortController(); // 잡은 취소되지 않는다
    const t0 = Date.now();
    await expect(searchPlacesViaMapNaver('강남 맛집', { signal: job.signal })).rejects.toBeInstanceOf(
      NaverSearchError,
    );
    expect(Date.now() - t0).toBeLessThan(3_000);
    expect(hangingFetch).toHaveBeenCalledTimes(1);
  });

  it('검색: 잡 취소는 타임아웃보다 먼저 즉시 전파된다', async () => {
    const { searchPlacesViaMapNaver } = await import('./naver-search.http.adapter.js');
    const job = new AbortController();
    const pending = searchPlacesViaMapNaver('강남 맛집', { signal: job.signal });
    job.abort();
    await expect(pending).rejects.toThrow(/fetch failed/);
  });

  it('리뷰 통계: 호출자 signal 이 있어도 자체 타임아웃 뒤 null(best-effort)', async () => {
    const { fetchVisitorReviewStats } = await import('./naver-review-stats.http.adapter.js');
    const job = new AbortController();
    const t0 = Date.now();
    await expect(fetchVisitorReviewStats('20630562', { signal: job.signal })).resolves.toBeNull();
    expect(Date.now() - t0).toBeLessThan(3_000);
  });
});
