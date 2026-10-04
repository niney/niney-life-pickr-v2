import { forwardRef, useImperativeHandle, useMemo, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type { BusArrivalsResultType, BusNearbyResultType, BusStationSearchResultType } from '@repo/api-contract';
import { useAuthStore, useBusFavoriteStore, useSubwayFavoriteStore } from '@repo/shared';
import { server } from '~/test/msw';
import { useTransitFavExpandStore } from '~/stores/transitFavExpandStore';
import { BusPage } from './BusPage';

// 버스 페이지 — 지도(OL)는 목으로 바꾸고 레이아웃·지도 입력 계약을 본다:
//  ① 지도·패널을 한 벌만 마운트(데스크톱/모바일을 CSS 숨김으로 두 벌 두던 것을 JS 분기로)
//  ② 주변 모드에서 페이지가 리렌더돼도(도착 폴링) 마커 배열 참조가 유지되고 fitToMarkers 가 재발화하지 않는다
//  ③ 모바일 — 정류장 선택 중에는 숨은 목록 시트에 즐겨찾기 섹션을 두지 않는다(미리보기 폴링 중단)
// MapCanvas 목은 받은 markers 참조와 imperative 호출(fit/fly)을 기록한다.

const mapSpy = vi.hoisted(() => ({
  fitToMarkers: vi.fn(),
  flyTo: vi.fn(),
  flyToZoomIn: vi.fn(),
  fitToCoords: vi.fn(),
  // 렌더마다 받은 markers 배열(참조 비교용).
  markers: [] as unknown[][],
}));

vi.mock('~/components/restaurant/MapCanvas', () => ({
  MapCanvas: forwardRef(function MockMapCanvas(props: { markers: unknown[] }, ref) {
    useImperativeHandle(ref, () => ({
      flyTo: mapSpy.flyTo,
      flyToZoomIn: mapSpy.flyToZoomIn,
      fitToMarkers: mapSpy.fitToMarkers,
      fitToCoords: mapSpy.fitToCoords,
    }));
    mapSpy.markers.push(props.markers);
    return <div data-testid="map-canvas" />;
  }),
}));

const FETCHED_AT = '2026-10-05T00:00:00.000Z';
const S1 = { stId: '100000001', arsId: '01001', name: '시청앞', lat: 37.5665, lng: 126.978 };
const S2 = { stId: '100000002', arsId: '01002', name: '덕수궁', lat: 37.5658, lng: 126.9752 };

const arrivalsBody = (arsId: string, routeName: string): BusArrivalsResultType => ({
  arsId,
  items: [
    {
      busRouteId: '100100001',
      routeName,
      staOrd: 12,
      first: { vehId: '111', message: '3분후[2번째 전]' },
      second: null,
    },
  ],
  fetchedAt: FETCHED_AT,
  stale: false,
});

const seen = { search: [] as string[], arrivals: [] as string[] };
const useHandlers = () =>
  server.use(
    http.get('/api/v1/settings/map/public', () => HttpResponse.json({ provider: 'vworld', apiKey: 'test-key' })),
    http.get('/api/v1/bus/stations/search', ({ request }) => {
      seen.search.push(new URL(request.url).searchParams.get('q') ?? '');
      const body: BusStationSearchResultType = { items: [S1, S2], total: 2, fetchedAt: FETCHED_AT, source: 'cache' };
      return HttpResponse.json(body);
    }),
    http.get('/api/v1/bus/stations/nearby', () => {
      const body: BusNearbyResultType = {
        items: [
          { ...S1, dist: 40 },
          { ...S2, dist: 210 },
        ],
        total: 2,
        fetchedAt: FETCHED_AT,
        source: 'db',
      };
      return HttpResponse.json(body);
    }),
    http.get('/api/v1/bus/stations/:arsId/arrivals', ({ params }) => {
      seen.arrivals.push(String(params.arsId));
      return HttpResponse.json(arrivalsBody(String(params.arsId), '141'));
    }),
    // 상대 도메인(지하철) — 검색 크로스 섹션·주변 겸표시. 결과 없음으로 둔다.
    http.get('/api/v1/subway/stations/search', () => HttpResponse.json({ items: [], total: 0, fetchedAt: FETCHED_AT, source: 'db' })),
    http.get('/api/v1/subway/stations/nearby', () => HttpResponse.json({ items: [], total: 0, fetchedAt: FETCHED_AT, source: 'db' })),
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
            <Route path="/bus" element={<BusPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return queryClient;
};

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
  mapSpy.markers = [];
  useHandlers();
});

describe('BusPage (데스크톱 — matchMedia 없음 = xl 이상)', () => {
  it('지도·목록·도착 패널을 한 벌만 마운트한다(시트·subBar 없음)', async () => {
    renderPage(`/bus?q=${encodeURIComponent('시청')}&stId=${S1.stId}`);
    expect(await screen.findByTestId('map-canvas')).toBeInTheDocument();
    // 정류장 선택 → 좌패널이 도착 패널로 전환. 패널도 도착 요청도 하나.
    expect(await screen.findByTestId('bus-arrival-list')).toBeInTheDocument();
    expect(screen.getAllByTestId('map-canvas')).toHaveLength(1);
    expect(screen.getAllByTestId('bus-arrival-list')).toHaveLength(1);
    expect(seen.arrivals).toEqual([S1.arsId]);
    // 모바일 전용 요소는 마운트되지 않는다.
    expect(document.querySelector('[data-sheet-handle]')).toBeNull();
    expect(screen.queryByTestId('bus-list-sheet')).toBeNull();
    // subBar 에는 내용 없는 자리표시만 — 탭·검색행은 본문에 한 벌.
    const subbar = screen.getByTestId('layout-subbar');
    expect(within(subbar).queryByRole('link')).toBeNull();
    expect(within(subbar).queryByRole('searchbox')).toBeNull();
    expect(screen.getAllByRole('link', { name: '버스' })).toHaveLength(1);
  });

  it('검색 결과 목록도 한 벌 — ← 목록 으로 돌아오면 좌패널이 목록으로', async () => {
    renderPage(`/bus?q=${encodeURIComponent('시청')}&stId=${S1.stId}`);
    const panel = await screen.findByTestId('bus-arrival-list');
    expect(panel).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /목록/ }));
    const lists = await screen.findAllByTestId('bus-station-list');
    expect(lists).toHaveLength(1);
    expect(within(lists[0]!).getByText('시청앞')).toBeInTheDocument();
    expect(screen.queryByTestId('bus-arrival-list')).toBeNull();
  });

  it('주변 모드 — 도착정보가 갱신돼 페이지가 리렌더돼도 마커 배열을 다시 만들지 않고 fitToMarkers 도 재발화하지 않는다', async () => {
    const queryClient = renderPage(`/bus?near=37.5665,126.978&stId=${S1.stId}`);
    expect(await screen.findByText('141')).toBeInTheDocument();
    // 주변 결과가 지도에 반영되면 fit 은 한 번(결과 도착).
    await waitFor(() => expect(mapSpy.fitToMarkers).toHaveBeenCalled());
    const fitCalls = mapSpy.fitToMarkers.mock.calls.length;
    const markersBefore = mapSpy.markers.at(-1);
    expect(markersBefore).toHaveLength(3); // 정류장 2 + 기준점

    // 30초 폴링 응답을 흉내 — 도착 데이터만 바뀐다.
    act(() => {
      queryClient.setQueryData(['bus', 'stations', 'arrivals', S1.arsId], arrivalsBody(S1.arsId, '6411'));
    });
    expect(await screen.findByText('6411')).toBeInTheDocument();
    expect(mapSpy.fitToMarkers.mock.calls.length).toBe(fitCalls);
    expect(mapSpy.markers.at(-1)).toBe(markersBefore);
  });

  it('정류장을 골라도(선택만 변경) 마커 배열 참조는 그대로 — 선택 강조는 지도가 따로 칠한다', async () => {
    renderPage(`/bus?q=${encodeURIComponent('시청')}`);
    const list = await screen.findByTestId('bus-station-list');
    await waitFor(() => expect(mapSpy.fitToMarkers).toHaveBeenCalled());
    const fitCalls = mapSpy.fitToMarkers.mock.calls.length;
    const markersBefore = mapSpy.markers.at(-1);
    fireEvent.click(within(list).getByText('시청앞'));
    expect(await screen.findByTestId('bus-arrival-list')).toBeInTheDocument();
    expect(mapSpy.markers.at(-1)).toBe(markersBefore);
    expect(mapSpy.fitToMarkers.mock.calls.length).toBe(fitCalls);
    // 선택 정류장으로는 한 번 이동한다.
    expect(mapSpy.flyTo).toHaveBeenCalledTimes(1);
  });
});

describe('BusPage (모바일 시트)', () => {
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

  it('지도는 한 벌, 탭·검색행은 subBar, 목록은 시트 — 정류장을 고르면 상세 시트에 도착 패널 하나', async () => {
    renderPage(`/bus?q=${encodeURIComponent('시청')}`);
    expect(await screen.findByTestId('map-canvas')).toBeInTheDocument();
    const subbar = screen.getByTestId('layout-subbar');
    expect(within(subbar).getByRole('link', { name: '버스' })).toBeInTheDocument();
    expect(within(subbar).getByRole('searchbox', { name: '정류장 검색' })).toBeInTheDocument();
    const sheet = screen.getByTestId('bus-list-sheet');
    const list = await within(sheet).findByTestId('bus-station-list');
    expect(screen.getAllByTestId('map-canvas')).toHaveLength(1);
    expect(screen.getAllByTestId('bus-station-list')).toHaveLength(1);

    fireEvent.click(within(list).getByText('시청앞'));
    const detail = await screen.findByTestId('bus-detail-sheet');
    expect(await within(detail).findByTestId('bus-arrival-list')).toBeInTheDocument();
    expect(screen.getAllByTestId('bus-arrival-list')).toHaveLength(1);
    expect(seen.arrivals).toEqual([S1.arsId]);
    // 선택 중엔 subBar 의 검색행이 접힌다(탭만).
    expect(within(subbar).queryByRole('searchbox', { name: '정류장 검색' })).toBeNull();
  });

  it('정류장 선택 중에는 숨은 목록 시트에 즐겨찾기 섹션이 없다 — 펼쳐 둔 항목의 도착 미리보기를 조회하지 않고, 목록으로 돌아오면 복원', async () => {
    useBusFavoriteStore.setState({ stations: [S1, S2], routes: [] });
    // S2 미리보기를 펼쳐 둔 채 S1 을 연 상태.
    useTransitFavExpandStore.setState({ expandedKey: `bus-station:${S2.stId}` });
    renderPage(`/bus?stId=${S1.stId}`);
    const detail = await screen.findByTestId('bus-detail-sheet');
    expect(await within(detail).findByTestId('bus-arrival-list')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '즐겨찾기' })).toBeNull();
    expect(seen.arrivals).not.toContain(S2.arsId);

    fireEvent.click(within(detail).getByRole('button', { name: /목록/ }));
    expect(await screen.findByRole('heading', { name: '즐겨찾기' })).toBeInTheDocument();
    // 펼침 상태는 스토어에 남아 있어 그대로 복원 — 이제 보이는 곳에서 미리보기를 받는다.
    await waitFor(() => expect(seen.arrivals).toContain(S2.arsId));
  });
});
