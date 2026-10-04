import { forwardRef, useImperativeHandle } from 'react';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type { AirMeasureItemType, AirStationInfoItemType } from '@repo/api-contract';
import { useAirLocationStore, useAuthStore } from '@repo/shared';
import { server } from '~/test/msw';
import { AirQualityPage } from './AirQualityPage';

// 대기정보 페이지 — 어느 시도·측정소로 여는지와 그때 나가는 조회를 본다: ① 저장 위치가 없으면 기본 시도(서울)와 그
// 첫 측정소 ② 저장 위치가 있으면 그 가장 가까운 측정소가 정해진 뒤에만 시도·시계열을 묻는다(서울로 먼저 묻지 않는다)
// ③ URL 에 시도·측정소가 있으면 저장 위치를 기다리지 않는다. 섹션 안쪽 그림은 각 컴포넌트 몫이라 여기선 보지 않는다.
// 지도 엔진(OpenLayers)은 jsdom 에서 돌지 않아 캔버스만 자리표시자로 바꾼다.

vi.mock('~/components/restaurant/MapCanvas', () => ({
  MapCanvas: forwardRef(function MockMapCanvas(_props, ref) {
    useImperativeHandle(ref, () => ({ flyTo: () => {}, flyToZoomIn: () => {}, fitToMarkers: () => {}, fitToCoords: () => {} }));
    return <div data-testid="map-canvas" />;
  }),
}));

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterAll(() => {
  vi.unstubAllGlobals();
});

const FETCHED = '2026-08-21T05:00:00.000Z';

const measure = (stationName: string, sidoName: string): AirMeasureItemType => ({
  stationName,
  stationCode: null,
  sidoName,
  mangName: '도시대기',
  dataTime: '2026-08-21 14:00',
  measuredAt: '2026-08-21T14:00:00+09:00',
  so2: 0.002,
  co: 0.4,
  o3: 0.02,
  no2: 0.02,
  pm10: 30,
  pm25: 21,
  pm10Avg24: 28,
  pm25Avg24: 20,
  khai: 70,
  khaiGrade: 2,
  so2Grade: 1,
  coGrade: 1,
  o3Grade: 1,
  no2Grade: 1,
  pm10Grade: 2,
  pm25Grade: 2,
  pm10Grade1h: 1,
  pm25Grade1h: 2,
  flags: { so2: null, co: null, o3: null, no2: null, pm10: null, pm25: null },
});

const MEASURES = [
  measure('종로구', '서울'),
  measure('강남구', '서울'),
  measure('인계동', '경기'),
  measure('가평', '경기'),
];

const stationInfo = (stationName: string, sidoName: string, lat: number, lng: number): AirStationInfoItemType => ({
  stationName,
  addr: `${sidoName} ${stationName}`,
  sidoName,
  mangName: '도시대기',
  year: '2000',
  items: ['PM10', 'PM2.5'],
  lat,
  lng,
});

const seen = { sido: [] as string[], history: [] as string[] };

const useHandlers = () =>
  server.use(
    http.get('/api/v1/settings/map/public', () => HttpResponse.json({ provider: 'vworld', apiKey: 'test-key' })),
    http.get('/api/v1/air/sido/:sidoName', ({ params }) => {
      const sidoName = String(params['sidoName']);
      seen.sido.push(sidoName);
      const items = sidoName === '전국' ? MEASURES : MEASURES.filter((m) => m.sidoName === sidoName);
      return HttpResponse.json({ sidoName, items, total: items.length, fetchedAt: FETCHED, stale: false });
    }),
    http.get('/api/v1/air/stations/nearby', ({ request }) => {
      const url = new URL(request.url);
      return HttpResponse.json({
        center: { lat: Number(url.searchParams.get('lat')), lng: Number(url.searchParams.get('lng')) },
        items: [{ ...stationInfo('인계동', '경기', 37.2636, 127.0286), dist: 300, measure: measure('인계동', '경기') }],
        total: 1,
        fetchedAt: FETCHED,
        stale: false,
      });
    }),
    http.get('/api/v1/air/stations/:name/history', ({ params, request }) => {
      const stationName = String(params['name']);
      seen.history.push(stationName);
      return HttpResponse.json({
        stationName,
        term: new URL(request.url).searchParams.get('term') ?? 'DAILY',
        unit: 'hour',
        latest: null,
        points: [],
        total: 0,
        fetchedAt: FETCHED,
        stale: false,
      });
    }),
    http.get('/api/v1/air/stations', () =>
      HttpResponse.json({
        items: [stationInfo('인계동', '경기', 37.2636, 127.0286), stationInfo('종로구', '서울', 37.572, 127.005)],
        total: 2,
        fetchedAt: FETCHED,
        stale: false,
      }),
    ),
    http.get('/api/v1/air/bad-stations', () => HttpResponse.json({ items: [], total: 0, fetchedAt: FETCHED, stale: false })),
    http.get('/api/v1/air/forecast/weekly', () =>
      HttpResponse.json({ date: '2026-08-21', presentedAt: null, outlook: null, days: [], fetchedAt: FETCHED, stale: false }),
    ),
    http.get('/api/v1/air/forecast', () =>
      HttpResponse.json({ date: '2026-08-21', items: [], fetchedAt: FETCHED, stale: false }),
    ),
  );

const renderPage = (initialUrl = '/air') => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <Routes>
          <Route path="/air" element={<AirQualityPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

const sidoSelect = () => screen.getByLabelText('시도') as HTMLSelectElement;
const stationSelect = () => screen.getByLabelText('측정소') as HTMLSelectElement;

beforeEach(() => {
  window.localStorage.clear();
  useAuthStore.setState({ token: null, user: null, isGuest: false });
  useAirLocationStore.setState({ location: null });
  seen.sido = [];
  seen.history = [];
  useHandlers();
});

describe('AirQualityPage', () => {
  it('저장 위치가 없으면 기본 시도(서울)와 그 첫 측정소(가나다순)로 연다', async () => {
    renderPage();
    await waitFor(() => expect(stationSelect().value).toBe('강남구'));
    expect(sidoSelect().value).toBe('서울');
    // 측정소 목록은 가나다순(강남구 → 종로구).
    expect(within(stationSelect()).getAllByRole('option').map((o) => o.textContent)).toEqual(['강남구', '종로구']);
    await waitFor(() => expect(seen.history).toContain('강남구'));
    expect(seen.sido).toContain('서울');
    expect(new Set(seen.history)).toEqual(new Set(['강남구']));
  });

  // 회귀: 저장 위치의 가장 가까운 측정소가 정해지기 전에 기본 시도(서울)와 그 첫 측정소를 먼저 받았다.
  it('로그인 사용자 — 저장 위치와 그 가장 가까운 측정소가 정해진 뒤에만 시도·시계열을 묻는다', async () => {
    let openGate: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      openGate = resolve;
    });
    let locationAsked = false;
    server.use(
      http.get('/api/v1/air/location', async () => {
        locationAsked = true;
        await gate;
        return HttpResponse.json({
          location: { lat: 37.2636, lng: 127.0286, label: '수원', source: 'place', updatedAt: FETCHED },
        });
      }),
    );
    useAuthStore.setState({ token: 't', user: null, isGuest: false });
    renderPage();
    await waitFor(() => expect(locationAsked).toBe(true));
    // 기다리는 동안 — 머리와 로딩만. 시도별 조회는 전국(지도·비교용)뿐이고 시계열은 없다.
    expect(screen.getByRole('heading', { name: '대기정보' })).toBeInTheDocument();
    expect(screen.queryByLabelText('시도')).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(seen.sido.filter((s) => s !== '전국')).toEqual([]);
    expect(seen.history).toEqual([]);

    openGate();
    await waitFor(() => expect(stationSelect().value).toBe('인계동'));
    expect(sidoSelect().value).toBe('경기');
    await waitFor(() => expect(seen.history).toContain('인계동'));
    // 서울과 서울 측정소로는 한 번도 묻지 않았다.
    expect(seen.sido).not.toContain('서울');
    expect(new Set(seen.history)).toEqual(new Set(['인계동']));
  });

  it('게스트의 저장 위치(로컬)도 가장 가까운 측정소가 정해진 뒤에 연다', async () => {
    useAirLocationStore.getState().setLocation({ lat: 37.2636, lng: 127.0286, label: '수원', source: 'place' });
    renderPage();
    await waitFor(() => expect(stationSelect().value).toBe('인계동'));
    expect(sidoSelect().value).toBe('경기');
    await waitFor(() => expect(seen.history).toContain('인계동'));
    expect(seen.sido).not.toContain('서울');
  });

  it('URL 에 시도·측정소가 있으면 저장 위치를 기다리지 않는다', async () => {
    // 응답하지 않는 저장 위치 조회 — 기다렸다면 화면이 열리지 않는다.
    server.use(http.get('/api/v1/air/location', () => new Promise<never>(() => {})));
    useAuthStore.setState({ token: 't', user: null, isGuest: false });
    renderPage('/air?sido=%EC%84%9C%EC%9A%B8&station=%EC%A2%85%EB%A1%9C%EA%B5%AC');
    await waitFor(() => expect(stationSelect().value).toBe('종로구'));
    await waitFor(() => expect(seen.history).toContain('종로구'));
  });
});
