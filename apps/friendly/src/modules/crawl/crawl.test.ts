import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import {
  normalizeToPlaceId,
  RedirectFailedError,
  UnsupportedUrlError,
} from './url-normalizer.js';

// 어댑터는 실제 네이버를 호출하므로 라우트 가드/검증 테스트에서는 mock.
// ADMIN + 정상 q 가 통과되는 케이스에서만 호출되어 미리 정의한 결과를 반환.
vi.mock('./adapters/naver-search.playwright.adapter.js', () => ({
  searchPlacesViaMapNaver: vi.fn(async (q: string) => [
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
      rawSourceUrl: 'https://map.naver.com/p/entry/place/mock-1',
    },
  ]),
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

  it('admin + valid q → 200 with items + source', async () => {
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
    expect(body.source).toBe('playwright');
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items[0]?.placeId).toBe('mock-1');
  });
});
