import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '~/test/msw';
import { useLifeMapRecentStore } from '~/stores/lifeMapRecentStore';
import { LifeGoToBox } from './LifeGoToBox';

// 지역 이동 옴니박스의 원격 검색 타이밍 — 버스 정류장 검색은 캐시에 없는 키워드마다 서울시 API(일일 한도)를
// 쓰므로, 지하철(로컬 DB)·주소 검색보다 오래 기다리고 조합 중인 낱자모("강ㄴ")로는 보내지 않는다.
// 실제 타이머로 본다(디바운스 250ms / 버스 450ms).

const FETCHED_AT = '2026-10-05T00:00:00.000Z';
const seen = { subway: [] as string[], bus: [] as string[] };

const useHandlers = () =>
  server.use(
    http.get('/api/v1/subway/stations/search', ({ request }) => {
      seen.subway.push(new URL(request.url).searchParams.get('q') ?? '');
      return HttpResponse.json({ items: [], total: 0, fetchedAt: FETCHED_AT, source: 'db' });
    }),
    http.get('/api/v1/bus/stations/search', ({ request }) => {
      seen.bus.push(new URL(request.url).searchParams.get('q') ?? '');
      return HttpResponse.json({ items: [], total: 0, fetchedAt: FETCHED_AT, source: 'cache' });
    }),
    http.get('/api/v1/life-map/search', () => HttpResponse.json({ q: '', items: [], enabled: false, fetchedAt: FETCHED_AT })),
  );

const renderBox = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <LifeGoToBox open onOpenChange={() => {}} savedLocation={null} onGo={() => {}} />
    </QueryClientProvider>,
  );
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

beforeEach(() => {
  window.localStorage.clear();
  useLifeMapRecentStore.setState({ items: [] });
  seen.subway = [];
  seen.bus = [];
  useHandlers();
});

describe('LifeGoToBox — 버스 정류장 검색 타이밍', () => {
  it('끝 글자가 조합 중인 낱자모면 버스 검색을 보내지 않고, 음절이 완성된 뒤 한 번 보낸다', async () => {
    renderBox();
    const input = screen.getByTestId('life-goto-input');
    fireEvent.change(input, { target: { value: '강ㄴ' } });
    // 지하철(로컬 DB)은 종전대로 짧은 디바운스 뒤 그 값으로 나간다.
    await waitFor(() => expect(seen.subway).toEqual(['강ㄴ']));
    // 버스는 자기 디바운스(450ms)가 지나도 조합 중이라 나가지 않는다.
    await sleep(600);
    expect(seen.bus).toEqual([]);

    fireEvent.change(input, { target: { value: '강남' } });
    await waitFor(() => expect(seen.bus).toEqual(['강남']), { timeout: 2000 });
  });

  it('타이핑이 잠깐 멈춘 중간 접두어는 지하철에는 나가도 버스에는 나가지 않는다(더 긴 디바운스)', async () => {
    renderBox();
    const input = screen.getByTestId('life-goto-input');
    fireEvent.change(input, { target: { value: '강남' } });
    // 지하철 디바운스(250ms)는 지났고 버스(450ms)는 아직인 시점에 이어서 친다 — 타이머는 만기 순으로
    // 돌기 때문에 이 대기(320ms)는 버스 예약(450ms)보다 항상 먼저 끝난다.
    await sleep(320);
    fireEvent.change(input, { target: { value: '강남역' } });
    await waitFor(() => expect(seen.bus).toEqual(['강남역']), { timeout: 2000 });
    expect(seen.subway).toEqual(['강남', '강남역']);
  });
});
