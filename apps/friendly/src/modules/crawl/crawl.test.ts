import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import { seedAuthUsers } from '../../test-utils/seed-users.js';
import {
  normalizeToPlaceId,
  RedirectFailedError,
  UnsupportedUrlError,
} from './url-normalizer.js';

// 어댑터는 실제 네이버 nx-api 를 호출하므로 라우트 가드/검증 테스트에서는 mock.
// ADMIN + 정상 q 가 통과되는 케이스에서만 호출되어 미리 정의한 결과를 반환.
// bbox 인자가 어댑터에 전달되는지도 함께 검증 — `lastCallOptions` 노출.
const lastCallOptions: { query: string; options: unknown }[] = [];
vi.mock('./adapters/naver-search.http.adapter.js', () => ({
  searchPlacesViaMapNaver: vi.fn(async (q: string, options: unknown) => {
    lastCallOptions.push({ query: q, options });
    return [
      {
        placeId: 'mock-1',
        name: `${q} 결과`,
        category: '음식점',
        address: '주소',
        roadAddress: '도로명주소',
        lat: 37.5,
        lng: 127,
        phone: null,
        thumbnailUrl: null,
        reviewCount: 0,
        distance: '350m',
        rawSourceUrl: 'https://map.naver.com/p/entry/place/mock-1',
      },
    ];
  }),
  closeSearchBrowser: vi.fn(async () => undefined),
}));

describe('normalizeToPlaceId', () => {
  it('extracts placeId from /p/entry/place/{id}', async () => {
    const r = await normalizeToPlaceId('https://map.naver.com/p/entry/place/12345678');
    expect(r.placeId).toBe('12345678');
    expect(r.canonicalUrl).toBe('https://m.place.naver.com/restaurant/12345678/home');
  });

  it('extracts placeId from m.place.naver.com restaurant URL', async () => {
    const r = await normalizeToPlaceId('https://m.place.naver.com/restaurant/98765/home');
    expect(r.placeId).toBe('98765');
  });

  it('extracts placeId from query string', async () => {
    const r = await normalizeToPlaceId('https://map.naver.com/p/search/foo?id=42');
    expect(r.placeId).toBe('42');
  });

  it('rejects non-naver hosts', async () => {
    await expect(normalizeToPlaceId('https://example.com/place/1')).rejects.toBeInstanceOf(
      UnsupportedUrlError,
    );
  });

  it('rejects malformed URLs', async () => {
    await expect(normalizeToPlaceId('not-a-url')).rejects.toBeInstanceOf(UnsupportedUrlError);
  });

  it('rejects naver URLs without a place id', async () => {
    await expect(normalizeToPlaceId('https://map.naver.com/p/search/foo')).rejects.toBeInstanceOf(
      UnsupportedUrlError,
    );
  });

  it('exports a RedirectFailedError type for short-URL failures', () => {
    expect(new RedirectFailedError().name).toBe('RedirectFailedError');
  });
});

describe('POST /api/v1/admin/crawl/naver-place — guards', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    await seedAuthUsers(app, [
      { id: 'admin1', role: 'ADMIN' },
      { id: 'u1', role: 'USER' },
    ]);
  });

  afterAll(async () => {
    await app.close();
  });

  it('401 without token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/crawl/naver-place',
      payload: { url: 'https://map.naver.com/p/entry/place/1' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('403 with non-admin token', async () => {
    const token = app.jwt.sign({ userId: 'u1', email: 'u@x.com', role: 'USER' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/crawl/naver-place',
      headers: { Authorization: `Bearer ${token}` },
      payload: { url: 'https://map.naver.com/p/entry/place/1' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('admin + unsupported host → 200 with ok:false unsupported_format', async () => {
    const token = app.jwt.sign({ userId: 'admin1', email: 'a@x.com', role: 'ADMIN' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/crawl/naver-place',
      headers: { Authorization: `Bearer ${token}` },
      payload: { url: 'https://example.com/place/1' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: boolean; error?: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe('unsupported_format');
  });
});

describe('GET /api/v1/admin/crawl/search — guards & shape', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    await seedAuthUsers(app, [
      { id: 'admin1', role: 'ADMIN' },
      { id: 'u1', role: 'USER' },
    ]);
  });

  afterAll(async () => {
    await app.close();
  });

  it('401 without token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/crawl/search?q=foo',
    });
    expect(res.statusCode).toBe(401);
  });

  it('403 with non-admin token', async () => {
    const token = app.jwt.sign({ userId: 'u1', email: 'u@x.com', role: 'USER' });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/crawl/search?q=foo',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('400 with empty q (zod validation)', async () => {
    const token = app.jwt.sign({ userId: 'admin1', email: 'a@x.com', role: 'ADMIN' });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/crawl/search?q=',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(400);
  });

  it('admin + valid q → 200 with items + source=http', async () => {
    const token = app.jwt.sign({ userId: 'admin1', email: 'a@x.com', role: 'ADMIN' });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/crawl/search?q=강남역+맛집',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      items: Array<{ placeId: string; name: string }>;
      source: string;
    };
    expect(body.source).toBe('http');
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items[0]?.placeId).toBe('mock-1');
  });

  it('bbox 쿼리가 어댑터에 그대로 전달된다', async () => {
    lastCallOptions.length = 0;
    const token = app.jwt.sign({ userId: 'admin1', email: 'a@x.com', role: 'ADMIN' });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/crawl/search?q=foo&bbox=127.01,37.48,127.04,37.51',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(lastCallOptions).toHaveLength(1);
    expect(lastCallOptions[0]?.query).toBe('foo');
    const opts = lastCallOptions[0]?.options as { bbox?: string };
    expect(opts?.bbox).toBe('127.01,37.48,127.04,37.51');
  });
});

// A-1·A-3·A-V1 — CrawlService 는 app 전역 singleton 하나. 랜덤 크롤·라우트가 같은 인스턴스를 쓰고,
// 그 인스턴스의 요약 서비스가 app.summaries(→ app.reviewSearch 배선)여야 요약 중지·enrich 중복
// 가드·enrich 완료→군집화 체인이 모든 크롤 경로에 똑같이 걸린다.
// A-4 — 잡 목록은 완료 잡의 리뷰 본문을 빼고 내린다. A-6 — 테이블링 일괄 저장은 actor 당 1잡.
describe('crawl singleton wiring & job list', () => {
  let app: FastifyInstance;
  let adminToken: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    await seedAuthUsers(app, [{ id: 'admin-sg', role: 'ADMIN' }]);
    adminToken = app.jwt.sign({ userId: 'admin-sg', email: 'a@x.com', role: 'ADMIN' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('app.crawl 하나를 랜덤 크롤이 공유하고, 요약·검색은 앱 singleton 으로 배선된다', () => {
    const crawl = app.crawl as unknown as { summaries: unknown };
    expect(app.crawl).toBeDefined();
    expect((app.randomCrawl as unknown as { deps: { crawl: unknown } }).deps.crawl).toBe(app.crawl);
    expect(crawl.summaries).toBe(app.summaries);
    expect((app.summaries as unknown as { opts: { reviewSearch?: unknown } }).opts.reviewSearch).toBe(
      app.reviewSearch,
    );
  });

  it('GET /admin/crawl/jobs 는 완료 잡의 visitorReviews 만 비우고 나머지는 그대로 싣는다 — 단건 조회는 리뷰까지', async () => {
    const { jobRegistry } = await import('./job-registry.js');
    const review = (i: number) => ({
      authorName: `작성자${i}`,
      rating: 5,
      body: `리뷰 본문 ${i} `.repeat(30),
      visitedAt: '2026-09-01',
      imageUrls: [`https://pup-review-phinf.pstatic.net/${i}.jpg`],
      videos: [],
      externalId: `ext-${i}`,
    });
    const { id } = jobRegistry.create({
      url: 'https://map.naver.com/p/entry/place/123456',
      placeId: '123456',
      actorId: 'admin-sg',
    });
    jobRegistry.markActive(id);
    jobRegistry.addEvent(id, {
      seq: 1,
      type: 'done',
      at: new Date().toISOString(),
      result: {
        ok: true,
        data: {
          placeId: '123456',
          name: '목록 경량화 가게',
          category: '한식',
          address: null,
          roadAddress: null,
          phone: null,
          businessHours: null,
          latitude: 37.5,
          longitude: 127,
          imageUrls: [],
          rating: 4.5,
          reviewCount: 200,
          menus: [],
          reviewStats: null,
          blogReviews: [],
          visitorReviews: Array.from({ length: 200 }, (_, i) => review(i)),
          rawSourceUrl: 'https://m.place.naver.com/restaurant/123456/home',
        },
        fetchedAt: new Date().toISOString(),
        durationMs: 10,
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/crawl/jobs',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      jobs: Array<{ id: string; status: string; result: { ok: boolean; data?: { name: string; visitorReviews: unknown[]; reviewCount: number } } | null }>;
    };
    const job = body.jobs.find((j) => j.id === id)!;
    expect(job.status).toBe('done');
    expect(job.result?.ok).toBe(true);
    expect(job.result?.data?.name).toBe('목록 경량화 가게');
    expect(job.result?.data?.reviewCount).toBe(200);
    expect(job.result?.data?.visitorReviews).toEqual([]);
    expect(res.body.length).toBeLessThan(5_000);
    // 레지스트리(SSE 'done' 재생 원본)는 그대로 — 목록 응답만 가볍게.
    const kept = jobRegistry.get(id)?.result;
    expect(kept?.ok && kept.data.visitorReviews).toHaveLength(200);

    // 단건 조회는 리뷰 본문까지 싣는다 — 목록으로 종료를 알아챈 화면(SSE 'done' 을 놓쳤거나 끝난 잡을 다시 연 경우)이
    // 완전한 결과를 여기서 받는다.
    const one = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/crawl/jobs/${id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(one.statusCode).toBe(200);
    const full = one.json() as {
      id: string;
      status: string;
      result: { ok: boolean; data?: { name: string; visitorReviews: Array<{ externalId: string }> } } | null;
    };
    expect(full).toMatchObject({ id, status: 'done', result: { ok: true, data: { name: '목록 경량화 가게' } } });
    expect(full.result?.data?.visitorReviews).toHaveLength(200);
    expect(full.result?.data?.visitorReviews[0]?.externalId).toBe('ext-0');

    // 레지스트리에 없는(만료된) 잡은 404, 남의 잡은 403.
    const missing = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/crawl/jobs/no-such-job',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(missing.statusCode).toBe(404);
    const other = jobRegistry.create({ url: 'https://map.naver.com/p/entry/place/777', placeId: '777', actorId: 'someone-else' });
    const forbidden = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/crawl/jobs/${other.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(forbidden.statusCode).toBe(403);
    jobRegistry.cancel(other.id, 'someone-else');
  });

  it('POST 테이블링 일괄 저장은 같은 actor 의 진행 중 잡이 있으면 409', async () => {
    const { tablingBulkSaveRegistry } = await import('./tabling-bulk-save-registry.js');
    // 진행 중 잡을 레지스트리에 직접 만든다(러너는 돌리지 않음 — 외부 호출 없음).
    tablingBulkSaveRegistry.create({ actorId: 'admin-sg', idxs: [1] });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/crawl/tabling/bulk-save/jobs',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { idxs: [2, 3] },
    });
    expect(res.statusCode).toBe(409);
  });
});
