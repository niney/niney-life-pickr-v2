import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureApi } from './client.js';
import { reviewSearchApi } from './review-search.api.js';

// 공개 리뷰 질문 — 서버가 게스트 기기 일일 한도(usage-quota 'review-ask')를 x-guest-key 로 센다.
// 키가 없으면 IP 기준이라 같은 IP(CGNAT) 사용자들이 한도를 나눠 쓰게 되므로 헤더 첨부를 고정한다.

const stubFetch = () => {
  const fetchMock = vi.fn((_input: string | URL | Request, _init?: RequestInit) =>
    Promise.resolve(
      new Response(
        JSON.stringify({ answer: 'a', confidence: 'none', hyde: null, citations: [], verification: null }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

afterEach(() => {
  vi.unstubAllGlobals();
  configureApi({ baseUrl: '' });
});

describe('reviewSearchApi.publicAsk', () => {
  it('게스트 키를 x-guest-key 헤더로 보낸다', async () => {
    const fetchMock = stubFetch();
    await reviewSearchApi.publicAsk('12345', '양 많아요?', 'guest-key-0001');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('/api/v1/restaurants/12345/qa');
    expect(new Headers(init?.headers).get('x-guest-key')).toBe('guest-key-0001');
    expect(JSON.parse(String(init?.body))).toEqual({ query: '양 많아요?' });
  });

  it('게스트 키가 없으면 헤더를 붙이지 않는다', async () => {
    const fetchMock = stubFetch();
    await reviewSearchApi.publicAsk('12345', '양 많아요?');
    const [, init] = fetchMock.mock.calls[0]!;
    expect(new Headers(init?.headers).get('x-guest-key')).toBeNull();
  });
});
