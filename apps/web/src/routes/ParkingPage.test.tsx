import { forwardRef, useImperativeHandle } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type {
  EvNearbyResultType,
  EvStationDetailType,
  ParkingAirportsResultType,
  ParkingLotDetailType,
  ParkingLotNearbyItemType,
  ParkingLotNearbyResultType,
  ParkingStatusResultType,
} from '@repo/api-contract';
import { useAirLocationStore, useAuthStore } from '@repo/shared';
import { server } from '~/test/msw';
import { useLifeMapRecentStore } from '~/stores/lifeMapRecentStore';
import { useParkingPrefsStore } from '~/stores/parkingPrefsStore';
import { ParkingPage } from './ParkingPage';

// 주차 페이지 스모크 — 지도(OL)는 목으로 바꾸고 패널 계약을 본다: ① 탭·필터 칩·상태 푸터 + 진입 중심(서울시청) 기준 주변
// 주차장(요금 한 줄·실시간 여석) ② 행 클릭 → URL sel + 상세(오늘 운영·예상 요금·평소 혼잡도) ③ '무료만' 칩이 요청에 반영
// ④ 충전소 탭 → 목록·상세(충전기 상태) ⑤ 공항 탭 → 거리순 목록·인천 상세(터미널 묶음·초과 주차 만차).
// MapCanvas 목은 viewport 를 올리지 않으므로 points 요청은 나가지 않는다(뷰포트 없음 = 비활성).

vi.mock('~/components/restaurant/MapCanvas', () => ({
  MapCanvas: forwardRef(function MockMapCanvas(_props, ref) {
    useImperativeHandle(ref, () => ({ flyTo: () => {}, flyToZoomIn: () => {}, fitToMarkers: () => {}, fitToCoords: () => {} }));
    return <div data-testid="map-canvas" />;
  }),
}));

const FETCHED = '2026-09-25T07:00:00.000Z';
const status: ParkingStatusResultType = {
  lots: { loaded: true, count: 18168, bySource: { std: 17333, seoul: 835, kotsa: 0 }, geocoded: 17412, baseDate: '2026-08-19', loadedAt: FETCHED },
  ev: { loaded: true, stations: 99850, chargers: 515263, loadedAt: FETCHED, statusAt: FETCHED },
  live: { lotCount: 99, lotAt: FETCHED, airportLotCount: 44, airportAt: FETCHED },
  fetchedAt: FETCHED,
};

const hours = { wd: { open: '00:00', close: '24:00' }, sat: { open: '00:00', close: '24:00' }, hol: { open: '00:00', close: '24:00' } };
const lot = (over: Partial<ParkingLotNearbyItemType>): ParkingLotNearbyItemType => ({
  id: 'seoul:171721',
  source: 'seoul',
  name: '세종로 공영주차장(시)',
  ownership: 'public',
  lotType: 'offstreet',
  feeType: 'paid',
  roadAddr: null,
  lotAddr: '서울특별시 종로구 세종로 80-1',
  phone: '02-2290-6566',
  orgName: null,
  totalSpaces: 1260,
  hours,
  operDays: null,
  fee: { baseMin: 5, baseFee: 430, addMin: 5, addFee: 430, dayMaxFee: null, dayPassFee: null, monthlyFee: 176000 },
  satFree: true,
  holFree: false,
  payMethods: null,
  note: '시간제 주차장',
  disabledZone: null,
  lat: 37.5734,
  lng: 126.9759,
  geoSource: 'source',
  baseDate: '2026-09-25',
  live: { total: 1260, occupied: 245, available: 1015, level: 'free', updatedAt: FETCHED, fetchedAt: FETCHED },
  dist: 391,
  ...over,
});
const lotFree = lot({
  id: 'std:A',
  source: 'std',
  name: '시청 무료주차장',
  feeType: 'free',
  fee: { baseMin: null, baseFee: null, addMin: null, addFee: null, dayMaxFee: null, dayPassFee: null, monthlyFee: null },
  satFree: null,
  holFree: null,
  live: null,
  dist: 120,
});
const lotDetail: ParkingLotDetailType = {
  ...(({ dist: _d, ...rest }) => rest)(lot({})),
  pattern: {
    dow: 5,
    minSamples: 24,
    hours: Array.from({ length: 24 }, (_, hour) => ({ hour, occ: hour >= 9 && hour <= 20 ? 0.8 : null, fullRatio: hour === 12 ? 0.25 : 0, samples: hour >= 9 && hour <= 20 ? 30 : 3 })),
  },
};

const evNearby: EvNearbyResultType = {
  center: { lat: 37.5665, lng: 126.978 },
  items: [
    {
      id: 'ME1',
      name: '광화문빌딩',
      addr: '서울특별시 종로구 세종대로 149',
      addrDetail: '지하4층 주차장',
      location: null,
      lat: 37.5703,
      lng: 126.9771,
      useTime: '24시간 이용가능',
      operator: 'GS차지비',
      operatorCall: '1544-4279',
      parkingFree: true,
      limited: false,
      limitDetail: null,
      note: null,
      kind: 'G0',
      kindDetail: 'G004',
      kindLabel: '기타',
      floorType: 'B',
      floorNum: '4',
      chargerCount: 6,
      fastCount: 1,
      availableCount: 3,
      chargingCount: 2,
      level: 'available',
      dist: 420,
    },
  ],
  total: 1,
  fetchedAt: FETCHED,
  statusAt: FETCHED,
};
const evDetail: EvStationDetailType = {
  ...(({ dist: _d, ...rest }) => rest)(evNearby.items[0]!),
  statusAt: FETCHED,
  chargers: [
    { id: '01', type: '04', outputKw: 100, method: '단독', fast: true, stat: 3, statUpdatedAt: FETCHED, lastChargeEndAt: null, chargingSince: FETCHED },
    { id: '02', type: '02', outputKw: 7, method: '단독', fast: false, stat: 2, statUpdatedAt: FETCHED, lastChargeEndAt: null, chargingSince: null },
  ],
};
const airports: ParkingAirportsResultType = {
  fetchedAt: FETCHED,
  stale: false,
  airports: [
    {
      code: 'ICN',
      name: '인천국제공항',
      lat: 37.4602,
      lng: 126.4407,
      total: 1040,
      occupied: 1010,
      level: 'full',
      lots: [
        { name: 'T1 단기주차장지하1층', total: 520, occupied: 534, rate: 534 / 520, level: 'full', updatedAt: FETCHED, usualOcc: 0.9 },
        { name: 'T2 장기 주차장', total: 520, occupied: 476, rate: 476 / 520, level: 'busy', updatedAt: FETCHED, usualOcc: null },
      ],
    },
    { code: 'GMP', name: '김포국제공항', lat: 37.5586, lng: 126.7903, total: 2279, occupied: 1000, level: 'free', lots: [{ name: '국내선 제1주차장', total: 2279, occupied: 1000, rate: 1000 / 2279, level: 'free', updatedAt: FETCHED, usualOcc: null }] },
    { code: 'CJU', name: '제주국제공항', lat: 33.5111, lng: 126.493, total: null, occupied: null, level: null, lots: [] },
  ],
};

const seen = { lotNearby: [] as URL[] };
const useHandlers = () =>
  server.use(
    http.get('/api/v1/settings/map/public', () => HttpResponse.json({ provider: 'vworld', apiKey: 'test-key' })),
    http.get('/api/v1/parking/status', () => HttpResponse.json(status)),
    http.get('/api/v1/parking/lots/nearby', ({ request }) => {
      const url = new URL(request.url);
      seen.lotNearby.push(url);
      const free = url.searchParams.get('freeOnly') === '1';
      const body: ParkingLotNearbyResultType = {
        center: { lat: Number(url.searchParams.get('lat')), lng: Number(url.searchParams.get('lng')) },
        items: free ? [lotFree] : [lotFree, lot({})],
        total: free ? 1 : 2,
        fetchedAt: FETCHED,
      };
      return HttpResponse.json(body);
    }),
    http.get('/api/v1/parking/lots/:id', ({ params }) =>
      params.id === 'seoul:171721' ? HttpResponse.json(lotDetail) : HttpResponse.json({ statusCode: 404, error: 'Not Found', message: 'no' }, { status: 404 }),
    ),
    http.get('/api/v1/parking/ev/nearby', () => HttpResponse.json(evNearby)),
    http.get('/api/v1/parking/ev/:id', () => HttpResponse.json(evDetail)),
    http.get('/api/v1/parking/airports', () => HttpResponse.json(airports)),
  );

const LocationProbe = () => <div data-testid="location-search">{useLocation().search}</div>;

const renderPage = (initialUrl = '/parking') => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <LocationProbe />
        <Routes>
          <Route element={<Outlet context={{ setSubBar: () => {}, headerHeight: 56 }} />}>
            <Route path="/parking" element={<ParkingPage />} />
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
  useLifeMapRecentStore.setState({ items: [] });
  useParkingPrefsStore.setState({
    lotFilters: { publicOnly: false, freeOnly: false, liveOnly: false },
    evFilters: { fastOnly: false, freeParkingOnly: false, availableOnly: false, openOnly: false },
  });
  seen.lotNearby = [];
  useHandlers();
});

describe('ParkingPage', () => {
  it('탭·필터·상태 푸터 + 진입 중심(서울시청) 기준 주변 주차장(요금·실시간 여석)', async () => {
    renderPage();
    expect(await screen.findByTestId('map-canvas')).toBeInTheDocument();
    const tabs = screen.getByTestId('parking-tabs');
    expect(within(tabs).getByRole('tab', { name: '주차장' })).toHaveAttribute('aria-selected', 'true');
    expect(within(screen.getByTestId('parking-filters')).getByRole('button', { name: '무료만' })).toHaveAttribute('aria-pressed', 'false');

    const list = screen.getByTestId('parking-lot-list');
    await waitFor(() => expect(within(list).getByText('세종로 공영주차장(시)')).toBeInTheDocument());
    expect(within(list).getByText('공영 · 노외 · 유료 · 기본 5분 430원 · 추가 5분 430원')).toBeInTheDocument();
    expect(within(list).getByText('여유 · 여석 1,015 / 1,260')).toBeInTheDocument();
    expect(within(list).getByText('공영 · 노외 · 무료')).toBeInTheDocument();
    expect(within(list).getByText('391m')).toBeInTheDocument();

    const first = seen.lotNearby[0]!;
    expect(first.searchParams.get('lat')).toBe('37.5665');
    expect(first.searchParams.get('lng')).toBe('126.978');
    expect(first.searchParams.get('radius')).toBe('1000');
    expect(first.searchParams.get('freeOnly')).toBeNull();
    await waitFor(() => expect(screen.getByTestId('parking-footer')).toHaveTextContent('주차장 18,168곳(서울 835 · 전국 표준 17,333) · 실시간 여석 99곳'));
  });

  it('행 클릭 → URL sel + 상세(오늘 운영·예상 요금·평소 혼잡도)', async () => {
    renderPage();
    const list = await screen.findByTestId('parking-lot-list');
    fireEvent.click(await within(list).findByText('세종로 공영주차장(시)'));
    await waitFor(() => expect(screen.getByTestId('location-search')).toHaveTextContent('sel=seoul%3A171721'));
    const card = await screen.findByTestId('parking-lot-detail');
    expect(within(card).getByTestId('parking-live')).toHaveTextContent('여석 1,015');
    expect(within(card).getByTestId('parking-fee-estimates')).toHaveTextContent('1시간 5,160원');
    expect(within(card).getByTestId('parking-fee-estimates')).toHaveTextContent('3시간 15,480원');
    expect(within(card).getByText('월 정기권 176,000원')).toBeInTheDocument();
    expect(within(card).getByText('토요일 무료')).toBeInTheDocument();
    expect(within(card).getByTestId('parking-pattern')).toHaveTextContent('금요일 평소 혼잡도');
    expect(within(card).getByRole('link', { name: /네이버 지도 길찾기/ })).toHaveAttribute('href', expect.stringContaining('/car'));
    fireEvent.click(within(card).getByRole('button', { name: /목록/ }));
    await waitFor(() => expect(screen.getByTestId('location-search')).not.toHaveTextContent('sel='));
  });

  it("'무료만' 칩이 주변 요청에 freeOnly=1 로 반영", async () => {
    renderPage();
    await within(await screen.findByTestId('parking-lot-list')).findByText('세종로 공영주차장(시)');
    fireEvent.click(within(screen.getByTestId('parking-filters')).getByRole('button', { name: '무료만' }));
    await waitFor(() => expect(seen.lotNearby.some((u) => u.searchParams.get('freeOnly') === '1')).toBe(true));
    await waitFor(() => expect(within(screen.getByTestId('parking-lot-list')).queryByText('세종로 공영주차장(시)')).not.toBeInTheDocument());
  });

  it('충전소 탭 — 목록(사용 가능 대수·주차료 무료) → 상세(충전기별 상태)', async () => {
    renderPage('/parking?t=ev');
    const list = await screen.findByTestId('parking-ev-list');
    await waitFor(() => expect(within(list).getByText('광화문빌딩')).toBeInTheDocument());
    expect(within(list).getByText('급속 1 · 완속 5 · GS차지비')).toBeInTheDocument();
    expect(within(list).getByText(/사용 가능 3기/)).toBeInTheDocument();
    fireEvent.click(within(list).getByText('광화문빌딩'));
    const card = await screen.findByTestId('parking-ev-detail');
    const chargers = within(card).getByTestId('parking-ev-chargers');
    expect(within(chargers).getAllByRole('listitem')).toHaveLength(2);
    expect(chargers).toHaveTextContent('급속 100kW');
    expect(chargers).toHaveTextContent('충전 중');
    expect(within(card).getByText('지하 4층')).toBeInTheDocument();
  });

  it('공항 탭 — 거리순 목록 → 인천 상세(터미널 묶음·초과 주차 만차·평소 점유율)', async () => {
    renderPage('/parking?t=airport');
    const list = await screen.findByTestId('parking-airport-list');
    await waitFor(() => expect(within(list).getByText('김포국제공항')).toBeInTheDocument());
    const names = within(list)
      .getAllByRole('button')
      .map((b) => b.textContent ?? '');
    // 서울시청 기준 — 김포가 인천보다 가깝고, 제주가 가장 멀다.
    expect(names.findIndex((t) => t.includes('김포'))).toBeLessThan(names.findIndex((t) => t.includes('인천')));
    expect(names.at(-1)).toContain('제주');
    expect(within(list).getByText('실시간 정보 없음')).toBeInTheDocument();
    fireEvent.click(within(list).getByText('인천국제공항'));
    const card = await screen.findByTestId('parking-airport-detail');
    expect(within(card).getByText('제1여객터미널')).toBeInTheDocument();
    expect(within(card).getByText('제2여객터미널')).toBeInTheDocument();
    expect(card).toHaveTextContent('534/520');
    expect(card).toHaveTextContent('103% 사용 · 평소 이 시간 90%');
  });
});
