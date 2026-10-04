import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { delay, http, HttpResponse } from 'msw';
import type { HousingPointsResultType, LifeMapPointsResultType } from '@repo/api-contract';
import { useHousingPoints, useLifeMapPoints } from '@repo/shared';
import { server } from './msw';

// 뷰포트 조회 훅(@repo/shared) — bbox 가 쿼리 키에 그대로 들어가 지도를 움직일 때마다 새 쿼리가 된다.
// 응답이 오기 전에 다시 움직이면 지나간 뷰포트의 요청은 쓸 곳이 없으므로, 훅이 React Query 의 signal 을
// fetch 까지 넘겨 끊는지 본다(끊지 않으면 수천 점짜리 응답을 끝까지 받아 파싱한다).
// (shared 는 node 환경이라 훅 렌더가 필요한 이 테스트는 소비처인 web 에 둔다 — useMapResearch.test 와 같은 이유.)

const BBOX_A = '126.97000,37.56000,126.99000,37.57000';
const BBOX_B = '126.98000,37.56000,127.00000,37.57000';
const FETCHED_AT = '2026-10-05T00:00:00.000Z';

const wrapper = ({ children }: { children: ReactNode }) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
};

// fetch 에 넘어간 init.signal — apiFetch 가 path 다음 인자로 그대로 전달한다.
const signalOf = (call: unknown[] | undefined): AbortSignal => {
  const init = call?.[1] as RequestInit | undefined;
  if (!init?.signal) throw new Error('fetch 에 signal 이 전달되지 않았습니다');
  return init.signal;
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('뷰포트 조회 — 지나간 뷰포트의 요청 중단', () => {
  it('useLifeMapPoints: bbox 가 바뀌면 진행 중이던 이전 요청의 signal 이 abort 된다', async () => {
    const lifePoints: LifeMapPointsResultType = {
      layer: 'cctv',
      mode: 'points',
      items: [],
      cells: [],
      total: 0,
      truncated: false,
      minPointZoom: 15,
      fetchedAt: FETCHED_AT,
    };
    server.use(
      http.get('/api/v1/life-map/points', async ({ request }) => {
        // 첫 뷰포트(A)는 응답을 늦춰 "받는 중에 지도를 다시 움직인" 상황을 만든다.
        if (new URL(request.url).searchParams.get('bbox') === BBOX_A) await delay(400);
        return HttpResponse.json(lifePoints);
      }),
    );
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { result, rerender } = renderHook(
      ({ bbox }: { bbox: string }) => useLifeMapPoints({ layer: 'cctv', bbox, zoom: 15.4 }),
      { wrapper, initialProps: { bbox: BBOX_A } },
    );
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const first = signalOf(fetchSpy.mock.calls[0]);
    expect(first.aborted).toBe(false);

    rerender({ bbox: BBOX_B });
    await waitFor(() => expect(first.aborted).toBe(true));
    // 새 뷰포트(B)는 정상 완료 — 요청 URL 의 zoom 은 내림 정수.
    await waitFor(() => expect(result.current.isSuccess && !result.current.isPlaceholderData).toBe(true));
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(String(fetchSpy.mock.calls[1]?.[0])).toContain('zoom=15');
    expect(signalOf(fetchSpy.mock.calls[1]).aborted).toBe(false);
  });

  it('useHousingPoints: bbox 가 바뀌면 진행 중이던 이전 요청의 signal 이 abort 된다', async () => {
    const housingPoints: HousingPointsResultType = {
      mode: 'points',
      dealType: 'trade',
      band: 'all',
      items: [],
      cells: [],
      total: 0,
      truncated: false,
      minPointZoom: 13,
      fetchedAt: FETCHED_AT,
    };
    server.use(
      http.get('/api/v1/housing/points', async ({ request }) => {
        if (new URL(request.url).searchParams.get('bbox') === BBOX_A) await delay(400);
        return HttpResponse.json(housingPoints);
      }),
    );
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const axis = { dealType: 'trade', band: 'all' } as const;
    const { result, rerender } = renderHook(
      ({ bbox }: { bbox: string }) => useHousingPoints({ bbox, zoom: 14, axis }),
      { wrapper, initialProps: { bbox: BBOX_A } },
    );
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const first = signalOf(fetchSpy.mock.calls[0]);

    rerender({ bbox: BBOX_B });
    await waitFor(() => expect(first.aborted).toBe(true));
    await waitFor(() => expect(result.current.isSuccess && !result.current.isPlaceholderData).toBe(true));
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
