import { describe, expect, it, beforeEach } from 'vitest';
import type { CrawlEventType, StartCrawlResultType } from '@repo/api-contract';
import { JobRegistry } from '../crawl/job-registry.js';
import { AutoDiscoverRegistry } from './auto-discover-registry.js';
import {
  AUTO_DISCOVER_GROUP_SIZE,
  AutoDiscoverService,
  type AutoDiscoverServiceDeps,
} from './auto-discover.service.js';

// 자동 발견 서비스 단위 테스트. CrawlService/RestaurantService/AiConfigService 는
// 가짜로 주입 — 검색·AI·등록은 모두 메모리 안에서 결정론적으로 동작한다.

interface FakeCrawl {
  startCrawl: (url: string, actorId: string) => Promise<StartCrawlResultType>;
  cancel: (jobId: string, actorId: string) => boolean;
  // 테스트 용 — 끝낼 jobId 기록.
  cancelled: Set<string>;
  // 자동으로 done 이벤트 발사 여부. false 면 다음 그룹이 시작 안 되어 await 가
  // 멈추기 때문에 cancel 테스트 외에는 true.
  autoFinish: boolean;
}

const makeFakeRestaurants = (registered: string[] = []) => {
  const reg = new Set(registered);
  // 등록 완료된 placeId 들. 호출자가 startCrawl 후 등록 성공으로 보이게 추가.
  const created = new Map<string, { id: string }>();
  return {
    findByPlaceId: async (
      placeId: string,
    ): Promise<{ id: string } | null> => {
      return created.get(placeId) ?? null;
    },
    findRegisteredByPlaceIds: async (ids: string[]): Promise<Set<string>> => {
      const out = new Set<string>();
      for (const id of ids) if (reg.has(id)) out.add(id);
      return out;
    },
    // 테스트 헬퍼.
    addRegistered: (placeId: string) => reg.add(placeId),
    addCreated: (placeId: string, restaurantId: string) =>
      created.set(placeId, { id: restaurantId }),
  };
};

const makeFakeCrawl = (
  crawlRegistry: JobRegistry,
  restaurants: ReturnType<typeof makeFakeRestaurants>,
  opts: { autoFinish?: boolean; failFor?: Set<string> } = {},
): FakeCrawl => {
  const autoFinish = opts.autoFinish ?? true;
  const failFor = opts.failFor ?? new Set<string>();
  const cancelled = new Set<string>();
  return {
    autoFinish,
    cancelled,
    cancel: (jobId, actorId) => {
      cancelled.add(jobId);
      const out = crawlRegistry.cancel(jobId, actorId);
      // 큐드 잡 취소 시 'cancelled' error 이벤트를 명시적으로 발사 — 실서비스의
      // CrawlService.cancel 이 하는 일과 동일.
      if (out === 'queued-cancelled') {
        crawlRegistry.addEvent(jobId, {
          seq: 1,
          type: 'error',
          at: new Date().toISOString(),
          error: 'cancelled',
          message: 'queued cancel',
        });
      }
      return out !== 'noop';
    },
    startCrawl: async (url, actorId) => {
      // url 에서 placeId 추출 (rawSourceUrl pattern: .../place/<id>).
      const m = url.match(/place\/([^/]+)$/);
      const placeId = m?.[1] ?? 'unknown';
      const { id: jobId } = crawlRegistry.create({
        url,
        placeId,
        actorId,
      });
      crawlRegistry.markActive(jobId);
      if (autoFinish) {
        if (failFor.has(placeId)) {
          const ev: CrawlEventType = {
            seq: 1,
            type: 'error',
            at: new Date().toISOString(),
            error: 'parse_failed',
            message: 'mock fail',
          };
          crawlRegistry.addEvent(jobId, ev);
        } else {
          // 등록 성공으로 표시.
          restaurants.addCreated(placeId, `rest-${placeId}`);
          const ev: CrawlEventType = {
            seq: 1,
            type: 'done',
            at: new Date().toISOString(),
            result: {
              ok: true,
              data: {
                placeId,
              } as never,
              fetchedAt: new Date().toISOString(),
              durationMs: 1,
            },
          };
          crawlRegistry.addEvent(jobId, ev);
        }
      }
      return { ok: true, jobId, deduped: false };
    },
  };
};

const makeSearchOverride = (
  byKeyword: Record<string, Array<{ placeId: string; name?: string }>>,
) => {
  return async (keyword: string) => {
    const items = byKeyword[keyword] ?? [];
    return items.map((it) => ({
      placeId: it.placeId,
      name: it.name ?? `가게 ${it.placeId}`,
      category: '한식',
      address: null,
      roadAddress: null,
      lat: 37.5,
      lng: 127,
      phone: null,
      thumbnailUrl: null,
      reviewCount: null,
      distance: null,
      rawSourceUrl: `https://map.naver.com/p/entry/place/${it.placeId}`,
    }));
  };
};

const buildService = (
  overrides: Partial<AutoDiscoverServiceDeps> & {
    crawlRegistry: JobRegistry;
    crawl: FakeCrawl;
    restaurants: ReturnType<typeof makeFakeRestaurants>;
  },
) => {
  const registry = new AutoDiscoverRegistry();
  const deps: AutoDiscoverServiceDeps = {
    restaurants: overrides.restaurants as never,
    aiConfig: {} as never,
    crawl: overrides.crawl as never,
    registry,
    crawlRegistry: overrides.crawlRegistry,
    // AI 미설정 시 fallback 사용 — 모든 테스트 기본값.
    resolveProviderOverride: async () => null,
    searchOverride: overrides.searchOverride,
  };
  const service = new AutoDiscoverService(deps);
  return { service, registry };
};

describe('AutoDiscoverService', () => {
  let crawlRegistry: JobRegistry;
  beforeEach(() => {
    crawlRegistry = new JobRegistry();
  });

  it('AI 실패 시 fallback 키워드 8개로 진행', async () => {
    const restaurants = makeFakeRestaurants();
    const crawl = makeFakeCrawl(crawlRegistry, restaurants);
    // 검색은 빈 결과 — 키워드 8 개만 검증.
    const search = makeSearchOverride({});
    const { service, registry } = buildService({
      crawlRegistry,
      crawl,
      restaurants,
      searchOverride: search,
    });
    const { id } = registry.create({
      actorId: 'u1',
      input: { q: '강남역', categories: [], targetCount: 5 },
    });
    await service.runAutoDiscover(id, 'u1');
    const snap = registry.get(id, 'u1')!;
    expect(snap.keywords).toHaveLength(8);
    // fallback 은 모두 "강남역" 으로 시작.
    expect(snap.keywords.every((k) => k.keyword.startsWith('강남역'))).toBe(true);
    expect(snap.state).toBe('done');
  });

  it('검색 결과 dedupe — 키워드들 사이에 같은 placeId 가 등장해도 후보는 한 번만', async () => {
    const restaurants = makeFakeRestaurants();
    const crawl = makeFakeCrawl(crawlRegistry, restaurants);
    // fallback 키워드 8 개를 모두 알기 어렵지만, searchOverride 가 keyword 무시
    // 하고 항상 같은 후보 반환하도록 하면 dedupe 검증 가능.
    const search = async () => [
      {
        placeId: 'p1',
        name: '가게 1',
        category: null,
        address: null,
        roadAddress: null,
        lat: 37.5,
        lng: 127,
        phone: null,
        thumbnailUrl: null,
        reviewCount: null,
        distance: null,
        rawSourceUrl: 'https://map.naver.com/p/entry/place/p1',
      },
      {
        placeId: 'p2',
        name: '가게 2',
        category: null,
        address: null,
        roadAddress: null,
        lat: 37.5,
        lng: 127,
        phone: null,
        thumbnailUrl: null,
        reviewCount: null,
        distance: null,
        rawSourceUrl: 'https://map.naver.com/p/entry/place/p2',
      },
    ];
    const { service, registry } = buildService({
      crawlRegistry,
      crawl,
      restaurants,
      searchOverride: search,
    });
    const { id } = registry.create({
      actorId: 'u1',
      input: { q: '강남역', categories: [], targetCount: 5 },
    });
    await service.runAutoDiscover(id, 'u1');
    const snap = registry.get(id, 'u1')!;
    // 모든 키워드가 같은 후보 2 개를 돌려줘도 후보 리스트는 2 개.
    expect(snap.candidates.map((c) => c.placeId).sort()).toEqual(['p1', 'p2']);
  });

  it('이미 등록된 placeId 는 skipped(already_registered)', async () => {
    const restaurants = makeFakeRestaurants(['p1']);
    const crawl = makeFakeCrawl(crawlRegistry, restaurants);
    const search = async () => [
      {
        placeId: 'p1',
        name: '등록된 가게',
        category: null,
        address: null,
        roadAddress: null,
        lat: 37.5,
        lng: 127,
        phone: null,
        thumbnailUrl: null,
        reviewCount: null,
        distance: null,
        rawSourceUrl: 'https://map.naver.com/p/entry/place/p1',
      },
      {
        placeId: 'p2',
        name: '새 가게',
        category: null,
        address: null,
        roadAddress: null,
        lat: 37.5,
        lng: 127,
        phone: null,
        thumbnailUrl: null,
        reviewCount: null,
        distance: null,
        rawSourceUrl: 'https://map.naver.com/p/entry/place/p2',
      },
    ];
    const { service, registry } = buildService({
      crawlRegistry,
      crawl,
      restaurants,
      searchOverride: search,
    });
    const { id } = registry.create({
      actorId: 'u1',
      input: { q: '강남역', categories: [], targetCount: 5 },
    });
    await service.runAutoDiscover(id, 'u1');
    const snap = registry.get(id, 'u1')!;
    const p1 = snap.candidates.find((c) => c.placeId === 'p1')!;
    const p2 = snap.candidates.find((c) => c.placeId === 'p2')!;
    expect(p1.state).toBe('skipped');
    expect(p1.skipReason).toBe('already_registered');
    expect(p1.groupIndex).toBe(-1);
    expect(p2.state).toBe('done');
    expect(p2.restaurantId).toBe('rest-p2');
  });

  it('targetCount 도달 시 잔여 그룹 후보는 skipped(target_reached)', async () => {
    const restaurants = makeFakeRestaurants();
    const crawl = makeFakeCrawl(crawlRegistry, restaurants);
    // GROUP_SIZE*2 = 10 개 후보, targetCount=5 → 첫 그룹 끝나면 두 번째 그룹은
    // 시작 자체를 안 한다.
    const items = Array.from({ length: AUTO_DISCOVER_GROUP_SIZE * 2 }).map(
      (_, i) => ({ placeId: `q${i}` }),
    );
    const search = async () =>
      items.map((it) => ({
        placeId: it.placeId,
        name: it.placeId,
        category: null,
        address: null,
        roadAddress: null,
        lat: 37.5,
        lng: 127,
        phone: null,
        thumbnailUrl: null,
        reviewCount: null,
        distance: null,
        rawSourceUrl: `https://map.naver.com/p/entry/place/${it.placeId}`,
      }));
    const { service, registry } = buildService({
      crawlRegistry,
      crawl,
      restaurants,
      searchOverride: search,
    });
    const { id } = registry.create({
      actorId: 'u1',
      input: { q: '강남역', categories: [], targetCount: AUTO_DISCOVER_GROUP_SIZE },
    });
    await service.runAutoDiscover(id, 'u1');
    const snap = registry.get(id, 'u1')!;
    const doneCount = snap.candidates.filter((c) => c.state === 'done').length;
    const skippedTarget = snap.candidates.filter(
      (c) => c.state === 'skipped' && c.skipReason === 'target_reached',
    ).length;
    expect(doneCount).toBe(AUTO_DISCOVER_GROUP_SIZE);
    expect(skippedTarget).toBe(AUTO_DISCOVER_GROUP_SIZE);
    expect(snap.newlyRegistered).toBe(AUTO_DISCOVER_GROUP_SIZE);
    expect(snap.state).toBe('done');
  });

  it('cancel 시 진행 중 그룹의 Naver 잡들에 cancel 호출 + 잔여 skipped(cancelled)', async () => {
    const restaurants = makeFakeRestaurants();
    // autoFinish=false 라 startCrawl 후 done 이벤트가 안 발사된다. 한 그룹의
    // crawl 들이 모두 await 상태로 멈춰있고, 다른 비동기 틱에서 cancel 을
    // 호출하면 abort 신호가 그룹의 잡들에 전파되어야 한다.
    const crawl = makeFakeCrawl(crawlRegistry, restaurants, {
      autoFinish: false,
    });
    const items = Array.from({ length: AUTO_DISCOVER_GROUP_SIZE * 2 }).map(
      (_, i) => ({ placeId: `c${i}` }),
    );
    const search = async () =>
      items.map((it) => ({
        placeId: it.placeId,
        name: it.placeId,
        category: null,
        address: null,
        roadAddress: null,
        lat: 37.5,
        lng: 127,
        phone: null,
        thumbnailUrl: null,
        reviewCount: null,
        distance: null,
        rawSourceUrl: `https://map.naver.com/p/entry/place/${it.placeId}`,
      }));
    const { service, registry } = buildService({
      crawlRegistry,
      crawl,
      restaurants,
      searchOverride: search,
    });
    const { id } = registry.create({
      actorId: 'u1',
      input: { q: '강남역', categories: [], targetCount: 100 },
    });
    const runPromise = service.runAutoDiscover(id, 'u1');
    // crawl 의 startCrawl 이 5 번 호출되어 첫 그룹이 await 상태에 진입할 때까지
    // 잠시 양보. crawlRegistry 의 잡 수로 진입 시점 감지.
    while (true) {
      const counts = crawlRegistry.list('u1').length;
      if (counts >= AUTO_DISCOVER_GROUP_SIZE) break;
      await new Promise((r) => setTimeout(r, 5));
    }
    // cancel — abortSignal 이 켜진다. waitForCrawlTerminal 들은 여전히 await 중,
    // 하지만 자동 발견 service 가 그룹 완료 직후 abortSignal 을 체크하여 진행 중
    // 잡들에 cancel 을 전파해야 한다 — 그러려면 잡들이 끝나야 한다. 그러므로
    // 잡들이 끝나도록 error 이벤트를 외부에서 흘려보낸다.
    registry.cancel(id, 'u1');
    for (const j of crawlRegistry.list('u1')) {
      crawlRegistry.addEvent(j.id, {
        seq: 1,
        type: 'error',
        at: new Date().toISOString(),
        error: 'cancelled',
        message: 'forced for test',
      });
    }
    await runPromise;
    const snap = registry.get(id, 'u1')!;
    expect(snap.state).toBe('cancelled');
    // 첫 그룹의 5 개에 대해 service 가 cancel 호출했어야 한다.
    expect(crawl.cancelled.size).toBe(AUTO_DISCOVER_GROUP_SIZE);
    // 두 번째 그룹 5 개는 시작 자체를 안 했다 → skipped(cancelled).
    const skippedCancelled = snap.candidates.filter(
      (c) => c.state === 'skipped' && c.skipReason === 'cancelled',
    ).length;
    expect(skippedCancelled).toBe(AUTO_DISCOVER_GROUP_SIZE);
  });

  it('AutoDiscoverRegistry: per-actor 1잡 — 두 번째 create 직전엔 findInFlightByActor 가 첫 잡을 반환', () => {
    const registry = new AutoDiscoverRegistry();
    const { id } = registry.create({
      actorId: 'u1',
      input: { q: '강남역', categories: [], targetCount: 5 },
    });
    registry.markRunning(id);
    expect(registry.findInFlightByActor('u1')).toBe(id);
    expect(registry.findInFlightByActor('u2')).toBeNull();
  });
});
