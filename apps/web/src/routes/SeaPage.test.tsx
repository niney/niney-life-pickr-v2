import { forwardRef, useImperativeHandle } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type { SeaForecastResultType, SeaSlotType, SeaSpotType, SeaTideResultType } from '@repo/api-contract';
import { todayKst } from '@repo/utils';
import { server } from '~/test/msw';
import { rankSeaSpots, seaSlotFor, seaSlotSummary } from '~/components/sea/seaFormat';
import { SeaPage } from './SeaPage';

// 바다 페이지 스모크 — 지도(OL)는 목. ① 해수욕 기본 탭: 지수 높은 순 목록·요약·범례 ② 행 클릭 → URL sel + 상세
// (선택 슬롯 라벨·이안류·물때) ③ 바다낚시 탭 전환 → activity=fishing 요청·어종 칩 ④ URL d·p 로 날짜·오후 슬롯.
// 그리고 seaFormat 순수 함수(슬롯 고르기·순위·요약).

vi.mock('~/components/restaurant/MapCanvas', () => ({
  MapCanvas: forwardRef(function MockMapCanvas(_props, ref) {
    useImperativeHandle(ref, () => ({ flyTo: () => {}, flyToZoomIn: () => {}, fitToMarkers: () => {}, fitToCoords: () => {} }));
    return <div data-testid="map-canvas" />;
  }),
}));

const TODAY = todayKst();
const addDays = (ymd: string, n: number): string => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const TOMORROW = addDays(TODAY, 1);
const D3 = addDays(TODAY, 3);

const slot = (over: Partial<SeaSlotType>): SeaSlotType => ({
  date: TODAY,
  period: 'am',
  variants: [],
  level: 3,
  label: '보통',
  waveM: null,
  wavePeriodS: null,
  waterTempC: null,
  airTempC: null,
  windMs: null,
  currentMs: null,
  tidePhase: null,
  weather: null,
  openStatus: null,
  timeFrom: null,
  timeTo: null,
  ...over,
});
const both = (date: string, am: Partial<SeaSlotType>, pm: Partial<SeaSlotType>): SeaSlotType[] => [
  slot({ date, period: 'am', ...am }),
  slot({ date, period: 'pm', ...pm }),
];

const daecheon: SeaSpotType = {
  id: '대천해수욕장',
  name: '대천해수욕장',
  lat: 36.30555,
  lng: 126.51601,
  slots: [
    ...both(TODAY, { level: 3, label: '보통', waveM: 0.5, waterTempC: 22.9, openStatus: '폐장' }, { level: 4, label: '좋음', waveM: 0.3 }),
    ...both(TOMORROW, { level: 2, label: '나쁨' }, { level: 1, label: '매우나쁨' }),
    // D+3 이후는 원문 '일'(하루 한 번) — period null.
    slot({ date: D3, period: null, level: 4, label: '좋음', waveM: 0.3 }),
  ],
  rip: { code: 'DAECHON', level: 1, label: '관심', observedAt: `${TODAY} 11:55`, waveM: 0.1 },
};
const haeundae: SeaSpotType = {
  id: '해운대해수욕장',
  name: '해운대해수욕장',
  lat: 35.1586,
  lng: 129.1603,
  slots: [...both(TODAY, { level: 5, label: '매우좋음', waveM: 0.2, waterTempC: 24.1, windMs: 2.5 }, { level: 2, label: '나쁨' }), ...both(TOMORROW, {}, {})],
  rip: null,
};
const beach: SeaForecastResultType = {
  activity: 'beach',
  dates: [TODAY, TOMORROW, D3],
  spots: [daecheon, haeundae],
  fetchedAt: `${TODAY}T03:00:00.000Z`,
  stale: false,
};
const fishing: SeaForecastResultType = {
  activity: 'fishing',
  dates: [TODAY],
  spots: [
    {
      id: '가거도',
      name: '가거도',
      lat: 34.07,
      lng: 125.08,
      slots: both(
        TODAY,
        {
          level: 5,
          label: '매우좋음',
          tidePhase: '중조기',
          variants: [
            { name: '감성돔', level: 3, label: '보통' },
            { name: '농어', level: 5, label: '매우좋음' },
          ],
        },
        { level: 4, label: '좋음', variants: [{ name: '감성돔', level: 4, label: '좋음' }] },
      ),
      rip: null,
    },
  ],
  fetchedAt: `${TODAY}T03:00:00.000Z`,
  stale: false,
};
const tide: SeaTideResultType = {
  station: { code: 'SO_1261', name: '무창포항', lat: 36.25, lng: 126.53, distM: 6372 },
  date: TODAY,
  extremes: [
    { time: '02:33', kind: 'high', levelCm: 636 },
    { time: '09:08', kind: 'low', levelCm: 131 },
  ],
  fetchedAt: `${TODAY}T03:00:00.000Z`,
  stale: false,
};

let requested: string[] = [];
beforeEach(() => {
  requested = [];
  server.use(
    http.get('/api/v1/settings/map/public', () => HttpResponse.json({ provider: 'vworld', apiKey: 'test-key' })),
    http.get('/api/v1/sea/forecast', ({ request }) => {
      const a = new URL(request.url).searchParams.get('activity') ?? '';
      requested.push(a);
      return HttpResponse.json(a === 'fishing' ? fishing : beach);
    }),
    http.get('/api/v1/sea/tide', () => HttpResponse.json(tide)),
  );
});

const LocationProbe = () => <div data-testid="location-search">{useLocation().search}</div>;
const renderPage = (url = '/sea?p=am') => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[url]}>
        <LocationProbe />
        <Routes>
          <Route path="/sea" element={<SeaPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};
const rows = (): string[] =>
  within(screen.getByTestId('sea-list'))
    .getAllByRole('listitem')
    .map((li) => li.textContent?.replace(/\s+/g, ' ').trim() ?? '');

describe('SeaPage', () => {
  it('해수욕 기본 — 오전 지수 높은 순 목록·요약·범례', async () => {
    renderPage();
    expect(screen.getByRole('tab', { name: '해수욕' })).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(rows()[0]).toContain('해운대해수욕장매우좋음');
    expect(rows()[0]).toContain('파고 0.2m · 수온 24.1℃ · 바람 2.5m/s');
    expect(rows()[1]).toContain('대천해수욕장보통');
    expect(rows()[1]).toContain('폐장');
    expect(screen.getByRole('button', { name: '오늘' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('sea-footer')).toHaveTextContent('국립해양조사원');
    expect(requested).toEqual(['beach']);
  });

  it('행 클릭 → URL sel + 상세(선택 슬롯·이안류·물때), 목록으로', async () => {
    renderPage();
    await waitFor(() => expect(rows()).toHaveLength(2));
    fireEvent.click(within(screen.getByTestId('sea-list')).getByText('대천해수욕장'));
    const detail = await screen.findByTestId('sea-detail');
    expect(screen.getByTestId('location-search')).toHaveTextContent('sel=%EB%8C%80%EC%B2%9C');
    expect(within(detail).getByTestId('sea-detail-slot')).toHaveTextContent('보통');
    expect(within(detail).getByTestId('sea-detail-rip')).toHaveTextContent('이안류관심11:55 관측');
    const tideEl = within(detail).getByTestId('sea-detail-tide');
    await waitFor(() => expect(tideEl).toHaveTextContent('무창포항 기준(6.4km)'));
    expect(tideEl).toHaveTextContent('만조02:33636cm');
    expect(tideEl).toHaveTextContent('간조09:08131cm');
    // 7일 띠 — 내일 오후 칸을 누르면 URL d·p 가 바뀌고 선택 슬롯이 매우나쁨.
    fireEvent.click(within(detail).getByRole('button', { name: new RegExp(`오후 매우나쁨`) }));
    await waitFor(() => expect(within(screen.getByTestId('sea-detail')).getByTestId('sea-detail-slot')).toHaveTextContent('매우나쁨'));
    expect(screen.getByTestId('location-search')).toHaveTextContent(`d=${TOMORROW}`);
    // 하루 예보(D+3)는 한 칸 — 누르면 선택 슬롯 제목이 '하루'.
    fireEvent.click(within(screen.getByTestId('sea-detail')).getByRole('button', { name: / 하루 좋음$/ }));
    await waitFor(() => expect(within(screen.getByTestId('sea-detail')).getByTestId('sea-detail-slot')).toHaveTextContent('하루좋음'));
    fireEvent.click(within(screen.getByTestId('sea-detail')).getByRole('button', { name: /목록/ }));
    expect(await screen.findByTestId('sea-list')).toBeInTheDocument();
  });

  it('바다낚시 탭 — activity=fishing 요청, 상세에 어종별 지수 칩', async () => {
    renderPage();
    await waitFor(() => expect(rows()).toHaveLength(2));
    fireEvent.click(screen.getByRole('tab', { name: '바다낚시' }));
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(requested).toContain('fishing');
    fireEvent.click(within(screen.getByTestId('sea-list')).getByText('가거도'));
    const chips = within(await screen.findByRole('list', { name: '어종별 지수' })).getAllByRole('listitem').map((li) => li.textContent?.replace(/\s+/g, ' ').trim());
    expect(chips).toEqual(['감성돔 보통', '농어 매우좋음']);
  });

  it('URL d·p — 오후 슬롯으로 순위가 바뀐다', async () => {
    renderPage(`/sea?d=${TODAY}&p=pm`);
    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(rows()[0]).toContain('대천해수욕장좋음');
    expect(screen.getByRole('button', { name: '오후' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('seaFormat', () => {
  it('슬롯 고르기 — 오전/오후 없는 활동은 그날 첫 슬롯', () => {
    expect(seaSlotFor(daecheon, 'beach', TODAY, 'pm')?.label).toBe('좋음');
    const mud: SeaSpotType = { ...daecheon, slots: [slot({ period: null, label: '좋음', level: 4 })] };
    expect(seaSlotFor(mud, 'mudflat', TODAY, 'pm')?.label).toBe('좋음');
    expect(seaSlotFor(daecheon, 'beach', '2000-01-01', 'am')).toBeNull();
  });
  it('순위 — 지수 → 거리 → 이름, 요약은 갯벌 체험 시각 먼저', () => {
    const r = rankSeaSpots([daecheon, haeundae], 'beach', TODAY, 'pm', { lat: 36.3, lng: 126.5 });
    expect(r.map((x) => x.spot.name)).toEqual(['대천해수욕장', '해운대해수욕장']);
    expect(r[0]!.distM).toBeLessThan(2000);
    expect(seaSlotSummary('mudflat', slot({ period: null, timeFrom: '09:00', timeTo: '11:40', airTempC: 24.5, weather: '맑음' }))).toBe(
      '체험 09:00~11:40 · 기온 24.5℃ · 맑음',
    );
  });
});
