import { forwardRef, useImperativeHandle, useMemo, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { useAuthStore } from '@repo/shared';
import { computeBboxAround, formatBbox } from '@repo/utils';
import { server } from '~/test/msw';
import { RestaurantsV2Page } from './RestaurantsV2Page';

// 맛집 v2 페이지 — 지도(OL)는 목으로 바꾸고 페이지가 지키는 계약을 본다:
//   ① 데스크톱/모바일 중 보이는 쪽 한 벌만 마운트(지도 1장·목록 1벌·검색 헤더 1개)
//   ② 검색어는 디바운스 뒤 1회만 조회
//   ③ 첫 진입은 bbox 가 정해진 뒤 1회만 조회(전역 목록을 받았다 버리지 않는다) — 위치 판정이
//      늦으면 상한(800ms) 뒤 전역 목록으로 폴백, URL 에 bbox 가 있거나 공유 라우트면 즉시
//   ④ 상세 lazy 청크와 무관하게 페이지가 상세·인사이트 조회를 먼저 건다
//   ⑤ 식당을 연달아 골라도(경로가 바뀐 뒤에도) 선택 이동이 동작한다
// 상세 라우트는 조회를 하지 않는 스텁 — 상세 탭 자체는 이 테스트의 관심사가 아니다.

vi.mock('~/components/restaurant/MapCanvas', () => ({
  MapCanvas: forwardRef(function MockMapCanvas(_props, ref) {
    useImperativeHandle(ref, () => ({
      flyTo: () => {},
      flyToZoomIn: () => {},
      fitToMarkers: () => {},
      fitToCoords: () => {},
    }));
    return <div data-testid="map-canvas" />;
  }),
}));

const SEARCH_PLACEHOLDER = '식당명, 카테고리, 메뉴로 검색';
const URL_BBOX = '126.90000,37.50000,127.00000,37.60000';
const SEOUL_BBOX = formatBbox(computeBboxAround({ lat: 37.5665, lng: 126.978 }, 1.5));

const listItem = (placeId: string, name: string) => ({
  placeId,
  name,
  category: '한식',
  address: '서울 중구 1',
  roadAddress: '서울 중구 세종대로 1',
  rating: 4.5,
  reviewCount: 10,
  latitude: 37.5665,
  longitude: 126.978,
  thumbnailUrl: null,
  firstCrawledAt: '2026-09-01T00:00:00.000Z',
  totalReviews: 10,
  summaryPending: 0,
  summaryRunning: 0,
  summaryDone: 0,
  summaryFailed: 0,
  analyzedCount: 0,
  avgSentimentScore: null,
  avgSatisfactionScore: null,
  positiveCount: 0,
  negativeCount: 0,
  neutralCount: 0,
  tour: null,
});

const seen = { list: [] as URL[], detail: [] as string[], insights: [] as string[] };
const useHandlers = () =>
  server.use(
    http.get('/api/v1/settings/map/public', () => HttpResponse.json({ provider: 'vworld', apiKey: 'test-key' })),
    http.get('/api/v1/restaurants/public', ({ request }) => {
      seen.list.push(new URL(request.url));
      return HttpResponse.json({ items: [listItem('P1', '서울집'), listItem('P2', '한강집')], total: 2 });
    }),
    http.get('/api/v1/restaurants/public/:placeId/insights', ({ params }) => {
      seen.insights.push(String(params.placeId));
      return HttpResponse.json({ analyzedCount: 0 });
    }),
    http.get('/api/v1/restaurants/public/:placeId', ({ params }) => {
      seen.detail.push(String(params.placeId));
      // 페이지는 공유 라우트에서만 상세 응답을 읽는다(지도 핀 조립) — 그때 쓰는 필드만 채운다.
      return HttpResponse.json({
        ...listItem(String(params.placeId), '공유집'),
        imageUrls: [],
        storedReviewCount: { naver: 0, diningcode: 0, tabling: 0, total: 0 },
        reviewsFirstPage: [],
        reviewCounts: { all: 0, positive: 0, negative: 0 },
      });
    }),
  );

// jsdom 에는 geolocation/permissions 가 없다(= useUserLocation 이 곧바로 'unavailable') — 필요한
// 테스트만 심고 끝나면 걷는다.
const stubNavigator = (key: 'geolocation' | 'permissions', value: unknown) => {
  Object.defineProperty(window.navigator, key, { value, configurable: true });
};

const LocationProbe = () => {
  const loc = useLocation();
  return <div data-testid="location">{`${loc.pathname}${loc.search}`}</div>;
};

// PublicLayout 흉내 — 페이지가 등록한 subBar 를 DOM 에 그려 준다.
const LayoutStub = () => {
  const [subBar, setSubBar] = useState<React.ReactNode>(null);
  const ctx = useMemo(() => ({ setSubBar, headerHeight: 57 }), []);
  return (
    <>
      <div data-testid="layout-subbar">{subBar}</div>
      <Outlet context={ctx} />
    </>
  );
};

const renderPage = (initialUrl: string) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <LocationProbe />
        <Routes>
          <Route element={<LayoutStub />}>
            <Route path="/restaurants-v2" element={<RestaurantsV2Page />}>
              <Route path=":placeId" element={<div data-testid="detail-outlet" />} />
            </Route>
            <Route path="/r" element={<RestaurantsV2Page />}>
              <Route path=":placeId" element={<div data-testid="detail-outlet" />} />
            </Route>
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

const sleep = (ms: number) =>
  act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });

const listBboxes = () => seen.list.map((u) => u.searchParams.get('bbox'));

beforeEach(() => {
  window.localStorage.clear();
  useAuthStore.setState({ token: null, user: null, isGuest: false });
  seen.list = [];
  seen.detail = [];
  seen.insights = [];
  useHandlers();
});

afterEach(() => {
  stubNavigator('geolocation', undefined);
  stubNavigator('permissions', undefined);
});

describe('RestaurantsV2Page (데스크톱)', () => {
  it('지도·목록·검색 헤더가 한 벌만 그려지고 subBar·시트는 없다', async () => {
    renderPage(`/restaurants-v2?bbox=${URL_BBOX}`);
    expect(await screen.findAllByTestId('map-canvas')).toHaveLength(1);
    await waitFor(() => expect(screen.getAllByText('서울집')).toHaveLength(1));
    expect(screen.getAllByTestId('public-restaurant-list')).toHaveLength(1);
    expect(screen.getAllByPlaceholderText(SEARCH_PLACEHOLDER)).toHaveLength(1);
    // 모바일 전용 조각은 아예 마운트되지 않는다.
    expect(screen.getByTestId('layout-subbar')).toBeEmptyDOMElement();
    expect(document.querySelector('[data-sheet-handle]')).toBeNull();
  });

  it('URL 에 bbox 가 있으면 기다리지 않고 그 bbox 로 1회만 조회한다(자동 bbox 로 덮어쓰지 않음)', async () => {
    renderPage(`/restaurants-v2?bbox=${URL_BBOX}`);
    await waitFor(() => expect(screen.getAllByText('서울집')).toHaveLength(1));
    await sleep(50);
    expect(listBboxes()).toEqual([URL_BBOX]);
    expect(screen.getByTestId('location')).toHaveTextContent(`/restaurants-v2?bbox=${URL_BBOX}`);
  });

  it('bbox 없이 진입 — 위치가 곧 판정되면(여기선 미지원 → 서울) 전역 조회 없이 bbox 조회 1회뿐', async () => {
    renderPage('/restaurants-v2');
    // 조회 전(게이트 대기·로딩) 동안 목록은 "없음" 이 아니라 로딩으로 보인다.
    expect(screen.queryByText('조건에 맞는 식당이 없습니다.')).toBeNull();
    await waitFor(() => expect(screen.getAllByText('서울집')).toHaveLength(1));
    await sleep(50);
    expect(listBboxes()).toEqual([SEOUL_BBOX]);
  });

  it('위치 판정이 늦으면(권한 프롬프트) 800ms 까지 기다렸다 전역 목록으로 폴백하고, 판정되면 bbox 로 다시 조회한다', async () => {
    let resolvePosition: ((pos: unknown) => void) | null = null;
    stubNavigator('geolocation', {
      getCurrentPosition: (ok: (pos: unknown) => void) => {
        resolvePosition = ok;
      },
    });
    renderPage('/restaurants-v2');

    await sleep(300);
    // 상한 전 — 아직 조회하지 않았고 목록은 로딩 표시.
    expect(seen.list).toHaveLength(0);
    expect(screen.queryByText('조건에 맞는 식당이 없습니다.')).toBeNull();
    expect(screen.getByText(/불러오는 중/)).toBeInTheDocument();

    // 상한 뒤 — bbox 없는 전역 목록.
    await waitFor(() => expect(seen.list).toHaveLength(1), { timeout: 2000 });
    expect(listBboxes()).toEqual([null]);
    await waitFor(() => expect(screen.getAllByText('서울집')).toHaveLength(1));

    // 뒤늦게 위치 허용 — 그 좌표의 bbox 로 다시 조회.
    const coords = { lat: 37.5, lng: 127.0 };
    await act(async () => {
      resolvePosition?.({ coords: { latitude: coords.lat, longitude: coords.lng } });
    });
    const expected = formatBbox(computeBboxAround(coords, 1.5));
    await waitFor(() => expect(listBboxes()).toEqual([null, expected]));
  });

  it('검색어는 디바운스 — 빠르게 이어 친 중간 글자로는 조회하지 않는다', async () => {
    renderPage(`/restaurants-v2?bbox=${URL_BBOX}`);
    await waitFor(() => expect(screen.getAllByText('서울집')).toHaveLength(1));
    const input = screen.getByPlaceholderText(SEARCH_PLACEHOLDER);
    fireEvent.change(input, { target: { value: 'a' } });
    fireEvent.change(input, { target: { value: 'ab' } });
    fireEvent.change(input, { target: { value: 'abc' } });
    // 입력(URL)은 즉시 반영.
    expect(screen.getByTestId('location')).toHaveTextContent('q=abc');
    await waitFor(() => expect(seen.list.some((u) => u.searchParams.get('q') === 'abc')).toBe(true));
    expect(seen.list.map((u) => u.searchParams.get('q'))).toEqual([null, 'abc']);
  });

  it('식당 선택 → 상세 경로로 이동하고(연달아 골라도 동작), 페이지가 상세·인사이트 조회를 먼저 건다', async () => {
    renderPage(`/restaurants-v2?bbox=${URL_BBOX}`);
    fireEvent.click(await screen.findByText('서울집'));
    // (검색·필터 query 보존은 window.location.search 를 읽는 동작이라 MemoryRouter 에선 보지 않는다.)
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/restaurants-v2/P1'));
    expect(screen.getAllByTestId('detail-outlet')).toHaveLength(1);
    // 상세 스텁은 조회하지 않는다 — 이 요청들은 페이지(RestaurantDetailWarmup)가 낸 것.
    await waitFor(() => expect(seen.detail).toEqual(['P1']));
    await waitFor(() => expect(seen.insights).toEqual(['P1']));

    // 경로가 바뀐 뒤에도 선택 콜백이 최신 navigate 를 쓴다.
    fireEvent.click(screen.getByText('한강집'));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/restaurants-v2/P2'));
    await waitFor(() => expect(seen.detail).toEqual(['P1', 'P2']));
  });

  it('공유 라우트(/r/:placeId)는 자동 bbox 없이 즉시 조회하고 목록 패널을 그리지 않는다', async () => {
    renderPage('/r/P9');
    expect(await screen.findAllByTestId('map-canvas')).toHaveLength(1);
    await waitFor(() => expect(seen.list).toHaveLength(1));
    await sleep(50);
    expect(listBboxes()).toEqual([null]);
    expect(screen.getByTestId('location')).toHaveTextContent('/r/P9');
    expect(screen.queryByTestId('public-restaurant-list')).toBeNull();
    expect(screen.queryByPlaceholderText(SEARCH_PLACEHOLDER)).toBeNull();
    expect(screen.getAllByTestId('detail-outlet')).toHaveLength(1);
    await waitFor(() => expect(seen.detail).toContain('P9'));
  });
});

// useIsDesktopXl 은 matchMedia 가 없으면 데스크톱으로 보므로, 모바일은 matchMedia 를 목으로 바꿔 렌더한다.
describe('RestaurantsV2Page (모바일 시트)', () => {
  const originalMatchMedia = window.matchMedia;
  beforeEach(() => {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  });
  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('검색 헤더는 상단바 subBar 에, 목록은 시트 안에 — 지도·목록 모두 한 벌', async () => {
    renderPage(`/restaurants-v2?bbox=${URL_BBOX}`);
    expect(await screen.findAllByTestId('map-canvas')).toHaveLength(1);
    const subbar = screen.getByTestId('layout-subbar');
    expect(within(subbar).getByPlaceholderText(SEARCH_PLACEHOLDER)).toBeInTheDocument();
    expect(screen.getAllByPlaceholderText(SEARCH_PLACEHOLDER)).toHaveLength(1);
    expect(document.querySelectorAll('[data-sheet-handle]')).toHaveLength(1);
    await waitFor(() => expect(screen.getAllByText('서울집')).toHaveLength(1));
    expect(screen.getAllByTestId('public-restaurant-list')).toHaveLength(1);
    expect(listBboxes()).toEqual([URL_BBOX]);
  });

  it('식당 선택 → 상세 시트가 따로 뜨고(목록 시트는 남는다) subBar 는 비워진다', async () => {
    renderPage(`/restaurants-v2?bbox=${URL_BBOX}`);
    fireEvent.click(await screen.findByText('서울집'));
    await waitFor(() => expect(screen.getAllByTestId('detail-outlet')).toHaveLength(1));
    expect(screen.getByTestId('location')).toHaveTextContent('/restaurants-v2/P1');
    expect(document.querySelectorAll('[data-sheet-handle]')).toHaveLength(2);
    expect(screen.getByTestId('layout-subbar')).toBeEmptyDOMElement();
    // 지도는 여전히 한 장.
    expect(screen.getAllByTestId('map-canvas')).toHaveLength(1);
  });
});
