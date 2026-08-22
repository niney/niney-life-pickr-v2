import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureApi } from './client.js';
import { buildFoodAdminListQuery, buildFoodImportRunEventsUrl, foodApi } from './food.api.js';

// food API 의 "경로·쿼리 조립" 계약을 고정한다 — 서버(FoodAdminListQuery)가 받는 키 이름과
// boolean 직렬화('1'/'0'), undefined 생략, 빈 q 생략, 고정 키 순서(캐시 키 안정), 그리고
// SSE URL 의 ?token= 규약. 네트워크는 fetch 를 스텁해 URL/헤더/바디만 본다.

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const stubFetch = (body: unknown) => {
  const fetchMock = vi.fn((_input: string | URL | Request, _init?: RequestInit) =>
    Promise.resolve(jsonResponse(body)),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

afterEach(() => {
  vi.unstubAllGlobals();
  configureApi({ baseUrl: '' });
});

describe('buildFoodAdminListQuery', () => {
  it('undefined 와 빈 q 는 생략하고 boolean 은 1/0 으로 직렬화한다', () => {
    expect(buildFoodAdminListQuery()).toBe('');
    expect(buildFoodAdminListQuery({ q: '   ', dishType: undefined, active: undefined })).toBe('');
    expect(
      buildFoodAdminListQuery({
        q: ' 김치 ',
        dishType: 'stew',
        mainIngredient: 'pork',
        cuisine: 'korean',
        source: 'manual',
        active: true,
        unclassified: false,
        sort: 'name',
        offset: 50,
        limit: 50,
      }),
    ).toBe(
      'q=%EA%B9%80%EC%B9%98&dishType=stew&mainIngredient=pork&cuisine=korean&source=manual&active=1&unclassified=0&sort=name&offset=50&limit=50',
    );
  });

  it('키 순서는 입력 순서와 무관하게 고정이다(같은 조건 → 같은 문자열)', () => {
    expect(buildFoodAdminListQuery({ limit: 10, source: 'manual', q: 'a' })).toBe(
      'q=a&source=manual&limit=10',
    );
    expect(buildFoodAdminListQuery({ q: 'a', limit: 10, source: 'manual' })).toBe(
      'q=a&source=manual&limit=10',
    );
  });
});

describe('foodApi', () => {
  it('search — q 를 trim 해 싣고 limit 이 있으면 함께, 토큰은 Authorization 헤더로', async () => {
    const fetchMock = stubFetch({ items: [] });
    configureApi({ baseUrl: 'http://api.test', getToken: () => 'tok' });

    await foodApi.search(' 비빔밥 ', 5);

    const call = fetchMock.mock.calls[0]!;
    expect(call[0]).toBe('http://api.test/api/v1/food/search?q=%EB%B9%84%EB%B9%94%EB%B0%A5&limit=5');
    expect((call[1]?.headers as Headers).get('Authorization')).toBe('Bearer tok');
  });

  it('adminList — 조건이 없으면 ? 없이, 있으면 조립한 쿼리스트링으로 GET', async () => {
    const fetchMock = stubFetch({ items: [], total: 0 });
    await foodApi.adminList();
    await foodApi.adminList({ unclassified: true, limit: 25 });
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      '/api/v1/admin/food/items',
      '/api/v1/admin/food/items?unclassified=1&limit=25',
    ]);
  });

  it('adminUpdate — PATCH /items/:id 에 부분 갱신 바디(null 로 분류 비우기 포함)', async () => {
    const fetchMock = stubFetch({});
    await foodApi.adminUpdate('f1', { cuisine: null, aliases: ['a'] });
    const call = fetchMock.mock.calls[0]!;
    expect(call[0]).toBe('/api/v1/admin/food/items/f1');
    expect(call[1]?.method).toBe('PATCH');
    expect(call[1]?.body).toBe(JSON.stringify({ cuisine: null, aliases: ['a'] }));
  });

  it('runImportNow — 인자가 없으면 body 없이 POST(저장 설정으로), 있으면 JSON body 로 오버라이드', async () => {
    const fetchMock = stubFetch({});
    await foodApi.runImportNow();
    await foodApi.runImportNow({ sources: ['menu-canonical'], classify: false });
    const [first, second] = fetchMock.mock.calls;
    expect(first?.[0]).toBe('/api/v1/admin/food/import/run');
    expect(first?.[1]?.method).toBe('POST');
    expect(first?.[1]?.body).toBeUndefined();
    expect((first?.[1]?.headers as Headers).has('Content-Type')).toBe(false);
    expect(second?.[1]?.body).toBe(JSON.stringify({ sources: ['menu-canonical'], classify: false }));
    expect((second?.[1]?.headers as Headers).get('Content-Type')).toBe('application/json');
  });
});

describe('buildFoodImportRunEventsUrl', () => {
  it('baseUrl + 경로 + ?token= — 토큰이 없으면 쿼리 없이', async () => {
    configureApi({ baseUrl: 'http://api.test', getToken: () => 'tok' });
    expect(await buildFoodImportRunEventsUrl()).toBe(
      'http://api.test/api/v1/admin/food/import/run-events?token=tok',
    );
    configureApi({ baseUrl: '' });
    expect(await buildFoodImportRunEventsUrl()).toBe('/api/v1/admin/food/import/run-events');
  });
});
