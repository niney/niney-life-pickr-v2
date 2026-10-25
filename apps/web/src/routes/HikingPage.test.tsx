import { forwardRef, useImperativeHandle } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type {
  HikingCourseDetailType,
  HikingCourseSummaryType,
  HikingMountainDetailType,
  HikingMountainSummaryType,
  HikingMountainsResultType,
} from '@repo/api-contract';
import { encodePolyline } from '@repo/utils';
import { server } from '~/test/msw';
import { pointAtDistance, rankMountains } from '~/components/hiking/hikingFormat';
import { HikingPage } from './HikingPage';

// 등산 페이지 스모크 — 지도(OL)는 목. ① 산 목록(이름순)·검색·권역 칩 ② 산 클릭 → URL m + 상세(선정 이유·공식 코스·
// 코스 카드) ③ 코스 클릭 → URL c + 코스 상세(숫자·고도 그래프·이정표 지점) → 뒤로. 그리고 hikingFormat 순수 함수.

vi.mock('~/components/restaurant/MapCanvas', () => ({
  MapCanvas: forwardRef(function MockMapCanvas(_props, ref) {
    useImperativeHandle(ref, () => ({ flyTo: () => {}, flyToZoomIn: () => {}, fitToMarkers: () => {}, fitToCoords: () => {} }));
    return <div data-testid="map-canvas" />;
  }),
}));

const mountain = (p: Partial<HikingMountainSummaryType> & { id: string; name: string }): HikingMountainSummaryType => ({
  subtitle: null,
  heightM: 1000,
  area: null,
  regions: [],
  lat: 37.5,
  lng: 127.5,
  courseCount: 1,
  minLengthM: 3000,
  maxLengthM: 6000,
  images: [],
  ...p,
});
const GARI = mountain({ id: '421100101', name: '가리산', heightM: 1051, area: '강원도 춘천시 북산면', regions: ['gangwon'], courseCount: 2, images: [1] });
const GWANAK = mountain({ id: '111100101', name: '관악산', heightM: 632, area: '서울특별시 관악구, 경기도 안양시', regions: ['seoul', 'gyeonggi'] });
const HALLA = mountain({ id: '500000101', name: '한라산', heightM: 1947, area: '제주도 제주시', regions: ['jeju'], lat: 33.36, lng: 126.53 });
const list: HikingMountainsResultType = { items: [HALLA, GARI, GWANAK], loadedAt: '2026-10-25T00:00:00.000Z' };

const LINE = encodePolyline([
  { lat: 37.0, lng: 127.0 },
  { lat: 37.003, lng: 127.0 },
  { lat: 37.006, lng: 127.0 },
]);
const courseSummary = (p: Partial<HikingCourseSummaryType> & { id: string; no: number; name: string }): HikingCourseSummaryType => ({
  nameSource: 'points',
  startName: null,
  endName: null,
  peakName: null,
  lengthM: 6474,
  hasElevation: true,
  gainM: 678,
  lossM: 120,
  minEle: 370,
  maxEle: 1040,
  isLoop: false,
  shape: 'traverse',
  timeMin: 180,
  timeRevMin: 170,
  roundTripMin: null,
  difficulty: 'moderate',
  steepPct: 30,
  gapCount: 0,
  gapM: 0,
  roughSurfaces: [],
  bbox: { minLat: 37, minLng: 127, maxLat: 37.006, maxLng: 127 },
  pieces: [LINE],
  ...p,
});
const C1 = courseSummary({ id: '421100101-1', no: 1, name: '가리산자연휴양림 출발', isLoop: true, shape: 'loop', lengthM: 3274, gainM: 566 });
// 정상에서 끝나는 편도 — 왕복 5시간, 쉬움 기준(3시간·500m·35%)을 다 넘어 보통.
const C2 = courseSummary({
  id: '421100101-2',
  no: 2,
  name: '산림문화휴양관 주차장 → 가리산 정상',
  shape: 'summit',
  timeMin: 170,
  timeRevMin: 110,
  roundTripMin: 300,
  steepPct: 38,
  roughSurfaces: ['암릉'],
  gapCount: 1,
  gapM: 240,
});
const gariDetail: HikingMountainDetailType = {
  ...GARI,
  overview: '강원도 춘천시와 홍천군의 경계를 이루는 산',
  details: null,
  reason: '강원도에서 진달래가 가장 많이 피는 산',
  officialCourses: '① 가리산자연휴양림-삼거리-무쇠말재-정상 (총 4시간)',
  summitName: '가리산 정상',
  summitEle: 1040,
  bbox: { minLat: 37, minLng: 127, maxLat: 37.006, maxLng: 127 },
  courses: [C1, C2],
};
const c2Detail: HikingCourseDetailType = {
  ...C2,
  mountain: { id: GARI.id, name: '가리산', heightM: 1051 },
  start: { lat: 37, lng: 127, ele: 370 },
  end: { lat: 37.006, lng: 127, ele: 1040 },
  profile: { d: [0, 3237, 6474], e: [370, 700, 1040] },
  surfaces: [{ type: '암릉', fromM: 5000, toM: 5400 }],
  pois: [
    { id: 'gpx:1', category: 'PARK', name: '산림문화휴양관 주차장', description: null, lat: 37, lng: 127, ele: 370, signposts: [], guide: [], atM: 0 },
    {
      id: 'gpx:2',
      category: 'SIGN',
      name: '갈림길',
      description: null,
      lat: 37.003,
      lng: 127,
      ele: 700,
      signposts: [
        { dest: '휴양림', dir: 'UT' },
        { dest: '정상', dir: 'ST' },
        { dest: '샘터', dir: 'TL' },
      ],
      guide: [
        { dest: '휴양림', dir: 'UT', way: 'prev' },
        { dest: '정상', dir: 'ST', way: 'next' },
        { dest: '샘터', dir: 'TL', way: null },
      ],
      atM: 3237,
    },
    { id: 'gpx:3', category: 'SCENERY', name: '자연경관', description: null, lat: 37.004, lng: 127, ele: 800, signposts: [], guide: [], atM: 4000 },
    { id: 'gpx:4', category: 'PEAK', name: '가리산 정상', description: null, lat: 37.006, lng: 127, ele: 1040, signposts: [], guide: [], atM: 6474 },
  ],
};

let requested: string[] = [];
beforeEach(() => {
  requested = [];
  server.use(
    http.get('/api/v1/settings/map/public', () => HttpResponse.json({ provider: 'vworld', apiKey: 'test-key' })),
    http.get('/api/v1/hiking/mountains', () => HttpResponse.json(list)),
    http.get('/api/v1/hiking/mountains/:id', ({ params }) => {
      requested.push(`m:${String(params.id)}`);
      return params.id === GARI.id ? HttpResponse.json(gariDetail) : HttpResponse.json({ statusCode: 404, error: 'Not Found', message: 'x' }, { status: 404 });
    }),
    http.get('/api/v1/hiking/courses/:id', ({ params }) => {
      requested.push(`c:${String(params.id)}`);
      return HttpResponse.json(c2Detail);
    }),
  );
});

const LocationProbe = () => <div data-testid="location-search">{useLocation().search}</div>;
const renderPage = (url = '/hiking') => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[url]}>
        <LocationProbe />
        <Routes>
          <Route path="/hiking" element={<HikingPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};
const rows = (): string[] =>
  within(screen.getByTestId('hiking-list'))
    .getAllByRole('listitem')
    .map((li) => li.textContent?.replace(/\s+/g, ' ').trim() ?? '');

describe('HikingPage', () => {
  it('산 목록 — 이름순, 검색·권역 칩으로 거른다', async () => {
    renderPage();
    await waitFor(() => expect(rows()).toHaveLength(3));
    expect(rows()[0]).toContain('가리산1,051m');
    expect(rows()[1]).toContain('관악산632m');
    expect(rows()[2]).toContain('한라산1,947m');
    expect(rows()[0]).toContain('코스 2개 · 3.0km~6.0km');
    fireEvent.change(screen.getByRole('textbox', { name: '산 검색' }), { target: { value: '안양' } });
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(rows()[0]).toContain('관악산');
    fireEvent.change(screen.getByRole('textbox', { name: '산 검색' }), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: '제주' }));
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(rows()[0]).toContain('한라산');
    expect(screen.getByTestId('location-search')).toHaveTextContent('r=jeju');
    expect(screen.getByTestId('hiking-footer')).toHaveTextContent('한국등산트레킹지원센터');
  });

  it('산 → 코스 → 뒤로: URL m·c, 선정 이유·공식 코스·코스 카드, 코스 숫자·고도 그래프·이정표', async () => {
    renderPage();
    await waitFor(() => expect(rows()).toHaveLength(3));
    fireEvent.click(within(screen.getByTestId('hiking-list')).getByText('가리산'));
    const m = await screen.findByTestId('hiking-mountain');
    expect(screen.getByTestId('location-search')).toHaveTextContent('m=421100101');
    expect(m).toHaveTextContent('강원도에서 진달래가 가장 많이 피는 산');
    expect(m).toHaveTextContent('총 4시간');
    const cards = within(screen.getByTestId('hiking-courses')).getAllByRole('listitem');
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveTextContent('원점회귀');
    expect(cards[0]).toHaveTextContent('3시간');
    expect(cards[1]).toHaveTextContent('보통');
    expect(cards[1]).toHaveTextContent('왕복 5시간');
    expect(cards[1]).toHaveTextContent('오르막 678m왕복');
    expect(cards[1]).toHaveTextContent('암릉');

    fireEvent.click(within(cards[1]!).getByRole('button'));
    const c = await screen.findByTestId('hiking-course');
    expect(screen.getByTestId('location-search')).toHaveTextContent('c=421100101-2');
    expect(c).toHaveTextContent('6.5km');
    expect(c).toHaveTextContent('오르막678m');
    expect(c).toHaveTextContent('1곳에서 끊겨');
    expect(c).toHaveTextContent('왕복 예상5시간');
    expect(c).toHaveTextContent('난이도보통');
    const time = within(c).getByTestId('hiking-course-time');
    expect(time).toHaveTextContent('왕복 · 오르기 2시간 50분 · 내려오기 1시간 50분');
    expect(time).toHaveTextContent('보통 왕복 예상 5시간 · 누적 상승 678m · 가파른 500m 평균 38%');
    expect(within(c).getByTestId('hiking-profile')).toBeInTheDocument();
    // 지도 분류만(경관은 뺀다), 갈림길은 이 코스로 가는 길 → 다른 길 → 온 길.
    const pois = within(screen.getByTestId('hiking-pois')).getAllByRole('listitem');
    expect(pois.map((li) => li.textContent)).toHaveLength(3);
    expect(pois[1]).toHaveTextContent('가는 길 정상샘터온 길 휴양림');
    fireEvent.click(within(pois[1]!).getByRole('button'));
    expect(within(pois[1]!).getByRole('button')).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(within(c).getByRole('button', { name: /가리산 코스 목록/ }));
    expect(await screen.findByTestId('hiking-mountain')).toBeInTheDocument();
    expect(requested).toEqual(['m:421100101', 'c:421100101-2']);
  });
});

describe('hikingFormat', () => {
  it('rankMountains — 높은순·가까운순', () => {
    expect(rankMountains(list.items, { q: '', group: null, sort: 'height', me: null }).map((r) => r.mountain.name)).toEqual(['한라산', '가리산', '관악산']);
    const near = rankMountains(list.items, { q: '', group: null, sort: 'near', me: { lat: 33.4, lng: 126.5 } });
    expect(near.map((r) => r.mountain.name)[0]).toBe('한라산');
  });

  it('pointAtDistance — 선 길이 비율로 위치(가운데 = 가운데 점)', () => {
    const lines = [
      [
        { lat: 37, lng: 127 },
        { lat: 37.002, lng: 127 },
      ],
    ];
    const mid = pointAtDistance(lines, 1000, 500)!;
    expect(mid.lat).toBeCloseTo(37.001, 6);
    expect(pointAtDistance(lines, 1000, 2000)!.lat).toBeCloseTo(37.002, 6);
    expect(pointAtDistance([], 1000, 500)).toBeNull();
  });
});
