import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  apiFetch,
  configureApi,
  handleUnauthorizedForCurrentSession,
} from './client.js';

const unauthorizedResponse = (): Response =>
  new Response(
    JSON.stringify({ statusCode: 401, error: 'Unauthorized', message: '로그인이 필요합니다.' }),
    { status: 401, headers: { 'Content-Type': 'application/json' } },
  );

afterEach(() => {
  configureApi({ baseUrl: '' });
  vi.unstubAllGlobals();
});

describe('api client unauthorized session boundary', () => {
  it('401 콜백에 해당 요청이 실제 사용한 토큰을 전달한다', async () => {
    const onUnauthorized = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(unauthorizedResponse());
    vi.stubGlobal('fetch', fetchMock);
    configureApi({
      baseUrl: 'https://api.test',
      getToken: () => 'token-a',
      onUnauthorized,
    });

    await expect(apiFetch('/private')).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).toHaveBeenCalledWith('token-a');
    expect(
      ((fetchMock.mock.calls[0]?.[1] as RequestInit).headers as Headers).get('Authorization'),
    ).toBe('Bearer token-a');
  });

  it('요청 중 설정이 바뀌어도 이전 요청의 지연 401은 이전 콜백과 토큰으로 귀속한다', async () => {
    let resolveFetch!: (response: Response) => void;
    const fetchMock = vi.fn(
      () => new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const callbackA = vi.fn();
    const callbackB = vi.fn();
    configureApi({ baseUrl: 'https://a.test', getToken: () => 'token-a', onUnauthorized: callbackA });

    const pending = apiFetch('/private');
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    configureApi({ baseUrl: 'https://b.test', getToken: () => 'token-b', onUnauthorized: callbackB });
    resolveFetch(unauthorizedResponse());

    await expect(pending).rejects.toBeInstanceOf(ApiError);
    expect(callbackA).toHaveBeenCalledWith('token-a');
    expect(callbackB).not.toHaveBeenCalled();
  });

  it('A 캐시는 A의 현재 401에서 지우되 B 로그인 뒤 도착한 A의 401은 B 상태를 보존한다', () => {
    let currentToken: string | null = 'token-a';
    let cachedPrincipal: string | null = 'A';
    const clearCurrent = vi.fn(() => {
      cachedPrincipal = null;
      currentToken = null;
    });

    expect(
      handleUnauthorizedForCurrentSession({
        requestToken: 'token-a',
        getCurrentToken: () => currentToken,
        onCurrentSessionUnauthorized: clearCurrent,
      }),
    ).toBe(true);
    expect(cachedPrincipal).toBeNull();

    currentToken = 'token-b';
    cachedPrincipal = 'B';
    expect(
      handleUnauthorizedForCurrentSession({
        requestToken: 'token-a',
        getCurrentToken: () => currentToken,
        onCurrentSessionUnauthorized: clearCurrent,
      }),
    ).toBe(false);
    expect(currentToken).toBe('token-b');
    expect(cachedPrincipal).toBe('B');
    expect(clearCurrent).toHaveBeenCalledTimes(1);
  });
});
