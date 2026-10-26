import { forwardRef, useImperativeHandle, useMemo, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type {
  HikingAroundType,
  HikingConditionsType,
  HikingCourseDetailType,
  HikingRecommendResultType,
  HikingCourseSummaryType,
  HikingMountainDetailType,
  HikingMountainSummaryType,
  HikingMountainsResultType,
} from '@repo/api-contract';
import { encodePolyline, kmaTodayIsoDate } from '@repo/utils';
import { server } from '~/test/msw';
import { usePanelPrefsStore } from '~/stores/panelPrefsStore';
import { pointAtDistance, rankMountains } from '~/components/hiking/hikingFormat';
import { HikingPage } from './HikingPage';

// 등산 페이지 스모크 — 지도(OL)는 목. ① 산 목록(기본 가까운순 — jsdom 은 위치가 없어 서울 시청 기준)·검색·권역 칩 ② 산 클릭 → URL m + 상세(선정 이유·공식 코스·
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
  kind: 'top100',
  peaks: [],
  park: null,
  ...p,
});
const GARI = mountain({ id: '421100101', name: '가리산', heightM: 1051, area: '강원도 춘천시 북산면', regions: ['gangwon'], courseCount: 2, images: [1] });
const GWANAK = mountain({ id: '111100101', name: '관악산', heightM: 632, area: '서울특별시 관악구, 경기도 안양시', regions: ['seoul', 'gyeonggi'] });
const HALLA = mountain({ id: '500000101', name: '한라산', heightM: 1947, area: '제주도 제주시', regions: ['jeju'], lat: 33.36, lng: 126.53, peaks: ['백록담'], park: '한라산국립공원' });
// 전국 주요 봉우리(5차) — 서울 시청 가까이라 가까운순 맨 앞.
const INWANG = mountain({ id: '1111020050', name: '인왕산', kind: 'peak', heightM: 338, area: '서울 종로구', regions: ['seoul'], lat: 37.585, lng: 126.958, minLengthM: 2100, maxLengthM: 2100 });
const list: HikingMountainsResultType = { items: [HALLA, GARI, GWANAK, INWANG], loadedAt: '2026-10-25T00:00:00.000Z' };

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
  source: 'top100',
  park: null,
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
  courses: [{ ...C1, source: 'network' as const }, { ...C2, source: 'peak' as const }],
  neighbors: [{ id: INWANG.id, name: '인왕산', kind: 'peak', heightM: 338, lat: INWANG.lat, lng: INWANG.lng, distM: 1_200 }],
  parkArea: null,
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

// 9차 국립공원 — 북한산(공원 안): 공식 코스(안내 문구 원문, 목록 맨 앞)·탐방지원센터 연락처.
const BUKHAN = mountain({ id: '111100201', name: '북한산', heightM: 836, area: '서울특별시 강북구', regions: ['seoul'], lat: 37.659, lng: 126.978, park: '북한산국립공원' });
const P1 = courseSummary({
  id: '111100201-3008',
  no: 3008,
  name: '백운대코스',
  source: 'park',
  shape: 'summit',
  lengthM: 1865,
  timeMin: 63,
  timeRevMin: 40,
  roundTripMin: 103,
  park: {
    parkName: '북한산국립공원',
    name: '백운대코스',
    sections: ['백운대탐방지원센터', '하루재', '백운대피소', '백운대'],
    duration: '01시간30분',
    distance: '1.9km',
    difficulty: '중',
    schedule: '당일',
    contact: '북한산국립공원사무소 (02)909-0497',
  },
});
const bukhanDetail: HikingMountainDetailType = {
  ...BUKHAN,
  overview: null,
  details: null,
  reason: null,
  officialCourses: null,
  summitName: '백운대',
  summitEle: 836,
  bbox: { minLat: 37, minLng: 127, maxLat: 37.006, maxLng: 127 },
  courses: [P1, C1],
  neighbors: [],
  parkArea: { id: '764', name: '북한산국립공원', designatedYear: 1983, polygons: [[LINE]] },
};
const p1Detail: HikingCourseDetailType = {
  ...P1,
  mountain: { id: BUKHAN.id, name: '북한산', heightM: 836 },
  start: { lat: 37, lng: 127, ele: 250 },
  end: { lat: 37.006, lng: 127, ele: 836 },
  profile: { d: [0, 1865], e: [250, 836] },
  surfaces: [],
  pois: [
    { id: 'knps:101', category: 'ENTRY', name: '백운대탐방지원센터', description: '국립공원공단 · 02-998-8365', lat: 37, lng: 127, ele: 250, signposts: [], guide: [], atM: 0 },
    { id: 'knps:105', category: 'SHELTER', name: '백운대피소', description: '국립공원공단', lat: 37.004, lng: 127, ele: 650, signposts: [], guide: [], atM: 1500 },
  ],
};

// 오늘의 조건 — 날짜는 실제 오늘 기준(카드가 지금 이후 출발만 고르게 한다). 내일 10~11시 비, 내일 09시 춘천 다소높음 23%,
// 내일 미세먼지 예보 나쁨. 해는 06:50 / 17:40 로 고정.
const ymdPlus = (d: number) => kmaTodayIsoDate(new Date(Date.now() + d * 86_400_000));
const kst = (date: string, hm: string) => `${date}T${hm}:00+09:00`;
const conditionsFor = (): HikingConditionsType => {
  const days = [0, 1, 2].map(ymdPlus);
  const tomorrow = days[1]!;
  const hour = (hh: number, p: Partial<NonNullable<HikingConditionsType['weather']>['hours'][number]> = {}) => ({
    at: kst(tomorrow, `${String(hh).padStart(2, '0')}:00`),
    tmp: 12,
    topTmp: 8,
    sky: 3,
    pty: 0,
    pop: 20,
    pcp: { text: '강수없음', value: 0, none: true },
    sno: { text: '적설없음', value: 0, none: true },
    reh: 60,
    wsd: 3,
    vec: 90,
    ...p,
  });
  return {
    courseId: c2Detail.id,
    ref: { lat: 37, lng: 127, ele: 370 },
    topEle: 1040,
    days: days.map((date) => ({ date, dawn: null, sunrise: kst(date, '06:50'), sunset: kst(date, '17:40'), dusk: null })),
    weather: {
      grid: { nx: 1, ny: 1 },
      base: { date: tomorrow.replace(/-/g, ''), time: '0500', at: kst(tomorrow, '05:00') },
      hours: Array.from({ length: 12 }, (_, i) => hour(7 + i, i === 3 || i === 4 ? { pty: 1, pop: 80 } : {})),
      fetchedAt: '2026-10-25T00:00:00Z',
      stale: false,
    },
    air: {
      station: { name: '북산면', distM: 4_200 },
      measuredAt: null,
      pm10: 21,
      pm10Grade: 1,
      pm25: 9,
      pm25Grade: 1,
      regions: ['영서'],
      forecast: [{ date: tomorrow, pm10Grade: 3, pm25Grade: 2 }],
      fetchedAt: '2026-10-25T00:00:00Z',
      stale: false,
    },
    fire: {
      areas: [{ key: '51:춘천시', sido: '강원특별자치도', name: '춘천시', slots: [{ at: kst(tomorrow, '09:00'), d1: 77, d2: 23, d3: 0, d4: 0, mean: 50, max: 60 }] }],
      fetchedAt: '2026-10-25T00:00:00Z',
      stale: false,
    },
    errors: { weather: null, air: null, fire: null },
    generatedAt: '2026-10-25T00:00:00Z',
  };
};

// 코스 주변 — 들머리 정류장(등산 지점)·지하철, 주차장, 날머리 없음, 하산 후 맛집(크롤).
const AROUND: HikingAroundType = {
  courseId: c2Detail.id,
  start: { lat: 37, lng: 127, name: '산림문화휴양관 주차장' },
  end: null,
  transit: [
    { kind: 'trail', name: '휴양림 입구 정류장', distM: 120, at: 'start', lat: 37.001, lng: 127, detail: null, refId: null },
    { kind: 'subway', name: '가평역', distM: 1_400, at: 'start', lat: 37.01, lng: 127, detail: '경춘선', refId: 'K1:가평' },
  ],
  parking: [{ kind: 'lot', name: '휴양림 주차장', distM: 80, at: 'start', lat: 37, lng: 127.001, detail: '공영 · 무료 · 40면', refId: 'std-1' }],
  toilets: [],
  food: { source: 'restaurants', items: [{ kind: 'restaurant', name: '산채비빔밥집', distM: 900, at: 'start', lat: 37.008, lng: 127, detail: '한식 · 평점 4.5', refId: '12345' }] },
};

// 추천 — 1위 가리산 2번 코스(100대 명산), 2위 인왕산(전국 봉우리, 경고 하나).
const recommendFor = (mode: string): HikingRecommendResultType => ({
  items: [
    {
      rank: 1,
      score: 95,
      mountain: { id: GARI.id, name: '가리산', kind: 'top100', heightM: 1051, lat: 37.5, lng: 127.5, images: [1] },
      course: { id: C2.id, no: 2, name: C2.name, shape: 'summit', lengthM: 6474, outingMin: 300, difficulty: 'moderate', start: { lat: 37, lng: 127 } },
      straightM: 70_000,
      driveMin: 80,
      access: { parking: '휴양림 주차장', transit: null, transitEnd: null },
      startAt: '2026-10-26T08:00:00+09:00',
      endAt: '2026-10-26T13:00:00+09:00',
      sunset: '2026-10-26T17:40:00+09:00',
      daylight: 'ok',
      weather: null,
      fireLevel: 1,
      airGrade: 1,
      conditionsChecked: true,
      season: ['단풍'],
      reason: `${mode === 'car' ? '차로 약 1시간 20분(직선 70km)' : '직선 70km'} 거리의 왕복 5시간·보통 코스로, 08:00에 출발하면 13:00쯤 내려옵니다(일몰 17:40).`,
      cautions: [],
    },
    {
      rank: 2,
      score: 90,
      mountain: { id: INWANG.id, name: '인왕산', kind: 'peak', heightM: 338, lat: 37.585, lng: 126.958, images: [] },
      course: { id: `${GWANAK.id}-1`, no: 1, name: '사당역 → 연주대', shape: 'traverse', lengthM: 5000, outingMin: 200, difficulty: 'moderate', start: { lat: 37.47, lng: 126.98 } },
      straightM: 10_000,
      driveMin: 28,
      access: { parking: null, transit: '사당역', transitEnd: null },
      startAt: '2026-10-26T08:00:00+09:00',
      endAt: '2026-10-26T11:20:00+09:00',
      sunset: '2026-10-26T17:41:00+09:00',
      daylight: 'ok',
      weather: null,
      fireLevel: 2,
      airGrade: 3,
      conditionsChecked: true,
      season: [],
      reason: '직선 10km 거리의 편도 3시간 20분·보통 코스입니다.',
      cautions: [{ level: 'warn', text: '미세먼지 나쁨' }],
    },
  ],
  query: { date: '2026-10-26', start: '08:00', duration: 'half', level: 'any', mode: mode as 'car', origin: null },
  generatedAt: '2026-10-25T00:00:00Z',
});

let requested: string[] = [];
let recommendQs: URLSearchParams[] = [];
beforeEach(() => {
  requested = [];
  recommendQs = [];
  server.use(
    http.get('/api/v1/hiking/courses/:id/conditions', () => HttpResponse.json(conditionsFor())),
    http.get('/api/v1/hiking/courses/:id/around', () => HttpResponse.json(AROUND)),
    http.get('/api/v1/hiking/recommend', ({ request }) => {
      const qs = new URL(request.url).searchParams;
      recommendQs.push(qs);
      return HttpResponse.json(recommendFor(qs.get('mode') ?? 'car'));
    }),
    http.get('/api/v1/settings/map/public', () => HttpResponse.json({ provider: 'vworld', apiKey: 'test-key' })),
    http.get('/api/v1/hiking/mountains', () => HttpResponse.json(list)),
    http.get('/api/v1/hiking/mountains/:id', ({ params }) => {
      requested.push(`m:${String(params.id)}`);
      if (params.id === BUKHAN.id) return HttpResponse.json(bukhanDetail);
      return params.id === GARI.id ? HttpResponse.json(gariDetail) : HttpResponse.json({ statusCode: 404, error: 'Not Found', message: 'x' }, { status: 404 });
    }),
    http.get('/api/v1/hiking/courses/:id', ({ params }) => {
      requested.push(`c:${String(params.id)}`);
      return HttpResponse.json(params.id === P1.id ? p1Detail : c2Detail);
    }),
  );
});

const LocationProbe = () => <div data-testid="location-search">{useLocation().search}</div>;
// PublicLayout 흉내 — 모바일 subBar(검색·권역·정렬)를 받아 DOM 에 그린다.
const LayoutStub = () => {
  const [subBar, setSubBar] = useState<React.ReactNode>(null);
  const ctx = useMemo(() => ({ setSubBar, headerHeight: 120 }), []);
  return (
    <>
      <div data-testid="layout-subbar">{subBar}</div>
      <Outlet context={ctx} />
    </>
  );
};
const renderPage = (url = '/hiking') => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[url]}>
        <LocationProbe />
        <Routes>
          <Route element={<LayoutStub />}>
            <Route path="/hiking" element={<HikingPage />} />
          </Route>
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
  it('산 목록 — 기본 가까운순(위치 없으면 서울 시청 기준)·100대 명산 배지, 이름순, 검색(합친 봉우리 이름도)·권역 칩으로 거른다', async () => {
    renderPage();
    await waitFor(() => expect(rows()).toHaveLength(4));
    expect(rows()[0]).toContain('인왕산338m');
    expect(rows()[0]).not.toContain('100대 명산');
    expect(rows()[1]).toContain('가리산100대 명산1,051m');
    expect(rows()[1]).toContain('코스 2개 · 3.0km~6.0km');
    expect(rows()[3]).toContain('한라산');
    expect(screen.getByTestId('hiking-near-basis')).toHaveTextContent('서울 시청 기준');
    fireEvent.change(screen.getByRole('combobox', { name: '정렬' }), { target: { value: 'name' } });
    await waitFor(() => expect(rows()[0]).toContain('가리산'));
    expect(rows().map((r) => r.slice(0, 3))).toEqual(['가리산', '관악산', '인왕산', '한라산']);
    expect(screen.getByTestId('location-search')).toHaveTextContent('s=name');
    fireEvent.change(screen.getByRole('searchbox', { name: '산 검색' }), { target: { value: '백록담' } });
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(rows()[0]).toContain('한라산');
    fireEvent.change(screen.getByRole('searchbox', { name: '산 검색' }), { target: { value: '안양' } });
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(rows()[0]).toContain('관악산');
    // 9차 — 국립공원 이름으로도 찾는다.
    fireEvent.change(screen.getByRole('searchbox', { name: '산 검색' }), { target: { value: '국립공원' } });
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(rows()[0]).toContain('한라산');
    fireEvent.change(screen.getByRole('searchbox', { name: '산 검색' }), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: '제주' }));
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(rows()[0]).toContain('한라산');
    expect(screen.getByTestId('location-search')).toHaveTextContent('r=jeju');
    expect(screen.getByTestId('hiking-footer')).toHaveTextContent('한국등산트레킹지원센터');
  });

  it('산 → 코스 → 뒤로: URL m·c, 선정 이유·공식 코스·코스 카드, 코스 숫자·고도 그래프·이정표', async () => {
    renderPage();
    await waitFor(() => expect(rows()).toHaveLength(4));
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
    // 합친 봉우리 코스 표시 · 이어진 봉우리(정상끼리 거리).
    expect(cards[1]).toHaveTextContent('봉우리 자료');
    expect(cards[0]).not.toHaveTextContent('봉우리 자료');
    // 망에서 이어 만든 코스(6차).
    expect(cards[0]).toHaveTextContent('이어 만든 길');
    expect(within(screen.getByTestId('hiking-neighbors')).getByRole('button')).toHaveTextContent('인왕산338m· 1km');

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

  it('산행 조건 — 내일 08시 출발은 해 지기 전 하산·비·산불·미세먼지, 13시 출발은 해 진 뒤 하산', async () => {
    renderPage('/hiking?m=421100101&c=421100101-2');
    const card = await screen.findByTestId('hiking-conditions');
    const days = await within(card).findByRole('group', { name: '산행 날짜' });
    fireEvent.click(within(days).getAllByRole('button')[1]!);
    expect(within(days).getAllByRole('button')[1]).toHaveAttribute('aria-pressed', 'true');
    fireEvent.change(within(card).getByRole('combobox', { name: '출발 시각' }), { target: { value: String(8 * 60) } });
    // 왕복 5시간 → 13:00 하산, 일몰 17:40 까지 4시간 40분.
    expect(within(card).getByTestId('hiking-daylight')).toHaveTextContent('08:00 출발 → 13:00 하산 예상해 지기 전 하산');
    expect(within(card).getByTestId('hiking-daylight')).toHaveTextContent('일몰 17:40 · 여유 4시간 40분 · 늦어도 12:10에 출발');
    const cautions = within(card).getByTestId('hiking-cautions');
    expect(cautions).toHaveTextContent('비 예보(2시간)');
    expect(cautions).toHaveTextContent('산불위험 다소높음(춘천시 23%) — 화기 금지');
    expect(cautions).toHaveTextContent('미세먼지 나쁨');
    expect(card).toHaveTextContent('가장 높은 곳(1,040m) 8°C');
    expect(card).toHaveTextContent('예보 미세먼지 나쁨 · 초미세먼지 보통 영서 권역');
    expect(card).toHaveTextContent('일출 06:50 · 일몰 17:40');

    fireEvent.change(within(card).getByRole('combobox', { name: '출발 시각' }), { target: { value: String(13 * 60) } });
    expect(within(card).getByTestId('hiking-daylight')).toHaveTextContent('해 진 뒤 하산');
    expect(within(card).getByTestId('hiking-cautions')).toHaveTextContent('해 지기 전에 내려오기 어렵습니다 — 12:10까지 출발하세요');
  });

  it('추천 모드 — 토글을 켜면 입력 칸·추천 목록, 입력을 바꾸면 다시 받고(URL), 고르면 산·코스로', async () => {
    renderPage();
    await waitFor(() => expect(rows()).toHaveLength(4));
    fireEvent.click(screen.getByRole('button', { name: '추천' }));
    const list = await screen.findByTestId('hiking-recommend-list');
    expect(screen.getByTestId('location-search')).toHaveTextContent('rec=1');
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('가리산');
    // 8차 — 전국 봉우리도 추천에 나오고 100대 명산엔 배지.
    expect(items[0]).toHaveTextContent('100대 명산');
    expect(items[1]).toHaveTextContent('인왕산');
    expect(items[1]).not.toHaveTextContent('100대 명산');
    expect(items[0]).toHaveTextContent('차로 약 1시간 20분(직선 70km) 거리의 왕복 5시간·보통 코스로');
    expect(items[1]).toHaveTextContent('미세먼지 나쁨');
    // 기본 입력 — 반나절·상관없음·차, 위치를 못 찾으면(jsdom) 거리 없이.
    expect(recommendQs[0]!.get('duration')).toBe('half');
    expect(recommendQs[0]!.get('level')).toBe('any');
    expect(recommendQs[0]!.get('mode')).toBe('car');
    expect(recommendQs[0]!.get('lat')).toBeNull();
    expect(screen.queryByTestId('hiking-recommend-hint')).toBeNull();

    fireEvent.click(within(screen.getByRole('group', { name: '이동 수단' })).getByRole('button', { name: '대중교통' }));
    await waitFor(() => expect(recommendQs.at(-1)!.get('mode')).toBe('transit'));
    expect(screen.getByTestId('location-search')).toHaveTextContent('rm=transit');
    fireEvent.change(screen.getByRole('combobox', { name: '출발 위치' }), { target: { value: 'busan' } });
    await waitFor(() => expect(recommendQs.at(-1)!.get('lat')).toBe('35.1796'));
    expect(screen.getByTestId('location-search')).toHaveTextContent('ro=busan');
    // 3시간 안 — 받은 코스가 모두 그보다 길면 까닭을 알린다.
    fireEvent.click(within(screen.getByRole('group', { name: '산행 시간' })).getByRole('button', { name: '3시간 안' }));
    await waitFor(() => expect(recommendQs.at(-1)!.get('duration')).toBe('short'));
    expect(await screen.findByTestId('hiking-recommend-hint')).toHaveTextContent('3시간 안 길이로');

    fireEvent.click(within(screen.getByTestId('hiking-recommend-list')).getAllByRole('button')[0]!);
    expect(await screen.findByTestId('hiking-course')).toBeInTheDocument();
    expect(screen.getByTestId('location-search')).toHaveTextContent('m=421100101');
    expect(screen.getByTestId('location-search')).toHaveTextContent('c=421100101-2');
    // 목록 칸은 추천 모드 그대로.
    expect(screen.getByTestId('hiking-recommend-list')).toBeInTheDocument();
  });

  it('가는 법·주변 — 정류장·역·주차·하산 후 맛집, 지하철·주차장·맛집은 각 화면으로', async () => {
    renderPage('/hiking?m=421100101&c=421100101-2');
    const around = await screen.findByTestId('hiking-around');
    await within(around).findByText('휴양림 입구 정류장');
    expect(within(around).getByTestId('hiking-around-transit')).toHaveTextContent('가평역');
    expect(within(around).getByText('근처 화장실 정보가 없습니다.')).toBeInTheDocument();
    expect(within(around).getByRole('heading', { name: '하산 후 맛집' })).toBeInTheDocument();
    const href = (name: RegExp) => within(around).getByRole('link', { name }).getAttribute('href') ?? '';
    expect(href(/가평역/)).toContain(`&stn=${encodeURIComponent('K1:가평')}`);
    expect(href(/가평역/)).toMatch(/^\/subway\?near=/);
    expect(href(/휴양림 주차장/)).toMatch(/^\/parking\?ll=.*&sel=std-1$/);
    expect(href(/산채비빔밥집/)).toBe('/r/12345');
    // 등산 지점은 연결 화면이 없다.
    expect(within(around).queryByRole('link', { name: /휴양림 입구 정류장/ })).toBeNull();
  });

  it('국립공원(9차) — 산 배지, 공식 코스가 맨 앞(안내 문구 원문), 코스 상세 공식 문구·고도 안내·센터 연락처', async () => {
    renderPage(`/hiking?m=${BUKHAN.id}`);
    const m = await screen.findByTestId('hiking-mountain');
    expect(within(m).getByTestId('hiking-mountain-park')).toHaveTextContent('북한산국립공원');
    const cards = within(screen.getByTestId('hiking-courses')).getAllByRole('listitem');
    expect(cards[0]).toHaveTextContent('백운대코스국립공원 코스');
    expect(cards[0]).toHaveTextContent('안내 01시간30분 · 난이도 중');
    expect(cards[1]).not.toHaveTextContent('국립공원 코스');

    fireEvent.click(within(cards[0]!).getByRole('button'));
    const c = await screen.findByTestId('hiking-course');
    const box = within(c).getByTestId('hiking-course-park');
    expect(box).toHaveTextContent('국립공원 공식 코스 · 북한산국립공원');
    expect(box).toHaveTextContent('백운대탐방지원센터 → 하루재 → 백운대피소 → 백운대');
    expect(box).toHaveTextContent('소요시간 01시간30분');
    expect(box).toHaveTextContent('난이도 중');
    expect(box).toHaveTextContent('문의 북한산국립공원사무소 (02)909-0497');
    expect(within(c).getByTestId('hiking-course-peak-note')).toHaveTextContent('근처 등산 기록에서 가져와');
    const pois = within(screen.getByTestId('hiking-pois')).getAllByRole('listitem');
    expect(pois[0]).toHaveTextContent('백운대탐방지원센터');
    expect(pois[0]).toHaveTextContent('국립공원공단 · 02-998-8365');
  });

  it('데스크톱 — [산 목록 | 상세 | 지도] 세 칸, 산을 골라도 목록은 남고 패널을 오른쪽으로 옮긴다', async () => {
    window.localStorage.clear();
    usePanelPrefsStore.setState({ sides: { 'admin.discover': 'right', 'public.restaurants': 'left', 'public.hiking': 'left' } });
    renderPage('/hiking?m=421100101');
    expect(await screen.findByTestId('hiking-mountain')).toBeInTheDocument();
    // 목록 칸은 그대로 보이고 고른 산이 표시된다.
    const list = screen.getByRole('complementary', { name: '산 목록' });
    await waitFor(() => expect(within(list).getByText('가리산').closest('button')).toHaveAttribute('aria-current', 'true'));
    expect(screen.getByRole('complementary', { name: '산·코스 상세' })).toContainElement(screen.getByTestId('hiking-mountain'));
    // 데스크톱은 상단바 subBar 를 쓰지 않는다.
    expect(screen.getByTestId('layout-subbar')).toBeEmptyDOMElement();
    fireEvent.click(screen.getByRole('button', { name: '패널을 오른쪽으로' }));
    expect(usePanelPrefsStore.getState().sides['public.hiking']).toBe('right');
    expect(screen.getByRole('button', { name: '패널을 왼쪽으로' })).toBeInTheDocument();
  });
});

// ── 모바일(xl 미만) — 지도 배경 + 목록 시트 + 상세 시트 ────────────────────────────────────────────
// useIsDesktopXl 은 matchMedia 가 없으면 데스크톱으로 보므로, 모바일은 matchMedia 를 목으로 바꿔 렌더한다.
describe('HikingPage (모바일 시트)', () => {
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

  it('검색·권역은 상단바 subBar, 산 목록·푸터는 목록 시트 — 산을 고르면 상세 시트가 뜨고 subBar 는 내린다', async () => {
    renderPage();
    const subbar = screen.getByTestId('layout-subbar');
    expect(within(subbar).getByRole('searchbox', { name: '산 검색' })).toBeInTheDocument();
    expect(within(subbar).getByRole('button', { name: '제주' })).toBeInTheDocument();
    expect(document.querySelector('[data-sheet-handle]')).not.toBeNull();
    const sheet = screen.getByTestId('hiking-list-sheet');
    await waitFor(() => expect(within(sheet).getAllByRole('listitem')).toHaveLength(4));
    expect(within(sheet).getByTestId('hiking-footer')).toBeInTheDocument();
    expect(screen.queryByTestId('hiking-detail-sheet')).toBeNull();

    fireEvent.click(within(sheet).getByText('가리산'));
    const detail = await screen.findByTestId('hiking-detail-sheet');
    expect(await within(detail).findByTestId('hiking-mountain')).toHaveTextContent('강원도에서 진달래가 가장 많이 피는 산');
    expect(subbar).toBeEmptyDOMElement();

    // 같은 시트에서 코스 상세로 바뀌고, 뒤로 가면 산 상세.
    fireEvent.click(within(within(detail).getByTestId('hiking-courses')).getAllByRole('button')[1]!);
    expect(await within(detail).findByTestId('hiking-course')).toHaveTextContent('왕복 예상5시간');
    fireEvent.click(within(detail).getByRole('button', { name: /가리산 코스 목록/ }));
    expect(await within(detail).findByTestId('hiking-mountain')).toBeInTheDocument();
    // 산 목록으로 돌아가면 상세 시트가 닫히고 subBar 가 돌아온다.
    fireEvent.click(within(detail).getByRole('button', { name: /산 목록/ }));
    await waitFor(() => expect(screen.queryByTestId('hiking-detail-sheet')).toBeNull());
    expect(within(subbar).getByRole('searchbox', { name: '산 검색' })).toBeInTheDocument();
  });
});

describe('hikingFormat', () => {
  it('rankMountains — 높은순·가까운순', () => {
    expect(rankMountains(list.items, { q: '', group: null, sort: 'height', origin: null }).map((r) => r.mountain.name)).toEqual(['한라산', '가리산', '관악산', '인왕산']);
    const near = rankMountains(list.items, { q: '', group: null, sort: 'near', origin: { lat: 33.4, lng: 126.5 } });
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
