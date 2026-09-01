import { forwardRef, useImperativeHandle, useMemo, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type {
  HousingComplexDetailType,
  HousingNearbyItemType,
  HousingNearbyResultType,
  HousingSearchResultType,
  HousingStatusResultType,
  HousingTradeType,
  HousingTradesResultType,
} from '@repo/api-contract';
import { useAirLocationStore, useAuthStore } from '@repo/shared';
import { server } from '~/test/msw';
import { useHousingPrefsStore } from '~/stores/housingPrefsStore';
import { useLifeMapRecentStore } from '~/stores/lifeMapRecentStore';
import { HousingPage } from './HousingPage';

// 집값 페이지 스모크 — 지도(OL)는 목으로 바꾸고 패널 쪽 계약을 본다: ① 유형 탭·면적 칩·상태 푸터 +
// 진입 중심(서울시청) 기준 주변 단지 목록(배지 가격 문자열) ② 행 클릭 → URL sel + 상세(통계 표·거래
// 목록·더 보기) ③ 전세 탭·면적 칩이 주변 요청 축에 반영 ④ 지역 이동의 '아파트 단지' 섹션 → 이동 + sel
// ⑤ 저장한 내 위치가 진입 중심 ⑥ 모바일 시트.
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

const status: HousingStatusResultType = {
  complexes: { loaded: true, count: 45920, geocoded: 44078, baseDate: '2025-09-18', loadedAt: '2026-08-30T10:00:00.000Z' },
  trades: { loaded: true, count: 1200000, fromYm: '202409', toYm: '202608', loadedAt: '2026-08-30T11:00:00.000Z' },
  rents: { loaded: true, count: 2500000, fromYm: '202409', toYm: '202608', loadedAt: '2026-08-30T11:00:00.000Z' },
  statsAt: '2026-08-30T11:05:00.000Z',
  officialPrices: { loaded: true, year: 2025, complexes: 40000, loadedAt: '2026-08-30T11:30:00.000Z' },
  kapt: { loaded: true, matched: 18000, loadedAt: '2026-08-30T11:40:00.000Z' },
  buildings: { fetched: 12000, total: 45920, loadedAt: '2026-08-30T11:50:00.000Z' },
  fetchedAt: '2026-08-30T12:00:00.000Z',
};

const latestTrade = { price: 125000, rent: 0, area: 84.97, floor: 12, dealDate: '2025-07-21' };
const latestJeonse = { price: 35000, rent: 0, area: 84.97, floor: 5, dealDate: '2025-07-31' };
const officialA = { year: 2025, median: 52000, count: 60 };
const complexA = (over: Partial<HousingNearbyItemType> = {}): HousingNearbyItemType => ({
  id: 'A1',
  name: '청운현대',
  kind: 'apt',
  addr: '서울특별시 종로구 청운동 56-45',
  lat: 37.5875,
  lng: 126.9689,
  households: 60,
  dongCount: 4,
  approvedDate: '2000-10-02',
  latest: latestTrade,
  count12: 3,
  fallback: null,
  official: officialA,
  saleType: '분양',
  dist: 120,
  ...over,
});
// 축 거래도 폴백도 공시가격도 없는 단지 — '거래 없음'.
const complexB: HousingNearbyItemType = {
  id: 'B2',
  name: '신현아파트',
  kind: 'apt',
  addr: '서울특별시 종로구 신교동 6-11',
  lat: 37.5851,
  lng: 126.9702,
  households: 10,
  dongCount: 1,
  approvedDate: '2002-03-18',
  latest: null,
  count12: 0,
  fallback: null,
  official: null,
  saleType: null,
  dist: 340,
};
// 축(매매)엔 없고 다른 조건(전세)의 마지막 거래만 있는 단지 — 회색 '전세 3.1억'.
const complexC: HousingNearbyItemType = {
  id: 'C3',
  name: '옥인빌라트',
  kind: 'apt',
  addr: '서울특별시 종로구 옥인동 56',
  lat: 37.584,
  lng: 126.966,
  households: 9,
  dongCount: 1,
  approvedDate: '2005-09-02',
  latest: null,
  count12: 0,
  fallback: { dealType: 'jeonse', price: 31000, rent: 0, area: 59.8, floor: 5, dealDate: '2024-03-10' },
  official: null,
  saleType: null,
  dist: 520,
};
// 거래는 없고 공시가격만 있는 임대단지 — '공시 5.2억' + 임대 태그.
const complexD: HousingNearbyItemType = {
  id: 'D4',
  name: '청운임대',
  kind: 'apt',
  addr: '서울특별시 종로구 청운동 1',
  lat: 37.589,
  lng: 126.967,
  households: 400,
  dongCount: 5,
  approvedDate: '2010-01-01',
  latest: null,
  count12: 0,
  fallback: null,
  official: { year: 2025, median: 52000, count: 400 },
  saleType: '임대',
  dist: 700,
};
const detail: HousingComplexDetailType = {
  id: 'A1',
  name: '청운현대',
  altNames: ['청운현대(아)104동'],
  kind: 'apt',
  addr: '서울특별시 종로구 청운동 56-45',
  sido: '서울특별시',
  sgg: '종로구',
  umd: '청운동',
  pnu: '1111010100100560045',
  households: 60,
  dongCount: 4,
  approvedDate: '2000-10-02',
  lat: 37.5875,
  lng: 126.9689,
  geoSource: 'parcel',
  source: 'reb',
  stats: {
    trade: [
      { band: 'b2', latest: latestTrade, count12: 3, count: 10, unitPrice12: 1573 },
      { band: 'all', latest: latestTrade, count12: 3, count: 10, unitPrice12: 1573 },
    ],
    jeonse: [{ band: 'all', latest: latestJeonse, count12: 1, count: 4, unitPrice12: 412 }],
    monthly: [],
  },
  officialPrices: [
    { band: 'b2', year: 2025, count: 60, median: 52000, min: 41000, max: 63000, avgArea: 84.9 },
    { band: 'all', year: 2025, count: 60, median: 52000, min: 41000, max: 63000, avgArea: 84.9 },
  ],
  kaptCode: 'A10012345',
  saleType: '분양',
  heating: '개별난방',
  elevatorCount: 4,
  roadAddr: '서울특별시 종로구 자하문로36길 16-14',
  parkingCount: 54,
  floorsMax: 15,
  structure: '철근콘크리트구조',
  baseDate: '2025-09-18',
};
const trade = (id: string, dealDate: string, price: number, over: Partial<HousingTradeType> = {}): HousingTradeType => ({
  id,
  dealType: 'trade',
  dealDate,
  area: 84.97,
  floor: 12,
  price,
  rent: 0,
  buildYear: 2000,
  dealingGbn: '중개거래',
  canceled: false,
  canceledDate: null,
  rgstDate: '25.10.24',
  aptDong: '104',
  buyerGbn: '개인',
  slerGbn: '개인',
  contractType: null,
  useRRRight: null,
  contractTerm: null,
  preDeposit: null,
  preRent: null,
  ...over,
});
const TRADES = [trade('T1', '2025-07-21', 125000), trade('T2', '2025-03-02', 118000, { dealingGbn: '직거래' }), trade('T3', '2024-11-15', 110000)];

const seen = { nearby: [] as URL[], complex: [] as string[], trades: [] as URL[], search: [] as string[] };
const useHandlers = () =>
  server.use(
    http.get('/api/v1/settings/map/public', () => HttpResponse.json({ provider: 'vworld', apiKey: 'test-key' })),
    // 지역 이동 — 지하철/버스/주소·장소는 결과 없음(주소·장소는 서버 키 없음 enabled=false).
    http.get('/api/v1/subway/stations/search', () => HttpResponse.json({ items: [], total: 0, fetchedAt: status.fetchedAt, source: 'db' })),
    http.get('/api/v1/bus/stations/search', () => HttpResponse.json({ items: [], total: 0, fetchedAt: status.fetchedAt, source: 'cache' })),
    http.get('/api/v1/life-map/search', () => HttpResponse.json({ q: '', items: [], enabled: false, fetchedAt: status.fetchedAt })),
    http.get('/api/v1/housing/status', () => HttpResponse.json(status)),
    http.get('/api/v1/housing/nearby', ({ request }) => {
      const url = new URL(request.url);
      seen.nearby.push(url);
      const dealType = url.searchParams.get('dealType');
      const body: HousingNearbyResultType = {
        center: { lat: Number(url.searchParams.get('lat')), lng: Number(url.searchParams.get('lng')) },
        dealType: dealType === 'jeonse' ? 'jeonse' : dealType === 'monthly' ? 'monthly' : 'trade',
        band: 'all',
        items: dealType === 'jeonse' ? [complexA({ latest: latestJeonse, count12: 1 })] : [complexA(), complexB, complexC, complexD],
        total: dealType === 'jeonse' ? 1 : 4,
        fetchedAt: status.fetchedAt,
      };
      return HttpResponse.json(body);
    }),
    http.get('/api/v1/housing/search', ({ request }) => {
      const q = new URL(request.url).searchParams.get('q') ?? '';
      seen.search.push(q);
      const body: HousingSearchResultType = {
        q,
        items: q.includes('래미안')
          ? [{ id: 'R9', name: '래미안퍼스티지', addr: '서울특별시 서초구 반포동 18-1', lat: 37.5047, lng: 127.0043, households: 2444 }]
          : [],
        fetchedAt: status.fetchedAt,
      };
      return HttpResponse.json(body);
    }),
    http.get('/api/v1/housing/complexes/:id/trades', ({ request, params }) => {
      const url = new URL(request.url);
      seen.trades.push(url);
      const offset = Number(url.searchParams.get('offset') ?? '0');
      const limit = Number(url.searchParams.get('limit') ?? '30');
      // 첫 페이지는 일부러 2건만 — '더 보기' 가 나오도록(total 3).
      const page = offset === 0 ? TRADES.slice(0, Math.min(2, limit)) : TRADES.slice(offset, offset + limit);
      const body: HousingTradesResultType = {
        complexId: String(params.id),
        dealType: (url.searchParams.get('dealType') as HousingTradesResultType['dealType']) ?? 'trade',
        band: (url.searchParams.get('band') as HousingTradesResultType['band']) ?? 'all',
        items: page,
        total: TRADES.length,
        fetchedAt: status.fetchedAt,
      };
      return HttpResponse.json(body);
    }),
    http.get('/api/v1/housing/complexes/:id', ({ params }) => {
      seen.complex.push(String(params.id));
      if (params.id === 'A1') return HttpResponse.json(detail);
      if (params.id === 'R9') {
        return HttpResponse.json({ ...detail, id: 'R9', name: '래미안퍼스티지', addr: '서울특별시 서초구 반포동 18-1', lat: 37.5047, lng: 127.0043 } satisfies HousingComplexDetailType);
      }
      return HttpResponse.json({ statusCode: 404, error: 'Not Found', message: 'no' }, { status: 404 });
    }),
  );

// 현재 URL 검색 문자열을 DOM 에 노출 — 이동 후 ll/z/sel 갱신 검증용.
const LocationProbe = () => <div data-testid="location-search">{useLocation().search}</div>;

const renderPage = (initialUrl = '/housing') => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <LocationProbe />
        <Routes>
          <Route element={<Outlet context={{ setSubBar: () => {}, headerHeight: 56 }} />}>
            <Route path="/housing" element={<HousingPage />} />
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
  useHousingPrefsStore.setState({ dealType: 'trade', band: 'all' });
  useLifeMapRecentStore.setState({ items: [] });
  seen.nearby = [];
  seen.complex = [];
  seen.trades = [];
  seen.search = [];
  useHandlers();
});

describe('HousingPage', () => {
  it('유형 탭·면적 칩·상태 푸터 + 진입 중심(서울시청) 기준 주변 단지 목록', async () => {
    renderPage();
    expect(await screen.findByTestId('map-canvas')).toBeInTheDocument();
    const tabs = screen.getByTestId('housing-deal-tabs');
    expect(within(tabs).getByRole('tab', { name: '매매' })).toHaveAttribute('aria-selected', 'true');
    expect(within(tabs).getByRole('tab', { name: '전세' })).toHaveAttribute('aria-selected', 'false');
    const bands = screen.getByTestId('housing-band-filters');
    expect(within(bands).getByRole('button', { name: '전체 면적' })).toHaveAttribute('aria-pressed', 'true');

    const list = screen.getByTestId('housing-nearby-list');
    await waitFor(() => expect(within(list).getByText('청운현대')).toBeInTheDocument());
    expect(within(list).getByText('12.5억')).toBeInTheDocument();
    expect(within(list).getByText(/84\.97㎡ · 12층 · 25\.07\.21/)).toBeInTheDocument();
    expect(within(list).getByText('60세대 · 2000년 · 청운동 56-45')).toBeInTheDocument();
    expect(within(list).getByText('12개월 3건')).toBeInTheDocument();
    expect(within(list).getByText('신현아파트')).toBeInTheDocument();
    expect(within(list).getByText('거래 없음')).toBeInTheDocument();
    expect(within(list).getByText('120m')).toBeInTheDocument();

    // 주변 요청은 진입 중심(서울시청)·매매·전체 면적·반경 1km.
    const first = seen.nearby[0]!;
    expect(first.searchParams.get('lat')).toBe('37.5665');
    expect(first.searchParams.get('lng')).toBe('126.978');
    expect(first.searchParams.get('radius')).toBe('1000');
    expect(first.searchParams.get('dealType')).toBe('trade');
    expect(first.searchParams.get('band')).toBe('all');

    await waitFor(() => expect(screen.getByTestId('housing-footer')).toHaveTextContent('단지 45,920개(좌표 96%)'));
    expect(screen.getByTestId('housing-footer')).toHaveTextContent('매매 1,200,000건(2024.09~2026.08)');
    expect(screen.getByTestId('housing-footer')).toHaveTextContent('전월세 2,500,000건');
    // 보강 상태 줄 — 공시가격 연도(단지 수)·K-apt 매칭·건축물대장 조회 수.
    expect(screen.getByTestId('housing-footer')).toHaveTextContent('공시가격 2025(40,000단지)');
    expect(screen.getByTestId('housing-footer')).toHaveTextContent('단지정보 K-apt 18,000');
    expect(screen.getByTestId('housing-footer')).toHaveTextContent('건축물대장 12,000/45,920');
  });

  it('축에 거래 없는 단지 — 다른 조건의 마지막 거래(회색 유형 라벨) → 공시가격 → 거래 없음, 임대 태그', async () => {
    renderPage();
    const list = screen.getByTestId('housing-nearby-list');
    // 폴백: 매매 축인데 전세 마지막 거래를 유형 라벨과 함께.
    await waitFor(() => expect(within(list).getByText('전세 3.1억')).toBeInTheDocument());
    expect(within(list).getByText(/59\.8㎡ · 5층 · 24\.03\.10 · 선택 조건 거래 없음/)).toBeInTheDocument();
    // 공시가격만 있는 임대단지.
    expect(within(list).getByText('공시 5.2억')).toBeInTheDocument();
    expect(within(list).getByText(/2025 공시가격 중위 · 거래 없음/)).toBeInTheDocument();
    const rentalRow = within(list).getByText('청운임대').closest('li')!;
    expect(within(rentalRow).getByText('임대')).toBeInTheDocument();
    // 분양 단지엔 임대 태그가 없고, 아무것도 없는 단지는 '거래 없음'.
    expect(within(within(list).getByText('청운현대').closest('li')!).queryByText('임대')).toBeNull();
    expect(within(within(list).getByText('신현아파트').closest('li')!).getByText('거래 없음')).toBeInTheDocument();
  });

  it('상세 — 보강 속성(분양형태·난방·승강기·주차 세대당·최고층·구조)·도로명주소·공시가격 표', async () => {
    renderPage();
    const list = screen.getByTestId('housing-nearby-list');
    fireEvent.click(await within(list).findByText('청운현대'));
    const detailEl = await screen.findByTestId('housing-detail');
    expect(within(detailEl).getByTestId('housing-detail-facts')).toHaveTextContent(
      '분양형태 분양 · 개별난방 · 승강기 4대 · 주차 54대 (세대당 0.9대) · 최고 15층 · 철근콘크리트구조',
    );
    expect(within(detailEl).getByText('서울특별시 종로구 자하문로36길 16-14')).toBeInTheDocument();
    expect(within(detailEl).queryByText('임대단지')).toBeNull();

    const prices = within(detailEl).getByTestId('housing-official-prices');
    expect(prices).toHaveTextContent('2025 공시가격');
    const rows = within(prices).getAllByRole('row');
    // 'all' 행이 먼저(전체), 그 다음 60~85㎡.
    expect(rows[1]).toHaveTextContent('전체');
    expect(rows[1]).toHaveTextContent('5.2억');
    expect(rows[1]).toHaveTextContent('4.1억~6.3억');
    expect(rows[1]).toHaveTextContent('60호');
    expect(rows[1]).toHaveTextContent('84.9㎡');
    expect(rows[2]).toHaveTextContent('60~85㎡');
    expect(within(detailEl).getByText(/공시가격은 매년 1월 1일 기준/)).toBeInTheDocument();
  });

  it('행 클릭 → URL sel + 상세(통계 표·거래 목록·더 보기) + ← 목록', async () => {
    renderPage();
    const list = screen.getByTestId('housing-nearby-list');
    fireEvent.click(await within(list).findByText('청운현대'));
    const detailEl = await screen.findByTestId('housing-detail');
    await waitFor(() => expect(seen.complex).toContain('A1'));
    expect(screen.getByTestId('location-search').textContent).toContain('sel=A1');
    expect(within(detailEl).getByRole('heading', { name: '청운현대' })).toBeInTheDocument();
    expect(within(detailEl).getByText(/아파트 · 60세대 · 4개동 · 2000년 사용승인/)).toBeInTheDocument();
    expect(within(detailEl).getByText('다른 이름: 청운현대(아)104동')).toBeInTheDocument();

    // 통계 표 — '전체' 행이 먼저, 평당가 1573만/㎡ → 5,200만/평.
    const stats = within(detailEl).getByTestId('housing-detail-stats');
    const rows = within(stats).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('전체');
    expect(rows[1]).toHaveTextContent('12.5억');
    expect(rows[1]).toHaveTextContent('3건');
    expect(rows[1]).toHaveTextContent('5,200만/평');
    expect(rows[2]).toHaveTextContent('60~85㎡');

    // 거래 목록 — 첫 페이지 2건 + '더 보기 (1건 남음)' → 클릭하면 offset=2 로 나머지.
    const trades = within(detailEl).getByTestId('housing-trades');
    await waitFor(() => expect(within(trades).getByText('25.07.21')).toBeInTheDocument());
    expect(within(trades).getByText('25.03.02')).toBeInTheDocument();
    expect(within(trades).getByText('직거래')).toBeInTheDocument();
    expect(seen.trades[0]!.searchParams.get('dealType')).toBe('trade');
    expect(seen.trades[0]!.searchParams.get('band')).toBe('all');
    const more = within(trades).getByRole('button', { name: /더 보기 \(1건 남음\)/ });
    fireEvent.click(more);
    await waitFor(() => expect(seen.trades.some((u) => u.searchParams.get('offset') === '2')).toBe(true));
    await waitFor(() => expect(within(trades).getByText('24.11.15')).toBeInTheDocument());
    expect(within(trades).queryByRole('button', { name: /더 보기/ })).toBeNull();

    // 상세 안 전세 탭 — 전역 축은 그대로(주변 요청은 안 바뀐다), 통계는 전세 것.
    fireEvent.click(within(within(detailEl).getByTestId('housing-detail-tabs')).getByRole('tab', { name: '전세' }));
    await waitFor(() => expect(within(detailEl).getByTestId('housing-detail-stats')).toHaveTextContent('3.5억'));
    expect(useHousingPrefsStore.getState().dealType).toBe('trade');

    fireEvent.click(within(detailEl).getByRole('button', { name: /목록/ }));
    await waitFor(() => expect(screen.queryByTestId('housing-detail')).not.toBeInTheDocument());
    expect(screen.getByTestId('housing-nearby-list')).toBeInTheDocument();
    expect(screen.getByTestId('location-search').textContent).not.toContain('sel=');
  });

  it('전세 탭 + 60~85㎡ 칩 → 주변 요청이 dealType=jeonse·band=b2 로 바뀌고 스토어에 남는다', async () => {
    renderPage();
    const list = screen.getByTestId('housing-nearby-list');
    await within(list).findByText('청운현대');
    fireEvent.click(within(screen.getByTestId('housing-deal-tabs')).getByRole('tab', { name: '전세' }));
    await waitFor(() => expect(seen.nearby.some((u) => u.searchParams.get('dealType') === 'jeonse')).toBe(true));
    await waitFor(() => expect(within(list).getByText('3.5억')).toBeInTheDocument());
    expect(useHousingPrefsStore.getState().dealType).toBe('jeonse');

    fireEvent.click(within(screen.getByTestId('housing-band-filters')).getByRole('button', { name: '60~85㎡' }));
    await waitFor(() =>
      expect(seen.nearby.some((u) => u.searchParams.get('dealType') === 'jeonse' && u.searchParams.get('band') === 'b2')).toBe(true),
    );
    expect(useHousingPrefsStore.getState().band).toBe('b2');
    expect(within(screen.getByTestId('housing-band-filters')).getByRole('button', { name: '60~85㎡' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('지역 이동 — "래미안" 입력 시 아파트 단지 섹션, 선택하면 URL ll/z=16 + sel + 최근 기록', async () => {
    renderPage();
    const input = screen.getByTestId('life-goto-input');
    fireEvent.focus(input);
    await screen.findByTestId('life-goto-chips');
    fireEvent.change(input, { target: { value: '래미안' } });
    const results = screen.getByTestId('life-goto-results');
    const row = await within(results).findByRole('option', { name: /래미안퍼스티지/ });
    expect(within(results).getByText('아파트 단지')).toBeInTheDocument();
    expect(within(results).getByText('서울특별시 서초구 반포동 18-1 · 2,444세대')).toBeInTheDocument();
    await waitFor(() => expect(seen.search).toContain('래미안'));

    fireEvent.click(row);
    await waitFor(() => expect(screen.getByTestId('location-search').textContent).toContain('sel=R9'));
    expect(screen.getByTestId('location-search').textContent).toMatch(/ll=37\.50470%2C127\.00430/);
    expect(screen.getByTestId('location-search').textContent).toContain('z=16');
    expect(useLifeMapRecentStore.getState().items[0]).toMatchObject({ label: '래미안퍼스티지', zoom: 16 });
    // 이동과 함께 상세가 열린다.
    const detailEl = await screen.findByTestId('housing-detail');
    expect(within(detailEl).getByRole('heading', { name: '래미안퍼스티지' })).toBeInTheDocument();
  });

  it('저장한 내 위치(대기·날씨·일상지도와 공유)가 진입 중심', async () => {
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

const renderMobile = (initialUrl = '/housing') => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <LocationProbe />
        <Routes>
          <Route element={<LayoutStub />}>
            <Route path="/housing" element={<HousingPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('HousingPage (모바일 시트)', () => {
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

  it('상단바 subBar 에 지역 이동 + 유형 탭, 목록 시트에 면적 칩·주변 목록·푸터', async () => {
    renderMobile();
    expect(await screen.findByTestId('map-canvas')).toBeInTheDocument();
    const subbar = screen.getByTestId('layout-subbar');
    expect(within(subbar).getByTestId('life-goto-input')).toHaveAttribute('placeholder', '단지명·지역·역·주소로 이동');
    expect(within(subbar).getByTestId('housing-deal-tabs')).toBeInTheDocument();
    // 면적 칩 행은 헤더가 아니라 시트 안(목록 머리 행 아래).
    expect(within(subbar).queryByTestId('housing-band-filters')).toBeNull();

    expect(document.querySelector('[data-sheet-handle]')).not.toBeNull();
    const sheet = screen.getByTestId('housing-list-sheet');
    expect(within(sheet).getByTestId('housing-band-filters')).toBeInTheDocument();
    const list = within(sheet).getByTestId('housing-nearby-list');
    await waitFor(() => expect(within(list).getByText('청운현대')).toBeInTheDocument());
    await waitFor(() => expect(within(sheet).getByTestId('housing-footer')).toHaveTextContent('단지 45,920개'));
    expect(screen.queryByTestId('housing-detail-sheet')).toBeNull();
  });

  it('행 클릭 → 상세 시트가 따로 뜨고(목록 시트는 남아 있음) ← 목록 으로 닫힌다', async () => {
    renderMobile();
    const list = screen.getByTestId('housing-nearby-list');
    fireEvent.click(await within(list).findByText('청운현대'));
    const detailSheet = await screen.findByTestId('housing-detail-sheet');
    const detailEl = await within(detailSheet).findByTestId('housing-detail');
    expect(within(detailEl).getByRole('heading', { name: '청운현대' })).toBeInTheDocument();
    expect(screen.getByTestId('housing-list-sheet')).toBeInTheDocument();
    expect(screen.getByTestId('location-search').textContent).toContain('sel=A1');
    fireEvent.click(within(detailEl).getByRole('button', { name: /목록/ }));
    await waitFor(() => expect(screen.queryByTestId('housing-detail-sheet')).toBeNull());
    expect(screen.getByTestId('housing-nearby-list')).toBeInTheDocument();
  });
});
