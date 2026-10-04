import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { useAuthStore, useRestaurantFavoriteStore, useRestaurantFavorites } from '@repo/shared';
import type { RestaurantFavoriteItemType } from '@repo/api-contract';
import { server } from '~/test/msw';

// useRestaurantFavorites 의 반환 객체는 페이지가 Outlet context·props 로 그대로 내려준다. 목록이
// 그대로인데 렌더마다 새 객체가 나오면 받는 쪽(식당 상세 패널)이 페이지가 리렌더될 때마다 따라
// 리렌더된다 — 그래서 "목록(또는 로그인 상태)이 바뀔 때만 새 객체" 가 계약이다.

const item = (placeId: string): RestaurantFavoriteItemType => ({
  placeId,
  name: `가게 ${placeId}`,
  category: '한식',
  address: '서울 중구',
  thumbnailUrl: null,
  latitude: 37.5,
  longitude: 127,
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
    {children}
  </QueryClientProvider>
);

beforeEach(() => {
  window.localStorage.clear();
  useAuthStore.setState({ token: null, user: null, isGuest: false });
  useRestaurantFavoriteStore.setState({ items: [] });
});

describe('useRestaurantFavorites — 반환 객체 안정성', () => {
  it('게스트: 다시 렌더돼도 같은 객체, 토글로 목록이 바뀌면 새 객체', () => {
    const { result, rerender } = renderHook(() => useRestaurantFavorites(), { wrapper });
    const first = result.current;
    rerender();
    rerender();
    expect(result.current).toBe(first);
    expect(first.isFavorite('P1')).toBe(false);

    act(() => first.toggle(item('P1')));
    expect(result.current).not.toBe(first);
    expect(result.current.isFavorite('P1')).toBe(true);
    expect(result.current.items.map((i) => i.placeId)).toEqual(['P1']);

    const second = result.current;
    rerender();
    expect(result.current).toBe(second);

    act(() => second.toggle(item('P1')));
    expect(result.current.isFavorite('P1')).toBe(false);
  });

  it('로그인: 서버 목록을 받기 전(빈 목록)에도 렌더마다 흔들리지 않고, 받으면 한 번 바뀐다', async () => {
    server.use(
      http.get('/api/v1/restaurants/favorites', () => HttpResponse.json({ items: [item('P7')] })),
    );
    useAuthStore.setState({ token: 't', user: null, isGuest: false });
    const { result, rerender } = renderHook(() => useRestaurantFavorites(), { wrapper });
    const loading = result.current;
    expect(loading.items).toEqual([]);
    rerender();
    expect(result.current).toBe(loading);

    await waitFor(() => expect(result.current.isFavorite('P7')).toBe(true));
    const loaded = result.current;
    expect(loaded).not.toBe(loading);
    rerender();
    expect(result.current).toBe(loaded);
  });
});
