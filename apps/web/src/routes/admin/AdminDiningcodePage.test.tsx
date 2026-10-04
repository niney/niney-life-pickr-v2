import { forwardRef, useImperativeHandle } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type {
  DiningcodeSearchResponseType,
  DiningcodeSearchResultType,
} from '@repo/api-contract';
import { useActiveDiningcodeBulkSaveJobStore } from '@repo/shared';
import { server } from '~/test/msw';
import type { MapViewport } from '~/components/restaurant/MapCanvas';
import { AdminDiningcodePage } from './AdminDiningcodePage';

// 다이닝코드 정식 페이지 — 좌표·반경 입력이 검색 요청으로 이어지는 시점과, 새 응답을 기다리는
// 동안의 화면을 고정한다(지도는 목):
//  ① 타이핑 중간값으로는 검색하지 않고, 입력이 멈춘 뒤 마지막 값으로 한 번만 검색한다 —
//     예전엔 반경 "1000" 을 치는 동안 1·10·100·1000 네 번 외부 검색이 나갔다
//  ② blur 와 지도 드래그는 기다리지 않고 바로 반영한다
//  ③ 응답을 기다리는 동안 직전 결과는 흐리게 남고(aria-busy) 카드 선택이 잠기며, 조건이 바뀌면
//     선택은 비워진다

// MapCanvas 목 — 렌더마다 받은 onViewportChangeEnd 를 기록해 두어, 테스트가 가장 최근 것을 불러
// "지도 드래그 끝" 을 흉내 낸다.
const mapProbe = vi.hoisted(() => ({
  viewportHandlers: [] as Array<(v: MapViewport) => void>,
}));

vi.mock('~/components/restaurant/MapCanvas', () => ({
  MapCanvas: forwardRef(function MockMapCanvas(
    props: { onViewportChangeEnd?: (v: MapViewport) => void },
    ref,
  ) {
    useImperativeHandle(ref, () => ({
      flyTo: () => {},
      flyToZoomIn: () => {},
      fitToMarkers: () => {},
      fitToCoords: () => {},
    }));
    if (props.onViewportChangeEnd) mapProbe.viewportHandlers.push(props.onViewportChangeEnd);
    return <div data-testid="map-canvas" />;
  }),
}));

const shop = (vRid: string, name: string): DiningcodeSearchResultType => ({
  vRid,
  name,
  branch: null,
  category: '이탈리안',
  address: null,
  roadAddress: null,
  areas: [],
  lat: 37.5,
  lng: 127.03,
  phone: null,
  score: 80,
  userScore: 4.2,
  reviewCount: 12,
  thumbnailUrl: null,
  imageUrls: [],
  openStatus: null,
  distance: null,
  keywords: [],
  displayReview: null,
  rawSourceUrl: `https://www.diningcode.com/profile.php?rid=${vRid}`,
});

// 첫 페이지(from=0)는 두 곳, 다음 페이지는 한 곳.
const respond = (params: URLSearchParams): DiningcodeSearchResponseType => {
  const from = Number(params.get('from') ?? 0);
  const size = Number(params.get('size') ?? 20);
  return {
    items: from === 0 ? [shop('A', '첫째 파스타'), shop('B', '둘째 파스타')] : [shop('C', '셋째 파스타')],
    total: 3,
    from,
    size,
    hasMore: from === 0,
    meta: {
      region: null,
      regionName: null,
      rcount: null,
      order: null,
      searchType: null,
      altQueries: [],
      relatedRegions: [],
      relatedKeywords: [],
      regionMainKeywords: [],
    },
    source: 'http',
    elapsedMs: 5,
    filteredOutCount: 0,
  };
};

// 검색 요청의 쿼리 파라미터를 순서대로 기록. gate 가 있으면 응답을 그때까지 붙잡는다.
const seen = { search: [] as Array<Record<string, string>> };
let gate: Promise<void> | null = null;

const useHandlers = () => {
  seen.search = [];
  gate = null;
  server.use(
    http.get('/api/v1/admin/crawl/diningcode/search', async ({ request }) => {
      const params = new URL(request.url).searchParams;
      seen.search.push(Object.fromEntries(params));
      if (gate) await gate;
      return HttpResponse.json(respond(params));
    }),
    http.get('/api/v1/admin/crawl/diningcode/registered', () => HttpResponse.json({ items: [] })),
    http.get('/api/v1/admin/settings/map/vworld/secret', () =>
      HttpResponse.json({ provider: 'vworld', apiKey: 'test-key', domains: null }),
    ),
  );
};

const renderPage = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}
    >
      <MemoryRouter>
        <AdminDiningcodePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

// 결과 그리드(카드 묶음) — aria-busy 로 "직전 결과를 보여 주는 중" 을 알린다.
const grid = (): HTMLElement => {
  const el = document.querySelector('[aria-busy]');
  if (!(el instanceof HTMLElement)) throw new Error('result grid not found');
  return el;
};

// 키워드 검색 → 첫 결과가 뜰 때까지.
const searchKeyword = async (keyword: string) => {
  fireEvent.change(screen.getByPlaceholderText('예: 강남 맛집, 성심당, 압구정 파스타'), {
    target: { value: keyword },
  });
  fireEvent.click(screen.getByRole('button', { name: '검색' }));
  expect(await screen.findByText('첫째 파스타')).toBeInTheDocument();
};

// 좌표 사용을 켜고, 기본 좌표·반경으로 나간 검색이 끝날 때까지.
const enableCoords = async () => {
  const before = seen.search.length;
  fireEvent.click(screen.getByLabelText('좌표 사용 (내주변)'));
  await waitFor(() => expect(seen.search).toHaveLength(before + 1));
  await waitFor(() => expect(grid()).toHaveAttribute('aria-busy', 'false'));
};

beforeEach(() => {
  useActiveDiningcodeBulkSaveJobStore.setState({ jobId: null });
  mapProbe.viewportHandlers = [];
});

describe('AdminDiningcodePage', () => {
  it('반경을 타이핑하는 동안에는 검색하지 않고, 멈춘 뒤 마지막 값으로 한 번만 검색한다', async () => {
    useHandlers();
    renderPage();
    await searchKeyword('파스타');
    expect(seen.search).toHaveLength(1);
    expect(seen.search[0]).toMatchObject({ q: '파스타', from: '0', size: '20' });
    expect(seen.search[0]).not.toHaveProperty('lat');

    await enableCoords();
    expect(seen.search[1]).toMatchObject({ lat: '37.4979', lng: '127.0276', distance: '500' });

    const radius = screen.getByLabelText('반경 (m)');
    for (const v of ['1', '10', '100', '1000']) {
      fireEvent.change(radius, { target: { value: v } });
    }
    // 입력칸은 바로 따라오지만, 아직 검색에는 반영되지 않았다 — 요청도 결과 흐림도 없다.
    expect(radius).toHaveValue(1000);
    expect(seen.search).toHaveLength(2);
    expect(grid()).toHaveAttribute('aria-busy', 'false');

    await waitFor(() => expect(seen.search).toHaveLength(3), { timeout: 3000 });
    // 중간값(1·10·100)으로는 한 번도 검색하지 않았다.
    expect(seen.search.map((p) => p['distance'])).toEqual([undefined, '500', '1000']);
    await waitFor(() => expect(grid()).toHaveAttribute('aria-busy', 'false'));
    expect(seen.search).toHaveLength(3);
  });

  it('blur 와 지도 드래그는 기다리지 않고 바로 검색에 반영한다', async () => {
    useHandlers();
    renderPage();
    await searchKeyword('파스타');
    await enableCoords();

    const radius = screen.getByLabelText('반경 (m)');
    fireEvent.change(radius, { target: { value: '800' } });
    expect(grid()).toHaveAttribute('aria-busy', 'false');
    // 입력칸을 벗어나면 디바운스를 기다리지 않는다 — 곧바로 새 조건으로 넘어가 직전 결과가 흐려진다.
    fireEvent.blur(radius);
    expect(grid()).toHaveAttribute('aria-busy', 'true');
    await waitFor(() => expect(seen.search.at(-1)).toMatchObject({ distance: '800' }));
    await waitFor(() => expect(grid()).toHaveAttribute('aria-busy', 'false'));
    const afterBlur = seen.search.length;

    // 지도 드래그 끝 — 입력칸과 검색 좌표가 함께 바뀐다(입력 중이던 반경은 유지).
    expect(await screen.findByTestId('map-canvas')).toBeInTheDocument();
    act(() => {
      mapProbe.viewportHandlers.at(-1)?.({
        centerLat: 37.51,
        centerLng: 127.05,
        zoom: 15,
        bbox: { minLng: 127.04, minLat: 37.5, maxLng: 127.06, maxLat: 37.52 },
      });
    });
    expect(screen.getByLabelText('위도 (lat)')).toHaveValue('37.510000');
    expect(screen.getByLabelText('경도 (lng)')).toHaveValue('127.050000');
    expect(grid()).toHaveAttribute('aria-busy', 'true');
    await waitFor(() => expect(seen.search).toHaveLength(afterBlur + 1));
    expect(seen.search.at(-1)).toMatchObject({ lat: '37.51', lng: '127.05', distance: '800' });
  });

  it('응답을 기다리는 동안 직전 결과의 선택을 잠그고, 조건이 바뀌면 선택을 비운다', async () => {
    useHandlers();
    renderPage();
    await searchKeyword('파스타');

    const boxes = () => screen.getAllByLabelText('저장 대상으로 선택');
    await waitFor(() => expect(boxes()[0]).not.toBeDisabled());
    fireEvent.click(boxes()[0]!);
    expect(screen.getByText('선택 1')).toBeInTheDocument();

    // 다음 페이지 — 응답을 붙잡아 두고 그동안의 화면을 본다.
    let release!: () => void;
    gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    fireEvent.click(screen.getByRole('button', { name: '다음' }));

    // 직전 페이지 카드가 흐리게 남아 있고, 선택은 비워졌으며, 고를 수 없다.
    expect(screen.getByText('첫째 파스타')).toBeInTheDocument();
    expect(grid()).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('선택 0')).toBeInTheDocument();
    for (const box of boxes()) expect(box).toBeDisabled();
    expect(screen.getByRole('button', { name: /현재 페이지 전체 선택/ })).toBeDisabled();

    release();
    expect(await screen.findByText('셋째 파스타')).toBeInTheDocument();
    expect(screen.queryByText('첫째 파스타')).toBeNull();
    expect(grid()).toHaveAttribute('aria-busy', 'false');
    expect(boxes()[0]).not.toBeDisabled();
    expect(seen.search.at(-1)).toMatchObject({ q: '파스타', from: '20' });
  });

  it('키워드가 바뀌면 이전 키워드의 결과를 남겨 두지 않는다', async () => {
    useHandlers();
    renderPage();
    await searchKeyword('파스타');

    let release!: () => void;
    gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    // 검색 중에는 입력칸이 잠기므로 끝난 뒤 새 키워드를 넣는다.
    const input = screen.getByPlaceholderText('예: 강남 맛집, 성심당, 압구정 파스타');
    await waitFor(() => expect(input).not.toBeDisabled());
    fireEvent.change(input, { target: { value: '초밥' } });
    fireEvent.click(screen.getByRole('button', { name: '검색' }));

    // 다른 키워드의 결과를 새 결과처럼 보여 주지 않는다 — placeholder 는 같은 키워드에서만.
    expect(screen.queryByText('첫째 파스타')).toBeNull();
    release();
    expect(await screen.findByText('첫째 파스타')).toBeInTheDocument();
    expect(seen.search.at(-1)).toMatchObject({ q: '초밥' });
  });
});
