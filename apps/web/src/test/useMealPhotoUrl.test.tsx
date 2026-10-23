import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { useMealPhotoUrl, useMealPhotoUrls } from '@repo/shared';
import { server } from '~/test/msw';

// 식단 사진 URL(@repo/shared) — 인증 fetch 로 받은 blob 을 objectURL 로 바꿔 쿼리 캐시에 두는 계약: 같은 사진은
// 한 번만 받아 여러 화면·재마운트가 함께 쓰고, 캐시에서 빠질 때(로그인·로그아웃이 캐시를 비울 때 포함) objectURL 을
// 해제한다. 예전엔 화면마다 effect 로 따로 받고 언마운트 때 해제해, 목록이 다시 마운트될 때마다 다시 받았다.
// (shared 는 node 환경이라 훅 렌더가 필요한 이 테스트는 소비처인 web 에 둔다.)

const THUMB_URL = '/api/v1/meals/photos/:token/thumb';
const TOKEN = 'a'.repeat(8);

const imageResponse = () =>
  HttpResponse.arrayBuffer(new ArrayBuffer(8), { headers: { 'Content-Type': 'image/jpeg' } });

const makeWrapper = (client: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };

// jsdom 의 URL 에는 objectURL 이 없다 — 만든 순서대로 번호를 붙여 주는 스텁으로 바꿔 발급·해제를 센다.
const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
let created: string[] = [];
let revoked: string[] = [];

beforeEach(() => {
  created = [];
  revoked = [];
  URL.createObjectURL = vi.fn(() => {
    const url = `blob:test/${created.length + 1}`;
    created.push(url);
    return url;
  });
  URL.revokeObjectURL = vi.fn((url: string) => {
    revoked.push(url);
  });
});
afterEach(() => {
  URL.createObjectURL = original.create;
  URL.revokeObjectURL = original.revoke;
});

describe('useMealPhotoUrl', () => {
  it('같은 사진을 쓰는 화면이 여럿이어도, 떠났다 다시 마운트돼도 한 번만 받는다', async () => {
    let requests = 0;
    server.use(
      http.get(THUMB_URL, () => {
        requests += 1;
        return imageResponse();
      }),
    );
    const wrapper = makeWrapper(new QueryClient());
    const first = renderHook(() => useMealPhotoUrl(TOKEN), { wrapper });
    const second = renderHook(() => useMealPhotoUrl(TOKEN), { wrapper });
    await waitFor(() => expect(first.result.current.url).toBe('blob:test/1'));
    expect(second.result.current.url).toBe('blob:test/1');

    first.unmount();
    second.unmount();
    // 화면이 떠나도 캐시에 있는 동안은 해제하지 않는다 — 다시 마운트되면 기다림 없이 같은 URL.
    expect(revoked).toEqual([]);
    const third = renderHook(() => useMealPhotoUrl(TOKEN), { wrapper });
    expect(third.result.current).toEqual({ url: 'blob:test/1', error: null });
    expect(requests).toBe(1);
  });

  it('캐시가 비워지면(로그인·로그아웃·식단 전체 삭제) objectURL 을 해제한다', async () => {
    server.use(http.get(THUMB_URL, () => imageResponse()));
    const client = new QueryClient();
    const { result, unmount } = renderHook(() => useMealPhotoUrl(TOKEN), { wrapper: makeWrapper(client) });
    await waitFor(() => expect(result.current.url).toBe('blob:test/1'));
    unmount();
    expect(revoked).toEqual([]);

    client.removeQueries({ queryKey: ['meal'] });
    expect(revoked).toEqual(['blob:test/1']);
  });

  it('받는 사이 캐시가 비워지면 뒤늦게 만든 objectURL 도 해제한다', async () => {
    // 응답을 붙잡아 두고 그 사이에 캐시를 비운다(사진을 받는 중에 로그아웃한 상황).
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started = false;
    server.use(
      http.get(THUMB_URL, async () => {
        started = true;
        await gate;
        return imageResponse();
      }),
    );
    const client = new QueryClient();
    renderHook(() => useMealPhotoUrl(TOKEN), { wrapper: makeWrapper(client) });
    await waitFor(() => expect(started).toBe(true));

    client.clear();
    release();
    // 버려질 결과라 캐시에 들어가지 못한다 — 만든 자리에서 해제하지 않으면 페이지를 닫을 때까지 남는다.
    await waitFor(() => expect(created).toEqual(['blob:test/1']));
    await waitFor(() => expect(revoked).toEqual(['blob:test/1']));
  });

  it('enabled=false 면 받지 않고, 다른 화면이 받아 둔 URL 은 그대로 돌려준다', async () => {
    let requests = 0;
    server.use(
      http.get(THUMB_URL, () => {
        requests += 1;
        return imageResponse();
      }),
    );
    const wrapper = makeWrapper(new QueryClient());
    const off = renderHook(() => useMealPhotoUrl(TOKEN, { enabled: false }), { wrapper });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(requests).toBe(0);
    expect(off.result.current).toEqual({ url: null, error: null });

    const on = renderHook(() => useMealPhotoUrl(TOKEN), { wrapper });
    await waitFor(() => expect(on.result.current.url).toBe('blob:test/1'));
    await waitFor(() => expect(off.result.current.url).toBe('blob:test/1'));
    expect(requests).toBe(1);
  });

  it('실패는 재시도 없이 바로 알리고, 다시 마운트되면 다시 받는다', async () => {
    let requests = 0;
    server.use(
      http.get(THUMB_URL, () => {
        requests += 1;
        return requests === 1 ? new HttpResponse(null, { status: 500 }) : imageResponse();
      }),
    );
    const wrapper = makeWrapper(new QueryClient());
    const first = renderHook(() => useMealPhotoUrl(TOKEN), { wrapper });
    await waitFor(() => expect(first.result.current.error).toBe('사진을 불러오지 못했습니다 (500)'));
    expect(first.result.current.url).toBeNull();
    expect(requests).toBe(1);

    first.unmount();
    const second = renderHook(() => useMealPhotoUrl(TOKEN), { wrapper });
    await waitFor(() => expect(second.result.current.url).toBe('blob:test/1'));
    expect(second.result.current.error).toBeNull();
    expect(requests).toBe(2);
  });

  it('토큰이 없으면 요청도 URL 도 없다', async () => {
    const wrapper = makeWrapper(new QueryClient());
    const { result } = renderHook(() => useMealPhotoUrl(null), { wrapper });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(result.current).toEqual({ url: null, error: null });
    expect(created).toEqual([]);
  });
});

describe('useMealPhotoUrls', () => {
  it('장마다 enabled 를 줘 고른 장만 받고, 같은 캐시라 한 장씩 받은 URL 을 함께 쓴다', async () => {
    const asked: string[] = [];
    server.use(
      http.get('/api/v1/meals/photos/:token', ({ params }) => {
        asked.push(`full:${String(params.token)}`);
        return imageResponse();
      }),
      http.get(THUMB_URL, ({ params }) => {
        asked.push(`thumb:${String(params.token)}`);
        return imageResponse();
      }),
    );
    const wrapper = makeWrapper(new QueryClient());
    const tokens = ['a'.repeat(8), 'b'.repeat(8), 'c'.repeat(8)];
    // 썸네일 칸이 첫 장 썸네일만 받아 둔 상태.
    const cell = renderHook(() => useMealPhotoUrl(tokens[0]), { wrapper });
    await waitFor(() => expect(cell.result.current.url).toBe('blob:test/1'));

    const { result } = renderHook(
      () => ({
        full: useMealPhotoUrls(tokens, { variant: 'full', enabled: [true, true, false] }),
        thumbs: useMealPhotoUrls(tokens, { variant: 'thumb', enabled: false }),
      }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.full.map((s) => s.url !== null)).toEqual([true, true, false]));
    expect(result.current.thumbs.map((s) => s.url)).toEqual(['blob:test/1', null, null]);
    expect(asked.sort()).toEqual(['full:aaaaaaaa', 'full:bbbbbbbb', 'thumb:aaaaaaaa']);
  });
});
