import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MEAL_DATA_DELETE_CONFIRMATION,
  MEAL_RECOMMENDATIONS_DELETE_CONFIRMATION,
} from '@repo/api-contract';
import { configureApi } from './client.js';
import { mealApi } from './meal.api.js';

const jsonResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

afterEach(() => {
  vi.unstubAllGlobals();
  configureApi({ baseUrl: '' });
});

describe('mealApi 데이터 관리', () => {
  it('내보내기는 인증 GET 전용 경로를 호출한다', async () => {
    const fetchMock = vi.fn((_input: string | URL | Request, _init?: RequestInit) =>
      Promise.resolve(jsonResponse({ entries: [] })),
    );
    vi.stubGlobal('fetch', fetchMock);
    configureApi({ baseUrl: 'https://api.test', getToken: () => 'meal-token' });

    await mealApi.exportData();

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.test/api/v1/meals/data/export');
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBeUndefined();
    expect((init.headers as Headers).get('Authorization')).toBe('Bearer meal-token');
  });

  it('전체 삭제는 정확 확인 문자열을 DELETE JSON body 로 보낸다', async () => {
    const fetchMock = vi.fn((_input: string | URL | Request, _init?: RequestInit) =>
      Promise.resolve(jsonResponse({ deleted: {} })),
    );
    vi.stubGlobal('fetch', fetchMock);

    await mealApi.deleteAllData({ confirmation: MEAL_DATA_DELETE_CONFIRMATION });

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/meals/data');
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('DELETE');
    expect(init.body).toBe(JSON.stringify({ confirmation: MEAL_DATA_DELETE_CONFIRMATION }));
    expect((init.headers as Headers).get('Content-Type')).toBe('application/json');
  });

  it('추천 삭제는 단건 DELETE, 모두 삭제는 확인 문자열을 DELETE JSON body 로 보낸다', async () => {
    const fetchMock = vi.fn((_input: string | URL | Request, init?: RequestInit) =>
      Promise.resolve(
        init?.body
          ? jsonResponse({ deleted: { recommendations: 2, recommendationEvents: 1 } })
          : new Response(null, { status: 204 }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await mealApi.removeRecommendation('rec-1');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/meals/recommendations/rec-1');
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).method).toBe('DELETE');

    const res = await mealApi.deleteAllRecommendations({
      confirmation: MEAL_RECOMMENDATIONS_DELETE_CONFIRMATION,
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/v1/meals/recommendations');
    const init = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(init.method).toBe('DELETE');
    expect(init.body).toBe(
      JSON.stringify({ confirmation: MEAL_RECOMMENDATIONS_DELETE_CONFIRMATION }),
    );
    expect(res.deleted.recommendations).toBe(2);
  });
});
