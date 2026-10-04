import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NaverPlaceDataType } from '@repo/api-contract';
import type * as NaverPlaceAdapter from './adapters/naver-place.playwright.adapter.js';
import { CrawlService } from './crawl.service.js';
import { JobRegistry, MAX_CONCURRENT_PER_ACTOR } from './job-registry.js';
import type { RestaurantService } from '../restaurant/restaurant.service.js';
import type { SummaryService } from '../summary/summary.service.js';

// CrawlService 의 결과 캐시 상한(A-1)과 actor 대기열 공유(A-V1)를 고정한다. Playwright 어댑터는
// 가짜로 바꿔(외부 호출 없음) 가게별로 완료 시점을 테스트가 쥔다. DB 도 쓰지 않는다(가짜 저장소).

const adapterCalls: string[] = [];
const holds = new Map<string, { promise: Promise<void>; release: () => void }>();

vi.mock('./adapters/naver-place.playwright.adapter.js', async (importOriginal) => {
  const actual = await importOriginal<typeof NaverPlaceAdapter>();
  return {
    ...actual,
    fetchNaverPlaceWithPlaywright: vi.fn(
      async (placeId: string, _url: string, hooks?: { signal?: AbortSignal }) => {
        adapterCalls.push(placeId);
        const hold = holds.get(placeId);
        if (hold) await hold.promise;
        if (hooks?.signal?.aborted) throw new actual.CrawlCancelledError();
        return fakePlace(placeId);
      },
    ),
  };
});

const fakePlace = (placeId: string): NaverPlaceDataType => ({
  placeId,
  name: `가게 ${placeId}`,
  category: null,
  address: null,
  roadAddress: null,
  phone: null,
  businessHours: null,
  latitude: null,
  longitude: null,
  imageUrls: [],
  rating: null,
  reviewCount: null,
  menus: [],
  reviewStats: null,
  blogReviews: [],
  visitorReviews: [],
  rawSourceUrl: `https://m.place.naver.com/restaurant/${placeId}/home`,
});

const hold = (placeId: string): (() => void) => {
  let release!: () => void;
  const promise = new Promise<void>((r) => {
    release = r;
  });
  holds.set(placeId, { promise, release });
  return release;
};

const fakeRestaurants = {
  findByPlaceId: async () => null,
  upsertRestaurantFromCrawl: async (d: NaverPlaceDataType) => ({ id: `rest-${d.placeId}`, keptMenuCount: 0 }),
  persistReviewBatch: async () => ({ newReviews: [] }),
  getCanonicalIdForRestaurant: async () => null,
} as unknown as RestaurantService;
const fakeSummaries = { queueSummariesForReviews: () => undefined } as unknown as SummaryService;

const makeService = (registry: JobRegistry) =>
  new CrawlService(fakeRestaurants, fakeSummaries, registry, null, null, null);
const url = (placeId: string) => `https://map.naver.com/p/entry/place/${placeId}`;
const ACTOR = 'admin-1';

beforeEach(() => {
  adapterCalls.length = 0;
  holds.clear();
});

describe('CrawlService 대기열 공유 (A-V1)', () => {
  it('다른 인스턴스의 잡이 슬롯을 비우면 대기열의 잡이 이어서 시작된다', async () => {
    const registry = new JobRegistry();
    const x = makeService(registry);
    const y = makeService(registry);
    const releases: Array<() => void> = [];
    for (let i = 0; i < MAX_CONCURRENT_PER_ACTOR; i += 1) {
      releases.push(hold(`10${i}`));
      const r = await x.startCrawl(url(`10${i}`), ACTOR);
      expect(r).toMatchObject({ ok: true });
    }
    expect(registry.countActive(ACTOR)).toBe(MAX_CONCURRENT_PER_ACTOR);

    // 자동 발견·여행 시드 등록 같은 다른 진입점이 같은 actor 로 크롤을 시작 → 대기열.
    const queued = await y.startCrawl(url('901'), ACTOR);
    expect(queued).toMatchObject({ ok: true, queued: true });
    if (!queued.ok) throw new Error('unreachable');
    expect(registry.pendingCount(ACTOR)).toBe(1);

    for (const release of releases) release();
    // 예전엔 y 의 대기열이 인스턴스 필드라 x 의 잡이 끝나도 영영 시작되지 않았다(timeout).
    await expect(registry.waitForTerminal(queued.jobId, 2_000)).resolves.toBe('terminal');
    expect(registry.get(queued.jobId)?.status).toBe('done');
    expect(adapterCalls).toContain('901');
    expect(registry.pendingCount()).toBe(0);
  });

  it('대기 중 취소는 대기열에서 빼고 abort 한다 — 슬롯이 나도 좀비로 시작되지 않는다', async () => {
    const registry = new JobRegistry();
    const x = makeService(registry);
    const y = makeService(registry);
    const releases: Array<() => void> = [];
    for (let i = 0; i < MAX_CONCURRENT_PER_ACTOR; i += 1) {
      releases.push(hold(`10${i}`));
      await x.startCrawl(url(`10${i}`), ACTOR);
    }
    const queued = await y.startCrawl(url('902'), ACTOR);
    if (!queued.ok) throw new Error('unreachable');

    // 어느 인스턴스로 취소하든 같은 대기열을 본다.
    expect(x.cancel(queued.jobId, ACTOR)).toBe(true);
    const job = registry.get(queued.jobId);
    expect(job?.status).toBe('cancelled');
    expect(job?.abort.signal.aborted).toBe(true);
    expect(registry.pendingCount(ACTOR)).toBe(0);

    for (const release of releases) release();
    for (let i = 0; i < MAX_CONCURRENT_PER_ACTOR; i += 1) {
      const id = registry.list(ACTOR).find((j) => j.placeId === `10${i}`)!.id;
      await registry.waitForTerminal(id, 2_000);
    }
    expect(adapterCalls).not.toContain('902');
  });
});

describe('CrawlService 결과 캐시 상한 (A-1)', () => {
  it('최근 크롤만 30초 캐시하고 개수 상한(30)을 넘으면 오래된 가게부터 버린다', async () => {
    const registry = new JobRegistry();
    const svc = makeService(registry);
    for (let i = 0; i < 40; i += 1) {
      const r = await svc.startCrawl(url(`5${String(i).padStart(2, '0')}`), ACTOR);
      if (!r.ok) throw new Error('unreachable');
      await registry.waitForTerminal(r.jobId, 2_000);
    }
    expect(adapterCalls).toHaveLength(40);

    // 가장 최근 가게 — create 재요청은 캐시 히트로 즉시 끝난다(어댑터 호출 없음).
    const hit = await svc.startCrawl(url('539'), ACTOR);
    if (!hit.ok) throw new Error('unreachable');
    const hitJob = registry.get(hit.jobId)!;
    expect(hitJob.status).toBe('done');
    expect(hitJob.events.some((e) => e.type === 'progress' && e.message === 'cache hit')).toBe(true);
    expect(adapterCalls).toHaveLength(40);

    // 가장 오래된 가게 — 상한 밖으로 밀려나 다시 크롤한다(예전 Map 은 무한히 들고 있었다).
    const miss = await svc.startCrawl(url('500'), ACTOR);
    if (!miss.ok) throw new Error('unreachable');
    await registry.waitForTerminal(miss.jobId, 2_000);
    expect(adapterCalls).toHaveLength(41);
    expect(adapterCalls.at(-1)).toBe('500');
  });
});
