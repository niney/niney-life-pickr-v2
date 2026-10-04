import { forwardRef, useImperativeHandle, useMemo, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type {
  SubwayArrivalsResultType,
  SubwayCongestionResultType,
  SubwayNearbyResultType,
  SubwayStationGroupItemType,
  SubwayStationSearchResultType,
  SubwayTimetableResultType,
} from '@repo/api-contract';
import { useAuthStore, useBusFavoriteStore, useSubwayFavoriteStore } from '@repo/shared';
import { server } from '~/test/msw';
import { useTransitFavExpandStore } from '~/stores/transitFavExpandStore';
import { SubwayPage } from './SubwayPage';

// 지하철 페이지 — 지도(OL)는 목으로 바꾸고 레이아웃·폴링·검색 계약을 본다:
//  ① 지도·패널을 한 벌만 마운트(도착 쿼리 구독자도 하나)
//  ② 시간표·길찾기 뷰가 도착 패널을 덮은 동안 도착 폴링을 쉬고, 돌아오면 즉시 한 번 다시 받는다
//  ③ 라이브 검색 — 입력은 즉시, 검색 요청과 지도 fit 은 입력이 멈춘 뒤 마지막 값으로 한 번
//  ④ 주변 모드에서 역을 고른 뒤의 리렌더(도착 응답)가 fitToMarkers 를 다시 부르지 않는다
// MapCanvas 목은 imperative 호출(fit/fly)을 기록한다.

const mapSpy = vi.hoisted(() => ({
  fitToMarkers: vi.fn(),
  flyTo: vi.fn(),
  flyToZoomIn: vi.fn(),
  fitToCoords: vi.fn(),
}));

vi.mock('~/components/restaurant/MapCanvas', () => ({
  MapCanvas: forwardRef(function MockMapCanvas(_props, ref) {
    useImperativeHandle(ref, () => ({
      flyTo: mapSpy.flyTo,
      flyToZoomIn: mapSpy.flyToZoomIn,
      fitToMarkers: mapSpy.fitToMarkers,
      fitToCoords: mapSpy.fitToCoords,
    }));
    return <div data-testid="map-canvas" />;
  }),
}));

const FETCHED_AT = '2026-10-05T00:00:00.000Z';
const group = (name: string, lat: number, lng: number): SubwayStationGroupItemType => ({
  id: `1002:${name}`,
  name,
  lat,
  lng,
  lines: [{ stationId: `1002:${name}`, lineId: '1002', lineName: '2호선', lat, lng }],
});
const GANGNAM = group('강남', 37.4979, 127.0276);
const YEOKSAM = group('역삼', 37.5007, 127.0365);

const arrivalsBody = (stationId: string): SubwayArrivalsResultType => ({
  stationId,
  name: stationId.slice(stationId.indexOf(':') + 1),
  lines: ['1002'],
  items: [
    {
      lineId: '1002',
      updnLine: '내선',
      trainLineNm: '성수행 - 역삼방면',
      destination: '성수',
      trainKind: '일반',
      trainNo: '2104',
      arrivalSec: 180,
      arrivalMsg: '3분 후',
      arrivalCode: '99',
      isLastTrain: false,
      receivedAt: new Date().toISOString(),
    },
  ],
  fetchedAt: new Date().toISOString(),
});

const seen = { search: [] as string[], arrivals: [] as string[] };
const useHandlers = () =>
  server.use(
    http.get('/api/v1/settings/map/public', () => HttpResponse.json({ provider: 'vworld', apiKey: 'test-key' })),
    http.get('/api/v1/subway/stations/search', ({ request }) => {
      const q = new URL(request.url).searchParams.get('q') ?? '';
      seen.search.push(q);
      const items = [GANGNAM, YEOKSAM].filter((g) => g.name.includes(q));
      const body: SubwayStationSearchResultType = { items, total: items.length, fetchedAt: FETCHED_AT, source: 'db' };
      return HttpResponse.json(body);
    }),
    http.get('/api/v1/subway/stations/nearby', () => {
      const body: SubwayNearbyResultType = {
        items: [
          { ...GANGNAM, dist: 30 },
          { ...YEOKSAM, dist: 850 },
        ],
        total: 2,
        fetchedAt: FETCHED_AT,
        source: 'db',
      };
      return HttpResponse.json(body);
    }),
    http.get('/api/v1/subway/stations/:stationId/arrivals', ({ params }) => {
      const stationId = decodeURIComponent(String(params.stationId));
      seen.arrivals.push(stationId);
      return HttpResponse.json(arrivalsBody(stationId));
    }),
    http.get('/api/v1/subway/stations/:stationId/timetable', ({ params, request }) => {
      const stationId = decodeURIComponent(String(params.stationId));
      const body: SubwayTimetableResultType = {
        stationId,
        name: stationId.slice(stationId.indexOf(':') + 1),
        lineId: '1002',
        dayType: new URL(request.url).searchParams.get('dayType') ?? '1',
        coverage: true,
        directions: [
          {
            updn: '1',
            trains: [{ arriveTime: '05:30:00', leaveTime: '05:30:30', trainNo: '2001', expressTag: 'G', destination: '성수' }],
            firstTrain: '05:30:00',
            lastTrain: '05:30:00',
          },
        ],
        fetchedAt: FETCHED_AT,
        source: 'cache',
      };
      return HttpResponse.json(body);
    }),
    http.get('/api/v1/subway/stations/:stationId/congestion', ({ params, request }) => {
      const stationId = decodeURIComponent(String(params.stationId));
      const body: SubwayCongestionResultType = {
        stationId,
        name: stationId.slice(stationId.indexOf(':') + 1),
        lineId: '1002',
        dayType: new URL(request.url).searchParams.get('dayType') ?? '1',
        coverage: false,
        directions: [],
        fetchedAt: FETCHED_AT,
        source: 'db',
      };
      return HttpResponse.json(body);
    }),
    // 상대 도메인(버스) — 주변 겸표시. 결과 없음으로 둔다.
    http.get('/api/v1/bus/stations/nearby', () => HttpResponse.json({ items: [], total: 0, fetchedAt: FETCHED_AT, source: 'db' })),
  );

// 상단바 subBar 는 PublicLayout 흉내(LayoutStub)가 받아 DOM 에 그린다.
const LayoutStub = () => {
  const [subBar, setSubBar] = useState<React.ReactNode>(null);
  const ctx = useMemo(() => ({ setSubBar, headerHeight: 148 }), []);
  return (
    <>
      <div data-testid="layout-subbar">{subBar}</div>
      <Outlet context={ctx} />
    </>
  );
};

const renderPage = (initialUrl: string) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <Routes>
          <Route element={<LayoutStub />}>
            <Route path="/subway" element={<SubwayPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return queryClient;
};

// 도착 쿼리를 구독 중인 옵저버들의 폴링 간격(React Query 내부 옵션) — 폴링 on/off 를 타이머 없이 확인한다.
const arrivalPolling = (queryClient: QueryClient, stationId: string): unknown[] =>
  (queryClient.getQueryCache().find({ queryKey: ['subway', 'arrivals', stationId] })?.observers ?? []).map(
    (o) => o.options.refetchInterval,
  );

const stnUrl = (id: string) => `/subway?stn=${encodeURIComponent(id)}`;

beforeEach(() => {
  window.localStorage.clear();
  useAuthStore.setState({ token: null, user: null, isGuest: false });
  useBusFavoriteStore.setState({ stations: [], routes: [] });
  useSubwayFavoriteStore.setState({ stations: [], lines: [] });
  useTransitFavExpandStore.setState({ expandedKey: null });
  seen.search = [];
  seen.arrivals = [];
  mapSpy.fitToMarkers.mockClear();
  mapSpy.flyTo.mockClear();
  mapSpy.flyToZoomIn.mockClear();
  mapSpy.fitToCoords.mockClear();
  // jsdom 에는 scrollIntoView 가 없다(시간표 뷰가 다음 열차 행으로 스크롤).
  Element.prototype.scrollIntoView = vi.fn();
  useHandlers();
});

describe('SubwayPage (데스크톱 — matchMedia 없음 = xl 이상)', () => {
  it('지도·도착 패널을 한 벌만 마운트한다 — 도착 쿼리 구독자도 하나(시트·subBar 없음)', async () => {
    const queryClient = renderPage(stnUrl(GANGNAM.id));
    expect(await screen.findByTestId('map-canvas')).toBeInTheDocument();
    expect(await screen.findByText(/30초마다 자동 갱신/)).toBeInTheDocument();
    expect(screen.getAllByTestId('map-canvas')).toHaveLength(1);
    expect(screen.getAllByText(/30초마다 자동 갱신/)).toHaveLength(1);
    expect(seen.arrivals).toEqual([GANGNAM.id]);
    expect(arrivalPolling(queryClient, GANGNAM.id)).toEqual([30_000]);
    // 모바일 전용 요소는 마운트되지 않는다.
    expect(document.querySelector('[data-sheet-handle]')).toBeNull();
    expect(screen.queryByTestId('subway-list-sheet')).toBeNull();
    // subBar 에는 내용 없는 자리표시만 — 탭·검색행은 본문에 한 벌.
    const subbar = screen.getByTestId('layout-subbar');
    expect(within(subbar).queryByRole('link')).toBeNull();
    expect(within(subbar).queryByRole('searchbox')).toBeNull();
    expect(screen.getAllByRole('link', { name: '지하철' })).toHaveLength(1);
  });

  it('시간표 뷰에서는 도착 폴링을 쉬고(헤더 역명은 유지), 도착정보로 돌아오면 즉시 한 번 다시 받고 폴링을 잇는다', async () => {
    const queryClient = renderPage(stnUrl(GANGNAM.id));
    fireEvent.click(await screen.findByRole('button', { name: '시간표' }));
    // 시간표 뷰 — 헤더는 받아 둔 도착 응답의 역명 그대로.
    expect(await screen.findByTestId('subway-timetable-list')).toBeInTheDocument();
    expect(screen.getByText('강남')).toBeInTheDocument();
    expect(arrivalPolling(queryClient, GANGNAM.id)).toEqual([false]);
    expect(seen.arrivals).toEqual([GANGNAM.id]);

    fireEvent.click(screen.getByRole('button', { name: /도착정보/ }));
    expect(await screen.findByText(/30초마다 자동 갱신/)).toBeInTheDocument();
    await waitFor(() => expect(seen.arrivals).toEqual([GANGNAM.id, GANGNAM.id]));
    expect(arrivalPolling(queryClient, GANGNAM.id)).toEqual([30_000]);
  });

  it('길찾기 뷰에서도 도착 폴링을 쉰다', async () => {
    const queryClient = renderPage(stnUrl(GANGNAM.id));
    fireEvent.click(await screen.findByRole('button', { name: '길찾기' }));
    expect(await screen.findByRole('searchbox', { name: '도착역 검색' })).toBeInTheDocument();
    expect(arrivalPolling(queryClient, GANGNAM.id)).toEqual([false]);

    fireEvent.click(screen.getByRole('button', { name: /도착정보/ }));
    await waitFor(() => expect(arrivalPolling(queryClient, GANGNAM.id)).toEqual([30_000]));
    await waitFor(() => expect(seen.arrivals).toHaveLength(2));
  });

  it('라이브 검색 — 입력은 즉시 반영, 검색 요청과 지도 fit 은 입력이 멈춘 뒤 마지막 값으로 한 번', async () => {
    renderPage('/subway');
    expect(await screen.findByTestId('map-canvas')).toBeInTheDocument();
    const input = screen.getByRole('searchbox', { name: '역 검색' });
    fireEvent.change(input, { target: { value: '강' } });
    fireEvent.change(input, { target: { value: '강남' } });
    expect(input).toHaveValue('강남');
    // 디바운스 대기 중에도 "검색 결과가 없습니다" 로 바뀌지 않고 로딩 표시가 이어진다.
    expect(screen.getByText('불러오는 중…')).toBeInTheDocument();
    expect(screen.queryByText('검색 결과가 없습니다.')).toBeNull();
    expect(seen.search).toEqual([]);

    const list = await screen.findByTestId('subway-station-list');
    expect(within(list).getByText('강남')).toBeInTheDocument();
    // 중간 입력("강")은 요청하지 않았다.
    expect(seen.search).toEqual(['강남']);
    await waitFor(() => expect(mapSpy.fitToMarkers).toHaveBeenCalledTimes(1));
  });

  it('검색어를 지우면 디바운스를 기다리지 않고 바로 초기 화면으로', async () => {
    renderPage(`/subway?q=${encodeURIComponent('강남')}`);
    const list = await screen.findByTestId('subway-station-list');
    expect(within(list).getByText('강남')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox', { name: '역 검색' }), { target: { value: '' } });
    expect(screen.queryByTestId('subway-station-list')).toBeNull();
    expect(screen.getByText('역 이름을 입력해 검색하세요.')).toBeInTheDocument();
  });

  it('주변 모드 — 역을 고르면 확대 포커스 1회, 뒤이은 도착 응답 리렌더가 fitToMarkers 를 다시 부르지 않는다', async () => {
    renderPage('/subway?near=37.4979,127.0276');
    const list = await screen.findByTestId('subway-station-list');
    // 주변 결과 도착 → 전체가 보이게 fit(정상 발화).
    await waitFor(() => expect(mapSpy.fitToMarkers).toHaveBeenCalled());
    mapSpy.fitToMarkers.mockClear();

    fireEvent.click(within(list).getByText('강남'));
    // 도착 응답까지 반영(패널 헤더) — 그 사이 리렌더가 여러 번 있다(도착·시간표·혼잡도).
    expect(await screen.findByText(/30초마다 자동 갱신/)).toBeInTheDocument();
    expect(mapSpy.flyToZoomIn).toHaveBeenCalledTimes(1);
    expect(mapSpy.fitToMarkers).not.toHaveBeenCalled();
  });
});

describe('SubwayPage (모바일 시트)', () => {
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

  it('지도는 한 벌, 탭·검색행은 subBar, 목록은 시트 — 역을 고르면 상세 시트에 도착 패널 하나', async () => {
    const queryClient = renderPage(`/subway?q=${encodeURIComponent('강남')}`);
    expect(await screen.findByTestId('map-canvas')).toBeInTheDocument();
    const subbar = screen.getByTestId('layout-subbar');
    expect(within(subbar).getByRole('link', { name: '지하철' })).toBeInTheDocument();
    expect(within(subbar).getByRole('searchbox', { name: '역 검색' })).toBeInTheDocument();
    const sheet = screen.getByTestId('subway-list-sheet');
    const list = await within(sheet).findByTestId('subway-station-list');
    expect(screen.getAllByTestId('map-canvas')).toHaveLength(1);
    expect(screen.getAllByTestId('subway-station-list')).toHaveLength(1);

    fireEvent.click(within(list).getByText('강남'));
    const detail = await screen.findByTestId('subway-detail-sheet');
    expect(await within(detail).findByText(/30초마다 자동 갱신/)).toBeInTheDocument();
    expect(screen.getAllByText(/30초마다 자동 갱신/)).toHaveLength(1);
    expect(seen.arrivals).toEqual([GANGNAM.id]);
    expect(arrivalPolling(queryClient, GANGNAM.id)).toEqual([30_000]);
    // 선택 중엔 subBar 의 검색행이 접힌다(탭만).
    expect(within(subbar).queryByRole('searchbox', { name: '역 검색' })).toBeNull();
  });
});
