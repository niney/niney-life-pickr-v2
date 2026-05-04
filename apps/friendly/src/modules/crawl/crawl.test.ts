import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import {
  normalizeToPlaceId,
  RedirectFailedError,
  UnsupportedUrlError,
} from './url-normalizer.js';

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
