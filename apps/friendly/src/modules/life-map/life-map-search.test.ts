import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// 라우트 계약·에러 매핑 — 어댑터는 모듈 단위 목(실 업스트림 호출 없음). 어댑터·서비스 단위 테스트는
// life-map-search.service.test.ts. vworld 키는 buildApp import 전에 주입(설정>지도 DB 우선 + env 폴백).
vi.hoisted(() => {
  process.env.VWORLD_API_KEY = process.env.VWORLD_API_KEY || 'test-vworld-key';
});
const mocks = vi.hoisted(() => ({ searchVworldPlaces: vi.fn(), searchVworldAddresses: vi.fn() }));
vi.mock('./vworld-search.adapter.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./vworld-search.adapter.js')>();
  return { ...actual, ...mocks };
});

import type { LifeMapSearchResultType } from '@repo/api-contract';
import { buildApp } from '../../app.js';
import { VworldSearchAuthError, VworldSearchError } from './vworld-search.adapter.js';

describe('GET /api/v1/life-map/search', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it('200 계약 — 장소·주소 병합 목록', async () => {
    mocks.searchVworldPlaces.mockResolvedValueOnce([
      { kind: 'place', id: 'POI1', title: '강남역', category: '철도시설 > 지하철역', road: '서울특별시 강남구 강남대로 396', parcel: null, lat: 37.49798, lng: 127.02775 },
    ]);
    mocks.searchVworldAddresses.mockResolvedValueOnce([]);
    const res = await app.inject({ method: 'GET', url: '/api/v1/life-map/search?q=' + encodeURIComponent('강남역 라우트') });
    expect(res.statusCode).toBe(200);
    const body = res.json<LifeMapSearchResultType>();
    expect(body.enabled).toBe(true);
    expect(body.items[0]).toMatchObject({ kind: 'place', title: '강남역', subtitle: '지하철역 · 서울특별시 강남구 강남대로 396' });
  });

  it('2자 미만은 400, 인증 오류는 503, 업스트림 실패는 502', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/v1/life-map/search?q=a' })).statusCode).toBe(400);
    mocks.searchVworldPlaces.mockRejectedValueOnce(new VworldSearchAuthError('vworld 검색 인증/한도 오류(INCORRECT_KEY)', 'https://x?key=***'));
    mocks.searchVworldAddresses.mockResolvedValueOnce([]);
    const auth = await app.inject({ method: 'GET', url: '/api/v1/life-map/search?q=' + encodeURIComponent('인증오류 검색어') });
    expect(auth.statusCode).toBe(503);
    mocks.searchVworldPlaces.mockRejectedValueOnce(new VworldSearchError('vworld 검색 HTTP 502', 502, 'https://x?key=***'));
    mocks.searchVworldAddresses.mockResolvedValueOnce([]);
    const down = await app.inject({ method: 'GET', url: '/api/v1/life-map/search?q=' + encodeURIComponent('다운 검색어') });
    expect(down.statusCode).toBe(502);
  });
});
