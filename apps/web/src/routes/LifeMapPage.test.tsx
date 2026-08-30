import { forwardRef, useImperativeHandle, useMemo, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type { LifeMapItemType, LifeMapNearbyResultType, LifeMapStatusResultType } from '@repo/api-contract';
import { useAirLocationStore, useAuthStore } from '@repo/shared';
import { server } from '~/test/msw';
import { useLifeMapPrefsStore } from '~/stores/lifeMapPrefsStore';
import { useLifeMapRecentStore } from '~/stores/lifeMapRecentStore';
import { LifeMapPage } from './LifeMapPage';

// 일상지도 페이지 스모크 — 지도(OL)는 목으로 바꾸고 패널 쪽 계약을 본다: ① 레이어/필터 칩 + 상태
// 푸터 ② 지도 중심(진입 중심) 기준 주변 목록 ③ 행 클릭 → URL sel + 상세 카드 ④ CCTV 탭·설치목적
// 칩이 주변 요청 파라미터에 반영 ⑤ 저장한 내 위치가 진입 중심.
// MapCanvas 목은 viewport 를 올리지 않으므로 points 요청은 나가지 않는다(뷰포트 없음 = 비활성).

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

const status: LifeMapStatusResultType = {
  layers: [
    { layer: 'cctv', loaded: true, count: 377243, geocoded: null, baseDate: '2026-07-30', loadedAt: '2026-08-21T10:00:00.000Z' },
    { layer: 'toilet', loaded: true, count: 53559, geocoded: 50881, baseDate: '2026-08-18', loadedAt: '2026-08-21T11:00:00.000Z' },
    { layer: 'hospital', loaded: true, count: 78000, geocoded: 77500, baseDate: '2026-08-28', loadedAt: '2026-08-28T10:00:00.000Z' },
  ],
  fetchedAt: '2026-08-21T12:00:00.000Z',
};

const toiletItem = (id: string, name: string, dist: number, over: Partial<Extract<LifeMapItemType, { layer: 'toilet' }>> = {}) => ({
  layer: 'toilet' as const,
  id,
  lat: 37.5666,
  lng: 126.9782,
  name,
  kind: '공중화장실',
  roadAddr: '서울특별시 중구 세종대로 110',
  lotAddr: null,
  orgName: '서울 중구청',
  phone: '02-000-0000',
  openType: '상시',
  openDetail: null,
  open24: true,
  fixtures: {
    maleToilet: 1,
    maleUrinal: 2,
    maleDisabledToilet: 1,
    maleDisabledUrinal: 0,
    maleKidsToilet: 0,
    maleKidsUrinal: 0,
    femaleToilet: 3,
    femaleDisabledToilet: 1,
    femaleKidsToilet: 0,
  },
  disabled: true,
  kids: false,
  ownerType: '공공기관-지방자치단체',
  disposal: '수세식',
  safetyTarget: true,
  bell: true,
  bellPlace: '여자화장실',
  entranceCctv: false,
  diaper: false,
  diaperPlace: null,
  installedYm: '201301',
  remodeledYm: null,
  baseDate: '2026-08-18',
  geoSource: 'road' as const,
  ...over,
  dist,
});
const cctvItem = (id: string, purpose: string, dist: number) => ({
  layer: 'cctv' as const,
  id,
  lat: 37.5665,
  lng: 126.978,
  purpose,
  orgCode: '3000000',
  orgName: '서울 중구청',
  roadAddr: '서울특별시 중구 세종대로 110',
  lotAddr: null,
  cameraCount: 2,
  pixels: 200,
  direction: '360도 전방면',
  keepDays: 30,
  installedYm: '201312',
  phone: null,
  baseDate: '2026-07-30',
  dist,
});

const seen = { nearby: [] as URL[], detail: [] as string[], search: [] as string[] };
const useHandlers = () =>
  server.use(
    http.get('/api/v1/settings/map/public', () => HttpResponse.json({ provider: 'vworld', apiKey: 'test-key' })),
    // 지역 이동 — 지하철/버스 검색은 '강남' 에만 한 건씩, 주소·장소는 서버 키 없음(enabled=false).
    http.get('/api/v1/subway/stations/search', ({ request }) => {
      const q = new URL(request.url).searchParams.get('q') ?? '';
      return HttpResponse.json({
        items: q.includes('강남')
          ? [{ id: '1002:강남', name: '강남', lat: 37.4979, lng: 127.0276, lines: [{ stationId: '1002:강남', lineId: '1002', lineName: '2호선', lat: 37.4979, lng: 127.0276 }] }]
          : [],
        total: q.includes('강남') ? 1 : 0,
        fetchedAt: status.fetchedAt,
        source: 'db',
      });
    }),
    http.get('/api/v1/bus/stations/search', () => HttpResponse.json({ items: [], total: 0, fetchedAt: status.fetchedAt, source: 'cache' })),
    http.get('/api/v1/life-map/search', ({ request }) => {
      seen.search.push(new URL(request.url).searchParams.get('q') ?? '');
      return HttpResponse.json({ q: '', items: [], enabled: false, fetchedAt: status.fetchedAt });
    }),
    http.get('/api/v1/life-map/status', () => HttpResponse.json(status)),
    http.get('/api/v1/life-map/nearby', ({ request }) => {
      const url = new URL(request.url);
      seen.nearby.push(url);
      const layer = url.searchParams.get('layer');
      const body: LifeMapNearbyResultType =
        layer === 'cctv'
          ? {
              layer: 'cctv',
              center: { lat: 37.5665, lng: 126.978 },
              items: [cctvItem('C1', '생활방범', 12), cctvItem('C2', '어린이보호', 80)],
              total: 2,
              fetchedAt: status.fetchedAt,
            }
          : {
              layer: 'toilet',
              center: { lat: 37.5665, lng: 126.978 },
              items: [toiletItem('T1', '시청 화장실', 40), toiletItem('T2', '광장 화장실', 210, { open24: false, openType: '정시', openDetail: '09:00~18:00' })],
              total: 2,
              fetchedAt: status.fetchedAt,
            };
      return HttpResponse.json(body);
    }),
    http.get('/api/v1/life-map/:layer/:id', ({ params }) => {
      seen.detail.push(`${params.layer}/${params.id}`);
      if (params.layer === 'toilet' && params.id === 'T1') {
        // dist 가 딸려 있어도 상세 계약의 상위 집합 — 구조적으로 만족.
        const item = toiletItem('T1', '시청 화장실', 0);
        return HttpResponse.json(item satisfies LifeMapItemType);
      }
      return HttpResponse.json({ statusCode: 404, error: 'Not Found', message: 'no' }, { status: 404 });
    }),
  );

// 현재 URL 검색 문자열을 DOM 에 노출 — 이동 후 ll/z 갱신 검증용.
const LocationProbe = () => <div data-testid="location-search">{useLocation().search}</div>;

const renderPage = (initialUrl = '/life-map') => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <LocationProbe />
        <Routes>
          <Route element={<Outlet context={{ setSubBar: () => {}, headerHeight: 56 }} />}>
            <Route path="/life-map" element={<LifeMapPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  window.localStorage.clear();
  useAuthStore.setState({ token: null, user: null, isGuest: false });
  useAirLocationStore.setState({ location: null });
  useLifeMapPrefsStore.setState({
    layers: { cctv: true, toilet: true, hospital: true },
    purposes: [],
    toiletFilters: { open24: false, disabled: false, kids: false, diaper: false, bell: false },
    hospitalCategories: [],
  });
  useLifeMapRecentStore.setState({ items: [] });
  seen.nearby = [];
  seen.detail = [];
  seen.search = [];
  useHandlers();
});

describe('LifeMapPage', () => {
  it('레이어 칩·필터 칩·상태 푸터 + 진입 중심(서울시청) 기준 주변 화장실 목록', async () => {
    renderPage();
    // 지도 키(settings/map/public)가 오면 MapCanvas(목)가 그려진다.
    expect(await screen.findByTestId('map-canvas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^CCTV/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /^공중화장실/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('life-purpose-filters')).toBeInTheDocument();
    expect(screen.getByTestId('life-toilet-filters')).toBeInTheDocument();

    const list = screen.getByTestId('life-nearby-list');
    await waitFor(() => expect(within(list).getByText('시청 화장실')).toBeInTheDocument());
    expect(within(list).getByText('광장 화장실')).toBeInTheDocument();
    expect(within(list).getByText('40m')).toBeInTheDocument();
    // 편의 배지 — 24시간·장애인용·비상벨.
    expect(within(list).getAllByText('24시간').length).toBeGreaterThan(0);
    expect(within(list).getAllByText('비상벨').length).toBeGreaterThan(0);

    // 주변 요청은 진입 중심(서울시청)·화장실·반경 1km.
    const first = seen.nearby[0]!;
    expect(first.searchParams.get('layer')).toBe('toilet');
    expect(first.searchParams.get('lat')).toBe('37.5665');
    expect(first.searchParams.get('lng')).toBe('126.978');
    expect(first.searchParams.get('radius')).toBe('1000');

    await waitFor(() => expect(screen.getByTestId('life-map-footer')).toHaveTextContent('CCTV 377,243개'));
    expect(screen.getByTestId('life-map-footer')).toHaveTextContent('좌표 95%');
  });

  it('행 클릭 → 상세 카드(개방시간·변기·관리기관) + ← 목록', async () => {
    renderPage();
    const list = screen.getByTestId('life-nearby-list');
    const row = await within(list).findByText('시청 화장실');
    fireEvent.click(row);
    const detail = await screen.findByTestId('life-detail');
    await waitFor(() => expect(seen.detail).toContain('toilet/T1'));
    expect(within(detail).getByRole('heading', { name: '시청 화장실' })).toBeInTheDocument();
    // 편의 배지 + 개방시간 행 두 곳에 나온다.
    expect(within(detail).getAllByText('24시간').length).toBeGreaterThanOrEqual(2);
    expect(within(detail).getByText(/남 대변기 1·소변기 2 \/ 여 대변기 3/)).toBeInTheDocument();
    expect(within(detail).getByText('서울 중구청')).toBeInTheDocument();
    expect(within(detail).getByText('여자화장실')).toBeInTheDocument();
    fireEvent.click(within(detail).getByRole('button', { name: /목록/ }));
    await waitFor(() => expect(screen.queryByTestId('life-detail')).not.toBeInTheDocument());
    expect(screen.getByTestId('life-nearby-list')).toBeInTheDocument();
  });

  it('CCTV 탭 + 설치목적 칩 → 주변 요청이 layer=cctv·purpose 로 바뀐다', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'CCTV' }));
    const list = screen.getByTestId('life-nearby-list');
    await waitFor(() => expect(within(list).getByText('생활방범 CCTV')).toBeInTheDocument());
    const cctvReq = seen.nearby.find((u) => u.searchParams.get('layer') === 'cctv')!;
    expect(cctvReq.searchParams.get('radius')).toBe('500');
    expect(cctvReq.searchParams.get('purpose')).toBeNull();

    fireEvent.click(within(screen.getByTestId('life-purpose-filters')).getByRole('button', { name: '어린이보호' }));
    await waitFor(() =>
      expect(seen.nearby.some((u) => u.searchParams.get('layer') === 'cctv' && u.searchParams.get('purpose') === '어린이보호')).toBe(true),
    );
    expect(useLifeMapPrefsStore.getState().purposes).toEqual(['어린이보호']);
  });

  it('지역 이동 — 입력 없으면 시도 칩, "강남" 입력 시 행정구역(로컬)·지하철역 섹션, 선택하면 URL ll/z 갱신 + 최근 기록', async () => {
    renderPage();
    const input = screen.getByTestId('life-goto-input');
    fireEvent.focus(input);
    const chips = await screen.findByTestId('life-goto-chips');
    expect(within(chips).getByRole('button', { name: '서울' })).toBeInTheDocument();
    // 패널 본문(레이어 바·목록)은 검색이 열린 동안 숨는다.
    expect(screen.queryByTestId('life-nearby-list')).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: '강남' } });
    const results = screen.getByTestId('life-goto-results');
    const regionRow = await within(results).findByRole('option', { name: /서울 강남구/ });
    await within(results).findByRole('option', { name: /강남역/ });
    expect(within(results).getByText('행정구역')).toBeInTheDocument();
    expect(within(results).getByText('지하철역(수도권)')).toBeInTheDocument();
    // 서버 키 없음(enabled=false) → 주소·장소 섹션은 나오지 않는다.
    await waitFor(() => expect(seen.search).toContain('강남'));
    expect(within(results).queryByText('주소·장소')).not.toBeInTheDocument();

    fireEvent.click(regionRow);
    await waitFor(() => expect(screen.getByTestId('location-search').textContent).toMatch(/ll=37\.\d+%2C127\.\d+/));
    expect(screen.getByTestId('location-search').textContent).toContain('z=14');
    expect(useLifeMapRecentStore.getState().items[0]).toMatchObject({ label: '서울 강남구', zoom: 14 });
    // 이동 후 검색이 닫히고 목록이 돌아온다.
    expect(screen.getByTestId('life-nearby-list')).toBeInTheDocument();
  });

  it('저장한 내 위치(대기·날씨와 공유)가 진입 중심', async () => {
    useAirLocationStore.setState({
      location: { lat: 35.1796, lng: 129.0756, label: '부산 연제구', source: 'place', updatedAt: '2026-08-21T00:00:00.000Z' },
    });
    renderPage();
    await waitFor(() => expect(seen.nearby.length).toBeGreaterThan(0));
    expect(seen.nearby[0]!.searchParams.get('lat')).toBe('35.1796');
    expect(seen.nearby[0]!.searchParams.get('lng')).toBe('129.0756');
  });
});

// ── 모바일(xl 미만) — 시트 패턴 ────────────────────────────────────────────────────────────────
// useIsDesktopXl 은 matchMedia 가 없으면 데스크톱으로 보므로, 모바일은 matchMedia 를 목으로 바꿔 렌더한다.
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

const renderMobile = (initialUrl = '/life-map') => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <LocationProbe />
        <Routes>
          <Route element={<LayoutStub />}>
            <Route path="/life-map" element={<LifeMapPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('LifeMapPage (모바일 시트)', () => {
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

  it('상단바 subBar 에 지역 이동 + 레이어 토글, 목록 시트(핸들)에 주변 목록·필터 행·푸터', async () => {
    renderMobile();
    expect(await screen.findByTestId('map-canvas')).toBeInTheDocument();
    const subbar = screen.getByTestId('layout-subbar');
    expect(within(subbar).getByTestId('life-goto-input')).toBeInTheDocument();
    expect(within(subbar).getByRole('button', { name: /^CCTV/ })).toHaveAttribute('aria-pressed', 'true');
    // 필터 행은 헤더가 아니라 시트 안(목록 머리 행 아래).
    expect(within(subbar).queryByTestId('life-purpose-filters')).toBeNull();

    expect(document.querySelector('[data-sheet-handle]')).not.toBeNull();
    const sheet = screen.getByTestId('life-list-sheet');
    expect(within(sheet).getByTestId('life-purpose-filters')).toBeInTheDocument();
    expect(within(sheet).getByTestId('life-toilet-filters')).toBeInTheDocument();
    const list = within(sheet).getByTestId('life-nearby-list');
    await waitFor(() => expect(within(list).getByText('시청 화장실')).toBeInTheDocument());
    await waitFor(() => expect(within(sheet).getByTestId('life-map-footer')).toHaveTextContent('CCTV 377,243개'));
    // 상세 시트는 선택 전엔 없다.
    expect(screen.queryByTestId('life-detail-sheet')).toBeNull();
  });

  it('행 클릭 → 상세 시트가 따로 뜨고(목록 시트는 남아 있음) ← 목록 으로 닫힌다', async () => {
    renderMobile();
    const list = screen.getByTestId('life-nearby-list');
    fireEvent.click(await within(list).findByText('시청 화장실'));
    const detailSheet = await screen.findByTestId('life-detail-sheet');
    const detail = await within(detailSheet).findByTestId('life-detail');
    expect(within(detail).getByRole('heading', { name: '시청 화장실' })).toBeInTheDocument();
    expect(screen.getByTestId('life-list-sheet')).toBeInTheDocument();
    expect(screen.getByTestId('location-search').textContent).toContain('sel=toilet%3AT1');
    fireEvent.click(within(detail).getByRole('button', { name: /목록/ }));
    await waitFor(() => expect(screen.queryByTestId('life-detail-sheet')).toBeNull());
    expect(screen.getByTestId('life-nearby-list')).toBeInTheDocument();
  });

  it('지역 이동 드롭다운이 열려도 주변 목록 시트는 그대로, 선택하면 닫히고 URL ll/z 갱신', async () => {
    renderMobile();
    const input = screen.getByTestId('life-goto-input');
    fireEvent.focus(input);
    await screen.findByTestId('life-goto-chips');
    expect(screen.getByTestId('life-nearby-list')).toBeInTheDocument();
    fireEvent.change(input, { target: { value: '강남' } });
    const results = screen.getByTestId('life-goto-results');
    fireEvent.click(await within(results).findByRole('option', { name: /서울 강남구/ }));
    await waitFor(() => expect(screen.getByTestId('location-search').textContent).toContain('z=14'));
    expect(screen.queryByTestId('life-goto-results')).toBeNull();
  });
});
