import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureApi } from './client.js';
import { buildFoodMergeConflictListQuery, foodApi } from './food.api.js';

const jsonResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });

afterEach(() => {
  vi.unstubAllGlobals();
  configureApi({ baseUrl: '' });
});

describe('food merge conflict admin api', () => {
  it('필터를 고정 순서로 조립하고 빈 조건에는 ?를 붙이지 않는다', async () => {
    expect(buildFoodMergeConflictListQuery()).toBe('');
    expect(buildFoodMergeConflictListQuery({ limit: 20, status: 'open', offset: 40 })).toBe(
      'status=open&offset=40&limit=20',
    );

    const fetchMock = vi.fn((_input: string | URL | Request, _init?: RequestInit) =>
      Promise.resolve(jsonResponse({ items: [], total: 0 })),
    );
    vi.stubGlobal('fetch', fetchMock);
    await foodApi.adminMergeConflicts();
    await foodApi.adminMergeConflicts({ status: 'dismissed', limit: 10 });
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      '/api/v1/admin/food/merge-conflicts',
      '/api/v1/admin/food/merge-conflicts?status=dismissed&limit=10',
    ]);
  });

  it('해결 액션은 allowlist body로 단건 PATCH한다', async () => {
    const fetchMock = vi.fn((_input: string | URL | Request, _init?: RequestInit) =>
      Promise.resolve(jsonResponse({})),
    );
    vi.stubGlobal('fetch', fetchMock);

    await foodApi.resolveMergeConflict('conflict-1', { action: 'accept_incoming' });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/admin/food/merge-conflicts/conflict-1');
    expect(init?.method).toBe('PATCH');
    expect(init?.body).toBe(JSON.stringify({ action: 'accept_incoming' }));
  });
});
